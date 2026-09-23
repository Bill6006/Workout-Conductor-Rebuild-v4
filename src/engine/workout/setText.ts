import { getExercise } from '../../catalog/exercises/catalog';
import { isHold } from '../../catalog/exercises/exerciseSchema';

/**
 * How a set's numbers read. A held exercise keeps its seconds in the reps fields, so every place
 * that prints them asks here first: "8-12 reps", but "30 s" for a hold (Maintenance 20).
 */

/** Whether the exercise with this id is held for time. */
export function holdById(exerciseId: string): boolean {
  return isHold(getExercise(exerciseId));
}

/** A target: "8-12 reps", or "30 s" for a hold (its first number is today's seconds). */
export function targetText(targetReps: readonly [number, number], hold: boolean): string {
  return hold ? `${targetReps[0]} s` : `${targetReps[0]}-${targetReps[1]} reps`;
}

/** A logged amount: "12", or "45 s" for a hold. */
export function amountText(reps: number, hold: boolean): string {
  return hold ? `${reps} s` : String(reps);
}
