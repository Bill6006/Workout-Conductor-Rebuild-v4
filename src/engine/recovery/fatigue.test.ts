import { describe, expect, it } from 'vitest';
import { record } from '../../test/records';
import { interpretFatigue } from './fatigue';

const NOW = '2026-09-10T12:00:00.000Z';

describe('fatigue interpretation', () => {
  it('reads fresh with no recent sessions', () => {
    const signal = interpretFatigue([], NOW);
    expect(signal.level).toBe('fresh');
    expect(signal.evidence).toEqual(['No fatigue signals in recent sessions.']);
  });

  it('rises with session density and reps in reserve drifting below target', () => {
    const history = [
      record(1, 'barbell-bench-press', [
        [5, 185, 0],
        [4, 185, 0],
        [4, 185, 0],
      ]),
      record(
        2,
        'cable-fly',
        [
          [12, 40, 0],
          [11, 40, 0],
        ],
        [10, 15],
        1,
      ),
      record(4, 'lat-pulldown', [[10, 120, 2]], [8, 12], 1),
      record(6, 'back-squat', [[5, 225, 2]], [4, 6], 2),
    ];
    const signal = interpretFatigue(history, NOW);
    expect(signal.sessionsLast7Days).toBe(4);
    expect(signal.rirDrift).toBeLessThanOrEqual(-1);
    expect(signal.level).toBe('elevated');
    expect(signal.evidence.join(' ')).toMatch(/closer to failure/);
  });

  it('reads high with consecutive days, hard ratings, and a poor check-in, and eases when fresh', () => {
    const hard = { effort: 'too-hard' as const, pain: false, energyAfter: 2, note: '' };
    const history = [
      record(0, 'barbell-bench-press', [[5, 185, 1]], [4, 6], 2, { rating: hard }),
      record(1, 'cable-fly', [[12, 40, 1]], [10, 15], 1, { rating: hard }),
      record(2, 'lat-pulldown', [[10, 120, 1]], [8, 12], 1),
      record(3, 'back-squat', [[5, 225, 2]], [4, 6], 2),
    ];
    const tired = interpretFatigue(history, NOW, {
      energy: 2,
      soreness: 4,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    });
    expect(tired.consecutiveDays).toBe(4);
    expect(tired.hardRatings).toBe(2);
    expect(tired.level).toBe('high');
    const fresh = interpretFatigue([history[3] as (typeof history)[number]], NOW, {
      energy: 5,
      soreness: 1,
      sleep: 5,
      motivation: 5,
      jointDiscomfort: [],
      timePressure: false,
    });
    expect(fresh.level).toBe('fresh');
    expect(fresh.evidence).toContain('Feeling fresh in today’s check-in.');
  });

  it('reads the check-in trend, long rests, and performance drift', () => {
    const tired = {
      energy: 2,
      sleep: 2,
      soreness: 4,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    const slow = (daysAgo: number, weight: number) => {
      const base = record(daysAgo, 'barbell-bench-press', [
        [5, weight, 2],
        [5, weight, 2],
        [5, weight, 2],
      ]);
      const start = Date.parse(base.startedAt);
      return {
        ...base,
        readiness: tired,
        entries: base.entries.map((entry) => ({
          ...entry,
          role: 'primary-strength',
          sets: entry.sets.map((set, index) => ({
            ...set,
            loggedAt: new Date(start + index * 6 * 60_000).toISOString(),
          })),
        })),
      };
    };
    const history = [slow(1, 165), slow(3, 180), slow(5, 185), slow(7, 185)];
    const signal = interpretFatigue(history, NOW);
    expect(signal.readinessTrend).toBe(3);
    expect(signal.longRests).toBe(4);
    expect(signal.performanceDrift).toBeLessThanOrEqual(-5);
    expect(signal.evidence.join(' ')).toMatch(/Low energy or sleep in 3 of the last 3 check-ins/);
    expect(signal.evidence.join(' ')).toMatch(/Sore in 3 of the last 3 check-ins/);
    expect(signal.evidence.join(' ')).toMatch(/Rests ran long: 4 sets/);
    expect(signal.evidence.join(' ')).toMatch(/Estimated maxes fell/);
    expect(signal.level).toBe('high');
  });
});
