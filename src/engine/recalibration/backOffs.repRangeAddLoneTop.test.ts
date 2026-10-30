import { describe, expect, it } from 'vitest';
import { BENCH, bench, entryOf, plan, profileOf, run, shape } from '../../test/backOffs';

/**
 * The thirteenth review of round N: on top set plus back-offs a set added is a back-off at the load
 * its top set gives it, at the back-offs' reserve (item 11: "back-offs 5% lighter, same reps, RIR
 * 2"), made one way wherever a set is added: the sets trigger's `asBackOffs`. "Fewer reps over more
 * sets" (a rep range with a set added, `rep-range` with `workingDelta`) on a lift cut to its lone top
 * set copied the top set: a "back-off" at its load and its reserve.
 *
 * Steps: a hybrid lifter's push day, the bench press cut to its top set (190 × 4-6 at 1); 8-10 set
 * with one more set. Synthetic data only.
 */

const profile = profileOf('hybrid');

describe('a rep range with a set added after a lone top set', () => {
  it('adds a back-off at the drop, at the back-offs’ reserve, at the reps set', () => {
    const workout = plan(undefined, profile);
    const entry = bench(workout);
    entry.sets = entry.sets.filter((set) => set.tier !== 'back-off');
    expect(shape(entry)).toEqual([[190, 1, 'top']]);
    const result = run(
      { type: 'rep-range', entryId: entry.id, reps: [8, 10], workingDelta: 1 },
      workout,
      { profile },
    );
    const after = entryOf(result.workout, BENCH);
    expect(shape(after)).toEqual([
      [190, 1, 'top'],
      [180, 2, 'back-off'],
    ]);
    expect(after.sets.filter((set) => set.kind === 'working').map((set) => set.targetReps)).toEqual(
      [
        [8, 10],
        [8, 10],
      ],
    );
  });
});
