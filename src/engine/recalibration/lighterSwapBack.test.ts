import { describe, expect, it } from 'vitest';
import type { CompletedWork } from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { BENCH, DB_BENCH, bench, plan, profileOf, run, topDone } from '../../test/backOffs';

/**
 * The second adversarial review of Maintenance 33: "Lighter" on a lift under way is lost when the
 * lifter swaps the lift and then swaps back to it.
 *
 * Steps: a hybrid lifter's push day: the bench press's top set (190 lb for 4-6 at 1 in reserve) and
 * three back-offs (180 lb for 4-6 at 2). They log the top set, then tap "Lighter for the chest": the
 * back-offs still to come become two at 180 lb for 3-5 at 3 in reserve. The bench is taken, so they
 * swap to the dumbbell bench press (what stands in carries the eased sets: two at 3 in reserve), and
 * when the bench is free they swap back to it.
 *
 * The rule: the lighter option takes a lift under way "on its sets still to come, for good: the
 * workout never gives it back" (recalibrate.ts, `lightenUnderWay`); the first review's fix for a swap
 * ("Eased under way by the lighter option alone, what comes in is eased as it eases, its loads kept
 * and in its words", `applySubstitution`); the card: "a set fewer and a rep more in reserve on its
 * lifts today". The muscle stays in `constraints.lighter`, so the card does not come back.
 *
 * What happens: `swapBack` builds the sets the bench owes afresh at the plan's reserve
 * (`dayShiftOf` reads only the day's own settings, and the lighter option is a layer, as the hard
 * start's ease is), and the layer never eases a block begun: the bench's back-offs come back as two
 * at 180 lb for 4-6 at 2 in reserve, the plan's, with "Lighter" still in force for the chest.
 *
 * Synthetic data only.
 */

const backOffs = (entry: WorkoutEntry) =>
  entry.sets
    .filter((set) => set.tier === 'back-off')
    .map((set) => [set.targetWeight, set.targetReps, set.targetRir]);

const live = (workout: GeneratedWorkout, exerciseId: string) =>
  allEntries(workout.blocks).find(
    (entry) => entry.exerciseId === exerciseId && entry.stopped === undefined,
  )!;

describe('"Lighter" on a lift under way, swapped and swapped back', () => {
  it('keeps the lighter sets still to come', () => {
    const profile = profileOf('hybrid');
    const workout = plan(undefined, profile);
    const completed: CompletedWork = topDone(bench(workout), 190);

    const lighter = run({ type: 'lighter', muscle: 'chest' }, workout, { completed, profile });
    const eased = backOffs(live(lighter.workout, BENCH));
    expect(eased).toEqual([
      [180, [3, 5], 3],
      [180, [3, 5], 3],
    ]);

    const swapped = run(
      { type: 'replace', entryId: live(lighter.workout, BENCH).id, exerciseId: DB_BENCH },
      lighter.workout,
      { completed, profile, constraints: lighter.constraints },
    );
    // What stands in carries the lighter sets.
    expect(
      live(swapped.workout, DB_BENCH)
        .sets.filter((set) => set.kind === 'working')
        .map((set) => set.targetRir),
    ).toEqual([3, 3]);

    const back = run(
      { type: 'replace', entryId: live(swapped.workout, DB_BENCH).id, exerciseId: BENCH },
      swapped.workout,
      { completed, profile, constraints: swapped.constraints },
    );
    expect(back.constraints.lighter).toEqual(['chest']);
    expect(backOffs(live(back.workout, BENCH))).toEqual(eased);
  });
});
