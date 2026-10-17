import { describe, expect, it } from 'vitest';
import { lastingSwapsRecord, type LastingSwap } from '../../engine/planning/lastingSwaps';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import { createDefaultLocations, createLocation } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * Maintenance 30, the ninth re-check of round L: keeping the plan's own pick ends a swap back that
 * covers it, and a swap back never covers a favourite. With the leg-press calf raise a favourite and
 * a swap kept from the calf machine back to the standing calf raise, the lifter swaps the favourite
 * for the bodyweight raise for four weeks, then keeps the favourite again: that ends their swap of it
 * and leaves the swap back from the calf machine. It ended both, so the Plan tab lost "Standing Calf
 * Raise in place of Standing Calf Raise Machine" and the calf machine came back at a place with no
 * leg press. Synthetic data only.
 */
const DAY = 86_400_000;
const CALF = 'standing-calf-raise';
const MACHINE = 'standing-calf-raise-machine';
const PRESS_CALF = 'leg-press-calf-raise';

/** The gym, with these swaps kept a day ago, and a calf focus so the plan is a lower day. */
async function gymKeeping(swaps: { from: string; to: string }[], preferred: string[]) {
  let current = Date.parse(TEST_NOW);
  const now = () => new Date(current).toISOString();
  const handle = createTestStore({ now });
  await handle.store.hydrate();
  const profile = createDefaultProfile(TEST_NOW);
  await handle.store.completeOnboarding(
    {
      ...profile,
      bodyweight: 185,
      exercisePreferences: { ...profile.exercisePreferences, preferred },
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  await handle.store.setCurrentLocation('gym');
  const kept: LastingSwap[] = swaps.map((swap) => ({
    ...swap,
    setAt: new Date(current - DAY).toISOString(),
    until: new Date(current + 27 * DAY).toISOString(),
  }));
  const db = await handle.store.getDatabase();
  await db.put('meta', lastingSwapsRecord(kept));
  await handle.store.hydrate();
  await handle.store.setCoachFocus('calves');
  const nextDay = () => {
    current += DAY;
    handle.store.refreshSession();
  };
  return { handle, nextDay };
}

const calfEntry = (handle: TestStoreHandle): WorkoutEntry | undefined =>
  allEntries(handle.store.getSnapshot().session!.workout.blocks).find((entry) =>
    [CALF, MACHINE, PRESS_CALF].includes(entry.exerciseId),
  );

/** What the Plan tab lists: each swap kept, as from>to. */
const keptSwaps = (handle: TestStoreHandle) =>
  handle.store.getSnapshot().lastingSwaps.map((swap) => `${swap.from}>${swap.to}`);

/** A place with a calf machine and no leg press, made the current one. */
async function goToHotelGym(handle: TestStoreHandle) {
  const hotel = createLocation(
    { name: 'Hotel gym', kind: 'travel', equipment: ['calf-raise-machine', 'dumbbells'] },
    TEST_NOW,
  );
  await handle.store.saveLocation(hotel);
  await handle.store.setCurrentLocation(hotel.id);
}

/** The favourite planned, swapped for the bodyweight raise for four weeks, then kept again. */
async function swapThenKeepFavourite(handle: TestStoreHandle, nextDay: () => void) {
  const own = calfEntry(handle)!;
  // The eighth re-check: the swap back from the calf machine leaves the favourite alone.
  expect([own.exerciseId, own.standsFor]).toEqual([PRESS_CALF, undefined]);
  await handle.store.swapExercise(own.id, CALF, true);
  nextDay();
  const swapped = calfEntry(handle)!;
  expect([swapped.exerciseId, swapped.standsFor]).toEqual([CALF, PRESS_CALF]);
  expect(handle.store.getSnapshot().session!.workout.explanation.reasons).toContain(
    'Standing Calf Raise in place of Leg Press Calf Raise, the swap you chose to keep.',
  );
  // The swap sheet: "Keep it for the next 4 weeks", then Use on the leg-press calf raise.
  await handle.store.swapExercise(swapped.id, PRESS_CALF, true);
  nextDay();
}

describe('keeping a favourite, the plan’s own pick, on an entry the lifter’s own swap put in', () => {
  it('ends the lifter’s swap of it (baseline, Maintenance 22)', async () => {
    const { handle, nextDay } = await gymKeeping(
      [{ from: MACHINE, to: CALF }],
      ['Leg Press Calf Raise'],
    );
    await swapThenKeepFavourite(handle, nextDay);
    expect(calfEntry(handle)?.exerciseId).toBe(PRESS_CALF);
    expect(keptSwaps(handle)).not.toContain(`${PRESS_CALF}>${CALF}`);
  });

  it('the swap back from the calf machine puts the bodyweight raise in with no leg press (baseline)', async () => {
    const { handle } = await gymKeeping([{ from: MACHINE, to: CALF }], ['Leg Press Calf Raise']);
    await goToHotelGym(handle);
    const calf = calfEntry(handle)!;
    expect([calf.exerciseId, calf.standsFor]).toEqual([CALF, MACHINE]);
  });

  it('leaves the swap back from the calf machine, which never stood for the favourite', async () => {
    const { handle, nextDay } = await gymKeeping(
      [{ from: MACHINE, to: CALF }],
      ['Leg Press Calf Raise'],
    );
    await swapThenKeepFavourite(handle, nextDay);
    // The Plan tab still lists "Standing Calf Raise in place of Standing Calf Raise Machine".
    expect(keptSwaps(handle)).toEqual([`${MACHINE}>${CALF}`]);
    // And where there is no leg press, the bodyweight raise stays in for the calf machine.
    await goToHotelGym(handle);
    const calf = calfEntry(handle)!;
    expect([calf.exerciseId, calf.standsFor]).toEqual([CALF, MACHINE]);
  });
});
