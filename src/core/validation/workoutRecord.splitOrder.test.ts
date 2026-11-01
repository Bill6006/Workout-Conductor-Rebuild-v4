import { describe, expect, it } from 'vitest';
import { RECORD_NOW, record } from '../../test/records';
import { parseWorkoutRecords } from './workoutRecord';

/**
 * Maintenance 38: a workout trained in the split's order keeps it, which holds the order for its
 * week. It reads back as it was saved; one that cannot be read is dropped alone, never the workout;
 * and a workout saved before has none. Synthetic data only.
 */
const ORDER = {
  days: [
    { day: '2026-09-07', templateId: 'lower', was: 'upper' },
    { day: '2026-09-08', templateId: 'upper', was: 'lower' },
    { day: '2026-09-10', templateId: 'full-body', was: 'full-body' },
  ],
  spared: ['quads', 'hamstrings', 'glutes'],
  fewer: [],
};

const trained = (splitOrder?: unknown) => ({
  ...record(3, 'back-squat', [[5, 225, 2]]),
  templateId: 'lower',
  ...(splitOrder === undefined ? {} : { splitOrder }),
});

describe('the split’s order kept with a workout', () => {
  it('reads back as it was saved', () => {
    const [read] = parseWorkoutRecords([JSON.parse(JSON.stringify(trained(ORDER)))]);
    expect(read?.splitOrder).toEqual(ORDER);
  });

  it('is dropped alone when it cannot be read, the workout kept', () => {
    for (const broken of [
      { days: 'monday', spared: [], fewer: [] },
      { days: [], spared: ['elbows'], fewer: [] },
      { days: [{ day: '2026-09-07', templateId: 'lower' }], spared: [], fewer: [] },
      { days: [], spared: [] },
      7,
    ]) {
      const [read] = parseWorkoutRecords([trained(broken)]);
      expect(read).toBeDefined();
      expect(read?.splitOrder).toBeUndefined();
      expect(read?.templateId).toBe('lower');
      expect(read?.startedAt).toBe(new Date(Date.parse(RECORD_NOW) - 3 * 86_400_000).toISOString());
    }
  });

  it('reads a schedule that cannot be read as none, the order kept', () => {
    // The days and the sessions a week it was read for (the re-check of the review): none, and the
    // order is never held, but the workout still keeps the order it was trained in.
    for (const schedule of [5, ['mon'], null]) {
      const [read] = parseWorkoutRecords([trained({ ...ORDER, schedule })]);
      expect(read?.splitOrder).toEqual(ORDER);
    }
    const [read] = parseWorkoutRecords([trained({ ...ORDER, schedule: 'mon,tue,thu/3' })]);
    expect(read?.splitOrder?.schedule).toBe('mon,tue,thu/3');
  });

  it('reads one saved before it as none', () => {
    const [read] = parseWorkoutRecords([trained()]);
    expect(read?.splitOrder).toBeUndefined();
  });
});
