import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudClient } from '../cloud/model';
import { createFakeCloud } from '../../test/fakeCloud';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { openDatabase } from '../storage/indexedDb';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { AppStore } from './appStore';

const stores: AppStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.stopCloud();
});

describe('removing the token while a sync is in flight', () => {
  it('stays off: the attempt that finishes afterwards does not switch the cloud copy back on', async () => {
    const cloud = createFakeCloud();
    let hold = false;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The same client, except that while `hold` is set every call waits at the gate.
    const held = new Proxy(cloud.client, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property);
        if (typeof value !== 'function') return value;
        return async (...args: unknown[]) => {
          if (hold) await gate;
          return (value as (...inner: unknown[]) => unknown).apply(target, args);
        };
      },
    }) as CloudClient;
    const factory = new IDBFactory();
    const { store } = createTestStore({
      factory,
      openDb: () => openDatabase({ factory, name: 'wc-cloud-race', now: () => TEST_NOW }),
      cloudClient: async () => held,
      isOnline: () => true,
    });
    stores.push(store);
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await store.setCloudCredentials({ token: 'test-token' });
    await store.syncNow();
    expect(store.getSnapshot().cloud.configured).toBe(true);

    hold = true;
    const running = store.syncNow();
    await vi.waitFor(() => expect(store.getSnapshot().cloud.syncing).toBe(true));
    await store.clearCloudToken();
    expect(store.getSnapshot().cloud).toMatchObject({ configured: false, syncing: false });

    release();
    await running;
    expect(store.getSnapshot().cloud).toMatchObject({
      configured: false,
      syncing: false,
      notice: null,
    });
  });
});
