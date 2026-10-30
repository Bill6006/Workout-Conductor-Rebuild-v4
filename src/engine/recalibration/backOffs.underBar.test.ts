import { describe, expect, it } from 'vitest';
import { bench, plan, run, topDone } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the third review of round N): the back-offs are never under
 * the bar, a top set logged under it included. Synthetic data only.
 */

describe('a top set logged under the empty bar, the third review of round N', () => {
  it('never puts the back-offs under the bar', () => {
    const workout = plan();
    const entry = bench(workout);
    const top = entry.sets.find((set) => set.tier === 'top')!;
    const done = topDone(entry, 40);
    const result = run(
      {
        type: 'performance',
        entryId: entry.id,
        setIndex: top.index,
        actualReps: 5,
        actualWeight: 40,
        plan: { kind: 'none', reason: 'On target.' },
      },
      workout,
      { completed: done, currentEntryId: entry.id },
    );
    const backOffs = bench(result.workout)
      .sets.filter((set) => set.tier === 'back-off')
      .map((set) => set.targetWeight!);
    expect(backOffs.length).toBeGreaterThan(0);
    // The barbell bench press's empty bar: 45 lb.
    expect(Math.min(...backOffs)).toBeGreaterThanOrEqual(45);
  });

  it('nor after a grind under it', () => {
    const workout = plan();
    const entry = bench(workout);
    const top = entry.sets.find((set) => set.tier === 'top')!;
    const result = run(
      {
        type: 'performance',
        entryId: entry.id,
        setIndex: top.index,
        actualReps: 5,
        actualWeight: 40,
        plan: { kind: 'weight', delta: -5, reason: 'A grind.' },
      },
      workout,
      { completed: topDone(entry, 40), currentEntryId: entry.id },
    );
    const backOffs = bench(result.workout)
      .sets.filter((set) => set.tier === 'back-off')
      .map((set) => set.targetWeight!);
    expect(backOffs.length).toBeGreaterThan(0);
    expect(Math.min(...backOffs)).toBeGreaterThanOrEqual(45);
  });
});
