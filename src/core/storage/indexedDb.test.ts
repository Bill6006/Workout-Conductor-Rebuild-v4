import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { STORE_NAMES, StorageUnavailableError, openDatabase } from './indexedDb';

describe('openDatabase', () => {
  it('creates every store on first open and round-trips records', async () => {
    const factory = new IDBFactory();
    const db = await openDatabase({ factory, name: 'unit' });
    for (const store of STORE_NAMES) {
      expect(await db.count(store)).toBe(0);
    }

    await db.put('locations', { id: 'a', name: 'A' });
    await db.put('locations', { id: 'b', name: 'B' });
    expect(await db.get('locations', 'a')).toEqual({ id: 'a', name: 'A' });
    expect((await db.getAll('locations')).map((record) => record.id).sort()).toEqual(['a', 'b']);
    expect(await db.count('locations')).toBe(2);

    await db.delete('locations', 'a');
    expect(await db.get('locations', 'a')).toBeUndefined();
    await db.clear('locations');
    expect(await db.count('locations')).toBe(0);
    db.close();
  });

  it('keeps data across re-opens of the same database', async () => {
    const factory = new IDBFactory();
    const first = await openDatabase({ factory, name: 'persist' });
    await first.put('profile', { id: 'current', units: 'kg' });
    first.close();

    const second = await openDatabase({ factory, name: 'persist' });
    expect(await second.get('profile', 'current')).toEqual({ id: 'current', units: 'kg' });
    second.close();
  });

  it('fails with a readable error when IndexedDB is missing', async () => {
    const broken = {
      open() {
        throw new Error('blocked by privacy mode');
      },
    } as unknown as IDBFactory;
    await expect(openDatabase({ factory: broken, name: 'x' })).rejects.toBeInstanceOf(
      StorageUnavailableError,
    );
  });
});
