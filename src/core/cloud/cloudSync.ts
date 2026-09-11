import {
  isSyncedStore,
  outboxKey,
  type Database,
  type Identified,
  type OutboxEntry,
} from '../storage/indexedDb';
import {
  CLOUD_STATE_ID,
  CLOUD_TOKEN_ID,
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
  type CloudState,
  type CloudStatement,
  type CloudToken,
} from './model';

/**
 * The sync engine. Push drains the outbox in batches and removes only the
 * entries it sent, unchanged. Pull walks rows newer than the cursor and applies
 * each one through the wrapper's remote methods, so nothing it applies is ever
 * re-enqueued. The first pull on a device restores everything; later pulls
 * apply only where the remote is newer and never over a pending local change.
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

export async function readCloudToken(db: Database): Promise<string | null> {
  const record = await db.get<CloudToken>('cloud', CLOUD_TOKEN_ID);
  return record && typeof record.value === 'string' && record.value.length > 0
    ? record.value
    : null;
}

export async function saveCloudToken(db: Database, value: string, now: string): Promise<void> {
  const token: CloudToken = { id: CLOUD_TOKEN_ID, value, savedAt: now };
  await db.put('cloud', token);
}

export async function clearCloudToken(db: Database): Promise<void> {
  await db.delete('cloud', CLOUD_TOKEN_ID);
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

/**
 * Applies rows newer than the cursor. On the first pull every row wins and any
 * pending local entry for the same record is dropped, so a fresh install with a
 * token ends up with the cloud's data. Afterwards a pending local change wins,
 * then the newer of the two timestamps.
 */
export async function pullRemote(
  db: Database,
  client: CloudClient,
  context: SyncContext,
  state: CloudState,
): Promise<PullResult> {
  const initial = state.cursor === null;
  let cursor = state.cursor;
  let cursorId = state.cursorId;
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
      if (row.device_id === context.deviceId) continue;
      if (!isSyncedStore(row.store)) continue;
      const store = row.store;
      const key = outboxKey(store, row.id);
      const pending = await db.get<OutboxEntry>('outbox', key);
      if (pending) {
        if (!initial) continue;
        await db.delete('outbox', key);
      }
      const local = await db.get<Identified>(store, row.id);
      if (!initial && local) {
        const stamp = recordTimestamp(store, local as unknown as Record<string, unknown>);
        if (stamp !== null && stamp > row.updated_at) continue;
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
 * the outbox is untouched either way.
 */
export async function syncOnce(
  db: Database,
  client: CloudClient,
  context: SyncContext,
  options: { pull: boolean; force?: boolean },
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
      const pulled = await pullRemote(db, client, context, state);
      applied = pulled.applied;
      removed = pulled.removed;
      state.cursor = pulled.cursor ?? state.cursor ?? '';
      state.cursorId = pulled.cursorId;
      state.lastPullAt = context.now();
    };
    // A device that has never pulled restores first, so its onboarding defaults
    // never overwrite the copy; every later sync pushes first.
    const initial = state.cursor === null;
    if (options.pull && initial) await pull();
    const pushed = await pushOutbox(db, client, context);
    if (options.pull && !initial) await pull();
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
