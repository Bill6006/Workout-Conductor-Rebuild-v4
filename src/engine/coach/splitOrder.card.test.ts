import { describe, expect, it, vi } from 'vitest';
import { localDayKey } from '../../core/time/localDate';
import { createDefaultLocations } from '../../core/validation/location';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import type { SplitOrderInput } from '../planning/splitOrder';
import { plannedWorkouts, tooSoonAhead } from '../planning/weeklyPlan';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import type { SplitOrder } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { SCHEDULE_SOURCE, gatherSignals, type CoachInput } from './coachConductor';

/**
 * Maintenance 38: the schedule card reads its moved week in the split's order the store would read
 * for those days, with the coach focus and the lasting swaps every plan of the store reads (the
 * review: read without the focus, it named the hamstrings and glutes on a Wednesday the week the
 * store would build worked only the triceps too soon). The order itself is the decision's
 * (splitOrder.test.ts); here it is given, so the card's reading of it is what is tested. Synthetic data.
 */

const given = vi.hoisted(() => ({
  order: null as SplitOrder | null,
  inputs: [] as SplitOrderInput[],
}));
vi.mock('../planning/splitOrder', async (original) => {
  const actual = await original<typeof import('../planning/splitOrder')>();
  return {
    ...actual,
    splitOrder: (input: SplitOrderInput) => {
      given.inputs.push(input);
      return given.order;
    },
  };
});

const base = createDefaultProfile(RECORD_NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const OFFSET: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
const DAYS: Weekday[] = ['mon', 'tue', 'wed'];

/** As coachConductor.schedule.test.ts logs a day: one set of back squats. */
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

/** Four weeks trained on Monday, Tuesday and Wednesday, a new list each time (the card keeps one). */
const weeks = () =>
  ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'].flatMap((monday) =>
    DAYS.map((day) => trained(monday, day)),
  );

function input(history: WorkoutRecord[], extra: Partial<CoachInput> = {}): CoachInput {
  return {
    workout: generateWorkout({
      profile: base,
      location: gym,
      history,
      now: RECORD_NOW,
      duration: 'default',
    }),
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile: base,
    history,
    now: RECORD_NOW,
    fatigue: interpretFatigue(history, RECORD_NOW),
    strategy: [],
    lastExportAt: RECORD_NOW,
    workoutCount: history.length,
    location: gym,
    stalls: [],
    ...extra,
  };
}

const footnote = (coachInput: CoachInput) =>
  gatherSignals(coachInput).find((signal) => signal.source === SCHEDULE_SOURCE)?.footnote;

const moved: UserProfile = {
  ...base,
  schedule: { ...base.schedule, weeklyFrequency: DAYS.length, availableDays: [...DAYS] },
};

/** The moved week (upper, lower, upper) with its last two days' sessions swapped: upper, upper, lower. */
function turned(history: WorkoutRecord[]): SplitOrder {
  const week = plannedWorkouts(moved, gym, history, RECORD_NOW);
  const [first, second, third] = week.map((day) => day.workout.templateId);
  const templates = [first, third, second];
  return {
    days: week.map((day, at) => ({
      day: localDayKey(day.date),
      templateId: templates[at] as string,
      was: day.workout.templateId,
    })),
    spared: [],
    fewer: [],
  };
}

describe('the schedule card reads its moved week in the split’s order (Maintenance 38)', () => {
  it('names the days the week built in that order works hard again too soon', () => {
    given.order = null;
    const plain = footnote(input(weeks()));
    expect(plain).toContain('On Wed');
    const order = turned(weeks());
    given.order = order;
    const history = weeks();
    const said = footnote(input(history));
    expect(said).not.toBe(plain);
    expect(said).toContain('On Tue');
    // The days it names are those of the week built in the order.
    const built = tooSoonAhead(
      plannedWorkouts(moved, gym, history, RECORD_NOW, null, 'default', { order }),
      history,
    );
    for (const day of built) {
      expect(said).toContain(`On ${day.weekday[0]!.toUpperCase()}${day.weekday.slice(1)}`);
    }
  });

  it('asks for the order with the coach focus and the lasting swaps', () => {
    given.order = null;
    given.inputs = [];
    const swap = {
      from: 'barbell-bench-press',
      to: 'dumbbell-bench-press',
      setAt: RECORD_NOW,
      until: '2026-10-08T12:00:00.000Z',
    };
    footnote(input(weeks(), { focus: 'quads', swaps: [swap] }));
    const asked = given.inputs.at(-1);
    expect(asked?.profile.schedule.availableDays).toEqual(DAYS);
    expect(asked?.focus?.muscle).toBe('quads');
    expect(asked?.swaps).toEqual([swap]);
  });

  it('reads it again for another coach focus', () => {
    given.order = null;
    given.inputs = [];
    const history = weeks();
    footnote(input(history, { focus: 'quads' }));
    footnote(input(history, { focus: 'chest' }));
    expect(given.inputs.map((asked) => asked.focus?.muscle)).toEqual(['quads', 'chest']);
  });
});
