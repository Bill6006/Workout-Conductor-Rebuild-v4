import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twenty-third review of round M, on the twenty-second pass's carry of the plans the lifter emptied
 * (`emptied`) into a saved workout loaded on Today (`loadSavedWorkout`), where it meets the
 * twentieth pass's marks.
 *
 * The rules: the twentieth pass, "Every later plan of that offer laid out the same way takes no
 * lift ... and lifts back in a plan end its own mark only"; the eighteenth, "lifts back in the plan
 * end the mark"; `loadSavedWorkout`, "everything after that recalibrates as usual"; and "Make it
 * harder" takes a lift "no further than a plan made harder would", a length the lifter picks
 * stands, and the coach focus "leads with" its muscle: none of them takes the plan away.
 *
 * What happens: the lifter brings the catch-up's lifts back by loading a copy of it saved earlier,
 * and Today shows it ("a 46-minute catch-up for what is behind this week"), but the loaded workout
 * keeps the mark of the catch-up emptied for the same offer and layout (`catch-up`). Only a
 * recalibration that keeps its lifts ends a mark (`markEmptied`); a rebuild lays the marked layout
 * out empty first (`emptiedLayoutsFor`, the generator's `emptiedHere`). So the first rebuild empties
 * the loaded catch-up again: "Make it harder", a length picked, an end time, or the preview made
 * again for a coach focus all leave "Not one of your training days: nothing more for today.", every
 * lift gone. A swap first would have ended the mark (the plan has lifts after it): which change
 * comes first decides whether the lifts stay.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule
 * does not tick, at the gym, the lifter saves the catch-up as "Catch-up", skips each of its lifts
 * ("nothing more for today"), then loads "Catch-up": seven lifts back. Then makes it harder, or
 * picks 30 minutes, or sets a coach focus.
 *
 * On e779122 the loaded workout kept no mark and none of these emptied it (each still has lifts
 * there: "harder" and the length gave the split's pull day, the focus the catch-up whole); all
 * three pass there: a regression of the twenty-second pass.
 */

const MONDAY = '2026-08-31T12:00:00.000Z';

async function lifter() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  await db.put('workouts', {
    ...record(
      0,
      'barbell-bench-press',
      [
        [10, 100, 2],
        [10, 100, 2],
        [10, 100, 2],
      ],
      [8, 12],
      2,
    ),
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
const note = (handle: Handle) => dayNoteOf(session(handle), false)?.text;

/** The catch-up saved, emptied by the lifter's skips, and its saved copy loaded. */
async function catchUpBack(handle: Handle) {
  expect(session(handle).workout.templateId).toBe('catch-up');
  const saved = await handle.store.saveCurrentWorkout('Catch-up');
  for (const entry of allEntries(session(handle).workout.blocks)) {
    await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
  }
  expect(note(handle)).toBe('Not one of your training days: nothing more for today.');
  handle.store.loadSavedWorkout(saved.id);
  // Seven lifts back; on 6af588c Today says "Not one of your training days: a 46-minute catch-up
  // for what is behind this week." (on e779122, "Not one of your training days.").
  expect(ids(handle).length).toBe(7);
}

describe('a saved catch-up loaded after the lifter emptied the day’s catch-up', () => {
  it('keeps its lifts through "Make it harder"', async () => {
    const handle = await lifter();
    await catchUpBack(handle);
    expect((await handle.store.recalibrate({ type: 'intensity', direction: 'harder' }))?.ok).toBe(
      true,
    );
    // On 6af588c: no lift, "Not one of your training days: nothing more for today."
    expect(ids(handle).length, `${lifts(handle)} | ${note(handle)}`).toBeGreaterThan(0);
  });

  it('keeps its lifts through a length picked', async () => {
    const handle = await lifter();
    await catchUpBack(handle);
    expect((await handle.store.setDurationChoice(30))?.ok).toBe(true);
    // On 6af588c: no lift, "Not one of your training days: nothing more for today."
    expect(ids(handle).length, `${lifts(handle)} | ${note(handle)}`).toBeGreaterThan(0);
  });

  it('keeps its lifts through the preview made again for a coach focus', async () => {
    const handle = await lifter();
    await catchUpBack(handle);
    await handle.store.setCoachFocus('biceps');
    // On 6af588c: no lift, "Not one of your training days: nothing more for today."
    expect(ids(handle).length, `${lifts(handle)} | ${note(handle)}`).toBeGreaterThan(0);
    // Made again, the plan is the day's own: no choices kept aside for a loaded one.
    expect(session(handle).constraints.dayChoices).toBeUndefined();
  });

  it('made again for a coach focus after a length picked, is the day’s own plan', async () => {
    // The day's choices put back on the plan made again (a length picked) are its own: none is kept
    // aside for a loaded plan once the day's own plan takes its place.
    const handle = await lifter();
    await catchUpBack(handle);
    expect((await handle.store.setDurationChoice(30))?.ok).toBe(true);
    await handle.store.setCoachFocus('biceps');
    expect(ids(handle).length, `${lifts(handle)} | ${note(handle)}`).toBeGreaterThan(0);
    expect(session(handle).constraints.dayChoices).toBeUndefined();
  });

  it('gives a later plan the full session taken from it', async () => {
    const handle = await lifter();
    await catchUpBack(handle);
    expect((await handle.store.setFullSession(true))?.ok).toBe(true);
    // A workout from another device lands, twenty days old (the offer the same): a later plan.
    const db = await handle.store.getDatabase();
    const when = new Date(Date.parse(MONDAY) - 18 * 86_400_000).toISOString();
    await db.put('workouts', {
      ...record(0, 'back-squat', [[5, 200, 2]], [4, 6], 2),
      id: 'w-elsewhere',
      startedAt: when,
      completedAt: when,
    });
    await handle.store.hydrate();
    expect(session(handle).constraints.fullSession).toBe(true);
    expect(session(handle).workout.templateId).not.toBe('catch-up');
  });

  it('emptied by hand in its turn, leaves a later plan of its offer empty', async () => {
    // The twentieth pass: "Every later plan of that offer laid out the same way takes no lift"; the
    // loaded copy is a plan of the day's offer, laid out as the catch-up (the twenty-third pass's
    // fix keeps the day's own choices aside and reads them with what the lifter chose on it).
    const handle = await lifter();
    await catchUpBack(handle);
    for (const entry of allEntries(session(handle).workout.blocks)) {
      await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
    }
    expect(ids(handle)).toEqual([]);
    // A workout from another device lands, twenty days old (the offer the same): a later plan.
    const db = await handle.store.getDatabase();
    const when = new Date(Date.parse(MONDAY) - 18 * 86_400_000).toISOString();
    await db.put('workouts', {
      ...record(0, 'back-squat', [[5, 200, 2]], [4, 6], 2),
      id: 'w-elsewhere',
      startedAt: when,
      completedAt: when,
    });
    await handle.store.hydrate();
    expect(session(handle).workout.templateId).toBe('catch-up');
    expect(ids(handle), lifts(handle)).toEqual([]);
    expect(note(handle)).toBe('Not one of your training days: nothing more for today.');
  });
});
