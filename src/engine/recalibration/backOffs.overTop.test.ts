import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, type SetSpec } from '../../test/records';
import { BENCH, bench, plan, run, topDone } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the second review of round N): the back-offs are never
 * heavier than the top set as lifted, a step up after a clearly easy top set at a drop narrowed to
 * nothing included: the drop's floor is 0%. Synthetic data only.
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

describe('a clearly easy top set at a drop narrowed to nothing, the second review of round N', () => {
  it('never takes the back-offs over the top set as lifted', () => {
    // Back-offs at 4 in reserve against 2, two sessions running: the drop narrows to 0.
    const easy: SetSpec[] = [
      [5, 180, 4],
      [5, 180, 4],
      [5, 180, 4],
    ];
    const history = [structured(7, [5, 190, 1], easy), structured(3, [5, 190, 1], easy)];
    const workout = plan(history);
    const entry = bench(workout);
    expect(entry.backOffDrop).toBe(0);
    const top = entry.sets.find((set) => set.tier === 'top')!;
    const lifted = top.targetWeight!;
    const done = topDone(entry, lifted);
    done.sets = done.sets.map((set) => ({ ...set, reps: 8, rir: 4 }));
    // The store's own plan for a top set clearly easy: a step up.
    const result = run(
      {
        type: 'performance',
        entryId: entry.id,
        setIndex: top.index,
        actualReps: 8,
        actualWeight: lifted,
        plan: { kind: 'weight', delta: 5, reason: 'Set 1: 8 reps with 4 in reserve.' },
      },
      workout,
      { completed: done, currentEntryId: entry.id, history },
    );
    const backOffs = bench(result.workout)
      .sets.filter((set) => set.tier === 'back-off')
      .map((set) => set.targetWeight!);
    expect(backOffs.length).toBeGreaterThan(0);
    expect(Math.max(...backOffs)).toBeLessThanOrEqual(lifted);
  });
});
