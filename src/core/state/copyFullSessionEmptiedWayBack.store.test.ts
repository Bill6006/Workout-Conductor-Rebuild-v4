import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout, session as workoutAt } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-seventh review of round M (M31z-A), on the twenty-sixth pass's way back from the full session
 * taken from a loaded copy (`session-kind` in src/engine/recalibration/recalibrate.ts): "Taken from a
 * copy loaded that stands for none of the day's offer, the full session is the day's own: its way
 * back is that offer, kept aside with the day's choices". It puts the day's offer back in the plan
 * (`constraints.catchUp = cloneSpec(offer)`), but not the day's marks of plans the lifter emptied
 * for that offer: the load kept them aside (`dayChoices.emptied`, every mark not of the copy's own
 * offer), and a rebuild reads only the plan's own (`emptiedLayoutsFor(constraints)`). So the way back
 * lays out whole the catch-up or second workout the lifter emptied today.
 *
 * The rules: the seventeenth pass, "the way back to the same offer finds it empty again; a later
 * plan the same day keeps the mark"; the twentieth, "Every later plan of that offer laid out the same
 * way takes no lift: every rebuild, the way back from the full session, a later plan the same day";
 * the twenty-second and twenty-third, a saved workout loaded "keeps the day's offer, the full session
 * taken, the plans emptied", "every later plan the same day reads them"; the twenty-sixth, "its way
 * back is the day's offer". The day's own path keeps the rule: its full session and back, and the
 * next plan of the same day after the copy's full session (begun and discarded), both find the plan
 * empty.
 *
 * What happens: (1) on Saturday, a day not ticked, the lifter skips both lifts of the day's catch-up
 * (back squat x3, barbell shrug x2): "Not one of your training days: nothing more for today.", with
 * "Full session". The lifter loads "Nothing more" (Wednesday's second workout with nothing more for
 * that day: no lift), taps "Full session" (the upper day, "Catch-up instead") and "Catch-up instead":
 * "Not one of your training days: a 20-minute catch-up for what is behind this week." with the back
 * squat x3 and the barbell shrug x2, the catch-up the lifter emptied. (2) On Friday, a day ticked, after
 * a squat this morning (another device), the lifter skips each of the second workout's seven lifts
 * ("You trained today: nothing more for today."), loads "Empty catch-up" (Wednesday's catch-up the
 * lifter emptied), taps "Full session" (the pull day, "Go easy instead") and "Go easy instead": "You
 * trained today: this one leads with what you missed and goes easy on the rest." with the seven lifts
 * back (barbell row x3, bench press x2, ...).
 *
 * On the previous head (1e29f22) the full session taken from such a copy had no way back at all (the
 * twenty-sixth review's M31y-B: "Not one of your training days." with no button, and no line on a day
 * trained), so both tests fail there at the button: the way back, and this path, are the twenty-sixth
 * pass's.
 *
 * Steps (synthetic data only): Monday's bench press in the log. (1) On Wednesday, a day the schedule
 * does not tick, at the gym, a long session this morning (another device); the lifter saves today's
 * workout as "Nothing more"; on Saturday skips each lift of the catch-up, loads "Nothing more", taps
 * "Full session", then "Catch-up instead". (2) On Wednesday the lifter skips each lift of the catch-up
 * and saves it as "Empty catch-up"; on Friday, a squat this morning (another device), skips each lift
 * of the second workout, loads "Empty catch-up", taps "Full session", then "Go easy instead".
 *
 * The fix (the twenty-seventh pass): the full session taken from such a copy makes the plan the
 * day's own from then on (`session-kind`): the day's offer, with the day's marks and the copy's
 * together as the plan's own (`marksOfDay`), and nothing kept aside, so the way back reads them.
 */

const MONDAY = '2026-08-31T12:00:00.000Z';
const WEDNESDAY_MORNING = '2026-09-02T08:00:00.000Z';
const WEDNESDAY = '2026-09-02T12:00:00.000Z';
const FRIDAY_MORNING = '2026-09-04T08:00:00.000Z';
const FRIDAY = '2026-09-04T18:00:00.000Z';
const SATURDAY = '2026-09-05T12:00:00.000Z';

const threeSets: [number, number, number][] = [
  [10, 100, 2],
  [10, 100, 2],
  [10, 100, 2],
];

/** Six working sets each, every muscle trained this morning. */
const LONG_MORNING = workoutAt(WEDNESDAY_MORNING, [
  ['barbell-bench-press', 6],
  ['incline-dumbbell-press', 6],
  ['lateral-raise', 6],
  ['rear-delt-fly', 6],
  ['barbell-shrug', 6],
  ['pull-up', 6],
  ['barbell-row', 6],
  ['ez-bar-curl', 6],
  ['wrist-curl', 6],
  ['back-squat', 6],
  ['romanian-deadlift', 6],
  ['standing-calf-raise', 6],
  ['ab-wheel-rollout', 6],
  ['overhead-press', 6],
  ['cable-triceps-pushdown', 6],
]);

async function lifter(clock: { now: string }) {
  const handle = createTestStore({ now: () => clock.now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(clock.now), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, clock.now),
  );
  const db = await handle.store.getDatabase();
  await db.put('workouts', {
    ...record(0, 'barbell-bench-press', threeSets, [8, 12], 2),
    id: 'w-bench-monday',
    startedAt: MONDAY,
    completedAt: MONDAY,
  });
  await handle.store.hydrate();
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');
const count = (handle: Handle) => allEntries(session(handle).workout.blocks).length;

/** Skips each lift of today's plan, as the lifter does from its sheet. */
async function skipEach(handle: Handle) {
  for (const entry of allEntries(session(handle).workout.blocks)) {
    expect((await handle.store.recalibrate({ type: 'skip', entryId: entry.id }))?.ok).toBe(true);
  }
  expect(count(handle)).toBe(0);
}

/** Saturday: the long Wednesday morning in the log, "Nothing more" saved, the catch-up emptied. */
async function saturdayEmptied() {
  const clock = { now: WEDNESDAY };
  const handle = await lifter(clock);
  const db = await handle.store.getDatabase();
  await db.put('workouts', { ...LONG_MORNING, id: 'w-long-morning' });
  await handle.store.hydrate();
  const saved = await handle.store.saveCurrentWorkout('Nothing more');
  clock.now = SATURDAY;
  handle.store.refreshSession();
  expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
  expect(count(handle)).toBeGreaterThan(0);
  await skipEach(handle);
  expect(dayNoteOf(session(handle), false)?.text).toBe(
    'Not one of your training days: nothing more for today.',
  );
  return { handle, saved };
}

/** Friday: "Empty catch-up" saved on Wednesday, a squat this morning, the second workout emptied. */
async function fridayEmptied() {
  const clock = { now: WEDNESDAY };
  const handle = await lifter(clock);
  await skipEach(handle);
  const saved = await handle.store.saveCurrentWorkout('Empty catch-up');
  clock.now = FRIDAY;
  const db = await handle.store.getDatabase();
  await db.put('workouts', {
    ...record(0, 'back-squat', threeSets, [8, 12], 2),
    id: 'w-squat-friday',
    startedAt: FRIDAY_MORNING,
    completedAt: FRIDAY_MORNING,
  });
  await handle.store.hydrate();
  expect(session(handle).constraints.catchUp?.kind).toBe('second');
  expect(count(handle)).toBeGreaterThan(0);
  await skipEach(handle);
  expect(dayNoteOf(session(handle), true)?.text).toBe('You trained today: nothing more for today.');
  return { handle, saved };
}

describe('the way back from the full session taken from a loaded copy, the day’s plan emptied', () => {
  it('finds the catch-up the lifter emptied empty again, as the day’s own way back does', async () => {
    // The day's own path: the full session and back finds the catch-up empty (the seventeenth pass).
    const own = (await saturdayEmptied()).handle;
    expect((await own.store.setFullSession(true))?.ok).toBe(true);
    expect((await own.store.setFullSession(false))?.ok).toBe(true);
    expect(count(own), lifts(own)).toBe(0);

    const { handle, saved } = await saturdayEmptied();
    handle.store.loadSavedWorkout(saved.id);
    expect(count(handle)).toBe(0);
    expect(dayNoteOf(session(handle), false)).not.toHaveProperty('action');
    expect((await handle.store.setFullSession(true))?.ok).toBe(true);
    expect(count(handle)).toBeGreaterThan(0);
    const there = dayNoteOf(session(handle), false);
    // On 1e29f22: "Not one of your training days.", no button.
    expect(there, there?.text).not.toHaveProperty('action');
    expect((await handle.store.setFullSession(false))?.ok).toBe(true);
    // On f840d5b: "Not one of your training days: a 20-minute catch-up for what is behind this week."
    // with "back-squat x3 @RIR 2/2/2; barbell-shrug x2 @RIR 1/1".
    expect(count(handle), lifts(handle)).toBe(0);
    expect(dayNoteOf(session(handle), false)?.text).toBe(
      'Not one of your training days: nothing more for today.',
    );
  });

  it('finds the second workout the lifter emptied empty again, as the day’s own way back does', async () => {
    const own = (await fridayEmptied()).handle;
    expect((await own.store.setFullSession(true))?.ok).toBe(true);
    expect((await own.store.setFullSession(false))?.ok).toBe(true);
    expect(count(own), lifts(own)).toBe(0);

    const { handle, saved } = await fridayEmptied();
    handle.store.loadSavedWorkout(saved.id);
    expect(count(handle)).toBe(0);
    expect(dayNoteOf(session(handle), true)).not.toHaveProperty('action');
    expect((await handle.store.setFullSession(true))?.ok).toBe(true);
    expect(count(handle)).toBeGreaterThan(0);
    const there = dayNoteOf(session(handle), true);
    // On 1e29f22: no line at all.
    expect(there, there?.text).not.toHaveProperty('action');
    expect((await handle.store.setFullSession(false))?.ok).toBe(true);
    // On f840d5b: "You trained today: this one leads with what you missed and goes easy on the
    // rest." with seven lifts, "barbell-row x3 @RIR 2/2/2; barbell-bench-press x2 @RIR 2/2; ...".
    expect(count(handle), lifts(handle)).toBe(0);
    expect(dayNoteOf(session(handle), true)?.text).toBe(
      'You trained today: nothing more for today.',
    );
  });
});
