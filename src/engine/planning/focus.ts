import { getExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';

/**
 * A coach focus: one muscle the next session should lead with, chosen by a
 * tap on the coverage card when today has no room for it. The generator gives
 * templates and picks that carry the muscle a bonus and lets its accessories
 * lead. The focus clears itself once a saved session trains the muscle, or
 * after a week. Kept in the meta store and backed up.
 */

export const COACH_FOCUS_ID = 'coach-focus';
export const FOCUS_DAYS = 7;

const DAY_MS = 86_400_000;

export interface CoachFocus {
  id: typeof COACH_FOCUS_ID;
  muscle: MuscleId;
  setAt: string;
  until: string;
}

export function createFocus(muscle: MuscleId, now: string): CoachFocus {
  return {
    id: COACH_FOCUS_ID,
    muscle,
    setAt: now,
    until: new Date(Date.parse(now) + FOCUS_DAYS * DAY_MS).toISOString(),
  };
}

export function focusIsPast(focus: CoachFocus, now: string): boolean {
  return Date.parse(now) >= Date.parse(focus.until);
}

/** Reads a stored record tolerantly; an unknown muscle or an expired focus reads as none. */
export function parseCoachFocus(raw: unknown, now: string): CoachFocus | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<CoachFocus>;
  if (typeof candidate.muscle !== 'string') return null;
  if (!(MUSCLE_IDS as readonly string[]).includes(candidate.muscle)) return null;
  if (typeof candidate.until !== 'string' || Number.isNaN(Date.parse(candidate.until))) return null;
  const focus: CoachFocus = {
    id: COACH_FOCUS_ID,
    muscle: candidate.muscle as MuscleId,
    setAt: typeof candidate.setAt === 'string' ? candidate.setAt : now,
    until: candidate.until,
  };
  return focusIsPast(focus, now) ? null : focus;
}

/** True when a saved session trained the focus muscle directly with at least one working set. */
export function focusSatisfiedBy(focus: CoachFocus, record: WorkoutRecord): boolean {
  return record.entries.some((entry) => {
    const exercise = getExercise(entry.exerciseId);
    if (!exercise || !exercise.primaryMuscles.includes(focus.muscle)) return false;
    return entry.sets.some((set) => set.kind === 'working' && set.completed);
  });
}
