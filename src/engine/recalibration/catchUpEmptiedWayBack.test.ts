import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../core/state/session';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationSuccess, RecalibrationTrigger, SessionConstraints } from './types';
import { allEntries, CATCH_UP_TEMPLATE_IDS, type GeneratedWorkout } from '../workout/types';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { generateWorkout } from '../workoutGenerator/generate';
import { dayNoteOf } from '../../features/today/dayNote';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Seventeenth review of round M. "A catch-up or a second workout emptied stays so through every
 * rebuild, the full session a tap away" (the fourteenth pass), and the fifteenth made "the way back
 * to a catch-up or second workout the lifter had emptied" go through: its test, at a home with no
 * equipment, taps Full session and then Catch-up instead and gets the emptied catch-up back
 * ("Not one of your training days: nothing more for today."). The sixteenth pass kept an emptied
 * plan through a whole rebuild too ("a catch-up the lifter emptied got lifts back when the whole
 * plan was built again"). But the way back is a plan built whole from the full session, which is not
 * empty, so no guard sees the emptied plan: the catch-up is laid out afresh with only the lift set
 * aside left out, and wherever that lift has an alternative the emptied catch-up comes back with
 * lifts. A length picked keeps it empty; the full session and back does not.
 *
 * Steps (synthetic data only): at the gym, a catch-up for the side delts is the lateral raise. The
 * lifter skips it ("Not one of your training days: nothing more for today."), picks 30 minutes (still
 * empty), taps Full session, then Catch-up instead: the cable lateral raise, "a 11-minute catch-up
 * for what is behind this week". Likewise a second workout (the quads trained this morning, the side
 * delts missed): Full session, then Go easy instead.
 *
 * Also fails on 89dfb39.
 */

const NOW = at(9, 18);
const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const profile = profileOf();
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const sideDelts = (kind: CatchUpSpec['kind']): CatchUpSpec => ({
  kind,
  muscles: [{ muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: kind === 'second' ? ['quads'] : [],
});

function emptiedThenBack(
  spec: CatchUpSpec,
  /** What changed while the full session was on: the day's offer, or the place. */
  meanwhile: { offer?: CatchUpSpec; place?: LocationProfile } = {},
) {
  const records = [
    session(at(3, 18), [['barbell-row', 3]]),
    ...(spec.kind === 'second' ? [session(at(9, 9), [['back-squat', 3]])] : []),
  ];
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  const steps: string[] = [lifts(workout)];
  let location: LocationProfile = gym!;
  let offerChanged = false;
  const run = (trigger: RecalibrationTrigger): RecalibrationSuccess => {
    const result = recalibrate({
      trigger,
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: trigger.type === 'duration' ? trigger.choice : 'default',
      profile,
      location,
      ...(offerChanged ? { offerChanged } : {}),
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
  };
  const note = () =>
    dayNoteOf({ status: 'preview', constraints, workout } as unknown as WorkoutSession, false);
  expect(lifts(workout)).toBe('lateral-raise x3 @RIR 1/1/1');
  run({ type: 'skip', entryId: allEntries(workout.blocks)[0]!.id });
  expect(allEntries(workout.blocks)).toEqual([]);
  const nothing = note()?.text;
  expect(nothing).toMatch(/nothing more for today/);
  // A length picked keeps it so (the sixteenth pass).
  run({ type: 'duration', choice: 30 });
  expect(allEntries(workout.blocks), steps.join(' | ')).toEqual([]);
  run({ type: 'session-kind', full: true, kind: spec.kind });
  expect(allEntries(workout.blocks).length).toBeGreaterThan(0);
  if (meanwhile.offer) {
    constraints = { ...constraints, catchUp: meanwhile.offer };
    offerChanged = true;
  }
  if (meanwhile.place) location = meanwhile.place;
  run({ type: 'session-kind', full: false, kind: spec.kind });
  return { workout, steps: steps.join(' | '), note: note(), nothing };
}

describe('the way back from the full session to an emptied catch-up or second workout', () => {
  it('reads a changed offer afresh: the way back to it lays it out', () => {
    // The side delts emptied; a save while the full session was on made the offer the chest's.
    const chest: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [{ muscle: 'chest', sets: 3, minRir: 1, why: 'behind' }],
      sitOut: [],
    };
    const back = emptiedThenBack(sideDelts('catch-up'), { offer: chest });
    expect(allEntries(back.workout.blocks).length, back.steps).toBeGreaterThan(0);
    expect(back.note?.text, back.steps).toMatch(/-minute catch-up for what is behind this week\.$/);
  });

  it('back at a place with no lift for the offer, plans the split’s day there', () => {
    // At a home with no equipment no lift trains the side delts: the day is the split's own.
    const back = emptiedThenBack(sideDelts('catch-up'), { place: bare });
    expect(back.workout.templateId, back.steps).not.toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    expect(allEntries(back.workout.blocks).length, back.steps).toBeGreaterThan(0);
  });

  it('a catch-up for the side delts at the gym: the lateral raise skipped, Full session, Catch-up instead', () => {
    const back = emptiedThenBack(sideDelts('catch-up'));
    // On 532aba6: cable-lateral-raise x3, "a 11-minute catch-up for what is behind this week".
    expect(allEntries(back.workout.blocks), back.steps).toEqual([]);
    expect(back.note?.text, back.steps).toBe(back.nothing);
  });

  it('a second workout, the side delts missed: the lateral raise skipped, Full session, Go easy instead', () => {
    const back = emptiedThenBack(sideDelts('second'));
    // On 532aba6: cable-lateral-raise x3, "this one leads with what you missed".
    expect(allEntries(back.workout.blocks), back.steps).toEqual([]);
    expect(back.note?.text, back.steps).toBe(back.nothing);
  });
});
