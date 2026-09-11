import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createFakeCloud } from '../../test/fakeCloud';
import { openDatabase, type OutboxEntry } from '../storage/indexedDb';
import { pullRemote, readCloudState, syncOnce, type SyncContext } from './cloudSync';
import { CLOUD_APP, backoffMs } from './model';

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
    // A record with no timestamp of its own carries the sync time.
    expect(rows.find((row) => row.id === 'coach-routes')?.updated_at).toBe(NOW);
    expect(rows.find((row) => row.id === 'gone')).toMatchObject({ deleted: 1, body: null });
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

  it('later pulls skip own rows, keep a pending local change, keep a newer local record, and delete on tombstones', async () => {
    const db = await openTestDb();
    const cloud = createFakeCloud();
    // First sync sets the cursor; nothing remote yet.
    await syncOnce(db, cloud.client, context(), { pull: true });

    await db.applyRemote('locations', { id: 'gym', name: 'Gym', updatedAt: EARLIER });
    await db.applyRemote('locations', { id: 'home', name: 'Home', updatedAt: LATER });
    await db.applyRemote('workouts', { id: 'w9', startedAt: EARLIER });
    await db.put('savedWorkouts', { id: 's1', name: 'Mine', createdAt: NOW });

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
    expect(pulled).toMatchObject({ applied: 1, removed: 1 });
    expect(await db.get('locations', 'gym')).toMatchObject({ name: 'Gym renamed' });
    expect(await db.get('locations', 'home')).toMatchObject({ name: 'Home' });
    expect(await db.get('savedWorkouts', 's1')).toMatchObject({ name: 'Mine' });
    expect(await db.get('workouts', 'w9')).toBeUndefined();
    expect(await db.get('profile', 'current')).toBeUndefined();
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
