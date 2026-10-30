import { describe, expect, it } from 'vitest';
import { backOffLoadAfter, topSetLoad, withDropsToday } from './backOffs';
import { loadingFor } from '../../engine/loading/loading';
import type { SetPrescription } from '../workout/types';
import { bench, gym, plan } from '../../test/backOffs';

/**
 * The thirteenth review of round N: a top set still to come gives its back-offs the drop off the
 * load it asks, the one it stands in for where the weights here make less (`asked`), never the
 * stand-in's (`topSetLoad`): wherever their load is worked out before it is lifted, a saved copy's
 * and a set added with no weight logged included.
 *
 * Steps: the bench press's top set standing in at 185 × 5-7 for 190 × 4-6 (a load asked); the drop
 * 5%. A saved copy of it loaded (`withDropsToday`); or the back-offs' load worked out with no weight
 * logged (`backOffLoadAfter`, as the sets trigger asks for a set added after a lone top set).
 * Synthetic data only.
 */

const standIn = (top: SetPrescription): SetPrescription => ({
  ...top,
  targetWeight: 185,
  targetReps: [5, 7],
  asked: { weight: 190, reps: [4, 6] },
});

describe('the load a top set standing in asks of its back-offs', () => {
  it('is the load it stands in for', () => {
    const top = bench(plan()).sets.find((set) => set.tier === 'top')!;
    expect(topSetLoad(standIn(top))).toBe(190);
    expect(topSetLoad(top)).toBe(top.targetWeight);
  });

  it('gives a saved copy’s back-offs the drop off it', () => {
    const planned = plan();
    const entry = bench(planned);
    entry.sets = entry.sets.map((set) => (set.tier === 'top' ? standIn(set) : set));
    const loadingOf = (exercise: Parameters<typeof loadingFor>[2]) =>
      loadingFor(gym.loading, { missingPlates: [] }, exercise, 'lb');
    const loaded = bench(withDropsToday(planned, [], loadingOf, 'lb'));
    // 5% off 190 is 180.5: 180 on the plates; off the stand-in's 185, 175.75: 175.
    expect(
      loaded.sets.filter((set) => set.tier === 'back-off').map((set) => set.targetWeight),
    ).toEqual([180, 180, 180]);
  });

  it('gives the back-offs the drop off it with no weight logged', () => {
    const top = standIn(bench(plan()).sets.find((set) => set.tier === 'top')!);
    const load = backOffLoadAfter(top, { reps: 5, rir: null, weight: null }, 0.05, {
      step: 5,
      floor: 45,
      loading: null,
    });
    expect(load).toBe(180);
  });
});
