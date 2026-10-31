import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../core/state/session';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { dayNoteOf } from '../../features/today/dayNote';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationSuccess, RecalibrationTrigger, SessionConstraints } from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { builtCatchUp, generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Eighteenth review of round M, on the seventeenth pass's way back (`constraints.emptied`). The
 * report: "the full session taken from a catch-up or second workout the lifter emptied remembers the
 * offer (`emptied`), and the way back to the same offer finds it empty again"; the field's doc: "The
 * offer whose catch-up or second workout the lifter's changes had emptied when the full session was
 * taken". The mark is set on any plan off the plan with no lift when Full session is tapped
 * (`allEntries(...).length === 0 && offPlanSpec(...) !== null`), and a second workout is off the plan
 * whether or not it was built from what is behind. So a second workout with nothing to start for want
 * of a lift where the lifter is ("You trained today: nothing more for today."), which the lifter never
 * emptied, is marked too: the way back from the full session then finds it empty at a place that can
 * build it, where the same move without the full session builds it (the store reads a plan made where
 * the day's offer had no lift as one to build whole at a new place, `offerOverrides`' `unbuilt`, the
 * fifth review: "the new place may have one").
 *
 * Steps (synthetic data only): a full-body workout this morning (squat, bench press, row, pulldown,
 * curl, calf raise, dead bug), the side delts missed this week. At a home with no equipment the
 * second workout has no lift for them, and the push-up works the chest trained this morning: "You
 * trained today: nothing more for today." The lifter taps Full session (the push-up), sets the place
 * to the gym, and taps Go easy instead: nothing more for today, though at the gym the second workout
 * leads with the lateral raise, as it does when the lifter moves there without the full session.
 *
 * Passes on 532aba6 (no mark: the way back lays the second workout out at the gym).
 */

const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const NOW = at(9, 18);
const profile = profileOf();
const records = [
  session(at(3, 18), [['barbell-row', 3]]),
  session(at(9, 9), [
    ['back-squat', 3],
    ['barbell-bench-press', 3],
    ['barbell-row', 3],
    ['lat-pulldown', 3],
    ['barbell-curl', 3],
    ['standing-calf-raise', 3],
    ['dead-bug', 3],
  ]),
];
const spec: CatchUpSpec = {
  kind: 'second',
  muscles: [{ muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: ['quads', 'glutes', 'chest', 'triceps', 'upper-back', 'lats', 'biceps', 'calves', 'abs'],
};
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

function day() {
  let location: LocationProfile = bare;
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  const steps: string[] = [lifts(workout)];
  return {
    get workout() {
      return workout;
    },
    steps,
    note: () =>
      dayNoteOf({ status: 'preview', constraints, workout } as unknown as WorkoutSession, true),
    run(trigger: RecalibrationTrigger, at_?: LocationProfile): RecalibrationSuccess {
      if (at_) location = at_;
      // As the store reads a change of place (`offerOverrides`): a plan made where the day's offer
      // had no lift is built whole at the new place, unless the full session is on.
      const unbuilt =
        trigger.type === 'location' &&
        !constraints.fullSession &&
        builtCatchUp(spec, workout).muscles.length === 0;
      const result = recalibrate({
        trigger,
        workout,
        completed: emptyCompleted(),
        lockedEntryIds: [],
        currentEntryId: null,
        duration: 'default',
        profile,
        location,
        ...(unbuilt ? { offerChanged: true } : {}),
        loading: { missingPlates: [] },
        history: records,
        constraints,
        reason: 'test',
        timestamp: NOW,
      });
      if (!result.ok) throw new Error(result.error);
      workout = result.workout;
      constraints = result.constraints;
      steps.push(`${trigger.type}: ${result.summary.headline} => ${lifts(workout)}`);
      return result;
    },
  };
}

describe('the way back to a second workout the lifter never emptied', () => {
  it('without the full session, the move to the gym builds it there', () => {
    const today = day();
    expect(allEntries(today.workout.blocks)).toEqual([]);
    expect(today.note()?.text).toBe('You trained today: nothing more for today.');
    today.run({ type: 'location' }, gym!);
    expect(lifts(today.workout), today.steps.join(' | ')).toBe('lateral-raise x3 @RIR 1/1/1');
  });

  it('Full session at the bare home, the gym, then Go easy instead: it is built there too', () => {
    const today = day();
    expect(today.note()).not.toHaveProperty('action');
    today.run({ type: 'session-kind', full: true, kind: 'second' });
    today.run({ type: 'location' }, gym!);
    expect(today.note()).not.toHaveProperty('action');
    today.run({ type: 'session-kind', full: false, kind: 'second' });
    // On 4cb40d7: nothing, "You trained today: nothing more for today.", the lateral raise the gym
    // builds for the side delts set aside as if the lifter had emptied the plan.
    expect(lifts(today.workout), today.steps.join(' | ')).toBe('lateral-raise x3 @RIR 1/1/1');
    expect(today.note()?.text, today.steps.join(' | ')).toBe(
      'You trained today: this one leads with what you missed and goes easy on the rest.',
    );
  });
});
