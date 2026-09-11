import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { CLOUD_APP, CLOUD_URL } from '../../core/cloud/model';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createFakeCloud, type FakeCloud } from '../../test/fakeCloud';
import { openDatabase, type Identified } from '../storage/indexedDb';
import { createMemoryStorage } from '../storage/localSettings';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { AppStore } from './appStore';

const stores: AppStore[] = [];

function storeWith(
  cloud: FakeCloud,
  options: {
    factory?: IDBFactory;
    online?: boolean;
    storage?: ReturnType<typeof createMemoryStorage>;
  } = {},
) {
  const factory = options.factory ?? new IDBFactory();
  const handle = createTestStore({
    factory,
    // An undefined storage would override the helper's memory storage with the real one.
    ...(options.storage ? { storage: options.storage } : {}),
    openDb: () => openDatabase({ factory, name: 'wc-cloud-test', now: () => TEST_NOW }),
    cloudClient: async () => cloud.client,
    isOnline: () => options.online ?? true,
  });
  stores.push(handle.store);
  return handle;
}

async function onboard(store: AppStore) {
  await store.hydrate();
  await store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
}

afterEach(() => {
  for (const store of stores.splice(0)) store.stopCloud();
});

describe('cloud copy in the store', () => {
  it('is off without a token: writes queue locally and nothing touches the network', async () => {
    const cloud = createFakeCloud();
    const handle = storeWith(cloud);
    await onboard(handle.store);
    const state = handle.store.getSnapshot();
    expect(state.cloud).toMatchObject({ url: CLOUD_URL, configured: false, syncing: false });
    expect(state.cloud.deviceId).toBeTruthy();
    expect(state.cloud.pending).toBeGreaterThan(0);
    expect(await handle.store.syncNow()).toBeNull();
    expect(handle.store.startCloud()).toBe(false);
    expect(cloud.calls()).toBe(0);
  });

  it('saves the token on the device, drains the outbox, survives a reload, and turns off again cleanly', async () => {
    const cloud = createFakeCloud();
    const handle = storeWith(cloud);
    await onboard(handle.store);

    await handle.store.setCloudToken('  test-token  ');
    await handle.store.flushPendingWork();
    const synced = handle.store.getSnapshot().cloud;
    expect(synced).toMatchObject({ configured: true, pending: 0, lastError: null, syncing: false });
    expect(synced.lastSyncAt).toBe(TEST_NOW);
    const ours = cloud.ours();
    expect(ours.some((row) => row.store === 'profile' && row.id === 'current')).toBe(true);
    expect(ours.some((row) => row.store === 'locations')).toBe(true);
    expect(ours.every((row) => row.app === CLOUD_APP)).toBe(true);
    expect(ours.every((row) => row.device_id === synced.deviceId)).toBe(true);
    expect(cloud.devices.size).toBe(1);

    const db = await handle.store.getDatabase();
    expect(await db.get<Identified & { value: string }>('cloud', 'token')).toMatchObject({
      value: 'test-token',
    });

    // A later write pushes on the next sync, and the token is still there after a reload.
    await handle.store.saveProfile({ ...handle.store.getSnapshot().profile!, units: 'kg' });
    expect(handle.store.getSnapshot().cloud.pending).toBeGreaterThan(0);
    await handle.store.syncNow({ pull: false });
    expect(handle.store.getSnapshot().cloud.pending).toBe(0);
    expect(cloud.ours().find((row) => row.store === 'profile')?.body).toContain('"units":"kg"');

    const reopened = storeWith(cloud, { factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(reopened.store.getSnapshot().cloud).toMatchObject({
      configured: true,
      lastSyncAt: TEST_NOW,
      deviceId: synced.deviceId,
    });

    const before = cloud.calls();
    await handle.store.clearCloudToken();
    expect(handle.store.getSnapshot().cloud.configured).toBe(false);
    await handle.store.saveProfile({ ...handle.store.getSnapshot().profile!, units: 'lb' });
    expect(await handle.store.syncNow()).toBeNull();
    expect(cloud.calls()).toBe(before);
    expect(handle.store.getSnapshot().cloud.pending).toBeGreaterThan(0);
  });

  it('keeps the device id out of exports and never restores one from a backup', async () => {
    const cloud = createFakeCloud();
    const handle = storeWith(cloud);
    await onboard(handle.store);
    const backup = await handle.store.createBackup({ version: '0', commit: 'test' });
    expect(backup.data.localSettings.deviceId).toBeNull();
    expect(
      handle.store.createSettingsExport({ version: '0', commit: 'test' }).localSettings.deviceId,
    ).toBeNull();
    expect(handle.store.getSnapshot().cloud.deviceId).toBeTruthy();
  });

  it('a fresh install with the token restores everything on the first pull', async () => {
    const cloud = createFakeCloud();
    const phone = storeWith(cloud);
    await onboard(phone.store);
    await phone.store.setCloudToken('test-token');
    await phone.store.flushPendingWork();
    const profileOnPhone = phone.store.getSnapshot().profile!;

    const tablet = storeWith(cloud, { storage: createMemoryStorage() });
    await onboard(tablet.store);
    expect(tablet.store.getSnapshot().cloud.deviceId).not.toBe(
      phone.store.getSnapshot().cloud.deviceId,
    );
    await tablet.store.setCloudToken('test-token');
    await tablet.store.flushPendingWork();
    const restored = tablet.store.getSnapshot();
    expect(restored.profile?.updatedAt).toBe(profileOnPhone.updatedAt);
    expect(restored.locations.map((location) => location.id).sort()).toEqual(
      phone.store
        .getSnapshot()
        .locations.map((location) => location.id)
        .sort(),
    );
    expect(restored.cloud).toMatchObject({ configured: true, pending: 0, lastError: null });
    // The tablet's own default profile was not pushed over the phone's.
    expect(cloud.ours().find((row) => row.store === 'profile')?.device_id).toBe(
      phone.store.getSnapshot().cloud.deviceId,
    );
  });

  it('queues while offline and reports it without reaching the network', async () => {
    const cloud = createFakeCloud();
    const handle = storeWith(cloud, { online: false });
    await onboard(handle.store);
    await handle.store.setCloudToken('test-token');
    await handle.store.flushPendingWork();
    const state = handle.store.getSnapshot().cloud;
    expect(state.configured).toBe(true);
    expect(state.pending).toBeGreaterThan(0);
    expect(state.lastError).toMatch(/Offline/);
    expect(cloud.calls()).toBe(0);
  });
});
