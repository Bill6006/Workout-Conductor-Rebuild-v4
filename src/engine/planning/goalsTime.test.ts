import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import { goalsTimeChanged, goalsTimeReading } from './goalsTime';

/**
 * Maintenance 34, the honest goals-versus-time check: three completed weeks running, each with a
 * session, of the goals' muscles under 4 sets a week at lengths shorter than the Default. The default
 * lifter: bigger arms second, so the biceps and triceps; a 60-minute Default. Every time is a clock
 * time on this device. Thursday, October 29, 2026 is now; the three weeks before begin on the
 * Mondays of October 5, 12 and 19. Synthetic data only.
 */

const profile = createDefaultProfile('2026-10-01T12:00:00.000Z');
const at = (month: number, day: number) => new Date(2026, month, day, 18).toISOString();
const NOW = new Date(2026, 9, 29, 12).toISOString();

/** A squat day with `curls` sets of curls, planned at `minutes`. */
function day(month: number, date: number, curls: number, minutes: number): WorkoutRecord {
  const when = at(month, date);
  const squat = record(0, 'back-squat', [
    [5, 225, 2],
    [5, 225, 2],
    [5, 225, 2],
  ]);
  const arms = record(
    0,
    'ez-bar-curl',
    Array.from({ length: curls }, () => [10, 60, 2] as [number, number, number]),
  );
  return {
    ...squat,
    id: `w-${month}-${date}`,
    startedAt: when,
    completedAt: when,
    plannedMinutes: minutes,
    entries: [...squat.entries, ...(curls > 0 ? arms.entries : [])],
  };
}

/** Two short days a week for the three weeks: 1 set of curls each, the triceps none. */
const shortWeeks = (minutes = 30) => [
  day(9, 6, 1, minutes),
  day(9, 8, 1, minutes),
  day(9, 13, 1, minutes),
  day(9, 15, 1, minutes),
  day(9, 20, 1, minutes),
  day(9, 22, 1, minutes),
];

describe('the honest goals-versus-time reading', () => {
  it('names the goals’ muscles under the floor every week, with the weeks’ sessions and minutes', () => {
    const reading = goalsTimeReading(profile, shortWeeks(), NOW);
    expect(reading).toEqual({ muscles: ['biceps', 'triceps'], sessions: 2, minutes: 30 });
  });

  it('reads nothing in a week away: a break, not a short week', () => {
    const history = shortWeeks().filter((one) => !one.startedAt.startsWith('2026-10-1'));
    expect(goalsTimeReading(profile, history, NOW)).toBeNull();
  });

  it('reads nothing at the Default: time is not what held the muscles back', () => {
    expect(goalsTimeReading(profile, shortWeeks(60), NOW)).toBeNull();
  });

  it('reads nothing of a muscle at the floor in any one week', () => {
    // Four sets of curls in the middle week: the biceps reach the floor there.
    const history = [...shortWeeks(), day(9, 14, 4, 30)];
    expect(goalsTimeReading(profile, history, NOW)?.muscles).toEqual(['triceps']);
  });
});

describe('a material change', () => {
  const kept = { muscles: ['biceps', 'triceps'] as const, minutes: 30 };

  it('is other muscles, or the minutes moved by a quarter or more', () => {
    expect(goalsTimeChanged({ muscles: ['triceps'], minutes: 30 }, kept)).toBe(true);
    expect(goalsTimeChanged({ muscles: ['triceps', 'biceps'], minutes: 37 }, kept)).toBe(false);
    expect(goalsTimeChanged({ muscles: ['biceps', 'triceps'], minutes: 38 }, kept)).toBe(true);
    expect(goalsTimeChanged({ muscles: ['biceps', 'triceps'], minutes: 22 }, kept)).toBe(true);
    expect(goalsTimeChanged({ muscles: ['biceps'], minutes: 30 }, null)).toBe(true);
  });
});
