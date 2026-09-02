import type { Database, Identified } from '../storage/indexedDb';
import { putVerified } from '../storage/verifiedSave';
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  BackupSchema,
  type Backup,
} from '../validation/backup';
import type { LocationProfile } from '../validation/location';
import type { UserProfile } from '../validation/profile';
import type { LocalSettings } from '../validation/settings';

/**
 * Export / import foundation. Exports are exact snapshots; imports are
 * validated, previewed, applied with verified writes, and rolled back to the
 * pre-import snapshot if anything fails part-way.
 */

export interface BackupAppInfo {
  version: string;
  commit?: string;
}

/** Workout records are opaque until Phase 5 defines them; only `id` is required. */
export type WorkoutRecord = Identified & Record<string, unknown>;

export interface BackupSource {
  profile: UserProfile | null;
  locations: LocationProfile[];
  localSettings: LocalSettings;
  workouts: WorkoutRecord[];
}

export function buildBackup(source: BackupSource, app: BackupAppInfo, exportedAt: string): Backup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    app: { version: app.version, ...(app.commit ? { commit: app.commit } : {}) },
    data: {
      profile: source.profile,
      locations: source.locations,
      localSettings: source.localSettings,
      workouts: source.workouts,
    },
  };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

export function backupFileName(exportedAt: string): string {
  const stamp = exportedAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  return `workout-conductor-backup-${stamp}.json`;
}

export interface BackupSummary {
  exportedAt: string;
  appVersion: string;
  schemaVersion: number;
  newerThanThisApp: boolean;
  hasProfile: boolean;
  primaryGoal: string | null;
  locationCount: number;
  workoutCount: number;
  unknownTopLevelKeys: string[];
}

const KNOWN_TOP_LEVEL_KEYS = new Set(['format', 'schemaVersion', 'exportedAt', 'app', 'data']);

export function summarizeBackup(backup: Backup): BackupSummary {
  return {
    exportedAt: backup.exportedAt,
    appVersion: backup.app.version,
    schemaVersion: backup.schemaVersion,
    newerThanThisApp: backup.schemaVersion > BACKUP_SCHEMA_VERSION,
    hasProfile: backup.data.profile !== null,
    primaryGoal: backup.data.profile?.goals.primary ?? null,
    locationCount: backup.data.locations.length,
    workoutCount: backup.data.workouts.length,
    unknownTopLevelKeys: Object.keys(backup).filter((key) => !KNOWN_TOP_LEVEL_KEYS.has(key)),
  };
}

export type BackupParseResult =
  { ok: true; backup: Backup; summary: BackupSummary } | { ok: false; error: string };

export function parseBackupText(text: string): BackupParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  const result = BackupSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.join('.')}` : '';
    return {
      ok: false,
      error: `This is not a Workout Conductor backup${where}: ${first?.message ?? 'invalid content'}.`,
    };
  }
  return { ok: true, backup: result.data, summary: summarizeBackup(result.data) };
}

interface StoreSnapshot {
  profile: Identified[];
  locations: Identified[];
  workouts: Identified[];
}

async function snapshotStores(db: Database): Promise<StoreSnapshot> {
  return {
    profile: await db.getAll('profile'),
    locations: await db.getAll('locations'),
    workouts: await db.getAll('workouts'),
  };
}

async function restoreSnapshot(db: Database, snapshot: StoreSnapshot): Promise<void> {
  for (const store of ['profile', 'locations', 'workouts'] as const) {
    await db.clear(store);
    for (const record of snapshot[store]) {
      await db.put(store, record);
    }
  }
}

export interface RestoreOptions {
  now: () => string;
}

/**
 * Replaces durable data with the backup contents using verified writes.
 * On any failure the pre-import snapshot is restored before the error is rethrown.
 */
export async function restoreBackup(
  db: Database,
  backup: Backup,
  options: RestoreOptions,
): Promise<void> {
  const snapshot = await snapshotStores(db);
  try {
    await db.clear('locations');
    for (const location of backup.data.locations) {
      await putVerified(db, 'locations', location, options);
    }
    await db.clear('workouts');
    for (const workout of backup.data.workouts) {
      await putVerified(db, 'workouts', workout, options);
    }
    await db.clear('profile');
    if (backup.data.profile) {
      await putVerified(db, 'profile', backup.data.profile, options);
    }
  } catch (error) {
    await restoreSnapshot(db, snapshot);
    throw error;
  }
}
