import type { SetDonePredicate } from '../duration/duration';
import {
  allEntries,
  isStopped,
  roundsRun,
  type GeneratedWorkout,
  type SetKind,
  type SetPrescription,
  type WorkoutBlock,
  type WorkoutEntry,
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
  const rounds = roundsRun(block);
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

/**
 * The block to go to after the one in front of the lifter: the block of the next set not yet
 * done, in the order sets are done. A rebuild can leave a finished block after the current
 * one, and the next row in the list would then point at work already done.
 */
export function nextBlockAfter(
  workout: GeneratedWorkout,
  blockId: string,
  isDone: SetDonePredicate,
): WorkoutBlock | undefined {
  const next = workoutSequence(workout).find(
    (item) => item.blockId !== blockId && !isDone(item.entryId, item.setIndex),
  );
  return next ? workout.blocks.find((block) => block.id === next.blockId) : undefined;
}

/** A lift moved later for busy equipment, as the busy rule reads it (Maintenance 25). */
export interface WaitingMove {
  exerciseId: string;
  after: readonly string[];
  was?: readonly string[];
}

/** The names a move knows its lift by: its name now, and its names before a swap today. */
export function moveNames(move: WaitingMove): string[] {
  return [move.exerciseId, ...(move.was ?? [])];
}

/**
 * A lift the busy moves count (Maintenance 25): still in the plan, with a set to do. A lift done,
 * or stopped earlier today (a set of it undone included), holds nothing and waits on nothing, and
 * a row holding no such lift is nothing to move behind (the seventh review: a tap named the
 * stopped lift and moved nothing).
 */
export function isOpenLift(entry: WorkoutEntry, isDone: SetDonePredicate): boolean {
  return !isStopped(entry) && entry.sets.some((set) => !isDone(entry.id, set.index));
}

/** Whether a row holds a lift the busy moves count. */
export function holdsOpenLift(block: WorkoutBlock, isDone: SetDonePredicate): boolean {
  return block.entries.some((entry) => isOpenLift(entry, isDone));
}

/**
 * The order the busy moves ask of the rows (Maintenance 25), as edges between block positions: for
 * each move, from each row holding a lift it gave way to that still has a set to do, to each other
 * row holding its lift with a set to do. A lift with nothing left asks nothing and holds nothing;
 * a move's lift and a lift it gave way to in one row (a pair) ask nothing of each other, the pair
 * taking them in turn. Each move's edges are kept apart, so a move can end as a whole.
 */
export function moveEdges(
  workout: GeneratedWorkout,
  moves: readonly WaitingMove[],
  isDone: SetDonePredicate,
): Map<WaitingMove, [number, number][]> {
  const rowsWith = (test: (entry: WorkoutEntry) => boolean) =>
    workout.blocks.flatMap((block, index) =>
      block.entries.some((entry) => isOpenLift(entry, isDone) && test(entry)) ? [index] : [],
    );
  const edges = new Map<WaitingMove, [number, number][]>();
  for (const move of moves) {
    const names = moveNames(move);
    const held = rowsWith((entry) => names.includes(entry.exerciseId));
    const after = rowsWith(
      (entry) => move.after.includes(entry.exerciseId) && !names.includes(entry.exerciseId),
    );
    edges.set(
      move,
      after.flatMap((from) =>
        held.filter((to) => to !== from).map((to): [number, number] => [from, to]),
      ),
    );
  }
  return edges;
}

/** The rows that must come after a row: waiting on it, or on a row waiting on it. */
export function rowsWaitingOn(edges: Iterable<[number, number][]>, row: number): Set<number> {
  const next = new Map<number, number[]>();
  for (const pairs of edges) {
    for (const [from, to] of pairs) next.set(from, [...(next.get(from) ?? []), to]);
  }
  const waiting = new Set<number>();
  const stack = [row];
  while (stack.length > 0) {
    const at = stack.pop() as number;
    for (const to of next.get(at) ?? []) {
      if (waiting.has(to)) continue;
      waiting.add(to);
      stack.push(to);
    }
  }
  return waiting;
}

/**
 * Where Equipment busy moves an exercise (Maintenance 25): behind the next block after its own
 * that holds a lift still to do (`holdsOpenLift`), passing over a block that waits on this one, as
 * the moves stand, for its own busy equipment (by rows: a pair moves whole, so a lift waiting on
 * the lift beside a waiting one waits too; the sixth review). None when no such block is left: the
 * exercise is the last of the workout still to do, and it is done, skipped today, or the workout
 * is finished; or everything after it waits on it.
 */
export function postponeBehind(
  workout: GeneratedWorkout,
  entryId: string,
  isDone: SetDonePredicate,
  moves: readonly WaitingMove[] = [],
): WorkoutBlock | null {
  const at = workout.blocks.findIndex((block) =>
    block.entries.some((entry) => entry.id === entryId),
  );
  if (at < 0) return null;
  const waiting = rowsWaitingOn(moveEdges(workout, moves, isDone).values(), at);
  const row = workout.blocks.findIndex(
    (block, index) => index > at && !waiting.has(index) && holdsOpenLift(block, isDone),
  );
  return row < 0 ? null : (workout.blocks[row] as WorkoutBlock);
}

/**
 * Why Equipment busy cannot move a lift: every set of it done, nothing after it to do, or all that
 * is after it waiting on it.
 */
export type PostponeRefusal = 'done' | 'last' | 'waiting';

/**
 * Whether Equipment busy can move a lift (Maintenance 25), the one rule the engine and both
 * screens read: not once every set of it is done, nor with nothing after it left to do, nor with
 * only lifts waiting on it after it. Null when it can move.
 */
export function postponeRefusal(
  workout: GeneratedWorkout,
  entryId: string,
  isDone: SetDonePredicate,
  moves: readonly WaitingMove[] = [],
): PostponeRefusal | null {
  const entry = allEntries(workout.blocks).find((candidate) => candidate.id === entryId);
  if (!entry) return null;
  if (entry.sets.every((set) => isDone(entry.id, set.index))) return 'done';
  if (postponeBehind(workout, entryId, isDone, moves)) return null;
  // Rows still to do after it, every one waiting on it (the fourth review), or none at all.
  return postponeBehind(workout, entryId, isDone) ? 'waiting' : 'last';
}

/**
 * What the Equipment busy button says when it is off (Maintenance 25). On the Workout tab the
 * lift can be done now; on Today it comes when its turn does.
 */
export function postponeRefusalText(refusal: PostponeRefusal, where: 'workout' | 'today'): string {
  if (refusal === 'done') return 'Every set of it is done, so there is nothing left to move.';
  if (refusal === 'waiting') {
    return where === 'workout'
      ? 'The exercises left after it are waiting for it, moved there for busy equipment, so there is nothing to move it behind: do it now, skip it today, or finish the workout.'
      : 'The exercises left after it are waiting for it, moved there for busy equipment, so there is nothing to move it behind: do it when it comes up, or skip it today.';
  }
  return where === 'workout'
    ? 'Nothing after it is left to do, so there is nothing to move it behind: do it now, skip it today, or finish the workout.'
    : 'Nothing after it is left to do, so there is nothing to move it behind: do it when it comes up, or skip it today.';
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
  const block = workout.blocks.find((candidate) => candidate.id === current.blockId);
  return restBetween(current, nextPosition(workout, current), block);
}

/** True when `next` is the other member of the same paired round: a switch, not a rest. */
export function isPairedSwitch(
  current: SetPosition,
  next: SetPosition | null,
  block: Pick<WorkoutBlock, 'id' | 'kind'> | undefined,
): boolean {
  return (
    block !== undefined &&
    block.kind !== 'straight' &&
    current.kind === 'working' &&
    next !== null &&
    next.blockId === block.id &&
    next.round === current.round &&
    next.kind === 'working'
  );
}

/**
 * The rest rule itself, on positions: the rest timer and the length estimate
 * both call it, so the time the plan promises is the time its timers add up to.
 */
export function restBetween(
  current: SetPosition,
  next: SetPosition | null,
  block: Pick<WorkoutBlock, 'id' | 'kind' | 'restBetweenRoundsSeconds'> | undefined,
): number {
  if (current.kind === 'drop') return 0;
  if (next && next.entryId === current.entryId && next.kind === 'drop') return 0;
  if (block && block.kind !== 'straight' && current.kind === 'working') {
    return isPairedSwitch(current, next, block) ? 0 : block.restBetweenRoundsSeconds;
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
