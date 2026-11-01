import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import { addLocalDays, localDayKey, localWeekday } from '../../core/time/localDate';
import { createDefaultLocations } from '../../core/validation/location';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { recoveryWindows, tooSoonToday } from '../recovery/recovery';
import { generateWorkout } from '../workoutGenerator/generate';
import { splitOrder } from './splitOrder';
import { liftedAsPlanned } from './weeklyPlan';

/**
 * Maintenance 38, the review: the weeks trained in the split's order, each day planned and done as
 * planned, against the same weeks in the rotation's. Read afresh each day, an order pushed the same
 * session on week after week (a strength lifter on two days trained no lower day in six weeks); read
 * as trained, an order changed which sessions the weeks after held. Held for its week, and the
 * rotation in its own days, the order keeps each muscle's sessions to within one over eight weeks
 * (a session falling past the last day), with fewer days a muscle is worked hard too soon.
 * Synthetic data only.
 */

const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const MONDAY = addLocalDays(RECORD_NOW, -3);
const WEEKS = 8;
const base = createDefaultProfile(RECORD_NOW);

interface Weeks {
  sessions: Map<MuscleId, number>;
  tooSoon: number;
  templates: string[];
}

function train(profile: UserProfile, ordered: boolean): Weeks {
  let history: WorkoutRecord[] = [];
  const sessions = new Map<MuscleId, number>();
  let tooSoon = 0;
  const templates: string[] = [];
  for (let offset = 0; offset < WEEKS * 7; offset += 1) {
    const now = addLocalDays(MONDAY, offset);
    if (!profile.schedule.availableDays.includes(localWeekday(now))) continue;
    const order = ordered ? splitOrder({ profile, location: gym, history, now }) : null;
    const workout = generateWorkout({
      profile,
      location: gym,
      history,
      now,
      duration: 'default',
      constraints: order ? { splitOrder: order } : {},
    });
    tooSoon += tooSoonToday(workout, recoveryWindows(history, { now }), now).length;
    templates.push(workout.templateId ?? '');
    const direct = new Set(
      workout.blocks
        .flatMap((block) => block.entries)
        .filter((entry) => entry.sets.some((set) => set.kind === 'working'))
        .flatMap((entry) => requireExercise(entry.exerciseId).primaryMuscles),
    );
    for (const muscle of direct) sessions.set(muscle, (sessions.get(muscle) ?? 0) + 1);
    const own = order?.days.find((day) => day.day === localDayKey(now));
    history = [
      ...history,
      {
        ...liftedAsPlanned(now, workout),
        ...(order && own?.templateId === workout.templateId ? { splitOrder: order } : {}),
      },
    ];
  }
  return { sessions, tooSoon, templates };
}

const onDays = (days: Weekday[], profile: UserProfile = base): UserProfile => ({
  ...profile,
  schedule: { ...profile.schedule, availableDays: days, weeklyFrequency: days.length },
});

const strength = {
  ...base,
  goals: { ...base.goals, primary: 'strength' as const, secondary: 'none' as const },
};

describe('eight weeks trained in the split’s order (Maintenance 38)', () => {
  for (const [label, profile] of [
    ['Monday, Tuesday and Thursday', onDays(['mon', 'tue', 'thu'])],
    ['a strength lifter on Monday and Wednesday', onDays(['mon', 'wed'], strength)],
    [
      'a strength lifter on Monday, Tuesday, Thursday and Saturday',
      onDays(['mon', 'tue', 'thu', 'sat'], strength),
    ],
  ] as const) {
    it(`keeps each muscle’s sessions, with fewer days too soon: ${label}`, () => {
      const inOrder = train(profile, true);
      const rotation = train(profile, false);
      expect(inOrder.templates).toHaveLength(rotation.templates.length);
      expect(inOrder.tooSoon).toBeLessThanOrEqual(rotation.tooSoon);
      for (const muscle of MUSCLE_IDS) {
        expect(
          inOrder.sessions.get(muscle) ?? 0,
          `${muscle}: ${inOrder.templates.join(' ')} against ${rotation.templates.join(' ')}`,
        ).toBeGreaterThanOrEqual((rotation.sessions.get(muscle) ?? 0) - 1);
      }
      // Each of the split's sessions trained in the order as often as in the rotation's, give or take one.
      const count = (list: string[], id: string) => list.filter((item) => item === id).length;
      for (const id of new Set(rotation.templates)) {
        expect(
          Math.abs(count(inOrder.templates, id) - count(rotation.templates, id)),
        ).toBeLessThanOrEqual(1);
      }
    }, 120_000);
  }
});
