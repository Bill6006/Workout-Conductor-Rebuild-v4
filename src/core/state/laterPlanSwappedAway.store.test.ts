import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twenty-first review of round M, on the eighteenth pass's day's list of lifts swapped away
 * (`swappedAway`) where it meets a later plan the same day (`ensureSession`: a workout from another
 * device lands, so the plan is made again), which the seventeenth to twentieth passes taught to
 * keep the day's other marks ("`ensureSession` carries the whole list [of plans emptied] into every
 * later plan the same day"; the full session taken).
 *
 * The rules: "A lift the lifter swaps away stays away for the day (`swappedAway`): no change picks
 * it by itself, as a slot's own pick, a lasting swap's swap-in, the lift to push or the day's
 * extra" (the eighteenth pass); and the known limit on a layout made again: "the lifts the lifter
 * turned away today stay away". The twentieth pass kept the list through the preview made again
 * (`rebuildPreview`) for the same reason.
 *
 * What happens: `ensureSession` builds the later plan with the day's marks of plans emptied and the
 * full session taken, but not the day's list: the generator gets no `awayIds`, and the new
 * session's constraints carry no `swappedAway`. The lift the lifter swapped away is its slot's own
 * pick again, and the list is gone for every later change that day.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule
 * does not tick, at the gym, the catch-up has the EZ-bar curl. The lifter swaps it for the cable
 * curl (not kept): the list holds the EZ-bar curl. An old workout from another device lands (twenty
 * days ago, the offer the same) and the store reads the log again: the catch-up has the EZ-bar curl
 * again, and the list is empty. The same with the full session taken: the barbell row swapped for
 * the seated cable row comes back.
 *
 * Also fails on 0fe4cb9 (since the eighteenth pass).
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

/** A workout from another device lands, twenty days old: the offer stays the same. */
async function anotherDevice(handle: Handle) {
  const db = await handle.store.getDatabase();
  const when = daysBefore(20);
  await db.put('workouts', {
    ...record(0, 'back-squat', [[5, 200, 2]], [4, 6], 2),
    id: 'w-elsewhere',
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
}

async function swap(handle: Handle, from: string, to: string) {
  const entry = allEntries(session(handle).workout.blocks).find(
    (candidate) => candidate.exerciseId === from,
  );
  expect(entry, ids(handle).join(', ')).toBeDefined();
  expect((await handle.store.swapExercise(entry!.id, to))?.ok).toBe(true);
  expect(session(handle).constraints.swappedAway).toContain(from);
}

describe('a lift swapped away today, through a later plan the same day', () => {
  it('stays away from the catch-up', async () => {
    const handle = await lifter();
    expect(session(handle).workout.templateId).toBe('catch-up');
    await swap(handle, 'ez-bar-curl', 'cable-curl');
    const offer = session(handle).constraints.catchUp;
    await anotherDevice(handle);
    expect(session(handle).constraints.catchUp).toEqual(offer);
    // On 333f1d4 and 0fe4cb9: the EZ-bar curl back in its slot, and the list empty.
    expect(ids(handle)).not.toContain('ez-bar-curl');
    expect(session(handle).constraints.swappedAway ?? []).toContain('ez-bar-curl');
  });

  it('stays away from the full session taken', async () => {
    const handle = await lifter();
    await handle.store.setFullSession(true);
    expect(session(handle).constraints.fullSession).toBe(true);
    await swap(handle, 'barbell-row', 'seated-cable-row');
    await anotherDevice(handle);
    expect(session(handle).constraints.fullSession).toBe(true);
    // On 333f1d4 and 0fe4cb9: the barbell row back, and the list empty.
    expect(ids(handle)).not.toContain('barbell-row');
    expect(session(handle).constraints.swappedAway ?? []).toContain('barbell-row');
  });
});
