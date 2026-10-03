import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createFakeCloud } from '../../test/fakeCloud';
import { openDatabase, type OutboxEntry } from '../storage/indexedDb';
import {
  CLOUD_REQUEST_TIMEOUT_MS,
  pullRemote,
  readCloudState,
  readDatabaseBirth,
  resetCloudState,
  restartPull,
  syncOnce,
  type SyncContext,
} from './cloudSync';
import { CLOUD_APP, backoffMs, upsertStatement } from './model';

const NOW = '2026-09-11T12:00:00.000Z';
const EARLIER = '2026-09-05T08:00:00.000Z';
const LATER = '2026-09-12T08:00:00.000Z';

function context(overrides: Partial<SyncContext> = {}): SyncContext {
  return {
    now: () => NOW,
    deviceId: 'phone',
    deviceLabel: 'Android · Chrome',
    isOnline: () => true,
    ...overrides,
  };
}

function emptyState() {
  return {
    id: 'state',
    cursor: null,
    cursorId: null,
    lastPullAt: null,
    lastSyncAt: null,
    lastError: null,
    failures: 0,
    nextAttemptAt: null,
    epoch: 0,
  };
}

async function openTestDb() {
  return openDatabase({ factory: new IDBFactory(), name: 'cloud-test', now: () => NOW });
}

describe('outbox behind the wrapper', () => {
  it('queues put, delete, and clear on synced stores only, never for remote applies', async () => {
    const db = await openTestDb();
    let notified = 0;
    db.watchOutbox(() => {
      notified += 1;
    });
    await db.put('profile', { id: 'current', updatedAt: NOW });
    await db.put('customMedia', { id: 'm1' });
    await db.put('backups', { id: 'b1' });
    await db.put('cloud', { id: 'token', value: 'test-token', savedAt: NOW });
    expect((await db.getAll<OutboxEntry>('outbox')).map((entry) => entry.id)).toEqual([
      'profile|current',
    ]);
    expect(notified).toBe(1);

    await db.delete('profile', 'current');
    expect((await db.get<OutboxEntry>('outbox', 'profile|current'))?.op).toBe('delete');

    await db.put('workouts', { id: 'w1', startedAt: NOW });
    await db.put('workouts', { id: 'w2', startedAt: NOW });
    await db.clear('workouts');
    const workouts = (await db.getAll<OutboxEntry>('outbox')).filter(
      (entry) => entry.store === 'workouts',
    );
    expect(workouts.map((entry) => entry.op)).toEqual(['delete', 'delete']);
    expect(await db.count('workouts')).toBe(0);

    await db.applyRemote('locations', { id: 'gym', updatedAt: NOW });
    await db.applyRemoteDelete('locations', 'gym');
    expect(
      (await db.getAll<OutboxEntry>('outbox')).some((entry) => entry.store === 'locations'),
    ).toBe(false);
    db.close();
  });
});

describe('cloud sync engine', () => {
  it('pushes the outbox as upserts and tombstones with this app, the day, and the device, then empties it', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    await db.put('profile', { id: 'current', units: 'lb', updatedAt: EARLIER });
    await db.put('workouts', {
      id: 'w1',
      startedAt: '2026-09-10T10:00:00.000Z',
      completedAt: '2026-09-10T11:00:00.000Z',
    });
    await db.put('meta', { id: 'coach-routes', routes: {} });
    await db.delete('meta', 'gone');

    const outcome = await syncOnce(db, cloud.client, context(), { pull: true });
    expect(outcome).toMatchObject({ ran: true, pushed: 4, applied: 0, removed: 0, error: null });
    expect(await db.count('outbox')).toBe(0);

    const rows = cloud.ours();
    expect(rows.map((row) => `${row.store}/${row.id}`).sort()).toEqual([
      'meta/coach-routes',
      'meta/gone',
      'profile/current',
      'workouts/w1',
    ]);
    expect(rows.every((row) => row.app === CLOUD_APP && row.device_id === 'phone')).toBe(true);
    const workout = rows.find((row) => row.id === 'w1')!;
    expect(workout).toMatchObject({
      day: '2026-09-10',
      updated_at: '2026-09-10T11:00:00.000Z',
      deleted: 0,
      synced_at: NOW,
    });
    expect(JSON.parse(workout.body ?? '')).toMatchObject({ id: 'w1' });
    // A record with no timestamp of its own carries the time it was changed (this database's
    // clock; the tenth re-check's test sends it later).
    expect(rows.find((row) => row.id === 'coach-routes')?.updated_at).toBe(NOW);
    expect(rows.find((row) => row.id === 'gone')).toMatchObject({ deleted: 1, body: '{}' });
    expect(cloud.devices.get(`phone|${CLOUD_APP}`)).toMatchObject({
      label: 'Android · Chrome',
      first_seen: NOW,
      last_sync: NOW,
    });

    const again = await syncOnce(db, cloud.client, context(), { pull: true });
    expect(again.pushed).toBe(0);
    expect((await readCloudState(db)).lastSyncAt).toBe(NOW);
    db.close();
  });

  it('a fresh install restores everything on the first pull and drops the default it wrote', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    // Onboarding on the new device wrote a default profile before the token arrived.
    await db.put('profile', { id: 'current', units: 'kg', updatedAt: LATER });
    cloud.seed({
      store: 'profile',
      id: 'current',
      body: JSON.stringify({ id: 'current', units: 'lb', updatedAt: EARLIER }),
      updated_at: EARLIER,
      synced_at: EARLIER,
    });
    cloud.seed({
      store: 'workouts',
      id: 'w1',
      body: JSON.stringify({ id: 'w1', startedAt: EARLIER }),
      updated_at: EARLIER,
      synced_at: EARLIER,
    });

    const outcome = await syncOnce(db, cloud.client, context({ deviceId: 'tablet' }), {
      pull: true,
    });
    expect(outcome).toMatchObject({ applied: 2, removed: 0, error: null });
    expect(await db.get('profile', 'current')).toMatchObject({ units: 'lb' });
    expect(await db.get('workouts', 'w1')).toMatchObject({ startedAt: EARLIER });
    // The pull re-enqueued nothing, and the overwritten default is not pushed later.
    expect(await db.count('outbox')).toBe(0);
    expect(cloud.ours().find((row) => row.store === 'profile')?.body).toContain('"units":"lb"');
    const state = await readCloudState(db);
    expect(state.cursor).toBe(EARLIER);
    expect(state.cursorId).toBe('w1');
    db.close();
  });

  it('later pulls keep a pending local change, keep a newer local record, delete on tombstones, and bring back an own row only where its record is gone', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    // First sync sets the cursor; nothing remote yet.
    await syncOnce(db, cloud.client, context(), { pull: true });

    await db.applyRemote('locations', { id: 'gym', name: 'Gym', updatedAt: EARLIER });
    await db.applyRemote('locations', { id: 'home', name: 'Home', updatedAt: LATER });
    await db.applyRemote('workouts', { id: 'w9', startedAt: EARLIER });
    await db.put('savedWorkouts', { id: 's1', name: 'Mine', createdAt: NOW });
    // A record this device wrote and still holds: its own row changes nothing.
    await db.applyRemote('savedWorkouts', { id: 's2', name: 'Still here', createdAt: EARLIER });

    cloud.seed({
      store: 'locations',
      id: 'gym',
      body: JSON.stringify({ id: 'gym', name: 'Gym renamed', updatedAt: NOW }),
      updated_at: NOW,
      synced_at: NOW,
    });
    cloud.seed({
      store: 'locations',
      id: 'home',
      body: JSON.stringify({ id: 'home', name: 'Stale', updatedAt: EARLIER }),
      updated_at: EARLIER,
      synced_at: NOW,
    });
    cloud.seed({
      store: 'savedWorkouts',
      id: 's1',
      body: JSON.stringify({ id: 's1', name: 'Theirs', createdAt: LATER }),
      updated_at: LATER,
      synced_at: NOW,
    });
    cloud.seed({ store: 'workouts', id: 'w9', deleted: 1, updated_at: NOW, synced_at: NOW });
    cloud.seed({
      store: 'savedWorkouts',
      id: 's2',
      body: JSON.stringify({ id: 's2', name: 'Own copy', createdAt: NOW }),
      updated_at: NOW,
      synced_at: NOW,
      device_id: 'phone',
    });
    // This device's own row for a record it no longer holds: the one way it gets its history back.
    cloud.seed({
      store: 'profile',
      id: 'current',
      body: JSON.stringify({ id: 'current', units: 'kg', updatedAt: NOW }),
      updated_at: NOW,
      synced_at: NOW,
      device_id: 'phone',
    });
    cloud.seed({
      app: 'other-app',
      store: 'profile',
      id: 'current',
      body: JSON.stringify({ id: 'current', theirs: true }),
      updated_at: NOW,
      synced_at: NOW,
    });

    const pulled = await pullRemote(db, cloud.client, context(), await readCloudState(db));
    expect(pulled).toMatchObject({ applied: 2, removed: 1 });
    expect(await db.get('locations', 'gym')).toMatchObject({ name: 'Gym renamed' });
    expect(await db.get('locations', 'home')).toMatchObject({ name: 'Home' });
    expect(await db.get('savedWorkouts', 's1')).toMatchObject({ name: 'Mine' });
    expect(await db.get('savedWorkouts', 's2')).toMatchObject({ name: 'Still here' });
    expect(await db.get('workouts', 'w9')).toBeUndefined();
    expect(await db.get('profile', 'current')).toMatchObject({ units: 'kg' });
    // The pending local save is still queued and untouched.
    expect((await db.get<OutboxEntry>('outbox', 'savedWorkouts|s1'))?.op).toBe('put');
    expect(await db.count('outbox')).toBe(1);
    db.close();
  });

  it('does nothing offline, records a failure with a growing delay, and keeps the outbox', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    await db.put('profile', { id: 'current', updatedAt: NOW });

    const offline = await syncOnce(db, cloud.client, context({ isOnline: () => false }), {
      pull: true,
    });
    expect(offline).toMatchObject({ ran: false, reason: 'offline' });
    expect(cloud.calls()).toBe(0);
    expect(await db.count('outbox')).toBe(1);

    cloud.fail(1);
    const failed = await syncOnce(db, cloud.client, context(), { pull: true });
    expect(failed).toMatchObject({ ran: true, pushed: 0, error: 'fake cloud unreachable' });
    expect(await db.count('outbox')).toBe(1);
    const state = await readCloudState(db);
    expect(state.failures).toBe(1);
    expect(state.nextAttemptAt).toBe(new Date(Date.parse(NOW) + backoffMs(1)).toISOString());
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(600_000);

    const waiting = await syncOnce(db, cloud.client, context(), { pull: true });
    expect(waiting).toMatchObject({ ran: false, reason: 'backoff' });

    const forced = await syncOnce(db, cloud.client, context(), { pull: true, force: true });
    expect(forced).toMatchObject({ ran: true, pushed: 1, error: null });
    expect(await db.count('outbox')).toBe(0);
    expect((await readCloudState(db)).failures).toBe(0);
    db.close();
  });
});

/**
 * Maintenance 25, what the cleared database showed: a phone keeps its device id when the browser
 * clears its database, so its own rows come back as its own; a write the cloud copy refuses must
 * not look sent; and nothing is pushed before the first pull.
 */
describe('a phone that lost its database, and writes the cloud copy refuses', () => {
  const BEFORE = '2026-09-10T08:00:00.000Z';
  const BORN = '2026-09-11T09:00:00.000Z';
  const AFTER = '2026-09-11T10:00:00.000Z';

  /** The cloud's profile and Gym, written by this phone before its database was cleared. */
  function cloudWithOwnRows() {
    const cloud = createFakeCloud();
    cloud.seed({
      store: 'profile',
      id: 'current',
      device_id: 'phone',
      updated_at: BEFORE,
      synced_at: BEFORE,
      body: JSON.stringify({ id: 'current', units: 'kg', updatedAt: BEFORE }),
    });
    cloud.seed({
      store: 'locations',
      id: 'gym',
      device_id: 'phone',
      updated_at: BEFORE,
      synced_at: BEFORE,
      body: JSON.stringify({ id: 'gym', notes: 'Rack 3', updatedAt: BEFORE }),
    });
    return cloud;
  }

  /** The cleared phone: a new database, setup's defaults saved before any pull. */
  async function clearedPhone(born: string | null) {
    const db = await openTestDb();
    await db.put('cloud', { id: 'birth', at: born });
    await db.put('profile', { id: 'current', units: 'lb', updatedAt: AFTER });
    await db.put('locations', { id: 'gym', notes: '', updatedAt: AFTER });
    return db;
  }

  it('takes back its own rows written before its database was made over setup defaults, and pushes none of them', async () => {
    const cloud = cloudWithOwnRows();
    const db = await clearedPhone(BORN);
    const outcome = await syncOnce(db, cloud.client, context({ now: () => AFTER }), {
      pull: false,
    });
    expect(outcome).toMatchObject({ ran: true, applied: 2, pushed: 0, error: null });
    expect(await db.get('profile', 'current')).toMatchObject({ units: 'kg' });
    expect(await db.get('locations', 'gym')).toMatchObject({ notes: 'Rack 3' });
    expect(await db.count('outbox')).toBe(0);
    expect(cloud.ours().map((row) => row.updated_at)).toEqual([BEFORE, BEFORE]);
    db.close();
  });

  it('keeps its own newer records everywhere else: no birth, a row from after it, or a walk done since', async () => {
    // A database from before births were recorded: the device's own rows stay as they are.
    const unknown = await clearedPhone(null);
    await syncOnce(unknown, cloudWithOwnRows().client, context({ now: () => AFTER }), {
      pull: true,
    });
    expect(await unknown.get('profile', 'current')).toMatchObject({ units: 'lb' });
    unknown.close();

    // A row this phone wrote after its database was made is the same data it holds.
    const later = await clearedPhone(BEFORE);
    const cloud = cloudWithOwnRows();
    await syncOnce(later, cloud.client, context({ now: () => AFTER }), { pull: true });
    expect(await later.get('profile', 'current')).toMatchObject({ units: 'lb' });
    later.close();

    // Once a walk has finished since the database was made, nothing is taken back again: not
    // after the cloud state is reset to switch databases and back either (the tenth review).
    const walked = await clearedPhone(BORN);
    await walked.put('cloud', { id: 'birth', at: BORN, walkedAt: AFTER });
    await resetCloudState(walked);
    await syncOnce(walked, cloudWithOwnRows().client, context({ now: () => AFTER }), {
      pull: true,
    });
    expect(await walked.get('profile', 'current')).toMatchObject({ units: 'lb' });
    walked.close();
  });

  it('marks the first walk since the database was made, and only a whole walk', async () => {
    const db = await clearedPhone(BORN);
    const cloud = cloudWithOwnRows();
    cloud.fail(1);
    await syncOnce(db, cloud.client, context({ now: () => AFTER }), { pull: true });
    expect((await readDatabaseBirth(db)).walkedAt).toBeNull();
    await syncOnce(db, cloud.client, context({ now: () => AFTER }), { pull: true, force: true });
    expect(await readDatabaseBirth(db)).toEqual({ at: BORN, walkedAt: AFTER });
    db.close();
  });

  it('pulls before it pushes whenever it has never pulled, even for a push alone, and pushes nothing when that pull fails', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    cloud.seed({ store: 'workouts', id: 'w-other', updated_at: EARLIER, body: '{"id":"w-other"}' });
    await db.put('profile', { id: 'current', updatedAt: NOW });
    let pulls = 0;
    const counting = {
      ...cloud.client,
      execute: async (statement: Parameters<typeof cloud.client.execute>[0]) => {
        if (statement.sql.startsWith('SELECT store, id')) {
          pulls += 1;
          if (pulls === 1) throw new Error('the copy did not answer');
        }
        return cloud.client.execute(statement);
      },
    };
    const failed = await syncOnce(db, counting, context(), { pull: false });
    expect(failed).toMatchObject({ ran: true, pushed: 0, error: 'the copy did not answer' });
    expect(cloud.ours().some((row) => row.store === 'profile')).toBe(false);

    const ok = await syncOnce(db, counting, context(), { pull: false, force: true });
    expect(ok).toMatchObject({ ran: true, applied: 1, pushed: 1, error: null });
    expect(pulls).toBe(2);
    db.close();
  });

  it('gives up on a copy that never answers after one request’s bound (fifth re-check)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const db = await openTestDb();
      const silent = {
        execute: () => new Promise<never>(() => undefined),
        batch: () => new Promise<never>(() => undefined),
        close: () => undefined,
      };
      const run = syncOnce(db, silent, context(), { pull: true });
      await vi.advanceTimersByTimeAsync(CLOUD_REQUEST_TIMEOUT_MS);
      expect(await run).toMatchObject({
        ran: true,
        error: 'no answer within 30 seconds',
      });
      db.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a page that takes longer than the first request’s bound arrive, once the copy has answered (eighth re-check)', async () => {
    // Bounds of 25 ms and 1 s on real timers stand in for 30 seconds and 5 minutes.
    const quick = context({ requestTimeoutMs: 25, transferTimeoutMs: 1000 });
    const db = await openTestDb();
    const cloud = createFakeCloud();
    for (let index = 0; index < 45; index += 1) {
      const id = `w-${String(index).padStart(2, '0')}`;
      cloud.seed({ store: 'workouts', id, updated_at: EARLIER, body: JSON.stringify({ id }) });
    }
    // A slow copy: a page takes four times the first request's bound to come.
    const slow = {
      ...cloud.client,
      execute: async (statement: Parameters<typeof cloud.client.execute>[0]) => {
        if (/LIMIT \d+/.test(statement.sql))
          await new Promise((resolve) => setTimeout(resolve, 100));
        return cloud.client.execute(statement);
      },
    };
    const outcome = await syncOnce(db, slow, quick, { pull: true });
    expect(outcome).toMatchObject({ ran: true, error: null, applied: 45 });
    expect((await readCloudState(db)).lastPullAt).toBe(NOW);
    db.close();
  });

  it('lets a batch that takes longer than the first request’s bound go up (eighth re-check)', async () => {
    const quick = context({ requestTimeoutMs: 25, transferTimeoutMs: 1000 });
    const db = await openTestDb();
    const cloud = createFakeCloud();
    await db.put('cloud', { ...emptyState(), cursor: LATER, cursorId: 'zzz', lastPullAt: LATER });
    for (let index = 0; index < 12; index += 1) {
      await db.put('workouts', { id: `w-${index}`, startedAt: NOW, completedAt: NOW });
    }
    const slow = {
      ...cloud.client,
      batch: async (statements: Parameters<typeof cloud.client.batch>[0]) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return cloud.client.batch(statements);
      },
    };
    const outcome = await syncOnce(db, slow, quick, { pull: false });
    expect(outcome).toMatchObject({ ran: true, error: null, pushed: 12 });
    expect(await db.count('outbox')).toBe(0);
    db.close();
  });

  it('gives up on a copy that stops answering part-way only after the longer bound (eighth re-check)', async () => {
    const quick = context({ requestTimeoutMs: 25, transferTimeoutMs: 300 });
    const db = await openTestDb();
    const cloud = createFakeCloud();
    cloud.seed({ store: 'workouts', id: 'w-1', updated_at: EARLIER, body: '{"id":"w-1"}' });
    const silentPage = {
      ...cloud.client,
      execute: async (statement: Parameters<typeof cloud.client.execute>[0]) => {
        if (/LIMIT \d+/.test(statement.sql)) await new Promise<never>(() => undefined);
        return cloud.client.execute(statement);
      },
    };
    const started = performance.now();
    const outcome = await syncOnce(db, silentPage, quick, { pull: true });
    expect(outcome.error).toBe('no answer within 0 seconds');
    // The first request answered; the page was given the longer bound, not the first's.
    expect(performance.now() - started).toBeGreaterThanOrEqual(250);
    expect((await readCloudState(db)).lastPullAt).toBeNull();
    db.close();
  });

  it('has a stand-in that orders rows as SQLite does, capitals and underscores included (eighth re-check)', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    for (const id of ['w-a', 'w-B', 'w-c', 'w_d', 'w-1']) {
      cloud.seed({ store: 'workouts', id, updated_at: EARLIER, body: JSON.stringify({ id }) });
    }
    const state = await readCloudState(db);
    await pullRemote(db, cloud.client, context(), state, { pageSize: 1, maxPages: 10 });
    expect(await db.count('workouts')).toBe(5);
    db.close();
  });

  it('never takes a walk that has not reached its end as done (eighth re-check)', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    for (const id of ['w-1', 'w-2', 'w-3']) {
      cloud.seed({ store: 'workouts', id, updated_at: EARLIER, body: JSON.stringify({ id }) });
    }
    const state = await readCloudState(db);
    // Two pages of one row each, and a third row still to come.
    await expect(
      pullRemote(db, cloud.client, context(), state, { pageSize: 1, maxPages: 2 }),
    ).rejects.toThrow('did not reach its end');
    // With room for the whole walk it ends.
    const done = await pullRemote(db, cloud.client, context(), state, { pageSize: 1, maxPages: 4 });
    expect(done).toMatchObject({ cursorId: 'w-3' });
    expect(await db.count('workouts')).toBe(3);
    db.close();
  });

  it('reports what its pull applied though the disk then refuses the sync’s own state (seventh re-check)', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    cloud.seed({ store: 'workouts', id: 'w-a', updated_at: EARLIER, body: '{"id":"w-a"}' });
    cloud.seed({ store: 'workouts', id: 'w-b', updated_at: EARLIER, body: '{"id":"w-b"}' });
    const applyRemote = db.applyRemote.bind(db);
    let applies = 0;
    vi.spyOn(db, 'applyRemote').mockImplementation(async (store, body) => {
      applies += 1;
      if (applies === 2) throw new Error('the phone is full');
      return applyRemote(store, body);
    });
    // Full: the sync's own state is refused as well.
    const put = db.put.bind(db);
    vi.spyOn(db, 'put').mockImplementation(async (store, value) => {
      if (store === 'cloud') throw new Error('the phone is full');
      return put(store, value);
    });
    const outcome = await syncOnce(db, cloud.client, context(), { pull: true });
    expect(outcome).toMatchObject({ ran: true, applied: 1, error: 'the phone is full' });
    db.close();
  });

  it('reports what its pull applied when the push after it fails, so the screen reloads (fifth re-check)', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    cloud.seed({ store: 'workouts', id: 'w-other', updated_at: EARLIER, body: '{"id":"w-other"}' });
    await db.put('profile', { id: 'current', updatedAt: NOW });
    const refusing = {
      ...cloud.client,
      batch: async () => {
        throw new Error('the copy refused the push');
      },
    };
    const outcome = await syncOnce(db, refusing, context(), { pull: true });
    expect(outcome).toMatchObject({ ran: true, applied: 1, error: 'the copy refused the push' });
    db.close();
  });

  it('reports what its pull applied before it failed part-way, so the screen reloads (sixth re-check)', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    cloud.seed({ store: 'workouts', id: 'w-a', updated_at: EARLIER, body: '{"id":"w-a"}' });
    cloud.seed({ store: 'workouts', id: 'w-b', updated_at: EARLIER, body: '{"id":"w-b"}' });
    const applyRemote = db.applyRemote.bind(db);
    let applies = 0;
    vi.spyOn(db, 'applyRemote').mockImplementation(async (store, body) => {
      applies += 1;
      if (applies === 2) throw new Error('the phone could not keep it');
      return applyRemote(store, body);
    });
    const outcome = await syncOnce(db, cloud.client, context(), { pull: true });
    expect(outcome).toMatchObject({ ran: true, applied: 1, error: 'the phone could not keep it' });
    db.close();
  });

  it('sends a deletion with a body the live table takes, so the changes queued with it go up (Life Mirror’s report)', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    await db.put('cloud', { ...emptyState(), cursor: LATER, cursorId: 'zzz', lastPullAt: LATER });
    // A workout the cloud copy holds, deleted here (the deletion meets its row), and a change
    // queued with it.
    await db.put('workouts', { id: 'w-gone', startedAt: NOW, completedAt: NOW });
    expect(await syncOnce(db, cloud.client, context(), { pull: false })).toMatchObject({
      pushed: 1,
    });
    await db.delete('workouts', 'w-gone');
    await db.put('workouts', { id: 'w-new', startedAt: NOW, completedAt: NOW });
    const outcome = await syncOnce(db, cloud.client, context(), { pull: false, force: true });
    expect(outcome).toMatchObject({ ran: true, error: null, pushed: 2 });
    expect(cloud.ours().find((row) => row.id === 'w-gone')).toMatchObject({
      deleted: 1,
      body: '{}',
    });
    expect(cloud.ours().some((row) => row.id === 'w-new')).toBe(true);
    expect(await db.count('outbox')).toBe(0);
    db.close();
  });

  it('stamps a record with no time of its own with when it was made, not sent (tenth re-check)', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    await db.put('cloud', { ...emptyState(), cursor: LATER, cursorId: 'zzz', lastPullAt: LATER });
    // Changed at NOW (the database's clock), sent at LATER.
    await db.put('meta', { id: 'deload-week', startsAt: EARLIER });
    const outcome = await syncOnce(db, cloud.client, context({ now: () => LATER }), {
      pull: false,
    });
    expect(outcome).toMatchObject({ ran: true, error: null, pushed: 1 });
    expect(cloud.ours().find((row) => row.id === 'deload-week')).toMatchObject({
      updated_at: NOW,
    });
    db.close();
  });

  it('stamps a deletion with when it was made, so a later change on another device stands (ninth re-check)', async () => {
    // The phone deletes a workout at NOW, offline; the tablet changes it later and sends it
    // first; the phone's deletion goes later still.
    const db = await openTestDb();
    const cloud = createFakeCloud();
    await db.put('cloud', { ...emptyState(), cursor: LATER, cursorId: 'zzz', lastPullAt: LATER });
    await db.put('workouts', { id: 'w-1', startedAt: EARLIER, completedAt: EARLIER });
    await syncOnce(db, cloud.client, context({ now: () => EARLIER }), { pull: false });
    await db.delete('workouts', 'w-1');
    const TABLET = '2026-09-11T18:00:00.000Z';
    cloud.seed({
      store: 'workouts',
      id: 'w-1',
      device_id: 'tablet',
      updated_at: TABLET,
      synced_at: TABLET,
      body: JSON.stringify({ id: 'w-1', startedAt: EARLIER, completedAt: TABLET, notes: 'kept' }),
    });
    const outcome = await syncOnce(db, cloud.client, context({ now: () => LATER }), {
      pull: false,
      force: true,
    });
    expect(outcome).toMatchObject({ ran: true, error: null, kept: 1 });
    // The tablet's later change stands, and the phone takes it back.
    expect(cloud.ours().find((row) => row.id === 'w-1')).toMatchObject({
      deleted: 0,
      updated_at: TABLET,
    });
    expect(await db.get('workouts', 'w-1')).toMatchObject({ notes: 'kept' });
    db.close();
  });

  it('has a stand-in as strict as the live table: a row with no body refuses its whole batch', async () => {
    const cloud = createFakeCloud();
    // The deletion as it was sent before Maintenance 25, which the live table refused.
    const noBody = {
      sql:
        'INSERT INTO records (app, store, id, day, body, updated_at, deleted, device_id, synced_at) ' +
        'VALUES (?, ?, ?, NULL, NULL, ?, 1, ?, ?) ' +
        'ON CONFLICT(app, store, id) DO UPDATE SET day = NULL, body = NULL, ' +
        'updated_at = excluded.updated_at, deleted = 1, device_id = excluded.device_id, ' +
        'synced_at = excluded.synced_at WHERE excluded.updated_at >= records.updated_at',
      args: [CLOUD_APP, 'workouts', 'w-gone', NOW, 'phone', NOW],
    };
    const queued = upsertStatement('workouts', { id: 'w-new' }, 'phone', NOW);
    await expect(cloud.client.batch([queued, noBody])).rejects.toThrow(
      'NOT NULL constraint failed: records.body',
    );
    expect(cloud.ours()).toEqual([]);
  });

  it('takes the cloud copy’s newer version of a record it refused, rather than counting it as sent', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    cloud.seed({
      store: 'profile',
      id: 'current',
      updated_at: LATER,
      body: JSON.stringify({ id: 'current', units: 'kg', updatedAt: LATER }),
    });
    cloud.seed({ store: 'workouts', id: 'w-gone', updated_at: LATER, deleted: 1 });
    // Older versions here, say from a backup: one changed, one deleted since in the cloud copy.
    await db.put('cloud', {
      id: 'state',
      cursor: LATER,
      cursorId: 'zzz',
      lastPullAt: LATER,
      lastSyncAt: LATER,
      lastError: null,
      failures: 0,
      nextAttemptAt: null,
    });
    await db.put('profile', { id: 'current', units: 'lb', updatedAt: EARLIER });
    await db.put('workouts', { id: 'w-gone', startedAt: EARLIER, completedAt: EARLIER });

    const outcome = await syncOnce(db, cloud.client, context(), { pull: true });
    expect(outcome).toMatchObject({ ran: true, pushed: 0, kept: 2, applied: 1, removed: 1 });
    expect(await db.get('profile', 'current')).toMatchObject({ units: 'kg' });
    expect(await db.get('workouts', 'w-gone')).toBeUndefined();
    expect(await db.count('outbox')).toBe(0);
    expect(cloud.ours().find((row) => row.store === 'profile')?.updated_at).toBe(LATER);
    db.close();
  });

  it('carries a restore’s backup time, so a version the cloud copy changed later stays', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    cloud.seed({
      store: 'meta',
      id: 'strength-maxes',
      // Changed in the cloud copy after the backup was made, and before now.
      updated_at: '2026-09-08T08:00:00.000Z',
      body: '{"id":"strength-maxes","maxes":{"b":1}}',
    });
    await db.put('cloud', {
      id: 'state',
      cursor: LATER,
      cursorId: 'zzz',
      lastPullAt: LATER,
      lastSyncAt: LATER,
      lastError: null,
      failures: 0,
      nextAttemptAt: null,
    });
    // A record with no time of its own, restored from a backup made before the cloud's change.
    await db.put('meta', { id: 'strength-maxes', maxes: {} }, { effectiveAt: EARLIER });
    const outcome = await syncOnce(db, cloud.client, context(), { pull: true });
    expect(outcome).toMatchObject({ kept: 1, pushed: 0 });
    expect(await db.get('meta', 'strength-maxes')).toMatchObject({ maxes: { b: 1 } });
    db.close();
  });

  it('empties a store on this phone alone when asked, dropping what was waiting for the removed records', async () => {
    const db = await openTestDb();
    await db.put('workouts', { id: 'w1', startedAt: NOW });
    await db.applyRemote('workouts', { id: 'w2', startedAt: NOW });
    await db.clear('workouts', { cloud: 'keep' });
    expect(await db.count('workouts')).toBe(0);
    expect(await db.count('outbox')).toBe(0);
    db.close();
  });
});

/**
 * Maintenance 25, the tenth review: a refused write whose cloud version cannot be fetched, a save
 * made while it is fetched, and a restart of the walk while a sync runs.
 */
describe('refused writes and restarts, with nothing lost or left apart', () => {
  const STATE_PAST = {
    id: 'state',
    cursor: LATER,
    cursorId: 'zzz',
    lastPullAt: LATER,
    lastSyncAt: LATER,
    lastError: null,
    failures: 0,
    nextAttemptAt: null,
    epoch: 0,
  };

  function cloudNewer() {
    const cloud = createFakeCloud();
    cloud.seed({
      store: 'profile',
      id: 'current',
      updated_at: LATER,
      body: JSON.stringify({ id: 'current', bodyweight: 190, updatedAt: LATER }),
    });
    return cloud;
  }

  /** A client whose fetch of one record's row fails, or waits on a gate. */
  function rowFetch(
    cloud: ReturnType<typeof createFakeCloud>,
    how: { fail?: boolean; gate?: Promise<void> },
  ) {
    return {
      ...cloud.client,
      execute: async (statement: Parameters<typeof cloud.client.execute>[0]) => {
        if (statement.sql.includes('AND store = ? AND id = ?')) {
          if (how.gate) await how.gate;
          if (how.fail) throw new Error('the copy did not answer');
        }
        return cloud.client.execute(statement);
      },
    };
  }

  it('reports what its push applied when the pull after it fails, so the screen reloads (sixth re-check)', async () => {
    const db = await openTestDb();
    const cloud = cloudNewer();
    await db.put('cloud', STATE_PAST);
    await db.put('profile', { id: 'current', bodyweight: 180, updatedAt: EARLIER });
    const pullFails = {
      ...cloud.client,
      execute: async (statement: Parameters<typeof cloud.client.execute>[0]) => {
        if (statement.sql.startsWith('SELECT store, id') && !statement.sql.includes('AND id = ?')) {
          throw new Error('the pull failed');
        }
        return cloud.client.execute(statement);
      },
    };
    const outcome = await syncOnce(db, pullFails, context(), { pull: true });
    expect(outcome).toMatchObject({ ran: true, applied: 1, error: 'the pull failed' });
    expect(await db.get('profile', 'current')).toMatchObject({ bodyweight: 190 });
    db.close();
  });

  it('reports what its push took back before a later step of the push failed (sixth re-check)', async () => {
    const db = await openTestDb();
    const cloud = cloudNewer();
    cloud.seed({
      store: 'workouts',
      id: 'w-late',
      updated_at: LATER,
      body: JSON.stringify({ id: 'w-late', startedAt: LATER, completedAt: LATER }),
    });
    await db.put('cloud', STATE_PAST);
    await db.put('profile', { id: 'current', bodyweight: 180, updatedAt: EARLIER });
    await db.put('workouts', { id: 'w-late', startedAt: EARLIER, completedAt: EARLIER });
    // Both writes are refused; the profile's newer version is taken back, then the fetch of the
    // workout's fails.
    const secondFails = {
      ...cloud.client,
      execute: async (statement: Parameters<typeof cloud.client.execute>[0]) => {
        if (
          statement.sql.includes('AND store = ? AND id = ?') &&
          statement.args.includes('w-late')
        ) {
          throw new Error('the copy did not answer');
        }
        return cloud.client.execute(statement);
      },
    };
    const outcome = await syncOnce(db, secondFails, context(), { pull: false });
    expect(outcome).toMatchObject({ ran: true, applied: 1, error: 'the copy did not answer' });
    expect(await db.get('profile', 'current')).toMatchObject({ bodyweight: 190 });
    db.close();
  });

  it('keeps a refused change queued when the cloud’s version cannot be fetched, and settles it later', async () => {
    const db = await openTestDb();
    const cloud = cloudNewer();
    await db.put('cloud', STATE_PAST);
    await db.put('profile', { id: 'current', bodyweight: 180, updatedAt: EARLIER });
    const failed = await syncOnce(db, rowFetch(cloud, { fail: true }), context(), { pull: true });
    expect(failed.error).toBe('the copy did not answer');
    // Still waiting: nothing says the two agree while they do not.
    expect(await db.count('outbox')).toBe(1);
    const settled = await syncOnce(db, cloud.client, context(), { pull: true, force: true });
    expect(settled).toMatchObject({ kept: 1, error: null });
    expect(await db.get('profile', 'current')).toMatchObject({ bodyweight: 190 });
    expect(await db.count('outbox')).toBe(0);
    db.close();
  });

  it('never puts the cloud’s version over a save made while it was being fetched', async () => {
    const db = await openTestDb();
    const cloud = cloudNewer();
    await db.put('cloud', STATE_PAST);
    await db.put('profile', { id: 'current', bodyweight: 180, updatedAt: EARLIER });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sync = syncOnce(db, rowFetch(cloud, { gate }), context(), { pull: true });
    await vi.waitFor(async () => {
      const queued = await db.get<OutboxEntry>('outbox', 'profile|current');
      expect(queued).toBeDefined();
    });
    // The lifter saves while the fetch is on its way: newer than the cloud's.
    const NEWEST = '2026-09-13T08:00:00.000Z';
    await new Promise((resolve) => setTimeout(resolve, 5));
    await db.put('profile', { id: 'current', bodyweight: 200, updatedAt: NEWEST });
    release();
    await sync;
    expect(await db.get('profile', 'current')).toMatchObject({ bodyweight: 200 });
    // Still queued, and the next sync takes it to the cloud copy.
    await syncOnce(db, cloud.client, context(), { pull: true, force: true });
    expect(cloud.ours().find((row) => row.store === 'profile')?.updated_at).toBe(NEWEST);
    db.close();
  });

  it('keeps a restart of the walk made while a sync runs, so the whole walk still comes', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    await db.put('cloud', STATE_PAST);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    const slow = {
      ...cloud.client,
      execute: async (statement: Parameters<typeof cloud.client.execute>[0]) => {
        if (statement.sql.startsWith('SELECT store, id') && !held) {
          held = true;
          await gate;
        }
        return cloud.client.execute(statement);
      },
    };
    const sync = syncOnce(db, slow, context(), { pull: true });
    await vi.waitFor(() => expect(held).toBe(true));
    await restartPull(db);
    release();
    await sync;
    expect((await readCloudState(db)).cursor).toBeNull();
    db.close();
  });
});
