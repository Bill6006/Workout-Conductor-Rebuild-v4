import type { Database, Identified, StoreName } from '../storage/indexedDb';
import { putVerified, structurallyEqual } from '../storage/verifiedSave';
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  BackupSchema,
  HISTORY_EXPORT_FORMAT,
  SETTINGS_EXPORT_FORMAT,
  migrateBackupShape,
  type Backup,
  type HistoryExport,
  type MigrationStep,
  type SettingsExport,
} from '../validation/backup';
import type { LocationProfile } from '../validation/location';
import type { UserProfile } from '../validation/profile';
import type { SavedWorkout } from '../validation/savedWorkout';
import type { LocalSettings } from '../validation/settings';
import type { CustomExercise, CustomInstruction, CustomMedia } from '../validation/customExercise';

/**
 * Export / import owner. Exports are exact snapshots; imports are migrated,
 * validated, previewed, applied with verified writes, and rolled back to the
 * pre-import snapshot if anything fails part-way. The rollback itself is
 * verified by read-back before the failure is reported.
 */

export interface BackupAppInfo {
  version: string;
  commit?: string;
}

/** Workout records are validated by their own schema at write time; here only `id` matters. */
export type WorkoutRecord = Identified & Record<string, unknown>;

/** Small durable records (receipts, markers); only `id` is required here. */
export type MetaRecord = Identified & Record<string, unknown>;

export interface BackupSource {
  profile: UserProfile | null;
  locations: LocationProfile[];
  localSettings: LocalSettings;
  workouts: WorkoutRecord[];
  customExercises: CustomExercise[];
  customInstructions: CustomInstruction[];
  customMedia: CustomMedia[];
  savedWorkouts: SavedWorkout[];
  meta: MetaRecord[];
}

function appInfo(app: BackupAppInfo): Backup['app'] {
  return { version: app.version, ...(app.commit ? { commit: app.commit } : {}) };
}

export function buildBackup(source: BackupSource, app: BackupAppInfo, exportedAt: string): Backup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    app: appInfo(app),
    data: {
      profile: source.profile,
      locations: source.locations,
      localSettings: source.localSettings,
      workouts: source.workouts,
      customExercises: source.customExercises,
      customInstructions: source.customInstructions,
      customMedia: source.customMedia,
      savedWorkouts: source.savedWorkouts as unknown as Backup['data']['savedWorkouts'],
      meta: source.meta,
    },
  };
}

export function buildHistoryExport(
  source: Pick<BackupSource, 'workouts'>,
  app: BackupAppInfo,
  exportedAt: string,
): HistoryExport {
  return {
    format: HISTORY_EXPORT_FORMAT,
    schemaVersion: 1,
    exportedAt,
    app: appInfo(app),
    workouts: source.workouts,
  };
}

export function buildSettingsExport(
  source: Pick<BackupSource, 'profile' | 'locations' | 'localSettings'>,
  app: BackupAppInfo,
  exportedAt: string,
): SettingsExport {
  return {
    format: SETTINGS_EXPORT_FORMAT,
    schemaVersion: 1,
    exportedAt,
    app: appInfo(app),
    profile: source.profile,
    locations: source.locations,
    localSettings: source.localSettings,
  };
}

export function serializeBackup(backup: object): string {
  return JSON.stringify(backup, null, 2);
}

function stamp(exportedAt: string): string {
  return exportedAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
}

export function backupFileName(exportedAt: string): string {
  return `workout-conductor-backup-${stamp(exportedAt)}.json`;
}

export function historyFileName(exportedAt: string): string {
  return `workout-conductor-history-${stamp(exportedAt)}.json`;
}

export function settingsFileName(exportedAt: string): string {
  return `workout-conductor-settings-${stamp(exportedAt)}.json`;
}

export interface BackupSummary {
  exportedAt: string;
  appVersion: string;
  schemaVersion: number;
  newerThanThisApp: boolean;
  migrations: MigrationStep[];
  hasProfile: boolean;
  primaryGoal: string | null;
  locationCount: number;
  workoutCount: number;
  customExerciseCount: number;
  noteCount: number;
  mediaCount: number;
  savedWorkoutCount: number;
  bytes: number;
  unknownTopLevelKeys: string[];
}

const KNOWN_TOP_LEVEL_KEYS = new Set(['format', 'schemaVersion', 'exportedAt', 'app', 'data']);

export function summarizeBackup(backup: Backup, migrations: MigrationStep[] = []): BackupSummary {
  return {
    exportedAt: backup.exportedAt,
    appVersion: backup.app.version,
    schemaVersion: backup.schemaVersion,
    newerThanThisApp: backup.schemaVersion > BACKUP_SCHEMA_VERSION,
    migrations,
    hasProfile: backup.data.profile !== null,
    primaryGoal: backup.data.profile?.goals.primary ?? null,
    locationCount: backup.data.locations.length,
    workoutCount: backup.data.workouts.length,
    customExerciseCount: backup.data.customExercises.length,
    noteCount: backup.data.customInstructions.length,
    mediaCount: backup.data.customMedia.length,
    savedWorkoutCount: backup.data.savedWorkouts.length,
    bytes: JSON.stringify(backup).length,
    unknownTopLevelKeys: Object.keys(backup).filter((key) => !KNOWN_TOP_LEVEL_KEYS.has(key)),
  };
}

export type BackupParseResult =
  { ok: true; backup: Backup; summary: BackupSummary } | { ok: false; error: string };

/** Parses, migrates older schemas forward, and validates a Full Backup JSON text. */
export function parseBackupText(text: string): BackupParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  return parseBackupValue(raw);
}

export function parseBackupValue(raw: unknown): BackupParseResult {
  const migrated = migrateBackupShape(raw);
  const result = BackupSchema.safeParse(migrated.value);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.join('.')}` : '';
    return {
      ok: false,
      error: `This is not a Workout Conductor backup${where}: ${first?.message ?? 'invalid content'}.`,
    };
  }
  return {
    ok: true,
    backup: result.data,
    summary: summarizeBackup(result.data, migrated.steps),
  };
}

export const RESTORED_STORES = [
  'profile',
  'locations',
  'workouts',
  'customExercises',
  'customInstructions',
  'customMedia',
  'savedWorkouts',
  'meta',
] as const satisfies readonly StoreName[];

export type RestoredStore = (typeof RESTORED_STORES)[number];

type StoreSnapshot = Record<RestoredStore, Identified[]>;

async function snapshotStores(db: Database): Promise<StoreSnapshot> {
  const snapshot = {} as StoreSnapshot;
  for (const store of RESTORED_STORES) {
    snapshot[store] = await db.getAll(store);
  }
  return snapshot;
}

export class RestoreRollbackError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown, detail: string) {
    super(`Restore failed and the rollback could not be verified: ${detail}`);
    this.name = 'RestoreRollbackError';
    this.cause = cause;
  }
}

/** Puts every store back exactly as snapshotted, then proves it by reading each store again. */
async function restoreSnapshot(db: Database, snapshot: StoreSnapshot): Promise<string | null> {
  for (const store of RESTORED_STORES) {
    await db.clear(store);
    for (const record of snapshot[store]) {
      await db.put(store, record);
    }
  }
  for (const store of RESTORED_STORES) {
    const readBack = await db.getAll(store);
    const expected = [...snapshot[store]].sort((a, b) => a.id.localeCompare(b.id));
    const actual = [...readBack].sort((a, b) => a.id.localeCompare(b.id));
    if (!structurallyEqual(actual, expected)) {
      return `${store} holds ${actual.length} records, expected ${expected.length}`;
    }
  }
  return null;
}

export interface RestoreOptions {
  now: () => string;
}

export type RestoreCounts = Record<RestoredStore, number>;

function recordsFor(backup: Backup, store: RestoredStore): Identified[] {
  switch (store) {
    case 'profile':
      return backup.data.profile ? [backup.data.profile] : [];
    case 'locations':
      return backup.data.locations;
    case 'workouts':
      return backup.data.workouts;
    case 'customExercises':
      return backup.data.customExercises;
    case 'customInstructions':
      return backup.data.customInstructions;
    case 'customMedia':
      return backup.data.customMedia;
    case 'savedWorkouts':
      return backup.data.savedWorkouts;
    case 'meta':
      return backup.data.meta;
  }
}

/**
 * Replaces durable data with the backup contents using verified writes and
 * reports how many records each store received. On any failure the pre-import
 * snapshot is restored and verified before the error is rethrown; if even the
 * rollback cannot be verified, a RestoreRollbackError says so plainly.
 */
export async function restoreBackup(
  db: Database,
  backup: Backup,
  options: RestoreOptions,
): Promise<RestoreCounts> {
  const snapshot = await snapshotStores(db);
  const counts = {} as RestoreCounts;
  try {
    for (const store of RESTORED_STORES) {
      await db.clear(store);
      const records = recordsFor(backup, store);
      for (const record of records) {
        await putVerified(db, store, record, options);
      }
      counts[store] = records.length;
    }
    return counts;
  } catch (error) {
    let rollbackProblem: string | null;
    try {
      rollbackProblem = await restoreSnapshot(db, snapshot);
    } catch (rollbackError) {
      rollbackProblem = rollbackError instanceof Error ? rollbackError.message : 'unknown error';
    }
    if (rollbackProblem) throw new RestoreRollbackError(error, rollbackProblem);
    throw error;
  }
}

/** True when two backups hold the same durable data, ignoring export bookkeeping. */
export function sameData(a: Backup, b: Backup): boolean {
  const strip = (backup: Backup) => ({
    ...backup.data,
    localSettings: { ...backup.data.localSettings, lastExportAt: null, lastImportAt: null },
  });
  return structurallyEqual(strip(a), strip(b));
}
