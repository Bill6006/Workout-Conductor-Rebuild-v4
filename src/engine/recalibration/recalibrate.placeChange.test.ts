import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { equipmentAvailable } from '../conflicts/conflictEngine';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { CompletedWork, RecalibrationRequest, RecalibrationSuccess } from './types';

const NOW = '2026-09-22T14:00:00.000Z';
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };

function gymWorkout(): GeneratedWorkout {
  return generateWorkout({ profile, location: gym, history: [], now: NOW, duration: 'default' });
}

function moveHome(workout: GeneratedWorkout, completed: CompletedWork): RecalibrationSuccess {
  const request: RecalibrationRequest = {
    trigger: { type: 'location' },
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: workout.duration.choice,
    profile: { ...profile, currentLocationId: home?.id ?? 'home' },
    location: home,
    history: [],
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: NOW,
  };
  const result = recalibrate(request);
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** Logs every set of the given entries, and the first `partial` sets of one more. */
function logged(
  done: readonly WorkoutEntry[],
  partial?: { entry: WorkoutEntry; sets: number },
): CompletedWork {
  const setsOf = (entry: WorkoutEntry, count = entry.sets.length) =>
    entry.sets.slice(0, count).map((set) => ({
      entryId: entry.id,
      exerciseId: entry.exerciseId,
      setIndex: set.index,
      kind: set.kind,
      reps: 8,
      weight: 135,
      rir: 2,
      completedAt: NOW,
    }));
  return {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 25 * 60,
    currentEntryId: partial?.entry.id ?? null,
    sets: [
      ...done.flatMap((entry) => setsOf(entry)),
      ...(partial ? setsOf(partial.entry, partial.sets) : []),
    ],
  };
}

const fitsHome = (entry: WorkoutEntry) =>
  equipmentAvailable(requireExercise(entry.exerciseId), new Set(home?.equipment ?? []));
const workingCount = (entry: WorkoutEntry) =>
  entry.sets.filter((set) => set.kind === 'working').length;

describe('changing place mid-workout', () => {
  it('fills the rest of the session from the new place; what was logged stays and blocks nothing', () => {
    const workout = gymWorkout();
    const [bench, incline, ...rest] = allEntries(workout.blocks);
    if (!bench || !incline) throw new Error('no session');
    // The gym's barbell lift is done: it does not fit Home, and it must not stop Home filling in.
    expect(fitsHome(bench)).toBe(false);
    const result = moveHome(workout, logged([bench, incline]));

    const after = allEntries(result.workout.blocks);
    expect(after.find((entry) => entry.id === bench.id)?.sets).toEqual(bench.sets);
    expect(after.find((entry) => entry.id === incline.id)?.sets).toEqual(incline.sets);
    const unfinished = after.filter((entry) => entry.id !== bench.id && entry.id !== incline.id);
    expect(unfinished).toHaveLength(rest.length);
    expect(unfinished.every(fitsHome)).toBe(true);
    expect(result.workout.compromises.filter((line) => /option fits/.test(line))).toEqual([]);
    // Every muscle the gym's rest of the session trained is still trained at Home.
    const muscles = (entries: readonly WorkoutEntry[]) =>
      new Set(entries.flatMap((entry) => requireExercise(entry.exerciseId).primaryMuscles));
    expect([...muscles(rest)].filter((muscle) => !muscles(unfinished).has(muscle))).toEqual([]);
  });

  it('ends an exercise Home cannot equip at its logged sets, and a Home move takes the sets it owed', () => {
    const workout = gymWorkout();
    const [bench] = allEntries(workout.blocks);
    if (!bench) throw new Error('no session');
    const warmups = bench.sets.filter((set) => set.kind === 'warmup').length;
    const owed = workingCount(bench) - 1;
    // The ramps and one working set of the bench press, then the move.
    const result = moveHome(workout, logged([], { entry: bench, sets: warmups + 1 }));

    const after = allEntries(result.workout.blocks);
    const closed = after.find((entry) => entry.id === bench.id);
    expect(closed?.exerciseId).toBe(bench.exerciseId);
    expect(closed?.sets).toEqual(bench.sets.slice(0, warmups + 1));
    const next = after[after.indexOf(closed as WorkoutEntry) + 1];
    expect(next?.id).not.toBe(bench.id);
    expect(next && fitsHome(next)).toBe(true);
    expect(requireExercise(next?.exerciseId ?? '').movementPattern).toBe(
      requireExercise(bench.exerciseId).movementPattern,
    );
    expect(next && workingCount(next)).toBe(owed);
    expect(result.summary.headline).toMatch(/^Rebuilt for Home/);
    // Ids stay unique, so every logged set still finds its exercise.
    expect(new Set(after.map((entry) => entry.id)).size).toBe(after.length);
  });

  it('leaves logged work that still fits the new place as it was', () => {
    const workout = gymWorkout();
    const entries = allEntries(workout.blocks);
    const incline = entries[1];
    if (!incline) throw new Error('no session');
    expect(fitsHome(incline)).toBe(true);
    const result = moveHome(workout, logged([], { entry: incline, sets: 2 }));
    expect(allEntries(result.workout.blocks).find((entry) => entry.id === incline.id)).toEqual(
      incline,
    );
  });
});
