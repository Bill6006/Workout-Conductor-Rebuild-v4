import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout, session as workoutAt } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-seventh review of round M (M31z-C), on the twenty-sixth pass's way back from the full session
 * taken from a loaded copy (`session-kind` in src/engine/recalibration/recalibrate.ts): the plan is
 * the day's own from there ("the full session taken from a copy that stands for none of the day's
 * offer is the day's own, so its way back is the day's offer"), but the full session the lifter took
 * on the day's own plan before the load stays kept aside (`dayChoices.fullSession`), and every later
 * plan the same day reads it before the plan's own choice (`dayChoicesOf`: `constraints.fullSession
 * === true || kept?.fullSession === true`). So "Catch-up instead" holds only until the next plan of
 * the day, which is the full session again.
 *
 * The rules: item 12, "The button beside it, Full session, gives the usual plan; there, Catch-up
 * instead gives the catch-up back. The choice holds for the day."; the twenty-third pass, "every later
 * plan the same day reads them with what the lifter chose on the loaded plan"; the twenty-sixth, "its
 * way back is the day's offer". The day's own path keeps it: the full session, "Catch-up instead",
 * begun and discarded, gives the catch-up (checked first).
 *
 * What happens: on Saturday, a day not ticked, the lifter taps "Full session" (the upper day), then
 * loads "Nothing more" (Wednesday's second workout with no lift: "Not one of your training days:
 * nothing more for today.", "Full session"), taps "Full session" and then "Catch-up instead": "Not one
 * of your training days: a 20-minute catch-up for what is behind this week." (back squat x3, barbell
 * shrug x2). Begun and discarded, the next plan is the upper day again, "Not one of your training
 * days." with "Catch-up instead".
 *
 * On the previous head (1e29f22) the full session taken from such a copy had no way back (the
 * twenty-sixth review's M31y-B), so the test fails there at the button: the path is the twenty-sixth
 * pass's.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule does
 * not tick, at the gym, a long session this morning (another device); the lifter saves today's
 * workout as "Nothing more". On Saturday the lifter taps "Full session", loads "Nothing more", taps
 * "Full session", then "Catch-up instead", begins the workout and discards it.
 *
 * The fix (the twenty-seventh pass): the full session taken from such a copy makes the plan the
 * day's own from then on (`session-kind`), and nothing kept aside, so the way back ends the full
 * session for the day, as on the day's own plan.
 */

const MONDAY = '2026-08-31T12:00:00.000Z';
const WEDNESDAY_MORNING = '2026-09-02T08:00:00.000Z';
const WEDNESDAY = '2026-09-02T12:00:00.000Z';
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

async function saturday() {
  const clock = { now: WEDNESDAY };
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
  await db.put('workouts', { ...LONG_MORNING, id: 'w-long-morning' });
  await handle.store.hydrate();
  const saved = await handle.store.saveCurrentWorkout('Nothing more');
  clock.now = SATURDAY;
  handle.store.refreshSession();
  expect(session(handle).workout.title).toBe('Catch-up');
  return { handle, saved };
}

type Handle = Awaited<ReturnType<typeof saturday>>['handle'];
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');

describe('"Catch-up instead" on the full session taken from a loaded copy', () => {
  it('holds for the day after the day’s own full session was taken, as on the day’s own plan', async () => {
    // The day's own path: full session, "Catch-up instead", begun and discarded: the catch-up.
    const own = (await saturday()).handle;
    expect((await own.store.setFullSession(true))?.ok).toBe(true);
    expect((await own.store.setFullSession(false))?.ok).toBe(true);
    own.store.startWorkout();
    own.store.discardWorkout();
    expect(session(own).workout.title, lifts(own)).toBe('Catch-up');

    const { handle, saved } = await saturday();
    expect((await handle.store.setFullSession(true))?.ok).toBe(true);
    // An empty copy stands in for nothing (the owner, 2026-10-31): today's plan stays, untouched.
    const before = session(handle);
    expect(handle.store.loadSavedWorkout(saved.id)).toBe('empty');
    expect(session(handle)).toBe(before);
    expect((await handle.store.setFullSession(true))?.ok).toBe(true);
    const there = dayNoteOf(session(handle), false);
    // On 1e29f22: "Not one of your training days.", no button.
    expect(there, there?.text).not.toHaveProperty('action');
    expect((await handle.store.setFullSession(false))?.ok).toBe(true);
    expect(session(handle).workout.title).toBe('Catch-up');
    expect(dayNoteOf(session(handle), false)).not.toHaveProperty('action');
    handle.store.startWorkout();
    handle.store.discardWorkout();
    // On f840d5b: "Upper body", "Not one of your training days." with "Catch-up instead".
    expect(session(handle).workout.title, lifts(handle)).toBe('Catch-up');
    expect(session(handle).constraints.fullSession).toBeUndefined();
  });
});
