import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../core/state/session';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { dayNoteOf } from '../../features/today/dayNote';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationSuccess, RecalibrationTrigger, SessionConstraints } from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { builtCatchUp, generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Eighteenth review of round M, on the seventeenth pass's closed slot and `scopeFor`. The report: "On
 * a day off the plan, a lift left out with nothing to come in closes its slot (`closed`), which no
 * rebuild fills, and the catch-up keeps its slots through every rebuild while one is closed." Kept
 * slots make every rebuild partial, a change of place too, so a catch-up with a slot closed, taken to
 * a place with no lift for its other slots, is laid out in its kept slots and comes to nothing there
 * (`rebuilt`: an empty catch-up kept as the catch-up). Back where its lifts fit, the store reads no
 * new offer (the plan was built as the catch-up, so `offerOverrides`' `unbuilt` is false), and the
 * rebuild keeps the empty plan as one the lifter emptied (`rebuild`: "A catch-up or a second workout
 * the lifter's changes emptied stays so through every rebuild"). The lifter emptied one slot; a trip
 * empties the rest for the day. Without a closed slot (532aba6, or a catch-up with nothing kept), the
 * trip lays the catch-up out whole at each place, and back home its lifts are back ("So is a plan
 * not begun at a new place ... the new place may have one", the fifth review).
 *
 * Steps (synthetic data only): at home with dumbbells, a catch-up for the forearms and the chest is
 * the push-up and the hammer curl. The lifter swaps the push-up for the dumbbell shoulder press;
 * "Uncomfortable" brings the Arnold press, then the lateral raise; "Uncomfortable" on the lateral
 * raise leaves it out (the chest's slot closes; the seventeenth pass's own steps). The hammer curl
 * stays. The lifter sets the place to Travel, with no equipment: "Rebuilt for Travel: 1 exercise
 * removed.", nothing more for today (no lift for the forearms there). Back home with the dumbbells:
 * "Rebuilt for Home: no changes needed.", still nothing more for today, the hammer curl gone for the
 * day; Full session and Catch-up instead find it empty too (the way back's mark).
 *
 * Passes on 532aba6 (the trip lays the catch-up out whole: the hammer curl is back at home, with the
 * push-up the lifter swapped away, which the seventeenth pass fixed and these tests do not check).
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const [noEquipment] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const travel: LocationProfile = { ...noEquipment, id: 'travel', name: 'Travel' };
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const profile = profileOf();
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [
    { muscle: 'forearms', sets: 3, minRir: 1, why: 'behind' },
    { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
  ],
  sitOut: [],
};

function day() {
  let location: LocationProfile = home;
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
    find: (id: string) => allEntries(workout.blocks).find((entry) => entry.exerciseId === id)!,
    note: () =>
      dayNoteOf({ status: 'preview', constraints, workout } as unknown as WorkoutSession, false),
    run(trigger: RecalibrationTrigger, at_?: LocationProfile): RecalibrationSuccess {
      if (at_) location = at_;
      // As the store reads a change of place (`offerOverrides`): only a plan built as the split's
      // own session, where the day's catch-up had no lift, is built whole at the new place.
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
      steps.push(
        `${trigger.type}@${location.name}: ${result.summary.headline} => ${lifts(workout)}`,
      );
      return result;
    },
  };
}

/** The seventeenth pass's steps: the chest's slot closed, the hammer curl left; then the trip. */
function closedThenTrip() {
  const today = day();
  expect(lifts(today.workout)).toBe('push-up x3 @RIR 2/2/2; hammer-curl x2 @RIR 1/1');
  today.run({
    type: 'replace',
    entryId: today.find('push-up').id,
    exerciseId: 'dumbbell-shoulder-press',
  });
  today.run({ type: 'uncomfortable', entryId: today.find('dumbbell-shoulder-press').id });
  today.run({ type: 'uncomfortable', entryId: today.find('arnold-press').id });
  today.run({ type: 'uncomfortable', entryId: today.find('lateral-raise').id });
  expect(lifts(today.workout)).toBe('hammer-curl x2 @RIR 1/1');
  today.run({ type: 'location' }, travel);
  today.run({ type: 'location' }, home);
  return today;
}

const hasHammerCurl = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).some((entry) => entry.exerciseId === 'hammer-curl');

describe('a catch-up with a slot closed, taken to a place with no lift for the rest, and back', () => {
  it('the hammer curl, never set aside, is back at home', () => {
    const today = closedThenTrip();
    // On 4cb40d7: nothing, "Not one of your training days: nothing more for today."
    expect(hasHammerCurl(today.workout), today.steps.join(' | ')).toBe(true);
    expect(today.note()?.text, today.steps.join(' | ')).not.toMatch(/nothing more for today/);
  });

  it('nor do Full session and Catch-up instead give it back', () => {
    const today = closedThenTrip();
    today.run({ type: 'session-kind', full: true, kind: 'catch-up' });
    today.run({ type: 'session-kind', full: false, kind: 'catch-up' });
    // On 4cb40d7: nothing again, the way back finding the plan "emptied".
    expect(hasHammerCurl(today.workout), today.steps.join(' | ')).toBe(true);
  });
});
