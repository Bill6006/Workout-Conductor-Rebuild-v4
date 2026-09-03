import { requireExercise } from '../../catalog/exercises/catalog';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { muscleName } from '../../catalog/muscles/muscles';
import type { CompletedSet } from '../../engine/recalibration/types';
import { allEntries, workingSets } from '../../engine/workout/types';
import type { UserProfile } from '../validation/profile';
import type { LoggedExercise, SessionRating, WorkoutRecord } from '../validation/workoutRecord';
import type { CompletionSummary, WorkoutSession } from './session';

/**
 * Turns a session into the durable workout record (one entry per exercise,
 * superset members separately) and into the completion summary the user sees.
 */

export interface RecordOptions {
  now: string;
  elapsedSeconds: number;
  rating: SessionRating | null;
  endedEarly: boolean;
}

function loggedFor(session: WorkoutSession, entryId: string): Map<number, CompletedSet> {
  return new Map(
    session.completed.sets
      .filter((set) => set.entryId === entryId)
      .map((set) => [set.setIndex, set] as const),
  );
}

export function buildWorkoutRecord(session: WorkoutSession, options: RecordOptions): WorkoutRecord {
  const { workout } = session;
  const entries: LoggedExercise[] = workout.blocks.flatMap((block) =>
    block.entries.map((entry) => {
      const logged = loggedFor(session, entry.id);
      return {
        exerciseId: entry.exerciseId,
        entryId: entry.id,
        blockId: block.id,
        blockKind: block.kind,
        role: entry.role,
        plannedSets: workingSets(entry).filter((set) => set.kind === 'working').length,
        replacedFrom: entry.replacedFrom,
        sets: entry.sets
          .filter((set) => logged.has(set.index))
          .map((set) => {
            const done = logged.get(set.index) as CompletedSet;
            return {
              kind: set.kind,
              reps: done.reps,
              weight: done.weight,
              rir: done.rir,
              completed: !done.skipped,
              setIndex: set.index,
              targetReps: [set.targetReps[0], set.targetReps[1]] as [number, number],
              targetWeight: set.targetWeight,
              loggedAt: done.completedAt,
            };
          }),
      };
    }),
  );
  const skippedExerciseIds = entries
    .filter((entry) => !entry.sets.some((set) => set.kind === 'working' && set.completed))
    .map((entry) => entry.exerciseId);
  return {
    id: `w-${options.now.replace(/\D/g, '').slice(0, 14)}`,
    startedAt: session.completed.startedAt ?? options.now,
    completedAt: options.now,
    locationId: workout.locationId,
    templateId: workout.templateId,
    title: workout.title,
    entries,
    durationChoice: session.duration,
    plannedMinutes: workout.duration.targetMinutes,
    elapsedSeconds: options.elapsedSeconds,
    endedEarly: options.endedEarly,
    rating: options.rating,
    skippedExerciseIds,
  };
}

function nextImplication(record: WorkoutRecord, muscles: readonly MuscleId[]): string {
  const rating = record.rating;
  if (rating?.pain) return 'Pain was reported: the next session works around that joint first.';
  switch (rating?.effort) {
    case 'too-easy':
      return 'Felt easy: expect a small load step on the main lift next time.';
    case 'too-hard':
      return 'Felt hard: the next session trims a set or lightens the main lift.';
    case 'right':
      return 'Right on target: same loads next time, aim for the top of each range.';
    default:
      return muscles.length > 0
        ? `Weekly volume for ${muscles
            .slice(0, 3)
            .map((muscle) => muscleName(muscle).toLowerCase())
            .join(', ')} is updated for the next session.`
        : 'Nothing logged, so the next session starts from the plan defaults.';
  }
}

export function buildCompletion(
  session: WorkoutSession,
  record: WorkoutRecord,
  profile: UserProfile,
): CompletionSummary {
  const entries = allEntries(session.workout.blocks);
  const completedWorking = (entry: LoggedExercise) =>
    entry.sets.filter((set) => set.kind === 'working' && set.completed);
  const setsCompleted = record.entries.reduce(
    (sum, entry) => sum + completedWorking(entry).length,
    0,
  );
  const setsPlanned = entries.reduce(
    (sum, entry) => sum + entry.sets.filter((set) => set.kind === 'working').length,
    0,
  );
  const warmupSets = record.entries.reduce(
    (sum, entry) => sum + entry.sets.filter((set) => set.kind === 'warmup' && set.completed).length,
    0,
  );
  const volume = record.entries.reduce(
    (sum, entry) =>
      sum +
      entry.sets
        .filter((set) => set.kind !== 'warmup' && set.completed && set.weight !== null)
        .reduce((inner, set) => inner + (set.weight ?? 0) * set.reps, 0),
    0,
  );
  const trained = record.entries.filter((entry) => completedWorking(entry).length > 0);
  const muscles = [
    ...new Set(trained.flatMap((entry) => requireExercise(entry.exerciseId).primaryMuscles)),
  ];
  const skipped = record.entries
    .filter((entry) => completedWorking(entry).length === 0)
    .map((entry) => requireExercise(entry.exerciseId).name);
  const substitutions = record.entries
    .filter((entry) => entry.replacedFrom)
    .map(
      (entry) =>
        `${requireExercise(entry.replacedFrom as string).name} became ${requireExercise(entry.exerciseId).name}`,
    );

  const highlights: string[] = [];
  let best: { name: string; weight: number; reps: number } | null = null;
  for (const entry of record.entries) {
    for (const set of completedWorking(entry)) {
      if (set.weight === null) continue;
      if (!best || set.weight * set.reps > best.weight * best.reps) {
        best = { name: requireExercise(entry.exerciseId).name, weight: set.weight, reps: set.reps };
      }
    }
  }
  if (best)
    highlights.push(`Best set: ${best.name} ${best.weight} ${profile.units} × ${best.reps}.`);
  if (setsCompleted > 0)
    highlights.push(
      `${setsCompleted} working ${setsCompleted === 1 ? 'set' : 'sets'} in ${Math.max(1, Math.round(record.elapsedSeconds ?? 0) / 60).toFixed(0)} min.`,
    );
  if (record.endedEarly) highlights.push('Ended early; logged work is saved exactly as entered.');

  return {
    recordId: record.id,
    completedAt: record.completedAt ?? session.completed.startedAt ?? '',
    elapsedSeconds: record.elapsedSeconds ?? 0,
    plannedMinutes: record.plannedMinutes ?? session.workout.duration.targetMinutes,
    exercisesCompleted: trained.length,
    exercisesPlanned: entries.length,
    setsCompleted,
    setsPlanned,
    warmupSets,
    volume: Math.round(volume),
    muscles,
    skipped,
    substitutions,
    highlights,
    endedEarly: record.endedEarly,
    nextImplication: nextImplication(record, muscles),
  };
}
