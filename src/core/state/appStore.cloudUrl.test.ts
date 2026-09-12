import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { CLOUD_APP, DEFAULT_CLOUD_URL } from '../../core/cloud/model';
import { createFakeCloud, type FakeCloud } from '../../test/fakeCloud';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { openDatabase } from '../storage/indexedDb';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { CloudOccupiedError, type AppStore } from './appStore';

const OTHER = 'libsql://life-record-p1-bill6006.aws-us-east-1.turso.io';
const stores: AppStore[] = [];

function storeWith(cloud: FakeCloud, options: { online?: boolean } = {}) {
  const factory = new IDBFactory();
  const handle = createTestStore({
    factory,
    openDb: () => openDatabase({ factory, name: 'wc-cloud-url-test', now: () => TEST_NOW }),
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

describe('one database per person', () => {
  it('saves a different database, re-seeds the whole history to it, and remembers it across a reload', async () => {
    const cloud = createFakeCloud();
    const handle = storeWith(cloud);
    await onboard(handle.store);
    expect(handle.store.getSnapshot().cloud.url).toBe(DEFAULT_CLOUD_URL);

    await handle.store.setCloudCredentials({ url: OTHER, token: 'tok' });
    await handle.store.flushPendingWork();
    expect(handle.store.getSnapshot().cloud).toMatchObject({ url: OTHER, configured: true });
    // Everything local was queued and sent, not only what changes next.
    const sent = cloud.ours();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.some((row) => row.store === 'profile')).toBe(true);
    expect(sent.every((row) => row.app === CLOUD_APP)).toBe(true);
    expect(handle.store.getSnapshot().cloud.pending).toBe(0);

    const reopened = createTestStore({
      factory: handle.factory,
      storage: handle.storage,
      openDb: () =>
        openDatabase({ factory: handle.factory, name: 'wc-cloud-url-test', now: () => TEST_NOW }),
      cloudClient: async () => cloud.client,
    });
    stores.push(reopened.store);
    await reopened.store.hydrate();
    expect(reopened.store.getSnapshot().cloud.url).toBe(OTHER);
  });

  it('refuses a database that has no tables, and one that already holds another person', async () => {
    const bare = createFakeCloud();
    bare.setTables([]);
    const first = storeWith(bare);
    await onboard(first.store);
    await expect(first.store.setCloudCredentials({ url: OTHER, token: 'tok' })).rejects.toThrow(
      /no records or devices table yet/,
    );
    expect(first.store.getSnapshot().cloud).toMatchObject({
      url: DEFAULT_CLOUD_URL,
      configured: false,
    });

    const taken = createFakeCloud();
    taken.seed({ store: 'workouts', id: 'w-1', device_id: 'someone-else' });
    const second = storeWith(taken);
    await onboard(second.store);
    await expect(second.store.setCloudCredentials({ url: OTHER, token: 'tok' })).rejects.toThrow(
      CloudOccupiedError,
    );
    expect(second.store.getSnapshot().cloud.configured).toBe(false);

    // The same save goes ahead once it is deliberately accepted.
    await second.store.setCloudCredentials({ url: OTHER, token: 'tok', acceptExisting: true });
    expect(second.store.getSnapshot().cloud).toMatchObject({ url: OTHER, configured: true });
  });

  it('rejects an address that is not a database, and will not adopt a new one offline', async () => {
    const cloud = createFakeCloud();
    const handle = storeWith(cloud, { online: false });
    await onboard(handle.store);
    await expect(
      handle.store.setCloudCredentials({ url: 'not a url', token: 'tok' }),
    ).rejects.toThrow(/does not look right/);
    await expect(handle.store.setCloudCredentials({ url: OTHER, token: 'tok' })).rejects.toThrow(
      /Connect to the internet/,
    );
    // A token for the database it already uses still saves, and syncs later.
    await handle.store.setCloudCredentials({ token: 'tok' });
    expect(handle.store.getSnapshot().cloud).toMatchObject({
      url: DEFAULT_CLOUD_URL,
      configured: true,
    });
    expect(cloud.calls()).toBe(0);
  });
});
