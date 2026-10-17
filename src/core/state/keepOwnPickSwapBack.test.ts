import { describe, expect, it } from 'vitest';
import { lastingSwapsRecord, type LastingSwap } from '../../engine/planning/lastingSwaps';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * Maintenance 30, the eighth re-check of round L: keeping the plan's own pick ends a kept swap of it
 * (Maintenance 22), a swap back that covers it too. At the gym, with a kept swap from the calf machine
 * back to the standing calf raise, the plan puts the bodyweight raise in for the leg-press calf raise
 * ("the swap you chose to keep"); keeping the leg-press calf raise on that entry for four weeks ends
 * the swap back, and the next lower day plans the leg-press calf raise. It put the bodyweight raise
 * back in: the store ended only a swap from the leg-press calf raise itself. Synthetic data only.
 */
const DAY = 86_400_000;
const CALF = 'standing-calf-raise';
const MACHINE = 'standing-calf-raise-machine';
const PRESS_CALF = 'leg-press-calf-raise';

/** The gym, with these swaps kept a day ago, and a calf focus so the plan is a lower day. */
async function gymKeeping(swaps: { from: string; to: string }[]) {
  let current = Date.parse(TEST_NOW);
  const now = () => new Date(current).toISOString();
  const handle = createTestStore({ now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
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

describe('keeping the plan’s own pick on an entry a kept swap put in', () => {
  it('ends a swap kept from the leg-press calf raise (baseline, Maintenance 22)', async () => {
    const { handle, nextDay } = await gymKeeping([{ from: PRESS_CALF, to: CALF }]);
    const calf = calfEntry(handle)!;
    expect([calf.exerciseId, calf.standsFor]).toEqual([CALF, PRESS_CALF]);
    await handle.store.swapExercise(calf.id, PRESS_CALF, true);
    nextDay();
    expect(calfEntry(handle)?.exerciseId).toBe(PRESS_CALF);
  });

  it('ends the swap back from the calf machine that put the bodyweight raise in for it', async () => {
    const { handle, nextDay } = await gymKeeping([{ from: MACHINE, to: CALF }]);
    const calf = calfEntry(handle)!;
    // The seventh pass: the swap back stands for the leg-press calf raise too, and says so.
    expect([calf.exerciseId, calf.standsFor]).toEqual([CALF, PRESS_CALF]);
    expect(handle.store.getSnapshot().session!.workout.explanation.reasons).toContain(
      'Standing Calf Raise in place of Leg Press Calf Raise, the swap you chose to keep.',
    );
    // The swap sheet: "Keep it for the next 4 weeks", then Use on the leg-press calf raise.
    await handle.store.swapExercise(calf.id, PRESS_CALF, true);
    nextDay();
    // Not the bodyweight raise again, "in place of Leg Press Calf Raise, the swap you chose to keep".
    expect(calfEntry(handle)?.exerciseId).toBe(PRESS_CALF);
  });
});
