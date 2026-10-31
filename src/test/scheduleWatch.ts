import type { Weekday } from '../core/validation/profile';
import { SCHEDULE_MOVE_ID, type ScheduleMove } from '../core/validation/scheduleMove';
import type { WorkoutRecord } from '../core/validation/workoutRecord';

/**
 * Weeks for the schedule watch's tests (Maintenance 36): three days a week in the four weeks before
 * a change on Monday 7 September 2026, five days a week in the five weeks after it, each session's
 * lifts as given. Every time is a clock time on this device. Synthetic data only.
 */

export const SQUAT = 'back-squat';
export const BENCH = 'barbell-bench-press';
export const ROW = 'barbell-row';

/**
 * A lift's three working sets: reps, weight, reserve, and the weight asked where one was, and the
 * reserve asked (2 where none is given).
 */
export type Lift = [
  reps: number,
  weight: number,
  rir: number,
  targetWeight?: number,
  targetRir?: number,
];
export type Lifts = Record<string, Lift>;

/** A local time in 2026: `month` 1-12. */
export const at = (month: number, day: number, hour = 18) =>
  new Date(2026, month - 1, day, hour, 0).toISOString();

/** One session at `when`: each lift's three working sets, all asked 4-6 reps, at 2 in reserve. */
export function session(
  when: string,
  lifts: Lifts,
  extra: Partial<WorkoutRecord> = {},
): WorkoutRecord {
  return {
    id: `w-${when}`,
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
    entries: Object.entries(lifts).map(
      ([exerciseId, [reps, weight, rir, targetWeight, targetRir]]) => ({
        exerciseId,
        plannedSets: 3,
        sets: [0, 1, 2].map((setIndex) => ({
          kind: 'working' as const,
          reps,
          weight,
          rir,
          completed: true,
          setIndex,
          targetReps: [4, 6] as [number, number],
          targetRir: targetRir ?? 2,
          ...(targetWeight === undefined ? {} : { targetWeight }),
        })),
      }),
    ),
    ...extra,
  };
}

export const MWF: Weekday[] = ['mon', 'wed', 'fri'];
export const MON_TO_FRI: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

/** The change: Monday 7 September, 08:00, from three days a week to five. */
export const MOVE: ScheduleMove = {
  id: SCHEDULE_MOVE_ID,
  at: at(9, 7, 8),
  from: { weeklyFrequency: 3, availableDays: MWF },
  to: { weeklyFrequency: 5, availableDays: MON_TO_FRI },
  since: null,
  watched: true,
};
export const MOVED = { weeklyFrequency: 5, availableDays: MON_TO_FRI };

/**
 * The Tuesday after the four weeks after the change: the Monday's sets, after a weekend without
 * hard sets, are the first after those four weeks.
 */
export const WATCH_NOW = at(10, 6, 12);

/** The four weeks before: Monday, Wednesday and Friday from 10 August, each lift as given. */
export function weeksBefore(lifts: Lifts): WorkoutRecord[] {
  const days = [10, 12, 14, 17, 19, 21, 24, 26, 28, 31].map((day) => at(8, day));
  return [...days, at(9, 2), at(9, 4)].map((when) => session(when, lifts));
}

/**
 * The five weeks after: Monday to Friday from 7 September. `monday` is each lift on the Mondays,
 * after a weekend without hard sets; `weekday` on the other days; `fifth` the fifth week's, after
 * the four weeks the watch measures.
 */
export function weeksAfter(
  monday: Lifts,
  weekday: Lifts = monday,
  fifth: Lifts = monday,
): WorkoutRecord[] {
  const records: WorkoutRecord[] = [];
  for (const start of [7, 14, 21, 28, 35]) {
    for (let offset = 0; offset < 5; offset += 1) {
      const when = new Date(2026, 8, start + offset, 18, 0).toISOString();
      records.push(session(when, start === 35 ? fifth : offset === 0 ? monday : weekday));
    }
  }
  return records;
}

/** The lifts as usual before the change. */
export const USUAL: Lifts = { [SQUAT]: [5, 225, 2], [BENCH]: [5, 185, 2] };
/** About 7% under the usual, both lifts. */
export const DOWN: Lifts = { [SQUAT]: [5, 210, 2], [BENCH]: [5, 172.5, 2] };
