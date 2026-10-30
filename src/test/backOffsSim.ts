import type { UserProfile } from '../core/validation/profile';
import type { WorkoutRecord } from '../core/validation/workoutRecord';
import type { LocationProfile } from '../core/validation/location';
import {
  allEntries,
  type GeneratedWorkout,
  type SetPrescription,
  type WorkoutEntry,
} from '../engine/workout/types';
import { generateWorkout, type GenerationConstraints } from '../engine/workoutGenerator/generate';
import { gym } from './backOffs';

/**
 * The fifth review of round N: weeks of plans the app builds, each logged as the app saves it
 * (`buildWorkoutRecord`'s fields). Synthetic data only.
 */

export type Logged = (
  entry: WorkoutEntry,
  set: SetPrescription,
) => { reps: number; rir: number | null; weight: number | null } | null;

/** Every set lifted as asked: the reps one past the floor, at the reserve and load asked. */
export const asAsked: Logged = (_entry, set) => ({
  reps: Math.min(set.targetReps[1], set.targetReps[0] + 1),
  rir: set.targetRir,
  weight: set.targetWeight,
});

export function savedAs(
  workout: GeneratedWorkout,
  when: string,
  id: string,
  how: Logged = asAsked,
): WorkoutRecord {
  return {
    id,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: workout.templateId,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: allEntries(workout.blocks)
      .filter((entry) => entry.stopped === undefined)
      .map((entry) => ({
        exerciseId: entry.exerciseId,
        entryId: entry.id,
        role: entry.role,
        plannedSets: entry.sets.filter((set) => set.kind === 'working').length,
        ...(entry.push ? { push: entry.push } : {}),
        ...(entry.backOffDrop !== undefined ? { backOffDrop: entry.backOffDrop } : {}),
        ...(entry.atBackOffs ? { atBackOffs: true as const } : {}),
        sets: entry.sets.flatMap((set) => {
          const done = how(entry, set);
          if (!done) return [];
          return [
            {
              kind: set.kind,
              reps: done.reps,
              weight: done.weight,
              rir: done.rir,
              completed: true,
              setIndex: set.index,
              targetReps: [set.targetReps[0], set.targetReps[1]] as [number, number],
              targetWeight: set.targetWeight,
              targetRir: set.targetRir,
              loggedAt: when,
              ...(set.tier ? { tier: set.tier } : {}),
            },
          ];
        }),
      })),
  };
}

export interface Seen {
  day: number;
  template: string;
  role: string;
  push?: string;
  atBackOffs?: boolean;
  drop?: number;
  sets: string[];
  evidence: string[];
}

export const describeEntry = (entry: WorkoutEntry): string[] =>
  entry.sets
    .filter((set) => set.kind === 'working')
    .map(
      (set) =>
        `${set.tier ?? 'straight'} ${set.targetWeight}x${set.targetReps[0]}-${set.targetReps[1]}@${set.targetRir}`,
    );

/** Days of plans (offsets from `start`), each logged with `how`; what the lift was asked each day. */
export function simulate(options: {
  profile: UserProfile;
  history: WorkoutRecord[];
  start: string;
  days: number[];
  exerciseId: string;
  how?: Logged;
  location?: LocationProfile;
  constraintsFor?: (day: number) => GenerationConstraints;
  profileFor?: (day: number) => UserProfile;
}): { seen: Seen[]; history: WorkoutRecord[] } {
  const history = [...options.history];
  const seen: Seen[] = [];
  const begin = Date.parse(options.start);
  options.days.forEach((day, n) => {
    const when = new Date(begin + day * 86_400_000).toISOString();
    const workout = generateWorkout({
      profile: options.profileFor?.(day) ?? options.profile,
      location: options.location ?? gym,
      history,
      now: when,
      duration: 'default',
      constraints: options.constraintsFor?.(day) ?? {},
    });
    const entry = allEntries(workout.blocks).find(
      (candidate) => candidate.exerciseId === options.exerciseId && !candidate.stopped,
    );
    if (entry) {
      seen.push({
        day,
        template: workout.templateId,
        role: entry.role,
        ...(entry.push ? { push: entry.push } : {}),
        ...(entry.atBackOffs ? { atBackOffs: true } : {}),
        ...(entry.backOffDrop !== undefined ? { drop: entry.backOffDrop } : {}),
        sets: describeEntry(entry),
        evidence: entry.progression?.evidence ?? [],
      });
    }
    history.push(savedAs(workout, when, `sim-${day}-${n}`, options.how));
  });
  return { seen, history };
}
