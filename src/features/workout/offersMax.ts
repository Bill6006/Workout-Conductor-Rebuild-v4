import { requireExercise } from '../../catalog/exercises/catalog';
import { isHold } from '../../catalog/exercises/exerciseSchema';
import { maxPromptHidden, type StrengthMaxes } from '../../engine/progression/maxes';
import { startRatio } from '../../engine/progression/startingLoad';
import { keepsTheEase, type WorkoutEntry } from '../../engine/workout/types';

/**
 * Whether a lift's card offers "Know your max?" (Maintenance 23): a lift whose target an entered max
 * can still set today, from reps, with the prompt neither snoozed nor declined and no max kept. With
 * a set done or skipped, its ramp included, a weight set for today, or a hard start's ease kept on it
 * (Maintenance 26, the tenth pass of item 42), the lift keeps its sets and a max counts from the next
 * session: there is no target left to offer.
 */
export function offersMax(
  entry: WorkoutEntry,
  logged: readonly { entryId: string }[],
  maxes: StrengthMaxes,
  now: string,
): boolean {
  const mode = entry.progression?.mode;
  if (mode !== 'start' && mode !== 'estimate' && mode !== 'return') return false;
  const exercise = requireExercise(entry.exerciseId);
  // A max is read from reps; a hold's seconds say nothing about one.
  if (startRatio(exercise) === null || isHold(exercise)) return false;
  const touched = logged.some((set) => set.entryId === entry.id) || keepsTheEase(entry);
  if (touched || entry.manual?.weight) return false;
  return !maxPromptHidden(maxes, entry.exerciseId, now);
}
