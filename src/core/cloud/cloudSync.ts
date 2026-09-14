import {
  SYNCED_STORES,
  isSyncedStore,
  outboxKey,
  type Database,
  type Identified,
  type OutboxEntry,
} from '../storage/indexedDb';
import {
  CLOUD_CONFIG_ID,
  CLOUD_STATE_ID,
  DEFAULT_CLOUD_URL,
  REQUIRED_TABLES,
  occupancyStatement,
  schemaProbeStatement,
  PULL_PAGE,
  PUSH_BATCH,
  backoffMs,
  deviceInsertStatement,
  deviceUpdateStatement,
  emptyCloudState,
  pullStatement,
  recordTimestamp,
  toRemoteRow,
  tombstoneStatement,
  upsertStatement,
  type CloudClient,
  type CloudConfig,
  type CloudInspection,
  type CloudState,
  type CloudStatement,
} from './model';

/**
 * The sync engine. Push drains the outbox in batches and removes only the
 * entries it sent, unchanged. Pull walks rows newer than the cursor and applies
 * each one through the wrapper's remote methods, so nothing it applies is ever
 * re-enqueued. The first pull on a device restores everything; later pulls
 * apply only where the remote is newer and never over a pending local change,
 * and a device's own rows come back only where the device has lost them.
 * Nothing here logs, and nothing here touches the network without a client,
 * which only exists once a token is on the device.
 */

export interface SyncContext {
  now: () => string;
  deviceId: string;
  deviceLabel: string;
  isOnline: () => boolean;
}

export interface SyncOutcome {
  ran: boolean;
  reason?: 'offline' | 'backoff';
  pushed: number;
  applied: number;
  removed: number;
  error: string | null;
}

// The token itself lives in tokenVault.ts: two copies, verified writes, and a log.

/** The database this device syncs with: the one saved here, else the shipped default. */
export async function readCloudUrl(db: Database): Promise<string> {
  const record = await db.get<CloudConfig>('cloud', CLOUD_CONFIG_ID);
  return record && typeof record.url === 'string' && record.url.length > 0
    ? record.url
    : DEFAULT_CLOUD_URL;
}

export async function saveCloudUrl(db: Database, url: string, now: string): Promise<void> {
  const config: CloudConfig = { id: CLOUD_CONFIG_ID, url: url.trim(), savedAt: now };
  await db.put('cloud', config);
}

/**
 * What a database looks like before this device commits to it: whether it
 * carries the tables this app needs, and how much of this app's history it
 * already holds. Reads only; it never creates or alters anything.
 */
export async function inspectCloud(client: CloudClient): Promise<CloudInspection> {
  const tables = await client.execute(schemaProbeStatement());
  const present = new Set(
    tables.rows.map((row) => String(row.name ?? '')).filter((name) => name.length > 0),
  );
  const missingTables = REQUIRED_TABLES.filter((name) => !present.has(name));
  if (missingTables.length > 0)
    return { missingTables: [...missingTables], rows: 0, deviceIds: [] };
  const occupancy = await client.execute(occupancyStatement());
  const row = occupancy.rows[0] ?? {};
  const rows = Number(row.rows ?? 0);
  const devices = typeof row.devices === 'string' ? row.devices : '';
  return {
    missingTables: [],
    rows: Number.isFinite(rows) ? rows : 0,
    deviceIds: devices
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  };
}

/**
 * Queues every mirrored record for a push. Used when the device changes which
 * database it syncs with, so the new one receives the whole history rather than
 * only what changes next.
 */
export async function seedOutbox(db: Database): Promise<number> {
  let queued = 0;
  for (const store of SYNCED_STORES) {
    const records = await db.getAll<Identified>(store);
    for (const record of records) {
      await db.put(store, record);
      queued += 1;
    }
  }
  return queued;
}

export async function readCloudState(db: Database): Promise<CloudState> {
  const raw = await db.get<Partial<CloudState> & Identified>('cloud', CLOUD_STATE_ID);
  const state = emptyCloudState();
  if (!raw) return state;
  if (typeof raw.cursor === 'string') state.cursor = raw.cursor;
  if (typeof raw.cursorId === 'string') state.cursorId = raw.cursorId;
  if (typeof raw.lastPullAt === 'string') state.lastPullAt = raw.lastPullAt;
  if (typeof raw.lastSyncAt === 'string') state.lastSyncAt = raw.lastSyncAt;
  if (typeof raw.lastError === 'string') state.lastError = raw.lastError;
  if (typeof raw.failures === 'number') state.failures = raw.failures;
  if (typeof raw.nextAttemptAt === 'string') state.nextAttemptAt = raw.nextAttemptAt;
  return state;
}

/** Forgets the cursor so the next pull restores everything again; the outbox is kept. */
export async function resetCloudState(db: Database): Promise<void> {
  await db.delete('cloud', CLOUD_STATE_ID);
}

/**
 * Sends the next pull back to the beginning while remembering that this device
 * has pulled before, so the walk restores what this device lost and keeps a
 * pending local change or a newer local record, instead of treating the device
 * as new. Used when a token is entered again and when a copy of it was healed.
 */
export async function restartPull(db: Database): Promise<void> {
  const state = await readCloudState(db);
  state.cursor = null;
  state.cursorId = null;
  await db.put('cloud', state);
}

export async function pendingCount(db: Database): Promise<number> {
  return db.count('outbox');
}

function byQueue(a: OutboxEntry, b: OutboxEntry): number {
  return a.queuedAt.localeCompare(b.queuedAt) || a.id.localeCompare(b.id);
}

/** Sends the outbox in batches; an entry is removed only if it is still exactly what was sent. */
export async function pushOutbox(
  db: Database,
  client: CloudClient,
  context: SyncContext,
): Promise<number> {
  let pushed = 0;
  for (let guard = 0; guard < 1000; guard += 1) {
    const entries = (await db.getAll<OutboxEntry>('outbox')).sort(byQueue).slice(0, PUSH_BATCH);
    if (entries.length === 0) break;
    const now = context.now();
    const statements: CloudStatement[] = [];
    for (const entry of entries) {
      if (entry.op === 'put') {
        const record = await db.get<Identified>(entry.store, entry.recordId);
        statements.push(
          record
            ? upsertStatement(entry.store, record, context.deviceId, now)
            : tombstoneStatement(entry.store, entry.recordId, context.deviceId, now),
        );
      } else {
        statements.push(tombstoneStatement(entry.store, entry.recordId, context.deviceId, now));
      }
    }
    await client.batch(statements);
    for (const entry of entries) {
      const current = await db.get<OutboxEntry>('outbox', entry.id);
      if (current && current.queuedAt === entry.queuedAt && current.op === entry.op) {
        await db.delete('outbox', entry.id);
      }
    }
    pushed += entries.length;
  }
  return pushed;
}

export interface PullResult {
  applied: number;
  removed: number;
  cursor: string | null;
  cursorId: string | null;
}

export interface PullOptions {
  /** Walk every row of this app again from the beginning, under the same rules as any later pull. */
  fromStart?: boolean;
}

/**
 * Applies rows newer than the cursor, or every row when the cursor is empty or
 * the caller asks for the whole walk.
 *
 * A device that has never pulled takes the cloud's copy over anything it has
 * written itself and drops the pending entry, so a fresh install with a token
 * ends up with the cloud's data rather than pushing its onboarding defaults
 * over it. Every other walk keeps a pending local change and keeps the newer
 * of the two records.
 *
 * Rows this device wrote itself are the same data it holds, so they are left
 * alone while the record is still here, a change to it is waiting, or the row
 * is this device's own tombstone. A record that has vanished from this device
 * comes back from its own row: that is how a device recovers its own history.
 */
export async function pullRemote(
  db: Database,
  client: CloudClient,
  context: SyncContext,
  state: CloudState,
  options: PullOptions = {},
): Promise<PullResult> {
  const cloudWins = state.cursor === null && state.lastPullAt === null;
  const fromStart = options.fromStart === true || state.cursor === null;
  let cursor = fromStart ? null : state.cursor;
  let cursorId = fromStart ? null : state.cursorId;
  let applied = 0;
  let removed = 0;
  for (let guard = 0; guard < 1000; guard += 1) {
    const result = await client.execute(pullStatement(cursor, cursorId));
    const rows = result.rows
      .map(toRemoteRow)
      .filter((row): row is NonNullable<typeof row> => row !== null);
    for (const row of rows) {
      cursor = row.synced_at;
      cursorId = row.id;
      if (!isSyncedStore(row.store)) continue;
      const store = row.store;
      const key = outboxKey(store, row.id);
      const pending = await db.get<OutboxEntry>('outbox', key);
      const local = await db.get<Identified>(store, row.id);
      if (row.device_id === context.deviceId) {
        if (local || pending || row.deleted) continue;
      } else {
        if (pending) {
          if (!cloudWins) continue;
          await db.delete('outbox', key);
        }
        if (!cloudWins && local) {
          const stamp = recordTimestamp(store, local as unknown as Record<string, unknown>);
          if (stamp !== null && stamp > row.updated_at) continue;
        }
      }
      if (row.deleted) {
        if (!local) continue;
        await db.applyRemoteDelete(store, row.id);
        removed += 1;
        continue;
      }
      const body = parseBody(row.body);
      if (!body || body.id !== row.id) continue;
      await db.applyRemote(store, body);
      applied += 1;
    }
    if (rows.length < PULL_PAGE) break;
  }
  return { applied, removed, cursor, cursorId };
}

function parseBody(body: string | null): Identified | null {
  if (body === null) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && typeof (parsed as Identified).id === 'string') {
      return parsed as Identified;
    }
  } catch {
    // an unreadable body is skipped, never thrown
  }
  return null;
}

export async function registerDevice(client: CloudClient, context: SyncContext): Promise<void> {
  const now = context.now();
  const updated = await client.execute(
    deviceUpdateStatement(context.deviceId, context.deviceLabel, now),
  );
  if (updated.rowsAffected === 0) {
    await client.execute(deviceInsertStatement(context.deviceId, context.deviceLabel, now));
  }
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || 'Sync failed.';
}

/**
 * One sync: register the device, push, then pull when asked. Offline or inside a
 * retry delay it does nothing. A failure records the error and a growing delay;
 * the outbox is untouched either way. With `full` the pull walks every row of
 * this app again from the beginning, which brings back anything this device has
 * lost; "Sync now" uses it.
 */
export async function syncOnce(
  db: Database,
  client: CloudClient,
  context: SyncContext,
  options: { pull: boolean; force?: boolean; full?: boolean },
): Promise<SyncOutcome> {
  const idle: SyncOutcome = { ran: false, pushed: 0, applied: 0, removed: 0, error: null };
  if (!context.isOnline()) return { ...idle, reason: 'offline' };
  const state = await readCloudState(db);
  if (!options.force && state.nextAttemptAt && state.nextAttemptAt > context.now()) {
    return { ...idle, reason: 'backoff' };
  }
  try {
    await registerDevice(client, context);
    let applied = 0;
    let removed = 0;
    const pull = async () => {
      const pulled = await pullRemote(db, client, context, state, {
        fromStart: options.full === true,
      });
      applied = pulled.applied;
      removed = pulled.removed;
      state.cursor = pulled.cursor ?? state.cursor ?? '';
      state.cursorId = pulled.cursorId;
      state.lastPullAt = context.now();
    };
    // A device whose cursor is empty pulls first: a new device, so its onboarding
    // defaults never overwrite the copy; a recovering one, so what it lost is back
    // before its queue goes up. Every other sync pushes first.
    const pullFirst = state.cursor === null;
    if (options.pull && pullFirst) await pull();
    const pushed = await pushOutbox(db, client, context);
    if (options.pull && !pullFirst) await pull();
    state.lastSyncAt = context.now();
    state.lastError = null;
    state.failures = 0;
    state.nextAttemptAt = null;
    await db.put('cloud', state);
    return { ran: true, pushed, applied, removed, error: null };
  } catch (error) {
    state.failures += 1;
    state.lastError = describeError(error);
    state.nextAttemptAt = new Date(
      Date.parse(context.now()) + backoffMs(state.failures),
    ).toISOString();
    await db.put('cloud', state);
    return { ran: true, pushed: 0, applied: 0, removed: 0, error: state.lastError };
  }
}
