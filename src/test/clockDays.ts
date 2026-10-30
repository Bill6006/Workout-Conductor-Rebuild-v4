import { requireExercise } from '../catalog/exercises/catalog';
import type { MuscleId } from '../catalog/muscles/muscles';
import { createDefaultLocations } from '../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../core/validation/profile';
import type { WorkoutRecord } from '../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../engine/workout/types';

/**
 * Days on this device's clock, for the tests of a catch-up and a second workout (Maintenance 31):
 * September 2026, the 7th a Monday. The default profile ticks Monday, Tuesday, Thursday and Friday,
 * four sessions a week, an intermediate lifter. Synthetic data only.
 */

/** A clock time on this device, as an instant. */
export const at = (day: number, hour = 12, minute = 0) =>
  new Date(2026, 8, day, hour, minute).toISOString();

export const [, gym] = createDefaultLocations({ gymAccess: true }, at(1));

export const profileOf = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...createDefaultProfile(at(1), 'gym'),
  bodyweight: 185,
  ...overrides,
});

/** A workout at `when`: each exercise with its working sets done, ten reps at 100 and 2 in reserve. */
export function session(
  when: string,
  parts: [exerciseId: string, sets: number][],
  extra: Partial<WorkoutRecord> = {},
): WorkoutRecord {
  return {
    id: `w-${when}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: null,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: parts.map(([exerciseId, sets]) => ({
      exerciseId,
      plannedSets: sets,
      sets: Array.from({ length: sets }, (_, index) => ({
        kind: 'working' as const,
        reps: 10,
        weight: 100,
        rir: 2,
        completed: true,
        setIndex: index,
        targetReps: [8, 12] as [number, number],
        targetRir: 2,
      })),
    })),
    ...extra,
  };
}

export const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');

/** The entries whose exercise works the muscle directly. */
export const directFor = (workout: GeneratedWorkout, muscle: MuscleId) =>
  allEntries(workout.blocks).filter((entry) =>
    requireExercise(entry.exerciseId).primaryMuscles.includes(muscle),
  );

/** The working sets of every entry that works the muscle directly. */
export const directSets = (workout: GeneratedWorkout, muscle: MuscleId): number =>
  directFor(workout, muscle).reduce((sum, entry) => sum + working(entry).length, 0);

/** The fewest reps in reserve any working set asks of the muscle directly. */
export const lowestRir = (workout: GeneratedWorkout, muscle: MuscleId): number =>
  Math.min(
    ...directFor(workout, muscle)
      .flatMap(working)
      .map((set) => set.targetRir),
  );

/** "barbell-bench-press x3 @RIR 3/3/3", for a failure's message. */
export const describeWorkout = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).map((entry) => {
    const rirs = (kind: 'working' | 'drop') =>
      entry.sets
        .filter((set) => set.kind === kind)
        .map((set) => set.targetRir)
        .join('/');
    const drops = entry.sets.some((set) => set.kind === 'drop')
      ? ` + drop @RIR ${rirs('drop')}`
      : '';
    return `${entry.exerciseId} x${working(entry).length} @RIR ${rirs('working')}${drops}`;
  });
