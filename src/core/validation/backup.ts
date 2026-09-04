import { z } from 'zod';
import { CustomExerciseSchema, CustomInstructionSchema, CustomMediaSchema } from './customExercise';
import { LocationProfileSchema } from './location';
import { UserProfileSchema } from './profile';
import { LocalSettingsSchema } from './settings';

/**
 * Full Backup JSON. Loose objects everywhere so a backup written by a newer
 * version keeps its unknown fields when it passes through this version.
 */

export const BACKUP_FORMAT = 'workout-conductor-backup';
export const BACKUP_SCHEMA_VERSION = 1;

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
    workouts: z.array(z.looseObject({ id: z.string().min(1) })),
    customExercises: z.array(CustomExerciseSchema).default([]),
    customInstructions: z.array(CustomInstructionSchema).default([]),
    customMedia: z.array(CustomMediaSchema).default([]),
    savedWorkouts: z.array(z.looseObject({ id: z.string().min(1) })).default([]),
  }),
});

export type Backup = z.infer<typeof BackupSchema>;
