import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twenty-fourth review of round M, on the twenty-third pass's end of a mark at a saved workout loaded
 * (`loadSavedWorkout`: `marks` drops each plan emptied whose offer is the copy's own and whose layout
 * is the copy's, "Its lifts back in a plan the lifter emptied end that plan's mark").
 *
 * The rules: the twentieth pass, "lifts back in a plan end its own mark only", and "Every later plan
 * of that offer laid out the same way takes no lift: every rebuild, the way back from the full
 * session, a later plan the same day"; the twenty-third, "Its lifts back in a plan the lifter emptied
 * end that plan's mark, as lifts back in a plan do"; the seventeenth, "the way back to the same offer
 * finds it empty again". A copy with no lift brings no lift back.
 *
 * What happens: the Plan tab saves today's workout whatever it holds, the catch-up the lifter
 * emptied too ("0 exercises"), and the copy keeps the catch-up it was laid out for (`catchUp`, its
 * layout `catch-up`). Loaded, it shows the same empty catch-up ("Not one of your training days:
 * nothing more for today."), but the load drops the day's mark of that offer and layout, with no lift
 * back, and the loaded plan keeps no mark of its own. So the catch-up comes back whole, seven lifts,
 * "a 46-minute catch-up for what is behind this week": on the way back from the full session ("Full
 * session", then "Catch-up instead"), at a later plan the same day (a workout landing from another
 * device, the copy begun and discarded), in the preview made again for a coach focus, and at the
 * copy's own rebuild (a length picked: "a 29-minute catch-up"; a change of place builds the same
 * offer whole there too). On 6af588c the loaded copy carried the mark and each of the five stays
 * empty: a regression of the twenty-third pass.
 *
 * The fix (the twenty-fourth pass): a copy with no lift is that plan emptied, the mark its own, so
 * its own rebuilds and every later plan find it empty, and a lift brought back into it ends it, as
 * in the plan itself.
 *
 * Since the owner's word of 2026-10-31 (the app chooses the day's one workout) a copy with no lift
 * is not loaded at all: today's plan stays, untouched. Here that plan is the catch-up the lifter
 * emptied, so each case now holds the day's own emptied catch-up through the same steps, and the
 * copy's refusal is asserted where it was loaded.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule does
 * not tick, at the gym, the lifter skips each lift of the catch-up ("nothing more for today"), saves
 * today's workout as "Catch-up" and loads it. Then takes the full session and the catch-up back; or a
 * workout from another device lands; or begins the copy and discards it; or picks 30 minutes; or sets
 * a coach focus.
 */

const MONDAY = '2026-08-31T12:00:00.000Z';
const NOTHING_MORE = 'Not one of your training days: nothing more for today.';

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

/** The catch-up emptied by the lifter's skips, saved as it stands, and the copy refused. */
async function emptyCopyLoaded(handle: Handle) {
  expect(session(handle).workout.templateId).toBe('catch-up');
  for (const entry of allEntries(session(handle).workout.blocks)) {
    await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
  }
  expect(note(handle)).toBe(NOTHING_MORE);
  const saved = await handle.store.saveCurrentWorkout('Catch-up');
  expect(allEntries(saved.workout.blocks)).toEqual([]);
  const before = session(handle);
  expect(handle.store.loadSavedWorkout(saved.id)).toBe('empty');
  expect(session(handle)).toBe(before);
  expect(ids(handle)).toEqual([]);
  expect(note(handle)).toBe(NOTHING_MORE);
}

describe('the catch-up the lifter emptied, its copy with no lift refused', () => {
  it('leaves the catch-up empty on the way back from the full session', async () => {
    const handle = await lifter();
    await emptyCopyLoaded(handle);
    expect((await handle.store.setFullSession(true))?.ok).toBe(true);
    expect((await handle.store.setFullSession(false))?.ok).toBe(true);
    // On ce935fe: "a 46-minute catch-up for what is behind this week", seven lifts back.
    expect(ids(handle), lifts(handle)).toEqual([]);
    expect(note(handle)).toBe(NOTHING_MORE);
  });

  it('leaves a later plan the same day empty (a workout landing from another device)', async () => {
    const handle = await lifter();
    await emptyCopyLoaded(handle);
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
    // On ce935fe: seven lifts, "a 46-minute catch-up for what is behind this week".
    expect(ids(handle), lifts(handle)).toEqual([]);
    expect(note(handle)).toBe(NOTHING_MORE);
  });

  it('leaves the next plan empty once the copy is begun and discarded', async () => {
    const handle = await lifter();
    await emptyCopyLoaded(handle);
    handle.store.startWorkout();
    handle.store.discardWorkout();
    expect(session(handle).status).toBe('preview');
    // On ce935fe: seven lifts, "a 46-minute catch-up for what is behind this week".
    expect(ids(handle), lifts(handle)).toEqual([]);
    expect(note(handle)).toBe(NOTHING_MORE);
  });

  it('leaves its own rebuild empty (a length picked)', async () => {
    const handle = await lifter();
    await emptyCopyLoaded(handle);
    expect((await handle.store.setDurationChoice(30))?.ok).toBe(true);
    // On ce935fe: "a 29-minute catch-up for what is behind this week", five lifts back.
    expect(ids(handle), lifts(handle)).toEqual([]);
    expect(note(handle)).toBe(NOTHING_MORE);
  });

  it('takes a lift brought back into it as the plan does: the next plan is the catch-up again', async () => {
    const handle = await lifter();
    await emptyCopyLoaded(handle);
    const added = await handle.store.recalibrate({
      type: 'add-exercise',
      exerciseId: 'dumbbell-fly',
      muscle: 'chest',
      sets: 2,
    });
    expect(added?.ok).toBe(true);
    expect(ids(handle)).toEqual(['dumbbell-fly']);
    handle.store.startWorkout();
    handle.store.discardWorkout();
    // The mark ended, as a lift brought back into the day's own plan ends it. Kept aside for the
    // day as well, it stayed, and the next plan was laid out empty.
    expect(session(handle).workout.templateId).toBe('catch-up');
    expect(ids(handle).length, lifts(handle)).toBeGreaterThan(0);
  });

  it('leaves the preview made again for a coach focus empty', async () => {
    const handle = await lifter();
    await emptyCopyLoaded(handle);
    await handle.store.setCoachFocus('biceps');
    // On ce935fe: seven lifts, "a 46-minute catch-up for what is behind this week".
    expect(ids(handle), lifts(handle)).toEqual([]);
    expect(note(handle)).toBe(NOTHING_MORE);
  });
});
