import { describe, expect, it } from 'vitest';
import { planUnderTheEase } from './recalibrate';
import type { CompletedWork } from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { BENCH, DB_BENCH, bench, plan, profileOf, run, shape, topDone } from '../../test/backOffs';

/**
 * The third adversarial review of Maintenance 33: a workout saved after "Lighter", a swap and a swap
 * back keeps the bench press with its top set alone, and the day's "Lighter today" in its lines.
 *
 * Steps: a hybrid lifter's push day: the bench press's top set (190 lb for 4-6 at 1 in reserve) and
 * three back-offs (180 lb for 4-6 at 2). They log the top set, tap "Lighter for the chest" (the
 * back-offs still to come become two at 180 lb for 3-5 at 3), swap the bench for the dumbbell bench
 * press while the bench is taken, swap back when it is free, and save the workout to reuse
 * ("Save this workout", `saveCurrentWorkout`, which keeps `planUnderTheEase(session.workout)`).
 * The control: the same steps without "Lighter".
 *
 * The rule: the lighter option's ease is today's, and a saved copy gives it back ("Its record is
 * kept for good: the workout never gives it back, a saved copy does", recalibrate.ts,
 * `lightenUnderWay`); `planUnderTheEase`: "every lift a hard start eased has back what it had, under
 * way or not ... A saved workout is a plan for another day, and the ease was today's." Without
 * "Lighter" the same steps save the bench with its top set and its three back-offs.
 *
 * What happens: the second review's fix to `swapBack` records the lift as it stands before what it
 * owes is put back (`recordOf(stopped, ...)` before `stopped.sets = [...stopped.sets, ...owes]`),
 * over the record `lightenUnderWay` kept of the whole plan. The saved copy gives that record back:
 * the bench press with one working set, its top set, and the line "Lighter today for the chest: a
 * set fewer and a rep more in reserve." first among its reasons, on a plan for another day. Before
 * the second review's fix (80893d4) the swapped-back bench kept no record, and the copy kept its
 * sets (at the plan's reserve, the second review's own finding).
 *
 * Synthetic data only.
 */

const profile = profileOf('hybrid');

const live = (workout: GeneratedWorkout, exerciseId: string): WorkoutEntry =>
  allEntries(workout.blocks).find(
    (entry) => entry.exerciseId === exerciseId && entry.stopped === undefined,
  )!;

/** The day's steps, with or without "Lighter", then the saved copy's bench press. */
function savedBench(lighter: boolean): WorkoutEntry {
  const workout = plan(undefined, profile);
  const completed: CompletedWork = topDone(bench(workout), 190);
  const eased = lighter
    ? run({ type: 'lighter', muscle: 'chest' }, workout, { completed, profile })
    : null;
  const before = eased?.workout ?? workout;
  const swapped = run(
    { type: 'replace', entryId: live(before, BENCH).id, exerciseId: DB_BENCH },
    before,
    { completed, profile, ...(eased ? { constraints: eased.constraints } : {}) },
  );
  const back = run(
    { type: 'replace', entryId: live(swapped.workout, DB_BENCH).id, exerciseId: BENCH },
    swapped.workout,
    { completed, profile, constraints: swapped.constraints },
  );
  return live(planUnderTheEase(back.workout), BENCH);
}

describe('a workout saved after "Lighter" and a swap back', () => {
  it('keeps the bench press as the plan has it, as the same steps without "Lighter" do', () => {
    const control = savedBench(false);
    expect(shape(control)).toEqual([
      [190, 1, 'top'],
      [180, 2, 'back-off'],
      [180, 2, 'back-off'],
      [180, 2, 'back-off'],
    ]);
    const saved = savedBench(true);
    expect(shape(saved)).toEqual(shape(control));
    expect(saved.progression?.evidence.join(' ') ?? '').not.toMatch(/Lighter today/);
  });
});
