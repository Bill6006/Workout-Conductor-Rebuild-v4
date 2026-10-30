import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { CatchUpSpec } from '../planning/catchUp';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from './generate';
import { RECORD_NOW } from '../../test/records';
import { at, gym, profileOf, session } from '../../test/clockDays';

/**
 * The eighteenth review of round M: a lift the lifter swapped away today is picked by no slot by
 * itself (`awayIds`), neither as the slot's own pick, nor as a lasting swap's swap-in, nor as the
 * lift to push in its place or as the day's extra. A catch-up whose only lifts were swapped away is
 * emptied by the lifter, as one whose lifts were set aside is: it stays the catch-up, with nothing
 * more for today. Synthetic data only.
 */

const BENCH = 'barbell-bench-press';
const records = [session(at(3, 18), [['barbell-row', 3]])];
const ids = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).map((entry) => entry.exerciseId);

describe('a lift swapped away today', () => {
  it('is no slot’s own pick', () => {
    const plan = (awayIds: string[]) =>
      generateWorkout({
        profile: profileOf(),
        location: gym,
        history: records,
        now: at(8, 18),
        duration: 'default',
        constraints: { templateId: 'push-arms', awayIds },
      });
    expect(ids(plan([]))).toContain(BENCH);
    const away = ids(plan([BENCH]));
    expect(away).not.toContain(BENCH);
    expect(away[0]).toBe('close-grip-bench-press');
  });

  it('nor comes in as a lasting swap’s swap-in', () => {
    const swaps = [{ from: BENCH, to: 'dumbbell-bench-press', setAt: at(1), until: at(30) }];
    const plan = (awayIds: string[]) =>
      generateWorkout({
        profile: profileOf(),
        location: gym,
        history: records,
        now: at(8, 18),
        duration: 'default',
        constraints: { templateId: 'push-arms', swaps, awayIds },
      });
    expect(ids(plan([]))[0]).toBe('dumbbell-bench-press');
    const away = ids(plan(['dumbbell-bench-press']));
    expect(away).not.toContain('dumbbell-bench-press');
    expect(away).not.toContain(BENCH);
    expect(away[0]).toBe('close-grip-bench-press');
    // Nor the next best in its place.
    const both = ids(plan(['dumbbell-bench-press', 'close-grip-bench-press']));
    expect(both).not.toContain('close-grip-bench-press');
    expect(both).not.toContain('dumbbell-bench-press');
    expect(both).not.toContain(BENCH);
  });

  describe('the lift to push', () => {
    const HOUR = 3_600_000;
    const [, gymThen] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
    const base = createDefaultProfile(RECORD_NOW);
    /** RECORD_NOW is a Thursday; the bench press to push, a long default session. */
    const profile: UserProfile = {
      ...base,
      schedule: {
        ...base.schedule,
        weeklyFrequency: 3,
        availableDays: ['mon', 'thu', 'sat'] as Weekday[],
        typicalDurationMinutes: 150,
      },
      pushLift: { exerciseId: BENCH, target: 225, units: 'lb', since: '2026-08-01T12:00:00.000Z' },
    };
    /** Monday's push day, four sets of the bench press: the extra is due on Thursday's lower day. */
    const monday = new Date(Date.parse(RECORD_NOW) - 72 * HOUR).toISOString();
    const lastMonday: WorkoutRecord[] = [
      {
        id: 'w-monday',
        startedAt: monday,
        completedAt: monday,
        locationId: 'gym',
        templateId: 'push-arms',
        endedEarly: false,
        rating: null,
        skippedExerciseIds: [],
        painJoints: [],
        readiness: null,
        prs: [],
        entries: [
          {
            exerciseId: BENCH,
            sets: Array.from({ length: 4 }, (_, index) => ({
              kind: 'working' as const,
              reps: 6,
              weight: 100,
              rir: 2,
              completed: true,
              setIndex: index,
              targetReps: [4, 6] as [number, number],
              targetRir: 2,
            })),
          },
        ],
      },
    ];
    const plan = (templateId: string, awayIds: string[]) =>
      generateWorkout({
        profile,
        location: gymThen,
        history: lastMonday,
        now: RECORD_NOW,
        duration: 'default',
        constraints: { templateId, awayIds },
      });

    it('takes no place of its own', () => {
      const own = allEntries(plan('push-arms', []).blocks)[0];
      expect([own?.exerciseId, own?.push]).toEqual([BENCH, 'natural']);
      expect(ids(plan('push-arms', [BENCH]))).not.toContain(BENCH);
    });

    it('nor comes as the day’s extra', () => {
      const extra = allEntries(plan('lower', []).blocks)[0];
      expect([extra?.exerciseId, extra?.push]).toEqual([BENCH, 'extra']);
      expect(ids(plan('lower', [BENCH]))).not.toContain(BENCH);
    });
  });

  it('empties a catch-up whose only lifts it was: the catch-up stays, with nothing more for today', () => {
    const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
      LocationProfile,
    ];
    const spec: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [{ muscle: 'chest', sets: 3, minRir: 1, why: 'behind' }],
      sitOut: [],
    };
    const plan = (awayIds: string[]) =>
      generateWorkout({
        profile: profileOf(),
        location: bare,
        history: records,
        now: at(9, 18),
        duration: 'default',
        constraints: { catchUp: spec, awayIds },
      });
    expect(ids(plan(['push-up']))).toEqual(['diamond-push-up']);
    const emptied = plan(['push-up', 'diamond-push-up']);
    // Not the split's own session: the lifter's choices emptied the catch-up.
    expect(emptied.templateId).toBe('catch-up');
    expect(ids(emptied)).toEqual([]);
    expect(emptied.explanation.summary).toBe('Nothing more for today.');
  });
});
