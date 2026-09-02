import { z } from 'zod';

/**
 * Small settings kept in localStorage. Durable data (profile, locations,
 * workouts) never lives here; see docs/data-model.md.
 */

export const LOCAL_SETTINGS_SCHEMA_VERSION = 1;

export const LocalSettingsSchema = z.looseObject({
  schemaVersion: z.literal(LOCAL_SETTINGS_SCHEMA_VERSION),
  onboardingCompletedAt: z.iso.datetime().nullable(),
  lastExportAt: z.iso.datetime().nullable(),
  lastImportAt: z.iso.datetime().nullable(),
});

export type LocalSettings = z.infer<typeof LocalSettingsSchema>;

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  schemaVersion: LOCAL_SETTINGS_SCHEMA_VERSION,
  onboardingCompletedAt: null,
  lastExportAt: null,
  lastImportAt: null,
};
