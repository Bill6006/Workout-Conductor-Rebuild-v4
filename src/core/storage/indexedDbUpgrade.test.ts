import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION, STORE_NAMES, openDatabase } from './indexedDb';

/** Simulates a database created by the Phase 1 build (version 1, four stores). */
function createVersionOne(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ['profile', 'locations', 'workouts', 'meta']) {
        db.createObjectStore(store, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('profile', 'readwrite');
      tx.objectStore('profile').put({ id: 'current', units: 'kg' });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Simulates another app on the same origin owning a same-named database at a higher version. */
function createForeignDatabase(factory: IDBFactory, name: string, version: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('legacyStuff', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('legacyStuff', 'readwrite');
      tx.objectStore('legacyStuff').put({ id: 'keep-me', note: 'belongs to another app' });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function readForeign(
  factory: IDBFactory,
  name: string,
): Promise<{ version: number; stores: string[]; record: unknown }> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name);
    request.onsuccess = () => {
      const db = request.result;
      const stores = [...db.objectStoreNames];
      const tx = db.transaction('legacyStuff', 'readonly');
      const get = tx.objectStore('legacyStuff').get('keep-me');
      get.onsuccess = () => {
        const version = db.version;
        db.close();
        resolve({ version, stores, record: get.result });
      };
      get.onerror = () => reject(get.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe('IndexedDB upgrade', () => {
  it('recovers when another app on the origin owns the name at a higher version', async () => {
    const factory = new IDBFactory();
    await createForeignDatabase(factory, 'shared-name', 5);

    const db = await openDatabase({ factory, name: 'shared-name' });
    expect(await db.count('profile')).toBe(0);
    await db.put('profile', { id: 'current', units: 'lb' });
    expect(await db.get('profile', 'current')).toEqual({ id: 'current', units: 'lb' });
    db.close();

    const foreign = await readForeign(factory, 'shared-name');
    expect(foreign.version).toBe(6);
    expect(foreign.stores).toEqual(expect.arrayContaining(['legacyStuff', ...STORE_NAMES]));
    expect(foreign.record).toEqual({ id: 'keep-me', note: 'belongs to another app' });

    // A second open at our lower schema version keeps working without another upgrade.
    const again = await openDatabase({ factory, name: 'shared-name' });
    expect(await again.get('profile', 'current')).toEqual({ id: 'current', units: 'lb' });
    again.close();
    expect((await readForeign(factory, 'shared-name')).version).toBe(6);
  });

  it('adds the custom-content stores without touching existing data', async () => {
    const factory = new IDBFactory();
    await createVersionOne(factory, 'upgrade');

    const db = await openDatabase({ factory, name: 'upgrade' });
    expect(DB_VERSION).toBe(3);
    expect(DB_NAME).toBe('workout-conductor-v4');
    expect(await db.get('profile', 'current')).toEqual({ id: 'current', units: 'kg' });
    for (const store of STORE_NAMES) {
      expect(await db.count(store)).toBeGreaterThanOrEqual(0);
    }
    expect(await db.count('customExercises')).toBe(0);
    db.close();
  });
});
