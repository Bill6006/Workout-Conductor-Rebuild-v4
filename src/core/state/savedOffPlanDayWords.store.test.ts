import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-fourth review of round M, on the twenty-third pass's saved workout read as itself
 * (`SavedWorkout.catchUp`, `loadSavedWorkout`: "Read as itself, on any day: the catch-up or second
 * workout it was saved as").
 *
 * The rules: item 12, "On a day you didn't tick, Today says so in one line"; item 32, "On a day a
 * workout was begun and a working set of it done, the next plan is a second workout ... Today says
 * so in one line: 'You trained today: ...'", and "Why this workout" says "Hamstrings, trained today,
 * sit out."; the 48-hour rule, "A muscle trained in the last 48 hours sits out, as on any day";
 * `dayNoteOf`, "The one line Today gives a day that offers a catch-up or a second workout", Today's
 * one line being a fact about the day. The twenty-third pass settled how the loaded plan is read
 * (as the catch-up or second workout it was saved as), not that Today speaks of the day it was
 * saved.
 *
 * What happens: the loaded session's `catchUp` is the saved one, and Today's line and the plan's
 * lines read it as the day's own offer (`dayNoteOf` reads `ticked` only where there is no offer):
 * - a catch-up saved on Wednesday and loaded on Thursday, a day the schedule ticks, gives "Not one of
 *   your training days: a 46-minute catch-up for what is behind this week." with "Full session", and
 *   once that is taken, "Not one of your training days." with "Catch-up instead";
 * - a second workout saved on Wednesday after a morning row, loaded on Saturday with nothing trained
 *   that day, gives "You trained today: this one leads with what you missed and goes easy on the
 *   rest."; rebuilt ("Make it harder"), "Why this workout" says "A second workout today: ..." and
 *   "Lats and upper back, trained today, sit out.", three days after the row; and the swap of its
 *   shrug for a barbell row is refused because the upper back and lats "rest today".
 * On 6af588c Thursday's loaded catch-up and Saturday's loaded second workout gave no such line
 * (Thursday: none; Saturday: the twenty-third review's first finding), "harder" made the loaded plan
 * the split's day, and the swap went through: all five pass there, a regression of the twenty-third
 * pass.
 *
 * The fix (the twenty-fourth pass): Today's line tells a loaded copy as the day's offer only where the
 * day offers its kind (`dayNoteOf`), and a second workout is the day trained's: loaded on another day
 * it is a catch-up of its muscles, as it was laid out, at the doses it had, nothing sitting out
 * (`secondOnAnotherDay`). Loaded the day it was saved, it is that day's second workout still.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule does
 * not tick, at the gym, the lifter saves the catch-up as "Wednesday catch-up"; or, a barbell row this
 * morning landing from another device first, saves the second workout as "Wednesday second". On
 * Thursday (ticked) loads the catch-up; on Saturday (not ticked, nothing trained) loads the second
 * workout, then makes it harder, or swaps its shrug for a barbell row; or loads it on Wednesday.
 */

const MONDAY = '2026-08-31T12:00:00.000Z';
const WEDNESDAY = '2026-09-02T12:00:00.000Z';
const WEDNESDAY_MORNING = '2026-09-02T08:00:00.000Z';
const THURSDAY = '2026-09-03T12:00:00.000Z';
const SATURDAY = '2026-09-05T12:00:00.000Z';

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

/** Wednesday's catch-up saved, loaded on Thursday, a day the schedule ticks. */
async function catchUpOnThursday() {
  const clock = { now: WEDNESDAY };
  const handle = await lifter(clock);
  expect(session(handle).workout.templateId).toBe('catch-up');
  const saved = await handle.store.saveCurrentWorkout('Wednesday catch-up');
  clock.now = THURSDAY;
  handle.store.refreshSession();
  // Thursday's own plan: the split's day, and no line.
  expect(dayNoteOf(session(handle), true)).toBeNull();
  handle.store.loadSavedWorkout(saved.id);
  expect(session(handle).workout.templateId).toBe('catch-up');
  return handle;
}

/** Wednesday's second workout (a row this morning) saved. */
async function savedSecond() {
  const clock = { now: WEDNESDAY };
  const handle = await lifter(clock);
  const db = await handle.store.getDatabase();
  await db.put('workouts', {
    ...record(0, 'barbell-row', threeSets, [8, 12], 2),
    id: 'w-row-morning',
    startedAt: WEDNESDAY_MORNING,
    completedAt: WEDNESDAY_MORNING,
  });
  await handle.store.hydrate();
  expect(session(handle).constraints.catchUp?.kind).toBe('second');
  expect(session(handle).workout.templateId).toBe('second-workout');
  const saved = await handle.store.saveCurrentWorkout('Wednesday second');
  return { clock, handle, id: saved.id };
}

/** Wednesday's second workout saved, loaded on Saturday, nothing trained. */
async function secondOnSaturday() {
  const { clock, handle, id } = await savedSecond();
  clock.now = SATURDAY;
  handle.store.refreshSession();
  handle.store.loadSavedWorkout(id);
  // Loaded on another day, a catch-up of its muscles (`secondOnAnotherDay`).
  expect(session(handle).workout.templateId).toBe('catch-up');
  expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
  return handle;
}

describe('a saved catch-up or second workout loaded on a day of another kind', () => {
  it('is not said to be on a day not ticked when the schedule ticks the day', async () => {
    const handle = await catchUpOnThursday();
    // On ce935fe: "Not one of your training days: a 46-minute catch-up for what is behind this
    // week." On 6af588c: no line.
    expect(dayNoteOf(session(handle), true)?.text ?? '').not.toMatch(/Not one of your training/);
  });

  it('is not said to be on a day not ticked once the full session is taken from it', async () => {
    const handle = await catchUpOnThursday();
    expect((await handle.store.setFullSession(true))?.ok).toBe(true);
    // On ce935fe: "Not one of your training days.", with "Catch-up instead". On 6af588c: no line.
    expect(dayNoteOf(session(handle), true)?.text ?? '').not.toMatch(/Not one of your training/);
  });

  it('is not said to follow a workout today on a day with nothing trained', async () => {
    const handle = await secondOnSaturday();
    // On ce935fe: "You trained today: this one leads with what you missed and goes easy on the
    // rest." On 6af588c: "Not one of your training days, and nothing behind this week can be caught
    // up today." (the twenty-third review's first finding).
    expect(dayNoteOf(session(handle), false)?.text ?? '').not.toMatch(/You trained today/);
  });

  it('rebuilt, does not say a muscle trained three days ago was trained today', async () => {
    const handle = await secondOnSaturday();
    expect((await handle.store.recalibrate({ type: 'intensity', direction: 'harder' }))?.ok).toBe(
      true,
    );
    expect(allEntries(session(handle).workout.blocks).length, lifts(handle)).toBeGreaterThan(0);
    const reasons = session(handle).workout.explanation.reasons.join(' / ');
    // On ce935fe: "A second workout today: it leads with what you missed, traps, ... / Lats and upper
    // back, trained today, sit out." On 6af588c "harder" made it the split's lower day.
    expect(reasons).not.toMatch(/trained today/);
    expect(reasons).not.toMatch(/A second workout today/);
  });

  it('does not refuse a swap because muscles trained three days ago rest today', async () => {
    const handle = await secondOnSaturday();
    const shrug = allEntries(session(handle).workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-shrug',
    );
    expect(shrug).toBeDefined();
    const result = await handle.store.swapExercise(shrug!.id, 'barbell-row');
    // On ce935fe: "Barbell Row works the upper back and lats, which rest today, so nothing was
    // changed.", the row on Wednesday at 8:00, Saturday noon three days on. On 6af588c the swap went
    // through.
    expect(result && !result.ok ? result.error : '').not.toMatch(/rest today/);
  });

  it('loaded on another day, says what it is there: a catch-up of its muscles', async () => {
    const handle = await secondOnSaturday();
    const workout = session(handle).workout;
    expect(workout.title).toBe('Catch-up');
    expect(workout.explanation.summary).toMatch(/^Catch-up: /);
    const reasons = workout.explanation.reasons.join(' / ');
    expect(reasons).toMatch(/A catch-up for what this week still lacks: /);
    expect(reasons).not.toMatch(/trained today|A second workout today|what is left of one session/);
    // Saturday, not ticked, offers a catch-up: the copy is one.
    expect(dayNoteOf(session(handle), false)?.text).toMatch(
      /^Not one of your training days: a [0-9]+-minute catch-up for what is behind this week\.$/,
    );
  });

  it('loaded the day it was saved, is that day’s second workout still', async () => {
    const { handle, id } = await savedSecond();
    handle.store.loadSavedWorkout(id);
    expect(session(handle).workout.templateId).toBe('second-workout');
    expect(session(handle).constraints.catchUp?.kind).toBe('second');
    expect(dayNoteOf(session(handle), false)?.text).toMatch(/^You trained today: /);
  });
});
