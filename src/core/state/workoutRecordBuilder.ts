import { requireExercise } from '../../catalog/exercises/catalog';
import type { LearnedResets } from '../../engine/learned/resets';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { muscleName } from '../../catalog/muscles/muscles';
import type { CompletedSet } from '../../engine/recalibration/types';
import {
  allEntries,
  isStopped,
  pushMarkOf,
  workingSets,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../../engine/workout/types';
import { holdById } from '../../engine/workout/setText';
import { barWeightFor, hasNoLoad } from '../../engine/progression/startingLoad';
import { weightStep } from '../../engine/plateMath/plateMath';
import type { UserProfile } from '../validation/profile';
import type { TrainingRole } from '../../catalog/exercises/exerciseSchema';
import { backOffsSuit, mainLiftTarget, topSetLoad } from '../../engine/progression/backOffs';
import { recommendNextTarget } from '../../engine/progression/progression';
import { prescribeFor } from '../../engine/progression/roles';
import { sessionFeedback } from '../../engine/strategy/strategy';
import {
  computeExposure,
  computeMusclePriorities,
  computeWeeklyVolume,
} from '../../engine/volume/weeklyVolume';
import type { LoggedExercise, SessionRating, WorkoutRecord } from '../validation/workoutRecord';
import type { CompletionSummary, WorkoutSession } from './session';
import { painNextLine } from '../../engine/recovery/painReport';
import {
  estimateDoneSeconds,
  measureTrainingSeconds,
  trainingMinutes,
  trainingSeconds as trainingSecondsOf,
} from '../../engine/duration/trainingTime';

/**
 * Turns a session into the durable workout record (one entry per exercise,
 * superset members separately) and into the completion summary the user sees.
 */

export interface RecordOptions {
  now: string;
  elapsedSeconds: number;
  rating: SessionRating | null;
  endedEarly: boolean;
  /** The load the drop in force gives a lift's back-offs off its top set as lifted, at the place. */
  backOffAt?: (entry: WorkoutEntry, top: number) => number | null;
}

function loggedFor(session: WorkoutSession, entryId: string): Map<number, CompletedSet> {
  return new Map(
    session.completed.sets
      .filter((set) => set.entryId === entryId)
      .map((set) => [set.setIndex, set] as const),
  );
}

/**
 * Entries that stopped and handed their sets on (Maintenance 22): swapped out or left at another
 * place, so not skipped. One whose remaining sets were skipped with the exercise carrying them
 * was skipped.
 */
function handedOverIds(blocks: readonly WorkoutBlock[]): Set<string> {
  return new Set(
    allEntries(blocks)
      .filter((entry) => isStopped(entry) && entry.stopped?.why !== 'skip')
      .map((entry) => entry.id),
  );
}

/**
 * The load the drop gave a lift's back-offs off its top set as lifted (the ninth review of round N),
 * for the drop's correction to read only back-offs lifted at it.
 */
function backOffAtOf(
  entry: WorkoutEntry,
  logged: Map<number, CompletedSet>,
  options: RecordOptions,
): { backOffAt?: number } {
  const top = entry.sets.find((set) => set.tier === 'top');
  const lifted = top ? logged.get(top.index) : undefined;
  // With no weight logged, at the load the top set asks, as every reading of it has it (the
  // sixteenth review of round N: none was recorded, and the drop's correction read every back-off).
  const weight = top && lifted && !lifted.skipped ? (lifted.weight ?? topSetLoad(top)) : null;
  if (entry.backOffDrop === undefined || weight === null) return {};
  const at = options.backOffAt?.(entry, weight) ?? null;
  return at === null ? {} : { backOffAt: at };
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
        ...(pushMarkOf(entry) ? { push: pushMarkOf(entry) } : {}),
        ...(entry.backOffDrop !== undefined ? { backOffDrop: entry.backOffDrop } : {}),
        ...backOffAtOf(entry, logged, options),
        ...(entry.atBackOffs ? { atBackOffs: true as const } : {}),
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
              targetRir: set.targetRir,
              loggedAt: done.completedAt,
              ...(done.reserveCheck ? { reserveCheck: { ...done.reserveCheck } } : {}),
              ...(set.tier ? { tier: set.tier } : {}),
              ...(set.asked
                ? {
                    asked: {
                      weight: set.asked.weight,
                      reps: [set.asked.reps[0], set.asked.reps[1]] as [number, number],
                    },
                  }
                : {}),
            };
          }),
      };
    }),
  );
  // The training time and the plan's estimate of the sets done (Maintenance 28, items 3 and 4).
  const startedAt = session.completed.startedAt ?? options.now;
  const trainingSeconds = measureTrainingSeconds({
    startedAt,
    completedAt: options.now,
    elapsedSeconds: options.elapsedSeconds,
    entries,
  });
  const performed = new Set(
    session.completed.sets
      .filter((done) => !done.skipped)
      .map((done) => `${done.entryId}:${done.setIndex}`),
  );
  const estimatedSeconds = estimateDoneSeconds(
    workout.blocks,
    (entryId, setIndex) => performed.has(`${entryId}:${setIndex}`),
    // The warm-up the workout started with: a rebuild under way leaves none, or a short one after
    // a pause, but the run up to the first set was timed with it (the review of item 4).
    session.completed.warmupMinutes ?? workout.warmup.generalMinutes,
    requireExercise,
  );
  const handed = handedOverIds(workout.blocks);
  const skippedExerciseIds = entries
    .filter((entry) => !entry.sets.some((set) => set.kind === 'working' && set.completed))
    .filter((entry) => !handed.has(entry.entryId ?? ''))
    .map((entry) => entry.exerciseId);
  return {
    id: `w-${options.now.replace(/\D/g, '').slice(0, 14)}`,
    startedAt,
    completedAt: options.now,
    locationId: workout.locationId,
    templateId: workout.templateId,
    title: workout.title,
    entries,
    durationChoice: session.duration,
    plannedMinutes: workout.duration.targetMinutes,
    elapsedSeconds: options.elapsedSeconds,
    trainingSeconds,
    estimatedSeconds,
    endedEarly: options.endedEarly,
    rating: options.rating,
    skippedExerciseIds,
    painJoints: [...session.constraints.painJoints],
    // Every report with its exercise, an empty list too: from item 45 on, a pain joint beyond them
    // is a check-in's, never put on an exercise (the re-check of item 45).
    painReports: (session.constraints.painReports ?? []).map((report) => ({ ...report })),
    readiness: session.constraints.readiness
      ? {
          ...session.constraints.readiness,
          jointDiscomfort: [...session.constraints.readiness.jointDiscomfort],
        }
      : null,
    prs: [],
  };
}

function nextImplication(record: WorkoutRecord, muscles: readonly MuscleId[]): string {
  const rating = record.rating;
  const pain = painNextLine(rating);
  if (pain) return pain;
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

const MODE_LABEL: Record<string, string> = {
  return: 'back from a break',
  estimate: 'from the family estimate',
  start: 'first target',
  weight: 'load up',
  reps: 'reps up',
  sets: 'extra set on offer',
  maintain: 'hold',
  deload: 'micro-deload',
  regress: 'reset',
  double: 'double progression',
};

/** Joints hurt during the workout that the end-of-workout rating did not already name. */
function duringWorkoutPain(record: WorkoutRecord): string {
  const said = record.rating?.pain ? record.rating.joint : undefined;
  const joints = (record.painJoints ?? []).filter((joint) => joint !== said);
  if (joints.length === 0) return '';
  const words = joints.map((joint) => joint.replace('-', ' ')).join(', ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} pain noted during the workout.`;
}

export function buildCompletion(
  session: WorkoutSession,
  record: WorkoutRecord,
  profile: UserProfile,
  history: readonly WorkoutRecord[] = [],
  /** What the lifter reset of what the app learned (Maintenance 27, item 47). */
  resets: LearnedResets | null = null,
  /**
   * The log as the rules read it (item 43's checks), this workout in it: the next targets read it
   * as the next plan will. Without it, the history and this workout as logged.
   */
  read: readonly WorkoutRecord[] | null = null,
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
  // Volume is load times reps; a hold's seconds are not reps, so holds stay out of it.
  const volume = record.entries.reduce(
    (sum, entry) =>
      sum +
      (holdById(entry.exerciseId) ? [] : entry.sets)
        .filter((set) => set.kind !== 'warmup' && set.completed && set.weight !== null)
        .reduce((inner, set) => inner + (set.weight ?? 0) * set.reps, 0),
    0,
  );
  const trained = record.entries.filter((entry) => completedWorking(entry).length > 0);
  const muscles = [
    ...new Set(trained.flatMap((entry) => requireExercise(entry.exerciseId).primaryMuscles)),
  ];
  const handed = handedOverIds(session.workout.blocks);
  const skipped = record.entries
    .filter((entry) => completedWorking(entry).length === 0)
    .filter((entry) => !handed.has(entry.entryId ?? ''))
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
    if (holdById(entry.exerciseId)) continue;
    // A lift's top set done, its back-offs are no best set (Maintenance 32, item 11).
    const topDone = completedWorking(entry).some((set) => set.tier === 'top');
    for (const set of completedWorking(entry)) {
      if (set.weight === null || (topDone && set.tier === 'back-off')) continue;
      if (!best || set.weight * set.reps > best.weight * best.reps) {
        best = { name: requireExercise(entry.exerciseId).name, weight: set.weight, reps: set.reps };
      }
    }
  }
  if (best)
    highlights.push(`Best set: ${best.name} ${best.weight} ${profile.units} × ${best.reps}.`);
  if (setsCompleted > 0)
    highlights.push(
      `${setsCompleted} working ${setsCompleted === 1 ? 'set' : 'sets'} in ${Math.max(1, trainingMinutes(record))} min.`,
    );
  if (record.endedEarly) highlights.push('Ended early; logged work is saved exactly as entered.');

  const after = read ?? [...history.filter((candidate) => candidate.id !== record.id), record];
  const completedAtIso = record.completedAt ?? record.startedAt;
  const nextTargets = trained.slice(0, 6).map((entry) => {
    const exercise = requireExercise(entry.exerciseId);
    const role = (entry.role as TrainingRole | undefined) ?? exercise.defaultRole;
    // Read as the next plan reads it: a main lift on top set plus back-offs at the top set's
    // reserve (the second review of round N: "(hold)" after every session lifted as asked).
    const { target } = mainLiftTarget({
      read: (asked, history, sessionsAt) =>
        recommendNextTarget({
          exercise,
          role,
          prescription: asked,
          history,
          profile,
          // A clock, so a lift's own curve (item 41) speaks here as in the next plan.
          now: completedAtIso,
          resets,
          ...(sessionsAt ? { sessionsAt } : {}),
        }),
      prescription: prescribeFor(exercise, role, profile, after),
      suits: backOffsSuit(exercise, role, profile),
      profile,
      // A plain day: the next plan's own, which runs the lift to push on its own straight sets
      // (the third review of round N).
      day: profile.pushLift?.exerciseId !== exercise.id,
      exerciseId: exercise.id,
      history: after,
      // On the lift's own steps from the bar, as the next plan's load lands (the sixth review of
      // round N: "162 lb" where the plan asks 160).
      load: {
        step: weightStep(exercise, profile.units),
        floor: barWeightFor(exercise, profile.units),
        loading: null,
      },
      units: profile.units,
    });
    if (target.hold) {
      return target.weight === null
        ? `${exercise.name}: hold ${target.reps[0]} s`
        : `${exercise.name}: ${target.weight} ${profile.units} × ${target.reps[0]} s`;
    }
    // A lift done at bodyweight or with a band has no weight to log (Maintenance 21).
    const load =
      target.weight !== null
        ? `${target.weight} ${profile.units}`
        : hasNoLoad(exercise)
          ? exercise.load === 'band'
            ? 'band'
            : 'bodyweight'
          : 'log a weight';
    return `${exercise.name}: ${load} × ${target.reps[0]}-${target.reps[1]} (${MODE_LABEL[target.mode]})`;
  });
  const priorities = computeMusclePriorities(
    profile,
    computeWeeklyVolume(after, completedAtIso),
    computeExposure(after, completedAtIso),
  );
  const nextFocus = `Next focus: ${priorities
    .slice(0, 3)
    .map((priority) => muscleName(priority.muscle))
    .join(', ')}.`;
  const recoveryNote = [
    muscles.length > 0
      ? `Give ${muscles
          .slice(0, 3)
          .map((muscle) => muscleName(muscle as MuscleId))
          .join(', ')} about 48 h before loading them again.`
      : 'Nothing was trained hard enough to need recovery time.',
    record.rating?.effort === 'too-hard' ? 'Rated too hard: an easier day or a rest day next.' : '',
    // The rating's pain is said once, under Next time; only other joints hurt mid-workout add here.
    duringWorkoutPain(record),
  ]
    .filter(Boolean)
    .join(' ');

  return {
    recordId: record.id,
    completedAt: record.completedAt ?? session.completed.startedAt ?? '',
    elapsedSeconds: record.elapsedSeconds ?? 0,
    trainingSeconds: trainingSecondsOf(record),
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
    feedback: sessionFeedback(record, history, profile),
    prs: record.prs ?? [],
    recoveryNote,
    nextTargets,
    nextFocus,
  };
}
