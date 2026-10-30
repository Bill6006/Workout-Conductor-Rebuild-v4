import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twenty-second review of round M, on the twenty-first pass's carry of the day's list of lifts
 * swapped away (`swappedAway`) into every later plan the same day (`ensureSession`'s `away`), and
 * its carry of a workout saved with nothing logged (`dismissCompletion`), where they meet the
 * twentieth pass's kept swap stopped the same day (`stopLastingSwap`).
 *
 * The rules: the twentieth pass, "a swap kept for weeks and stopped the same day brings back the
 * lift it stood in for, off the day's list, as a swap back does (... stopping the swap is the lifter
 * putting the plan's own pick back)"; the twenty-first, "Every later plan the same day keeps the
 * day's list of lifts swapped away, and a lift put back comes off the list before the plan is made
 * again".
 *
 * What happens: the lift put back comes off the list only in the preview made again
 * (`rebuildPreview(putBack)`), which does nothing to a workout under way or finished
 * (`status !== 'preview'`). A kept swap stopped while the workout runs, or on the completion screen,
 * leaves its lift on the session's list; once the workout is discarded, or saved with nothing logged
 * and the completion put away, `ensureSession` carries the whole list into the next plan: the lift
 * the lifter put back stays away for the rest of the day (its slot takes another pick, here the
 * dumbbell curl), and the list still names it. Stopped on a plan not yet started, the same lift comes
 * back (the twentieth pass's `previewAgainSwappedAway.store.test.ts`).
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule
 * does not tick, at the gym, the catch-up has the EZ-bar curl. The lifter swaps it for the cable
 * curl, kept for four weeks (the list holds the EZ-bar curl), and starts the workout.
 * - The lifter stops the kept swap (the Plan tab's Stop, there whatever the workout's state), then
 *   discards the workout.
 * - Or stops it, then finishes the workout with nothing logged and puts the completion away.
 * - Or finishes the workout with nothing logged, stops the swap on the completion screen, and puts
 *   the completion away.
 * Each time the next plan has no EZ-bar curl and the list holds it.
 *
 * All three pass on 333f1d4, where no later plan kept the day's list at all (the twenty-first
 * pass's finding): a regression of the twenty-first pass.
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();

async function lifter() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  const when = daysBefore(2);
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
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const ids = (handle: Handle) =>
  allEntries(session(handle).workout.blocks).map((entry) => entry.exerciseId);
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');

/** The catch-up's EZ-bar curl swapped for the cable curl, kept for four weeks, and started. */
async function keptAndStarted(handle: Handle) {
  expect(session(handle).workout.templateId).toBe('catch-up');
  const curl = allEntries(session(handle).workout.blocks).find(
    (entry) => entry.exerciseId === 'ez-bar-curl',
  );
  expect(curl).toBeDefined();
  expect((await handle.store.swapExercise(curl!.id, 'cable-curl', true))?.ok).toBe(true);
  expect(session(handle).constraints.swappedAway).toEqual(['ez-bar-curl']);
  expect(handle.store.getSnapshot().lastingSwaps.map((swap) => swap.from)).toEqual(['ez-bar-curl']);
  handle.store.startWorkout();
  expect(session(handle).status).toBe('active');
}

function expectPutBack(handle: Handle) {
  expect(session(handle).status).toBe('preview');
  expect(handle.store.getSnapshot().lastingSwaps).toEqual([]);
  // On e779122: "... dumbbell-curl x3 @RIR 1/1/1 ...", and the list still ["ez-bar-curl"].
  expect(ids(handle), lifts(handle)).toContain('ez-bar-curl');
  expect(session(handle).constraints.swappedAway ?? []).toEqual([]);
}

describe('a kept swap stopped while the workout is under way or finished', () => {
  it('brings its lift back once the workout is discarded', async () => {
    const handle = await lifter();
    await keptAndStarted(handle);
    await handle.store.stopLastingSwap('ez-bar-curl');
    handle.store.discardWorkout();
    expectPutBack(handle);
  });

  it('brings its lift back after the workout is saved with nothing logged', async () => {
    const handle = await lifter();
    await keptAndStarted(handle);
    await handle.store.stopLastingSwap('ez-bar-curl');
    await handle.store.finishWorkout(null);
    handle.store.dismissCompletion();
    expectPutBack(handle);
  });

  it('brings its lift back when stopped on the completion screen', async () => {
    const handle = await lifter();
    await keptAndStarted(handle);
    await handle.store.finishWorkout(null);
    await handle.store.stopLastingSwap('ez-bar-curl');
    handle.store.dismissCompletion();
    expectPutBack(handle);
  });

  it('as it comes back when stopped on a plan not yet started', async () => {
    const handle = await lifter();
    const curl = allEntries(session(handle).workout.blocks).find(
      (entry) => entry.exerciseId === 'ez-bar-curl',
    );
    expect((await handle.store.swapExercise(curl!.id, 'cable-curl', true))?.ok).toBe(true);
    await handle.store.stopLastingSwap('ez-bar-curl');
    expectPutBack(handle);
  });
});
