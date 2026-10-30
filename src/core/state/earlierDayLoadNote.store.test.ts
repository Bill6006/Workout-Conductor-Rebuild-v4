import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-fifth review of round M (M31x-A), on the twenty-fourth pass's `dayNoteOf` (a loaded copy is
 * told as the day's offer "only where the day offers its kind", read from `dayChoices.catchUp`) meeting
 * the twenty-second pass's load over a plan from an earlier day (`loadSavedWorkout`: `const day =
 * this.fromEarlierDay(session) ? null : dayChoicesOf(session.constraints)`, so `dayChoices` is `{}`).
 *
 * The rules: item 12, "On a day you didn't tick, Today says so in one line and offers a shorter
 * catch-up ... The full session stays one tap away."; the twenty-fourth pass, "Today tells a loaded
 * copy as the day's offer only where the day offers its kind, and otherwise says the day as it is";
 * the twenty-second, "loaded over a plan from an earlier day, it keeps none of that day's" (none of
 * Friday's: Saturday's own offer is not Friday's).
 *
 * What happens: the Plan tab, whose "Use" button loads a saved workout, never re-reads the day (only
 * Today and Workout do, `useTodayWorkout`), so a phone left on the Plan tab since Friday evening
 * still holds Friday's plan on Saturday morning. Loaded over it, the copy keeps no offer of the day
 * at all (`dayChoices: {}`), though Saturday, not ticked, offers a catch-up ("Not one of your
 * training days: a 45-minute catch-up for what is behind this week." on its own plan). `dayNoteOf`
 * then reads `dayChoices.catchUp?.kind` as no catch-up, and Today says only "Not one of your
 * training days.", with no "Full session" button, over the loaded catch-up, while the copy stands
 * (opening Today keeps it: its key is Saturday's; only a save reads the day's offer into it). Loaded
 * over Saturday's own plan, the same copy gives "Not one of your training days: a 46-minute catch-up
 * for what is behind this week." with "Full session". A saved second workout loaded the same way is
 * made a catch-up and meets the same. On ce935fe both tests pass ("Not one of your training days: a
 * 46-minute catch-up for what is behind this week.", "Full session"): a regression of the
 * twenty-fourth pass.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule does
 * not tick, at the gym, the lifter saves the catch-up as "Wednesday catch-up". On Friday evening
 * Today shows Friday's plan; the lifter leaves the app on the Plan tab. On Saturday morning, a day
 * not ticked, still on the Plan tab, the lifter taps "Use" on "Wednesday catch-up", then opens Today.
 *
 * The fix (the twenty-fifth pass): a plan left open from an earlier day gives way to today's
 * before the copy is loaded (`leaveEarlierDay`), so the copy takes today's choices.
 */

const MONDAY = '2026-08-31T12:00:00.000Z';
const WEDNESDAY = '2026-09-02T12:00:00.000Z';
const FRIDAY_EVENING = '2026-09-04T20:00:00.000Z';
const SATURDAY_MORNING = '2026-09-05T09:00:00.000Z';
const CATCH_UP_LINE =
  /^Not one of your training days: a [0-9]+-minute catch-up for what is behind this week\.$/;

const threeSets: [number, number, number][] = [
  [10, 100, 2],
  [10, 100, 2],
  [10, 100, 2],
];

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

/** Wednesday's catch-up saved; Friday's plan on the screen; on Saturday morning, the copy loaded. */
async function loadedOverFriday() {
  const clock = { now: WEDNESDAY };
  const handle = await lifter(clock);
  expect(session(handle).workout.templateId).toBe('catch-up');
  const saved = await handle.store.saveCurrentWorkout('Wednesday catch-up');
  clock.now = FRIDAY_EVENING;
  handle.store.refreshSession();
  // Friday, a day the schedule ticks: the split's day, and no line.
  expect(session(handle).workout.templateId).not.toBe('catch-up');
  expect(dayNoteOf(session(handle), true)).toBeNull();
  // Saturday morning, still on the Plan tab: nothing has read the day again.
  clock.now = SATURDAY_MORNING;
  handle.store.loadSavedWorkout(saved.id);
  expect(session(handle).workout.templateId, lifts(handle)).toBe('catch-up');
  return handle;
}

describe('a saved catch-up loaded over a plan left on the screen from the day before', () => {
  it('is told as the catch-up Saturday offers, the full session one tap away', async () => {
    const handle = await loadedOverFriday();
    const note = dayNoteOf(session(handle), false);
    // On 992c87d: "Not one of your training days.", no button. On ce935fe: "Not one of your
    // training days: a 46-minute catch-up for what is behind this week.", with "Full session".
    expect(note?.text).toMatch(CATCH_UP_LINE);
    expect(note?.action?.label).toBe('Full session');
  });

  it('keeps the full session one tap away once Today is opened', async () => {
    const handle = await loadedOverFriday();
    handle.store.refreshSession();
    expect(session(handle).workout.templateId).toBe('catch-up');
    // On 992c87d: "Not one of your training days.", no button, while the copy stands.
    expect(dayNoteOf(session(handle), false)?.action?.label).toBe('Full session');
  });
});
