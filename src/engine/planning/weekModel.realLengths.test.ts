import { describe, expect, it } from 'vitest';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import type { DurationChoice } from '../workout/types';
import { todaysNeedOf, weekModel, type WeekModel } from './weekModel';

/**
 * Maintenance 34, the forecast at real lengths: the week model plans each session still to come at
 * the length the lifter trains that weekday, and today's at its own. Every time here is a clock time
 * on the device. September 2026: the 7th is a Monday. Synthetic data only.
 *
 * Steps: Monday, Wednesday and Friday ticked; the last three Wednesdays (August 19 and 26,
 * September 2) trained at 30 minutes, no Friday trained in the window. On Monday the 7th at 8:00,
 * before training, the week holds Monday (today), Wednesday and Friday.
 */

const at = (day: number, hour = 12, month = 8) => new Date(2026, month, day, hour).toISOString();
const [, gym] = createDefaultLocations({ gymAccess: true }, at(1));
const profile: UserProfile = {
  ...createDefaultProfile(at(1), 'gym'),
  bodyweight: 185,
  schedule: {
    ...createDefaultProfile(at(1), 'gym').schedule,
    availableDays: ['mon', 'wed', 'fri'],
    weeklyFrequency: 3,
  },
};

function wednesday(day: number, month: number, durationChoice?: DurationChoice): WorkoutRecord {
  const when = at(day, 18, month);
  return record(
    0,
    'back-squat',
    [
      [5, 225, 2],
      [5, 225, 2],
      [5, 225, 2],
    ],
    [4, 6],
    2,
    {
      id: `w-wed-${month}-${day}`,
      startedAt: when,
      completedAt: when,
      ...(durationChoice !== undefined ? { durationChoice } : {}),
    },
  );
}

const wednesdays = (choice?: DurationChoice) => [
  wednesday(19, 7, choice),
  wednesday(26, 7, choice),
  wednesday(2, 8, choice),
];

const model = (history: WorkoutRecord[], todayLength?: DurationChoice): WeekModel =>
  weekModel({
    profile,
    location: gym!,
    history,
    now: at(7, 8),
    ...(todayLength !== undefined ? { todayLength } : {}),
  });

const total = (week: WeekModel, field: 'planned' | 'plannedToday') =>
  MUSCLE_IDS.reduce((sum, muscle) => sum + week.muscles[muscle][field], 0);

describe('the week forecast at real lengths', () => {
  it('plans Wednesday at the 30 minutes the lifter trains it, the other days at the Default', () => {
    const real = model(wednesdays(30));
    const atDefault = model(wednesdays());
    expect(real.sessionsAhead).toBe(3);
    // Wednesday at 30 minutes delivers fewer sets than at the Default.
    expect(total(real, 'planned')).toBeLessThan(total(atDefault, 'planned'));
    // Today's own plan is the same in both: its length is today's.
    expect(total(real, 'plannedToday')).toBe(total(atDefault, 'plannedToday'));
  });

  it('plans today at today’s own length', () => {
    const atDefault = model(wednesdays(30));
    const short = model(wednesdays(30), 15);
    expect(total(short, 'plannedToday')).toBeLessThan(total(atDefault, 'plannedToday'));
    // The days after it are planned after today's plan, as the lifter will train them: a short
    // Monday leaves the chest more for Wednesday or Friday.
    const later = (week: WeekModel) => week.muscles.chest.planned - week.muscles.chest.plannedToday;
    expect(later(short)).toBeGreaterThanOrEqual(later(atDefault));
  });

  it('owes today what the week lacks once the days after it are counted', () => {
    const week = model(wednesdays(30));
    for (const muscle of MUSCLE_IDS) {
      const one = week.muscles[muscle];
      expect(todaysNeedOf(one), muscle).toBeCloseTo(
        Math.max(0, one.target - one.done - (one.planned - one.plannedToday)),
        6,
      );
    }
    // Something is owed today: a week of three sessions, one of them short, leaves muscles under
    // their targets.
    expect(MUSCLE_IDS.some((muscle) => todaysNeedOf(week.muscles[muscle]) > 0)).toBe(true);
  });
});
