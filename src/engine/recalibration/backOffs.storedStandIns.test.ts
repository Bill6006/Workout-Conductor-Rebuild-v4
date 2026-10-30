import { describe, expect, it } from 'vitest';
import type { GeneratedWorkout, WorkoutEntry } from '../workout/types';
import { BENCH, bench, loggedOne, plan, run, topDone } from '../../test/backOffs';

/**
 * The fifteenth pass of round N. A session stored by an earlier build can hold back-offs fitted as
 * stand-ins for their own load (`asked`: before the thirteenth pass, "back-offs fitted as stand-ins
 * themselves for the top set's load came back at it"). A refit gives them their own reps back
 * (`refitBackOffs`): with the top set still to come, the top set's own, as the plan gives them; after
 * it, their own as planned. Synthetic data only.
 */

/** The bench press's back-offs as an earlier build stored them: 5 lb under, standing in, 5-7. */
function storedAsStandIns(workout: GeneratedWorkout): GeneratedWorkout {
  const copy: GeneratedWorkout = structuredClone(workout);
  const entry = bench(copy);
  entry.sets = entry.sets.map((set) =>
    set.tier === 'back-off'
      ? {
          ...set,
          targetWeight: (set.targetWeight as number) - 5,
          targetReps: [5, 7],
          asked: { weight: set.targetWeight as number, reps: [4, 6] },
        }
      : set,
  );
  return copy;
}

const backOffReps = (entry: WorkoutEntry) =>
  entry.sets.filter((set) => set.tier === 'back-off').map((set) => set.targetReps);

describe('back-offs a session stored as stand-ins, fitted again', () => {
  it('take the top set’s own reps while it is still to come', () => {
    const workout = storedAsStandIns(plan());
    const entry = bench(workout);
    expect(entry.exerciseId).toBe(BENCH);
    const ramp = entry.sets.find((set) => set.kind === 'warmup')!;
    const moved = run({ type: 'loading' }, workout, {
      completed: loggedOne(entry, ramp.index, ramp.targetWeight, 'warmup'),
    });
    expect(backOffReps(bench(moved.workout))).toEqual([
      [4, 6],
      [4, 6],
      [4, 6],
    ]);
  });

  it('take their own reps as planned after it', () => {
    const workout = storedAsStandIns(plan());
    const moved = run({ type: 'loading' }, workout, {
      completed: topDone(bench(workout), 190),
    });
    expect(backOffReps(bench(moved.workout))).toEqual([
      [4, 6],
      [4, 6],
      [4, 6],
    ]);
  });
});
