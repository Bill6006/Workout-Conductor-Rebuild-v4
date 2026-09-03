import { z } from 'zod';

/**
 * A completed (or partially completed) workout as stored in IndexedDB `workouts`.
 * Phase 3 defines the shape the volume and exposure logic reads; Phase 5 logging
 * writes it. Loose objects keep unknown fields from newer versions.
 */

export const LoggedSetSchema = z.looseObject({
  kind: z.enum(['warmup', 'working', 'drop']),
  reps: z.number().int().min(0).max(200),
  weight: z.number().min(0).nullable().default(null),
  rir: z.number().min(0).max(10).nullable().default(null),
  completed: z.boolean().default(true),
});

export const LoggedExerciseSchema = z.looseObject({
  exerciseId: z.string().min(1),
  sets: z.array(LoggedSetSchema),
});

export const WorkoutRecordSchema = z.looseObject({
  id: z.string().min(1),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable().default(null),
  locationId: z.string().nullable().default(null),
  templateId: z.string().nullable().default(null),
  entries: z.array(LoggedExerciseSchema),
});

export type WorkoutRecord = z.infer<typeof WorkoutRecordSchema>;
export type LoggedSet = z.infer<typeof LoggedSetSchema>;

/** Parses whatever is in the store, dropping records the schema cannot read. */
export function parseWorkoutRecords(raw: readonly unknown[]): WorkoutRecord[] {
  return raw
    .map((record) => WorkoutRecordSchema.safeParse(record))
    .filter((result) => result.success)
    .map((result) => result.data);
}
