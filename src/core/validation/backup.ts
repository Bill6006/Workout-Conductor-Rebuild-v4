import { z } from 'zod';
import { CustomExerciseSchema, CustomInstructionSchema, CustomMediaSchema } from './customExercise';
import { LocationProfileSchema } from './location';
import { UserProfileSchema } from './profile';
import { LocalSettingsSchema } from './settings';

/**
 * Full Backup JSON. Loose objects everywhere so a backup written by a newer
 * version keeps its unknown fields when it passes through this version.
 *
 * Schema history:
 * - 1: profile, locations, localSettings, workouts, custom content, saved workouts
 * - 2: adds `data.meta` (small durable records such as diagnostics markers and
 *      legacy-import receipts)
 */

export const BACKUP_FORMAT = 'workout-conductor-backup';
export const HISTORY_EXPORT_FORMAT = 'workout-conductor-history';
export const SETTINGS_EXPORT_FORMAT = 'workout-conductor-settings';
export const BACKUP_SCHEMA_VERSION = 2;

const IdentifiedSchema = z.looseObject({ id: z.string().min(1) });

export const BackupSchema = z.looseObject({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.iso.datetime(),
  app: z.looseObject({
    version: z.string(),
    commit: z.string().optional(),
  }),
  data: z.looseObject({
    profile: UserProfileSchema.nullable(),
    locations: z.array(LocationProfileSchema),
    localSettings: LocalSettingsSchema,
    workouts: z.array(IdentifiedSchema),
    customExercises: z.array(CustomExerciseSchema).default([]),
    customInstructions: z.array(CustomInstructionSchema).default([]),
    customMedia: z.array(CustomMediaSchema).default([]),
    savedWorkouts: z.array(IdentifiedSchema).default([]),
    meta: z.array(IdentifiedSchema).default([]),
  }),
});

export type Backup = z.infer<typeof BackupSchema>;

export interface MigrationStep {
  from: number;
  to: number;
  note: string;
}

/**
 * Brings an older backup up to the current schema before validation. Each step
 * only adds what the newer schema needs; nothing is removed, so unknown fields
 * from any version survive. Newer-than-this-app backups pass through untouched.
 */
export function migrateBackupShape(raw: unknown): { value: unknown; steps: MigrationStep[] } {
  if (!raw || typeof raw !== 'object') return { value: raw, steps: [] };
  const source = raw as Record<string, unknown>;
  if (source.format !== BACKUP_FORMAT || typeof source.schemaVersion !== 'number') {
    return { value: raw, steps: [] };
  }
  let value: Record<string, unknown> = { ...source };
  const steps: MigrationStep[] = [];
  if (value.schemaVersion === 1) {
    const data = value.data && typeof value.data === 'object' ? { ...(value.data as object) } : {};
    value = {
      ...value,
      schemaVersion: 2,
      data: { meta: [], ...(data as Record<string, unknown>) },
    };
    steps.push({ from: 1, to: 2, note: 'Added the meta section (empty).' });
  }
  return { value, steps };
}

/** Workout history only: the part of a backup a spreadsheet or another app might want. */
export const HistoryExportSchema = z.looseObject({
  format: z.literal(HISTORY_EXPORT_FORMAT),
  schemaVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  app: z.looseObject({ version: z.string(), commit: z.string().optional() }),
  workouts: z.array(IdentifiedSchema),
});

/** Settings only: profile, places, and local settings, without any history or media. */
export const SettingsExportSchema = z.looseObject({
  format: z.literal(SETTINGS_EXPORT_FORMAT),
  schemaVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  app: z.looseObject({ version: z.string(), commit: z.string().optional() }),
  profile: UserProfileSchema.nullable(),
  locations: z.array(LocationProfileSchema),
  localSettings: LocalSettingsSchema,
});

export type HistoryExport = z.infer<typeof HistoryExportSchema>;
export type SettingsExport = z.infer<typeof SettingsExportSchema>;
