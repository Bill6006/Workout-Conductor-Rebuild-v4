import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import { projectedSets, shortfallOf, weekModel } from './weekModel';

/**
 * Maintenance 31: the week model reads the device's Monday-to-Sunday week. Every time here is a
 * clock time on the device, so the file runs as written in any zone (scripts/test-zones.mjs runs it
 * in New York and fourteen hours east of UTC too).
 */

/** A clock time on this device, as an instant. September 2026: the 7th is a Monday. */
const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).toISOString();
const [, gym] = createDefaultLocations({ gymAccess: true }, at(1));
const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...createDefaultProfile(at(1), 'gym'),
  bodyweight: 185,
  ...overrides,
});
/** One exercise done on a day of the month, its working sets all completed. */
const done = (day: number, exerciseId: string, sets: number, hour = 12): WorkoutRecord => {
  const when = at(day, hour);
  return record(
    0,
    exerciseId,
    Array.from({ length: sets }, () => [10, 100, 2] as [number, number, number]),
    [8, 12],
    2,
    { id: `w-${exerciseId}-${day}-${hour}`, startedAt: when, completedAt: when },
  );
};
const model = (history: WorkoutRecord[], now: string, overrides: Partial<UserProfile> = {}) =>
  weekModel({ profile: profile(overrides), location: gym!, history, now });

describe('the week model', () => {
  it('counts this week’s sets on the device, a primary muscle in full and a secondary at half', () => {
    // Wednesday the 9th: the bench press on Monday counts, last Sunday's late session does not.
    const week = model(
      [done(6, 'barbell-bench-press', 4, 23), done(7, 'barbell-bench-press', 3)],
      at(9),
      { schedule: { ...profile().schedule, availableDays: ['sat'], weeklyFrequency: 1 } },
    );
    expect(week.week).toBe('2026-09-07');
    expect(week.muscles.chest.done).toBe(3);
    // The bench press: chest and triceps its primary muscles, the front delts its secondary.
    expect(week.muscles.triceps.done).toBe(3);
    expect(week.muscles['front-delts'].done).toBe(1.5);
    expect(week.muscles.chest.today).toBe(0);
  });

  it('counts no warm-up and no set left undone', () => {
    const monday = done(7, 'barbell-bench-press', 3);
    const entry = monday.entries[0]!;
    const workout: WorkoutRecord = {
      ...monday,
      entries: [
        {
          ...entry,
          sets: [
            { ...entry.sets[0]!, kind: 'warmup' as const },
            { ...entry.sets[0]!, kind: 'warmup' as const },
            ...entry.sets,
            { ...entry.sets[0]!, completed: false },
          ],
        },
      ],
    };
    const week = model([workout], at(9), {
      schedule: { ...profile().schedule, availableDays: ['sat'], weeklyFrequency: 1 },
    });
    expect(week.muscles.chest.done).toBe(3);
  });

  it('keeps today’s sets apart, and says a workout was begun today', () => {
    const week = model(
      [done(7, 'barbell-bench-press', 3), done(9, 'barbell-bench-press', 2, 8)],
      at(9, 18),
    );
    expect(week.muscles.chest.done).toBe(5);
    expect(week.muscles.chest.today).toBe(2);
    expect(week.trainedToday).toBe(true);
  });

  it('adds the sets the week’s ticked days to come will plan, at Default length', () => {
    // Monday, Tuesday, Thursday and Friday ticked: on Wednesday the 9th, Thursday and Friday remain.
    const week = model([done(7, 'barbell-bench-press', 3), done(8, 'back-squat', 3)], at(9));
    expect(week.sessionsAhead).toBe(2);
    const planned = Object.values(week.muscles).reduce((sum, muscle) => sum + muscle.planned, 0);
    expect(planned).toBeGreaterThan(20);
    expect(projectedSets(week.muscles.chest)).toBe(
      week.muscles.chest.done + week.muscles.chest.planned,
    );
  });

  it('plans nothing past Sunday', () => {
    const week = model([done(7, 'barbell-bench-press', 3)], at(13));
    expect(week.sessionsAhead).toBe(0);
    expect(Object.values(week.muscles).every((muscle) => muscle.planned === 0)).toBe(true);
    // Short of its target by the sets not done.
    expect(shortfallOf(week.muscles.chest)).toBe(week.muscles.chest.target - 3);
  });

  it('counts today when it is ticked and nothing was begun, and not once it was', () => {
    expect(model([], at(10)).sessionsAhead).toBe(2);
    expect(model([done(10, 'barbell-bench-press', 3, 8)], at(10, 18)).sessionsAhead).toBe(1);
  });

  it('with more days ticked than sessions a week, plans only the sessions the week has left', () => {
    const schedule = {
      ...profile().schedule,
      weeklyFrequency: 3,
      availableDays: [
        'mon',
        'tue',
        'wed',
        'thu',
        'fri',
      ] as UserProfile['schedule']['availableDays'],
    };
    // Trained Monday and Tuesday: one session left of three, though three ticked days remain.
    const week = model([done(7, 'barbell-bench-press', 3), done(8, 'back-squat', 3)], at(9, 6), {
      schedule,
    });
    expect(week.sessionsAhead).toBe(1);
  });

  it('reads how long ago each muscle was trained', () => {
    const week = model([done(8, 'back-squat', 3)], at(9));
    expect(week.muscles.quads.daysSince).toBe(1);
    expect(week.muscles.chest.daysSince).toBeNull();
  });
});
