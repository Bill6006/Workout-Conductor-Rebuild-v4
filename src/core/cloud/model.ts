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
  /** Runs every statement in one write transaction. */
  batch(statements: CloudStatement[]): Promise<void>;
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

export function upsertStatement(
  store: SyncedStore,
  record: Identified,
  deviceId: string,
  now: string,
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
      recordTimestamp(store, record as unknown as Loose) ?? now,
      deviceId,
      now,
    ],
  };
}

export function tombstoneStatement(
  store: SyncedStore,
  id: string,
  deviceId: string,
  now: string,
): CloudStatement {
  return {
    sql:
      'INSERT INTO records (app, store, id, day, body, updated_at, deleted, device_id, synced_at) ' +
      'VALUES (?, ?, ?, NULL, NULL, ?, 1, ?, ?) ' +
      'ON CONFLICT(app, store, id) DO UPDATE SET day = NULL, body = NULL, ' +
      'updated_at = excluded.updated_at, deleted = 1, device_id = excluded.device_id, ' +
      'synced_at = excluded.synced_at WHERE excluded.updated_at >= records.updated_at',
    args: [CLOUD_APP, store, id, now, deviceId, now],
  };
}

/** Rows of this app newer than the cursor, oldest first, one page at a time. */
export function pullStatement(cursor: string | null, cursorId: string | null): CloudStatement {
  return {
    sql:
      'SELECT store, id, day, body, updated_at, deleted, device_id, synced_at FROM records ' +
      'WHERE app = ? AND (synced_at > ? OR (synced_at = ? AND id > ?)) ' +
      `ORDER BY synced_at ASC, id ASC LIMIT ${PULL_PAGE}`,
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
