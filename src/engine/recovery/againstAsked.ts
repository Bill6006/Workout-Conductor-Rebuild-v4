/**
 * A set read against what it asked (Maintenance 33; the eighth review of round N, and the first
 * review of Maintenance 33). Every reading that sets a lift's session against another's to see a
 * fall reads it so: the fatigue's drift, a first set against the lift's rested sessions, and what a
 * muscle's own sessions teach of its window.
 *
 * Where the plan asked the same of both sets, they are set against each other as lifted: fewer reps
 * at the same ask is a fall. Where it asked something else (a load step, a deload, a lift later in a
 * session, a day at the back-offs' load, a day's reserve), each is read against its own ask, reps
 * anywhere in its range at its load being as asked, as the progression reads them: the plan's own
 * change, lifted as asked, is never a fall, while a set short of its range, or lighter than asked, is.
 * A set past what it asked reads as asked, no more (the second review of Maintenance 33: reps past
 * the range before a load step read the step, lifted as asked, as a fall). A set saved with no
 * target is read as it is, and set only against another such.
 */

/** A set's max by the reader's own rule, from its load, reps and reserve. */
export type MaxRule = (weight: number, reps: number, rir: number) => number;

/** A set as a reading needs it: what it did and what it asked. */
export interface AskedSet {
  reps: number;
  rir: number | null;
  targetWeight?: number | null;
  targetReps?: readonly [number, number] | null;
  targetRir?: number | null;
}

export interface AskedRead {
  /** The set as lifted, read as a max. */
  lifted: number;
  /** What it asked, read the same way at its reps held to the range asked; null with no target. */
  asked: number | null;
  /** What it asked as one word, null with no target: the same word is the same ask. */
  ask: string | null;
}

/** A set already read as a max (`lifted`), read against what it asked by the same rule. */
export function askedRead(set: AskedSet, lifted: number, rule: MaxRule): AskedRead {
  const weight = set.targetWeight;
  const range = set.targetReps;
  if (typeof weight !== 'number' || weight <= 0 || !range) {
    return { lifted, asked: null, ask: null };
  }
  const [low, high] = range;
  const reps = Math.min(Math.max(set.reps, low), Math.max(low, high));
  const reserve = set.targetRir ?? set.rir ?? 0;
  return {
    lifted,
    asked: rule(weight, reps, reserve),
    ask: `${weight}|${low}-${high}|${set.targetRir ?? ''}`,
  };
}

/**
 * How a read set did against an earlier one, as a share (0.9 is 10% under); null where one has a
 * target and the other none.
 */
export function againstEarlier(read: AskedRead, earlier: AskedRead): number | null {
  if ((read.ask === null) !== (earlier.ask === null) || earlier.lifted <= 0) return null;
  if (read.ask === earlier.ask) return read.lifted / earlier.lifted;
  const asked = read.asked as number;
  const before = earlier.asked as number;
  if (asked <= 0 || before <= 0) return null;
  return Math.min(1, read.lifted / asked) / Math.min(1, earlier.lifted / before);
}
