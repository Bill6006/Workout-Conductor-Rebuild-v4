import { getExercise } from '../../catalog/exercises/catalog';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { allEntries, type MusclePriority, type WorkoutBlock } from './types';

/** The day's log as Today reads it, each set as `entryId:setIndex`. */
export interface DayLog {
  /** Sets logged, not skipped. */
  logged: ReadonlySet<string>;
  /** Sets done or skipped. */
  done: ReadonlySet<string>;
}

/**
 * Today's priority muscles (the owner, 2026-11-01): the week's ranking (`computeMusclePriorities`),
 * in its own order, kept to the muscles today's session trains: those a lift in the plan works
 * directly, with a working set. Read with the day's log, a working set trains where it was logged,
 * or where it is still to come on a lift that goes on: never a set skipped, nor one a stopped lift
 * will not do (the review: skipped mid-workout, the hamstrings stayed on). The week's ranking itself
 * is Plan's "Priority this week"; read whole, "Priority muscles today" named the biceps on a lower
 * day.
 */
export function prioritiesToday(
  priorities: readonly MusclePriority[],
  blocks: readonly WorkoutBlock[],
  log?: DayLog,
): MusclePriority[] {
  const trained = new Set<MuscleId>();
  for (const entry of allEntries(blocks)) {
    const trains = entry.sets.some((set) => {
      if (set.kind !== 'working') return false;
      if (!log) return true;
      const key = `${entry.id}:${set.index}`;
      return log.logged.has(key) || (!log.done.has(key) && entry.stopped === undefined);
    });
    if (!trains) continue;
    for (const muscle of getExercise(entry.exerciseId)?.primaryMuscles ?? []) trained.add(muscle);
  }
  return priorities.filter((priority) => trained.has(priority.muscle));
}

const PRIORITY_LINE = 'Priority muscles today: ';

/** Why this workout's line on them: the first three, or none where the plan trains no muscle. */
export function priorityLine(
  priorities: readonly MusclePriority[],
  blocks: readonly WorkoutBlock[],
  log?: DayLog,
): string | null {
  const today = prioritiesToday(priorities, blocks, log).slice(0, 3);
  return today.length > 0
    ? `${PRIORITY_LINE}${today.map((priority) => priority.reason).join('; ')}.`
    : null;
}

/**
 * The reasons with today's priority line as a change leaves the plan: in place of the line before,
 * none where the plan trains no muscle now, and before the place's line where there was none.
 */
export function withPriorityLine(reasons: readonly string[], line: string | null): string[] {
  const at = reasons.findIndex((reason) => reason.startsWith(PRIORITY_LINE));
  if (at >= 0) {
    return line === null
      ? reasons.filter((_, index) => index !== at)
      : reasons.map((reason, index) => (index === at ? line : reason));
  }
  if (line === null) return [...reasons];
  const place = reasons.findIndex((reason) => reason.startsWith('Built for '));
  const before = place < 0 ? reasons.length : place;
  return [...reasons.slice(0, before), line, ...reasons.slice(before)];
}
