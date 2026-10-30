import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries } from '../../engine/workout/types';
import { record, type SetSpec } from '../../test/records';
import { DB_BENCH, entryOf, home, plan, shape } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the third review of round N): a top set the place cannot
 * load as asked runs the lift straight, at the back-offs' load the top set's asked load gives,
 * never the heaviest weight there at a straight set's reserve. Synthetic data only.
 */

function structured(
  daysAgo: number,
  top: SetSpec,
  backOffs: SetSpec[],
  drop = 0.05,
): WorkoutRecord {
  const done = record(daysAgo, DB_BENCH, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

const backOffsAt = (weight: number): SetSpec[] => [
  [5, weight, 2],
  [5, weight, 2],
  [5, weight, 2],
];

/** Home, its dumbbells from 5 to `cap` lb a hand. */
const homeUpTo = (cap: number) => ({
  ...home,
  loading: { dumbbells: { kind: 'dumbbells' as const, ranges: [{ from: 5, to: cap, step: 5 }] } },
});

describe('a main lift at the heaviest dumbbells after a session on the structure, the third review of round N', () => {
  const history = () => [
    structured(7, [5, 95, 1], backOffsAt(90)),
    structured(3, [5, 100, 1], backOffsAt(95)),
  ];

  it('the control: with heavier dumbbells there, a top set at 105 and back-offs at 100', () => {
    const workout = plan(history(), undefined, {}, homeUpTo(150));
    const entry = entryOf(workout, DB_BENCH);
    expect(entry.role).toBe('primary-strength');
    expect(shape(entry)).toEqual([
      [105, 1, 'top'],
      // 5% under 105: 99.75, 100 to the nearest weight (the fifth review of round N).
      [100, 2, 'back-off'],
      [100, 2, 'back-off'],
      [100, 2, 'back-off'],
    ]);
  });

  it('dumbbells only to 100: straight sets, none over the back-offs’ load the structure would give', () => {
    const workout = plan(history(), undefined, {}, homeUpTo(100));
    const entry = entryOf(workout, DB_BENCH);
    expect(entry.role).toBe('primary-strength');
    const sets = shape(entry);
    // Straight sets: the top set cannot be loaded as asked.
    expect(sets.every((set) => set[2] === 'straight')).toBe(true);
    expect(sets.every((set) => set[1] === 2)).toBe(true);
    // At a straight set's reserve after a session on the structure: the back-offs' load (100, off
    // the 105 asked), never the asked top set's on every set.
    expect(Math.max(...sets.map((set) => set[0] as number))).toBeLessThanOrEqual(100);
    expect(allEntries(workout.blocks).length).toBeGreaterThan(0);
  });

  it('the back-offs’ load is the drop off the load asked, never off the heaviest weight there', () => {
    // The top set asks 110: its back-offs' load, 104.5, is 100 on these dumbbells; the drop off
    // the heaviest there would be 95.
    const workout = plan(
      [structured(7, [5, 100, 1], backOffsAt(95)), structured(3, [5, 105, 1], backOffsAt(95))],
      undefined,
      {},
      homeUpTo(100),
    );
    expect(shape(entryOf(workout, DB_BENCH))).toEqual([
      [100, 2, 'straight'],
      [100, 2, 'straight'],
      [100, 2, 'straight'],
      [100, 2, 'straight'],
    ]);
  });
});
