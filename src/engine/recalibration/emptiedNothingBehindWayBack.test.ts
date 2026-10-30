import { describe, expect, it } from 'vitest';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationTrigger, SessionConstraints } from './types';
import { allEntries, CATCH_UP_TEMPLATE_IDS, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Twentieth review of round M, on the nineteenth pass's mark of a plan emptied read without its
 * layout (`emptiedLayout`, then read as the offer's own template, `CATCH_UP_TEMPLATE_IDS[kind]`):
 * the offer's own template is the layout of a catch-up, and of a second workout with muscles behind
 * where the place has a lift for them, but never of a second workout with nothing behind, which is
 * the split's own day without what was trained today. Read so, the way back from the full session
 * laid the split's day out with lifts, and the plan the lifter emptied came back whole.
 *
 * Fixed at the mark: each plan the lifter emptied is kept with its offer and its layout together
 * (`emptied`, a list of both), so no mark is read without its layout, and one that cannot be read is
 * dropped alone. The rule it serves, from the seventeenth pass: "the way back to the same offer finds
 * it empty again".
 *
 * Steps (synthetic data only): a morning bench press and overhead press; nothing is behind this
 * week, so the second workout is the lower day without the chest, the triceps and the front delts.
 * The lifter skips each of its seven lifts: "nothing more for today", the mark kept with the lower
 * day. Full session; Go easy instead: on 0fe4cb9, with the layout lost, "The second workout: no
 * changes needed", the front squat, the Romanian deadlift, the reverse lunge, the calf raise and the
 * dead bug.
 */

const profile = profileOf();
const NOW = at(9, 18);
const nothingBehind: CatchUpSpec = {
  kind: 'second',
  muscles: [],
  sitOut: ['chest', 'triceps', 'front-delts'],
};
const history = [
  session(at(3, 18), [['barbell-row', 3]]),
  session(at(9, 9), [
    ['barbell-bench-press', 3],
    ['overhead-press', 3],
  ]),
];
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

describe('a second workout with nothing behind, emptied by the lifter', () => {
  it('the way back from the full session finds it empty', () => {
    let workout = generateWorkout({
      profile,
      location: gym,
      history,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: nothingBehind },
    });
    // The split's own day, never the offer's own template.
    expect(workout.templateId).not.toBe(CATCH_UP_TEMPLATE_IDS.second);
    let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: nothingBehind };
    const steps: string[] = [lifts(workout)];
    const run = (trigger: RecalibrationTrigger) => {
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
        history,
        constraints,
        reason: 'test',
        timestamp: NOW,
      });
      if (!result.ok) throw new Error(`${trigger.type}: ${result.error}`);
      workout = result.workout;
      constraints = result.constraints;
      steps.push(`${trigger.type}: ${result.summary.headline} => ${lifts(workout)}`);
    };
    for (const entry of allEntries(workout.blocks)) run({ type: 'skip', entryId: entry.id });
    expect(allEntries(workout.blocks)).toEqual([]);
    // The mark keeps the split's own day, the layout the lifter emptied.
    expect(constraints.emptied).toEqual([{ offer: 'second', layout: workout.templateId }]);
    run({ type: 'session-kind', full: true, kind: 'second' });
    expect(allEntries(workout.blocks).length).toBeGreaterThan(0);
    run({ type: 'session-kind', full: false, kind: 'second' });
    // On 0fe4cb9: "front-squat x4 @RIR 2/2/2/2; romanian-deadlift x3 @RIR 1/1/1; ...".
    expect(lifts(workout), steps.join(' | ')).toBe('');
  });
});
