import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twenty-third review of round M, on the twenty-second pass's carry of the day's offer into a saved
 * workout loaded on Today (`loadSavedWorkout`: `catchUp` from the plan it replaces, `fullSession`
 * only where the lifter had taken it).
 *
 * The rules: `loadSavedWorkout`, "Starts a fresh preview session from a saved workout; everything
 * after that recalibrates as usual", and the line it gives, "Change the length or any exercise and
 * it recalibrates as usual"; the twenty-second pass, "A saved workout loaded keeps the day's offer
 * ..., as every later plan the same day does" (for the plans after it); Today's line is "read from
 * the plan as it was built" (`dayNoteOf`); item 32, "With nothing behind, the plan is the usual one
 * without what was trained today: 'You trained today, and nothing is behind this week: what you
 * trained sits out.'"; and item 12, the line "nothing behind this week can be caught up today" is
 * for a day where "each lift for it [works] a muscle trained in the last two days".
 *
 * What happens: the loaded workout keeps the day's catch-up or second workout in its constraints
 * with no full session taken, and its layout is not the offer's own, so `builtCatchUp` reads it as
 * the offer planned as with nothing behind: on a day not ticked, the split's own day with nothing
 * that can be caught up; on a day trained, a second workout with nothing behind, off the plan
 * (`offPlanSpec`), its muscles trained today resting (`restingInPlan`). So:
 * - on a day not ticked, Today says "Not one of your training days, and nothing behind this week can
 *   be caught up today." over the saved pull day, though the gym builds the catch-up (a length
 *   picked builds it there and then), with no button back to it;
 * - on a day trained (a row this morning), Today says "You trained today: what you trained sits
 *   out." over a plan holding a barbell row and a chin-up for the lats and upper back trained this
 *   morning; the swap of that row for the chest-supported row is refused ("Chest-Supported Row works
 *   the upper back and lats, which rest today"), and the sheet, which reads the same refusal, offers
 *   no lift for them; "Make it harder" leaves the row, the chin-up and the rear-delt fly out (four
 *   lifts left of seven), where it adds a set. A day trained offers a second workout whether the
 *   schedule ticks it or not, so a saved workout loaded after a morning session reads so on any day.
 * On e779122 the loaded workout had no offer: Today said "Not one of your training days.", the swap
 * went through and "harder" kept seven lifts, the chin-up and the rear-delt fly among them. All four
 * pass there: a regression of the twenty-second pass.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule
 * does not tick, at the gym, the lifter takes the full session (the split's pull day), saves it as
 * "Pull day" and takes the catch-up back. Then loads "Pull day"; or, a row from this morning landing
 * from another device first (a second workout), loads "Pull day" and swaps its row, or makes it
 * harder.
 */

/** Monday of the week, two days before the Wednesday the tests run on. */
const MONDAY = '2026-08-31T12:00:00.000Z';
/** Wednesday morning: a workout logged on another device. */
const MORNING = '2026-09-02T08:00:00.000Z';

const threeSets: [number, number, number][] = [
  [10, 100, 2],
  [10, 100, 2],
  [10, 100, 2],
];

async function lifter() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
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
const ids = (handle: Handle) =>
  allEntries(session(handle).workout.blocks).map((entry) => entry.exerciseId);
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');
const note = (handle: Handle) => dayNoteOf(session(handle), false);

/** The split's pull day saved from the full session, and the catch-up taken back. */
async function savedPullDay(handle: Handle): Promise<string> {
  expect(session(handle).workout.templateId).toBe('catch-up');
  expect((await handle.store.setFullSession(true))?.ok).toBe(true);
  expect(session(handle).workout.templateId).toBe('pull-arms');
  const saved = await handle.store.saveCurrentWorkout('Pull day');
  expect((await handle.store.setFullSession(false))?.ok).toBe(true);
  return saved.id;
}

/** A row this morning, landing from another device: today offers a second workout. */
async function rowThisMorning(handle: Handle) {
  const db = await handle.store.getDatabase();
  await db.put('workouts', {
    ...record(0, 'barbell-row', threeSets, [8, 12], 2),
    id: 'w-row-morning',
    startedAt: MORNING,
    completedAt: MORNING,
  });
  await handle.store.hydrate();
  expect(session(handle).constraints.catchUp?.kind).toBe('second');
}

describe('a saved workout loaded on a day that offers a catch-up or a second workout', () => {
  it('is not said to leave nothing that can be caught up on a day not ticked', async () => {
    const handle = await lifter();
    const id = await savedPullDay(handle);
    handle.store.loadSavedWorkout(id);
    expect(session(handle).workout.templateId).toBe('pull-arms');
    // On 6af588c: "Not one of your training days, and nothing behind this week can be caught up
    // today." On e779122: "Not one of your training days."
    expect(note(handle)?.text).not.toMatch(/can be caught up today/);
  });

  it('is not said to sit out what was trained today while it holds a row for it', async () => {
    const handle = await lifter();
    const id = await savedPullDay(handle);
    await rowThisMorning(handle);
    handle.store.loadSavedWorkout(id);
    expect(ids(handle)).toContain('barbell-row');
    // On 6af588c: "You trained today: what you trained sits out."
    expect(note(handle)?.text ?? '').not.toMatch(/sits out/);
  });

  it('takes a swap of its row for another row on a day trained', async () => {
    const handle = await lifter();
    const id = await savedPullDay(handle);
    await rowThisMorning(handle);
    handle.store.loadSavedWorkout(id);
    const row = allEntries(session(handle).workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-row',
    );
    const result = await handle.store.swapExercise(row!.id, 'chest-supported-row');
    // On 6af588c: "Chest-Supported Row works the upper back and lats, which rest today, so nothing
    // was changed." On e779122 the swap went through.
    expect(result?.ok, result && !result.ok ? result.error : '').toBe(true);
    expect(ids(handle)).toContain('chest-supported-row');
  });

  it('keeps its lifts through "Make it harder" on a day trained', async () => {
    const handle = await lifter();
    const id = await savedPullDay(handle);
    await rowThisMorning(handle);
    handle.store.loadSavedWorkout(id);
    const before = ids(handle);
    expect(before).toEqual(expect.arrayContaining(['barbell-row', 'chin-up', 'rear-delt-fly']));
    const result = await handle.store.recalibrate({ type: 'intensity', direction: 'harder' });
    expect(result?.ok).toBe(true);
    // On 6af588c: "ez-bar-curl x4 @RIR 1/1/1/1; cable-triceps-pushdown x4 @RIR 1/1/1/1;
    // barbell-shrug x4 @RIR 1/1/1/1; dumbbell-curl x3 @RIR 1/1/1", the row, the chin-up and the
    // rear-delt fly left out. On e779122 seven lifts stayed, a set more each (the row planned
    // again as the chest-supported row).
    expect(ids(handle).length, lifts(handle)).toBe(before.length);
    expect(ids(handle), lifts(handle)).toEqual(
      expect.arrayContaining(['chin-up', 'rear-delt-fly']),
    );
  });
});
