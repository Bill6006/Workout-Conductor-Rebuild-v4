import { describe, expect, it } from 'vitest';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { dayList, scheduleFit } from './scheduleFit';

/**
 * Maintenance 27, the owner's item 46: four complete weeks trained other than the schedule bring a
 * card to move it. RECORD_NOW is Thursday 10 September 2026; the complete weeks before it start on
 * Mondays 31 August, 24 August, 17 August and 10 August.
 */

const base = createDefaultProfile(RECORD_NOW);
const OFFSET: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function schedule(weeklyFrequency: number, availableDays: Weekday[], since?: string): UserProfile {
  return {
    ...base,
    schedule: { ...base.schedule, weeklyFrequency, availableDays, ...(since ? { since } : {}) },
  };
}

/** A workout at local noon on `day` of the week starting on the Monday `monday` (YYYY-MM-DD). */
function trained(monday: string, day: Weekday, sets = 3): WorkoutRecord {
  const [year, month, date] = monday.split('-').map(Number) as [number, number, number];
  const when = new Date(year, month - 1, date + OFFSET[day], 12).toISOString();
  return {
    id: `w-${monday}-${day}-${sets}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'full-body',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: 'back-squat',
        sets: Array.from({ length: sets }, () => ({
          kind: 'working' as const,
          reps: 5,
          weight: 100,
          rir: 2,
          completed: true,
        })),
      },
    ],
  };
}

const MONDAYS = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'];
const weeks = (days: Weekday[], mondays = MONDAYS) =>
  mondays.flatMap((monday) => days.map((day) => trained(monday, day)));

describe('the real week against the schedule', () => {
  it('moves four days to the two trained, every week for four weeks', () => {
    const fit = scheduleFit(
      weeks(['mon', 'thu']),
      schedule(4, ['mon', 'tue', 'thu', 'fri']),
      RECORD_NOW,
    );
    expect(fit?.real).toBe(2);
    expect(fit?.regular).toEqual(['mon', 'thu']);
    expect(fit?.proposal).toEqual({ weeklyFrequency: 2, availableDays: ['mon', 'thu'] });
    expect(fit?.weeks.map((week) => week.monday)).toEqual(MONDAYS);
  });

  it('moves up when every week has more, and to the days trained', () => {
    const fit = scheduleFit(
      weeks(['mon', 'tue', 'wed', 'fri', 'sat']),
      schedule(3, ['mon', 'wed', 'fri']),
      RECORD_NOW,
    );
    expect(fit?.real).toBe(5);
    expect(fit?.proposal).toEqual({
      weeklyFrequency: 5,
      availableDays: ['mon', 'tue', 'wed', 'fri', 'sat'],
    });
  });

  it('moves the days when the count fits and the days do not', () => {
    const fit = scheduleFit(
      weeks(['tue', 'thu', 'sat']),
      schedule(3, ['mon', 'wed', 'fri']),
      RECORD_NOW,
    );
    expect(fit?.real).toBeNull();
    expect(fit?.proposal).toEqual({ weeklyFrequency: 3, availableDays: ['tue', 'thu', 'sat'] });
  });

  it('leaves a schedule with more days open than sessions alone while training keeps to them', () => {
    const open = schedule(3, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(scheduleFit(weeks(['mon', 'wed', 'fri']), open, RECORD_NOW)).toBeNull();
  });

  it('needs every one of the four weeks on the same side', () => {
    const mixed = [
      ...weeks(['mon', 'thu'], MONDAYS.slice(0, 3)),
      ...weeks(['mon', 'tue', 'thu', 'fri'], MONDAYS.slice(3)),
    ];
    expect(scheduleFit(mixed, schedule(4, ['mon', 'tue', 'thu', 'fri']), RECORD_NOW)).toBeNull();
  });

  it('rounds a half toward the schedule', () => {
    const history = [
      ...weeks(['mon', 'thu'], MONDAYS.slice(0, 2)),
      ...weeks(['mon', 'tue', 'thu'], MONDAYS.slice(2)),
    ];
    const fit = scheduleFit(history, schedule(4, ['mon', 'tue', 'thu', 'fri']), RECORD_NOW);
    expect(fit?.real).toBe(3);
    expect(fit?.proposal.availableDays).toEqual(['mon', 'tue', 'thu']);
    // From above too: four, four, five and five days a week against three is four.
    const above = [
      ...weeks(['mon', 'tue', 'thu', 'fri'], MONDAYS.slice(0, 2)),
      ...weeks(['mon', 'tue', 'wed', 'thu', 'fri'], MONDAYS.slice(2)),
    ];
    expect(scheduleFit(above, schedule(3, ['mon', 'wed', 'fri']), RECORD_NOW)?.real).toBe(4);
  });

  it('reads the day a workout began, not the day it ended', () => {
    // Sundays at 23:30, finished at 00:20 Monday: Sunday's, as are Mon and Wed.
    const late = (monday: string): WorkoutRecord => {
      const [year, month, date] = monday.split('-').map(Number) as [number, number, number];
      const start = new Date(year, month - 1, date + 6, 23, 30).toISOString();
      const end = new Date(year, month - 1, date + 7, 0, 20).toISOString();
      return {
        ...trained(monday, 'sun'),
        id: `w-late-${monday}`,
        startedAt: start,
        completedAt: end,
      };
    };
    const history = [...weeks(['mon', 'wed']), ...MONDAYS.map(late)];
    expect(scheduleFit(history, schedule(3, ['mon', 'wed', 'sun']), RECORD_NOW)).toBeNull();
  });

  it('says the real count, and moves only where the range reaches', () => {
    // Saturdays only, on a schedule of two: one a week, below the fewest the plan sets.
    const fit = scheduleFit(weeks(['sat']), schedule(2, ['mon', 'thu']), RECORD_NOW);
    expect(fit?.measured).toBe(1);
    expect(fit?.real).toBeNull();
    expect(fit?.proposal.weeklyFrequency).toBe(2);
    expect(fit?.proposal.availableDays).toContain('sat');
    // Three sessions on Saturday alone: two days cannot be named, so no card.
    expect(scheduleFit(weeks(['sat']), schedule(3, ['sat']), RECORD_NOW)).toBeNull();
  });

  it('brings no card where the days vary from week to week', () => {
    const varied = [
      ...weeks(['mon', 'wed', 'sat'], MONDAYS.slice(0, 1)),
      ...weeks(['tue', 'wed', 'sun'], MONDAYS.slice(1, 2)),
      ...weeks(['mon', 'thu', 'sat'], MONDAYS.slice(2, 3)),
      ...weeks(['tue', 'thu', 'sun'], MONDAYS.slice(3)),
    ];
    expect(scheduleFit(varied, schedule(3, ['mon', 'wed', 'fri']), RECORD_NOW)).toBeNull();
  });

  it('keeps to the schedule range of two to six sessions', () => {
    const fit = scheduleFit(weeks(['wed']), schedule(3, ['mon', 'wed', 'fri']), RECORD_NOW);
    expect(fit?.real).toBe(2);
    expect(fit?.proposal.availableDays).toHaveLength(2);
    expect(fit?.proposal.availableDays).toContain('wed');
  });

  it('counts two workouts on one day once, and skips weeks without training', () => {
    const doubled = [
      ...weeks(['mon', 'thu']),
      ...MONDAYS.map((monday) => trained(monday, 'mon', 2)),
    ];
    expect(scheduleFit(doubled, schedule(4, ['mon', 'tue', 'thu', 'fri']), RECORD_NOW)?.real).toBe(
      2,
    );
    // A week off in the middle is a break, not a pattern: an earlier week stands in.
    const withBreak = weeks(
      ['mon', 'thu'],
      ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-31'],
    );
    expect(
      scheduleFit(withBreak, schedule(4, ['mon', 'tue', 'thu', 'fri']), RECORD_NOW)?.weeks.map(
        (week) => week.monday,
      ),
    ).toEqual(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-31']);
  });

  it('needs four weeks, and reads only weeks after the schedule was set', () => {
    expect(
      scheduleFit(
        weeks(['mon', 'thu'], MONDAYS.slice(1)),
        schedule(4, ['mon', 'tue', 'thu', 'fri']),
        RECORD_NOW,
      ),
    ).toBeNull();
    const set = new Date(2026, 7, 19, 12).toISOString();
    expect(
      scheduleFit(
        weeks(['mon', 'thu']),
        schedule(4, ['mon', 'tue', 'thu', 'fri'], set),
        RECORD_NOW,
      ),
    ).toBeNull();
  });
});

describe('the days named', () => {
  it('read as a list', () => {
    expect(dayList(['mon'])).toBe('Mon');
    expect(dayList(['mon', 'wed'])).toBe('Mon and Wed');
    expect(dayList(['mon', 'wed', 'sat'])).toBe('Mon, Wed and Sat');
  });
});
