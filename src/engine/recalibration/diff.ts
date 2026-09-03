import { requireExercise } from '../../catalog/exercises/catalog';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import type { ChangeCounts, ChangeSummary, EntryChange } from './types';

/**
 * Change detection between the previous and the recalibrated workout, and the
 * compact summary built from it ("Recalibrated to 30 min: 2 exercises removed,
 * 1 superset added."). Entries are matched by id, so a swap in the same slot
 * reads as "replaced" rather than "removed + added".
 */

function workingCount(entry: WorkoutEntry): number {
  return entry.sets.filter((set) => set.kind === 'working').length;
}

function nameOf(entry: WorkoutEntry): string {
  return requireExercise(entry.exerciseId).name;
}

function adjustmentDetail(previous: WorkoutEntry, next: WorkoutEntry): string | null {
  const changes: string[] = [];
  const setsBefore = workingCount(previous);
  const setsAfter = workingCount(next);
  if (setsAfter < setsBefore)
    changes.push(`${setsBefore - setsAfter} set${setsBefore - setsAfter === 1 ? '' : 's'} fewer`);
  if (setsAfter > setsBefore)
    changes.push(`${setsAfter - setsBefore} set${setsAfter - setsBefore === 1 ? '' : 's'} more`);
  if (next.restSeconds < previous.restSeconds) changes.push('shorter rests');
  if (next.restSeconds > previous.restSeconds) changes.push('longer rests');
  if (next.dropSet && !previous.dropSet) changes.push('drop set added');
  if (!next.dropSet && previous.dropSet) changes.push('drop set removed');
  const firstBefore = previous.sets.find((set) => set.kind === 'working');
  const firstAfter = next.sets.find((set) => set.kind === 'working');
  if (
    firstBefore &&
    firstAfter &&
    (firstBefore.targetReps[0] !== firstAfter.targetReps[0] ||
      firstBefore.targetReps[1] !== firstAfter.targetReps[1])
  ) {
    changes.push(`new target ${firstAfter.targetReps[0]}-${firstAfter.targetReps[1]} reps`);
  }
  if (firstBefore && firstAfter && firstBefore.targetRir !== firstAfter.targetRir)
    changes.push(`RIR ${firstAfter.targetRir}`);
  const lastBefore = [...previous.sets].reverse().find((set) => set.kind === 'working');
  const lastAfter = [...next.sets].reverse().find((set) => set.kind === 'working');
  if (lastBefore && lastAfter && lastBefore.targetWeight !== lastAfter.targetWeight)
    changes.push(
      lastAfter.targetWeight === null
        ? 'target weight cleared'
        : `target ${lastAfter.targetWeight}`,
    );
  if (next.pinned !== previous.pinned) changes.push(next.pinned ? 'pinned' : 'unpinned');
  return changes.length > 0 ? changes.join(', ') : null;
}

export function diffWorkouts(previous: GeneratedWorkout, next: GeneratedWorkout): EntryChange[] {
  const before = new Map(allEntries(previous.blocks).map((entry) => [entry.id, entry]));
  const after = new Map(allEntries(next.blocks).map((entry) => [entry.id, entry]));
  const changes: EntryChange[] = [];

  for (const [id, entry] of after) {
    const old = before.get(id);
    if (!old) {
      changes.push({
        entryId: id,
        kind: 'added',
        exerciseId: entry.exerciseId,
        detail: `Added ${nameOf(entry)}.`,
      });
      continue;
    }
    if (old.exerciseId !== entry.exerciseId) {
      changes.push({
        entryId: id,
        kind: 'replaced',
        exerciseId: entry.exerciseId,
        previousExerciseId: old.exerciseId,
        detail: `Replaced ${nameOf(old)} with ${nameOf(entry)}.`,
      });
      continue;
    }
    const detail = adjustmentDetail(old, entry);
    if (detail) {
      changes.push({
        entryId: id,
        kind: 'adjusted',
        exerciseId: entry.exerciseId,
        detail: `${nameOf(entry)}: ${detail}.`,
      });
    }
  }

  for (const [id, entry] of before) {
    if (!after.has(id)) {
      changes.push({
        entryId: id,
        kind: 'removed',
        exerciseId: entry.exerciseId,
        detail: `Left out ${nameOf(entry)}.`,
      });
    }
  }

  return changes;
}

export function countChanges(
  previous: GeneratedWorkout,
  next: GeneratedWorkout,
  changes: readonly EntryChange[],
): ChangeCounts {
  const paired = (workout: GeneratedWorkout) =>
    workout.blocks.filter((block) => block.kind !== 'straight').length;
  const pairedBefore = paired(previous);
  const pairedAfter = paired(next);
  const before = new Map(allEntries(previous.blocks).map((entry) => [entry.id, entry]));
  let setsTrimmed = 0;
  for (const entry of allEntries(next.blocks)) {
    const old = before.get(entry.id);
    if (old && old.exerciseId === entry.exerciseId) {
      setsTrimmed += Math.max(0, workingCount(old) - workingCount(entry));
    }
  }
  const count = (kind: EntryChange['kind']) =>
    changes.filter((change) => change.kind === kind).length;
  return {
    added: count('added'),
    removed: count('removed'),
    replaced: count('replaced'),
    adjusted: count('adjusted'),
    supersetsAdded: Math.max(0, pairedAfter - pairedBefore),
    supersetsRemoved: Math.max(0, pairedBefore - pairedAfter),
    setsTrimmed,
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Ordered phrases such as "2 exercises removed, 1 superset added". */
export function describeCounts(counts: ChangeCounts): string[] {
  const parts: string[] = [];
  if (counts.removed) parts.push(`${plural(counts.removed, 'exercise')} removed`);
  if (counts.added) parts.push(`${plural(counts.added, 'exercise')} added`);
  if (counts.replaced) parts.push(`${plural(counts.replaced, 'exercise')} replaced`);
  if (counts.supersetsAdded) parts.push(`${plural(counts.supersetsAdded, 'superset')} added`);
  if (counts.supersetsRemoved) parts.push(`${plural(counts.supersetsRemoved, 'superset')} removed`);
  if (counts.setsTrimmed) parts.push(`${plural(counts.setsTrimmed, 'set')} trimmed`);
  const otherAdjusted = counts.adjusted - (counts.setsTrimmed > 0 ? 0 : 0);
  if (otherAdjusted && !counts.setsTrimmed)
    parts.push(`${plural(otherAdjusted, 'exercise')} adjusted`);
  return parts;
}

export interface SummaryInput {
  /** Leads a count-based headline, for example "Recalibrated to 30 min". */
  prefix?: string;
  /** A complete headline that replaces the count-based one. */
  headline?: string;
  previous: GeneratedWorkout;
  next: GeneratedWorkout;
  changes: readonly EntryChange[];
  notes?: readonly string[];
}

export function composeSummary(input: SummaryInput): ChangeSummary {
  const counts = countChanges(input.previous, input.next, input.changes);
  const details = [...input.changes.map((change) => change.detail), ...(input.notes ?? [])];
  if (input.headline) return { headline: input.headline, details, counts };
  const prefix = input.prefix ?? 'Recalibrated';
  const parts = describeCounts(counts);
  return {
    headline:
      parts.length > 0 ? `${prefix}: ${parts.join(', ')}.` : `${prefix}: no changes needed.`,
    details,
    counts,
  };
}
