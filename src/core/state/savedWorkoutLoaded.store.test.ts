import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twenty-second review of round M, on the twenty-first pass's carry of the day's choices into a
 * later plan the same day (`ensureSession` reads `current ?? carry`), where it meets a saved
 * workout loaded on Today (`loadSavedWorkout`, from before the round).
 *
 * The rules: "Every later plan of that offer laid out the same way takes no lift: every rebuild, the
 * way back from the full session, a later plan the same day" (the twentieth pass); "Every later plan
 * the same day keeps the day's list of lifts swapped away" (the twenty-first); "the full session
 * taken was lost through a workout begun and discarded" (the first pass, fixed); "The choice holds
 * for the day" (item 12); and "only a plan built whole for a changed offer reads it afresh" (the
 * sixteenth pass).
 *
 * What happens: a saved workout loaded is a session made with `createSession`, whose constraints are
 * `emptyConstraints()`. The day's offer (`catchUp`, `fullSession`), the plans the lifter emptied
 * (`emptied`) and the lifts swapped away today (`swappedAway`) are all dropped with the plan it
 * replaces. So:
 * - the loaded workout begun and discarded (or saved with nothing logged), the next plan the same
 *   day reads none of them: a catch-up the lifter emptied comes back whole ("a 46-minute catch-up",
 *   every lift skipped back), the EZ-bar curl swapped away comes back, and the full session taken
 *   gives way to the catch-up;
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule
 * does not tick, at the gym. The lifter takes the full session (the split's pull day), saves it as
 * "Pull day", and takes the catch-up back. Then:
 * - skips each lift of the catch-up ("nothing more for today"), loads "Pull day", starts it and
 *   discards it: the catch-up is back whole;
 * - or swaps the catch-up's EZ-bar curl for the cable curl, loads "Pull day", starts it and discards
 *   it: the EZ-bar curl is back, the list empty;
 * - or takes the full session, loads "Pull day", starts it and discards it: the catch-up;
 * - or swaps the EZ-bar curl, and loads "Pull day" the next day with Wednesday's plan still on the
 *   screen: none of Wednesday's choices is Thursday's (`fromEarlierDay`, Maintenance 24);
 * (A save that rebuilds a plan not yet begun, reserve checks turned on, rebuilds a saved workout
 * loaded into the day's plan on any day, a day of the plan too: that is from before the round.)
 *
 * All also fail on 333f1d4 (a saved workout has started from no constraints since before the round;
 * the marks it drops are the seventeenth to twenty-first passes').
 */

/** Monday of the week, two days before the Wednesday the tests run on. */
const MONDAY = '2026-08-31T12:00:00.000Z';

async function lifter(clock = { now: TEST_NOW }) {
  const now = clock.now;
  const handle = createTestStore({ now: () => clock.now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(now), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, now),
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

/** The split's pull day saved from the full session, and the catch-up taken back. */
async function savedPullDay(handle: Handle): Promise<string> {
  expect(session(handle).workout.templateId).toBe('catch-up');
  expect((await handle.store.setFullSession(true))?.ok).toBe(true);
  const saved = await handle.store.saveCurrentWorkout('Pull day');
  expect((await handle.store.setFullSession(false))?.ok).toBe(true);
  expect(session(handle).workout.templateId).toBe('catch-up');
  return saved.id;
}

/** The saved workout loaded, begun and discarded. */
function loadedAndDiscarded(handle: Handle, id: string) {
  handle.store.loadSavedWorkout(id);
  expect(session(handle).workout.templateId).toBe('pull-arms');
  handle.store.startWorkout();
  handle.store.discardWorkout();
  expect(session(handle).status).toBe('preview');
}

describe('a saved workout loaded on a day that offers a catch-up', () => {
  it('leaves the catch-up the lifter emptied empty once it is discarded', async () => {
    const handle = await lifter();
    const id = await savedPullDay(handle);
    for (const entry of allEntries(session(handle).workout.blocks)) {
      await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
    }
    expect(note(handle)).toBe('Not one of your training days: nothing more for today.');
    loadedAndDiscarded(handle, id);
    // On e779122 and 333f1d4: "Not one of your training days: a 46-minute catch-up for what is
    // behind this week.", every lift back, and no mark.
    expect(ids(handle), lifts(handle)).toEqual([]);
    expect(note(handle)).toBe('Not one of your training days: nothing more for today.');
  });

  it('keeps the lift swapped away today away once it is discarded', async () => {
    const handle = await lifter();
    const id = await savedPullDay(handle);
    const curl = allEntries(session(handle).workout.blocks).find(
      (entry) => entry.exerciseId === 'ez-bar-curl',
    );
    expect((await handle.store.swapExercise(curl!.id, 'cable-curl'))?.ok).toBe(true);
    expect(session(handle).constraints.swappedAway).toEqual(['ez-bar-curl']);
    loadedAndDiscarded(handle, id);
    // On e779122 and 333f1d4: "... ez-bar-curl x3 @RIR 1/1/1 ...", and the list empty.
    expect(ids(handle), lifts(handle)).not.toContain('ez-bar-curl');
    expect(session(handle).constraints.swappedAway ?? []).toContain('ez-bar-curl');
  });

  it('keeps the full session taken once it is discarded', async () => {
    const handle = await lifter();
    const id = await savedPullDay(handle);
    expect((await handle.store.setFullSession(true))?.ok).toBe(true);
    loadedAndDiscarded(handle, id);
    // On e779122 and 333f1d4: the catch-up, "a 46-minute catch-up for what is behind this week".
    expect(session(handle).constraints.fullSession, note(handle)).toBe(true);
    expect(session(handle).workout.templateId).toBe('pull-arms');
  });

  it('keeps the full session taken through a save while it is shown', async () => {
    // The twenty-third review of round M: a save reads the day's offer again; with a saved workout
    // loaded, the day's, kept aside with the full session taken, for the plans after it.
    const handle = await lifter();
    const id = await savedPullDay(handle);
    expect((await handle.store.setFullSession(true))?.ok).toBe(true);
    handle.store.loadSavedWorkout(id);
    const profile = handle.store.getSnapshot().profile!;
    await handle.store.saveProfile({ ...profile, reserveCheck: !profile.reserveCheck });
    handle.store.startWorkout();
    handle.store.discardWorkout();
    expect(session(handle).status).toBe('preview');
    expect(session(handle).constraints.fullSession, note(handle)).toBe(true);
    expect(session(handle).workout.templateId).toBe('pull-arms');
  });

  it('carries none of the choices of a plan from an earlier day still on the screen', async () => {
    const clock = { now: TEST_NOW };
    const handle = await lifter(clock);
    const id = await savedPullDay(handle);
    const curl = allEntries(session(handle).workout.blocks).find(
      (entry) => entry.exerciseId === 'ez-bar-curl',
    );
    expect((await handle.store.swapExercise(curl!.id, 'cable-curl'))?.ok).toBe(true);
    expect(session(handle).constraints.swappedAway).toEqual(['ez-bar-curl']);
    expect(session(handle).constraints.catchUp).toBeTruthy();
    // Thursday, Wednesday's plan still on the screen.
    clock.now = new Date(Date.parse(TEST_NOW) + 24 * 3_600_000).toISOString();
    handle.store.loadSavedWorkout(id);
    expect(session(handle).workout.templateId).toBe('pull-arms');
    const constraints = session(handle).constraints;
    expect(constraints.swappedAway).toBeUndefined();
    expect(constraints.catchUp ?? null).toBeNull();
    expect(constraints.emptied).toBeUndefined();
    expect(constraints.fullSession).toBeFalsy();
  });
});
