import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-fifth review of round M (M31x-B), on the twenty-fourth pass's `secondOnAnotherDay`, called
 * from `loadSavedWorkout` only where `localDayKey(saved.createdAt) !== localDayKey(now)`: the day a
 * saved second workout belongs to is read from the moment it was saved, not the day it was planned.
 *
 * The rules: the twenty-fourth pass, "A second workout is the day trained's: loaded on another day,
 * one built from its muscles is a catch-up of them, laid out as it was at the doses it had, nothing
 * sitting out", and `secondOnAnotherDay`, "a second workout is the day trained's, and says nothing
 * of a day trained on any other ... (loaded as itself, it said that what was trained the day it was
 * saved sat out today, and refused a swap for it)"; item 32's lines are for "a day a workout was
 * begun and a working set of it done": "A second workout today: ...", "Hamstrings, trained today, sit
 * out."; the 48-hour rule; item 12, on a day not ticked "The full session stays one tap away".
 *
 * What happens: the Plan tab saves the plan on the screen ("Save today's workout"), and nothing on
 * that tab reads the day again, so Friday's second workout, still there on Saturday morning (or
 * saved from Friday night's plan just past midnight, or on Sunday), is saved with that day's date.
 * Loaded that day, a day not ticked with nothing trained, it is taken for the day's own second
 * workout: it keeps `catchUp.kind` "second", "Why this workout" says "A second workout today: it
 * leads with what you missed, upper chest, side delts, traps, ..." and "Lats and upper back, trained
 * today, sit out." (a row on Friday morning), and so it says again once rebuilt ("Make it harder").
 * Saved and loaded on Sunday, 58 hours after the row, the swap of its shrug for a barbell row is
 * refused: "Barbell Row works the upper back and lats, which rest today, so nothing was changed.",
 * the twenty-fourth pass's own finding. Today's line, which tells it as the day's offer only on a
 * day of its kind, says just "Not one of your training days.", with no "Full session" button, where
 * the catch-up it should be (as a copy saved on Friday is) gives "Not one of your training days: a
 * 45-minute catch-up for what is behind this week." with "Full session". On ce935fe every test fails
 * too (a second workout copy was itself on any day; the line there: "You trained today: this one
 * leads with what you missed and goes easy on the rest."): the twenty-fourth pass's fix does not
 * reach a copy saved on a later day than it was planned. A change of time zone between the save and
 * the load moves the save's day the same way.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Friday, a day the schedule ticks,
 * a barbell row this morning (another device), so Today offers the second workout. The lifter leaves
 * the app on the Plan tab and saves "today's workout" as "Friday second" on Saturday morning (or at
 * ten past midnight); on Saturday evening opens Today and loads "Friday second", then makes it
 * harder. Or saves it on Sunday evening, loads it and swaps its shrug for a barbell row.
 *
 * The fix (the twenty-fifth pass): a second workout stays one only on the day its plan was made
 * (`generatedAt`), while that day is still one trained; on any other it is a catch-up of its
 * muscles.
 */

const MONDAY = '2026-08-31T12:00:00.000Z';
const FRIDAY_MORNING = '2026-09-04T08:00:00.000Z';
const FRIDAY_EVENING = '2026-09-04T21:00:00.000Z';
const PAST_MIDNIGHT = '2026-09-05T00:10:00.000Z';
const SATURDAY_MORNING = '2026-09-05T09:00:00.000Z';
const SATURDAY_EVENING = '2026-09-05T18:00:00.000Z';
const SUNDAY_EVENING = '2026-09-06T18:00:00.000Z';

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
  await db.put('workouts', {
    ...record(0, 'barbell-row', threeSets, [8, 12], 2),
    id: 'w-row-friday',
    startedAt: FRIDAY_MORNING,
    completedAt: FRIDAY_MORNING,
  });
  await handle.store.hydrate();
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');
const reasons = (handle: Handle) => session(handle).workout.explanation.reasons.join(' / ');

/** Friday's second workout saved at `savedAt` from the screen, loaded at `loadedAt`. */
async function loadedLater(savedAt: string, loadedAt = SATURDAY_EVENING) {
  const clock = { now: FRIDAY_EVENING };
  const handle = await lifter(clock);
  expect(session(handle).constraints.catchUp?.kind).toBe('second');
  expect(session(handle).workout.templateId).toBe('second-workout');
  // Still on the screen on a later day: the Plan tab reads no new day.
  clock.now = savedAt;
  const saved = await handle.store.saveCurrentWorkout('Friday second');
  expect(saved.workout.templateId).toBe('second-workout');
  clock.now = loadedAt;
  handle.store.refreshSession();
  // The day's own plan: not ticked, nothing trained, a catch-up.
  expect(session(handle).workout.templateId).toBe('catch-up');
  handle.store.loadSavedWorkout(saved.id);
  expect(allEntries(session(handle).workout.blocks).length, lifts(handle)).toBeGreaterThan(0);
  return handle;
}

describe('a second workout saved on a later day than it was planned, loaded that day', () => {
  it('is no second workout of a day with nothing trained (saved the next morning)', async () => {
    const handle = await loadedLater(SATURDAY_MORNING);
    // On 992c87d and ce935fe: "second", the plan "second-workout".
    expect(session(handle).constraints.catchUp?.kind).not.toBe('second');
    // On 992c87d and ce935fe: "A second workout today: it leads with what you missed, upper chest,
    // side delts, traps, ... / Lats and upper back, trained today, sit out. / ...".
    expect(reasons(handle)).not.toMatch(/A second workout today|trained today/);
  });

  it('is no second workout of a day with nothing trained (saved just past midnight)', async () => {
    const handle = await loadedLater(PAST_MIDNIGHT);
    expect(reasons(handle)).not.toMatch(/A second workout today|trained today/);
  });

  it('rebuilt, says nothing of muscles trained today', async () => {
    const handle = await loadedLater(SATURDAY_MORNING);
    expect((await handle.store.recalibrate({ type: 'intensity', direction: 'harder' }))?.ok).toBe(
      true,
    );
    expect(allEntries(session(handle).workout.blocks).length, lifts(handle)).toBeGreaterThan(0);
    // On 992c87d and ce935fe: "A second workout today: it leads with what you missed, ... / Lats and
    // upper back, trained today, sit out. / ...".
    expect(reasons(handle)).not.toMatch(/A second workout today|trained today/);
  });

  it('does not refuse a swap because muscles rowed 58 hours before rest today', async () => {
    const handle = await loadedLater(SUNDAY_EVENING, SUNDAY_EVENING);
    const shrug = allEntries(session(handle).workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-shrug',
    );
    expect(shrug, lifts(handle)).toBeDefined();
    const result = await handle.store.swapExercise(shrug!.id, 'barbell-row');
    // On 992c87d and ce935fe: "Barbell Row works the upper back and lats, which rest today, so
    // nothing was changed.", the row on Friday at 8:00, Sunday 18:00 58 hours on.
    expect(result && !result.ok ? result.error : '').not.toMatch(/rest today/);
  });

  it('keeps the full session one tap away on a day not ticked, as a copy saved on Friday does', async () => {
    const handle = await loadedLater(SATURDAY_MORNING);
    // On 992c87d: "Not one of your training days.", no button. On ce935fe: "You trained today: this
    // one leads with what you missed and goes easy on the rest.", no button.
    expect(dayNoteOf(session(handle), false)?.action?.label).toBe('Full session');
  });
});

describe('a second workout saved on the day it was planned', () => {
  it('loaded the next day after a workout that morning, is no second workout of that day', async () => {
    const clock = { now: FRIDAY_EVENING };
    const handle = await lifter(clock);
    expect(session(handle).constraints.catchUp?.kind).toBe('second');
    const saved = await handle.store.saveCurrentWorkout('Friday second');
    // Saturday: a squat this morning, from another device: the day offers its own second workout.
    clock.now = SATURDAY_EVENING;
    const db = await handle.store.getDatabase();
    await db.put('workouts', {
      ...record(0, 'back-squat', threeSets, [8, 12], 2),
      id: 'w-squat-saturday',
      startedAt: SATURDAY_MORNING,
      completedAt: SATURDAY_MORNING,
    });
    await handle.store.hydrate();
    expect(session(handle).constraints.catchUp?.kind).toBe('second');
    handle.store.loadSavedWorkout(saved.id);
    // Friday's: its muscles a catch-up of them, nothing of Friday's row said of Saturday.
    expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
    expect(reasons(handle)).not.toMatch(/A second workout today|trained today/);
  });

  it('saved the next morning, then loaded after a workout that day, is no second workout of it', async () => {
    const clock = { now: FRIDAY_EVENING };
    const handle = await lifter(clock);
    expect(session(handle).constraints.catchUp?.kind).toBe('second');
    // Still on the screen on Saturday morning: saved then, the plan Friday's.
    clock.now = SATURDAY_MORNING;
    const saved = await handle.store.saveCurrentWorkout('Friday second');
    // A squat later that morning, from another device: Saturday is a day trained.
    clock.now = SATURDAY_EVENING;
    const db = await handle.store.getDatabase();
    await db.put('workouts', {
      ...record(0, 'back-squat', threeSets, [8, 12], 2),
      id: 'w-squat-saturday',
      startedAt: '2026-09-05T10:00:00.000Z',
      completedAt: '2026-09-05T10:00:00.000Z',
    });
    await handle.store.hydrate();
    expect(session(handle).constraints.catchUp?.kind).toBe('second');
    handle.store.loadSavedWorkout(saved.id);
    // Friday's plan, not Saturday's: a catch-up of its muscles.
    expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
    expect(reasons(handle)).not.toMatch(/A second workout today|trained today/);
  });

  it('loaded the same day once that morning’s workout is gone, is no second workout', async () => {
    const clock = { now: FRIDAY_EVENING };
    const handle = await lifter(clock);
    const saved = await handle.store.saveCurrentWorkout('Friday second');
    // The morning's row taken away (another device): nothing trained today.
    const db = await handle.store.getDatabase();
    await db.delete('workouts', 'w-row-friday');
    await handle.store.hydrate();
    expect(session(handle).constraints.catchUp?.kind).not.toBe('second');
    handle.store.loadSavedWorkout(saved.id);
    expect(session(handle).constraints.catchUp?.kind).not.toBe('second');
    expect(reasons(handle)).not.toMatch(/A second workout today|trained today/);
  });
});
