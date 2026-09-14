import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../storage/indexedDb';
import { createMemoryStorage, type KeyValueStorage } from '../storage/localSettings';
import { CLOUD_TOKEN_ID } from './model';
import {
  TOKEN_LOG_KEY,
  TOKEN_MARK_ID,
  TOKEN_MARK_KEY,
  TOKEN_MIRROR_KEY,
  clearToken,
  readTokenLog,
  resolveToken,
  saveToken,
} from './tokenVault';

/**
 * The token on the device: two copies, verified writes, and a log that names
 * the layer that lost it. Both tokens here are made up and never reach a network.
 */

const T1 = '2026-09-14T00:55:00.000Z';
const T2 = '2026-09-14T12:31:00.000Z';
const T3 = '2026-09-14T20:54:00.000Z';
const TOKEN = 'vault-test-token-never-real';

async function setup(): Promise<{ db: Database; storage: KeyValueStorage }> {
  const db = await openDatabase({ factory: new IDBFactory(), name: 'vault-test', now: () => T1 });
  return { db, storage: createMemoryStorage() };
}

function localCopies(storage: KeyValueStorage): string {
  return [TOKEN_MARK_KEY, TOKEN_LOG_KEY].map((key) => storage.getItem(key) ?? '').join('\n');
}

describe('the token on the device', () => {
  it('saves to both copies, marks both with the time, and logs it without the token', async () => {
    const { db, storage } = await setup();
    await saveToken(db, storage, TOKEN, T1, 'Pasted in Settings.');

    expect(await db.get('cloud', CLOUD_TOKEN_ID)).toMatchObject({ value: TOKEN, savedAt: T1 });
    expect(storage.getItem(TOKEN_MIRROR_KEY)).toBe(TOKEN);
    expect(await db.get('cloud', TOKEN_MARK_ID)).toMatchObject({ savedAt: T1, lastSeenAt: T1 });
    expect(JSON.parse(storage.getItem(TOKEN_MARK_KEY) ?? '{}')).toEqual({
      savedAt: T1,
      lastSeenAt: T1,
    });
    const log = await readTokenLog(db, storage);
    expect(log).toEqual([{ at: T1, kind: 'saved', detail: 'Pasted in Settings.' }]);
    expect(JSON.stringify(log)).not.toContain(TOKEN);
    expect(localCopies(storage)).not.toContain(TOKEN);

    // Found in both: nothing to heal, and the marks say when it was last seen.
    const found = await resolveToken(db, storage, T2);
    expect(found).toMatchObject({
      token: TOKEN,
      healed: null,
      recover: false,
      lost: null,
      notice: null,
    });
    expect(await db.get('cloud', TOKEN_MARK_ID)).toMatchObject({ savedAt: T1, lastSeenAt: T2 });
    db.close();
  });

  it('a database that lost the token gets it back from the phone and asks for the whole history', async () => {
    const { db, storage } = await setup();
    await saveToken(db, storage, TOKEN, T1, 'Pasted in Settings.');
    await db.delete('cloud', CLOUD_TOKEN_ID);

    const healed = await resolveToken(db, storage, T2);
    expect(healed).toMatchObject({ token: TOKEN, healed: 'database', recover: true, lost: null });
    expect(healed.notice).toMatchObject({ at: T2, kind: 'restored' });
    expect(healed.notice?.detail).toMatch(/database copy of the token was missing/);
    expect(await db.get('cloud', CLOUD_TOKEN_ID)).toMatchObject({ value: TOKEN });
    expect((await readTokenLog(db, storage)).map((event) => event.kind)).toEqual([
      'saved',
      'restored',
    ]);
    // The next look finds both copies and keeps showing what happened.
    const again = await resolveToken(db, storage, T3);
    expect(again).toMatchObject({ token: TOKEN, healed: null, recover: false });
    expect(again.notice?.kind).toBe('restored');
    db.close();
  });

  it('a phone copy that is missing is written from the database: quietly on the first run, named after that', async () => {
    const { db, storage } = await setup();
    // A device from before the second copy existed: the token sits in the database alone.
    await db.put('cloud', {
      id: CLOUD_TOKEN_ID,
      value: TOKEN,
      savedAt: '2026-09-11T10:00:00.000Z',
    });

    const first = await resolveToken(db, storage, T1);
    expect(first).toMatchObject({ token: TOKEN, healed: null, recover: true, notice: null });
    expect(storage.getItem(TOKEN_MIRROR_KEY)).toBe(TOKEN);
    expect((await readTokenLog(db, storage))[0]).toMatchObject({ kind: 'saved' });
    expect((await readTokenLog(db, storage))[0]?.detail).toMatch(/second copy/);

    storage.removeItem(TOKEN_MIRROR_KEY);
    const healed = await resolveToken(db, storage, T2);
    expect(healed).toMatchObject({ token: TOKEN, healed: 'local', recover: false });
    expect(healed.notice?.detail).toMatch(/phone's local copy of the token was missing/);
    expect(storage.getItem(TOKEN_MIRROR_KEY)).toBe(TOKEN);
    db.close();
  });

  it('both copies gone after a save: says missing once, with when it was last seen', async () => {
    const { db, storage } = await setup();
    await saveToken(db, storage, TOKEN, T1, 'Pasted in Settings.');
    await resolveToken(db, storage, T2);
    await db.delete('cloud', CLOUD_TOKEN_ID);
    storage.removeItem(TOKEN_MIRROR_KEY);

    const lost = await resolveToken(db, storage, T3);
    expect(lost).toMatchObject({ token: null, healed: null, recover: false });
    expect(lost.lost).toEqual({ savedAt: T1, lastSeenAt: T2 });
    expect(lost.notice).toMatchObject({ at: T3, kind: 'missing', lastSeenAt: T2 });
    // Opening the app again does not add a second entry for the same loss.
    await resolveToken(db, storage, T3);
    expect((await readTokenLog(db, storage)).map((event) => event.kind)).toEqual([
      'saved',
      'missing',
    ]);
    expect(localCopies(storage)).not.toContain(TOKEN);

    // A device that never had a token has nothing to say.
    const fresh = await setup();
    expect(await resolveToken(fresh.db, fresh.storage, T1)).toEqual({
      token: null,
      healed: null,
      recover: false,
      lost: null,
      notice: null,
    });
    expect(await readTokenLog(fresh.db, fresh.storage)).toEqual([]);
    db.close();
    fresh.db.close();
  });

  it('removing clears both copies and the marks, keeps the log, and is not a loss', async () => {
    const { db, storage } = await setup();
    await saveToken(db, storage, TOKEN, T1, 'Pasted in Settings.');
    await clearToken(db, storage, T2);

    expect(await db.get('cloud', CLOUD_TOKEN_ID)).toBeUndefined();
    expect(storage.getItem(TOKEN_MIRROR_KEY)).toBeNull();
    expect(await db.get('cloud', TOKEN_MARK_ID)).toBeUndefined();
    expect(storage.getItem(TOKEN_MARK_KEY)).toBeNull();
    expect((await readTokenLog(db, storage)).map((event) => event.kind)).toEqual([
      'saved',
      'removed',
    ]);
    expect(await resolveToken(db, storage, T3)).toMatchObject({
      token: null,
      lost: null,
      notice: null,
    });
    db.close();
  });

  it('two different tokens: the more recently saved copy wins and the other is rewritten', async () => {
    const { db, storage } = await setup();
    await saveToken(db, storage, 'first-token-never-real', T1, 'Pasted in Settings.');
    // A later save that reached only the phone's copy.
    storage.setItem(TOKEN_MIRROR_KEY, 'second-token-never-real');
    storage.setItem(TOKEN_MARK_KEY, JSON.stringify({ savedAt: T2, lastSeenAt: T2 }));

    const resolved = await resolveToken(db, storage, T3);
    expect(resolved).toMatchObject({
      token: 'second-token-never-real',
      healed: 'database',
      recover: true,
    });
    expect(await db.get('cloud', CLOUD_TOKEN_ID)).toMatchObject({
      value: 'second-token-never-real',
    });
    db.close();
  });

  it('a database write that does not stick is refused before the phone copy is touched', async () => {
    const { db, storage } = await setup();
    const broken: Database = {
      ...db,
      put: async (store, value) => {
        if (store === 'cloud' && value.id === CLOUD_TOKEN_ID) {
          await db.put(store, { ...value, value: 'not what was written' });
          return;
        }
        await db.put(store, value);
      },
    };
    await expect(saveToken(broken, storage, TOKEN, T1, 'Pasted in Settings.')).rejects.toThrow(
      /verif/i,
    );
    expect(storage.getItem(TOKEN_MIRROR_KEY)).toBeNull();
    expect(await readTokenLog(db, storage)).toEqual([]);
    db.close();
  });
});
