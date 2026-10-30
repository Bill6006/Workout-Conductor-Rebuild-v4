import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries } from '../workout/types';
import { record, type SetSpec } from '../../test/records';
import { BENCH, plan, profileOf } from '../../test/backOffs';
import { simulate } from '../../test/backOffsSim';

/**
 * The fifth review of round N. The top set reads past the lift's straight days at the back-offs'
 * load (`pastBackOffDays`, the fourth review), and so reads the gap since its last top set as a
 * break: three weeks after it, with the lift trained in between on such a day, the top set's read
 * is a "return" ("22 days since the last session: back at 90% of the estimated max"), a mode that
 * runs the main lift straight, at its own straight target off the day at the back-offs' load. The
 * lift had no break: it was trained eight days before. The spec: straight sets where the load is a
 * guess or eased; a main lift on a plain day is a top set and back-offs. Once a week on the
 * three-day rotation, every other upper day loses its top set so. Synthetic data only.
 */

function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2, { templateId: 'upper' });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

/** The full-body day's bench press, straight at the back-offs' load, every set as asked. */
function fullBody(daysAgo: number, weight: number): WorkoutRecord {
  const done = record(
    daysAgo,
    BENCH,
    [
      [5, weight, 2],
      [5, weight, 2],
      [5, weight, 2],
    ],
    [4, 6],
    2,
    { templateId: 'full-body' },
  );
  done.entries[0]!.role = 'secondary-strength';
  done.entries[0]!.atBackOffs = true;
  return done;
}

describe('a main day three weeks after its last top set, the lift trained on a day between', () => {
  it('is a top set and back-offs, never a return from a break', () => {
    // The upper day 22 days ago, a top set as asked; the full-body day 8 days ago at 190.
    const history = [
      structured(
        22,
        [5, 200, 1],
        [
          [5, 190, 2],
          [5, 190, 2],
          [5, 190, 2],
        ],
      ),
      fullBody(8, 190),
    ];
    const bench = allEntries(plan(history, profileOf(), { templateId: 'upper' }).blocks).find(
      (entry) => entry.exerciseId === BENCH,
    )!;
    expect(bench.role).toBe('primary-strength');
    const tiers = bench.sets.filter((set) => set.kind === 'working').map((set) => set.tier);
    // On 7f23a26: four straight sets at 195 x 4-6 at 2 in reserve, read off the full-body day.
    expect(tiers[0], (bench.progression?.evidence ?? []).join(' / ')).toBe('top');
  });

  it('once a week (full body, upper, lower in turn), the bench press keeps its top set on its upper days', () => {
    const profile = profileOf('hybrid', {
      schedule: { weeklyFrequency: 1, typicalDurationMinutes: 60, availableDays: ['mon'] },
    });
    const seed = {
      ...record(0, BENCH, [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ]),
      id: 'seed',
      startedAt: '2026-09-04T12:00:00.000Z',
      completedAt: '2026-09-04T12:00:00.000Z',
    };
    const { seen } = simulate({
      profile,
      history: [seed],
      start: '2026-09-07T12:00:00.000Z',
      days: [0, 7, 14, 21, 28, 35, 42, 49, 56, 63],
      exerciseId: BENCH,
    });
    const upper = seen.filter((one) => one.template === 'upper');
    expect(upper.length).toBeGreaterThanOrEqual(3);
    const lines = upper.map((one) => `day ${one.day}: ${one.sets.join(' | ')}`).join('\n');
    // On 7f23a26: the upper day after a full-body day at the back-offs' load runs straight.
    expect(
      upper.slice(1).every((one) => one.sets[0]!.startsWith('top')),
      lines,
    ).toBe(true);
  });
});
