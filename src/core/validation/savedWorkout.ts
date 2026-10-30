import { z } from 'zod';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import type { GeneratedWorkout } from '../../engine/workout/types';
import { GeneratedWorkoutSchema } from '../../engine/workout/workoutSchema';
import { CatchUpSpecSchema } from './catchUpSpec';

/**
 * A workout the user saved to reuse later, stored in IndexedDB `savedWorkouts`
 * and included in backups. Loading one starts a fresh session from it; the
 * recalibration engine still owns every change after that.
 */

export const SavedWorkoutSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  createdAt: z.iso.datetime(),
  locationId: z.string().nullable().default(null),
  duration: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal('default')]),
  workout: GeneratedWorkoutSchema,
  // The twenty-third review of round M: a copy saved before has none; one that fails to read is
  // dropped, and the copy loads as the split's own kind of plan.
  catchUp: CatchUpSpecSchema.optional().catch(undefined),
  // The twenty-sixth review of round M: a copy saved before has none, and reads its plan's day off
  // its workout, as before; one that fails to read is none.
  planDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export interface SavedWorkout {
  id: string;
  name: string;
  createdAt: string;
  locationId: string | null;
  duration: 15 | 30 | 45 | 'default';
  workout: GeneratedWorkout;
  /**
   * The catch-up or second workout the plan was laid out for when saved (the twenty-third review of
   * round M): loaded, it is that plan again, on any day, read as itself, never as the day's offer.
   * Absent for any other plan, and on a copy saved before.
   */
  catchUp?: CatchUpSpec;
  /**
   * The local day its plan was made (the twenty-sixth review of round M): a rebuild under way moves
   * the workout's own time, past midnight to the next day, and never the day the plan was made for.
   * Absent on a copy saved before.
   */
  planDay?: string;
}

export function parseSavedWorkouts(raw: readonly unknown[]): SavedWorkout[] {
  return raw
    .map((item) => SavedWorkoutSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data as unknown as SavedWorkout)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
