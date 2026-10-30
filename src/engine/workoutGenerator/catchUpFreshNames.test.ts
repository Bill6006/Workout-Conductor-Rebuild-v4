import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../../engine/recalibration/types';
import {
  allEntries,
  isStopped,
  type GeneratedWorkout,
  type WorkoutEntry,
} from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31 (the twelfth review of round M): a spare name the generator gives a lift stopped at a new place
 * is never a name the plan before gave a lift it plans again. Before: the bench press's stand-in, in
 * the first slot, took the next spare name past the names kept, which was the leg press's (the
 * stand-in "Uncomfortable" made for the back squat, in the second slot), and the leg press, planned
 * again in its slot, took another. Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const named = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks)
    .map((entry) => `${entry.id}:${entry.exerciseId}${isStopped(entry) ? ' (stopped)' : ''}`)
    .join(', ');
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['chest', 'quads', 'glutes'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};
const succeeded = (result: RecalibrationResult): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
/** A home with a leg press and nothing else: no bench press, the push-up for the chest. */
const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['leg-press'] },
  at(1),
) as [LocationProfile];
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  options: Partial<RecalibrationRequest> = {},
): RecalibrationRequest => ({
  trigger,
  workout,
  completed: emptyCompleted(),
  lockedEntryIds: [],
  currentEntryId: null,
  duration: 'default',
  profile: profileOf(),
  location: gym,
  loading: { missingPlates: [] },
  history: records,
  constraints: { ...emptyConstraints(), catchUp: spec },
  reason: 'test',
  timestamp: NOW,
  ...options,
});
const setOf = (entry: WorkoutEntry, minute: number) => {
  const set = working(entry)[0]!;
  return {
    entryId: entry.id,
    exerciseId: entry.exerciseId,
    setIndex: set.index,
    kind: 'working' as const,
    reps: 8,
    weight: set.targetWeight,
    rir: 2,
    completedAt: at(9, 18, minute),
  };
};

describe('a fresh spare name is never one the plan before gave a lift, the twelfth review of round M', () => {
  it('the squat swapped for comfort, the bench press begun, then home: the leg press keeps its name', () => {
    // At the gym the catch-up's bench press (the chest's slot) and back squat (the quads' and the
    // glutes' slot).
    const atGym = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const [bench, squat] = allEntries(atGym.blocks);
    expect([bench?.exerciseId, squat?.exerciseId], lifts(atGym)).toEqual([
      'barbell-bench-press',
      'back-squat',
    ]);
    // A set of the back squat, then "Uncomfortable": the leg press carries its sets, under a spare
    // name.
    const squatSet: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 300,
      sets: [setOf(squat!, 0)],
    };
    const comfort = succeeded(
      recalibrate(
        request({ type: 'uncomfortable', entryId: squat!.id }, atGym, { completed: squatSet }),
      ),
    );
    const pressBefore = allEntries(comfort.workout.blocks).find(
      (entry) => !isStopped(entry) && entry.exerciseId === 'leg-press',
    );
    expect(pressBefore?.slot, named(comfort.workout)).toBe(squat!.slot);
    // A set of the bench press, then home, where the bench press cannot go on and the leg press can.
    const completed: CompletedWork = {
      ...squatSet,
      elapsedSeconds: 600,
      sets: [...squatSet.sets, setOf(bench!, 5)],
    };
    const moved = succeeded(
      recalibrate(
        request({ type: 'location' }, comfort.workout, {
          completed,
          location: home,
          constraints: comfort.constraints,
        }),
      ),
    );
    const details = `${moved.summary.headline} ${moved.changes.map((change) => change.detail).join(' | ')} (${named(comfort.workout)} -> ${named(moved.workout)})`;
    const pressAfter = allEntries(moved.workout.blocks).find(
      (entry) => !isStopped(entry) && entry.exerciseId === 'leg-press',
    );
    // The same lift in the same slot...
    expect(pressAfter?.slot, details).toBe(squat!.slot);
    // ... keeps its name. Before: the push-up took it, and "Rebuilt for Home: 1 exercise added, 1
    // exercise replaced, 2 sets trimmed." ("Barbell Bench Press: 2 sets fewer. | Replaced Leg Press
    // with Push-Up. | Added Leg Press.").
    expect(pressAfter?.id, details).toBe(pressBefore!.id);
    expect(
      moved.changes
        .filter((change) => change.kind === 'added' || change.kind === 'removed')
        .map((change) => change.detail),
      details,
    ).toEqual([]);
    expect(
      moved.changes.find((change) => change.kind === 'replaced' && change.exerciseId === 'push-up'),
      details,
    ).toMatchObject({ previousExerciseId: 'barbell-bench-press' });
  });
});
