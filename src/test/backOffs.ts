import { createDefaultLocations } from '../core/validation/location';
import {
  createDefaultProfile,
  type ProgramStyle,
  type UserProfile,
} from '../core/validation/profile';
import type { WorkoutRecord } from '../core/validation/workoutRecord';
import { emptyCompleted, emptyConstraints, recalibrate } from '../engine/recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../engine/recalibration/types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../engine/workout/types';
import { generateWorkout, type GenerationConstraints } from '../engine/workoutGenerator/generate';
import { RECORD_NOW, record } from './records';

/**
 * Maintenance 32, the owner's item 11: a main lift on top set plus back-offs, planned and
 * recalibrated, for the first review of round N's tests. Synthetic data only.
 */

export const [home, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW) as [
  ReturnType<typeof createDefaultLocations>[number],
  ReturnType<typeof createDefaultLocations>[number],
];
export const BENCH = 'barbell-bench-press';
export const DB_BENCH = 'dumbbell-bench-press';

export const profileOf = (
  programStyle: ProgramStyle = 'hybrid',
  extra: Partial<UserProfile> = {},
): UserProfile => ({
  ...createDefaultProfile(RECORD_NOW),
  bodyweight: 185,
  programStyle,
  ...extra,
});

/** Two straight sessions of the bench press at 185, every set clean at 2 in reserve. */
export const trained = (): WorkoutRecord[] =>
  [7, 3].map((daysAgo) =>
    record(
      daysAgo,
      BENCH,
      [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ],
      [4, 6],
      2,
    ),
  );

export function plan(
  history: WorkoutRecord[] = trained(),
  profile: UserProfile = profileOf(),
  constraints: GenerationConstraints = {},
  location = gym,
): GeneratedWorkout {
  return generateWorkout({
    profile,
    location,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms', ...constraints },
  });
}

export const entryOf = (workout: GeneratedWorkout, exerciseId: string): WorkoutEntry => {
  const found = allEntries(workout.blocks).find(
    (entry) => entry.exerciseId === exerciseId && entry.stopped === undefined,
  );
  if (!found) throw new Error(`no live ${exerciseId}`);
  return found;
};

export const bench = (workout: GeneratedWorkout): WorkoutEntry => entryOf(workout, BENCH);

/** Each working set: its load, its reserve and its tier. */
export const shape = (entry: WorkoutEntry) =>
  entry.sets
    .filter((set) => set.kind === 'working')
    .map((set) => [set.targetWeight, set.targetRir, set.tier ?? 'straight']);

export function request(
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  options: Partial<RecalibrationRequest> = {},
): RecalibrationRequest {
  return {
    trigger,
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: 'default',
    profile: profileOf(),
    location: gym,
    loading: { missingPlates: [] },
    history: trained(),
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: RECORD_NOW,
    ...options,
  };
}

export function run(
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  options: Partial<RecalibrationRequest> = {},
): RecalibrationSuccess {
  const result = recalibrate(request(trigger, workout, options));
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** One set of an entry logged: its kind, load and reserve. */
export function loggedOne(
  entry: WorkoutEntry,
  setIndex: number,
  weight: number | null,
  kind: 'working' | 'warmup' = 'working',
): CompletedWork {
  return {
    ...emptyCompleted(),
    startedAt: RECORD_NOW,
    currentEntryId: entry.id,
    sets: [
      {
        entryId: entry.id,
        exerciseId: entry.exerciseId,
        setIndex,
        kind,
        reps: 5,
        weight,
        rir: kind === 'working' ? 1 : 5,
        completedAt: RECORD_NOW,
      },
    ],
  };
}

/** The top set logged at a load. */
export function topDone(entry: WorkoutEntry, weight: number | null): CompletedWork {
  const top = entry.sets.find((set) => set.tier === 'top');
  if (!top) throw new Error('no top set');
  return loggedOne(entry, top.index, weight);
}
