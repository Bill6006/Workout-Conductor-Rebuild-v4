import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeBackup } from '../backup/backup';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createFakeCloud } from '../../test/fakeCloud';
import { openDatabase } from '../storage/indexedDb';
import { GYM_LOCATION_ID, HOME_LOCATION_ID, createDefaultLocations } from '../validation/location';
import { barcodeIdFor, type PickedBarcode } from '../validation/placeBarcode';
import { createDefaultProfile } from '../validation/profile';
import type { AppStore } from './appStore';

const APP = { version: 'test', commit: 'abc1234' };
// A synthetic picture and code; nothing here is anyone's membership.
const DATA_URL = 'data:image/png;base64,U1lOVEhFVElDLUJBUkNPREU=';
const PICKED: PickedBarcode = {
  image: { mimeType: 'image/png', dataUrl: DATA_URL },
  code: { format: 'code_128', value: 'SYNTH-0001' },
};

const started: AppStore[] = [];

afterEach(() => {
  for (const store of started.splice(0)) store.stopCloud();
});

async function onboarded(options: Parameters<typeof createTestStore>[0] = {}) {
  const handle = createTestStore(options);
  started.push(handle.store);
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

describe('a place barcode in the store', () => {
  it('saves on this phone, pops up when a workout starts at that place, and closes', async () => {
    const { store } = await onboarded();
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    const db = await store.getDatabase();
    expect(await db.get('device', barcodeIdFor(GYM_LOCATION_ID))).toMatchObject({
      locationId: GYM_LOCATION_ID,
      image: { dataUrl: DATA_URL },
      code: PICKED.code,
      autoShow: true,
    });
    expect(store.getSnapshot().barcodeOpen).toBeNull();

    store.startWorkout();
    expect(store.getSnapshot().barcodeOpen).toBe(GYM_LOCATION_ID);
    store.closeBarcode();
    expect(store.getSnapshot().barcodeOpen).toBeNull();
  });

  it('stays closed at Start once switched off, and still opens when asked', async () => {
    const { store } = await onboarded();
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    await store.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    store.startWorkout();
    expect(store.getSnapshot().barcodeOpen).toBeNull();
    store.openBarcode();
    expect(store.getSnapshot().barcodeOpen).toBe(GYM_LOCATION_ID);

    // A replaced picture keeps the choice made for the place.
    await store.saveBarcode(GYM_LOCATION_ID, { image: PICKED.image });
    const [barcode] = store.getSnapshot().barcodes;
    expect(barcode).toMatchObject({ autoShow: false, addedAt: TEST_NOW });
    expect(barcode?.code).toBeUndefined();
  });

  it('does not pop up at a place without one', async () => {
    const { store } = await onboarded();
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    await store.setCurrentLocation(HOME_LOCATION_ID);
    store.startWorkout();
    expect(store.getSnapshot().barcodeOpen).toBeNull();
    store.openBarcode();
    expect(store.getSnapshot().barcodeOpen).toBeNull();
  });

  it('comes back after the app is closed, and goes with its place', async () => {
    const first = await onboarded();
    await first.store.saveBarcode(GYM_LOCATION_ID, PICKED);

    const again = createTestStore({ factory: first.factory, storage: first.storage });
    await again.store.hydrate();
    expect(again.store.getSnapshot().barcodes.map((item) => item.locationId)).toEqual([
      GYM_LOCATION_ID,
    ]);

    again.store.openBarcode();
    await again.store.deleteLocation(GYM_LOCATION_ID);
    expect(again.store.getSnapshot().barcodes).toEqual([]);
    expect(again.store.getSnapshot().barcodeOpen).toBeNull();
    const db = await again.store.getDatabase();
    expect(await db.count('device')).toBe(0);
  });

  it('can be removed, and refuses a place that is no longer saved', async () => {
    const { store } = await onboarded();
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    store.openBarcode();
    await store.removeBarcode(GYM_LOCATION_ID);
    expect(store.getSnapshot()).toMatchObject({ barcodes: [], barcodeOpen: null });
    await expect(store.saveBarcode('gone', PICKED)).rejects.toThrow(
      'That place is no longer saved.',
    );
  });

  it('never goes into a backup or an automatic snapshot, and a restore leaves it alone', async () => {
    const { store } = await onboarded();
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    const backup = await store.createBackup(APP);
    const text = serializeBackup(backup);
    expect(text).not.toContain(DATA_URL);
    expect(text).not.toContain('SYNTH-0001');
    expect(Object.keys(backup.data)).not.toContain('device');

    await store.applyBackup(backup);
    expect(store.getSnapshot().barcodes).toHaveLength(1);
    // The restore kept a snapshot of what it replaced; that copy leaves the barcode out too.
    const snapshots = await store.listSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);
    for (const snapshot of snapshots) {
      const full = await store.getBackupSnapshot(snapshot.id);
      expect(serializeBackup(full ?? {})).not.toContain(DATA_URL);
    }
  });

  it('never goes to the cloud copy: no outbox entry, nothing uploaded', async () => {
    const cloud = createFakeCloud();
    const factory = new IDBFactory();
    const { store } = await onboarded({
      factory,
      openDb: () => openDatabase({ factory, name: 'wc-barcode-cloud', now: () => TEST_NOW }),
      cloudClient: async () => cloud.client,
      isOnline: () => true,
    });
    await store.setCloudToken('test-token');
    await store.flushPendingWork();
    const db = await store.getDatabase();
    const queued = await db.count('outbox');

    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    await store.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    await store.removeBarcode(GYM_LOCATION_ID);
    await store.saveBarcode(GYM_LOCATION_ID, PICKED);
    expect(await db.count('outbox')).toBe(queued);

    await store.syncNow();
    const rows = cloud.ours();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.store === 'device')).toBe(false);
    expect(JSON.stringify(rows)).not.toContain(DATA_URL);
    expect(JSON.stringify(rows)).not.toContain('SYNTH-0001');
  });
});
