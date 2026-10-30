import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../../engine/recalibration/types';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { RECORD_NOW, record } from '../../test/records';
import { shape } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11, and the day's extra (Maintenance 27, item 44; the first
 * review of round N): the lift to push and its extra keep the push's straight sets, and a swapped
 * extra keeps them through a refit: it leads and is never the main lift. RECORD_NOW is a Thursday.
 * Synthetic data only.
 */

const HOUR = 3_600_000;
const BENCH = 'barbell-bench-press';
const DB_BENCH = 'dumbbell-bench-press';
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const base = createDefaultProfile(RECORD_NOW);
const days: Weekday[] = ['mon', 'thu', 'sat'];
const profile: UserProfile = {
  ...base,
  bodyweight: 185,
  programStyle: 'hybrid',
  schedule: {
    ...base.schedule,
    weeklyFrequency: 3,
    availableDays: days,
    typicalDurationMinutes: 150,
  },
  pushLift: { exerciseId: BENCH, target: 225, units: 'lb', since: '2026-08-01T12:00:00.000Z' },
};
const at = (hoursAgo: number) => new Date(Date.parse(RECORD_NOW) - hoursAgo * HOUR).toISOString();
const session = (id: string, hoursAgo: number, exerciseId: string, weight: number) => ({
  ...record(
    0,
    exerciseId,
    [
      [5, weight, 2],
      [5, weight, 2],
      [5, weight, 2],
    ],
    [4, 6],
    2,
  ),
  id,
  startedAt: at(hoursAgo),
  completedAt: at(hoursAgo),
});
/** Monday's push day, and two clean sessions each of the dumbbell bench press and the squat. */
const history: WorkoutRecord[] = [
  session('w-bench', 72, BENCH, 185),
  session('w-db-1', 200, DB_BENCH, 70),
  session('w-db-2', 300, DB_BENCH, 70),
  session('w-squat-1', 150, 'back-squat', 225),
  session('w-squat-2', 250, 'back-squat', 225),
];

function run(
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  options: Partial<RecalibrationRequest> = {},
): RecalibrationSuccess {
  const result = recalibrate({
    trigger,
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: 'default',
    profile,
    location: gym!,
    loading: { missingPlates: [] },
    history,
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: RECORD_NOW,
    ...options,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("the day's extra, swapped, the first review of round N", () => {
  it('keeps straight sets through a refit, as the extra does', () => {
    const workout = generateWorkout({
      profile,
      location: gym!,
      history,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    const extra = allEntries(workout.blocks)[0]!;
    expect(extra.push).toBe('extra');
    expect(shape(extra).every((set) => set[2] === 'straight')).toBe(true);
    const swapped = run({ type: 'replace', entryId: extra.id, exerciseId: DB_BENCH }, workout, {
      currentEntryId: extra.id,
    });
    const standIn = allEntries(swapped.workout.blocks)[0]!;
    expect([standIn.exerciseId, standIn.push]).toEqual([DB_BENCH, 'extra']);
    expect(shape(standIn).every((set) => set[2] === 'straight')).toBe(true);

    // A 35 lb plate missing today.
    const refit = run({ type: 'loading' }, swapped.workout, {
      constraints: swapped.constraints,
      loading: { missingPlates: [35] },
    });
    const after = allEntries(refit.workout.blocks)[0]!;
    expect([after.exerciseId, after.push]).toEqual([DB_BENCH, 'extra']);
    expect(shape(after).every((set) => set[2] === 'straight')).toBe(true);
    expect(after.backOffDrop).toBeUndefined();
  });
});
