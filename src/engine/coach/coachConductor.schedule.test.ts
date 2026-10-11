import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { generateWorkout } from '../workoutGenerator/generate';
import { SCHEDULE_SOURCE, gatherSignals, type CoachInput } from './coachConductor';

/**
 * Maintenance 27, the owner's item 46: the one card to move the schedule to the week the lifter
 * trains, its weeks, its schedule before and after, and its one tap.
 */

const base = createDefaultProfile(RECORD_NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const OFFSET: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function trained(monday: string, day: Weekday): WorkoutRecord {
  const [year, month, date] = monday.split('-').map(Number) as [number, number, number];
  const when = new Date(year, month - 1, date + OFFSET[day], 12).toISOString();
  return {
    id: `w-${monday}-${day}`,
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
        sets: [{ kind: 'working' as const, reps: 5, weight: 100, rir: 2, completed: true }],
      },
    ],
  };
}

const history = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'].flatMap((monday) => [
  trained(monday, 'mon'),
  trained(monday, 'thu'),
]);

function input(profile: UserProfile, extra: Partial<CoachInput> = {}): CoachInput {
  return {
    workout: generateWorkout({
      profile,
      location: gym,
      history,
      now: RECORD_NOW,
      duration: 'default',
    }),
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history,
    now: RECORD_NOW,
    fatigue: interpretFatigue(history, RECORD_NOW, null),
    strategy: [],
    lastExportAt: RECORD_NOW,
    workoutCount: history.length,
    location: gym,
    stalls: [],
    ...extra,
  };
}

const card = (coachInput: CoachInput) =>
  gatherSignals(coachInput).find((signal) => signal.source === SCHEDULE_SOURCE);

describe('the card to move the schedule', () => {
  it('shows the weeks, the schedule and the move, with one tap', () => {
    // The default schedule: 4 days, Mon, Tue, Thu and Fri; trained Mon and Thu for 4 weeks.
    const signal = card(input(base));
    expect(signal?.headline).toBe('You train 2 days a week, not 4');
    expect(signal?.why).toEqual([
      'Your last 4 weeks of training: Mon and Thu; Mon and Thu; Mon and Thu; Mon and Thu.',
      'Your schedule: 4 days a week, on Mon, Tue, Thu and Fri. Moved: 2 days, on Mon and Thu, and the split follows; Settings, Schedule, changes it any time.',
    ]);
    expect(signal?.action).toEqual({
      kind: 'schedule',
      weeklyFrequency: 2,
      availableDays: ['mon', 'thu'],
      label: 'Move the schedule',
    });
  });

  it('stays in a deload week, which it pushes nothing for', () => {
    const deload = { startsAt: RECORD_NOW, endsAt: '2026-09-17T12:00:00.000Z' };
    const coachInput = input(base, { constraints: { ...emptyConstraints(), deload } });
    expect(card(coachInput)).toBeDefined();
  });

  it('says the split follows only where the move changes it', () => {
    // Three days to two: full body, upper and lower rotate at both.
    const three = {
      ...base,
      schedule: {
        ...base.schedule,
        weeklyFrequency: 3,
        availableDays: ['mon', 'wed', 'fri'] as Weekday[],
      },
    };
    expect(card(input(three))?.why[1]).toBe(
      'Your schedule: 3 days a week, on Mon, Wed and Fri. Moved: 2 days, on Mon and Thu; Settings, Schedule, changes it any time.',
    );
  });

  it('says when the move stops at the fewest or the most the plan sets', () => {
    const every = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'].flatMap((monday) =>
      (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) =>
        trained(monday, day),
      ),
    );
    const signal = card({ ...input(base), history: every });
    expect(signal?.headline).toBe('You train 7 days a week, not 4');
    expect(signal?.why[1]).toContain('Moved: 6 days (the most the plan sets), on');
  });

  it('is not there when the week fits the schedule', () => {
    const fits = {
      ...base,
      schedule: {
        ...base.schedule,
        weeklyFrequency: 2,
        availableDays: ['mon', 'thu'] as Weekday[],
      },
    };
    expect(card(input(fits))).toBeUndefined();
  });
});
