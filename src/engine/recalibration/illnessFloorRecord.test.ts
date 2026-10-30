import { describe, expect, it } from 'vitest';
import { emptyCompleted } from './recalibrate';
import type { CompletedWork, Readiness } from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { plan, profileOf, run } from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * Maintenance 33, the third review: the day's floor (an illness) lies over the plan as a layer, each
 * set it holds keeping what it was (`floored`), every change made to the plan under it and the floor
 * laid again after. Here, what that layer gives back and keeps beyond the review's own test: a drop
 * set it took comes back when the illness is taken back, and a set logged under it keeps its record
 * through a later change, for the hard start's reading of what the plan asked of it.
 *
 * Steps: a hybrid lifter's push day, the EZ-bar curl's first working set logged (the lift under way;
 * its plan ends with a drop set). "Head cold" told, then "Unwell: No". Or "Head cold" told with the
 * bench press's ramps logged, its top set then logged, and a change made. Synthetic data only.
 */

const profile = profileOf('hybrid');

const checkIn = (illness?: NonNullable<Readiness['illness']>): Readiness => ({
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  ...(illness ? { illness } : {}),
});

const named = (workout: GeneratedWorkout, exerciseId: string): WorkoutEntry =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId)!;

/** These sets of a lift logged as asked. */
function logged(entry: WorkoutEntry, indexes: readonly number[]): CompletedWork {
  return {
    ...emptyCompleted(),
    startedAt: RECORD_NOW,
    currentEntryId: entry.id,
    sets: entry.sets
      .filter((set) => indexes.includes(set.index))
      .map((set) => ({
        entryId: entry.id,
        exerciseId: entry.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: set.targetReps[0],
        weight: set.targetWeight,
        rir: set.kind === 'warmup' ? 5 : set.targetRir,
        completedAt: RECORD_NOW,
      })),
  };
}

describe('the day’s floor as a layer over the plan', () => {
  it('gives back the drop set it took once the illness is taken back', () => {
    const workout = plan(undefined, profile);
    const curl = named(workout, 'ez-bar-curl');
    expect(curl.sets.some((set) => set.kind === 'drop')).toBe(true);
    const first = curl.sets.find((set) => set.kind === 'working')!;
    const completed = logged(curl, [first.index]);
    const ill = run({ type: 'readiness', readiness: checkIn('head') }, workout, {
      completed,
      profile,
    });
    // A head cold: no drop set still to come.
    expect(named(ill.workout, 'ez-bar-curl').sets.some((set) => set.kind === 'drop')).toBe(false);
    const well = run({ type: 'readiness', readiness: checkIn() }, ill.workout, {
      completed,
      profile,
      constraints: ill.constraints,
    });
    expect(named(well.workout, 'ez-bar-curl').sets.map((set) => set.kind)).toEqual(
      curl.sets.map((set) => set.kind),
    );
    expect(named(well.workout, 'ez-bar-curl').dropSet).toBe(true);
  });

  it('keeps the record of a set logged under it through a later change', () => {
    const workout = plan(undefined, profile);
    const bench = named(workout, 'barbell-bench-press');
    const ramps = bench.sets.filter((set) => set.kind === 'warmup').map((set) => set.index);
    const ill = run({ type: 'readiness', readiness: checkIn('head') }, workout, {
      completed: logged(bench, ramps),
      profile,
    });
    const held = named(ill.workout, 'barbell-bench-press');
    const top = held.sets.find((set) => set.tier === 'top')!;
    // Held at the floor, a rep fewer at its load, with what it was kept.
    expect(held.floored?.some((set) => set.index === top.index)).toBe(true);
    // The top set logged under the floor, then a change: its record stays with it.
    const completed = logged(held, [...ramps, top.index]);
    const after = run({ type: 'intensity', direction: 'easier' }, ill.workout, {
      completed,
      profile,
      constraints: ill.constraints,
    });
    const record = named(after.workout, 'barbell-bench-press').floored?.find(
      (set) => set.index === top.index,
    );
    expect(record?.targetReps).toEqual(bench.sets.find((set) => set.tier === 'top')!.targetReps);
  });
});
