import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twenty-third review of round M, on the twenty-second pass's fix of a kept swap stopped while the
 * workout runs (`rebuildPreview(putBack)` on a session under way: "if (session !== current)
 * this.setSession(session)"), where it meets Undo (`undoRecalibration`, from before the round).
 *
 * The rules: the twentieth pass, "a swap kept for weeks and stopped the same day brings back the lift
 * it stood in for, off the day's list, as a swap back does (... stopping the swap is the lifter
 * putting the plan's own pick back)"; the twenty-second, "A lift put back comes off the day's list
 * whatever the workout's state"; and Undo "Puts the previous workout back": the change it takes back
 * is the last recalibration, not a setting saved since (the store already carries a setting saved
 * since into the plan Undo gives back: `rebuildPreview`'s failure path writes the focus and the
 * deload week into `previous.constraints` too).
 *
 * What happens: the stop takes the lift off the session's list, but not off the copy Undo keeps
 * (`previous.constraints.swappedAway`). Undo of any change made before the stop (a length, "harder",
 * another swap) puts the whole old list back, the lift put back on it again; the kept swap stays
 * stopped (Undo of a change that kept no swap leaves the kept swaps as they are). Once the workout is
 * discarded, the next plan leaves the EZ-bar curl out (its slot takes the dumbbell curl), the list
 * still naming it: the lift the lifter put back stays away for the rest of the day.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule
 * does not tick, at the gym, the catch-up has the EZ-bar curl. The lifter swaps it for the cable curl,
 * kept for four weeks (the list holds the EZ-bar curl), starts the workout and picks 45 minutes (or
 * swaps the lateral raise for the cable lateral raise); then stops the kept swap on the Plan tab
 * (the list is empty), comes back, taps Undo, and discards the workout.
 *
 * Both also fail on e779122, where a stop while the workout ran never took the lift off the list
 * (the twenty-second pass's own finding); the Undo path is what its fix leaves open.
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
const entryOf = (handle: Handle, exerciseId: string) =>
  allEntries(session(handle).workout.blocks).find((entry) => entry.exerciseId === exerciseId)!;
const ids = (handle: Handle) =>
  allEntries(session(handle).workout.blocks).map((entry) => entry.exerciseId);
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');

/** The EZ-bar curl swapped for the cable curl and kept, the workout started. */
async function keptAndStarted(handle: Handle) {
  const curl = entryOf(handle, 'ez-bar-curl');
  expect((await handle.store.swapExercise(curl.id, 'cable-curl', true))?.ok).toBe(true);
  expect(session(handle).constraints.swappedAway).toEqual(['ez-bar-curl']);
  handle.store.startWorkout();
}

/** The kept swap stopped while the workout runs, Undo tapped, the workout discarded. */
async function stoppedUndoneDiscarded(handle: Handle) {
  await handle.store.stopLastingSwap('ez-bar-curl');
  // The twenty-second pass's fix: off the list under way (on e779122 it stays on).
  expect(session(handle).constraints.swappedAway ?? [], 'after the stop').not.toContain(
    'ez-bar-curl',
  );
  await handle.store.undoRecalibration();
  // On 6af588c: ["ez-bar-curl"] again.
  expect(session(handle).constraints.swappedAway ?? [], 'after Undo').not.toContain('ez-bar-curl');
  handle.store.discardWorkout();
  expect(session(handle).status).toBe('preview');
  // On 6af588c: "... dumbbell-curl x3 @RIR 1/1/1 ...", no EZ-bar curl.
  expect(ids(handle), lifts(handle)).toContain('ez-bar-curl');
}

describe('Undo after a kept swap stopped while the workout runs', () => {
  it('leaves the lift put back off the list when it takes back a length', async () => {
    const handle = await lifter();
    await keptAndStarted(handle);
    expect((await handle.store.setDurationChoice(45))?.ok).toBe(true);
    await stoppedUndoneDiscarded(handle);
  });

  it('leaves the lift put back off the list when it takes back another swap', async () => {
    const handle = await lifter();
    await keptAndStarted(handle);
    const raise = entryOf(handle, 'lateral-raise');
    expect((await handle.store.swapExercise(raise.id, 'cable-lateral-raise'))?.ok).toBe(true);
    await stoppedUndoneDiscarded(handle);
  });
});
