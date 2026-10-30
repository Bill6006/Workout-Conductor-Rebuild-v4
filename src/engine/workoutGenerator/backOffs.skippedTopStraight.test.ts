import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, type SetSpec } from '../../test/records';
import { BENCH, bench, plan, shape } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the third review of round N): a straight day reads the
 * session its target is read from: after one whose top set was skipped, the session before it, on
 * the structure, gives the back-offs' load. Synthetic data only.
 */

function structured(
  daysAgo: number,
  top: SetSpec,
  backOffs: SetSpec[],
  drop = 0.05,
  topSkipped = false,
): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  if (topSkipped) {
    const first = entry.sets[0]!;
    first.completed = false;
    first.reps = 0;
    first.weight = null;
    first.rir = null;
  }
  return done;
}

const backOffsAt = (weight: number): SetSpec[] => [
  [5, weight, 2],
  [5, weight, 2],
  [5, weight, 2],
];

const catchUp = {
  kind: 'catch-up' as const,
  muscles: [{ muscle: 'chest' as const, sets: 3, minRir: 1, why: 'behind' as const }],
  sitOut: [],
};

describe('a straight day after a session on the structure whose top set was skipped, the third review of round N', () => {
  it('the control: with the top set done last time, a catch-up takes the back-offs’ load', () => {
    const history = [
      structured(7, [5, 185, 1], backOffsAt(175)),
      structured(3, [5, 190, 1], backOffsAt(180)),
    ];
    const plain = shape(bench(plan(history)));
    expect(plain[0]).toEqual([195, 1, 'top']);
    const sets = shape(bench(plan(history, undefined, { catchUp })));
    expect(sets.every((set) => set[2] === 'straight')).toBe(true);
    expect(Math.max(...sets.map((set) => set[0] as number))).toBeLessThanOrEqual(185);
  });

  it('the top set skipped last time, its back-offs done: still no straight set over the back-offs’ load', () => {
    // 7 days ago: top set 190 x 5 @ 1, back-offs at 180. 3 days ago: the top set skipped, the
    // back-offs at 180 done. The progression reads the top set of 7 days ago (195 on a plain day).
    const history = [
      structured(7, [5, 190, 1], backOffsAt(180)),
      structured(3, [0, null, null], backOffsAt(180), 0.05, true),
    ];
    const plain = shape(bench(plan(history)));
    expect(plain[0]).toEqual([195, 1, 'top']);
    expect(plain.slice(1).map((set) => set[0])).toEqual([185, 185, 185]);
    // A catch-up runs the lift straight at a straight set's reserve: the back-offs' load, never the
    // top set's.
    const sets = shape(bench(plan(history, undefined, { catchUp })));
    expect(sets.every((set) => set[2] === 'straight')).toBe(true);
    expect(Math.max(...sets.map((set) => set[0] as number))).toBeLessThanOrEqual(185);
  });
});
