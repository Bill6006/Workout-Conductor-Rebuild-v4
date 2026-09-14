import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createFakeCloud, type FakeCloud } from '../../test/fakeCloud';
import { readCloudState } from '../cloud/cloudSync';
import { CLOUD_TOKEN_ID } from '../cloud/model';
import { TOKEN_MIRROR_KEY } from '../cloud/tokenVault';
import { openDatabase, type Database } from '../storage/indexedDb';
import { createMemoryStorage, type KeyValueStorage } from '../storage/localSettings';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { AppStore } from './appStore';

/**
 * The whole recovery path through the store, the way it failed on the phone:
 * a finished workout pushed to the cloud copy, then the device's own record of
 * it and the token gone from the database without a trace, and the app opened
 * again. The cloud row must come back to the device and never be touched.
 */

const NAME = 'wc-recovery-test';
const TOKEN = 'recovery-token-never-real';
const WORKOUT = {
  id: 'w-20260914003913',
  startedAt: '2026-09-14T00:39:13.007Z',
  completedAt: '2026-09-14T01:10:00.000Z',
  locationId: null,
  templateId: null,
  entries: [
    {
      exerciseId: 'barbell-curl',
      sets: [{ kind: 'working', reps: 8, weight: 20, rir: 2, completed: true }],
    },
  ],
};

const stores: AppStore[] = [];

/** A store on a shared fake database and shared local storage: a new one is a reload. */
function storeOn(cloud: FakeCloud, factory: IDBFactory, storage: KeyValueStorage) {
  const handle = createTestStore({
    factory,
    storage,
    openDb: () => openDatabase({ factory, name: NAME, now: () => TEST_NOW }),
    cloudClient: async () => cloud.client,
    isOnline: () => true,
  });
  stores.push(handle.store);
  return handle.store;
}

/** A second connection to the same database, to change records behind the app's back. */
function sideDoor(factory: IDBFactory): Promise<Database> {
  return openDatabase({ factory, name: NAME, now: () => TEST_NOW });
}

async function onboardWithWorkout(store: AppStore, side: Database): Promise<void> {
  await store.hydrate();
  await store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  // Written the way the app writes a finished workout: the record and its queue entry together.
  await side.put('workouts', WORKOUT);
  await store.hydrate();
  expect(store.getSnapshot().history).toHaveLength(1);
}

function cloudWorkout(cloud: FakeCloud) {
  return cloud.ours().find((row) => row.store === 'workouts' && row.id === WORKOUT.id);
}

/**
 * Saves the token and pushes, then syncs once more so the cursor sits past the
 * pushed row, the way it did on the phone after a day of routine syncs. A
 * later routine pull therefore cannot see the row; only a restart or a full
 * walk can.
 */
async function connectAndSettle(store: AppStore, side: Database, cloud: FakeCloud) {
  await store.setCloudToken(TOKEN);
  await store.flushPendingWork();
  const pushed = cloudWorkout(cloud);
  expect(pushed).toMatchObject({ deleted: 0, device_id: store.getSnapshot().cloud.deviceId });
  expect(store.getSnapshot().cloud.pending).toBe(0);
  await store.syncNow({ pull: true });
  expect((await readCloudState(side)).cursor).toBe(pushed?.synced_at);
  return pushed;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.stopCloud();
});

describe('recovering a device from its own cloud copy', () => {
  it('a database that lost the token and a workout gets both back, and the cloud row is untouched', async () => {
    const cloud = createFakeCloud();
    const factory = new IDBFactory();
    const storage = createMemoryStorage();
    const side = await sideDoor(factory);
    const first = storeOn(cloud, factory, storage);
    await onboardWithWorkout(first, side);
    const pushed = await connectAndSettle(first, side, cloud);

    // The loss: the record and the database copy of the token go, with no tombstone.
    await side.applyRemoteDelete('workouts', WORKOUT.id);
    await side.delete('cloud', CLOUD_TOKEN_ID);
    first.stopCloud();

    // The app opens again on the same device.
    const second = storeOn(cloud, factory, storage);
    await second.hydrate();
    const opened = second.getSnapshot();
    expect(opened.history).toHaveLength(0);
    expect(opened.cloud.configured).toBe(true);
    expect(opened.cloud.notice).toMatchObject({ kind: 'restored' });
    expect(opened.cloud.notice?.detail).toMatch(/database copy of the token was missing/);

    // Its first sync walks everything and brings the workout home without pushing anything.
    const outcome = await second.syncNow({ pull: true });
    expect(outcome).toMatchObject({ ran: true, applied: 1, removed: 0, error: null });
    const recovered = second.getSnapshot();
    expect(recovered.history).toHaveLength(1);
    expect(recovered.history[0]?.id).toBe(WORKOUT.id);
    expect(recovered.cloud.pending).toBe(0);
    expect(cloudWorkout(cloud)).toEqual(pushed);
    // Nothing in the diagnostic carries the token; the log names the layer.
    const diagnostic = await second.storageDiagnostic();
    expect(JSON.stringify(diagnostic)).not.toContain(TOKEN);
    expect(diagnostic.tokenLog.map((event) => event.kind)).toEqual(['saved', 'restored']);
    side.close();
  });

  it('with the token intact, the automatic sync cannot see an old row but Sync now walks everything', async () => {
    const cloud = createFakeCloud();
    const factory = new IDBFactory();
    const storage = createMemoryStorage();
    const side = await sideDoor(factory);
    const store = storeOn(cloud, factory, storage);
    await onboardWithWorkout(store, side);
    const pushed = await connectAndSettle(store, side, cloud);

    await side.applyRemoteDelete('workouts', WORKOUT.id);
    await store.hydrate();
    expect(store.getSnapshot().history).toHaveLength(0);

    // The row sits behind the cursor: a routine sync walks only what is new.
    expect(await store.syncNow({ pull: true })).toMatchObject({ ran: true, applied: 0 });
    expect(store.getSnapshot().history).toHaveLength(0);

    // The button walks the whole history.
    expect(await store.syncNow({ pull: true, force: true, full: true })).toMatchObject({
      ran: true,
      applied: 1,
    });
    expect(store.getSnapshot().history).toHaveLength(1);
    expect(cloudWorkout(cloud)).toEqual(pushed);
    side.close();
  });

  it('both copies gone: the card says the token went missing, and pasting it again restores the history', async () => {
    const cloud = createFakeCloud();
    const factory = new IDBFactory();
    const storage = createMemoryStorage();
    const side = await sideDoor(factory);
    const first = storeOn(cloud, factory, storage);
    await onboardWithWorkout(first, side);
    const pushed = await connectAndSettle(first, side, cloud);

    await side.applyRemoteDelete('workouts', WORKOUT.id);
    await side.delete('cloud', CLOUD_TOKEN_ID);
    storage.removeItem(TOKEN_MIRROR_KEY);
    first.stopCloud();

    const second = storeOn(cloud, factory, storage);
    await second.hydrate();
    const opened = second.getSnapshot().cloud;
    expect(opened.configured).toBe(false);
    expect(opened.notice).toMatchObject({ kind: 'missing', lastSeenAt: TEST_NOW });
    expect(opened.notice?.detail).toMatch(/missing from both/);
    // Without a token nothing touches the network.
    const calls = cloud.calls();
    expect(await second.syncNow({ pull: true })).toBeNull();
    expect(cloud.calls()).toBe(calls);

    await second.setCloudToken(TOKEN);
    await second.flushPendingWork();
    const restored = second.getSnapshot();
    expect(restored.cloud).toMatchObject({ configured: true, pending: 0, notice: null });
    expect(restored.history).toHaveLength(1);
    expect(cloudWorkout(cloud)).toEqual(pushed);
    expect(cloud.ours().every((row) => row.deleted === 0)).toBe(true);
    side.close();
  });
});
