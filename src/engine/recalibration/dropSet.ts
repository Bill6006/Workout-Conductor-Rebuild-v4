import type { WorkoutBlock, WorkoutEntry } from '../workout/types';

/**
 * A drop set's load is decided from the working set actually lifted, not from
 * the plan: a fifth off, rounded down to the exercise's step, and always at
 * least one step under the working weight when a lighter step exists. Fixing
 * the load when the drop set is accepted, from the planned target, is how a
 * drop set once came out heavier than the sets before it.
 */
export function dropSetWeight(lifted: number, step: number): number {
  const safeStep = step > 0 ? step : 1;
  const dropped = Math.floor((lifted * 0.8) / safeStep) * safeStep;
  return Math.max(safeStep, Math.min(dropped, lifted - safeStep));
}

/** The entry's unlogged drop set, if it has one. */
export function pendingDropSet(
  entry: WorkoutEntry,
  isDone: (entryId: string, setIndex: number) => boolean,
) {
  return entry.sets.find((set) => set.kind === 'drop' && !isDone(entry.id, set.index)) ?? null;
}

/** The same blocks with one entry's drop set carrying `weight`; nothing else is touched. */
export function withDropWeight(
  blocks: readonly WorkoutBlock[],
  entryId: string,
  weight: number,
): WorkoutBlock[] {
  return blocks.map((block) => ({
    ...block,
    entries: block.entries.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            sets: entry.sets.map((set) =>
              set.kind === 'drop' ? { ...set, targetWeight: weight } : set,
            ),
          }
        : entry,
    ),
  }));
}
