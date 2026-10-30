import { describe, expect, it } from 'vitest';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationResult, RecalibrationTrigger, SessionConstraints } from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Eighteenth review of round M, on the seventeenth pass's `keepSwappedAway`. The report: "A lift
 * leaving the plan by the lifter's hand ... takes the lift it stood in for with it, unless the lifter
 * put that lift back in the plan, on any day"; its test: "but one the lifter put back in the plan
 * elsewhere stays". The lift is taken away by putting it on the day's avoid list, which every rule
 * reads as a lift the lifter set aside, the swap sheet and a swap included (`contextFor`: avoided
 * lifts are "treated like dislikes"). So the lifter may put the lift back only before its stand-in
 * leaves: after, the swap sheet no longer offers it, and a swap to it is refused with a reason that
 * is not true ("Barbell Bench Press is on your disliked list."). The lifter never set it aside, and
 * before the seventeenth pass the swap went through.
 *
 * Steps (synthetic data only): a push day the schedule ticks, at the gym. The lifter swaps the bench
 * press for the dumbbell bench press, skips the dumbbell bench press, then swaps the cable fly for
 * the bench press: "Barbell Bench Press is on your disliked list."
 *
 * Passes on 532aba6.
 */

const NOW = at(8, 18);
const profile = profileOf();
const records = [session(at(3, 18), [['barbell-row', 3]])];

describe('a lift taken away with its stand-in can still be put back by the lifter', () => {
  it('the bench press swapped for the dumbbell bench press, that skipped, then the cable fly swapped for the bench press', () => {
    let workout: GeneratedWorkout = generateWorkout({
      profile,
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    let constraints: SessionConstraints = emptyConstraints();
    const steps: string[] = [describeWorkout(workout).join('; ')];
    const find = (id: string) =>
      allEntries(workout.blocks).find((entry) => entry.exerciseId === id)!;
    const run = (trigger: RecalibrationTrigger): RecalibrationResult => {
      const result = recalibrate({
        trigger,
        workout,
        completed: emptyCompleted(),
        lockedEntryIds: [],
        currentEntryId: null,
        duration: 'default',
        profile,
        location: gym,
        loading: { missingPlates: [] },
        history: records,
        constraints,
        reason: 'test',
        timestamp: NOW,
      });
      if (result.ok) {
        workout = result.workout;
        constraints = result.constraints;
        steps.push(`${trigger.type}: ${result.summary.headline}`);
      } else steps.push(`${trigger.type}: refused, ${result.error}`);
      return result;
    };
    run({
      type: 'replace',
      entryId: find('barbell-bench-press').id,
      exerciseId: 'dumbbell-bench-press',
    });
    run({ type: 'skip', entryId: find('dumbbell-bench-press').id });
    const back = run({
      type: 'replace',
      entryId: find('cable-fly').id,
      exerciseId: 'barbell-bench-press',
    });
    // On 4cb40d7: refused, "Barbell Bench Press is on your disliked list."
    expect(back.ok, steps.join(' | ')).toBe(true);
    expect(find('barbell-bench-press'), steps.join(' | ')).toBeDefined();
  });
});
