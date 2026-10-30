import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, type SetSpec } from '../../test/records';
import { BENCH, bench, plan, shape } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11, in "Why this target" (the second review of round N): a
 * target read from a session's top set alone says so, never that every set cleared its floor.
 * Synthetic data only.
 */

/** A session on the structure: a top set, then back-offs, `daysAgo`, at a drop. */
function structured(
  daysAgo: number,
  top: SetSpec,
  backOffs: SetSpec[],
  drop = 0.05,
): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

describe('"Why this target" after back-offs under their floor, the second review of round N', () => {
  it('never says every set cleared the floor', () => {
    // The top set 5 @ RIR 1 on 4-6; every back-off 3 reps with nothing left.
    const history = [
      structured(
        3,
        [5, 190, 1],
        [
          [3, 180, 0],
          [3, 180, 0],
          [3, 180, 0],
        ],
      ),
    ];
    const entry = bench(plan(history));
    // The step is taken, as agreed: the back-offs never hold it back.
    expect(shape(entry)[0]).toEqual([195, 1, 'top']);
    const evidence = entry.progression?.evidence ?? [];
    expect(evidence.join(' ')).not.toMatch(/every set cleared the floor/i);
  });
});
