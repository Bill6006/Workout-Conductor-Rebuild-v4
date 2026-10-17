import { describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { setupBase } from './setupBase';

/**
 * Maintenance 30, the fifth re-check of round L: setup reads what it began from, checks it ("setup
 * writes only over the very data it began from") and writes, all in one turn of the place writes. A
 * weights save under way when Finish is tapped lands first, so setup sees the Gym changed since it
 * began and writes nothing, never putting the Gym it began from over the save's weights. With the
 * check made before that turn, setup said 'saved' and the weights were gone. Synthetic data only.
 */

const PLATES = { kind: 'plates' as const, perSide: [45, 25] };

/** A clock that moves on with every reading, as a phone's does between two writes. */
function ticking(): () => string {
  let at = Date.parse(TEST_NOW);
  return () => {
    at += 1000;
    return new Date(at).toISOString();
  };
}

async function gymAndSetupOpen() {
  const now = ticking();
  const handle = createTestStore({ now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  // Setup run again from Settings: the screen fixes what it began from, and its draft is the
  // profile and the places as shown, the Gym kept.
  const { profile, locations } = handle.store.getSnapshot();
  const base = setupBase(profile, locations);
  const finish = () =>
    handle.store.completeOnboarding({ ...profile!, updatedAt: now() }, structuredClone(locations), {
      base,
    });
  return { handle, finish };
}

async function gymOnDisk(handle: Awaited<ReturnType<typeof gymAndSetupOpen>>['handle']) {
  const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
  await reopened.store.hydrate();
  return reopened.store.getSnapshot().locations.find((place) => place.id === 'gym');
}

describe('a weights save and setup run again, the Gym kept', () => {
  it('a save landed while setup was open: setup refuses, and the weights stay (baseline)', async () => {
    const { handle, finish } = await gymAndSetupOpen();
    await handle.store.saveLoadings('gym', { plates: PLATES });
    await expect(finish()).resolves.toBe('restored');
    expect((await gymOnDisk(handle))?.loading.plates).toEqual(PLATES);
  });

  it('a save still under way at Finish: the weights stay (setup never writes over it)', async () => {
    const { handle, finish } = await gymAndSetupOpen();
    // The save's write held up a moment, as a slow disk would, so it is under way at Finish.
    const store = handle.store as unknown as { getDatabase: () => Promise<unknown> };
    const database = store.getDatabase.bind(handle.store);
    let calls = 0;
    vi.spyOn(store, 'getDatabase').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) await new Promise((resolve) => setTimeout(resolve, 50));
      return database();
    });
    const save = handle.store.saveLoadings('gym', { plates: PLATES });
    const setup = finish();
    await Promise.allSettled([save, setup]);
    await expect(save).resolves.toBeUndefined();
    // Setup began from the Gym before the save: it may refuse ('restored') or keep the save's
    // weights, never put its older Gym over them.
    expect((await gymOnDisk(handle))?.loading.plates).toEqual(PLATES);
    expect(
      handle.store.getSnapshot().locations.find((place) => place.id === 'gym')?.loading.plates,
    ).toEqual(PLATES);
  });
});
