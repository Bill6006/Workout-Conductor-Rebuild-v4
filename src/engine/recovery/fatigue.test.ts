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

  it('rises with reps in reserve drifting below target, never with the sessions in a week', () => {
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
    // The drift alone (2): before Maintenance 33 four sessions in a week added one, to elevated.
    expect(signal.score).toBe(2);
    expect(signal.level).toBe('normal');
    expect(signal.evidence.join(' ')).toMatch(/closer to failure/);
  });

  it('reads hard ratings, never days in a row or a check-in (Maintenance 33)', () => {
    const hard = { effort: 'too-hard' as const, pain: false, energyAfter: 2, note: '' };
    const history = [
      record(0, 'barbell-bench-press', [[5, 185, 1]], [4, 6], 2, { rating: hard }),
      record(1, 'cable-fly', [[12, 40, 1]], [10, 15], 1, { rating: hard }),
      record(2, 'lat-pulldown', [[10, 120, 1]], [8, 12], 1),
      record(3, 'back-squat', [[5, 225, 2]], [4, 6], 2),
    ];
    const tired = interpretFatigue(history, NOW);
    expect(tired.hardRatings).toBe(2);
    // The ratings alone (2): four days running added two before, to high.
    expect(tired.score).toBe(2);
    expect(tired.level).toBe('normal');
    expect(tired.evidence.join(' ')).not.toMatch(/in a row/);
    const fresh = interpretFatigue([history[3] as (typeof history)[number]], NOW);
    expect(fresh.level).toBe('fresh');
    expect(fresh.evidence).toEqual(['No fatigue signals in recent sessions.']);
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
    // The saved check-ins are counted, for the deload's words; since Maintenance 33 they score
    // nothing and say nothing here: a check-in lowers what the app expects, never the plan.
    expect(signal.readinessTrend).toBe(3);
    expect(signal.longRests).toBe(4);
    expect(signal.performanceDrift).toBeLessThanOrEqual(-5);
    expect(signal.evidence.join(' ')).not.toMatch(/check-ins/);
    expect(signal.evidence.join(' ')).toMatch(/Rests ran long: 4 sets/);
    expect(signal.evidence.join(' ')).toMatch(/Estimated maxes fell/);
    // Long rests (1) and the fall of 8% (1): the check-ins added two before, and today's two more.
    expect(signal.score).toBe(2);
    expect(signal.level).toBe('normal');
  });
});

describe('estimated maxes read against what the sets asked (Maintenance 33)', () => {
  // The eighth review of round N: a shoulder press after three pressing lifts is planned lighter
  // than on the full-body day; lifted as asked, it is no fall.
  const NOW_AT = '2026-09-10T12:00:00.000Z';
  const pressed = (daysAgo: number, weight: number, asked: number, reps = 7) => {
    const base = record(daysAgo, 'dumbbell-shoulder-press', [
      [reps, weight, 2],
      [reps, weight, 2],
      [reps, weight, 2],
    ]);
    return {
      ...base,
      entries: base.entries.map((entry) => ({
        ...entry,
        sets: entry.sets.map((set) => ({
          ...set,
          targetWeight: asked,
          targetReps: [6, 10] as [number, number],
        })),
      })),
    };
  };

  it('a load planned lighter and lifted as asked is no fall', () => {
    const signal = interpretFatigue([pressed(1, 25, 25), pressed(3, 30, 30)], NOW_AT);
    expect(signal.performanceDrift).toBe(0);
    expect(signal.evidence.join(' ')).not.toMatch(/fell/);
  });

  it('a session saved with no targets is set only against another such', () => {
    // An older press logged before targets were saved: no pair to read, so no fall from 30 against
    // a ratio.
    const old = record(3, 'dumbbell-shoulder-press', [
      [7, 30, 2],
      [7, 30, 2],
    ]);
    const signal = interpretFatigue([pressed(1, 25, 25), old], NOW_AT);
    expect(signal.performanceDrift).toBeNull();
  });

  it('a session further short of its targets than the one before is', () => {
    // Asked 30 for 6 to 10 both days: 7 reps, then 3.
    const signal = interpretFatigue([pressed(1, 30, 30, 3), pressed(3, 30, 30)], NOW_AT);
    expect(signal.performanceDrift).toBeLessThanOrEqual(-10);
    expect(signal.performanceAgainstAsked).toBe(true);
    expect(signal.evidence.join(' ')).toMatch(
      /Lifts fell [0-9.]+% against what their sets asked over the last two sessions\./,
    );
  });

  // The first review of Maintenance 33: the plan's load step after the reps climbed the range read
  // 10% down against the session before it.
  it('at the same ask, fewer reps in the range are a fall', () => {
    // Asked 30 for 6 to 10 both days: 10 reps, then 7: 30 x (1 + 7 / 30) against 30 x (1 + 10 / 30).
    const signal = interpretFatigue([pressed(1, 30, 30, 7), pressed(3, 30, 30, 10)], NOW_AT);
    expect(signal.performanceDrift).toBe(-7.5);
  });

  it('at an ask the plan changed, reps anywhere in its range are as asked', () => {
    // 10 reps at 30, then the step to 35 for 6: neither short of its own range.
    expect(
      interpretFatigue([pressed(1, 35, 35, 6), pressed(3, 30, 30, 10)], NOW_AT).performanceDrift,
    ).toBe(0);
    // Past the top of its range, a session reads as asked, no more (the second review of
    // Maintenance 33: the step lifted as asked read 4.8% down); under the bottom, less.
    expect(
      interpretFatigue([pressed(1, 35, 35, 6), pressed(3, 30, 30, 12)], NOW_AT).performanceDrift,
    ).toBe(0);
    expect(
      interpretFatigue([pressed(1, 35, 35, 4), pressed(3, 30, 30, 10)], NOW_AT).performanceDrift,
    ).toBe(-5.6);
  });

  it('a load lifted lighter than asked is a fall, at the same ask or another', () => {
    const lighter = (asked: number) => {
      const done = pressed(1, 25, asked, 8);
      return interpretFatigue([done, pressed(3, 30, 30, 8)], NOW_AT).performanceDrift;
    };
    expect(lighter(30)).toBe(-16.7);
    expect(lighter(27.5)).toBe(-9.1);
  });
});
