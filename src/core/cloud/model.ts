import type { Identified, SyncedStore } from '../storage/indexedDb';

/**
 * The cloud copy: a Turso database, one per person. Its schema is fixed and
 * never created or altered here. This app writes only rows where
 * `app = 'workout-conductor'` and may read others.
 *
 *   records(app, store, id, day, body, updated_at, deleted, device_id, synced_at)
 *     primary key (app, store, id)
 *   devices(device_id, app, label, first_seen, last_sync)
 *   schema_meta
 *
 * The address is not a secret and ships as a default; a person with their own
 * database types theirs instead, and it is kept beside the token. The token is
 * pasted once into Settings and lives in IndexedDB on the device; it never
 * appears in source, the built bundle, tests, CI, or logs.
 */

export const DEFAULT_CLOUD_URL = 'libsql://life-record-bill6006.aws-us-east-1.turso.io';
/** The tables this app needs; a database without them is not set up yet. */
export const REQUIRED_TABLES = ['records', 'devices'] as const;
export const CLOUD_APP = 'workout-conductor';
export const PUSH_BATCH = 50;
export const PULL_PAGE = 500;
/**
 * Pages a walk may take before it is taken as cut short, not done: 500,000 rows at full pages
 * (the tenth review's eighth re-check: a walk stopped here used to count as finished).
 */
export const PULL_MAX_PAGES = 1000;
export const PULL_INTERVAL_MS = 15 * 60_000;
/** Retry delays after a failed sync: 30 s, 1 min, 2 min, ... capped at 10 min. */
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 10 * 60_000;

export type CloudValue = string | number | null;

export interface CloudStatement {
  sql: string;
  args: CloudValue[];
}

export interface CloudResult {
  rows: Record<string, unknown>[];
  rowsAffected: number;
}

/** The only surface the sync engine talks to; the libsql adapter and the test fake both implement it. */
export interface CloudClient {
  execute(statement: CloudStatement): Promise<CloudResult>;
  /**
   * Runs every statement in one write transaction and says how many rows each one changed, in
   * order: 0 for a write the cloud refused because it holds a newer version.
   */
  batch(statements: CloudStatement[]): Promise<number[]>;
  close(): void;
}

export interface RemoteRow {
  store: string;
  id: string;
  day: string | null;
  body: string | null;
  updated_at: string;
  deleted: boolean;
  device_id: string | null;
  synced_at: string;
}

export const CLOUD_TOKEN_ID = 'token';
export const CLOUD_STATE_ID = 'state';
export const CLOUD_CONFIG_ID = 'config';
/**
 * When this phone's database was made (Maintenance 25). A row this device wrote before then was
 * lost here, so on the walk that restores it the cloud's copy wins over one made since: setup's
 * defaults on a cleared phone never overwrite the history they stand in for.
 */
export const DATABASE_BIRTH_ID = 'birth';

export interface DatabaseBirth extends Identified {
  id: typeof DATABASE_BIRTH_ID;
  /** Null for a database made before births were recorded: nothing in it was lost. */
  at: string | null;
  /**
   * When the first walk of the cloud copy since then finished: the rule above ends there, and
   * only there, so switching databases and back never wakes it again (the tenth review).
   */
  walkedAt?: string | null;
}

/** The database this device syncs with. Not a secret, but not in the bundle either once changed. */
export interface CloudConfig extends Identified {
  id: typeof CLOUD_CONFIG_ID;
  url: string;
  savedAt: string;
}

/** What a database looks like before this device commits to it. */
export interface CloudInspection {
  missingTables: string[];
  rows: number;
  deviceIds: string[];
}

export function looksLikeLibsqlUrl(raw: string): boolean {
  const value = raw.trim();
  if (!/^(libsql|wss|https):[/][/][^\s]+$/i.test(value)) return false;
  return !/[\s"'<>]/.test(value);
}

export function schemaProbeStatement(): CloudStatement {
  return {
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('records', 'devices')",
    args: [],
  };
}

/** How much of this app's history a database already holds, and which devices wrote it. */
export function occupancyStatement(): CloudStatement {
  return {
    sql: 'SELECT count(*) AS rows, group_concat(DISTINCT device_id) AS devices FROM records WHERE app = ?',
    args: [CLOUD_APP],
  };
}

export interface CloudToken extends Identified {
  id: typeof CLOUD_TOKEN_ID;
  value: string;
  savedAt: string;
}

export interface CloudState extends Identified {
  id: typeof CLOUD_STATE_ID;
  /** synced_at of the last row applied; null until the first pull, which restores everything. */
  cursor: string | null;
  cursorId: string | null;
  lastPullAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  failures: number;
  nextAttemptAt: string | null;
  /**
   * Counts restarts of the walk (a token entered again, a restore, a database switched). A sync
   * that read the state before one never writes its old cursor back over it (the tenth review).
   */
  epoch: number;
}

export function emptyCloudState(): CloudState {
  return {
    id: CLOUD_STATE_ID,
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

type Loose = Record<string, unknown>;

function isoOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The record's own timestamp, when it has one: what `updated_at` carries and what a pull compares. */
export function recordTimestamp(store: SyncedStore, record: Loose): string | null {
  switch (store) {
    case 'profile':
    case 'locations':
    case 'customExercises':
    case 'customInstructions':
      return isoOrNull(record.updatedAt);
    case 'workouts':
      return isoOrNull(record.completedAt) ?? isoOrNull(record.startedAt);
    case 'savedWorkouts':
      return isoOrNull(record.createdAt);
    case 'meta':
      return null;
  }
}

/** The workout date for workout records; null for everything else. */
export function recordDay(store: SyncedStore, record: Loose): string | null {
  if (store !== 'workouts') return null;
  const stamp = recordTimestamp(store, record);
  return stamp ? stamp.slice(0, 10) : null;
}

/**
 * A record for the cloud copy. `updated_at` is the record's own time; one without a time takes
 * `effectiveAt`, the time the change was made (a restore's: its backup's), else now. The cloud
 * keeps the newer of two versions.
 */
export function upsertStatement(
  store: SyncedStore,
  record: Identified,
  deviceId: string,
  now: string,
  effectiveAt?: string,
): CloudStatement {
  return {
    sql:
      'INSERT INTO records (app, store, id, day, body, updated_at, deleted, device_id, synced_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?) ' +
      'ON CONFLICT(app, store, id) DO UPDATE SET day = excluded.day, body = excluded.body, ' +
      'updated_at = excluded.updated_at, deleted = 0, device_id = excluded.device_id, ' +
      'synced_at = excluded.synced_at WHERE excluded.updated_at >= records.updated_at',
    args: [
      CLOUD_APP,
      store,
      record.id,
      recordDay(store, record as unknown as Loose),
      JSON.stringify(record),
      recordTimestamp(store, record as unknown as Loose) ?? effectiveAt ?? now,
      deviceId,
      now,
    ],
  };
}

/**
 * The body a deletion carries. The live table's body column is NOT NULL, and a write batch with
 * one row it refuses is refused whole, so a deletion with no body held back every upload queued
 * with or after it (Maintenance 25: Life Mirror's uploads stopped this way on 2026-10-02). Every
 * reader takes `deleted` first and never reads it.
 */
export const TOMBSTONE_BODY = '{}';

/** A deletion for the cloud copy, as of now or `effectiveAt`; a version changed later stays. */
export function tombstoneStatement(
  store: SyncedStore,
  id: string,
  deviceId: string,
  now: string,
  effectiveAt?: string,
): CloudStatement {
  return {
    sql:
      'INSERT INTO records (app, store, id, day, body, updated_at, deleted, device_id, synced_at) ' +
      'VALUES (?, ?, ?, NULL, ?, ?, 1, ?, ?) ' +
      'ON CONFLICT(app, store, id) DO UPDATE SET day = NULL, body = excluded.body, ' +
      'updated_at = excluded.updated_at, deleted = 1, device_id = excluded.device_id, ' +
      'synced_at = excluded.synced_at WHERE excluded.updated_at >= records.updated_at',
    args: [CLOUD_APP, store, id, TOMBSTONE_BODY, effectiveAt ?? now, deviceId, now],
  };
}

/** One record's row, to take the cloud's version of a record it refused to replace. */
export function rowStatement(store: SyncedStore, id: string): CloudStatement {
  return {
    sql:
      'SELECT store, id, day, body, updated_at, deleted, device_id, synced_at FROM records ' +
      'WHERE app = ? AND store = ? AND id = ? LIMIT 1',
    args: [CLOUD_APP, store, id],
  };
}

/** The rows one pull request asks for: a whole number from 1 to PULL_PAGE. */
export function pullLimit(size?: number): number {
  return Math.max(1, Math.min(PULL_PAGE, Math.floor(size ?? PULL_PAGE)));
}

/** Rows of this app newer than the cursor, oldest first, one page at a time. */
export function pullStatement(
  cursor: string | null,
  cursorId: string | null,
  size?: number,
): CloudStatement {
  return {
    sql:
      'SELECT store, id, day, body, updated_at, deleted, device_id, synced_at FROM records ' +
      'WHERE app = ? AND (synced_at > ? OR (synced_at = ? AND id > ?)) ' +
      `ORDER BY synced_at ASC, id ASC LIMIT ${pullLimit(size)}`,
    args: [CLOUD_APP, cursor ?? '', cursor ?? '', cursorId ?? ''],
  };
}

export function deviceUpdateStatement(
  deviceId: string,
  label: string,
  now: string,
): CloudStatement {
  return {
    sql: 'UPDATE devices SET last_sync = ?, label = ? WHERE device_id = ? AND app = ?',
    args: [now, label, deviceId, CLOUD_APP],
  };
}

export function deviceInsertStatement(
  deviceId: string,
  label: string,
  now: string,
): CloudStatement {
  return {
    sql: 'INSERT INTO devices (device_id, app, label, first_seen, last_sync) VALUES (?, ?, ?, ?, ?)',
    args: [deviceId, CLOUD_APP, label, now, now],
  };
}

function truthy(value: unknown): boolean {
  return value === 1 || value === true || value === '1' || value === 'true';
}

/** Reads one pulled row tolerantly; null when it cannot be a record of ours. */
export function toRemoteRow(raw: Record<string, unknown>): RemoteRow | null {
  const store = raw.store;
  const id = raw.id;
  const syncedAt = raw.synced_at;
  if (typeof store !== 'string' || typeof id !== 'string' || typeof syncedAt !== 'string') {
    return null;
  }
  return {
    store,
    id,
    day: isoOrNull(raw.day),
    body: typeof raw.body === 'string' ? raw.body : null,
    updated_at: isoOrNull(raw.updated_at) ?? syncedAt,
    deleted: truthy(raw.deleted),
    device_id: isoOrNull(raw.device_id),
    synced_at: syncedAt,
  };
}

export function backoffMs(failures: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
}
