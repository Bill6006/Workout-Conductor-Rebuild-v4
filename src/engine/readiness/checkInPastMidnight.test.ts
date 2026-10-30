import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { readCheckIn } from './checkIn';
import type { Readiness } from '../recalibration/types';
import { at } from '../../test/clockDays';

/**
 * Maintenance 33, the fresh review before shipping, the check-in near midnight (docs/reports/maintenance-33.md,
 * "Readiness": "two items clearly worse, or two short nights running"; the fifth review: "the
 * readers of check-ins as told count one check-in once"). A workout begun at 23:30 and checked in
 * at 00:05 is saved with `checkInAt` on the new day; that check-in is the new day's, and the store
 * carries it onto every later plan of that day (`withDayCheckIn`). The baseline and "the night
 * before" read saved check-ins by the day their workout began, so the one check-in is both today's
 * and yesterday's: a single "Poor" night reads as two short nights running. Local clock times
 * (`at`). Synthetic data only.
 */

const poorNight: Readiness = {
  energy: 3,
  soreness: 2,
  sleep: 1,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

/** A workout begun at 23:30 on the 14th, checked in at 00:05 on the 15th, done at 00:40. */
const lateWorkout: WorkoutRecord = {
  id: 'w-late',
  startedAt: at(14, 23, 30),
  completedAt: at(15, 0, 40),
  locationId: 'gym',
  templateId: null,
  endedEarly: false,
  rating: null,
  skippedExerciseIds: [],
  painJoints: [],
  readiness: { ...poorNight },
  checkInAt: at(15, 0, 5),
  prs: [],
  entries: [],
};

describe('a check-in told past midnight on a workout begun before it', () => {
  it('baseline: told on its own, one poor night is no extreme', () => {
    expect(readCheckIn(poorNight, [], at(15, 8)).extreme).toBeNull();
  });

  it('carried onto the same day\'s next plan, it is not also "the night before"', () => {
    // 08:00 on the 15th: the plan made after the late workout carries the 00:05 check-in, the
    // same answers told once.
    const read = readCheckIn(poorNight, [lateWorkout], at(15, 8));
    expect(
      read.extreme,
      'the one check-in told at 00:05 on the 15th is read as the night before too',
    ).toBeNull();
    expect(read.lowered).toBe(false);
  });
});
