import { z } from 'zod';

/**
 * A completed (or partially completed) workout as stored in IndexedDB `workouts`.
 * Every exercise of a superset is its own durable entry; the block id and kind
 * only describe how they were performed together. Warm-up sets carry their kind
 * so they never count toward working-set totals. Loose objects keep unknown
 * fields from newer versions; defaults keep Phase 3 records readable.
 */

export const LoggedSetSchema = z.looseObject({
  kind: z.enum(['warmup', 'working', 'drop']),
  reps: z.number().int().min(0).max(200),
  weight: z.number().min(0).nullable().default(null),
  rir: z.number().min(0).max(10).nullable().default(null),
  completed: z.boolean().default(true),
  /** The planned set this logs, when known. */
  setIndex: z.number().int().min(0).optional(),
  targetReps: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
  targetWeight: z.number().min(0).nullable().optional(),
  loggedAt: z.iso.datetime().optional(),
});

export const LoggedExerciseSchema = z.looseObject({
  exerciseId: z.string().min(1),
  sets: z.array(LoggedSetSchema),
  entryId: z.string().optional(),
  blockId: z.string().optional(),
  blockKind: z.enum(['straight', 'superset', 'circuit']).optional(),
  role: z.string().optional(),
  plannedSets: z.number().int().min(0).optional(),
  /** Catalog id this exercise replaced during the session, if any. */
  replacedFrom: z.string().optional(),
});

export const SessionRatingSchema = z.looseObject({
  effort: z.enum(['too-easy', 'right', 'too-hard']),
  pain: z.boolean().default(false),
  energyAfter: z.number().int().min(1).max(5),
  note: z.string().max(500).default(''),
});

export const WorkoutRecordSchema = z.looseObject({
  id: z.string().min(1),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable().default(null),
  locationId: z.string().nullable().default(null),
  templateId: z.string().nullable().default(null),
  title: z.string().optional(),
  entries: z.array(LoggedExerciseSchema),
  durationChoice: z
    .union([z.literal(15), z.literal(30), z.literal(45), z.literal('default')])
    .optional(),
  plannedMinutes: z.number().min(0).optional(),
  elapsedSeconds: z.number().min(0).optional(),
  endedEarly: z.boolean().default(false),
  rating: SessionRatingSchema.nullable().default(null),
  skippedExerciseIds: z.array(z.string()).default([]),
});

export type WorkoutRecord = z.infer<typeof WorkoutRecordSchema>;
export type LoggedSet = z.infer<typeof LoggedSetSchema>;
export type LoggedExercise = z.infer<typeof LoggedExerciseSchema>;
export type SessionRating = z.infer<typeof SessionRatingSchema>;

/** Parses whatever is in the store, dropping records the schema cannot read. */
export function parseWorkoutRecords(raw: readonly unknown[]): WorkoutRecord[] {
  return raw
    .map((record) => WorkoutRecordSchema.safeParse(record))
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
