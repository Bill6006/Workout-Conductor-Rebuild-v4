import type { SetDonePredicate } from '../duration/duration';
import type {
  GeneratedWorkout,
  SetKind,
  SetPrescription,
  WorkoutBlock,
  WorkoutEntry,
} from './types';

/**
 * The execution order of every set in a workout, which is what the active
 * workout screen walks through. A straight block runs its sets in order. A
 * paired block (superset or circuit) runs every member's warm-ups first, then
 * round by round: A1's set, A2's set, rest, next round; drop sets come last.
 * The current position is simply the first set that is not done, so both
 * members of a superset are always shown together and the block ends exactly
 * when its final round ends.
 */

export interface SetPosition {
  blockId: string;
  entryId: string;
  exerciseId: string;
  setIndex: number;
  kind: SetKind;
  /** 1-based round within a paired block, or the working-set ordinal in a straight one. */
  round: number;
  /** 1-based ordinal of this set among the entry's sets of the same kind. */
  ordinal: number;
  set: SetPrescription;
}

function ordinalOf(entry: WorkoutEntry, set: SetPrescription): number {
  return entry.sets.filter((candidate) => candidate.kind === set.kind).indexOf(set) + 1;
}

function position(
  block: WorkoutBlock,
  entry: WorkoutEntry,
  set: SetPrescription,
  round: number,
): SetPosition {
  return {
    blockId: block.id,
    entryId: entry.id,
    exerciseId: entry.exerciseId,
    setIndex: set.index,
    kind: set.kind,
    round,
    ordinal: ordinalOf(entry, set),
    set,
  };
}

export function blockSequence(block: WorkoutBlock): SetPosition[] {
  if (block.kind === 'straight') {
    const entry = block.entries[0];
    if (!entry) return [];
    let working = 0;
    return entry.sets.map((set) => {
      if (set.kind === 'working') working += 1;
      return position(block, entry, set, set.kind === 'working' ? working : Math.max(1, working));
    });
  }
  const sequence: SetPosition[] = [];
  for (const entry of block.entries) {
    for (const set of entry.sets) {
      if (set.kind === 'warmup') sequence.push(position(block, entry, set, 0));
    }
  }
  const rounds = Math.max(
    ...block.entries.map((entry) => entry.sets.filter((set) => set.kind === 'working').length),
  );
  for (let round = 0; round < rounds; round += 1) {
    for (const entry of block.entries) {
      const set = entry.sets.filter((candidate) => candidate.kind === 'working')[round];
      if (set) sequence.push(position(block, entry, set, round + 1));
    }
  }
  for (const entry of block.entries) {
    for (const set of entry.sets) {
      if (set.kind === 'drop') sequence.push(position(block, entry, set, rounds));
    }
  }
  return sequence;
}

export function workoutSequence(workout: GeneratedWorkout): SetPosition[] {
  return workout.blocks.flatMap(blockSequence);
}

/** The first set that is not done, or null when the workout is complete. */
export function currentPosition(
  workout: GeneratedWorkout,
  isDone: SetDonePredicate,
): SetPosition | null {
  return workoutSequence(workout).find((item) => !isDone(item.entryId, item.setIndex)) ?? null;
}

/** The set that follows `current` in execution order, done or not. */
export function nextPosition(workout: GeneratedWorkout, current: SetPosition): SetPosition | null {
  const sequence = workoutSequence(workout);
  const at = sequence.findIndex(
    (item) => item.entryId === current.entryId && item.setIndex === current.setIndex,
  );
  return at >= 0 ? (sequence[at + 1] ?? null) : null;
}

/**
 * Rest to run after logging `current`: none when the next set is a drop set of
 * the same exercise or the other member of the same superset round (switch,
 * no rest); the round rest after a paired round; the set's own rest otherwise.
 */
export function restAfter(workout: GeneratedWorkout, current: SetPosition): number {
  const next = nextPosition(workout, current);
  if (current.kind === 'drop') return 0;
  if (next && next.entryId === current.entryId && next.kind === 'drop') return 0;
  const block = workout.blocks.find((candidate) => candidate.id === current.blockId);
  if (block && block.kind !== 'straight' && current.kind === 'working') {
    if (
      next &&
      next.blockId === block.id &&
      next.round === current.round &&
      next.kind === 'working'
    )
      return 0;
    return block.restBetweenRoundsSeconds;
  }
  return current.set.restSeconds;
}

export interface WorkoutProgress {
  done: number;
  total: number;
  workingDone: number;
  workingTotal: number;
  entriesDone: number;
  entriesTotal: number;
}

export function isEntryDone(entry: WorkoutEntry, isDone: SetDonePredicate): boolean {
  return entry.sets.length > 0 && entry.sets.every((set) => isDone(entry.id, set.index));
}

export function workoutProgress(
  workout: GeneratedWorkout,
  isDone: SetDonePredicate,
): WorkoutProgress {
  const sequence = workoutSequence(workout);
  const working = sequence.filter((item) => item.kind === 'working');
  const entries = workout.blocks.flatMap((block) => block.entries);
  return {
    done: sequence.filter((item) => isDone(item.entryId, item.setIndex)).length,
    total: sequence.length,
    workingDone: working.filter((item) => isDone(item.entryId, item.setIndex)).length,
    workingTotal: working.length,
    entriesDone: entries.filter((entry) => isEntryDone(entry, isDone)).length,
    entriesTotal: entries.length,
  };
}
