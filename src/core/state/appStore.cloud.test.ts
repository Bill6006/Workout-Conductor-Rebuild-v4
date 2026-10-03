import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCloudState } from '../../core/cloud/cloudSync';
import { CLOUD_APP, DEFAULT_CLOUD_URL } from '../../core/cloud/model';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createFakeCloud, type FakeCloud } from '../../test/fakeCloud';
import { openDatabase, type Identified } from '../storage/indexedDb';
import { createMemoryStorage } from '../storage/localSettings';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { CLOUD_OFFLINE, type AppStore } from './appStore';

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
    expect(state.cloud).toMatchObject({
      url: DEFAULT_CLOUD_URL,
      configured: false,
      syncing: false,
    });
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

  it('leaves no failed attempt behind once the token is removed, reopened or not (Maintenance 25)', async () => {
    const cloud = createFakeCloud();
    const handle = storeWith(cloud);
    await onboard(handle.store);
    await handle.store.setCloudToken('test-token');
    await handle.store.flushPendingWork();
    cloud.fail(1);
    await handle.store.saveProfile({ ...handle.store.getSnapshot().profile!, units: 'kg' });
    await handle.store.syncNow({ pull: false, force: true });
    expect(handle.store.getSnapshot().cloud.lastError).not.toBeNull();

    await handle.store.clearCloudToken();
    expect(handle.store.getSnapshot().cloud).toMatchObject({ configured: false, lastError: null });
    // Nothing of the failure stays on the device either: no error, count or wait for a token
    // saved later to find.
    expect(await readCloudState(await handle.store.getDatabase())).toMatchObject({
      lastError: null,
      failures: 0,
      nextAttemptAt: null,
    });
    // Opened again, the error from before the removal does not come back.
    const reopened = storeWith(cloud, { factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(reopened.store.getSnapshot().cloud).toMatchObject({
      configured: false,
      lastError: null,
    });
  });

  it('reads an old error as a wait when it opens offline with a token (Maintenance 25)', async () => {
    const cloud = createFakeCloud();
    const handle = storeWith(cloud);
    await onboard(handle.store);
    await handle.store.setCloudToken('test-token');
    await handle.store.flushPendingWork();
    const db = await handle.store.getDatabase();
    const state = (await db.get<Identified & Record<string, unknown>>('cloud', 'state')) ?? {
      id: 'state',
    };
    await db.put('cloud', { ...state, lastError: 'Failed to fetch', failures: 1 });
    const offline = storeWith(cloud, {
      factory: handle.factory,
      storage: handle.storage,
      online: false,
    });
    await offline.store.hydrate();
    expect(offline.store.getSnapshot().cloud).toMatchObject({
      configured: true,
      lastError: CLOUD_OFFLINE,
    });
  });

  it('reads no error kept from before for a copy with no token', async () => {
    const cloud = createFakeCloud();
    const handle = storeWith(cloud);
    await onboard(handle.store);
    const db = await handle.store.getDatabase();
    // A device whose token went before this round's fix: its last error is still on disk.
    await db.put('cloud', { id: 'state', cursor: null, lastError: 'Failed to fetch', failures: 3 });
    await handle.store.hydrate();
    expect(handle.store.getSnapshot().cloud).toMatchObject({ configured: false, lastError: null });
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

  it('keeps a setup link’s failure through a read and a sync, and clears it with the token removed or saved (the third review)', async () => {
    const cloud = createFakeCloud();
    const handle = storeWith(cloud);
    await onboard(handle.store);
    handle.store.noteSetupLinkFailure('Could not reach that database: Failed to fetch');
    await handle.store.hydrate();
    await handle.store.syncNow();
    expect(handle.store.getSnapshot().cloud.linkError).toBe(
      'Could not reach that database: Failed to fetch',
    );
    await handle.store.clearCloudToken();
    expect(handle.store.getSnapshot().cloud.linkError).toBeNull();
    handle.store.noteSetupLinkFailure('Connect to the internet to set up a different database.');
    await handle.store.setCloudToken('test-token');
    await handle.store.flushPendingWork();
    expect(handle.store.getSnapshot().cloud.linkError).toBeNull();
  });

  /** A copy whose requests wait while `held` says so: the sync under way stays under way. */
  function heldCopy(cloud: FakeCloud) {
    const hold: { on: boolean; reached: number; release: () => void } = {
      on: true,
      reached: 0,
      release: () => undefined,
    };
    let opened = new Promise<void>((resolve) => {
      hold.release = () => {
        hold.on = false;
        resolve();
      };
    });
    const client = {
      ...cloud.client,
      execute: async (statement: Parameters<typeof cloud.client.execute>[0]) => {
        if (hold.on) {
          hold.reached += 1;
          await opened;
        }
        return cloud.client.execute(statement);
      },
    };
    const arm = () => {
      hold.on = true;
      opened = new Promise<void>((resolve) => {
        hold.release = () => {
          hold.on = false;
          resolve();
        };
      });
    };
    return { copy: { ...cloud, client }, hold, arm };
  }

  it('lets a request that joins a queued sync add what it asks for: Sync now still walks (seventh re-check)', async () => {
    const cloud = createFakeCloud();
    const { copy, hold, arm } = heldCopy(cloud);
    hold.release();
    const handle = storeWith(copy);
    await onboard(handle.store);
    await handle.store.setCloudToken('test-token');
    await handle.store.flushPendingWork();
    // A pull after the push: the cursor is past this phone's own rows now.
    await handle.store.syncNow({ pull: true });
    expect((await readCloudState(await handle.store.getDatabase())).cursor).toBe(TEST_NOW);
    // Another device's workout, filed before this phone's cursor: only a walk from the start
    // finds it.
    cloud.seed({
      store: 'workouts',
      id: 'w-other',
      device_id: 'other-phone',
      updated_at: '2026-09-01T08:00:00.000Z',
      synced_at: '2026-09-01T08:00:00.000Z',
      body: JSON.stringify({ id: 'w-other', startedAt: '2026-09-30T07:00:00.000Z' }),
    });
    arm();
    const first = handle.store.syncNow({ pull: false });
    await vi.waitFor(() => expect(hold.reached).toBeGreaterThan(0));
    const queued = handle.store.syncNow({ pull: false });
    const walk = handle.store.syncNow({ pull: true, full: true });
    expect(walk).toBe(queued);
    hold.release();
    await first;
    await walk;
    const db = await handle.store.getDatabase();
    expect(await db.get('workouts', 'w-other')).toBeDefined();
  });

  it('runs a sync asked for after Finish after setup, so it sends what setup saved (seventh re-check)', async () => {
    const cloud = createFakeCloud();
    const { copy, hold, arm } = heldCopy(cloud);
    hold.release();
    const handle = storeWith(copy);
    await onboard(handle.store);
    await handle.store.setCloudToken('test-token');
    await handle.store.flushPendingWork();
    arm();
    const first = handle.store.syncNow({ pull: false });
    await vi.waitFor(() => expect(hold.reached).toBeGreaterThan(0));
    const queued = handle.store.syncNow({ pull: false });
    const setup = handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), units: 'kg' },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const later = handle.store.syncNow({ pull: false });
    expect(later).not.toBe(queued);
    hold.release();
    await Promise.all([first, queued]);
    expect(await setup).toBe('saved');
    expect((await later)?.pushed).toBeGreaterThan(0);
  });
});
