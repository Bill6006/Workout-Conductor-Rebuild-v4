import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationSuccess, RecalibrationTrigger, SessionConstraints } from './types';
import { allEntries, CATCH_UP_TEMPLATE_IDS, type GeneratedWorkout } from '../workout/types';
import { builtCatchUp, generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Twentieth review of round M, on the nineteenth pass's layout of a plan emptied (`emptiedLayout`).
 * The report: "The mark of a plan emptied keeps the layout emptied ...: the offer's own, or the
 * split's own day a place with no lift for the offer puts in its place. The generator lays that
 * layout out empty wherever it finds a lift for it"; "a second workout at such a place is the
 * split's own day, as a catch-up is"; and from the fourteenth to sixteenth passes, "a catch-up or a
 * second workout emptied stays so through every rebuild".
 *
 * A second workout's stand-in, the split's own day at a place with no lift for it, is off the plan,
 * so the lifter can empty it too. The mark keeps one layout: emptying the second layout writes over
 * the first (`markEmptied`: `constraints.emptiedLayout = next.templateId`), and the layout the
 * lifter emptied first is then "another plan", laid out with lifts again. And lifts laid out as the
 * offer at another place end the mark (`laidOutAsOffer`), the split's day the lifter emptied with
 * it, so a trip there and back brings that day back with lifts.
 *
 * Steps (synthetic data only), a second workout for the side delts after a morning upper session,
 * the store's reading of a change of place mirrored as the nineteenth pass's tests do:
 * - At the gym it is the lateral raise; the lifter skips it. Full session; the place set to Travel
 *   (no equipment); Go easy instead: the split's own day, the lower day's Bulgarian split squat,
 *   calf raise and dead bug, which the lifter skips one by one. Back at the gym: "Rebuilt for Gym: 1
 *   exercise added", the cable lateral raise.
 * - The other way round: at Travel the split's own day stands in, and the lifter skips its three
 *   lifts; at the gym the second workout is built whole (another layout, as the report says), and
 *   the lifter skips its lateral raise. Back at Travel it stays empty; Full session, then Go easy
 *   instead: "The second workout: no changes needed", the reverse lunge and the plank, the split's
 *   day the lifter emptied there laid out with lifts again.
 * - With one emptying only: at Travel the split's own day stands in, and the lifter skips its three
 *   lifts. The place set to the gym: the second workout built whole there (the lateral raise), left
 *   as it is. The place set back to Travel: "Rebuilt for Travel", the reverse lunge and the plank.
 *
 * The first also fails on 0f8d10f, for the nineteenth pass's own finding (back at the gym after the
 * full session at a place with no lift for it); the second passes on 0f8d10f, where the way back at
 * Travel found the second workout empty (a regression of the nineteenth pass); the third also fails
 * on 0f8d10f (any lift in the plan ended the mark there).
 */

const profile = profileOf();
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const [noEquipment] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const travel: LocationProfile = { ...noEquipment, id: 'travel', name: 'Travel' };
const theGym = gym as LocationProfile;
const second: CatchUpSpec = {
  kind: 'second',
  muscles: [{ muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: ['chest', 'triceps', 'upper-back', 'lats', 'biceps'],
};
const history = [
  session(at(3, 18), [['barbell-row', 3]]),
  session(at(9, 9), [
    ['barbell-bench-press', 3],
    ['barbell-row', 3],
    ['lat-pulldown', 3],
    ['barbell-curl', 3],
  ]),
];

function day(start: LocationProfile) {
  let location = start;
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location,
    history,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: second },
  });
  let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: second };
  const steps: string[] = [`[${workout.templateId}] ${lifts(workout)}`];
  const run = (trigger: RecalibrationTrigger, to?: LocationProfile): RecalibrationSuccess => {
    if (to) location = to;
    // As the store reads a change of place (`offerOverrides`): a plan made where the day's offer
    // had no lift is built whole at the new place, unless the full session is on.
    const unbuilt =
      trigger.type === 'location' &&
      !constraints.fullSession &&
      builtCatchUp(second, workout).muscles.length === 0;
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
      `${trigger.type}@${location.name}: ${result.summary.headline} => [${workout.templateId}] ${lifts(workout)}`,
    );
    return result;
  };
  return {
    get workout() {
      return workout;
    },
    get constraints() {
      return constraints;
    },
    steps,
    run,
    /** Every lift skipped, one by one, by the lifter's hand. */
    skipEvery() {
      expect(allEntries(workout.blocks).length).toBeGreaterThan(0);
      for (const entry of allEntries(workout.blocks)) run({ type: 'skip', entryId: entry.id });
      expect(allEntries(workout.blocks)).toEqual([]);
    },
  };
}

describe('a second workout emptied in two layouts, at two places', () => {
  it('the gym’s, then the split’s day standing in at Travel: back at the gym it stays empty', () => {
    const today = day(theGym);
    expect(lifts(today.workout)).toBe('lateral-raise x3 @RIR 1/1/1');
    today.skipEvery();
    today.run({ type: 'session-kind', full: true, kind: 'second' });
    today.run({ type: 'location' }, travel);
    today.run({ type: 'session-kind', full: false, kind: 'second' });
    // The split's own day stands in at Travel, as for a catch-up: the lifter empties it too.
    expect(today.workout.templateId).not.toBe(CATCH_UP_TEMPLATE_IDS.second);
    today.skipEvery();
    today.run({ type: 'location' }, theGym);
    // On 0fe4cb9: "cable-lateral-raise x3 @RIR 1/1/1", the second workout built whole.
    expect(lifts(today.workout), today.steps.join(' | ')).toBe('');
  });

  it('the split’s day standing in at Travel, then the gym’s: the way back at Travel stays empty', () => {
    const today = day(travel);
    expect(today.workout.templateId).not.toBe(CATCH_UP_TEMPLATE_IDS.second);
    today.skipEvery();
    today.run({ type: 'location' }, theGym);
    // Another layout: built whole at the gym, as the nineteenth pass decided; emptied there too.
    expect(lifts(today.workout)).toBe('lateral-raise x3 @RIR 1/1/1');
    today.skipEvery();
    today.run({ type: 'location' }, travel);
    expect(lifts(today.workout)).toBe('');
    today.run({ type: 'session-kind', full: true, kind: 'second' });
    today.run({ type: 'session-kind', full: false, kind: 'second' });
    // On 0fe4cb9: "reverse-lunge x3 @RIR 1/1/1; plank x2 @RIR 2/2", the split's day the lifter
    // emptied at Travel laid out with lifts again. On 0f8d10f: empty.
    expect(lifts(today.workout), today.steps.join(' | ')).toBe('');
  });

  it('the split’s day standing in at Travel, then a trip to the gym and back: it stays empty', () => {
    const today = day(travel);
    expect(today.workout.templateId).not.toBe(CATCH_UP_TEMPLATE_IDS.second);
    today.skipEvery();
    today.run({ type: 'location' }, theGym);
    // Another layout: built whole at the gym, as the nineteenth pass decided, and left as it is.
    expect(lifts(today.workout)).toBe('lateral-raise x3 @RIR 1/1/1');
    today.run({ type: 'location' }, travel);
    // On 0fe4cb9 and 0f8d10f: "reverse-lunge x3 @RIR 1/1/1; plank x2 @RIR 2/2".
    expect(lifts(today.workout), today.steps.join(' | ')).toBe('');
  });

  it('a lift put back in the split’s day at Travel ends its mark only: the gym’s stays empty', () => {
    const today = day(theGym);
    today.skipEvery();
    today.run({ type: 'session-kind', full: true, kind: 'second' });
    today.run({ type: 'location' }, travel);
    today.run({ type: 'session-kind', full: false, kind: 'second' });
    const layout = today.workout.templateId;
    today.skipEvery();
    today.run({ type: 'add-exercise', exerciseId: 'reverse-lunge', muscle: 'quads', sets: 2 });
    expect(lifts(today.workout)).toBe('reverse-lunge x2 @RIR 1/1');
    expect(today.constraints.emptied).toEqual([
      { offer: 'second side-delts', layout: CATCH_UP_TEMPLATE_IDS.second },
    ]);
    expect(layout).not.toBe(CATCH_UP_TEMPLATE_IDS.second);
    today.run({ type: 'location' }, theGym);
    expect(lifts(today.workout), today.steps.join(' | ')).toBe('');
  });
});
