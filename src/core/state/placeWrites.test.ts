import { describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 30: a place is written one change at a time, its deletion too, so Settings' Weights
 * row and its gym switch, side by side on one screen, never undo each other. A weights save read
 * before the place went can never write it back.
 */

const PLATES = { kind: 'plates' as const, perSide: [45, 25] };

async function withGym() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

async function placesOnDisk(handle: Awaited<ReturnType<typeof withGym>>) {
  const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
  await reopened.store.hydrate();
  return reopened.store.getSnapshot().locations.map((place) => place.id);
}

describe('a place’s weights and its deletion at once', () => {
  it('a weights save, then the deletion: the place stays gone', async () => {
    const handle = await withGym();
    // The save's write held up a moment, as a slow disk would: the deletion, made just after it,
    // must still land after it, not between its read and its write.
    const store = handle.store as unknown as { getDatabase: () => Promise<unknown> };
    const database = store.getDatabase.bind(handle.store);
    let calls = 0;
    vi.spyOn(store, 'getDatabase').mockImplementation(async () => {
      calls += 1;
      if (calls === 2) await new Promise((resolve) => setTimeout(resolve, 50));
      return database();
    });
    const save = handle.store.saveLoadings('gym', { plates: PLATES });
    const gone = handle.store.deleteLocation('gym');
    await Promise.allSettled([save, gone]);
    expect(handle.store.getSnapshot().locations.map((place) => place.id)).not.toContain('gym');
    expect(await placesOnDisk(handle)).not.toContain('gym');
  });

  it('the deletion, then a weights save: the save is refused and the place stays gone', async () => {
    const handle = await withGym();
    await handle.store.deleteLocation('gym');
    await expect(handle.store.saveLoadings('gym', { plates: PLATES })).rejects.toThrow(
      'That place is no longer saved.',
    );
    expect(await placesOnDisk(handle)).not.toContain('gym');
  });

  it('a weights save, then setup run again without the Gym: the Gym stays gone', async () => {
    const handle = await withGym();
    // The save's write held up a moment, as a slow disk would: setup, finished just after it,
    // removes the Gym only once the save has landed, so the save never writes it back.
    const store = handle.store as unknown as { getDatabase: () => Promise<unknown> };
    const database = store.getDatabase.bind(handle.store);
    let calls = 0;
    vi.spyOn(store, 'getDatabase').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) await new Promise((resolve) => setTimeout(resolve, 50));
      return database();
    });
    const profile = handle.store.getSnapshot().profile!;
    const save = handle.store.saveLoadings('gym', { plates: PLATES });
    const setup = handle.store.completeOnboarding(
      profile,
      createDefaultLocations({ gymAccess: false }, TEST_NOW),
    );
    await Promise.allSettled([save, setup]);
    await expect(setup).resolves.toBe('saved');
    expect(handle.store.getSnapshot().locations.map((place) => place.id)).not.toContain('gym');
    expect(await placesOnDisk(handle)).not.toContain('gym');
  });

  it('a refused write never holds up the next', async () => {
    const handle = await withGym();
    await handle.store.deleteLocation('gym');
    await handle.store.saveLoadings('gym', { plates: PLATES }).catch(() => undefined);
    await handle.store.saveLoadings('home', { plates: PLATES });
    expect(
      handle.store.getSnapshot().locations.find((place) => place.id === 'home')?.loading.plates,
    ).toEqual(PLATES);
  });
});
