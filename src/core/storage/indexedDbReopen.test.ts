import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB_VERSION, openDatabase } from './indexedDb';

/**
 * A second connection asking to upgrade closes ours, by design, so the upgrade
 * is not blocked. The connection has to come back on its own: before this, the
 * closed handle was kept and every later write failed, including saving a
 * finished workout, with nothing but a reload to fix it.
 */

const NOW = '2026-09-13T12:00:00.000Z';

function profile(id: string) {
  return { id, schemaVersion: 1, marker: id } as unknown as { id: string };
}

/** Opens the same database one version higher, which fires versionchange on every other connection. */
async function upgradeFromAnotherTab(factory: IDBFactory, name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = factory.open(name, DB_VERSION + 1);
    request.onupgradeneeded = () => undefined;
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error ?? new Error('open failed'));
    request.onblocked = () => reject(new Error('blocked'));
  });
}

describe('a connection closed by another tab', () => {
  it('reopens itself so a write after it still lands', async () => {
    const factory = new IDBFactory();
    const name = 'wc-reopen-test';
    const db = await openDatabase({ factory, name, now: () => NOW });
    await db.put('profile', profile('before'));
    expect(await db.get('profile', 'before')).toMatchObject({ marker: 'before' });

    await upgradeFromAnotherTab(factory, name);

    // The write that used to fail with "the database connection is closing".
    await db.put('workouts', profile('w-after'));
    expect(await db.get('workouts', 'w-after')).toMatchObject({ marker: 'w-after' });
    // Reads and the outbox path recover too, and nothing written before was lost.
    expect(await db.get('profile', 'before')).toMatchObject({ marker: 'before' });
    const queued = await db.getAll('outbox');
    expect(queued.map((entry) => (entry as { recordId?: string }).recordId)).toContain('w-after');
  });

  it('stays closed when the app closes it deliberately', async () => {
    const factory = new IDBFactory();
    const db = await openDatabase({ factory, name: 'wc-reopen-closed', now: () => NOW });
    db.close();
    await expect(db.put('profile', profile('nope'))).rejects.toThrow(/closed/i);
  });
});
