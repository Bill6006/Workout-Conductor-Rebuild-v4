import {
  SYNCED_STORES,
  type SyncedStore,
  isSyncedStore,
  outboxKey,
  sameQueuedChange,
  type Database,
  type Identified,
  type OutboxEntry,
} from '../storage/indexedDb';
import {
  CLOUD_CONFIG_ID,
  CLOUD_STATE_ID,
  DATABASE_BIRTH_ID,
  DEFAULT_CLOUD_URL,
  REQUIRED_TABLES,
  occupancyStatement,
  schemaProbeStatement,
  PULL_MAX_PAGES,
  PUSH_BATCH,
  pullLimit,
  backoffMs,
  deviceInsertStatement,
  deviceUpdateStatement,
  emptyCloudState,
  pullStatement,
  recordTimestamp,
  rowStatement,
  toRemoteRow,
  tombstoneStatement,
  upsertStatement,
  type CloudClient,
  type CloudConfig,
  type CloudInspection,
  type CloudState,
  type CloudStatement,
  type DatabaseBirth,
  type RemoteRow,
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
  /** How long a sync's first request may take: CLOUD_REQUEST_TIMEOUT_MS (tests shorten it). */
  requestTimeoutMs?: number;
  /** How long each later request may take: CLOUD_TRANSFER_TIMEOUT_MS (tests shorten it). */
  transferTimeoutMs?: number;
}

export interface SyncOutcome {
  ran: boolean;
  reason?: 'offline' | 'backoff';
  pushed: number;
  applied: number;
  removed: number;
  /** Records the cloud copy held in a newer version than this phone sent: the phone took them. */
  kept: number;
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
  if (typeof raw.epoch === 'number') state.epoch = raw.epoch;
  return state;
}

/**
 * Forgets a failed attempt (Maintenance 25): with the token removed, nothing is trying to sync, so
 * an error from before is no longer news.
 */
export async function clearSyncError(db: Database): Promise<void> {
  const state = await readCloudState(db);
  if (state.lastError === null && state.failures === 0 && state.nextAttemptAt === null) return;
  state.lastError = null;
  state.failures = 0;
  state.nextAttemptAt = null;
  await db.put('cloud', state);
}

/** Forgets the cursor so the next pull restores everything again; the outbox is kept. */
export async function resetCloudState(db: Database): Promise<void> {
  const before = await readCloudState(db);
  await db.put('cloud', { ...emptyCloudState(), epoch: before.epoch + 1 });
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
  state.epoch += 1;
  await db.put('cloud', state);
}

export async function pendingCount(db: Database): Promise<number> {
  return db.count('outbox');
}

/**
 * When this phone's database was made (null when it was made before births were recorded), and
 * when the first walk of the cloud copy since then finished (null until it has).
 */
export async function readDatabaseBirth(
  db: Database,
): Promise<{ at: string | null; walkedAt: string | null }> {
  const record = await db.get<DatabaseBirth>('cloud', DATABASE_BIRTH_ID);
  return {
    at: record && typeof record.at === 'string' ? record.at : null,
    walkedAt: record && typeof record.walkedAt === 'string' ? record.walkedAt : null,
  };
}

/** Marks the first walk since this database was made as finished, once. */
async function noteWalked(db: Database, now: string): Promise<void> {
  const record = await db.get<DatabaseBirth>('cloud', DATABASE_BIRTH_ID);
  if (!record || typeof record.at !== 'string' || typeof record.walkedAt === 'string') return;
  await db.put('cloud', { ...record, walkedAt: now });
}

/**
 * Records once when this database was made: now for an empty one (a new install, or a phone
 * whose storage was cleared), null for one that already holds records from before births were
 * recorded. Returns the birth.
 */
export async function noteDatabaseBirth(
  db: Database,
  now: string,
  empty: boolean,
): Promise<string | null> {
  const record = await db.get<DatabaseBirth>('cloud', DATABASE_BIRTH_ID);
  if (record) return typeof record.at === 'string' ? record.at : null;
  const birth: DatabaseBirth = { id: DATABASE_BIRTH_ID, at: empty ? now : null };
  await db.put('cloud', birth);
  return birth.at;
}

function byQueue(a: OutboxEntry, b: OutboxEntry): number {
  return a.queuedAt.localeCompare(b.queuedAt) || a.id.localeCompare(b.id);
}

export interface PushResult {
  /** Records the cloud copy took. */
  pushed: number;
  /** Records the cloud copy refused, holding a newer version; this phone took that version. */
  kept: number;
  applied: number;
  removed: number;
}

/** One record's row in the cloud copy, or null when there is none. */
async function fetchRow(
  client: CloudClient,
  store: OutboxEntry['store'],
  id: string,
): Promise<RemoteRow | null> {
  const result = await client.execute(rowStatement(store, id));
  return (
    result.rows
      .map(toRemoteRow)
      .find((candidate): candidate is NonNullable<typeof candidate> => candidate !== null) ?? null
  );
}

/**
 * Sends the outbox in batches; an entry is removed only if it is still exactly what was sent. A
 * write the cloud copy refuses because it holds a newer version is not left as if it had gone:
 * the phone takes the cloud's version, unless a change made here since waits to go. Taking it
 * needs the cloud's row: when that cannot be fetched the entry stays queued and the sync fails,
 * to try again (the tenth review: dropped first, a failed fetch left the two apart for good).
 */
/** What a sync has changed on this phone so far, kept by its caller: a failure part-way counts it. */
export interface SyncTally {
  applied: number;
  removed: number;
}

export async function pushOutbox(
  db: Database,
  client: CloudClient,
  context: SyncContext,
  tally: SyncTally = { applied: 0, removed: 0 },
): Promise<PushResult> {
  const result: PushResult = { pushed: 0, kept: 0, applied: 0, removed: 0 };
  for (let guard = 0; guard < 1000; guard += 1) {
    const entries = (await db.getAll<OutboxEntry>('outbox')).sort(byQueue).slice(0, PUSH_BATCH);
    if (entries.length === 0) break;
    const now = context.now();
    const statements: CloudStatement[] = [];
    for (const entry of entries) {
      const { store, recordId } = entry;
      // A change is as of when it was made, not when it goes: a deletion, or a record with no time
      // of its own (meta), made offline must not beat a change made since on another device, nor
      // lose to one made before it (the tenth review's ninth and tenth re-checks). A restore's
      // changes are as of its backup.
      const madeAt = entry.effectiveAt ?? entry.queuedAt;
      if (entry.op === 'put') {
        const record = await db.get<Identified>(store, recordId);
        statements.push(
          record
            ? upsertStatement(store, record, context.deviceId, now, madeAt)
            : tombstoneStatement(store, recordId, context.deviceId, now, madeAt),
        );
      } else {
        statements.push(tombstoneStatement(store, recordId, context.deviceId, now, madeAt));
      }
    }
    const changed = await client.batch(statements);
    const refused: OutboxEntry[] = [];
    for (const [index, entry] of entries.entries()) {
      if (changed[index] === 0) {
        refused.push(entry);
        continue;
      }
      const current = await db.get<OutboxEntry>('outbox', entry.id);
      if (current && sameQueuedChange(current, entry)) {
        await db.delete('outbox', entry.id);
      }
      result.pushed += 1;
    }
    for (const entry of refused) {
      const row = await fetchRow(client, entry.store, entry.recordId);
      const body = row && !row.deleted ? parseBody(row.body) : null;
      const value = row === null ? undefined : row.deleted ? null : (body ?? undefined);
      const taken = await db.takeRemoteIfQueued(
        entry.store,
        entry.recordId,
        value && value.id === entry.recordId ? value : value === null ? null : undefined,
        entry,
      );
      if (taken === 'applied') {
        result.applied += 1;
        tally.applied += 1;
      }
      if (taken === 'removed') {
        result.removed += 1;
        tally.removed += 1;
      }
      if (taken !== 'skipped') result.kept += 1;
    }
  }
  return result;
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
  /** Rows asked for in one request (PULL_PAGE when missing; tests ask for fewer). */
  pageSize?: number;
  /** Pages before the walk is taken as cut short (PULL_MAX_PAGES when missing). */
  maxPages?: number;
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
  tally: SyncTally = { applied: 0, removed: 0 },
): Promise<PullResult> {
  const cloudWins = state.cursor === null && state.lastPullAt === null;
  const fromStart = options.fromStart === true || state.cursor === null;
  // A phone whose storage was cleared keeps its device id, so the rows it wrote come back as its
  // own. Until its first walk since then is done, a row it wrote before this database was made
  // takes the place of a record made here since (setup's defaults), and a change waiting for that
  // record is dropped: the history is never overwritten by what stood in for it (Maintenance 25).
  const birth = await readDatabaseBirth(db);
  const lostBefore = birth.at !== null && birth.walkedAt === null ? birth.at : null;
  let cursor = fromStart ? null : state.cursor;
  let cursorId = fromStart ? null : state.cursorId;
  const limit = pullLimit(options.pageSize);
  let applied = 0;
  let removed = 0;
  // Rows whose cloud version wins this walk (a cleared phone's own, or every row on a device's
  // first walk), so a twin made here while the walk ran gives way to it at the end.
  const won = new Map<string, { store: SyncedStore; row: RemoteRow }>();
  let ended = false;
  for (let page = 0; page < (options.maxPages ?? PULL_MAX_PAGES); page += 1) {
    const result = await client.execute(pullStatement(cursor, cursorId, limit));
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
        if (lostBefore !== null && row.synced_at < lostBefore) {
          if (pending) await db.delete('outbox', key);
          won.set(key, { store, row });
        } else if (local || pending || row.deleted) continue;
      } else {
        if (cloudWins) won.set(key, { store, row });
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
        tally.removed += 1;
        continue;
      }
      const body = parseBody(row.body);
      if (!body || body.id !== row.id) continue;
      await db.applyRemote(store, body);
      applied += 1;
      tally.applied += 1;
    }
    if (rows.length < limit) {
      ended = true;
      break;
    }
  }
  // A walk that has not reached its end is never taken as done: its cursor would stop short, and a
  // first walk would end the cleared-phone rule over rows it never read (the tenth review's eighth
  // re-check). What it applied counts; the next attempt walks again.
  if (!ended) throw new Error('The walk of the cloud copy did not reach its end.');
  // A record made here while the walk ran, after the walk had brought back its cloud version
  // (setup finished during it, a place it left out deleted), is a twin of that version: the
  // cloud's stands, and the change waiting to go is dropped (the tenth review).
  for (const [key, { store, row }] of won) {
    const pending = await db.get<OutboxEntry>('outbox', key);
    if (!pending) continue;
    const body = row.deleted ? null : parseBody(row.body);
    const value = row.deleted ? null : body && body.id === row.id ? body : undefined;
    const taken = await db.takeRemoteIfQueued(store, row.id, value, pending);
    if (taken === 'applied') {
      applied += 1;
      tally.applied += 1;
    }
    if (taken === 'removed') {
      removed += 1;
      tally.removed += 1;
    }
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
 * Writes a sync's state. When the walk was restarted while it ran (a token entered again, a
 * restore, a database switched), only its outcome is written: the restart's cursor stands, so the
 * whole walk it asked for still comes (the tenth review).
 */
async function keepState(db: Database, state: CloudState): Promise<void> {
  const stored = await readCloudState(db);
  if (stored.epoch === state.epoch) {
    await db.put('cloud', state);
    return;
  }
  await db.put('cloud', {
    ...stored,
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError,
    failures: state.failures,
    nextAttemptAt: state.nextAttemptAt,
  });
}

/**
 * One sync: register the device, push, then pull when asked. Offline or inside a
 * retry delay it does nothing. A failure records the error and a growing delay;
 * the outbox is untouched either way. With `full` the pull walks every row of
 * this app again from the beginning, which brings back anything this device has
 * lost; "Sync now" uses it.
 */
/**
 * How long a sync's first request may take. A copy that never answers fails the sync then, so no
 * sync hangs, and setup, which waits its turn behind the syncs (the tenth review's fifth
 * re-check), waits that long for it.
 */
export const CLOUD_REQUEST_TIMEOUT_MS = 30_000;

/**
 * How long each later request of a sync may take, once the copy has answered: a page of history
 * or a batch of changes on a slow connection takes its time, and still comes (the seventh and
 * eighth re-checks: a 30-second bound failed such a page every time). Only a copy that stops
 * answering part-way through a sync waits this long.
 */
export const CLOUD_TRANSFER_TIMEOUT_MS = 5 * 60_000;

/** A request to the cloud copy that ran out of time. */
export class CloudTimeoutError extends Error {
  constructor(ms: number) {
    super(
      ms >= 60_000
        ? `no answer within ${Math.round(ms / 60_000)} minutes`
        : `no answer within ${Math.round(ms / 1000)} seconds`,
    );
    this.name = 'CloudTimeoutError';
  }
}

/** Work that fails with CloudTimeoutError when it takes longer than `ms`. */
export function withinBound<T>(
  work: Promise<T>,
  ms: number = CLOUD_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CloudTimeoutError(ms)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function answeringWithin(client: CloudClient, ms: number): CloudClient {
  return {
    execute: (statement) => withinBound(client.execute(statement), ms),
    batch: (statements) => withinBound(client.batch(statements), ms),
    close: () => client.close(),
  };
}

export async function syncOnce(
  db: Database,
  untimed: CloudClient,
  context: SyncContext,
  options: { pull: boolean; force?: boolean; full?: boolean },
): Promise<SyncOutcome> {
  // The first request finds out whether the copy answers at all; after it, the copy is answering,
  // and a page or a batch may take its time on a slow connection (the eighth re-check).
  const first = answeringWithin(untimed, context.requestTimeoutMs ?? CLOUD_REQUEST_TIMEOUT_MS);
  const client = answeringWithin(untimed, context.transferTimeoutMs ?? CLOUD_TRANSFER_TIMEOUT_MS);
  const idle: SyncOutcome = {
    ran: false,
    pushed: 0,
    applied: 0,
    removed: 0,
    kept: 0,
    error: null,
  };
  if (!context.isOnline()) return { ...idle, reason: 'offline' };
  const state = await readCloudState(db);
  if (!options.force && state.nextAttemptAt && state.nextAttemptAt > context.now()) {
    return { ...idle, reason: 'backoff' };
  }
  // What the sync applied counts even when a later step fails, or the pull fails part-way: the
  // screen reloads from it (the tenth review's fifth and sixth re-checks).
  const tally: SyncTally = { applied: 0, removed: 0 };
  try {
    await registerDevice(first, context);
    const pull = async () => {
      const pulled = await pullRemote(
        db,
        client,
        context,
        state,
        { fromStart: options.full === true },
        tally,
      );
      state.cursor = pulled.cursor ?? state.cursor ?? '';
      state.cursorId = pulled.cursorId;
      state.lastPullAt = context.now();
      // The first walk since this database was made is done: the cleared-phone rule ends.
      await noteWalked(db, context.now());
    };
    // A device whose cursor is empty pulls first, whatever started the sync: a new device, so
    // its onboarding defaults never overwrite the copy; a recovering one, so what it lost is back
    // before its queue goes up. A pull that fails pushes nothing (Maintenance 25: a save made
    // before the first pull used to push on its own). Every other sync pushes first.
    const pullFirst = state.cursor === null;
    if (pullFirst) await pull();
    const pushed = await pushOutbox(db, client, context, tally);
    if (options.pull && !pullFirst) await pull();
    state.lastSyncAt = context.now();
    state.lastError = null;
    state.failures = 0;
    state.nextAttemptAt = null;
    await keepState(db, state);
    return {
      ran: true,
      pushed: pushed.pushed,
      applied: tally.applied,
      removed: tally.removed,
      kept: pushed.kept,
      error: null,
    };
  } catch (error) {
    state.failures += 1;
    state.lastError = describeError(error);
    state.nextAttemptAt = new Date(
      Date.parse(context.now()) + backoffMs(state.failures),
    ).toISOString();
    // A full disk refuses this write too: what the sync applied is still reported, so the screen
    // reloads from it (the seventh re-check).
    await keepState(db, state).catch(() => undefined);
    return {
      ran: true,
      pushed: 0,
      applied: tally.applied,
      removed: tally.removed,
      kept: 0,
      error: state.lastError,
    };
  }
}
