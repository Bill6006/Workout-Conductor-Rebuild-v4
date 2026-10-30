import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { backOffDropFor, withDropsToday } from './backOffs';
import { loadingFor } from '../../engine/loading/loading';
import { BENCH, bench, gym, plan, run } from '../../test/backOffs';
import { record } from '../../test/records';

/**
 * Maintenance 32, the owner's item 11 (the fourth review of round N): a saved copy with the top
 * set's weight set by hand, loaded after the drop moved, takes the drop in force off the top set on
 * its back-offs too. Synthetic data only.
 */

/** A session of the bench press on the structure, `daysAgo`, at a drop, its back-offs on target. */
function structured(daysAgo: number, drop: number): WorkoutRecord {
  const done = record(daysAgo, BENCH, [
    [5, 190, 1],
    [5, 165, 2],
    [5, 165, 2],
    [5, 165, 2],
  ]);
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

describe('a saved copy with the top set’s weight set by hand, loaded after the drop moved, the fourth review of round N', () => {
  it('its back-offs take the drop in force off the top set, as the entry says', () => {
    const planned = plan();
    const entry = bench(planned);
    expect(entry.backOffDrop).toBe(0.05);
    // "Target 200 lb" set by hand before the top set: the top set's, the back-offs at 5% under it.
    const handSet = run({ type: 'target-weight', entryId: entry.id, weight: 200 }, planned).workout;
    const top = bench(handSet).sets.find((set) => set.tier === 'top')!;
    expect(top.targetWeight).toBe(200);
    expect(
      bench(handSet)
        .sets.filter((set) => set.tier === 'back-off')
        .map((set) => set.targetWeight),
    ).toEqual([190, 190, 190]);
    // Since the copy was saved, two sessions at 13%: the drop in force.
    const since = [structured(6, 0.13), structured(3, 0.13)];
    expect(backOffDropFor(BENCH, since)).toBe(0.13);
    const loadingOf = (exercise: Parameters<typeof loadingFor>[2]) =>
      loadingFor(gym.loading, { missingPlates: [] }, exercise, 'lb');
    const loaded = bench(withDropsToday(handSet, since, loadingOf, 'lb'));
    expect(loaded.backOffDrop).toBe(0.13);
    // 13% off 200 is 174: 175 on the plates, the nearest (the fifth review of round N).
    const expected = 175;
    // Fails on 5894333: 190 on every back-off (5% under 200) on an entry that says 13%.
    expect(
      loaded.sets.filter((set) => set.tier === 'back-off').map((set) => set.targetWeight),
    ).toEqual([expected, expected, expected]);
  });
});
