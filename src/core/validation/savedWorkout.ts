import { z } from 'zod';
import type { GeneratedWorkout } from '../../engine/workout/types';
import { GeneratedWorkoutSchema } from '../../engine/workout/workoutSchema';

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
});

export interface SavedWorkout {
  id: string;
  name: string;
  createdAt: string;
  locationId: string | null;
  duration: 15 | 30 | 45 | 'default';
  workout: GeneratedWorkout;
}

export function parseSavedWorkouts(raw: readonly unknown[]): SavedWorkout[] {
  return raw
    .map((item) => SavedWorkoutSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data as unknown as SavedWorkout)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
