import { getExercise, requireExercise } from '../../catalog/exercises/catalog';
import { isHold } from '../../catalog/exercises/exerciseSchema';
import {
  allEntries,
  isStopped,
  stoppedBefore,
  type WorkoutBlock,
  type WorkoutEntry,
} from './types';

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

/**
 * A stopped exercise's row: "Stopped: 1 of 4 sets done", or "Stopped before its working sets"
 * when only its warm-up was done. `logged` holds the sets logged, not skipped, as
 * `entryId:setIndex`: only those count as done.
 */
export function stoppedText(entry: WorkoutEntry, logged: ReadonlySet<string>): string {
  const working = entry.sets.filter((set) => set.kind === 'working');
  if (working.length === 0) return 'Stopped before its working sets';
  const done = working.filter((set) => logged.has(`${entry.id}:${set.index}`)).length;
  const owed = entry.stopped?.owed;
  return owed === undefined
    ? `Stopped: ${done} ${done === 1 ? 'set' : 'sets'} done`
    : `Stopped: ${done} of ${working.length + owed} sets done`;
}

/**
 * What a stopped exercise's sheet says in place of its actions (Maintenance 22): how far it got
 * and which exercise took over the rest, or that nothing is left to change on it.
 */
export function stoppedNote(
  blocks: readonly WorkoutBlock[],
  entry: WorkoutEntry,
  logged: ReadonlySet<string>,
): string {
  const label = stoppedText(entry, logged);
  const taker =
    entry.stopped?.why === 'skip'
      ? undefined
      : allEntries(blocks).find(
          (candidate) => !isStopped(candidate) && stoppedBefore(blocks, candidate).includes(entry),
        );
  return taker
    ? `${label}. ${requireExercise(taker.exerciseId).name} took over the rest.`
    : `${label}. Nothing is left to change on it today.`;
}
