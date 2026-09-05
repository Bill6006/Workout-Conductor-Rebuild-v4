import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import { overrideBias } from './overrides';

const BENCH = 'barbell-bench-press';

function session(daysAgo: number, target: number, actual: number): WorkoutRecord {
  const base = record(daysAgo, BENCH, [[5, actual, 2]]);
  return {
    ...base,
    entries: base.entries.map((entry) => ({
      ...entry,
      sets: entry.sets.map((set) => ({ ...set, targetWeight: target })),
    })),
  };
}

describe('learning from overrides', () => {
  it('steps the target up when the lifter went above it in three of the last four sessions', () => {
    const history = [
      session(2, 185, 190),
      session(5, 185, 190),
      session(8, 185, 185),
      session(11, 180, 185),
    ];
    const bias = overrideBias(history, BENCH, 5);
    expect(bias).toMatchObject({ steps: 1, above: 3, below: 0, compared: 4 });
    expect(bias.evidence).toBe(
      'You lifted above the suggested load in 3 of the last 4 sessions: the target steps up to meet you.',
    );
  });

  it('steps the target down when the lifter chose less three times, and stays put otherwise', () => {
    const down = [
      session(2, 185, 180),
      session(5, 185, 175),
      session(8, 185, 180),
      session(11, 185, 185),
    ];
    expect(overrideBias(down, BENCH, 5)).toMatchObject({ steps: -1, below: 3 });
    const mixed = [
      session(2, 185, 190),
      session(5, 185, 180),
      session(8, 185, 190),
      session(11, 185, 185),
    ];
    expect(overrideBias(mixed, BENCH, 5).steps).toBe(0);
    // Small differences under half a step do not count as overrides.
    const close = [
      session(2, 185, 187),
      session(5, 185, 187),
      session(8, 185, 187),
      session(11, 185, 187),
    ];
    expect(overrideBias(close, BENCH, 5).steps).toBe(0);
  });

  it('only looks at the newest four sessions with a recorded target, and ignores other lifts', () => {
    const history = [
      session(2, 185, 185),
      session(5, 185, 185),
      record(6, 'dumbbell-row', [[10, 60, 2]]),
      session(8, 185, 185),
      session(11, 185, 185),
      session(14, 185, 190),
      session(17, 185, 190),
      session(20, 185, 190),
    ];
    const bias = overrideBias(history, BENCH, 5);
    expect(bias).toMatchObject({ steps: 0, above: 0, compared: 4 });
    expect(overrideBias([record(2, BENCH, [[5, 185, 2]])], BENCH, 5).compared).toBe(0);
  });
});
