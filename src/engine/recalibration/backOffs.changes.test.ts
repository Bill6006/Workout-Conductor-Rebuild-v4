import { describe, expect, it } from 'vitest';
import { bench, plan, run, shape, topDone } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11, in the list of changes (the first review of round N): a
 * change to a lift's back-offs is named when its top set's load stays, as the change to a straight
 * set's load always was. Synthetic data only.
 */

describe('the list of changes on a lift on top set plus back-offs, the first review of round N', () => {
  it('names a change to the back-offs’ load when the top set’s stays', () => {
    const workout = plan();
    const entry = bench(workout);
    const result = run({ type: 'loading' }, workout, {
      completed: topDone(entry, 190),
      currentEntryId: entry.id,
      loading: { missingPlates: [2.5] },
    });
    const sets = shape(bench(result.workout));
    expect(sets[0]).toEqual([190, 1, 'top']);
    // The back-offs moved: 180 needs a 2.5 lb plate a side.
    expect(sets.slice(1).every((set) => set[0] !== 180)).toBe(true);
    expect(result.summary.headline).toBe('Loads matched to what Gym has.');
    expect(result.changes.some((change) => change.entryId === entry.id)).toBe(true);
  });
});
