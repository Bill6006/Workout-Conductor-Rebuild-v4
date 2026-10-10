/**
 * How far a lift's first working set fell short of what its target asked (Maintenance 26, the
 * owner's item 42, docs/research/bad-start.md): the bottom of its range plus the reserve asked,
 * against the reps done plus the reserve logged. One rule for the hard start, which reads today's
 * first sets, and for the target, which marks a session that fell as short, so a lift that falls
 * that short every session is not read as a hard start every session (the third pass of item 42).
 */

/**
 * A lift falls well short when its first working set shows a capacity (reps plus the reserve
 * logged) this many reps under what its target asked: about three times the day-to-day error of
 * reps to failure (Mitter 2022: 0.7 to 1.1 reps), and 7 to 9% of the max at the reps judged.
 */
export const SHORT_BY_REPS = 3;

/** Reps to failure a set fell short of what it asked: `floor + reserve - (reps + rir)`. */
export function shortBy(floor: number, reserve: number, reps: number, rir: number): number {
  return floor + reserve - (reps + rir);
}
