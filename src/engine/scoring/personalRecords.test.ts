import { describe, expect, it } from 'vitest';
import { record } from '../../test/records';
import { detectPersonalRecords, liveSetRecords, recentPersonalRecords } from './personalRecords';

describe('personal records', () => {
  it('treats the first performance as a baseline, not a record', () => {
    const first = record(0, 'barbell-bench-press', [
      [5, 185, 2],
      [5, 185, 2],
    ]);
    expect(detectPersonalRecords(first, [first])).toEqual([]);
  });

  it('detects weight, reps at a weight, volume, and top-of-range records', () => {
    const earlier = record(7, 'barbell-bench-press', [
      [5, 185, 2],
      [5, 185, 2],
      [4, 185, 1],
    ]);
    const heavier = record(0, 'barbell-bench-press', [
      [5, 190, 2],
      [5, 190, 2],
      [5, 190, 2],
    ]);
    const found = detectPersonalRecords(heavier, [earlier, heavier]);
    expect(found.map((pr) => pr.kind)).toEqual(['weight', 'volume']);
    expect(found[0]).toMatchObject({ value: 190, previous: 185 });
    expect(found[0]?.detail).toBe('Barbell Bench Press: 190 lb (was 185)');
    expect(found[1]).toMatchObject({ value: 2850, previous: 2590 });

    const moreReps = record(0, 'barbell-bench-press', [
      [6, 185, 1],
      [6, 185, 1],
      [6, 185, 0],
    ]);
    const reps = detectPersonalRecords(moreReps, [earlier, moreReps]);
    expect(reps.map((pr) => pr.kind)).toEqual(['reps-at-weight', 'volume', 'top-of-range']);
    expect(reps[0]?.detail).toBe('Barbell Bench Press: 6 reps at 185 lb (was 5)');
    expect(reps[2]?.detail).toBe('Barbell Bench Press: top of the range on every set at 185 lb');
  });

  it('ignores warm-up sets and incomplete sets', () => {
    const earlier = record(7, 'barbell-bench-press', [[5, 185, 2]]);
    const today = record(0, 'barbell-bench-press', [[5, 185, 2]]);
    today.entries[0]?.sets.push(
      { kind: 'warmup', reps: 5, weight: 225, rir: 5, completed: true },
      { kind: 'working', reps: 3, weight: 205, rir: 0, completed: false },
    );
    expect(detectPersonalRecords(today, [earlier, today])).toEqual([]);
  });

  it('gives compact live feedback from logged sets and lists recent records', () => {
    const earlier = record(7, 'barbell-bench-press', [[5, 185, 2]]);
    const live = liveSetRecords(
      'barbell-bench-press',
      [
        {
          entryId: 'e1',
          exerciseId: 'barbell-bench-press',
          setIndex: 2,
          kind: 'working',
          reps: 6,
          weight: 185,
          rir: 1,
          completedAt: '2026-09-10T12:00:00.000Z',
        },
      ],
      [earlier],
    );
    expect(live).toEqual([{ kind: 'reps-at-weight', label: 'Rep PR' }]);
    expect(liveSetRecords('barbell-bench-press', [], [])).toEqual([]);

    const withPr = record(0, 'barbell-bench-press', [[5, 190, 2]], [4, 6], 2, {
      prs: [
        {
          exerciseId: 'barbell-bench-press',
          kind: 'weight',
          value: 190,
          previous: 185,
          detail: 'x',
        },
      ],
    });
    expect(recentPersonalRecords([earlier, withPr])).toHaveLength(1);
    expect(recentPersonalRecords([earlier, withPr])[0]?.pr.kind).toBe('weight');
  });
});
