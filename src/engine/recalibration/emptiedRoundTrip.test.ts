import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationSuccess, RecalibrationTrigger, SessionConstraints } from './types';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, CATCH_UP_TEMPLATE_IDS, type GeneratedWorkout } from '../workout/types';
import { builtCatchUp, generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Nineteenth review of round M, on the eighteenth pass's mark (`emptied`) and the fifth pass's plan
 * built whole at a new place (`offerOverrides`' `unbuilt`). The report: "a catch-up or a second
 * workout emptied stays so through every rebuild" (the fourteenth to sixteenth passes); "a plan is
 * marked emptied only when the lifter's own hand takes out its last lift ...; a place with no lift
 * for what was left marks nothing, so another place builds it ... Every rebuild, the way back from
 * the full session and a later plan the same day read the mark" (the eighteenth).
 *
 * A catch-up or second workout the lifter emptied at the gym stays empty through a trip to a place
 * with no lift for it and back. Taken through the full session at that place, it does not: the way
 * back there finds no lift for the offer, so the plan is the split's own session (a catch-up: lifts
 * in the plan, which end the mark) or the split's session found empty (a second workout), and either
 * way the store reads it as a plan made where the day's offer had no lift, so back at the gym it is
 * built whole, with a lift the lifter's skip had not reached.
 *
 * Steps (synthetic data only), the store's reading of a change of place mirrored as the earlier
 * passes' tests do:
 * - A catch-up for the biceps at the gym is the EZ-bar curl. The lifter skips it: "nothing more for
 *   today". Full session; the place set to Travel (no equipment); Catch-up instead: the push day's
 *   push-up there, nothing behind that can be caught up. Back at the gym: "Rebuilt for Gym: 1
 *   exercise replaced", a catch-up of the dumbbell curl.
 * - A second workout for the side delts at the gym is the lateral raise. The lifter skips it. Full
 *   session; Travel; Go easy instead: nothing more for today. Back at the gym: "Rebuilt for Gym: 1
 *   exercise added", the cable lateral raise.
 * Without the full session, both stay empty at the gym.
 *
 * Also fails on 4cb40d7.
 */

const profile = profileOf();
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const [noEquipment] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const travel: LocationProfile = { ...noEquipment, id: 'travel', name: 'Travel' };

function day(spec: CatchUpSpec, history: WorkoutRecord[]) {
  let location = gym as LocationProfile;
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location,
    history,
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
    run(trigger: RecalibrationTrigger, to?: LocationProfile): RecalibrationSuccess {
      if (to) location = to;
      // As the store reads a change of place (`offerOverrides`): a plan made where the day's offer
      // had no lift is built whole at the new place, unless the full session is on.
      const unbuilt =
        trigger.type === 'location' &&
        !constraints.fullSession &&
        spec.muscles.length > 0 &&
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
        history,
        constraints,
        reason: 'test',
        timestamp: NOW,
      });
      if (!result.ok) throw new Error(`${trigger.type}: ${result.error}`);
      workout = result.workout;
      constraints = result.constraints;
      steps.push(
        `${trigger.type}@${location.name}: ${result.summary.headline} => ${lifts(workout)}`,
      );
      return result;
    },
  };
}

const catchUp: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [{ muscle: 'biceps', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: [],
};
const catchUpHistory = [session(at(3, 18), [['barbell-row', 3]])];
const second: CatchUpSpec = {
  kind: 'second',
  muscles: [{ muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: ['chest', 'triceps', 'upper-back', 'lats', 'biceps'],
};
const secondHistory = [
  session(at(3, 18), [['barbell-row', 3]]),
  session(at(9, 9), [
    ['barbell-bench-press', 3],
    ['barbell-row', 3],
    ['lat-pulldown', 3],
    ['barbell-curl', 3],
  ]),
];

function emptied(spec: CatchUpSpec, history: WorkoutRecord[], lift: string) {
  const today = day(spec, history);
  expect(lifts(today.workout)).toBe(`${lift} x3 @RIR 1/1/1`);
  today.run({ type: 'skip', entryId: allEntries(today.workout.blocks)[0]!.id });
  expect(allEntries(today.workout.blocks)).toEqual([]);
  return today;
}

describe('a plan the lifter emptied at the gym, through the full session at a place with no lift for it', () => {
  it('without the full session, a trip there and back keeps it empty', () => {
    for (const [spec, history, lift] of [
      [catchUp, catchUpHistory, 'ez-bar-curl'],
      [second, secondHistory, 'lateral-raise'],
    ] as const) {
      const today = emptied(spec, history, lift);
      today.run({ type: 'location' }, travel);
      today.run({ type: 'location' }, gym);
      expect(lifts(today.workout), today.steps.join(' | ')).toBe('');
    }
  });

  it('a catch-up stays empty back at the gym', () => {
    const today = emptied(catchUp, catchUpHistory, 'ez-bar-curl');
    today.run({ type: 'session-kind', full: true, kind: 'catch-up' });
    today.run({ type: 'location' }, travel);
    today.run({ type: 'session-kind', full: false, kind: 'catch-up' });
    today.run({ type: 'location' }, gym);
    // On 0f8d10f and 4cb40d7: "dumbbell-curl x3 @RIR 1/1/1", the catch-up built whole.
    expect(lifts(today.workout), today.steps.join(' | ')).toBe('');
  });

  it('a second workout stays empty back at the gym', () => {
    const today = emptied(second, secondHistory, 'lateral-raise');
    today.run({ type: 'session-kind', full: true, kind: 'second' });
    today.run({ type: 'location' }, travel);
    today.run({ type: 'session-kind', full: false, kind: 'second' });
    // At Travel no lift trains the side delts: the day is the split's own, as for a catch-up.
    expect(today.workout.templateId).not.toBe(CATCH_UP_TEMPLATE_IDS.second);
    today.run({ type: 'location' }, gym);
    // On 0f8d10f and 4cb40d7: "cable-lateral-raise x3 @RIR 1/1/1", the second workout built whole.
    expect(lifts(today.workout), today.steps.join(' | ')).toBe('');
  });
});
