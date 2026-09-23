import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { SessionLoading } from '../loading/loading';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { CompletedWork, RecalibrationSuccess } from './types';

const NOW = '2026-09-22T14:00:00.000Z';
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };

/** The owner's case: a bar lift asking 100 for 8-10, its ramps and first working set logged. */
function startedAtHundred(): {
  workout: GeneratedWorkout;
  completed: CompletedWork;
  lift: WorkoutEntry;
} {
  const workout = generateWorkout({
    profile,
    location: gym,
    history: [],
    now: NOW,
    duration: 'default',
  });
  const lift = allEntries(workout.blocks)[0];
  if (!lift) throw new Error('no session');
  lift.sets = lift.sets.map((set) =>
    set.kind === 'working' ? { ...set, targetWeight: 100, targetReps: [8, 10] } : set,
  );
  const firstWorking = lift.sets.findIndex((set) => set.kind === 'working');
  const completed: CompletedWork = {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 10 * 60,
    currentEntryId: lift.id,
    sets: lift.sets.slice(0, firstWorking + 1).map((set) => ({
      entryId: lift.id,
      exerciseId: lift.exerciseId,
      setIndex: set.index,
      kind: set.kind,
      reps: 9,
      weight: set.targetWeight,
      rir: 2,
      completedAt: NOW,
    })),
  };
  return { workout, completed, lift };
}

function plates(
  workout: GeneratedWorkout,
  completed: CompletedWork,
  loading: SessionLoading,
): RecalibrationSuccess {
  const result = recalibrate({
    trigger: { type: 'loading' },
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: workout.duration.choice,
    profile,
    location: gym,
    history: [],
    constraints: emptyConstraints(),
    loading,
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

const find = (workout: GeneratedWorkout, id: string) => {
  const found = allEntries(workout.blocks).find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe('a plate missing in the middle of an exercise', () => {
  it('moves the sets still to come onto what the plates make, and never a logged one', () => {
    const { workout, completed, lift } = startedAtHundred();
    const logged = new Set(completed.sets.map((set) => set.setIndex));
    const result = plates(workout, completed, { missingPlates: [2.5] });
    const after = find(result.workout, lift.id);

    for (const set of after.sets) {
      const before = lift.sets.find((candidate) => candidate.index === set.index);
      if (logged.has(set.index)) {
        expect(set).toEqual(before);
      } else if (set.kind === 'working') {
        expect(set.targetWeight).toBe(95);
        expect(set.targetReps).toEqual([10, 12]);
      }
    }
    expect(after.progression?.rack?.line).toBe('No 2.5s today: 95 instead of 100, two extra reps.');
    expect(after.progression?.evidence).toContain(
      'No 2.5s today: 95 instead of 100, two extra reps.',
    );
    expect(result.summary.headline).toMatch(/Loads matched/);
  });

  it('goes back to what was asked once the plate is back', () => {
    const { workout, completed, lift } = startedAtHundred();
    const without = plates(workout, completed, { missingPlates: [2.5] }).workout;
    const back = find(plates(without, completed, { missingPlates: [] }).workout, lift.id);
    const remaining = back.sets.filter(
      (set) =>
        set.kind === 'working' && !completed.sets.some((done) => done.setIndex === set.index),
    );
    expect(remaining.length).toBeGreaterThan(0);
    for (const set of remaining) {
      expect(set.targetWeight).toBe(100);
      expect(set.targetReps).toEqual([8, 10]);
    }
    expect(back.progression?.rack).toBeUndefined();
    expect(back.progression?.evidence.some((line) => line.startsWith('No 2.5s'))).toBe(false);
  });
});
