import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB_VERSION, STORE_NAMES, openDatabase } from './indexedDb';

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

describe('IndexedDB upgrade', () => {
  it('adds the custom-content stores without touching existing data', async () => {
    const factory = new IDBFactory();
    await createVersionOne(factory, 'upgrade');

    const db = await openDatabase({ factory, name: 'upgrade' });
    expect(DB_VERSION).toBe(2);
    expect(await db.get('profile', 'current')).toEqual({ id: 'current', units: 'kg' });
    for (const store of STORE_NAMES) {
      expect(await db.count(store)).toBeGreaterThanOrEqual(0);
    }
    expect(await db.count('customExercises')).toBe(0);
    db.close();
  });
});
