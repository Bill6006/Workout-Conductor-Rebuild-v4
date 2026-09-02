import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openDatabase, type Database, type StoreName } from './indexedDb';
import {
  SaveVerificationError,
  deleteVerified,
  putVerified,
  stableStringify,
  structurallyEqual,
} from './verifiedSave';

const NOW = () => '2026-09-02T12:00:00.000Z';

/**
 * Wraps a real database so that the Nth `get` returns a corrupted value,
 * simulating a write that did not land the way it was sent.
 */
function corruptRead(db: Database, readNumber: number, corrupted: unknown): Database {
  let reads = 0;
  return {
    ...db,
    get: (async (store: StoreName, key: string) => {
      reads += 1;
      if (reads === readNumber) return corrupted;
      return db.get(store, key);
    }) as Database['get'],
  };
}

describe('stableStringify', () => {
  it('ignores key order and undefined values', () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(
      stableStringify({ a: [{ c: 3, d: 2 }], b: 1 }),
    );
    expect(structurallyEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(structurallyEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('putVerified', () => {
  it('writes, reads back, and returns a receipt', async () => {
    const db = await openDatabase({ factory: new IDBFactory(), name: 'verified' });
    const receipt = await putVerified(db, 'profile', { id: 'current', units: 'lb' }, { now: NOW });
    expect(receipt).toEqual({
      store: 'profile',
      id: 'current',
      verifiedAt: NOW(),
      bytes: stableStringify({ id: 'current', units: 'lb' }).length,
    });
    expect(await db.get('profile', 'current')).toEqual({ id: 'current', units: 'lb' });
  });

  it('restores the previous record and throws when the read-back differs', async () => {
    const real = await openDatabase({ factory: new IDBFactory(), name: 'rollback' });
    await real.put('profile', { id: 'current', units: 'lb' });
    // read 1 = previous value, read 2 = read-back (corrupted), read 3 = rollback check
    const flaky = corruptRead(real, 2, { id: 'current', units: 'corrupted' });

    await expect(
      putVerified(flaky, 'profile', { id: 'current', units: 'kg' }, { now: NOW }),
    ).rejects.toMatchObject({ name: 'SaveVerificationError', rolledBack: true });
    expect(await real.get('profile', 'current')).toEqual({ id: 'current', units: 'lb' });
  });

  it('deletes a brand-new record whose read-back differs', async () => {
    const real = await openDatabase({ factory: new IDBFactory(), name: 'rollback-new' });
    const flaky = corruptRead(real, 2, { id: 'loc-1', name: 'garbled' });

    await expect(
      putVerified(flaky, 'locations', { id: 'loc-1', name: 'Garage' }, { now: NOW }),
    ).rejects.toBeInstanceOf(SaveVerificationError);
    expect(await real.get('locations', 'loc-1')).toBeUndefined();
  });
});

describe('deleteVerified', () => {
  it('confirms the record is gone', async () => {
    const db = await openDatabase({ factory: new IDBFactory(), name: 'delete' });
    await db.put('locations', { id: 'x', name: 'X' });
    await deleteVerified(db, 'locations', 'x');
    expect(await db.get('locations', 'x')).toBeUndefined();
  });

  it('throws when the record survives the delete', async () => {
    const real = await openDatabase({ factory: new IDBFactory(), name: 'delete-fail' });
    await real.put('locations', { id: 'x', name: 'X' });
    const stubborn: Database = { ...real, delete: async () => {} };
    await expect(deleteVerified(stubborn, 'locations', 'x')).rejects.toBeInstanceOf(
      SaveVerificationError,
    );
  });
});
