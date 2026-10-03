import { render } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeCloud, type FakeCloud } from '../../test/fakeCloud';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import type { CloudClient } from '../cloud/model';
import { readDatabaseBirth } from '../cloud/cloudSync';
import { URL_MIRROR_KEY } from '../cloud/tokenVault';
import { openDatabase, type OutboxEntry } from '../storage/indexedDb';
import {
  ONBOARDING_DRAFT_KEY,
  createMemoryStorage,
  type KeyValueStorage,
} from '../storage/localSettings';
import { GYM_LOCATION_ID, createDefaultLocations } from '../validation/location';
import { barcodeIdFor, type PickedBarcode, type PlaceBarcode } from '../validation/placeBarcode';
import { createDefaultProfile } from '../validation/profile';
import type { AppStore, AppStoreOptions } from './appStore';
import { BARCODE_MIRROR_KEY, MIRROR_PICTURE_MAX, readBarcodeMirror } from './barcodeMirror';
import { SetupInterruptedError, setupBase } from './setupBase';

/**
 * Maintenance 25, the owner's report: a saved gym barcode had to be added again before workouts
 * while the app said nothing was waiting. Chrome had cleared the phone's database, where the
 * barcode lived alone, and kept local storage; the cloud copy brought back everything else. These
 * tests save, then open the app again on the same phone: as it is, with its database cleared, and
 * with the cloud copy on. Every picture and code here is synthetic.
 */

const NAME = 'wc-persistence-test';
const CODE = { format: 'code_128', value: 'SYNTH-0002' } as const;
const PICKED: PickedBarcode = {
  image: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,U1lOVEhFVElDLTAwMDI=' },
  code: CODE,
};
const BIG: PickedBarcode = {
  image: {
    mimeType: 'image/png',
    dataUrl: `data:image/png;base64,${'A'.repeat(MIRROR_PICTURE_MAX + 10)}`,
  },
  code: CODE,
};
const SMALLER = { mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,U01BTExFUg==' };
const TOKEN = 'persistence-token-never-real';

/** A clock a second further on at each call: what was written before a clearing is older. */
function ticking(): () => string {
  let at = Date.parse(TEST_NOW);
  return () => new Date((at += 1000)).toISOString();
}

interface Phone {
  factory: IDBFactory;
  storage: KeyValueStorage;
  now: () => string;
  cloud?: FakeCloud;
  online?: () => boolean;
  client?: () => CloudClient;
}

function phone(extra: Partial<Phone> = {}): Phone {
  return { factory: new IDBFactory(), storage: createMemoryStorage(), now: ticking(), ...extra };
}

const opened: AppStore[] = [];
afterEach(() => {
  for (const store of opened.splice(0)) store.stopCloud();
});

/** The app opened on this phone; a second call is the app opened again. */
function open(on: Phone, extra: Partial<AppStoreOptions> = {}): AppStore {
  const { store } = createTestStore({
    factory: on.factory,
    storage: on.storage,
    now: on.now,
    openDb: () => openDatabase({ factory: on.factory, name: NAME, now: on.now }),
    ...(on.cloud
      ? {
          cloudClient: async () => on.client?.() ?? on.cloud!.client,
          isOnline: on.online ?? (() => true),
        }
      : {}),
    ...extra,
  });
  opened.push(store);
  return store;
}

async function setUp(store: AppStore, units: 'lb' | 'kg' = 'lb'): Promise<void> {
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
}

/** What Chrome did on the phone: the whole database gone, local storage kept. */
async function clearDatabase(on: Phone, store: AppStore): Promise<void> {
  store.stopCloud();
  await store.flushPendingWork();
  (await store.getDatabase()).close();
  await new Promise<void>((resolve, reject) => {
    const request = on.factory.deleteDatabase(NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('not deleted'));
    request.onblocked = () => reject(new Error('the database was still open'));
  });
}

describe('a saved gym barcode stays saved', () => {
  it('is read from the database when the app opens again, at its place, with its switch', async () => {
    const on = phone();
    const first = open(on);
    await setUp(first);
    await first.saveBarcode(GYM_LOCATION_ID, PICKED);
    await first.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    await first.setBarcodeAutoShow(GYM_LOCATION_ID, true);
    const saved = first.getSnapshot().barcodes[0]!;
    first.stopCloud();

    // Even with its second copy gone, the database alone brings it back.
    on.storage.removeItem(BARCODE_MIRROR_KEY);
    const second = open(on);
    await second.hydrate();
    expect(second.getSnapshot().barcodes).toEqual([saved]);
    expect(second.getSnapshot().restoredBarcodes).toEqual([]);
    second.startWorkout();
    expect(second.getSnapshot().barcodeSheet).toBe(GYM_LOCATION_ID);
    // And the second copy is written again from the database.
    expect(readBarcodeMirror(on.storage)).toEqual([saved]);
  });

  it('comes back from its second copy when the browser clears the database, once', async () => {
    const on = phone();
    const first = open(on);
    await setUp(first);
    await first.saveBarcode(GYM_LOCATION_ID, PICKED);
    await first.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    const saved = first.getSnapshot().barcodes[0]!;
    await clearDatabase(on, first);

    const second = open(on);
    await second.hydrate();
    // The picture, the code, the switch, the place and the times, all as saved.
    expect(second.getSnapshot().barcodes).toEqual([saved]);
    expect(second.getSnapshot().restoredBarcodes).toEqual([saved.id]);
    expect(await (await second.getDatabase()).get('device', saved.id)).toEqual(saved);

    // Opened again: still one barcode, nothing brought back twice.
    second.stopCloud();
    const third = open(on);
    await third.hydrate();
    expect(third.getSnapshot().barcodes).toEqual([saved]);
    expect(third.getSnapshot().restoredBarcodes).toEqual([]);
    expect(await (await third.getDatabase()).count('device')).toBe(1);
  });

  it('keeps a smaller copy of a big picture, and with none brings back the code to draw', async () => {
    const shrink = vi.fn(async () => SMALLER);
    const on = phone();
    const first = open(on, { shrinkPicture: shrink });
    await setUp(first);
    await first.saveBarcode(GYM_LOCATION_ID, BIG);
    await first.flushPendingWork();
    expect(shrink).toHaveBeenCalledTimes(1);
    expect(readBarcodeMirror(on.storage)[0]?.image).toEqual(SMALLER);
    await clearDatabase(on, first);
    const second = open(on, { shrinkPicture: shrink });
    await second.hydrate();
    expect(second.getSnapshot().barcodes[0]).toMatchObject({ image: SMALLER, code: CODE });

    // Where no smaller copy can be made, the second copy keeps the code and stays small.
    const bare = phone();
    const third = open(bare);
    await setUp(third);
    await third.saveBarcode(GYM_LOCATION_ID, BIG);
    expect(readBarcodeMirror(bare.storage)[0]).toMatchObject({ code: CODE });
    expect(readBarcodeMirror(bare.storage)[0]?.image).toBeUndefined();
    expect(bare.storage.getItem(BARCODE_MIRROR_KEY)!.length).toBeLessThan(1000);
    await clearDatabase(bare, third);
    const fourth = open(bare);
    await fourth.hydrate();
    const back = fourth.getSnapshot().barcodes[0];
    expect(back?.code).toEqual(CODE);
    expect(back?.image).toBeUndefined();
  });

  it('stays gone once removed, or once its place is deleted, after the database is cleared', async () => {
    const on = phone();
    const first = open(on);
    await setUp(first);
    await first.saveBarcode(GYM_LOCATION_ID, PICKED);
    await first.removeBarcode(GYM_LOCATION_ID);
    expect(readBarcodeMirror(on.storage)).toEqual([]);
    await clearDatabase(on, first);
    const second = open(on);
    await second.hydrate();
    expect(second.getSnapshot().barcodes).toEqual([]);

    const other = phone();
    const third = open(other);
    await setUp(third);
    await third.saveBarcode(GYM_LOCATION_ID, PICKED);
    await third.deleteLocation(GYM_LOCATION_ID);
    expect(readBarcodeMirror(other.storage)).toEqual([]);
    await clearDatabase(other, third);
    const fourth = open(other);
    await fourth.hydrate();
    expect(fourth.getSnapshot().barcodes).toEqual([]);
  });

  it('stays on screen when a reload that read before the save finishes after it', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store);
    const db = await store.getDatabase();
    const getAll = db.getAll.bind(db);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let read = false;
    const spy = vi.spyOn(db, 'getAll').mockImplementation(async (name) => {
      const result = await getAll(name);
      if (name === 'device') {
        read = true;
        await gate;
      }
      return result as never;
    });
    const reload = store.hydrate();
    await vi.waitFor(() => expect(read).toBe(true));
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    release();
    await reload;
    spy.mockRestore();
    expect(store.getSnapshot().barcodes.map((barcode) => barcode.id)).toEqual([
      barcodeIdFor(GYM_LOCATION_ID),
    ]);
    expect(readBarcodeMirror(on.storage).map((barcode) => barcode.id)).toEqual([
      barcodeIdFor(GYM_LOCATION_ID),
    ]);
  });
});

/**
 * Holds reads of one table, after they have read, until let go: from the nth read of it on (the
 * first by default), so a test can hold the reload at the read it chooses.
 */
function holdAt(
  db: Awaited<ReturnType<AppStore['getDatabase']>>,
  method: 'getAll' | 'count',
  store: string,
  nth = 1,
) {
  const real = db[method].bind(db) as (name: string) => Promise<unknown>;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached = false;
  let reads = 0;
  const spy = vi.spyOn(db, method).mockImplementation((async (name: string) => {
    const result = await real(name);
    if (name === store && ++reads >= nth) {
      reached = true;
      await gate;
    }
    return result;
  }) as never);
  return { reached: () => reached, release, restore: () => spy.mockRestore() };
}

/** Whichever comes first: the work settling, or a tenth of a second. */
async function settledOrWaited(work: Promise<unknown>): Promise<void> {
  await Promise.race([
    work.then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 100)),
  ]);
}

describe('a reload racing a barcode change', () => {
  it('never writes a removed barcode back into its second copy', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store);
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    const held = holdAt(await store.getDatabase(), 'getAll', 'device');
    const reload = store.hydrate();
    await vi.waitFor(() => expect(held.reached()).toBe(true));
    await store.removeBarcode(GYM_LOCATION_ID);
    held.release();
    await reload;
    held.restore();
    expect(store.getSnapshot().barcodes).toEqual([]);
    expect(readBarcodeMirror(on.storage)).toEqual([]);
    // And so a cleared database cannot bring it back.
    await clearDatabase(on, store);
    const again = open(on);
    await again.hydrate();
    expect(again.getSnapshot().barcodes).toEqual([]);
  });

  it('keeps a big picture saved while a reload runs, never the second copy’s code in its place', async () => {
    // The tenth review's re-check: the reload took a barcode saved after its first read for one
    // the database had lost, and wrote the second copy's entry (the code alone, for a picture too
    // big to keep there) over the saved picture.
    const on = phone();
    const store = open(on);
    await setUp(store);
    const held = holdAt(await store.getDatabase(), 'getAll', 'device');
    const reload = store.hydrate();
    await vi.waitFor(() => expect(held.reached()).toBe(true));
    await store.saveBarcode(GYM_LOCATION_ID, BIG);
    held.release();
    await reload;
    held.restore();
    await store.flushPendingWork();
    const stored = await (
      await store.getDatabase()
    ).get<PlaceBarcode>('device', barcodeIdFor(GYM_LOCATION_ID));
    expect(stored?.image?.dataUrl).toBe(BIG.image.dataUrl);
  });

  it('never writes back into the second copy a barcode removed while the reload keeps it', async () => {
    // Held at the reload's own read of the database, inside its upkeep of the second copy: a
    // removal waits for it, never runs between that read and the write it makes from it.
    const on = phone();
    const store = open(on);
    await setUp(store);
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    const held = holdAt(await store.getDatabase(), 'getAll', 'device', 2);
    const reload = store.hydrate();
    await vi.waitFor(() => expect(held.reached()).toBe(true));
    const removal = store.removeBarcode(GYM_LOCATION_ID);
    await settledOrWaited(removal);
    held.release();
    await Promise.all([reload, removal]);
    held.restore();
    expect(readBarcodeMirror(on.storage)).toEqual([]);
    expect(await (await store.getDatabase()).count('device')).toBe(0);
  });

  it('keeps a barcode saved while the reload finishes its last reads', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store);
    const held = holdAt(await store.getDatabase(), 'count', 'outbox');
    const reload = store.hydrate();
    await vi.waitFor(() => expect(held.reached()).toBe(true));
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    held.release();
    await reload;
    held.restore();
    expect(store.getSnapshot().barcodes.map((barcode) => barcode.id)).toEqual([
      barcodeIdFor(GYM_LOCATION_ID),
    ]);
  });
});

describe('a phone whose database the browser cleared, with the cloud copy on', () => {
  async function connected(on: Phone, units: 'lb' | 'kg' = 'lb'): Promise<AppStore> {
    const first = open(on);
    await setUp(first, units);
    const gym = first.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)!;
    await first.saveLocation({ ...gym, notes: 'Rack 3 has the good bar' });
    await first.saveBarcode(GYM_LOCATION_ID, PICKED);
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    return first;
  }

  /** The profile and the Gym as the cloud copy holds them. */
  function heldInCloud(cloud: FakeCloud) {
    return cloud
      .ours()
      .filter(
        (row) =>
          (row.store === 'profile' && row.id === 'current') ||
          (row.store === 'locations' && row.id === GYM_LOCATION_ID),
      )
      .map((row) => `${row.store}|${row.updated_at}|${row.body}`);
  }

  it('gets its places back from the cloud copy and its barcode from the phone, which the cloud never holds', async () => {
    const cloud = createFakeCloud();
    const on = phone({ cloud });
    const first = await connected(on);
    await clearDatabase(on, first);

    const second = open(on);
    await second.hydrate();
    // Before anything is pulled the barcode is already back; the places follow from the copy.
    expect(second.getSnapshot().barcodes.map((barcode) => barcode.locationId)).toEqual([
      GYM_LOCATION_ID,
    ]);
    expect(second.getSnapshot().profile).toBeNull();
    await second.syncNow({ pull: true });
    expect(second.getSnapshot().locations.map((place) => place.id)).toContain(GYM_LOCATION_ID);
    second.startWorkout();
    expect(second.getSnapshot().barcodeSheet).toBe(GYM_LOCATION_ID);
    expect(cloud.ours().some((row) => row.store === 'device')).toBe(false);
    expect(JSON.stringify(cloud.ours())).not.toContain(CODE.value);
  });

  it('never lets setup made before its first pull overwrite the cloud copy: the history comes back over it', async () => {
    const cloud = createFakeCloud();
    let online = true;
    const on = phone({ cloud, online: () => online });
    const first = await connected(on, 'kg');
    const before = heldInCloud(cloud);
    await clearDatabase(on, first);

    // Opened offline after the clearing, set up again with the defaults before anything is pulled.
    online = false;
    const second = open(on);
    await setUp(second, 'lb');
    expect(second.getSnapshot().profile?.units).toBe('lb');
    online = true;
    // The push a save starts on its own.
    const outcome = await second.syncNow({ pull: false });
    expect(outcome?.error).toBeNull();
    expect(heldInCloud(cloud)).toEqual(before);
    expect(second.getSnapshot().profile?.units).toBe('kg');
    expect(
      second.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)?.notes,
    ).toBe('Rack 3 has the good bar');
    expect(second.getSnapshot().cloud.pending).toBe(0);
  });

  it('lets a change made in the middle of the first walk give way to what the walk brought back', async () => {
    const cloud = createFakeCloud();
    const on = phone({ cloud });
    const first = open(on);
    await setUp(first, 'kg');
    await first.saveLocation({
      ...first.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)!,
      id: 'loc-work',
      name: 'Work gym',
    });
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    const before = JSON.stringify(
      cloud.ours().map((row) => [row.store, row.id, row.deleted, row.updated_at]),
    );
    await clearDatabase(on, first);

    // A profile saved just after the walk has brought back the first place (the tenth review; setup
    // itself now waits for the walk, below).
    let second: AppStore | null = null;
    let setupDone = false;
    second = open(on, {
      openDb: async () => {
        const db = await openDatabase({ factory: on.factory, name: NAME, now: on.now });
        const applyRemote = db.applyRemote.bind(db);
        db.applyRemote = async (store, value) => {
          await applyRemote(store, value);
          if (store === 'locations' && !setupDone) {
            setupDone = true;
            await second!.saveProfile({
              ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
              units: 'lb',
            });
          }
        };
        return db;
      },
    });
    await second.hydrate();
    await second.syncNow({ pull: true });
    expect(setupDone).toBe(true);
    await second.hydrate();
    // The cloud copy is as it was, and the phone holds it: kg, and the place setup left out.
    expect(
      JSON.stringify(cloud.ours().map((row) => [row.store, row.id, row.deleted, row.updated_at])),
    ).toBe(before);
    expect(second.getSnapshot().profile?.units).toBe('kg');
    expect(second.getSnapshot().locations.map((place) => place.id)).toContain('loc-work');
    expect(second.getSnapshot().cloud.pending).toBe(0);
  });

  it('never removes the barcode of a place the first walk brought back when setup is finished during it (third re-check)', async () => {
    const cloud = createFakeCloud();
    const on = phone({ cloud });
    const first = open(on);
    await setUp(first);
    await first.saveLocation({
      ...first.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)!,
      id: 'loc-work',
      name: 'Work gym',
    });
    await first.saveBarcode('loc-work', PICKED);
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    await clearDatabase(on, first);

    // "Set up anyway", finished just after the walk has brought the work gym back: setup waits
    // for the walk (the fifth re-check), then finds the profile back and changes nothing.
    let second: AppStore | null = null;
    let setup: Promise<'saved' | 'restored'> | null = null;
    second = open(on, {
      openDb: async () => {
        const db = await openDatabase({ factory: on.factory, name: NAME, now: on.now });
        const applyRemote = db.applyRemote.bind(db);
        db.applyRemote = async (store, value) => {
          await applyRemote(store, value);
          if (store === 'locations' && value?.id === 'loc-work' && !setup) {
            setup = second!.completeOnboarding(
              createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
              createDefaultLocations({ gymAccess: true }, TEST_NOW),
            );
          }
        };
        return db;
      },
    });
    await second.hydrate();
    expect(second.getSnapshot().barcodes.map((barcode) => barcode.locationId)).toEqual([
      'loc-work',
    ]);
    await second.syncNow({ pull: true });
    expect(setup).not.toBeNull();
    expect(await setup).toBe('restored');
    await second.hydrate();
    expect(second.getSnapshot().locations.map((place) => place.id)).toContain('loc-work');
    expect(
      await (await second.getDatabase()).get('device', barcodeIdFor('loc-work')),
    ).toBeDefined();
    expect(readBarcodeMirror(on.storage).map((barcode) => barcode.locationId)).toEqual([
      'loc-work',
    ]);
  });

  it('never removes the Gym’s barcode when setup turns gym access off before the first walk is done (fourth re-check)', async () => {
    const cloud = createFakeCloud();
    let online = true;
    const on = phone({ cloud, online: () => online });
    const first = open(on);
    await setUp(first);
    await first.saveBarcode(GYM_LOCATION_ID, PICKED);
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    await clearDatabase(on, first);

    // Offline: the walk cannot run. The barcode is back from the second copy.
    online = false;
    const second = open(on);
    await second.hydrate();
    expect(second.getSnapshot().barcodes.map((barcode) => barcode.locationId)).toEqual([
      GYM_LOCATION_ID,
    ]);
    // "Set up anyway" with the defaults, then setup again with gym access off.
    second.skipRestoring();
    await second.completeOnboarding(
      createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await second.completeOnboarding(
      createDefaultProfile(TEST_NOW, 'home'),
      createDefaultLocations({ gymAccess: false }, TEST_NOW),
    );
    // The barcode may be the owner's own, which the cloud copy never holds: it stays.
    expect(
      await (await second.getDatabase()).get('device', barcodeIdFor(GYM_LOCATION_ID)),
    ).toBeDefined();
    expect(readBarcodeMirror(on.storage).map((barcode) => barcode.locationId)).toEqual([
      GYM_LOCATION_ID,
    ]);
    second.stopCloud();
  });

  it('never deletes a place while the first walk after a clearing is pending (fifth re-check)', async () => {
    const cloud = createFakeCloud();
    let online = true;
    const on = phone({ cloud, online: () => online });
    const first = open(on);
    await setUp(first);
    await first.saveBarcode(GYM_LOCATION_ID, PICKED);
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    await clearDatabase(on, first);
    online = false;
    const second = open(on);
    await second.hydrate();
    second.skipRestoring();
    await second.completeOnboarding(
      createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await expect(second.deleteLocation(GYM_LOCATION_ID)).rejects.toThrow(/still coming back/);
    const db = await second.getDatabase();
    expect(await db.get('locations', GYM_LOCATION_ID)).toBeDefined();
    expect(await db.get('device', barcodeIdFor(GYM_LOCATION_ID))).toBeDefined();
    second.stopCloud();
  });

  it('shows what the walk brought back even when the push after it fails (fifth re-check)', async () => {
    const cloud = createFakeCloud();
    let online = true;
    let refusePush = false;
    const client = {
      ...cloud.client,
      batch: async (statements: Parameters<typeof cloud.client.batch>[0]) => {
        if (refusePush) throw new Error('the copy refused the push');
        return cloud.client.batch(statements);
      },
    };
    const on = phone({ cloud, online: () => online, client: () => client });
    const first = open(on);
    await setUp(first, 'kg');
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    await clearDatabase(on, first);

    // "Set up anyway" offline, in pounds; then the walk, whose push is refused.
    online = false;
    const second = open(on);
    await second.hydrate();
    second.skipRestoring();
    await second.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'lb' },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    expect(second.getSnapshot().profile?.units).toBe('lb');
    online = true;
    refusePush = true;
    await second.syncNow({ pull: true, force: true });
    expect(second.getSnapshot().profile?.units).toBe('kg');
    second.stopCloud();
  });

  it('shows what a walk brought back though the token was removed while it ran (fifth re-check)', async () => {
    const cloud = createFakeCloud();
    let online = true;
    const on = phone({ cloud, online: () => online });
    const first = open(on);
    await setUp(first, 'kg');
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    await clearDatabase(on, first);

    online = false;
    let removed: Promise<void> | null = null;
    let second: AppStore | null = null;
    second = open(on, {
      openDb: async () => {
        const db = await openDatabase({ factory: on.factory, name: NAME, now: on.now });
        const applyRemote = db.applyRemote.bind(db);
        db.applyRemote = async (store, value) => {
          await applyRemote(store, value);
          // The token is removed while the walk runs: no sync follows to show what came.
          if (store === 'profile' && !removed) removed = second!.clearCloudToken();
        };
        return db;
      },
    });
    await second.hydrate();
    second.skipRestoring();
    await second.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'lb' },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    online = true;
    await second.syncNow({ pull: true, force: true });
    expect(removed).not.toBeNull();
    await removed;
    expect(second.getSnapshot().profile?.units).toBe('kg');
  });

  it('shows another window’s walk at its next sync, though that sync brings nothing new (fifth re-check)', async () => {
    const cloud = createFakeCloud();
    const on = phone({ cloud });
    const first = open(on);
    await setUp(first, 'kg');
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    await clearDatabase(on, first);

    // Two windows open on the cleared phone; A walks the cloud copy.
    const a = open(on);
    const b = open(on);
    await a.hydrate();
    await b.hydrate();
    expect(b.getSnapshot()).toMatchObject({ profile: null, restoring: true });
    await a.syncNow({ pull: true, force: true });
    expect(a.getSnapshot().profile?.units).toBe('kg');
    // B's sync finds every record already on disk, and still shows them.
    const outcome = await b.syncNow({ pull: true, force: true });
    expect(outcome?.applied).toBe(0);
    expect(b.getSnapshot()).toMatchObject({ restoring: false, profile: { units: 'kg' } });
    // And a later sync with nothing new does not reload again.
    const hydrate = vi.spyOn(b, 'hydrate');
    await b.syncNow({ pull: true, force: true });
    expect(hydrate).not.toHaveBeenCalled();
    a.stopCloud();
    b.stopCloud();
  });

  it('runs setup in turn with the syncs: a walk never ends between its check and its writes (fifth re-check)', async () => {
    const cloud = createFakeCloud();
    let online = true;
    const on = phone({ cloud, online: () => online });
    const first = open(on);
    await setUp(first, 'kg');
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    await clearDatabase(on, first);

    online = false;
    let armed = false;
    let walk: Promise<unknown> | null = null;
    let second: AppStore | null = null;
    second = open(on, {
      openDb: async () => {
        const db = await openDatabase({ factory: on.factory, name: NAME, now: on.now });
        const getAll = db.getAll.bind(db);
        db.getAll = (async (name: Parameters<typeof getAll>[0]) => {
          const result = await getAll(name);
          if (armed && name === 'locations' && !walk) {
            // Setup has made its check and reads the places: the copy is reached now.
            online = true;
            walk = second!.syncNow({ pull: true, force: true });
            await Promise.race([walk, new Promise((resolve) => setTimeout(resolve, 200))]);
          }
          return result;
        }) as typeof db.getAll;
        return db;
      },
    });
    await second.hydrate();
    second.skipRestoring();
    armed = true;
    await second.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'lb' },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    expect(walk).not.toBeNull();
    await walk;
    await second.flushPendingWork();
    // The walk ran after setup's writes, so its rule put the copy's records back over them.
    const profileRow = cloud.ours().find((row) => row.store === 'profile');
    expect(JSON.parse(profileRow!.body!).units).toBe('kg');
    expect(second.getSnapshot().profile?.units).toBe('kg');
    second.stopCloud();
  });

  it('reloads at its next sync when a walk ends while its screen reads the disk (sixth re-check)', async () => {
    const cloud = createFakeCloud();
    const on = phone({ cloud });
    const first = open(on);
    await setUp(first, 'kg');
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    await clearDatabase(on, first);

    const a = open(on);
    await a.hydrate();
    let walk: Promise<unknown> | null = null;
    const b = open(on, {
      openDb: async () => {
        const db = await openDatabase({ factory: on.factory, name: NAME, now: on.now });
        const getAll = db.getAll.bind(db);
        db.getAll = (async (name: Parameters<typeof getAll>[0]) => {
          const result = await getAll(name);
          if (name === 'profile' && !walk) {
            // B has read the profile: A's walk ends now, before B has finished reading.
            walk = a.syncNow({ pull: true, force: true });
            await walk;
          }
          return result;
        }) as typeof db.getAll;
        return db;
      },
    });
    await b.hydrate();
    expect(walk).not.toBeNull();
    expect(a.getSnapshot().profile?.units).toBe('kg');
    expect(b.getSnapshot().profile).toBeNull();
    // B's next sync brings nothing new, and B shows what the walk brought all the same.
    const outcome = await b.syncNow({ pull: true, force: true });
    expect(outcome?.applied).toBe(0);
    expect(b.getSnapshot().profile?.units).toBe('kg');
    a.stopCloud();
    b.stopCloud();
  });

  it('pushes nothing while its first pull fails, and pulls before it pushes once it can', async () => {
    const cloud = createFakeCloud();
    let pullFails = false;
    const failing: CloudClient = {
      ...cloud.client,
      execute: async (statement) => {
        if (pullFails && statement.sql.startsWith('SELECT store, id')) {
          throw new Error('the copy did not answer');
        }
        return cloud.client.execute(statement);
      },
    };
    const on = phone({ cloud, client: () => failing });
    const first = await connected(on, 'kg');
    const before = heldInCloud(cloud);
    await clearDatabase(on, first);

    pullFails = true;
    const second = open(on);
    await setUp(second, 'lb');
    const failed = await second.syncNow({ pull: false });
    expect(failed?.error).toBe('the copy did not answer');
    expect(heldInCloud(cloud)).toEqual(before);

    pullFails = false;
    await second.syncNow({ pull: false, force: true });
    expect(heldInCloud(cloud)).toEqual(before);
    expect(second.getSnapshot().profile?.units).toBe('kg');
  });

  it('keeps the address of a database of its own', async () => {
    const cloud = createFakeCloud();
    const on = phone({ cloud });
    const first = open(on);
    await setUp(first);
    const own = 'libsql://own-database-never-real.example.turso.io';
    await first.setCloudCredentials({ token: TOKEN, url: own });
    await first.flushPendingWork();
    expect(on.storage.getItem(URL_MIRROR_KEY)).toBe(own);
    await clearDatabase(on, first);

    const second = open(on);
    await second.hydrate();
    expect(second.getSnapshot().cloud.url).toBe(own);
    expect(second.getSnapshot().cloud.configured).toBe(true);
  });
});

describe('a restore with the cloud copy on', () => {
  const APP = { version: 'test' };

  it('replaces this phone’s data, deletes nothing from the cloud copy, and takes back what changed there since', async () => {
    const cloud = createFakeCloud();
    const on = phone({ cloud });
    const store = open(on);
    await setUp(store);
    await store.setCloudToken(TOKEN);
    await store.flushPendingWork();
    const side = await openDatabase({ factory: on.factory, name: NAME, now: on.now });
    const workout = (id: string, at: string) => ({
      id,
      startedAt: at,
      completedAt: at,
      locationId: null,
      templateId: null,
      entries: [],
    });
    await side.put('workouts', workout('w-before', on.now()));
    await store.hydrate();
    await store.syncNow({ pull: true });
    const backup = await store.createBackup(APP);

    // After the backup: a workout logged and the bodyweight changed, both in the cloud copy.
    await side.put('workouts', workout('w-after', on.now()));
    await store.hydrate();
    await store.saveProfile({ ...store.getSnapshot().profile!, bodyweight: 190 });
    await store.flushPendingWork();
    await store.syncNow({ pull: true });
    expect(cloud.ours().find((row) => row.id === 'w-after')).toMatchObject({ deleted: 0 });

    await store.applyBackup(backup);
    // This phone holds the backup; nothing is queued to delete the later workout anywhere.
    expect(store.getSnapshot().history.map((record) => record.id)).toEqual(['w-before']);
    const queued = await side.getAll<OutboxEntry>('outbox');
    expect(queued.some((entry) => entry.op === 'delete')).toBe(false);

    await store.syncNow({ pull: true });
    await store.flushPendingWork();
    expect(cloud.ours().find((row) => row.id === 'w-after')).toMatchObject({ deleted: 0 });
    expect(
      store
        .getSnapshot()
        .history.map((record) => record.id)
        .sort(),
    ).toEqual(['w-after', 'w-before']);
    expect(store.getSnapshot().profile?.bodyweight).toBe(190);
    expect(store.getSnapshot().cloud.pending).toBe(0);
    side.close();
  });
});

describe('opening the app on a phone short of space', () => {
  it('opens even when a write it makes on the way fails', async () => {
    const on = phone();
    const first = open(on);
    await setUp(first);
    first.stopCloud();
    // The token's local copy alone: opening heals the database copy and restarts the pull,
    // and that write fails, as writes do on a full disk.
    on.storage.setItem('wc.v1.cloudToken', TOKEN);
    let fail = true;
    const second = open(on, {
      openDb: async () => {
        const db = await openDatabase({ factory: on.factory, name: NAME, now: on.now });
        const put = db.put.bind(db);
        db.put = async (store, value, options) => {
          if (fail && store === 'cloud' && value.id === 'state') throw new Error('disk full');
          return put(store, value, options);
        };
        return db;
      },
    });
    await second.hydrate();
    expect(second.getSnapshot().status).toBe('ready');
    expect(second.getSnapshot().profile).not.toBeNull();
    fail = false;
  });
});

describe('asking the browser to keep the app’s storage', () => {
  function stubStorage(persisted: boolean, granted: boolean) {
    const manager = {
      persisted: vi.fn(async () => persisted),
      persist: vi.fn(async () => granted),
      estimate: vi.fn(async () => ({ usage: 0, quota: 0 })),
    };
    Object.defineProperty(navigator, 'storage', { value: manager, configurable: true });
    return manager;
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'storage');
  });

  it('asks once per open when not yet kept, and never when already kept', async () => {
    const asked = stubStorage(false, true);
    const store = open(phone());
    expect(await store.ensurePersistence()).toBe(true);
    expect(await store.ensurePersistence()).toBeNull();
    expect(asked.persist).toHaveBeenCalledTimes(1);

    const kept = stubStorage(true, true);
    const other = open(phone());
    expect(await other.ensurePersistence()).toBe(true);
    expect(kept.persist).not.toHaveBeenCalled();
  });

  it('is asked by the app itself as it opens', async () => {
    const asked = stubStorage(false, true);
    const store = open(phone());
    render(
      <Providers store={store}>
        <span>open</span>
      </Providers>,
    );
    await vi.waitFor(() => expect(asked.persist).toHaveBeenCalledTimes(1));
  });
});

describe('the tenth review: the second copy, setup and two windows', () => {
  it('keeps a barcode in its second copy, and on screen, when writing it back fails at open', async () => {
    const on = phone();
    const first = open(on);
    await setUp(first);
    await first.saveBarcode(GYM_LOCATION_ID, PICKED);
    const saved = first.getSnapshot().barcodes[0]!;
    await clearDatabase(on, first);

    // The disk is full as the app opens: the write back fails.
    const full = open(on, {
      openDb: async () => {
        const db = await openDatabase({ factory: on.factory, name: NAME, now: on.now });
        const put = db.put.bind(db);
        db.put = async (store, value, options) => {
          if (store === 'device') throw new Error('QuotaExceededError');
          return put(store, value, options);
        };
        return db;
      },
    });
    await full.hydrate();
    expect(full.getSnapshot().barcodes).toEqual([saved]);
    expect(readBarcodeMirror(on.storage)).toEqual([saved]);
    full.stopCloud();
    (await full.getDatabase()).close();

    // With room again, the next open writes it back.
    const roomy = open(on);
    await roomy.hydrate();
    expect(await (await roomy.getDatabase()).get('device', saved.id)).toEqual(saved);
  });

  it('never lets a window opened before a removal bring the barcode back', async () => {
    const on = phone();
    const a = open(on);
    await setUp(a);
    const work =
      (await a.saveLocation({
        ...a.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)!,
        id: 'loc-work',
        name: 'Work gym',
      })) && 'loc-work';
    await a.saveBarcode(GYM_LOCATION_ID, PICKED);
    await a.saveBarcode(work, PICKED);
    // The browser tab, opened before the change.
    const b = open(on);
    await b.hydrate();
    await a.removeBarcode(GYM_LOCATION_ID);
    await b.setBarcodeAutoShow(work, false);
    expect(readBarcodeMirror(on.storage).map((barcode) => barcode.locationId)).toEqual([work]);
    a.stopCloud();
    await clearDatabase(on, b);
    const again = open(on);
    await again.hydrate();
    expect(again.getSnapshot().barcodes.map((barcode) => barcode.locationId)).toEqual([work]);
  });

  it('never lets a window opened before another’s save drop that barcode from the second copy', async () => {
    const on = phone();
    const a = open(on);
    await setUp(a);
    await a.saveLocation({
      ...a.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)!,
      id: 'loc-work',
      name: 'Work gym',
    });
    const b = open(on);
    await b.hydrate();
    await a.saveBarcode(GYM_LOCATION_ID, PICKED);
    await b.saveBarcode('loc-work', PICKED);
    expect(
      readBarcodeMirror(on.storage)
        .map((barcode) => barcode.locationId)
        .sort(),
    ).toEqual([GYM_LOCATION_ID, 'loc-work'].sort());
  });

  it('says a big picture with no code has no second copy, and keeps one shrunk at the next open', async () => {
    const bare: PickedBarcode = { image: BIG.image };
    const on = phone();
    const first = open(on);
    await setUp(first);
    await first.saveBarcode(GYM_LOCATION_ID, bare);
    const id = barcodeIdFor(GYM_LOCATION_ID);
    expect(first.getSnapshot().barcodeCopies[id]).toBe('none');
    expect(readBarcodeMirror(on.storage)).toEqual([]);
    first.stopCloud();
    // Opened again where a smaller copy can be made: the database's barcode decides, not a list
    // the opening has not filled yet. Held before it fills its list until the copy is kept.
    const second = open(on, { shrinkPicture: async () => SMALLER });
    const held = holdAt(await second.getDatabase(), 'count', 'outbox');
    const opening = second.hydrate();
    await vi.waitFor(() => expect(held.reached()).toBe(true));
    await vi.waitFor(() => expect(readBarcodeMirror(on.storage)[0]?.image).toEqual(SMALLER));
    held.release();
    await opening;
    held.restore();
    await second.flushPendingWork();
    // The card reads what the second copy holds as the opening sets its state.
    expect(second.getSnapshot().barcodeCopies[id]).toBe('picture');
  });

  it('keeps the smaller copy when the pop-up switch is turned', async () => {
    const on = phone();
    const store = open(on, { shrinkPicture: async () => SMALLER });
    await setUp(store);
    await store.saveBarcode(GYM_LOCATION_ID, BIG);
    await store.flushPendingWork();
    expect(readBarcodeMirror(on.storage)[0]?.image).toEqual(SMALLER);
    await store.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    expect(readBarcodeMirror(on.storage)[0]).toMatchObject({ autoShow: false, image: SMALLER });
  });

  it('refuses a removal whose second copy cannot be removed, keeping both copies', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store);
    await store.saveLocation({
      ...store.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)!,
      id: 'loc-work',
      name: 'Work gym',
    });
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    await store.saveBarcode('loc-work', PICKED);
    const setItem = on.storage.setItem.bind(on.storage);
    on.storage.setItem = (key, value) => {
      if (key === BARCODE_MIRROR_KEY) throw new DOMException('full', 'QuotaExceededError');
      setItem(key, value);
    };
    await expect(store.removeBarcode(GYM_LOCATION_ID)).rejects.toThrow(/second copy/);
    expect(
      await (await store.getDatabase()).get('device', barcodeIdFor(GYM_LOCATION_ID)),
    ).toBeDefined();
  });

  it('removes the barcode of a place that setup run again leaves out, from both copies', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store);
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW, 'home'),
      createDefaultLocations({ gymAccess: false }, TEST_NOW),
    );
    expect(store.getSnapshot().barcodes).toEqual([]);
    expect(readBarcodeMirror(on.storage)).toEqual([]);
    expect(await (await store.getDatabase()).count('device')).toBe(0);
    // And the Gym itself.
    expect(await (await store.getDatabase()).get('locations', GYM_LOCATION_ID)).toBeUndefined();
    expect(store.getSnapshot().locations.map((place) => place.id)).toEqual(['home']);
  });

  it('takes the app’s own Web Lock for every barcode change, where the browser has Web Locks', async () => {
    // Two windows of the app (the installed app and a tab) never change the barcodes at once.
    const names: string[] = [];
    const locks = {
      request: async (name: string, work: () => Promise<unknown>) => {
        names.push(name);
        return work();
      },
    };
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    try {
      const on = phone();
      const store = open(on);
      await setUp(store);
      names.length = 0;
      await store.saveBarcode(GYM_LOCATION_ID, PICKED);
      await store.setBarcodeAutoShow(GYM_LOCATION_ID, false);
      await store.hydrate();
      await store.removeBarcode(GYM_LOCATION_ID);
      expect(names).toEqual(Array(4).fill('workout-conductor-v4-barcodes'));
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });

  it('still saves a barcode when the browser refuses the Web Lock', async () => {
    const locks = {
      request: async () => {
        throw new DOMException('No locks here.', 'SecurityError');
      },
    };
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    try {
      const on = phone();
      const store = open(on);
      await setUp(store);
      await store.saveBarcode(GYM_LOCATION_ID, PICKED);
      expect(
        await (await store.getDatabase()).get('device', barcodeIdFor(GYM_LOCATION_ID)),
      ).toBeDefined();
      expect(readBarcodeMirror(on.storage)).toHaveLength(1);
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });

  it('records the database’s birth once, and an existing database as made before births', async () => {
    const on = phone();
    const first = open(on);
    await setUp(first);
    const birth = await readDatabaseBirth(await first.getDatabase());
    expect(birth.at).not.toBeNull();
    first.stopCloud();
    const second = open(on);
    await second.hydrate();
    expect(await readDatabaseBirth(await second.getDatabase())).toEqual(birth);

    // A database that already held records when births began to be recorded: nothing was lost.
    const older = phone();
    const side = await openDatabase({ factory: older.factory, name: NAME, now: older.now });
    await side.put('profile', { ...createDefaultProfile(TEST_NOW), units: 'kg' });
    side.close();
    const existing = open(older);
    await existing.hydrate();
    expect((await readDatabaseBirth(await existing.getDatabase())).at).toBeNull();
  });
});

/** A second synthetic barcode: a new picture of the same place. */
const OTHER: PickedBarcode = {
  image: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,U1lOVEhFVElDLTAwMDQ=' },
  code: { format: 'code_128', value: 'SYNTH-0004' },
};

/** Holds the store's writes to one table, before they write, until let go. */
function holdPut(db: Awaited<ReturnType<AppStore['getDatabase']>>, store: string) {
  const real = db.put.bind(db);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached = false;
  const spy = vi.spyOn(db, 'put').mockImplementation(async (name, value, options) => {
    if (name === store) {
      reached = true;
      await gate;
    }
    return real(name, value, options);
  });
  return { reached: () => reached, release, restore: () => spy.mockRestore() };
}

describe('the re-check: a barcode change decides from the barcode as stored', () => {
  const stored = async (store: AppStore) =>
    (await store.getDatabase()).get<PlaceBarcode>('device', barcodeIdFor(GYM_LOCATION_ID));

  it('never brings back an older picture when a window opened before the new one turns the switch', async () => {
    const on = phone();
    const a = open(on);
    await setUp(a);
    await a.saveBarcode(GYM_LOCATION_ID, PICKED);
    const b = open(on);
    await b.hydrate();
    await a.saveBarcode(GYM_LOCATION_ID, OTHER);
    await b.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    expect(await stored(a)).toMatchObject({ image: OTHER.image, autoShow: false });
    expect(readBarcodeMirror(on.storage)[0]).toMatchObject({ image: OTHER.image, autoShow: false });
    expect(b.getSnapshot().barcodes[0]?.image).toEqual(OTHER.image);
  });

  it('never brings back a barcode another window removed when this one turns the switch', async () => {
    const on = phone();
    const a = open(on);
    await setUp(a);
    await a.saveBarcode(GYM_LOCATION_ID, PICKED);
    const b = open(on);
    await b.hydrate();
    await a.removeBarcode(GYM_LOCATION_ID);
    await b.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    expect(await stored(a)).toBeUndefined();
    expect(readBarcodeMirror(on.storage)).toEqual([]);
    // The window's own list catches up.
    expect(b.getSnapshot().barcodes).toEqual([]);
  });

  it('keeps a new picture when the switch is turned while it is being saved', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store);
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    const held = holdPut(await store.getDatabase(), 'device');
    const replace = store.saveBarcode(GYM_LOCATION_ID, OTHER);
    await vi.waitFor(() => expect(held.reached()).toBe(true));
    const turn = store.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    held.release();
    await Promise.all([replace, turn]);
    held.restore();
    expect(await stored(store)).toMatchObject({ image: OTHER.image, autoShow: false });
    expect(store.getSnapshot().barcodes[0]).toMatchObject({ image: OTHER.image, autoShow: false });
  });

  it('keeps the switch another window turned off when this one saves a new picture', async () => {
    const on = phone();
    const a = open(on);
    await setUp(a);
    await a.saveBarcode(GYM_LOCATION_ID, PICKED);
    const b = open(on);
    await b.hydrate();
    await a.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    await b.saveBarcode(GYM_LOCATION_ID, OTHER);
    expect(await stored(a)).toMatchObject({ image: OTHER.image, autoShow: false });
  });

  it('removes the barcode another window saved when this one deletes the place', async () => {
    const on = phone();
    const a = open(on);
    await setUp(a);
    const b = open(on);
    await b.hydrate();
    await a.saveBarcode(GYM_LOCATION_ID, PICKED);
    await b.deleteLocation(GYM_LOCATION_ID);
    expect(await stored(a)).toBeUndefined();
    expect(readBarcodeMirror(on.storage)).toEqual([]);
  });

  it('keeps a place and its barcode when the barcode cannot be removed, so Delete again works (second re-check)', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store);
    await store.saveLocation({
      ...store.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)!,
      id: 'loc-work',
      name: 'Work gym',
    });
    await store.setCurrentLocation('loc-work');
    // Two barcodes: removing one rewrites the second copy, which local storage refuses.
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    await store.saveBarcode('loc-work', PICKED);
    const db = await store.getDatabase();
    const setItem = on.storage.setItem.bind(on.storage);
    let refuse = true;
    on.storage.setItem = (key, value) => {
      if (refuse && key === BARCODE_MIRROR_KEY)
        throw new DOMException('full', 'QuotaExceededError');
      setItem(key, value);
    };
    await expect(store.deleteLocation('loc-work')).rejects.toThrow(/second copy/);
    expect(store.getSnapshot().locations.map((place) => place.id)).toContain('loc-work');
    expect(await db.get('locations', 'loc-work')).toBeDefined();
    expect(await db.get('device', barcodeIdFor('loc-work'))).toBeDefined();
    expect(store.getSnapshot().profile?.currentLocationId).toBe('loc-work');
    refuse = false;
    await store.deleteLocation('loc-work');
    expect(await db.get('locations', 'loc-work')).toBeUndefined();
    expect(await db.get('device', barcodeIdFor('loc-work'))).toBeUndefined();
    expect(readBarcodeMirror(on.storage).map((barcode) => barcode.locationId)).toEqual([
      GYM_LOCATION_ID,
    ]);
    expect(store.getSnapshot().profile?.currentLocationId).toBe('home');
  });

  it('keeps the Gym setup leaves out while its barcode cannot be removed (second re-check)', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store);
    await store.saveLocation({
      ...store.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)!,
      id: 'loc-work',
      name: 'Work gym',
    });
    // Two barcodes: removing the Gym's rewrites the second copy, which local storage refuses.
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    await store.saveBarcode('loc-work', PICKED);
    const db = await store.getDatabase();
    const setItem = on.storage.setItem.bind(on.storage);
    on.storage.setItem = (key, value) => {
      if (key === BARCODE_MIRROR_KEY) throw new DOMException('full', 'QuotaExceededError');
      setItem(key, value);
    };
    await expect(
      store.completeOnboarding(
        createDefaultProfile(TEST_NOW, 'home'),
        createDefaultLocations({ gymAccess: false }, TEST_NOW),
      ),
    ).rejects.toThrow(/second copy/);
    // The Gym stays, with its barcode: setup can be run again.
    expect(await db.get('locations', GYM_LOCATION_ID)).toBeDefined();
    expect(await db.get('device', barcodeIdFor(GYM_LOCATION_ID))).toBeDefined();
  });

  it('keeps the places setup never lists, with their barcodes, as a draft saved earlier never knew them (fourth re-check)', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store);
    await store.saveLocation({
      ...store.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)!,
      id: 'loc-a',
      name: 'Place A',
    });
    await store.saveBarcode('loc-a', PICKED);
    // Setup finished from its own list: Home and the Gym only.
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await store.getDatabase();
    expect(await db.get('locations', 'loc-a')).toBeDefined();
    expect(await db.get('device', barcodeIdFor('loc-a'))).toBeDefined();
    expect(readBarcodeMirror(on.storage).map((barcode) => barcode.locationId)).toEqual(['loc-a']);
    // And the screen shows every place on disk.
    expect(store.getSnapshot().locations.map((place) => place.id)).toContain('loc-a');
  });

  it('never removes a Gym the screen did not show (fourth re-check)', async () => {
    const on = phone();
    const a = open(on);
    await a.hydrate();
    await a.completeOnboarding(
      createDefaultProfile(TEST_NOW, 'home'),
      createDefaultLocations({ gymAccess: false }, TEST_NOW),
    );
    // Window B opens with Home only; then A adds the Gym and its barcode.
    const b = open(on);
    await b.hydrate();
    await a.completeOnboarding(
      createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await a.saveBarcode(GYM_LOCATION_ID, PICKED);
    // B finishes setup with gym access off, never having shown a Gym.
    await b.completeOnboarding(
      createDefaultProfile(TEST_NOW, 'home'),
      createDefaultLocations({ gymAccess: false }, TEST_NOW),
    );
    const db = await a.getDatabase();
    expect(await db.get('locations', GYM_LOCATION_ID)).toBeDefined();
    expect(await db.get('device', barcodeIdFor(GYM_LOCATION_ID))).toBeDefined();
  });

  it('removes setup’s draft when setup finds a profile already back, so Run setup again never resumes it (fifth re-check)', async () => {
    const on = phone();
    const b = open(on);
    await b.hydrate();
    const a = open(on);
    await setUp(a, 'kg');
    on.storage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({
        step: 6,
        profile: { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'lb' },
        locations: createDefaultLocations({ gymAccess: true }, TEST_NOW),
        basedOn: null,
      }),
    );
    const outcome = await b.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'lb' },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    expect(outcome).toBe('restored');
    expect(on.storage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it('never writes setup over a profile that came back while setup was open (fourth re-check)', async () => {
    const on = phone();
    const b = open(on);
    await b.hydrate();
    expect(b.getSnapshot().profile).toBeNull();
    // Meanwhile the profile reaches the phone (another window here; the walk on a cleared phone).
    const a = open(on);
    await setUp(a, 'kg');
    const outcome = await b.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'lb' },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    expect(outcome).toBe('restored');
    const [stored] = await (await b.getDatabase()).getAll<{ id: string; units: string }>('profile');
    expect(stored?.units).toBe('kg');
    expect(b.getSnapshot().profile?.units).toBe('kg');
  });

  it('never writes setup run again over a profile that changed while it was open (sixth re-check)', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store, 'kg');
    const began = setupBase(store.getSnapshot().profile, store.getSnapshot().locations);
    on.storage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({
        step: 6,
        profile: { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'lb' },
        locations: createDefaultLocations({ gymAccess: true }, TEST_NOW),
        basedOn: began,
      }),
    );
    // While setup is open the profile changes (the cloud copy's walk, or another window), and
    // this window shows the change.
    const other = open(on);
    await other.hydrate();
    await other.saveProfile({ ...other.getSnapshot().profile!, bodyweight: 201 });
    await store.hydrate();
    const outcome = await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'lb' },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
      { base: began },
    );
    expect(outcome).toBe('restored');
    const [stored] = await (
      await store.getDatabase()
    ).getAll<{ id: string; units: string; bodyweight: number }>('profile');
    expect(stored).toMatchObject({ units: 'kg', bodyweight: 201 });
    expect(store.getSnapshot().profile).toMatchObject({ units: 'kg', bodyweight: 201 });
    expect(on.storage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it('never writes setup run again over a place that changed while it was open (sixth re-check)', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store, 'kg');
    const began = setupBase(store.getSnapshot().profile, store.getSnapshot().locations);
    const other = open(on);
    await other.hydrate();
    await other.saveLocation({
      ...other.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)!,
      name: 'Gym downtown',
    });
    await store.hydrate();
    const outcome = await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'lb' },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
      { base: began },
    );
    expect(outcome).toBe('restored');
    const db = await store.getDatabase();
    expect(await db.get('locations', GYM_LOCATION_ID)).toMatchObject({ name: 'Gym downtown' });
    const [stored] = await db.getAll<{ id: string; units: string }>('profile');
    expect(stored?.units).toBe('kg');
  });

  it('never writes a first setup over places that came back while it was open, with no readable profile (tenth re-check)', async () => {
    const on = phone();
    const store = open(on);
    await store.hydrate();
    expect(setupBase(store.getSnapshot().profile, store.getSnapshot().locations)).toBeNull();
    // While setup is open the owner's places come back, with a profile this build cannot read.
    const db = await store.getDatabase();
    const owners = createDefaultLocations({ gymAccess: true }, TEST_NOW).map((place) => ({
      ...place,
      name: `${place.name} (the owner's)`,
    }));
    for (const place of owners) await db.put('locations', place);
    await db.put('profile', { id: 'current', units: 'stone' });
    const outcome = await store.completeOnboarding(
      createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
      { base: null },
    );
    expect(outcome).toBe('restored');
    expect(await db.get('locations', 'home')).toMatchObject({ name: "Home (the owner's)" });
    expect(await db.get('locations', GYM_LOCATION_ID)).toMatchObject({ name: "Gym (the owner's)" });
  });

  it('writes nothing for an answer the profile cannot take, so Finish again goes through (eleventh re-check)', async () => {
    const on = phone();
    const store = open(on);
    await store.hydrate();
    const places = createDefaultLocations({ gymAccess: true }, TEST_NOW);
    await expect(
      store.completeOnboarding(
        { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), age: 12 },
        places,
        { base: null },
      ),
    ).rejects.toThrow();
    const db = await store.getDatabase();
    expect(await db.count('locations')).toBe(0);
    const outcome = await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), age: 30 },
      places,
      { base: null },
    );
    expect(outcome).toBe('saved');
    expect(store.getSnapshot().profile?.age).toBe(30);
  });

  it('starts again from what a setup cut off part-way wrote, so Finish again saves (eleventh re-check)', async () => {
    const on = phone();
    const store = open(on);
    await store.hydrate();
    const places = createDefaultLocations({ gymAccess: true }, TEST_NOW);
    const answers = { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'kg' as const };
    // The places are written, then the disk refuses the profile once (full).
    const saveProfile = store.saveProfile.bind(store);
    const full = vi
      .spyOn(store, 'saveProfile')
      .mockRejectedValueOnce(new Error('The phone is out of space.'))
      .mockImplementation(saveProfile);
    const failed = await store
      .completeOnboarding(answers, places, { base: null })
      .catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(SetupInterruptedError);
    const left = (failed as SetupInterruptedError).left;
    expect(left).toBe(setupBase(null, places));
    const outcome = await store.completeOnboarding(answers, places, { base: left });
    expect(outcome).toBe('saved');
    expect(store.getSnapshot().profile?.units).toBe('kg');
    expect(full).toHaveBeenCalledTimes(2);
  });

  it('never takes a place another window wrote for its own after a setup cut off part-way (twelfth re-check)', async () => {
    const on = phone();
    const first = open(on);
    await first.hydrate();
    await first.completeOnboarding(
      createDefaultProfile(TEST_NOW, 'home'),
      createDefaultLocations({ gymAccess: false }, TEST_NOW),
    );
    const gym = createDefaultLocations({ gymAccess: true }, TEST_NOW).find(
      (place) => place.id === GYM_LOCATION_ID,
    )!;
    // Window A runs setup again; while it writes its places, window B adds a Gym.
    let armed = false;
    const a = open(on, {
      openDb: async () => {
        const db = await openDatabase({ factory: on.factory, name: NAME, now: on.now });
        const put = db.put.bind(db);
        db.put = (async (store: Parameters<typeof put>[0], value: Parameters<typeof put>[1]) => {
          const result = await put(store, value);
          if (armed && store === 'locations') {
            armed = false;
            const b = open(on);
            await b.hydrate();
            await b.saveLocation(gym);
          }
          return result;
        }) as typeof db.put;
        return db;
      },
    });
    await a.hydrate();
    const began = setupBase(a.getSnapshot().profile, a.getSnapshot().locations);
    // Then A's profile write fails (the disk full).
    const saveProfile = a.saveProfile.bind(a);
    vi.spyOn(a, 'saveProfile')
      .mockRejectedValueOnce(new Error('The phone is out of space.'))
      .mockImplementation(saveProfile);
    armed = true;
    const answers = createDefaultProfile(TEST_NOW, 'home');
    const places = createDefaultLocations({ gymAccess: false }, TEST_NOW);
    const failed = await a
      .completeOnboarding(answers, places, { base: began })
      .catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(SetupInterruptedError);
    // Finish again: the Gym is window B's, not setup's own, so setup refuses and the Gym stays.
    const outcome = await a.completeOnboarding(answers, places, {
      base: (failed as SetupInterruptedError).left,
    });
    expect(outcome).toBe('restored');
    expect(await (await a.getDatabase()).get('locations', GYM_LOCATION_ID)).toBeDefined();
  });

  it('writes no place when one of setup’s places cannot be saved, so Finish again goes through (twelfth re-check)', async () => {
    const on = phone();
    const store = open(on);
    await store.hydrate();
    const places = createDefaultLocations({ gymAccess: true }, TEST_NOW);
    const broken = places.map((place) =>
      place.id === GYM_LOCATION_ID ? { ...place, equipment: [''] } : place,
    );
    await expect(
      store.completeOnboarding(createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), broken, {
        base: null,
      }),
    ).rejects.toThrow();
    expect(await (await store.getDatabase()).count('locations')).toBe(0);
    expect(
      await store.completeOnboarding(createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), places, {
        base: null,
      }),
    ).toBe('saved');
  });

  it('writes setup’s places as checked, their defaults filled in (twelfth re-check)', async () => {
    const on = phone();
    const store = open(on);
    await store.hydrate();
    const places = createDefaultLocations({ gymAccess: true }, TEST_NOW).map((place) => {
      const bare: Partial<typeof place> = { ...place };
      delete bare.loading;
      return bare as typeof place;
    });
    expect(
      await store.completeOnboarding(createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), places, {
        base: null,
      }),
    ).toBe('saved');
    expect(await (await store.getDatabase()).get('locations', 'home')).toMatchObject({
      loading: {},
    });
  });

  it('counts a place whose write landed though its check failed as setup’s own (thirteenth re-check)', async () => {
    const on = phone();
    // Home's write lands; the read that checks it fails once.
    let armed = false;
    let checkFails = false;
    const store = open(on, {
      openDb: async () => {
        const db = await openDatabase({ factory: on.factory, name: NAME, now: on.now });
        const put = db.put.bind(db);
        const get = db.get.bind(db);
        db.put = (async (name: Parameters<typeof put>[0], value: Parameters<typeof put>[1]) => {
          const result = await put(name, value);
          if (armed && name === 'locations' && (value as { id?: string }).id === 'home') {
            armed = false;
            checkFails = true;
          }
          return result;
        }) as typeof db.put;
        db.get = (async (name: Parameters<typeof get>[0], key: Parameters<typeof get>[1]) => {
          if (checkFails && name === 'locations') {
            checkFails = false;
            throw new Error('The read did not answer.');
          }
          return get(name, key);
        }) as typeof db.get;
        return db;
      },
    });
    await store.hydrate();
    armed = true;
    const answers = createDefaultProfile(TEST_NOW, GYM_LOCATION_ID);
    const places = createDefaultLocations({ gymAccess: true }, TEST_NOW);
    const failed = await store
      .completeOnboarding(answers, places, { base: null })
      .catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(SetupInterruptedError);
    const outcome = await store.completeOnboarding(answers, places, {
      base: (failed as SetupInterruptedError).left,
    });
    expect(outcome).toBe('saved');
    expect(await (await store.getDatabase()).count('locations')).toBe(2);
  });

  it('counts the places as setup began from them as its own after a cut-off (fourteenth re-check)', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store, 'lb');
    const began = setupBase(store.getSnapshot().profile, store.getSnapshot().locations);
    // Run setup again with Home and the Gym both edited; the Gym's write is cut off.
    const edited = store.getSnapshot().locations.map((place) => ({
      ...place,
      name: `${place.name} (edited)`,
      updatedAt: on.now(),
    }));
    const db = await store.getDatabase();
    const put = db.put.bind(db);
    let cut = true;
    vi.spyOn(db, 'put').mockImplementation(async (name, value) => {
      if (cut && name === 'locations' && (value as { id?: string }).id === GYM_LOCATION_ID) {
        cut = false;
        throw new Error('The phone is out of space.');
      }
      return put(name, value);
    });
    const answers = { ...store.getSnapshot().profile!, units: 'kg' as const };
    const failed = await store
      .completeOnboarding(answers, edited, { base: began })
      .catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(SetupInterruptedError);
    const outcome = await store.completeOnboarding(answers, edited, {
      base: (failed as SetupInterruptedError).left,
    });
    expect(outcome).toBe('saved');
    expect(store.getSnapshot().profile?.units).toBe('kg');
  });

  it('refuses Finish again after a cut-off when another window deleted a place meanwhile (fourteenth re-check)', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store, 'lb');
    await store.saveLocation({
      ...store.getSnapshot().locations.find((place) => place.id === 'home')!,
      id: 'hotel',
      name: 'Hotel',
    });
    const began = setupBase(store.getSnapshot().profile, store.getSnapshot().locations);
    const shown = store.getSnapshot().locations;
    // The profile's write fails, just after another window deleted the Hotel.
    const db = await store.getDatabase();
    vi.spyOn(store, 'saveProfile').mockImplementationOnce(async () => {
      await db.delete('locations', 'hotel');
      throw new Error('The phone is out of space.');
    });
    const answers = { ...store.getSnapshot().profile!, units: 'kg' as const };
    const failed = await store
      .completeOnboarding(answers, shown, { base: began })
      .catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(SetupInterruptedError);
    const outcome = await store.completeOnboarding(answers, shown, {
      base: (failed as SetupInterruptedError).left,
    });
    expect(outcome).toBe('restored');
    expect(await db.get('locations', 'hotel')).toBeUndefined();
  });

  it('rebuilds the plan on Finish again after the profile’s write landed though its check failed (fifteenth re-check)', async () => {
    const on = phone();
    let armed = false;
    let checkFails = false;
    const store = open(on, {
      openDb: async () => {
        const db = await openDatabase({ factory: on.factory, name: NAME, now: on.now });
        const put = db.put.bind(db);
        const get = db.get.bind(db);
        db.put = (async (name: Parameters<typeof put>[0], value: Parameters<typeof put>[1]) => {
          const result = await put(name, value);
          if (armed && name === 'profile') {
            armed = false;
            checkFails = true;
          }
          return result;
        }) as typeof db.put;
        db.get = (async (name: Parameters<typeof get>[0], key: Parameters<typeof get>[1]) => {
          if (checkFails && name === 'profile') {
            checkFails = false;
            throw new Error('The read did not answer.');
          }
          return get(name, key);
        }) as typeof db.get;
        return db;
      },
    });
    await setUp(store, 'lb');
    expect(store.getSnapshot().session?.workout.locationId).toBe(GYM_LOCATION_ID);
    const began = setupBase(store.getSnapshot().profile, store.getSnapshot().locations);
    // Run setup again with the current place moved to Home; the profile's check fails once.
    const answers = { ...store.getSnapshot().profile!, currentLocationId: 'home' };
    const places = store.getSnapshot().locations;
    armed = true;
    const failed = await store
      .completeOnboarding(answers, places, { base: began })
      .catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(SetupInterruptedError);
    const outcome = await store.completeOnboarding(answers, places, {
      base: (failed as SetupInterruptedError).left,
    });
    expect(outcome).toBe('saved');
    // The plan is rebuilt for Home, as a Finish with no failure rebuilds it.
    expect(store.getSnapshot().session?.workout.locationId).toBe('home');
  });

  it('saves setup run again while the profile and places stand as it began (sixth re-check)', async () => {
    const on = phone();
    const store = open(on);
    await setUp(store, 'kg');
    const began = setupBase(store.getSnapshot().profile, store.getSnapshot().locations);
    expect(began).not.toBeNull();
    const outcome = await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'lb' },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
      { base: began },
    );
    expect(outcome).toBe('saved');
    const [stored] = await (
      await store.getDatabase()
    ).getAll<{ id: string; units: string }>('profile');
    expect(stored?.units).toBe('lb');
  });

  it('never saves a barcode for a place another window deleted (second re-check)', async () => {
    const on = phone();
    const a = open(on);
    await setUp(a);
    const b = open(on);
    await b.hydrate();
    await a.deleteLocation(GYM_LOCATION_ID);
    await expect(b.saveBarcode(GYM_LOCATION_ID, PICKED)).rejects.toThrow(/no longer saved/);
    expect(await (await a.getDatabase()).count('device')).toBe(0);
    expect(readBarcodeMirror(on.storage)).toEqual([]);
  });

  it('brings what the card says of the second copy in line when a switch turn finds nothing to change (second re-check)', async () => {
    const on = phone();
    const a = open(on);
    await setUp(a);
    await a.saveBarcode(GYM_LOCATION_ID, PICKED);
    const b = open(on);
    await b.hydrate();
    expect(b.getSnapshot().barcodeCopies[barcodeIdFor(GYM_LOCATION_ID)]).toBe('picture');
    // A big picture with no code read: no second copy of it.
    await a.saveBarcode(GYM_LOCATION_ID, { image: BIG.image });
    await a.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    await b.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    expect(b.getSnapshot().barcodes[0]?.image).toEqual(BIG.image);
    expect(b.getSnapshot().barcodeCopies[barcodeIdFor(GYM_LOCATION_ID)]).toBe('none');
  });

  it('makes the smaller copy again when the switch is turned before it was made', async () => {
    const on = phone();
    let finish!: (copy: typeof SMALLER) => void;
    let calls = 0;
    const store = open(on, {
      shrinkPicture: () => {
        calls += 1;
        return calls === 1
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(SMALLER);
      },
    });
    await setUp(store);
    await store.saveBarcode(GYM_LOCATION_ID, { image: BIG.image });
    await store.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    // The first copy comes for the version before the switch, and is not kept for it.
    finish(SMALLER);
    await store.flushPendingWork();
    expect(readBarcodeMirror(on.storage)[0]).toMatchObject({ image: SMALLER, autoShow: false });
    expect(store.getSnapshot().barcodeCopies[barcodeIdFor(GYM_LOCATION_ID)]).toBe('picture');
  });

  it('never lets a removal run between the reload’s last read of the database and its write of the second copy', async () => {
    // Held at the reload's third read of the barcodes (the one it writes the second copy from):
    // a removal waits for the lock, never slips in between.
    const on = phone();
    const store = open(on);
    await setUp(store);
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    const held = holdAt(await store.getDatabase(), 'getAll', 'device', 3);
    const reload = store.hydrate();
    await vi.waitFor(() => expect(held.reached()).toBe(true));
    const removal = store.removeBarcode(GYM_LOCATION_ID);
    await settledOrWaited(removal);
    held.release();
    await Promise.all([reload, removal]);
    held.restore();
    expect(readBarcodeMirror(on.storage)).toEqual([]);
    expect(await stored(store)).toBeUndefined();
  });
});

describe('the tenth review: setup waits while a cleared phone’s data comes back', () => {
  it('waits for the first walk of the cloud copy, then shows the history, not setup', async () => {
    const cloud = createFakeCloud();
    let online = true;
    const on = phone({ cloud, online: () => online });
    const first = open(on);
    await setUp(first, 'kg');
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    await clearDatabase(on, first);

    online = false;
    const second = open(on);
    await second.hydrate();
    expect(second.getSnapshot()).toMatchObject({ profile: null, restoring: true });
    online = true;
    await second.syncNow({ pull: true, force: true });
    expect(second.getSnapshot().restoring).toBe(false);
    expect(second.getSnapshot().profile?.units).toBe('kg');
  });

  it('ends the wait in the same step as it shows what came back: setup never shows in between (fourth re-check)', async () => {
    const cloud = createFakeCloud();
    const on = phone({ cloud });
    const first = open(on);
    await setUp(first, 'kg');
    await first.setCloudToken(TOKEN);
    await first.flushPendingWork();
    await first.syncNow({ pull: true });
    await clearDatabase(on, first);

    const second = open(on);
    await second.hydrate();
    expect(second.getSnapshot()).toMatchObject({ profile: null, restoring: true });
    let setupShown = 0;
    const stop = second.subscribe(() => {
      const state = second.getSnapshot();
      if (state.status === 'ready' && state.profile === null && !state.restoring) setupShown += 1;
    });
    await second.syncNow({ pull: true, force: true });
    stop();
    expect(second.getSnapshot()).toMatchObject({ restoring: false, profile: { units: 'kg' } });
    expect(setupShown).toBe(0);
  });

  it('stops waiting when the cloud copy has nothing to bring back', async () => {
    const cloud = createFakeCloud();
    const on = phone({ cloud });
    // A fresh install with a token from a setup link: an empty database, an empty cloud copy.
    on.storage.setItem('wc.v1.cloudToken', TOKEN);
    const store = open(on);
    await store.hydrate();
    expect(store.getSnapshot().restoring).toBe(true);
    await store.syncNow({ pull: true });
    expect(store.getSnapshot()).toMatchObject({ profile: null, restoring: false });
  });

  it('lets the lifter set up anyway, and says nothing of waiting again this open', async () => {
    const cloud = createFakeCloud();
    const on = phone({ cloud, online: () => false });
    on.storage.setItem('wc.v1.cloudToken', TOKEN);
    const store = open(on);
    await store.hydrate();
    expect(store.getSnapshot().restoring).toBe(true);
    store.skipRestoring();
    expect(store.getSnapshot().restoring).toBe(false);
    await store.hydrate();
    expect(store.getSnapshot().restoring).toBe(false);
  });
});
