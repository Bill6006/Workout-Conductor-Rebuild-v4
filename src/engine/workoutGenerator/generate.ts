import { muscleLoads, type MuscleLoad } from '../alternatives/signals';
import { FittingLog, SHORTENED_RESTS, gaveBackLine, trimmedLine } from './fittingLog';
import {
  DELOAD_LOAD_SCALE,
  DELOAD_RIR_DELTA,
  DELOAD_SETS_DELTA,
  formatWindow,
  type DeloadWindow,
} from '../planning/deload';
import {
  allExercises,
  exercisesByPattern,
  getExercise,
  requireExercise,
} from '../../catalog/exercises/catalog';
import type { CatalogExercise, Joint, TrainingRole } from '../../catalog/exercises/exerciseSchema';
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns';
import {
  MUSCLE_IDS,
  muscleGroupOf,
  muscleName,
  muscleVerb,
  type MuscleId,
} from '../../catalog/muscles/muscles';
import type { LocationProfile } from '../../core/validation/location';
import type { UnitSystem, UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import {
  blocksCandidate,
  checkExerciseFit,
  checkSupersetPair,
  checkWorkoutConflicts,
  isBlocked,
  type ConflictContext,
} from '../conflicts/conflictEngine';
import { buildConflictContext, preferredIdsOf } from '../conflicts/context';
import {
  estimateWorkout,
  generalWarmupMinutes,
  resolveTargetMinutes,
  shorterLength,
  type SetDonePredicate,
} from '../duration/duration';
import {
  MIN_REST_SECONDS,
  ROLE_RANK,
  buildSets,
  prescribe,
  prescribeFor,
  rampSetsFor,
  restCategory,
  rirFloor,
  type Prescription,
  type RampContext,
} from '../progression/roles';
import { allowsFailure, isAutoStyle, resolveStyle } from '../planning/styleAdvice';
import {
  PUSH_LIFT,
  daysToNextSession,
  pushCap,
  pushDay,
  pushLine,
  pushRir,
  pushTargetText,
  sessionDaysAhead,
  type PlannedWork,
  type PushDay,
  type WorkAhead,
} from '../planning/pushLift';
import { addLocalDays, localDayKey } from '../../core/time/localDate';
import { PACE, personalPace, type PersonalPace } from '../duration/trainingTime';
import {
  BODYWEIGHT_VERSION,
  lastDoneHere,
  loadedVersionLine,
  loadedVersionShift,
  outgrownMoves,
  waitsForBodyweight,
  withSwapsBack,
  type OutgrownBy,
} from './loadedVersions';
import { styleInfo } from '../planning/styles';
import { fitWeight, loadingFor, type Loading, type SessionLoading } from '../loading/loading';
import {
  BACK_OFF,
  backOffCap,
  backOffLoadAfter,
  owedBackOffLoad,
  backOffRir,
  backOffsSuit,
  mainLiftTarget,
  ownRepsOf,
  topSetRir,
  withBackOffs,
} from '../progression/backOffs';
import type { StrengthMaxes } from '../progression/maxes';
import {
  applyProgression,
  capTarget,
  entryPushedToEffort,
  recommendNextTarget,
  summarizeProgression,
  type NextTarget,
} from '../progression/progression';
import { barWeightFor } from '../progression/startingLoad';
import type { Readiness } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { dayRecovery, hoursSince, recoveryWindows } from '../recovery/recovery';
import { illnessOf } from '../readiness/checkIn';
import { RULES } from '../rules/ruleTable';
import { precedingWorkToday, type EarlierWork } from '../recovery/sessionContext';
import {
  INDIRECT_SET_WEIGHT,
  computeExposure,
  computeMusclePriorities,
  computeWeeklyVolume,
  type Exposure,
} from '../volume/weeklyVolume';
import {
  CATCH_UP_TEMPLATE_IDS,
  allEntries,
  isStopped,
  withoutHandTargets,
  pushMarkOf,
  roundsOf,
  roundsRun,
  workingSets,
  type CatchUpSlot,
  type DurationChoice,
  type EmptiedPlan,
  type PushMark,
  type GeneratedWorkout,
  type MusclePriority,
  type SetPrescription,
  type StoppedWork,
  type TimeBreakdown,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../workout/types';
import type { LastingSwap } from '../planning/lastingSwaps';
import {
  CATCH_UP,
  offPlanFloor,
  restingMuscles,
  trainedIn,
  type CatchUpMuscle,
  type CatchUpSpec,
} from '../planning/catchUp';
import type { LearnedResets } from '../learned/resets';

/**
 * The pure, deterministic workout-generation engine.
 *
 * Inputs: profile, location, history, the date, and the duration choice.
 * Output: the best realistic session for that duration, explained. Every pick
 * and every pairing goes through the conflict engine; duration fitting keeps
 * the highest-value work and records each step it took.
 *
 * The recalibration engine reuses this generator for partial rebuilds through
 * `constraints`: entries to keep in place (logged work is frozen), exercises
 * and equipment to avoid this session, joints to protect, a remaining-time
 * budget, and set or effort adjustments from readiness.
 */

export interface KeptEntry {
  entry: WorkoutEntry;
  /** Frozen entries carry logged sets: never trimmed, never dropped, never re-paired. */
  frozen: boolean;
  /**
   * Logged work that cannot go on here, its equipment not at this place: it ends at its
   * logged sets, which stay as the history they are, and its slot takes a replacement for
   * the working sets still owed.
   */
  closed?: boolean;
  /**
   * Kept in its place, but fitted to the time like a lift not begun (Maintenance 24): a lift with
   * nothing logged whose sets a change of the day's settings rebuilt.
   */
  trimmable?: boolean;
}

/**
 * Ends an entry at its logged sets. Only unlogged sets go; a logged set, skipped or not, is
 * never touched. The first close writes on the entry how many working sets it still owed:
 * the sets it counted are gone after this, and every later rebuild still has to know.
 */
export function closeAtLogged(
  entry: WorkoutEntry,
  isDone: SetDonePredicate,
  why: NonNullable<StoppedWork['why']> = 'place',
): void {
  const planned = entry.sets.some((set) => set.kind === 'working');
  // A lift owes what it shows still to come: under a hard start's ease, the sets the ease left, as
  // a lift under way keeps the ease for good, and what stands in for it takes no set more
  // (Maintenance 26, the ninth pass of item 42: owed the plan's sets, a stand-in gave back the set
  // the ease took, and a lift done under the ease owed one). The ease's record goes with the sets it
  // was for: kept on a lift picked up again, it gave a copy the plan's sets on top of a stand-in's,
  // at the weights of a place left (the eleventh pass took back the tenth's keeping).
  const owed = entry.sets.filter(
    (set) => set.kind === 'working' && !isDone(entry.id, set.index),
  ).length;
  // The plan its record kept stays with what stopped it, for a swap back alone (the third review of
  // Maintenance 33: swapped back after "Lighter", a saved copy kept the bench's top set alone).
  const was = entry.eased;
  const record =
    was?.sets && (was.exerciseId === undefined || was.exerciseId === entry.exerciseId)
      ? was
      : undefined;
  delete entry.eased;
  entry.sets = entry.sets.filter((set) => isDone(entry.id, set.index));
  entry.warmupSets = entry.sets.filter((set) => set.kind === 'warmup').length;
  entry.dropSet = entry.sets.some((set) => set.kind === 'drop');
  if (entry.stopped === undefined && planned) {
    entry.stopped = { owed, why, ...(record ? { record } : {}) };
  }
}

/** What the warm-up says, for its general minutes and the session's length. */
export function warmupNote(generalWarmup: number, targetMinutes: number): string {
  return generalWarmup === 0
    ? 'Already warmed up: continue with the remaining sets.'
    : targetMinutes <= 15
      ? 'Short general warm-up, then one ramp set on the main lift.'
      : `${generalWarmup} min general warm-up, then ramp sets on the main lifts; ramp sets never count as working sets.`;
}

/** The working sets a stopped entry still owes its slot; one with no count owes a whole prescription. */
function owedBy(entry: WorkoutEntry): number {
  if (entry.stopped?.why === 'skip') return 0;
  if (entry.stopped !== undefined) return entry.stopped.owed;
  return entry.sets.some((set) => set.kind === 'working') ? 0 : Number.POSITIVE_INFINITY;
}

export interface PrescriptionAdjustment {
  /** Working sets to add (positive) or remove (negative) from new entries. */
  sets: number;
  /** Reps in reserve to add to new entries. */
  rir: number;
  restFactor: number;
  /** Multiplier on every target load (a deload week uses 0.9). */
  loadScale?: number;
  /**
   * The fewest reps in reserve the day allows any set (Maintenance 33): a head cold on the
   * check-in keeps every set 2 or more short of failure, no top set and no drop set.
   */
  rirFloor?: number;
}

/** The fewest reps in reserve the day's settings allow, or none. */
export function dayRirFloor(adjust: PrescriptionAdjustment | undefined): number {
  return adjust?.rirFloor ?? 0;
}

/** A logged set as the session context needs it: whose, what kind, when, and whether it was skipped. */
export interface CompletedSetStamp {
  entryId: string;
  kind: 'warmup' | 'working' | 'drop';
  completedAt: string;
  skipped?: boolean;
  /** The set's own numbers, where the caller has them: a top set picked up again reads them. */
  setIndex?: number;
  reps?: number;
  rir?: number | null;
  weight?: number | null;
}

/**
 * What the entries before an exercise have done today, for the session
 * context: planned working sets, the times of the ones logged, the ones
 * skipped, and the heaviest working weight.
 */
export function sessionWork(
  entries: readonly WorkoutEntry[],
  completedSets: readonly CompletedSetStamp[],
  exerciseOf: (id: string) => CatalogExercise,
): (EarlierWork & { weight: number | null })[] {
  return entries.map((entry) => {
    const done = completedSets.filter((set) => set.entryId === entry.id && set.kind !== 'warmup');
    const working = workingSets(entry);
    return {
      exercise: exerciseOf(entry.exerciseId),
      planned: working.length,
      doneAt: done
        .filter((set) => !set.skipped)
        .map((set) => set.completedAt)
        .sort(),
      skipped: done.filter((set) => set.skipped).length,
      weight: working.reduce<number | null>(
        (best, set) => (set.targetWeight === null ? best : Math.max(best ?? 0, set.targetWeight)),
        null,
      ),
    };
  });
}

/** The ramp context for an exercise from the work before it today. */
export function rampContextFor(
  exercise: CatalogExercise,
  earlier: readonly (EarlierWork & { weight: number | null })[],
  afterBreak: boolean,
): RampContext {
  const samePattern = earlier.filter(
    (item) => item.exercise.movementPattern === exercise.movementPattern,
  );
  const groups = new Set(exercise.primaryMuscles.map(muscleGroupOf));
  const sameMuscles = earlier.some((item) =>
    item.exercise.primaryMuscles.some((muscle) => groups.has(muscleGroupOf(muscle))),
  );
  return {
    samePattern:
      samePattern.length === 0
        ? null
        : {
            weight: samePattern.reduce<number | null>(
              (best, item) => (item.weight === null ? best : Math.max(best ?? 0, item.weight)),
              null,
            ),
          },
    sameMuscles,
    afterBreak,
  };
}

export interface GenerationConstraints {
  keep?: readonly KeptEntry[];
  /** Blocks of the previous workout, so pairings between kept entries survive. */
  keepBlocks?: readonly WorkoutBlock[];
  excludeExerciseIds?: readonly string[];
  unavailableEquipment?: readonly string[];
  painJoints?: readonly Joint[];
  templateId?: string;
  /**
   * A catch-up on a day not ticked, or a second workout on a day trained (Maintenance 31, items 12
   * and 32): the session is built from these muscles alone. One with no muscles plans as usual.
   */
  catchUp?: CatchUpSpec | null;
  /**
   * The sets today's plan owes each muscle for the week (Maintenance 34, the need carried forward:
   * `todaysNeedOf`), for muscles outside their recovery windows: a set more goes on a lift that works
   * one, where the length leaves room.
   */
  carry?: Partial<Record<MuscleId, number>>;
  /**
   * The catch-up's slots as the plan laid them out (the seventh review of round M): a rebuild
   * around kept lifts fills these, never a layout made again from what the place has.
   */
  catchUpSlots?: readonly CatchUpSlot[];
  /**
   * The slots of a day off the plan whose lift the lifter's change left out with nothing to come in
   * (the eighteenth review of round M): no lift goes in them.
   */
  closedSlots?: readonly number[];
  /** The lifts the lifter swapped away today: no slot picks one by itself (the eighteenth review). */
  awayIds?: readonly string[];
  /**
   * The layouts of the plans the lifter's hand emptied today for today's offer (`emptied`, the
   * nineteenth and twentieth reviews of round M): laid out again, each takes no lift; another
   * layout is another plan.
   */
  emptiedLayouts?: readonly string[];
  /** Remaining budget for everything in the result, replacing the duration target. */
  targetMinutesOverride?: number;
  generalWarmupMinutesOverride?: number;
  /** Exact-end mode: no tolerance, and locked entries may lose remaining sets. */
  hardCap?: boolean;
  isSetDone?: SetDonePredicate;
  /** Sets logged so far, with their times: what came before each exercise today, and when. */
  completedSets?: readonly CompletedSetStamp[];
  adjust?: PrescriptionAdjustment;
  /** Today's check-in, so fatigue can hold loads. */
  readiness?: Readiness | null;
  /** A planned deload week covering this session: fewer sets, more reserve, lighter loads. */
  deload?: DeloadWindow | null;
  /** A coach focus: templates and picks that carry this muscle score higher, and its accessories lead. */
  focusMuscle?: MuscleId | null;
  /** Plates not around today: new targets land on what the rest of the rack makes. */
  sessionLoading?: SessionLoading;
  /** The lifter's lasting swaps: where one fits, it is picked in place of the one swapped out. */
  swaps?: readonly LastingSwap[];
  /**
   * Today planned without the week's extra exposure of a lift to push (Maintenance 27, item 44):
   * the generator's own probe, to see what the next session would be and where the lift's muscles
   * stand before the extra goes in.
   */
  pushProbe?: boolean;
}

export interface GenerationInput {
  profile: UserProfile;
  location: LocationProfile | undefined;
  history: readonly WorkoutRecord[];
  now: string;
  duration: DurationChoice;
  constraints?: GenerationConstraints;
  /** Maxes the lifter entered by hand, for lifts without their own history. */
  maxes?: StrengthMaxes | null;
  /** What the lifter reset of what the app learned (Maintenance 27, item 47). */
  resets?: LearnedResets | null;
}

interface Slot {
  pattern: MovementPatternId;
  role: TrainingRole;
  muscles: MuscleId[];
  /** A catch-up's sets for the slot: never more than the role's own (Maintenance 31). */
  sets?: number;
  /** A catch-up's fewest reps in reserve for the slot. */
  minRir?: number;
  /** A catch-up's slot added for a muscle a lift misses: the slot it comes right after. */
  after?: number;
}

interface Template {
  id: string;
  title: string;
  muscles: MuscleId[];
  slots: Slot[];
  strengthPriority: boolean;
}

const slot = (pattern: MovementPatternId, role: TrainingRole, muscles: MuscleId[]): Slot => ({
  pattern,
  role,
  muscles,
});

const PUSH_ARMS: Template = {
  id: 'push-arms',
  title: 'Push + arms',
  muscles: ['chest', 'upper-chest', 'front-delts', 'side-delts', 'triceps', 'biceps'],
  strengthPriority: false,
  slots: [
    slot('horizontal-push', 'primary-strength', ['chest', 'triceps']),
    slot('incline-push', 'primary-hypertrophy', ['upper-chest', 'front-delts']),
    slot('vertical-push', 'secondary-hypertrophy', ['front-delts', 'side-delts']),
    slot('chest-fly', 'isolation', ['chest']),
    slot('elbow-extension', 'isolation', ['triceps']),
    slot('shoulder-abduction', 'isolation', ['side-delts']),
    slot('elbow-flexion', 'isolation', ['biceps']),
  ],
};

const PULL_ARMS: Template = {
  id: 'pull-arms',
  title: 'Pull + arms',
  muscles: ['lats', 'upper-back', 'rear-delts', 'traps', 'biceps', 'triceps'],
  strengthPriority: false,
  slots: [
    slot('horizontal-pull', 'primary-strength', ['upper-back', 'lats']),
    slot('vertical-pull', 'primary-hypertrophy', ['lats']),
    slot('rear-delt-fly', 'isolation', ['rear-delts', 'upper-back']),
    slot('elbow-flexion', 'isolation', ['biceps']),
    slot('elbow-extension', 'isolation', ['triceps']),
    slot('shrug', 'isolation', ['traps']),
    slot('elbow-flexion', 'finisher', ['biceps', 'forearms']),
  ],
};

const LOWER: Template = {
  id: 'lower',
  title: 'Lower body',
  muscles: ['quads', 'hamstrings', 'glutes', 'calves'],
  strengthPriority: true,
  slots: [
    slot('squat', 'primary-strength', ['quads', 'glutes']),
    slot('hinge', 'primary-hypertrophy', ['hamstrings', 'glutes']),
    slot('lunge', 'secondary-hypertrophy', ['quads', 'glutes']),
    slot('knee-flexion', 'isolation', ['hamstrings']),
    slot('knee-extension', 'isolation', ['quads']),
    slot('calf-raise', 'isolation', ['calves']),
    slot('core-anti-extension', 'finisher', ['abs']),
  ],
};

const UPPER: Template = {
  id: 'upper',
  title: 'Upper body',
  muscles: ['chest', 'lats', 'upper-back', 'front-delts', 'side-delts', 'biceps', 'triceps'],
  strengthPriority: false,
  slots: [
    slot('horizontal-push', 'primary-strength', ['chest', 'triceps']),
    slot('horizontal-pull', 'secondary-strength', ['upper-back', 'lats']),
    slot('vertical-pull', 'primary-hypertrophy', ['lats']),
    slot('incline-push', 'secondary-hypertrophy', ['upper-chest', 'front-delts']),
    slot('shoulder-abduction', 'isolation', ['side-delts']),
    slot('elbow-flexion', 'isolation', ['biceps']),
    slot('elbow-extension', 'isolation', ['triceps']),
  ],
};

const FULL_BODY: Template = {
  id: 'full-body',
  title: 'Full body',
  muscles: ['quads', 'glutes', 'hamstrings', 'chest', 'upper-back', 'lats', 'biceps', 'triceps'],
  strengthPriority: true,
  slots: [
    slot('squat', 'primary-strength', ['quads', 'glutes']),
    slot('horizontal-push', 'secondary-strength', ['chest', 'triceps']),
    slot('horizontal-pull', 'primary-hypertrophy', ['upper-back', 'lats']),
    slot('hinge', 'secondary-hypertrophy', ['hamstrings', 'glutes']),
    slot('vertical-push', 'secondary-hypertrophy', ['front-delts', 'side-delts']),
    slot('elbow-flexion', 'isolation', ['biceps']),
    slot('elbow-extension', 'isolation', ['triceps']),
  ],
};

export const TEMPLATES: readonly Template[] = [PUSH_ARMS, PULL_ARMS, LOWER, UPPER, FULL_BODY];

/**
 * The templates the plan rotates (the split), by the sessions a week (Maintenance 27, item 46, and
 * its review). At equal weekly sets the split itself hardly matters (Schoenfeld et al. 2019, PMID
 * 30558493; Ramos-Campo et al. 2024, PMID 38595233). From four days, push, pull, lower and upper
 * (full body too for a strength goal); at three or fewer, and for a new lifter (Foundation), full
 * body, upper and lower rotate as before item 46: full body alone at one or two days left calves,
 * abs, side delts and upper chest with no direct sets at all.
 */
export function splitFor(profile: UserProfile): readonly Template[] {
  const style = resolveStyle(profile);
  const strengthGoal = profile.goals.primary === 'strength' || style === 'strength-focus';
  return profile.schedule.weeklyFrequency <= 3 || style === 'foundation'
    ? [FULL_BODY, UPPER, LOWER]
    : strengthGoal
      ? [FULL_BODY, LOWER, UPPER, PUSH_ARMS, PULL_ARMS]
      : [PUSH_ARMS, PULL_ARMS, LOWER, UPPER];
}

/**
 * The slots that can carry a muscle in a catch-up, in order: the split's that lead with it, the
 * split's that train it (the glutes ride with the squat), then a movement of the catalog whose lifts
 * lead with it, as a hypertrophy slot of its own (the hip thrust for the glutes: the second review
 * of round M).
 */
function slotsFor(profile: UserProfile, muscle: MuscleId): Slot[] {
  const slots = splitFor(profile).flatMap((template) => template.slots);
  const split = [
    ...slots.filter((candidate) => candidate.muscles[0] === muscle),
    ...slots.filter(
      (candidate) => candidate.muscles[0] !== muscle && candidate.muscles.includes(muscle),
    ),
  ];
  const known = new Set(split.map((candidate) => candidate.pattern));
  const leading = allExercises()
    .filter((exercise) => exercise.primaryMuscles[0] === muscle)
    .map((exercise) => exercise.movementPattern);
  return [
    ...split,
    ...[...new Set(leading)]
      .filter((pattern) => !known.has(pattern))
      .map((pattern) => slot(pattern, 'secondary-hypertrophy', [muscle])),
  ];
}

/**
 * A muscle's own slot in the lifter's split: the first that leads with it, else the first that
 * trains it (the glutes ride with the squat). With `usable`, the first of those with a lift for the
 * muscle that it takes comes first: with the quads resting today, the glutes go with the hinge
 * rather than the squat (the review of round M), and with every lift of the split for it out, a
 * movement that leads with it (the second review). None for a muscle no slot names.
 */
function slotFor(
  profile: UserProfile,
  muscle: MuscleId,
  usable?: (exercise: CatalogExercise) => boolean,
): Slot | undefined {
  const trains = slotsFor(profile, muscle);
  const takes = (candidate: Slot) =>
    exercisesByPattern(candidate.pattern).some(
      (exercise) => exercise.primaryMuscles.includes(muscle) && (usable?.(exercise) ?? true),
    );
  return (usable ? trains.find(takes) : undefined) ?? trains[0];
}

/**
 * A muscle's usual working sets in one of the plan's sessions: the most any template of the split
 * gives the slots that train it, at their roles' sets under the lifter's style. A catch-up never
 * gives a muscle more, and a second workout gives a muscle trained today only what is left of it
 * (Maintenance 31, docs/research/catch-up-and-second-workout.md).
 */
export function sessionDose(profile: UserProfile, muscle: MuscleId): number {
  return Math.max(0, ...splitFor(profile).map((template) => setsIn(profile, template, muscle)));
}

/** A muscle's working sets in one template: its slots' roles' sets under the lifter's style. */
function setsIn(profile: UserProfile, template: Template, muscle: MuscleId): number {
  return template.slots
    .filter((candidate) => candidate.muscles.includes(muscle))
    .reduce((sum, candidate) => {
      const exercise = exercisesByPattern(candidate.pattern)[0];
      return exercise ? sum + prescribe(exercise, candidate.role, profile).sets : sum;
    }, 0);
}

/**
 * A muscle's working sets in the session of this template: what a second workout reads what is left
 * of from, so a full first session of it leaves nothing (the review of round M). The usual sets, as
 * `sessionDose`, after a catch-up or a workout of no template.
 */
export function templateDose(
  profile: UserProfile,
  templateId: string | null | undefined,
  muscle: MuscleId,
): number {
  const template = TEMPLATES.find((candidate) => candidate.id === templateId);
  return template ? setsIn(profile, template, muscle) : sessionDose(profile, muscle);
}

/**
 * A muscle's sets in the day's first workout as it was planned, what a second workout reads what is
 * left of (the reviews of round M): the sets it was to have, each counted as the week counts the
 * sets done, a lift that works it only secondarily at half (the third review: the lower day's front
 * squat left the glutes a "remainder" the squat's slot named). A workout done in full leaves nothing,
 * one cut short what it did not do, and a deload day or a shorter session no more than it planned.
 */
export function firstSessionDose(
  profile: UserProfile,
  record: Pick<WorkoutRecord, 'entries'> | undefined,
  muscle: MuscleId,
): number {
  if (!record) return sessionDose(profile, muscle);
  return record.entries.reduce((sum, entry) => {
    const exercise = getExercise(entry.exerciseId);
    const weight = exercise?.primaryMuscles.includes(muscle)
      ? 1
      : exercise?.secondaryMuscles.includes(muscle)
        ? INDIRECT_SET_WEIGHT
        : 0;
    const planned = entry.plannedSets ?? entry.sets.filter((set) => set.kind === 'working').length;
    return sum + weight * planned;
  }, 0);
}

const CATCH_UP_TITLES: Record<CatchUpSpec['kind'], { id: string; title: string }> = {
  'catch-up': { id: CATCH_UP_TEMPLATE_IDS['catch-up'], title: 'Catch-up' },
  second: { id: CATCH_UP_TEMPLATE_IDS.second, title: 'Second workout' },
};

/**
 * The day's offer as the workout was built from it (Maintenance 31): one with no lift left, each
 * working a muscle that rests today, was planned as with nothing behind, and is kept so.
 */
export function builtCatchUp(spec: CatchUpSpec, workout: Pick<GeneratedWorkout, 'templateId'>) {
  return spec.muscles.length > 0 && workout.templateId !== CATCH_UP_TITLES[spec.kind].id
    ? { ...spec, muscles: [] }
    : spec;
}

/**
 * A saved second workout loaded on another day than it was saved (the twenty-fourth review of round
 * M): a second workout is the day trained's, and says nothing of a day trained on any other. One
 * built from its muscles is a catch-up of them there, laid out as it was, at the doses it had, with
 * nothing sitting out; one laid out on the split's day, as with nothing behind, is that day's plan
 * (loaded as itself, it said that what was trained the day it was saved sat out today, and refused
 * a swap for it).
 */
export function secondOnAnotherDay(
  spec: CatchUpSpec,
  workout: GeneratedWorkout,
): { spec: CatchUpSpec | null; workout: GeneratedWorkout } {
  const reasons = workout.explanation.reasons;
  if (workout.templateId !== CATCH_UP_TITLES.second.id) {
    return {
      spec: null,
      workout: {
        ...workout,
        title:
          TEMPLATES.find((template) => template.id === workout.templateId)?.title ?? workout.title,
        explanation: {
          ...workout.explanation,
          reasons: reasons.filter((line) => !CATCH_UP_LINE.test(line)),
        },
      },
    };
  }
  const caught: CatchUpSpec = {
    kind: 'catch-up',
    muscles: spec.muscles.map((item) => ({ ...item, why: 'behind' })),
    sitOut: [],
  };
  const { id, title } = CATCH_UP_TITLES['catch-up'];
  // Every line that names the session by its layout's title names the catch-up's, as its own
  // rebuild writes it (the twenty-fifth review of round M: "a second workout session", "second
  // workout today" stayed; the twenty-sixth: "Second workout muscles are the freshest available").
  const second = CATCH_UP_TITLES.second.title;
  const named = (line: string) =>
    line.replaceAll(second, title).replaceAll(second.toLowerCase(), title.toLowerCase());
  return {
    spec: caught,
    workout: {
      ...workout,
      templateId: id,
      title,
      explanation: {
        ...workout.explanation,
        summary: workout.explanation.summary.replace(
          `${CATCH_UP_TITLES.second.title}: `,
          `${title}: `,
        ),
        reasons: withCatchUpLines(reasons, caught, workout.blocks).map(named),
      },
    },
  };
}

/**
 * What the day's catch-up or second workout asks of a lift (the second review of round M): no more
 * sets than the fewest any of its muscles in the plan is given, no less reserve than the most any of
 * them asks. None for a lift that works none of them, or a day of the plan.
 */
export function catchUpHold(
  spec: CatchUpSpec | null,
  exercise: Pick<CatalogExercise, 'primaryMuscles'>,
): { sets: number; minRir: number } | null {
  const items = (spec?.muscles ?? []).filter((item) =>
    exercise.primaryMuscles.includes(item.muscle),
  );
  if (items.length === 0) return null;
  return {
    sets: Math.min(...items.map((item) => item.sets)),
    minRir: Math.max(...items.map((item) => item.minRir)),
  };
}

/**
 * The day's offer where the day is off the plan, as the plan was built: a catch-up built from what
 * is behind, or any second workout, nothing behind or not, the full session not taken (the
 * sixteenth review of round M: the generator, the coach and Today plan a second workout with
 * nothing behind off the plan, and the engine read it as a day of the plan). Null on a day of the
 * plan.
 */
export function offPlanSpec(
  constraints: { catchUp?: CatchUpSpec | null; fullSession?: boolean },
  workout: Pick<GeneratedWorkout, 'templateId'>,
): CatchUpSpec | null {
  const stored = constraints.catchUp;
  if (!stored || constraints.fullSession) return null;
  const spec = builtCatchUp(stored, workout);
  return spec.kind === 'second' || spec.muscles.length > 0 ? spec : null;
}

/**
 * Whether two of a day's offers build the same plan (the third review of round M): the split's own
 * session, or the same catch-up or second workout for the same muscles in the same order, whose
 * slots are the same. A save that changes it builds the plan whole: a lift kept in a slot of one
 * would take another's slot of the same number.
 */
export function sameOffer(
  a: { catchUp?: CatchUpSpec | null; fullSession?: boolean },
  b: { catchUp?: CatchUpSpec | null; fullSession?: boolean },
): boolean {
  return offerKey(a) === offerKey(b);
}

/** A day's offer in one word (`sameOffer`): empty for the split's own session. */
export function offerKey(constraints: {
  catchUp?: CatchUpSpec | null;
  fullSession?: boolean;
}): string {
  const spec = constraints.fullSession ? null : (constraints.catchUp ?? null);
  if (!spec || (spec.kind === 'catch-up' && spec.muscles.length === 0)) return '';
  return [spec.kind, ...spec.muscles.map((item) => item.muscle)].join(' ');
}

/**
 * The layouts the plan for today's offer leaves empty (`GenerationConstraints.emptiedLayouts`): those
 * the lifter's hand emptied for the offer the constraints hold, none during the full session (the
 * nineteenth and twentieth reviews of round M). Another offer's marks stay, for that offer.
 */
export function emptiedLayoutsFor(constraints: {
  catchUp?: CatchUpSpec | null;
  fullSession?: boolean;
  emptied?: readonly EmptiedPlan[];
}): { emptiedLayouts?: string[] } {
  const spec = constraints.fullSession ? null : (constraints.catchUp ?? null);
  if (!spec) return {};
  const offer = offerKey(constraints);
  const layouts = (constraints.emptied ?? [])
    .filter((plan) => plan.offer === offer)
    .map((plan) => plan.layout);
  return layouts.length > 0 ? { emptiedLayouts: layouts } : {};
}

/**
 * The plans the lifter emptied today, as the day holds them: its own marks, kept aside while a saved
 * workout loaded stands in for its plan (`dayChoices`), with those made on the loaded plan for an
 * offer and layout the day has none of (the twenty-third review of round M).
 */
export function marksOfDay(
  kept: readonly EmptiedPlan[],
  own: readonly EmptiedPlan[],
): EmptiedPlan[] {
  const fresh = own.filter(
    (plan) => !kept.some((other) => other.offer === plan.offer && other.layout === plan.layout),
  );
  return [...kept, ...fresh].map((plan) => ({ ...plan }));
}

/**
 * The muscles today's catch-up or second workout leaves alone, as the plan was built from it: none
 * once the full session is taken. The coach offers no work for one, and a rebuild's swap brings in
 * no lift for one, as the plan itself has none (the review of round M).
 */
export function restingInPlan(
  constraints: { catchUp?: CatchUpSpec | null; fullSession?: boolean },
  workout: Pick<GeneratedWorkout, 'templateId'>,
  history: readonly WorkoutRecord[],
  now: string,
): Set<MuscleId> {
  const stored = constraints.catchUp;
  if (!stored || constraints.fullSession) return new Set();
  return restingMuscles(
    builtCatchUp(stored, workout),
    computeExposure(history, now).daysSinceMuscle,
  );
}

/**
 * The session a catch-up or a second workout is built from (Maintenance 31): each muscle's own slot
 * with its sets and reserve, one slot for muscles that share one. What was missed leads, then what is
 * left of today's work (item 32: the ninth review of round M), each with its strength slots first,
 * where a lift gains most (Nunes et al. 2021), then in the order the muscles lead.
 */
function catchUpTemplate(
  profile: UserProfile,
  spec: CatchUpSpec,
  usable: (exercise: CatalogExercise) => boolean,
): Template {
  const slots: Slot[] = [];
  // Whether one lift of a movement, there today, works all these muscles directly.
  const oneLift = (pattern: Slot['pattern'], muscles: readonly MuscleId[]) =>
    exercisesByPattern(pattern).some(
      (exercise) =>
        usable(exercise) && muscles.every((muscle) => exercise.primaryMuscles.includes(muscle)),
    );
  for (const item of spec.muscles) {
    const own = slotFor(profile, item.muscle, usable);
    if (!own) continue;
    const shared = slots.find(
      (candidate) =>
        candidate.pattern === own.pattern &&
        oneLift(candidate.pattern, [...candidate.muscles, item.muscle]),
    );
    if (shared) {
      // Muscles that share a lift share its slot: the lift takes the fewest sets either has left
      // and the most reserve either asks (the budget in generateWorkout, the review of round M).
      if (!shared.muscles.includes(item.muscle)) shared.muscles.push(item.muscle);
      continue;
    }
    // A slot of its own, for the catch-up's muscle alone: the squat for the glutes is no slot for the
    // quads. With no lift there for both, it is the movement's second: a wrist curl for the forearms
    // and a curl for the biceps (the third review of round M).
    slots.push({ ...own, muscles: [item.muscle], sets: item.sets, minRir: item.minRir });
  }
  const strength = (candidate: Slot) => restCategory(candidate.role) === 'strength';
  const missed = (candidate: Slot) =>
    candidate.muscles.some(
      (muscle) => spec.muscles.find((item) => item.muscle === muscle)?.why === 'behind',
    );
  const group = (isMissed: boolean) => slots.filter((candidate) => missed(candidate) === isMissed);
  return {
    ...CATCH_UP_TITLES[spec.kind],
    muscles: spec.muscles.map((item) => item.muscle),
    slots: [true, false].flatMap((isMissed) => [
      ...group(isMissed).filter(strength),
      ...group(isMissed).filter((candidate) => !strength(candidate)),
    ]),
    strengthPriority: false,
  };
}

/** A catch-up slot's sets and reserve over the role's own: never more sets, never less reserve. */
function withinCatchUp(
  prescription: Prescription,
  slotSpec: Pick<Slot, 'sets' | 'minRir'>,
): Prescription {
  return {
    ...prescription,
    sets: Math.min(prescription.sets, slotSpec.sets ?? prescription.sets),
    rir: Math.max(prescription.rir, slotSpec.minRir ?? 0),
  };
}

/** A count of exercises in words: "1 exercise", "3 exercises" (the thirteenth review of round M). */
export function exercisesCount(count: number): string {
  return `${count} ${count === 1 ? 'exercise' : 'exercises'}`;
}

/** The muscles, in words: "chest", "chest and biceps", "chest, side delts and biceps". */
export function musclesInWords(muscles: readonly MuscleId[]): string {
  const names = muscles.map((muscle) => muscleName(muscle).toLowerCase());
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What "Why this workout" says of a catch-up or a second workout (Maintenance 31): only the muscles
 * a lift went in for. One whose every lift works a muscle that rests today waits for the week's own
 * sessions.
 */
function catchUpLines(spec: CatchUpSpec, blocks: readonly WorkoutBlock[]): string[] {
  const covered = new Set(allEntries(blocks).flatMap((entry) => entry.chosenFor));
  const named = (why: CatchUpMuscle['why']) =>
    spec.muscles
      .filter((item) => item.why === why && covered.has(item.muscle))
      .map((item) => item.muscle);
  const behind = named('behind');
  const left = named('remainder');
  const lines: string[] = [];
  if (spec.kind === 'catch-up') {
    if (behind.length > 0) {
      lines.push(
        `A catch-up for what this week still lacks: ${musclesInWords(behind)}, a few sets each and none to failure.`,
      );
    }
    return lines;
  }
  if (behind.length > 0) {
    lines.push(`A second workout today: it leads with what you missed, ${musclesInWords(behind)}.`);
  }
  if (left.length > 0) {
    lines.push(
      `${musclesInWords(left).replace(/^./, (first) => first.toUpperCase())} ${left.length === 1 ? muscleVerb(left[0]!, 'takes', 'take') : 'take'} only what is left of one session, three or more reps short of failure.`,
    );
  }
  if (spec.sitOut.length > 0) {
    lines.push(
      `${musclesInWords(spec.sitOut).replace(/^./, (first) => first.toUpperCase())}, trained today, ${spec.sitOut.length === 1 ? muscleVerb(spec.sitOut[0]!, 'sits', 'sit') : 'sit'} out.`,
    );
  }
  return lines;
}

/** A lift's line for the sets the week's need gave it (Maintenance 34). */
const CARRIED_LINE = /^(?:A set|\d+ sets) more for the .+, which this week is short of\.$/;

/**
 * What the time fit cut in the latest sessions (Maintenance 34, the approved proposal: "Carry
 * forward what keeps getting cut. Store what the time fit left out of each workout. A muscle cut
 * last time is protected next time. If a muscle is cut twice running, trim a set from an already
 * well-covered muscle instead ... Rotate which isolation move goes, so no muscle loses every short
 * day"): for each muscle, in how many of the latest sessions running, newest first, the fit cut
 * it, up to two. A session from before the record kept it cut nothing.
 */
export function cutRunning(
  history: readonly WorkoutRecord[],
  now: string,
): Map<MuscleId, number> {
  const latest = history
    .filter((record) => record.startedAt <= now && trainedIn(record))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, RULES.cutRunning.value);
  const levels = new Map<MuscleId, number>();
  for (const muscle of MUSCLE_IDS) {
    let level = 0;
    for (const record of latest) {
      if (!(record.fitCut ?? []).includes(muscle)) break;
      level += 1;
    }
    if (level > 0) levels.set(muscle, level);
  }
  return levels;
}

/** Each muscle's direct working sets in these entries: the sets the time fit can cut. */
function directSets(
  entries: readonly WorkoutEntry[],
  exerciseOf: (id: string) => CatalogExercise,
): Map<MuscleId, number> {
  const sets = new Map<MuscleId, number>();
  for (const entry of entries) {
    const working = entry.sets.filter((set) => set.kind === 'working').length;
    for (const muscle of exerciseOf(entry.exerciseId).primaryMuscles) {
      sets.set(muscle, (sets.get(muscle) ?? 0) + working);
    }
  }
  return sets;
}

/** A line `catchUpLines` writes. */
const CATCH_UP_LINE =
  /^A catch-up for what this week still lacks: |^A second workout today: | takes? only what is left of one session, three or more reps short of failure\.$|, trained today, sits? out\.$/;

/**
 * "Why this workout" with the catch-up's lines made true of the blocks as a change in place leaves
 * them (the thirteenth review of round M: a swap, a lift left out or skipped, left the line naming a
 * muscle no lift went in for any more). They lead, as the plan's own do.
 */
export function withCatchUpLines(
  reasons: readonly string[],
  spec: CatchUpSpec,
  blocks: readonly WorkoutBlock[],
): string[] {
  return [...catchUpLines(spec, blocks), ...reasons.filter((line) => !CATCH_UP_LINE.test(line))];
}

function chooseTemplate(
  profile: UserProfile,
  priorities: MusclePriority[],
  exposure: Exposure,
  loads: Readonly<Record<MuscleId, MuscleLoad>>,
  focus: MuscleId | null = null,
): Template {
  const weightOf = new Map(priorities.map((priority) => [priority.muscle, priority.weight]));
  const style = resolveStyle(profile);
  const strengthGoal = profile.goals.primary === 'strength' || style === 'strength-focus';
  // The split by the sessions a week (item 46).
  const pool = splitFor(profile);
  const recent = exposure.recentTemplates.slice(0, 2);
  let best = pool[0] as Template;
  let bestScore = -Infinity;
  for (const template of pool) {
    const average =
      template.muscles.reduce((sum, muscle) => sum + (weightOf.get(muscle) ?? 1), 0) /
      template.muscles.length;
    const rotation = recent.includes(template.id) ? -0.35 : 0;
    const strengthBonus = strengthGoal && template.strengthPriority ? 0.15 : 0;
    // Week awareness: muscles trained in the last two days count against a template,
    // muscles behind their weekly target count for it.
    const weekTerm =
      template.muscles.reduce((sum, muscle) => {
        const days = exposure.daysSinceMuscle[muscle];
        return (
          sum +
          (days !== undefined && days < 2 ? -0.25 : 0) +
          (loads[muscle] === 'behind' ? 0.15 : 0)
        );
      }, 0) / template.muscles.length;
    // A coach focus tips the choice toward a template that trains the muscle.
    const focusTerm = focus !== null && template.muscles.includes(focus) ? 0.4 : 0;
    const score = average + rotation + strengthBonus + weekTerm + focusTerm;
    if (score > bestScore + 1e-9) {
      best = template;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The conflict context for a profile at a place with this session's extra
 * constraints applied: busy equipment removed, session pain joints added, and
 * avoided exercises treated like dislikes.
 */
export function sessionConflictContext(
  profile: UserProfile,
  location: LocationProfile | undefined,
  constraints: Pick<
    GenerationConstraints,
    'excludeExerciseIds' | 'unavailableEquipment' | 'painJoints'
  > = {},
): ConflictContext {
  const base = buildConflictContext(profile, location);
  const unavailable = new Set(constraints.unavailableEquipment ?? []);
  const painAreas = [
    ...new Set([...profile.limitations.painAreas, ...(constraints.painJoints ?? [])]),
  ];
  return {
    ...base,
    availableEquipment: new Set([...base.availableEquipment].filter((id) => !unavailable.has(id))),
    limitations: { ...profile.limitations, painAreas },
    dislikedIds: new Set([...(base.dislikedIds ?? []), ...(constraints.excludeExerciseIds ?? [])]),
  };
}

export interface Picker {
  context: ConflictContext;
  preferredIds: ReadonlySet<string>;
  exposure: Exposure;
  loads: Readonly<Record<MuscleId, MuscleLoad>>;
  focus: MuscleId | null;
  /** Exercises a lasting swap took out of this plan: no other slot picks them back in. */
  excluded?: ReadonlySet<string>;
  /** Bodyweight moves the lifter has outgrown: their loaded versions take their place (item 31). */
  outgrown?: ReadonlyMap<string, OutgrownBy>;
  /** Exercises a lasting swap took out: a bodyweight move among them stays the plan's own pick. */
  swappedAway?: ReadonlySet<string>;
  /**
   * Exercises the lifter chose beyond the favourites: each kept swap's own exercise, and the lift to
   * push while its push runs. The rule never holds one back (the fourth and fifth re-checks).
   */
  chosen?: ReadonlySet<string>;
  /**
   * Muscles a catch-up or a second workout leaves alone (Maintenance 31): no pick works one of them
   * directly.
   */
  resting?: ReadonlySet<MuscleId>;
  /**
   * The muscles a catch-up's slot is for, still short of their sets (the third review of round M):
   * its pick works one of them directly, one that works more of them first.
   */
  trains?: ReadonlySet<MuscleId>;
}

/** Whether an exercise works a muscle that rests today directly. */
const worksResting = (exercise: CatalogExercise, picker: Picker): boolean =>
  exercise.primaryMuscles.some((muscle) => picker.resting?.has(muscle) ?? false);

/** How many of the muscles a catch-up's slot is for an exercise works directly. */
const covers = (exercise: CatalogExercise, trains: ReadonlySet<MuscleId> | undefined): number =>
  exercise.primaryMuscles.filter((muscle) => trains?.has(muscle) ?? false).length;

/**
 * What the lifter chose beyond the favourites: each kept swap's own exercise, and the lift to push
 * on a day its push runs (a deload week pauses it, the fifth re-check).
 */
function chosenBy(swaps: readonly LastingSwap[], push: PushDay | null): Set<string> {
  return new Set([...swaps.map((swap) => swap.to), ...(push ? [push.exercise.id] : [])]);
}

/** A favourite or another exercise the lifter chose: the loaded-version rule holds none back. */
const chosenIn = (picker: Picker): Set<string> =>
  new Set([...picker.preferredIds, ...(picker.chosen ?? [])]);

function stressPenalty(exercise: CatalogExercise): number {
  return Object.values(exercise.jointStress).reduce(
    (total, level) => total + (level === 'high' ? 2 : level === 'moderate' ? 1 : 0),
    0,
  );
}

function pickForSlot(
  slotSpec: Slot,
  chosen: readonly CatalogExercise[],
  picker: Picker,
): CatalogExercise | undefined {
  const chosenIds = new Set([...chosen.map((exercise) => exercise.id), ...(picker.excluded ?? [])]);
  const strengthRole = restCategory(slotSpec.role) === 'strength';
  const outgrown = picker.outgrown ?? new Map<string, OutgrownBy>();
  const lifterChose = chosenIn(picker);
  const candidates = exercisesByPattern(slotSpec.pattern)
    .filter((exercise) => !chosenIds.has(exercise.id))
    .filter((exercise) => (strengthRole ? exercise.compound : true))
    .filter((exercise) => !isBlocked(checkExerciseFit(exercise, picker.context)))
    .filter((exercise) => !worksResting(exercise, picker))
    .filter((exercise) => !picker.trains || covers(exercise, picker.trains) > 0)
    // A loaded version waits until its bodyweight move loads (item 31).
    .filter((exercise) => !waitsForBodyweight(exercise, outgrown, picker.swappedAway, lifterChose))
    .filter(
      (exercise) =>
        !blocksCandidate(checkWorkoutConflicts([...chosen, exercise], picker.context), exercise.id),
    );

  const candidateIds = new Set(candidates.map((exercise) => exercise.id));
  const score = (exercise: CatalogExercise) => {
    const suitability = strengthRole
      ? exercise.strengthSuitability * 10 + exercise.hypertrophySuitability
      : exercise.hypertrophySuitability * 10 + exercise.strengthSuitability;
    // A bodyweight move or its loaded version, as the lifter has outgrown it (item 31).
    const loadedRule = loadedVersionShift(exercise, candidateIds, outgrown, picker.swappedAway);
    const preferred = picker.preferredIds.has(exercise.id) ? 15 : 0;
    const days = picker.exposure.daysSinceExercise[exercise.id];
    const familiarity = days === undefined ? 0 : days < 1.5 ? -8 : days <= 21 ? 6 : 0;
    const behind = exercise.primaryMuscles.some((muscle) => picker.loads[muscle] === 'behind')
      ? 3
      : 0;
    const focus = picker.focus !== null && exercise.primaryMuscles.includes(picker.focus) ? 6 : 0;
    return (
      suitability +
      preferred +
      familiarity +
      behind +
      focus +
      loadedRule -
      stressPenalty(exercise) * 2 -
      exercise.setupSeconds / 60
    );
  };

  // A preferred exercise that fits the slot wins it outright; the score only orders the rest,
  // and preferred ones among themselves. In a catch-up, a lift for all the muscles sharing the slot
  // comes before a favourite for one of them.
  const tier = (exercise: CatalogExercise) => (picker.preferredIds.has(exercise.id) ? 1 : 0);
  candidates.sort(
    (a, b) =>
      covers(b, picker.trains) - covers(a, picker.trains) ||
      tier(b) - tier(a) ||
      score(b) - score(a) ||
      a.name.localeCompare(b.name),
  );
  return candidates[0];
}

/**
 * The coverage card's exercise: the best accessory for one muscle that fits
 * the place, the limits, and today's picks. Isolation and hypertrophy-friendly
 * moves first, low joint stress, quick to set up.
 */
export function pickAccessoryFor(
  muscle: MuscleId,
  chosen: readonly CatalogExercise[],
  picker: Picker,
): CatalogExercise | undefined {
  const chosenIds = new Set([...chosen.map((exercise) => exercise.id), ...(picker.excluded ?? [])]);
  const outgrown = picker.outgrown ?? new Map<string, OutgrownBy>();
  const lifterChose = chosenIn(picker);
  const candidates = allExercises()
    .filter((exercise) => exercise.primaryMuscles.includes(muscle))
    .filter((exercise) => !chosenIds.has(exercise.id))
    .filter((exercise) => !isBlocked(checkExerciseFit(exercise, picker.context)))
    .filter((exercise) => !worksResting(exercise, picker))
    .filter((exercise) => !waitsForBodyweight(exercise, outgrown, picker.swappedAway, lifterChose))
    .filter(
      (exercise) =>
        !blocksCandidate(checkWorkoutConflicts([...chosen, exercise], picker.context), exercise.id),
    );
  const candidateIds = new Set(candidates.map((exercise) => exercise.id));
  const score = (exercise: CatalogExercise) =>
    exercise.hypertrophySuitability * 10 +
    (exercise.compound ? 0 : 8) +
    (picker.preferredIds.has(exercise.id) ? 15 : 0) +
    // As in a slot's pick, a favourite and a kept swap's own exercise included, so the coach names
    // what the plan does (the sixth and seventh re-checks). A swap back to a bodyweight move keeps
    // every loaded version of it out, so nothing moves it down (the fifth and seventh).
    loadedVersionShift(exercise, candidateIds, outgrown, picker.swappedAway) -
    stressPenalty(exercise) * 2 -
    exercise.setupSeconds / 60;
  const tier = (exercise: CatalogExercise) => (picker.preferredIds.has(exercise.id) ? 1 : 0);
  candidates.sort(
    (a, b) => tier(b) - tier(a) || score(b) - score(a) || a.name.localeCompare(b.name),
  );
  return candidates[0];
}

/** The picker the coach needs, built without generating a workout. */
/**
 * The exercises the lifter's lasting swaps keep out of a plan here: each one swapped out whose
 * swap-in fits this place. Where the swap-in does not fit, the plan's own pick stands. A swap back
 * to a bodyweight move keeps out every loaded version of it but a favourite (the seventh and eighth
 * re-checks).
 */
export function swappedOutIds(
  swaps: readonly LastingSwap[],
  context: ConflictContext,
  favourites: ReadonlySet<string> = new Set(),
): Set<string> {
  return new Set(
    withSwapsBack(swaps, favourites)
      .filter((swap) => {
        const next = getExercise(swap.to);
        return next !== undefined && !isBlocked(checkExerciseFit(next, context));
      })
      .map((swap) => swap.from),
  );
}

const KEPT_LINE = ', the swap you chose to keep.';
const AROUND_LINE = ', which you swapped out.';

/**
 * The "Why this workout" lines for the lifter's kept swaps, read from the workout itself
 * (Maintenance 22): each entry a kept swap put in says what it stands for. One whose swap was
 * stopped since, or that the lifter swapped today, has no line.
 */
export function swapLines(
  blocks: readonly WorkoutBlock[],
  swaps: readonly LastingSwap[],
  favourites: ReadonlySet<string> = new Set(),
): string[] {
  const kept = withSwapsBack(swaps, favourites);
  return allEntries(blocks).flatMap((entry) => {
    // The swap that put this exercise in, else the first of the plan's own pick's.
    const own = kept.filter((swap) => swap.from === entry.standsFor);
    const swap = own.find((candidate) => candidate.to === entry.exerciseId) ?? own[0];
    const from = swap ? getExercise(swap.from) : undefined;
    const exercise = getExercise(entry.exerciseId);
    if (!swap || !from || !exercise || isStopped(entry) || entry.replacedFrom) return [];
    const why = swap.to === entry.exerciseId ? KEPT_LINE : AROUND_LINE;
    return [`${exercise.name} in place of ${from.name}${why}`];
  });
}

/**
 * The reasons with their lines about kept swaps made true of these blocks: stale ones out,
 * missing ones in, where the lines were or after the lines on the lead lift and what was kept.
 */
export function withSwapLines(
  reasons: readonly string[],
  blocks: readonly WorkoutBlock[],
  swaps: readonly LastingSwap[],
  favourites: ReadonlySet<string> = new Set(),
): string[] {
  const isSwapLine = (line: string) => line.endsWith(KEPT_LINE) || line.endsWith(AROUND_LINE);
  const others = reasons.filter((line) => !isSwapLine(line));
  const first = reasons.findIndex(isSwapLine);
  const lead = others.reduce(
    (last, line, index) => (isMainLiftLine(line) || line.startsWith('Kept ') ? index : last),
    Math.min(others.length, 3) - 1,
  );
  const at = first >= 0 ? first : lead + 1;
  return [...others.slice(0, at), ...swapLines(blocks, swaps, favourites), ...others.slice(at)];
}

export function accessoryPicker(input: {
  profile: UserProfile;
  location: LocationProfile | undefined;
  constraints?: Pick<
    GenerationConstraints,
    'excludeExerciseIds' | 'unavailableEquipment' | 'painJoints'
  >;
  history: readonly WorkoutRecord[];
  now: string;
  focus?: MuscleId | null;
  /** The lifter's lasting swaps: an exercise swapped out is never offered. */
  swaps?: readonly LastingSwap[];
  /** The muscles today's catch-up or second workout leaves alone: nothing is offered for one. */
  resting?: ReadonlySet<MuscleId>;
}): Picker {
  const context = sessionConflictContext(input.profile, input.location, input.constraints ?? {});
  const preferredIds = preferredIdsOf(input.profile);
  const swappedOut = swappedOutIds(input.swaps ?? [], context, preferredIds);
  return {
    context,
    preferredIds,
    exposure: computeExposure(input.history, input.now),
    loads: muscleLoads(input.history, input.profile, input.now),
    focus: input.focus ?? null,
    excluded: swappedOut,
    outgrown: outgrownMoves(input.history),
    swappedAway: swappedOut,
    // The lift to push is never the coach's offer: it adds nothing for the pushed lift's muscles.
    chosen: chosenBy(input.swaps ?? [], null),
    ...(input.resting ? { resting: input.resting } : {}),
  };
}

function entryValue(
  entry: WorkoutEntry,
  weightOf: Map<MuscleId, number>,
  preferredIds: ReadonlySet<string>,
): number {
  const muscleWeight =
    entry.chosenFor.reduce((sum, muscle) => sum + (weightOf.get(muscle) ?? 1), 0) /
    Math.max(1, entry.chosenFor.length);
  return ROLE_RANK[entry.role] + muscleWeight * 10 + (preferredIds.has(entry.exerciseId) ? 5 : 0);
}

/**
 * Secondary muscles that do not grow from a movement in controlled trials count for nothing from
 * it: the hamstrings in a squat or a hip thrust (Kubo et al. 2019, PMID 31230110; Plotkin et al.
 * 2023, PMID 37877099).
 */
const NO_INDIRECT_GROWTH: Partial<Record<MovementPatternId, readonly MuscleId[]>> = {
  squat: ['hamstrings'],
  'hip-extension': ['hamstrings'],
};

/** A main lift's set as work for one of its secondary muscles (`INDIRECT_SET_WEIGHT`). */
function indirectShare(exercise: CatalogExercise, muscle: MuscleId): number {
  return NO_INDIRECT_GROWTH[exercise.movementPattern]?.includes(muscle) ? 0 : INDIRECT_SET_WEIGHT;
}

/**
 * Each muscle's work from the main lifts among these entries, in sets: a set counts in full for a
 * lift's primary muscles and half for its secondary ones (`indirectShare`), as the weekly volume
 * counts them (Maintenance 24).
 */
export function mainLiftSets(
  entries: readonly WorkoutEntry[],
  exerciseOf: (id: string) => CatalogExercise,
): (muscle: MuscleId) => number {
  const sets = new Map<MuscleId, number>();
  const add = (muscle: MuscleId, amount: number) =>
    sets.set(muscle, (sets.get(muscle) ?? 0) + amount);
  for (const entry of entries) {
    const exercise = exerciseOf(entry.exerciseId);
    if (!exercise.compound) continue;
    const count = entry.sets.filter((set) => set.kind === 'working').length;
    for (const muscle of exercise.primaryMuscles) add(muscle, count);
    for (const muscle of exercise.secondaryMuscles)
      add(muscle, count * indirectShare(exercise, muscle));
  }
  return (muscle) => sets.get(muscle) ?? 0;
}

/**
 * How long an exercise stays when a session too long for its length must leave something out
 * (Maintenance 24, docs/research/short-sessions.md); higher stays longer. A main lift stays
 * longest (3), then lower-back work (2), then core work (1). An isolation exercise stays the
 * longer the less work its least-trained muscle gets from the day's main lifts (`trained`, in
 * sets): the day's only work for a muscle stays as long as core work, and one the main lifts
 * already train most goes first, since more sets bring less the more a muscle already has
 * (Pelland et al. 2026).
 */
export function leaveOutRank(
  exercise: CatalogExercise,
  trained: (muscle: MuscleId) => number,
): number {
  if (exercise.compound) return 3;
  if (exercise.primaryMuscles.includes('lower-back')) return 2;
  if (exercise.movementPattern.startsWith('core-')) return 1;
  return 1 / (1 + Math.min(...exercise.primaryMuscles.map(trained)));
}

export function cloneEntry(entry: WorkoutEntry): WorkoutEntry {
  return {
    ...entry,
    sets: entry.sets.map((set) => ({ ...set, targetReps: [...set.targetReps] })),
    chosenFor: [...entry.chosenFor],
  };
}

function straightBlock(
  entry: WorkoutEntry,
  exerciseOf: (id: string) => CatalogExercise,
): WorkoutBlock {
  return {
    id: `b-${entry.id}`,
    kind: 'straight',
    label: exerciseOf(entry.exerciseId).name,
    entries: [entry],
    rounds: roundsOf(entry),
    restBetweenRoundsSeconds: entry.restSeconds,
  };
}

function capFor(targetMinutes: number): number {
  if (targetMinutes <= 15) return 3;
  if (targetMinutes <= 30) return 5;
  if (targetMinutes <= 45) return 6;
  return 8;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round5 = (seconds: number) => Math.round(seconds / 5) * 5;

/** A deload week's lighter loads, applied to the target and said in its evidence. */
export function scaleForDeload(
  target: NextTarget,
  adjust: PrescriptionAdjustment | undefined,
  step: number,
): NextTarget {
  const scale = adjust?.loadScale;
  if (!scale || scale === 1 || target.weight === null) return target;
  const weight = Math.max(step, Math.round((target.weight * scale) / step) * step);
  // The estimate a target was rounded from is lighter too (Maintenance 25): at the heaviest weight
  // here it no longer asks for more than that weight when the deload takes it under.
  const exact = target.exact === undefined ? {} : { exact: target.exact * scale };
  // A light load a tenth off can round back to itself: the line only where the load is lighter.
  if (weight >= target.weight) return { ...target, ...exact };
  return { ...target, ...exact, weight, evidence: [...target.evidence, deloadLine(scale)] };
}

function deloadLine(scale: number): string {
  return `Deload week: loads ${Math.round((1 - scale) * 100)}% lighter.`;
}

/**
 * The plan's deload line in "Why this workout" (Maintenance 24): lighter loads named only while a
 * lift has them, as the lifts' own lines say; the rebuild keeps it current after any change.
 */
export function deloadReason(blocks: readonly WorkoutBlock[], deload: DeloadWindow): string {
  const lighter = allEntries(blocks).some((entry) =>
    entry.progression?.evidence.includes(deloadLine(DELOAD_LOAD_SCALE)),
  );
  const loads = lighter ? `, loads ${Math.round((1 - DELOAD_LOAD_SCALE) * 100)}% lighter` : '';
  return `Deload week (${formatWindow(deload)}): one set fewer per exercise, one more rep in reserve${loads}.`;
}

/**
 * A target on the weights here: lighter in a deload week, never under the bar, and held at the
 * heaviest weight made here. The deload's line stays only where the load it lands on is lighter
 * than the plain target's would be (Maintenance 24): held at the heaviest weight here, both are.
 */
export function targetAtPlace(
  target: NextTarget,
  adjust: PrescriptionAdjustment | undefined,
  loading: Loading,
  floor: number | null,
  units: UnitSystem,
  role: TrainingRole,
): NextTarget {
  const fitted = capTarget(
    floorTarget(scaleForDeload(target, adjust, loading.step), floor),
    loading,
    units,
    role,
  );
  const scale = adjust?.loadScale;
  if (!scale || scale === 1 || fitted.weight === null) return fitted;
  const plain = capTarget(floorTarget(target, floor), loading, units, role).weight;
  // Judged on the weights the place shows: two loads that land on the same one are not lighter.
  const shown = (weight: number) => fitWeight(weight, loading, floor);
  if (plain === null || shown(fitted.weight) < shown(plain) - 1e-6) return fitted;
  return { ...fitted, evidence: fitted.evidence.filter((line) => line !== deloadLine(scale)) };
}

/** A deload can scale a bar lift under the empty bar; the bar is the floor. */
export function floorTarget(target: NextTarget, floor: number | null): NextTarget {
  if (floor === null || target.weight === null || target.weight >= floor) return target;
  return { ...target, weight: floor };
}

/**
 * The day's settings and a deload week on a prescription, as the plan applies them to every pick
 * (Maintenance 24). The rebuild reads a lift's planned sets and effort from the same rule.
 */
export function prescriptionForDay(
  prescription: Prescription,
  role: TrainingRole,
  day: PrescriptionAdjustment | undefined,
  deload: DeloadWindow | null,
  minRir = 0,
): Prescription {
  return adjustPrescription(prescription, role, withDeload(day, deload), minRir);
}

/** The day's settings with a deload week's own on top: a set fewer, a rep more, lighter loads. */
function withDeload(
  day: PrescriptionAdjustment | undefined,
  deload: DeloadWindow | null,
): PrescriptionAdjustment | undefined {
  return deload
    ? {
        sets: (day?.sets ?? 0) + DELOAD_SETS_DELTA,
        rir: (day?.rir ?? 0) + DELOAD_RIR_DELTA,
        restFactor: day?.restFactor ?? 1,
        loadScale: DELOAD_LOAD_SCALE,
        ...(day?.rirFloor !== undefined ? { rirFloor: day.rirFloor } : {}),
      }
    : day;
}

/**
 * The fewest working sets the day's settings leave a lift (Maintenance 24): three on a main
 * strength lift, two on any other. A hard start's ease keeps to it too (Maintenance 26, the sixth
 * pass of item 42).
 */
export function setFloor(role: TrainingRole): number {
  return role === 'primary-strength' ? 3 : 2;
}

function adjustPrescription(
  prescription: Prescription,
  role: TrainingRole,
  adjust: PrescriptionAdjustment | undefined,
  /** The exercise's `rirFloor`: harder never takes it under this. */
  minRir = 0,
): Prescription {
  if (!adjust) return prescription;
  const floor = setFloor(role);
  return {
    ...prescription,
    sets: clamp(prescription.sets + adjust.sets, floor, 5),
    rir: clamp(prescription.rir + adjust.rir, Math.max(minRir, dayRirFloor(adjust)), 4),
    restSeconds: Math.max(
      MIN_REST_SECONDS[restCategory(role)],
      round5(prescription.restSeconds * adjust.restFactor),
    ),
  };
}

/** A catch-up's or a second workout's template takes no place in the split's rotation (round M). */
const OFF_ROTATION_IDS: ReadonlySet<string> = new Set(Object.values(CATCH_UP_TEMPLATE_IDS));

/** Whether a record is a catch-up or a second workout. */
const offRotation = (record: WorkoutRecord) =>
  typeof record.templateId === 'string' && OFF_ROTATION_IDS.has(record.templateId);

/**
 * The template a day would get from this history (the choice `generateWorkout` makes). The split's
 * rotation is chosen as if no catch-up or second workout was done: "the next planned day plans as if
 * the catch-up had held none of the split's sessions" (item 12; the fresh review before shipping:
 * a catch-up's muscles moved Thursday from pull to upper). Its lifts still read every record, the
 * 48-hour rule among them.
 */
function templateFor(
  profile: UserProfile,
  history: readonly WorkoutRecord[],
  now: string,
  focus: MuscleId | null,
): Template {
  const rotation = history.filter((record) => !offRotation(record));
  const volume = computeWeeklyVolume(rotation, now);
  const exposure = computeExposure(rotation, now);
  const priorities = computeMusclePriorities(profile, volume, exposure);
  return chooseTemplate(profile, priorities, exposure, muscleLoads(rotation, profile, now), focus);
}

/**
 * The extra's own prescription before the day's settings: the style's strength range, an
 * undulating plan's heavy day (Maintenance 27, item 44).
 */
export function extraBase(exercise: CatalogExercise, profile: UserProfile): Prescription {
  const style = resolveStyle(profile);
  return prescribe(exercise, 'primary-strength', profile, {
    style,
    ...(style === 'undulating' ? { zone: 'heavy' as const } : {}),
  });
}

/**
 * The lift to push's prescription for the day (Maintenance 27, item 44), one rule for a fresh plan
 * and for a kept lift a change of the day's settings reaches (the re-check): the extra at the
 * push's sets, an easier day taking one off and a harder one adding none, never under two; the
 * lift in its own place at the push's sets for it, the day's change on them and never above them;
 * either never to failure.
 */
export function pushedPrescription(
  push: Pick<PushDay, 'extraSets' | 'naturalSets'>,
  mark: PushMark,
  own: Prescription,
  role: TrainingRole,
  adjust: PrescriptionAdjustment | undefined,
  minRir: number,
): Prescription {
  if (mark === 'extra') {
    const adjusted = adjustPrescription(own, role, adjust, minRir);
    const sets = push.extraSets ?? own.sets;
    return {
      ...adjusted,
      sets: clamp(sets + Math.min(0, adjust?.sets ?? 0), 2, sets),
      rir: Math.max(dayRirFloor(adjust), pushRir(adjusted.rir)),
    };
  }
  const base = { ...own, sets: Math.min(own.sets, push.naturalSets) };
  const day = adjustPrescription(base, role, adjust, minRir);
  return {
    ...day,
    sets: Math.min(day.sets, Math.max(base.sets, 2)),
    rir: Math.max(dayRirFloor(adjust), pushRir(day.rir)),
  };
}

/** Whether an exercise trains one of a lift's primary muscles as one of its own. */
const sharesPrimary = (exercise: CatalogExercise, lift: CatalogExercise) =>
  exercise.primaryMuscles.some((muscle) => lift.primaryMuscles.includes(muscle));

/** Under a style that keeps the lift off its heavy range, the extra is not called heavy. */
const heavyExtra = (profile: UserProfile) =>
  !['high-rep', 'foundation'].includes(resolveStyle(profile));

/**
 * A plan as if done as planned, for looking ahead: its working sets, and the lift to push's extra
 * exposure with the sets it would have, if any (Maintenance 27, item 44).
 */
function plannedRecord(
  workout: Pick<GeneratedWorkout, 'locationId' | 'templateId'> & {
    blocks: readonly WorkoutBlock[];
  },
  now: string,
  extra: { exerciseId: string; sets: number } | null,
): WorkoutRecord {
  const done = (count: number) =>
    Array.from({ length: count }, () => ({
      kind: 'working' as const,
      reps: 1,
      weight: null,
      rir: null,
      completed: true,
    }));
  return {
    id: `planned-${now}`,
    startedAt: now,
    completedAt: now,
    locationId: workout.locationId,
    templateId: workout.templateId,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      ...(extra
        ? [{ exerciseId: extra.exerciseId, push: 'extra' as const, sets: done(extra.sets) }]
        : []),
      ...allEntries(workout.blocks).map((entry) => ({
        exerciseId: entry.exerciseId,
        ...(pushMarkOf(entry) ? { push: pushMarkOf(entry) } : {}),
        sets: done(entry.sets.filter((set) => set.kind === 'working').length),
      })),
    ],
  };
}

/** The id the probe gives the extra exposure it weighs: never an entry's. */
const PROBE_EXTRA_ID = 'push-extra';

/** Entries as the push's cap counts them: an isolation lift's sets may come off unless kept. */
function plannedWork(entries: readonly WorkoutEntry[], kept: ReadonlySet<string>): PlannedWork[] {
  return entries.map((entry) => ({
    id: entry.id,
    exerciseId: entry.exerciseId,
    workingSets: entry.sets.filter((set) => set.kind === 'working').length,
    dropSets: entry.sets.filter((set) => set.kind === 'drop').length,
    trimmable:
      !kept.has(entry.id) &&
      !entry.locked &&
      !entry.pinned &&
      !isStopped(entry) &&
      restCategory(entry.role) === 'isolation',
  }));
}

/**
 * The sessions the schedule has in the six days after today, as the plan would build them, each
 * done as planned before the next and none with an extra of its own (the review of item 44): what
 * the push's cap reads of the days after the extra.
 */
function sessionsAhead(input: GenerationInput, history: readonly WorkoutRecord[]): WorkAhead[] {
  const out: WorkAhead[] = [];
  let past: WorkoutRecord[] = [...history];
  const swaps = input.constraints?.swaps;
  const focus = input.constraints?.focusMuscle;
  for (const day of sessionDaysAhead(input.profile, input.now)) {
    // Calendar days on the device, and the coach focus every plan gets (the re-check of item 44).
    const at = addLocalDays(input.now, day);
    const workout = generateWorkout({
      profile: input.profile,
      location: input.location,
      history: past,
      now: at,
      duration: 'default',
      maxes: input.maxes ?? null,
      resets: input.resets ?? null,
      constraints: {
        pushProbe: true,
        ...(swaps ? { swaps } : {}),
        ...(focus ? { focusMuscle: focus } : {}),
      },
    });
    out.push({
      day,
      work: allEntries(workout.blocks).map((entry) => ({
        exerciseId: entry.exerciseId,
        workingSets: entry.sets.filter((set) => set.kind === 'working').length,
        dropSets: entry.sets.filter((set) => set.kind === 'drop').length,
      })),
    });
    past = [...past, plannedRecord(workout, at, null)];
  }
  return out;
}

/**
 * What the plan says of the lifter's own pace, when it moves the plan's minutes (item 4): the pace
 * as Settings reads it, and how far plans go when that is further (the review of item 4).
 */
export function paceReason(pace: Pick<PersonalPace, 'ratio' | 'factor'>): string | null {
  if (pace.factor === 1 || pace.ratio === null) return null;
  const share = Math.round(Math.abs(pace.ratio - 1) * 100);
  if (share < 2) return null;
  const line = `Fitted at your own pace: your workouts take about ${share}% ${pace.ratio > 1 ? 'longer' : 'less time'} than the plan's own estimate`;
  if (pace.factor === pace.ratio) return `${line}.`;
  return pace.ratio > 1
    ? `${line}, and plans move no further than ${Math.round((PACE.FACTOR_HIGH - 1) * 100)}% longer.`
    : `${line}, and plans move no further than ${Math.round((1 - PACE.FACTOR_LOW) * 100)}% shorter.`;
}

/** Whether a line of "Why this workout" is the one about the lifter's own pace. */
export function isPaceLine(line: string): boolean {
  return line.startsWith('Fitted at your own pace:');
}

/** A plan with one more line in "Why this workout", after the main lift's. */
function withReason(workout: GeneratedWorkout, line: string): GeneratedWorkout {
  const reasons = [...workout.explanation.reasons];
  const after = reasons.map((reason) => isMainLiftLine(reason)).lastIndexOf(true);
  reasons.splice(after >= 0 ? after + 1 : Math.min(3, reasons.length), 0, line);
  return { ...workout, explanation: { ...workout.explanation, reasons } };
}

export function generateWorkout(input: GenerationInput): GeneratedWorkout {
  const { profile, location, history, now, duration } = input;
  const constraints = input.constraints ?? {};
  const maxes = input.maxes ?? null;
  const exerciseOf = (id: string) => requireExercise(id);
  const context = sessionConflictContext(profile, location, constraints);
  const preferredIds = preferredIdsOf(profile);
  const volume = computeWeeklyVolume(history, now);
  const exposure = computeExposure(history, now);
  const priorities = computeMusclePriorities(profile, volume, exposure);
  const weightOf = new Map(priorities.map((priority) => [priority.muscle, priority.weight]));
  const loads = muscleLoads(history, profile, now);
  const focus = constraints.focusMuscle ?? null;
  const spec = constraints.catchUp ?? null;
  const catchUp = spec && spec.muscles.length > 0 ? spec : null;
  // What the catch-up or second workout leaves alone: no lift today works one of them directly.
  const resting = restingMuscles(spec, exposure.daysSinceMuscle);
  // A day off the plan: a catch-up built, or any second workout. The lift to push waits for a
  // planned day, and nothing goes to failure (the review of round M).
  const offPlan = catchUp !== null || spec?.kind === 'second';
  // No set of a day off the plan goes to failure, a lift for none of the day's muscles too (the
  // twentieth review of round M: a second workout's finisher went to failure, and so did "harder").
  const offPlanRir = offPlan ? offPlanFloor(profile) : 0;
  const closedSlots = new Set(constraints.closedSlots ?? []);
  const deload = constraints.deload ?? null;
  const adjust = withDeload(constraints.adjust, deload);
  // A lift to push (Maintenance 27, item 44): it takes the place the plan has for it, or the week's
  // extra exposure when one is due, and leads. A deload week pauses it.
  const push = pushDay({ profile, history, now, deload: deload !== null });
  // Swapped out for weeks where the swap-in fits here: out of the whole plan, every slot.
  const swappedOut = swappedOutIds(constraints.swaps ?? [], context, preferredIds);
  // Swapped away today by the lifter: no slot picks one by itself (the eighteenth review of round M:
  // the lift swapped away came back once what stood in for it left).
  const away = new Set(constraints.awayIds ?? []);
  const template =
    (catchUp && constraints.catchUpSlots && constraints.catchUpSlots.length > 0
      ? {
          ...CATCH_UP_TITLES[catchUp.kind],
          muscles: catchUp.muscles.map((item) => item.muscle),
          // Each slot at the dose the offer asks now, as one laid out for it is: a save may change
          // the dose and keep the slots (the eighth review of round M).
          slots: constraints.catchUpSlots.map((candidate) => {
            const own = catchUp.muscles.find((item) => item.muscle === candidate.muscles[0]);
            return {
              ...candidate,
              muscles: [...candidate.muscles],
              ...(own ? { sets: own.sets, minRir: own.minRir } : {}),
            };
          }),
          strengthPriority: false,
        }
      : undefined) ??
    (catchUp
      ? catchUpTemplate(
          profile,
          catchUp,
          // A lift the plan never picks gives a muscle no slot, nor two muscles one to share: the
          // lift to push gives its place up off the plan, and a lift a lasting swap took out gives
          // way to its swap-in (the fourth review of round M: the back squat swapped for the front
          // squat left the quads' and the glutes' squat to a lift for the quads alone).
          (exercise) =>
            !isBlocked(checkExerciseFit(exercise, context)) &&
            !exercise.primaryMuscles.some((muscle) => resting.has(muscle)) &&
            exercise.id !== push?.exercise.id &&
            !swappedOut.has(exercise.id),
        )
      : undefined) ??
    (constraints.templateId
      ? TEMPLATES.find((candidate) => candidate.id === constraints.templateId)
      : undefined) ??
    // The split's rotation reads no catch-up or second workout (`templateFor`); with none in the
    // history the choice is the one made from today's own reading.
    (history.some(offRotation)
      ? templateFor(profile, history, now, focus)
      : chooseTemplate(profile, priorities, exposure, loads, focus));
  const pushPlace = (slots: readonly Slot[]) =>
    push !== null && slots.some((slotSpec) => slotSpec.pattern === push.exercise.movementPattern);
  // The extra exposure goes on a day with no place for the lift (docs/research/push-lift.md). It
  // waits when the next session comes within two days and has a place for the lift, which trains
  // there 48 hours after: the extra the day before would crowd it. It waits too when it would take
  // one of the lift's muscles further over its weekly cap. Today is planned without it first, to
  // see both.
  // The day's extra already in today's workout, kept through a rebuild, swapped for another
  // exercise, begun, or stopped and stood in for: the rebuild keeps it and weighs no second one
  // (the review and the re-check of item 44).
  const extraKept = (constraints.keep ?? []).some((item) => item.entry.push === 'extra');
  // The sessions after an extra's day, for its cap (the review of item 44).
  let ahead: WorkAhead[] | null = null;
  if (
    push &&
    push.extraSets !== null &&
    constraints.pushProbe === undefined &&
    !offPlan &&
    !extraKept &&
    !pushPlace(template.slots) &&
    // Weighed only where the lift can go in today (the re-check of item 44).
    !isBlocked(checkExerciseFit(push.exercise, context)) &&
    !swappedOut.has(push.exercise.id)
  ) {
    const plain = generateWorkout({ ...input, constraints: { ...constraints, pushProbe: true } });
    const waits = (why: string) =>
      withReason(plain, `No extra ${push.exercise.name} today: ${why}.`);
    const today = plannedRecord(plain, now, {
      exerciseId: push.exercise.id,
      sets: push.extraSets,
    });
    if (daysToNextSession(profile, now) < PUSH_LIFT.NEXT_SESSION_DAYS) {
      const next = addLocalDays(now, 1);
      if (pushPlace(templateFor(profile, [...history, today], next, focus).slots)) {
        return waits('the next session has its own place for it');
      }
    }
    ahead = sessionsAhead(input, [...history, today]);
    const kept = new Set((constraints.keep ?? []).map((item) => item.entry.id));
    const { over } = pushCap({
      lift: push.exercise,
      extraId: PROBE_EXTRA_ID,
      extraSets: push.extraSets,
      // Today as the extra's day plans it: no drop set for the lift's muscles (the re-check).
      planned: plannedWork(allEntries(plain.blocks), kept).map((work) =>
        sharesPrimary(exerciseOf(work.exerciseId), push.exercise) ? { ...work, dropSets: 0 } : work,
      ),
      history,
      now,
      ahead,
    });
    if (over.length > 0) {
      const names = over.map((muscle) => muscleName(muscle).toLowerCase()).join(' and ');
      const verb = over.length === 1 ? muscleVerb(over[0] as MuscleId, 'is', 'are') : 'are';
      return waits(`${names} ${verb} at the weekly cap`);
    }
  }
  const defaultMinutes = profile.schedule.typicalDurationMinutes;
  // A catch-up or second workout is the shorter session the owner asked for (item 12): the next
  // length below the Default, the muscles furthest behind first. A length the lifter picks stands.
  const targetMinutes =
    constraints.targetMinutesOverride ??
    (catchUp !== null && duration === 'default'
      ? shorterLength(defaultMinutes)
      : resolveTargetMinutes(duration, defaultMinutes));
  const hardCap = constraints.hardCap ?? false;
  const isDone: SetDonePredicate = constraints.isSetDone ?? (() => false);
  const completedSets = constraints.completedSets ?? [];
  const compromises: string[] = [];
  const outgrown = outgrownMoves(history);
  const picker: Picker = {
    context,
    preferredIds,
    exposure,
    loads,
    focus,
    excluded: new Set([...swappedOut, ...away]),
    outgrown,
    swappedAway: swappedOut,
    // The plan judges its own picks as if no swap were kept: a kept swap's own loaded version waits
    // there like any other, and the swap puts it in for the move it stands for, saying so (the
    // fourth re-check). The lift to push stands while its push runs today.
    chosen: chosenBy([], push),
    ...(resting.size > 0 ? { resting } : {}),
  };
  const fatigue = interpretFatigue(history, now);

  // Entries the caller keeps: logged work is frozen; pinned picks, explicit
  // selections, and accepted alternatives stay in their slots.
  const keep = constraints.keep ?? [];
  const keptIds = new Set(keep.map((kept) => kept.entry.id));
  const trimmableKept = new Set(keep.filter((kept) => kept.trimmable).map((kept) => kept.entry.id));
  const frozenIds = new Set(keep.filter((kept) => kept.frozen).map((kept) => kept.entry.id));
  // Ended at their logged sets, here or at an earlier place: nothing left to pair.
  const closedIds = new Set(
    keep.filter((kept) => kept.closed || isStopped(kept.entry)).map((kept) => kept.entry.id),
  );
  // Every kept entry of a slot, in plan order: a stopped exercise, then the stand-in carrying on.
  const keptBySlot = new Map<number, WorkoutEntry[]>();
  const keptUnslotted: WorkoutEntry[] = [];
  for (const kept of keep) {
    const entry = cloneEntry(kept.entry);
    if (kept.closed) closeAtLogged(entry, isDone);
    if (entry.slot !== undefined && entry.slot < template.slots.length) {
      keptBySlot.set(entry.slot, [...(keptBySlot.get(entry.slot) ?? []), entry]);
    } else {
      keptUnslotted.push(entry);
    }
  }
  // A slot whose kept entries were all stopped still owes sets, however many rebuilds ago
  // they stopped: the least any of them owed, since each stand-in took over what the one
  // before it owed and did some of it. A kept entry that can go on (a stand-in started, or
  // the exercise under way) carries the slot on its own.
  const owedBySlot = new Map<number, number>();
  for (const [slot, kept] of keptBySlot) {
    if (!kept.every(isStopped)) continue;
    const owed = Math.min(...kept.map(owedBy));
    if (owed > 0) owedBySlot.set(slot, owed);
  }

  // 1. Fill the template's slots from the catalog around the kept entries.
  const chosenExercises: CatalogExercise[] = [
    ...[...keptBySlot.values()].flat(),
    ...keptUnslotted,
  ].map((entry) => exerciseOf(entry.exerciseId));
  // A new lift's name while the slots fill, settled once every lift is picked (below).
  let fresh = 0;
  const idFor = (): string => `new-${(fresh += 1)}`;
  const entries: WorkoutEntry[] = [];
  const plannedSets = new Map<string, number>();
  // Stopped entries that do not fit here were ended again by the caller; the others fit now.
  const closedNow = new Set(keep.filter((kept) => kept.closed).map((kept) => kept.entry.id));
  // The lifter's lasting swaps, then a swap back to a bodyweight move for each other loaded version of
  // it but a favourite (the seventh and eighth re-checks): for an exercise, the first that applies.
  const kept = withSwapsBack(constraints.swaps ?? [], preferredIds);
  // Each exercise in for the plan's own pick of its slot (a kept swap's, or the next best), by
  // that pick. An entry kept from before a rebuild says it itself (`standsFor`).
  const ownOf = new Map<string, CatalogExercise>();
  for (const kept of [...[...keptBySlot.values()].flat(), ...keptUnslotted]) {
    const own = kept.standsFor ? getExercise(kept.standsFor) : undefined;
    if (own) ownOf.set(kept.exerciseId, own);
  }

  /**
   * An exercise's sets as it takes its place after the entries so far: its own target from its
   * history, the work already done before it today, what this place can load, and the ramps
   * the session calls for.
   */
  const targetedFor = (
    exercise: CatalogExercise,
    role: TrainingRole,
    prescription: Prescription,
    /** Whether the day leaves the lift top set plus back-offs (item 11): a slot's own pick. */
    backOffDay = false,
  ) => {
    // What comes before this exercise today, planned or done, and whether a long break sits
    // between: the target and the ramps both read it.
    const earlier = sessionWork(entries, completedSets, exerciseOf);
    const preceding = precedingWorkToday(exercise, earlier, now);
    const floor = barWeightFor(exercise, profile.units);
    // What this place can load: the target lands on a weight that exists here, or holds at
    // the heaviest one with the reps pushed instead.
    const loading = loadingFor(
      location?.loading,
      constraints.sessionLoading,
      exercise,
      profile.units,
    );
    const targetAt = (
      asked: Prescription,
      read: readonly WorkoutRecord[],
      sessionsAt?: readonly string[],
    ) =>
      targetAtPlace(
        recommendNextTarget({
          exercise,
          role,
          prescription: asked,
          history: read,
          profile,
          fatigueLevel: fatigue.level,
          now,
          maxes,
          session: { precedingSets: preceding.sets },
          resets: input.resets ?? null,
          ...(sessionsAt ? { sessionsAt } : {}),
        }),
        adjust,
        loading,
        floor,
        profile.units,
        role,
      );
    // A main lift on top set plus back-offs (Maintenance 32, item 11) reads its target at the top
    // set's reserve; a load that is a guess or eased, high fatigue, or a load the place cannot make
    // as asked leave it on straight sets at the day's own, after a session on the structure at its
    // back-offs' load (the second review of round N).
    const built = mainLiftTarget({
      read: targetAt,
      prescription,
      suits: backOffsSuit(exercise, role, profile),
      profile,
      // A day with a reserve floor over the top set's (a head cold) runs it straight too.
      day: backOffDay && fatigue.level !== 'high' && dayRirFloor(adjust) <= BACK_OFF.TOP_RIR,
      exerciseId: exercise.id,
      history,
      load: { step: loading.step, floor, loading },
      units: profile.units,
    });
    const target = built.target;
    const warmupSets = rampSetsFor(
      exercise,
      role,
      targetMinutes,
      rampContextFor(exercise, earlier, preceding.afterBreak),
      { weight: target.weight, step: loading.step, floor },
    );
    const sets = applyProgression(
      buildSets(built.asked, warmupSets, exercise),
      target,
      loading.step,
      {},
      floor,
      loading,
    );
    const drop = built.drop;
    return {
      sets:
        drop === undefined
          ? sets
          : withBackOffs(sets, drop, {
              step: loading.step,
              floor,
              loading,
              dayRir: prescription.rir,
            }),
      warmupSets,
      progression: summarizeProgression(target),
      ...(drop !== undefined ? { backOffDrop: drop } : {}),
      ...(built.straight ? { atBackOffs: true as const } : {}),
    };
  };

  /**
   * Back where a stopped exercise fits again, it picks up the sets its slot still owes
   * (Maintenance 22), unless the lifter chose another exercise for the slot or a stand-in is
   * under way. A stand-in kept only because it came next, with nothing logged, gives way.
   * True when the slot was filled this way.
   */
  // What a catch-up or second workout may still give each of its muscles today: its sets, at its
  // reserve. Every lift that works one directly counts against it, a lift for another muscle too:
  // a muscle trained today takes no more than what is left of it, however it comes (the review of
  // round M). A muscle with fewer sets left than a lift takes, two (CATCH_UP.MIN_SETS), rests for
  // the slots after (the third review: the pushdown took the 1 set the bench press left the triceps).
  const budget = new Map(
    (catchUp?.muscles ?? []).map((item) => [item.muscle, { sets: item.sets, minRir: item.minRir }]),
  );
  /** Counts a lift's working sets against the muscles it works directly; fewer than none gives back. */
  const spend = (exerciseId: string, sets: number): void => {
    for (const muscle of exerciseOf(exerciseId).primaryMuscles) {
      const left = budget.get(muscle);
      if (left) left.sets -= sets;
    }
  };

  const reopened = (kept: WorkoutEntry[]): boolean => {
    // Only a stop the place made picks up again; one the lifter or a limit made stays.
    const fitting = kept.filter(
      (entry) =>
        isStopped(entry) && !closedNow.has(entry.id) && (entry.stopped?.why ?? 'place') === 'place',
    );
    const target = fitting[fitting.length - 1];
    if (!target) return false;
    const others = kept.filter((entry) => entry !== target);
    if (others.some((entry) => entry.locked || entry.pinned)) return false;
    if (others.some((entry) => !isStopped(entry) && frozenIds.has(entry.id))) return false;
    // What the slot still owes as the lift picks itself up: a stand-in stopped with nothing to come
    // in owes no other lift its sets, and leaves them to this one (the seventeenth review of round
    // M: the push-up stopped so at home kept the bench press stopped back at the gym).
    const owed = Math.min(...kept.filter(isStopped).map((entry) => entry.stopped?.owed ?? 0));
    if (!(owed > 0)) return false;
    const exercise = exerciseOf(target.exerciseId);
    // In a catch-up or a second workout, a stand-in that gives way gives its muscles back the sets
    // it took, and the lift picked up again keeps to what they have left as one picked here does:
    // no more sets, no less reserve (the third review of round M).
    const standIns = others.filter((entry) => !isStopped(entry));
    const workingOf = (entry: WorkoutEntry) =>
      entry.sets.filter((set) => set.kind === 'working').length;
    for (const entry of standIns) spend(entry.exerciseId, -workingOf(entry));
    const shares = exercise.primaryMuscles.flatMap((muscle) => budget.get(muscle) ?? []);
    // A lift for none of them, one the lifter swapped in, at the least reserve any of them asks, as
    // a change holds it (the thirteenth review of round M: picked up again, it went to failure).
    const least =
      budget.size > 0 ? Math.min(...[...budget.values()].map((left) => left.minRir)) : 0;
    const adjusted = withinCatchUp(
      adjustPrescription(
        prescribeFor(exercise, target.role, profile, history),
        target.role,
        adjust,
        rirFloor(exercise),
      ),
      {
        sets: Math.min(...shares.map((left) => left.sets)),
        minRir: Math.max(
          offPlanRir,
          shares.length > 0 ? Math.max(0, ...shares.map((left) => left.minRir)) : least,
        ),
      },
    );
    const sets = Math.min(adjusted.sets, owed);
    if (sets <= 0) {
      for (const entry of standIns) spend(entry.exerciseId, workingOf(entry));
      return false;
    }
    spend(exercise.id, sets);
    // The stopped entries stay as the history they are; a stand-in that gave way goes.
    for (const entry of standIns) {
      const at = chosenExercises.findIndex((chosen) => chosen.id === entry.exerciseId);
      if (at >= 0) chosenExercises.splice(at, 1);
    }
    entries.push(...kept.filter(isStopped));
    // On top set plus back-offs (Maintenance 32, item 11), its top set done, what it picks up again
    // are its back-offs, the drop off the top set's load; not yet done, a top set and back-offs, as
    // the day plans them (the first review of round N).
    const top = target.sets.find((set) => set.tier === 'top');
    const topDone = top !== undefined && isDone(target.id, top.index);
    // Begun on working sets straight, it stays straight; with none of them done, it is the day's as
    // the day plans it now (the sixteenth review of round N: begun straight on a day of high
    // fatigue, it came back straight once the day planned its top set again).
    const workingDone = target.sets.some(
      (set) => set.kind === 'working' && isDone(target.id, set.index),
    );
    const built = targetedFor(
      exercise,
      target.role,
      { ...adjusted, sets, restSeconds: target.restSeconds },
      !topDone &&
        (target.backOffDrop !== undefined || !workingDone) &&
        !offPlan &&
        deload === null &&
        target.push === undefined,
    );
    const from = Math.max(-1, ...target.sets.map((set) => set.index)) + 1;
    // The back-offs follow the top set as it was lifted, the step its log gave them kept (the
    // second review of round N).
    const done = completedSets.find(
      (set) => set.entryId === target.id && set.setIndex === top?.index && !set.skipped,
    );
    const placeLoading = loadingFor(
      location?.loading,
      constraints.sessionLoading,
      exercise,
      profile.units,
    );
    const backOffWeight =
      top && target.backOffDrop !== undefined && topDone
        ? backOffLoadAfter(
            top,
            {
              reps: done?.reps ?? top.targetReps[0],
              rir: done?.rir ?? null,
              weight: done?.weight ?? null,
            },
            target.backOffDrop,
            {
              step: placeLoading.step,
              floor: barWeightFor(exercise, profile.units),
              loading: placeLoading,
            },
          )
        : null;
    // Each back-off it logged moves the ones it still owes as its log did (the seventh review of
    // round N: home and back, they lost the step an easy back-off gave them).
    const owedWeight =
      backOffWeight === null
        ? null
        : owedBackOffLoad(
            target.sets,
            backOffWeight,
            (set) => {
              const log = completedSets.find(
                (each) =>
                  each.entryId === target.id && each.setIndex === set.index && !each.skipped,
              );
              return log && typeof log.reps === 'number'
                ? { reps: log.reps, rir: log.rir ?? null, weight: log.weight ?? null }
                : null;
            },
            {
              step: placeLoading.step,
              floor: barWeightFor(exercise, profile.units),
              loading: placeLoading,
              // Capped as every replay of them is (`backOffCap`, the eleventh review of round N:
              // a top set skipped capped them at its plan, under the step a back-off gave them).
              top:
                top === undefined
                  ? null
                  : backOffCap(
                      top,
                      completedSets.find(
                        (set) => set.entryId === target.id && set.setIndex === top.index,
                      ),
                    ),
            },
          );
    // At the top set's own reps, never a stand-in's (the thirteenth review of round N): the plan's
    // own top set, the copy of one the day's floor holds (`floored`) where it holds one, at the day's
    // back-off reserve, never the top set's as it stands (the fresh review before shipping, as
    // `asBackOffs`: a head cold's floor, or an effort change, reached the back-offs picked up again).
    const planTop = target.floored?.find((set) => set.tier === 'top') ?? top;
    const backOff =
      top && planTop && owedWeight !== null
        ? {
            tier: 'back-off' as const,
            // Picked up again, the reps set by hand go (`withoutHandTargets`): the top set's as
            // the plan has them (the fourteenth review of round N).
            targetReps: ownRepsOf(planTop, false),
            targetRir: backOffRir(topSetRir(adjusted.rir), adjusted.rir),
            targetWeight: owedWeight,
          }
        : null;
    target.sets = [
      ...target.sets,
      ...built.sets.map((set) => {
        if (!backOff || set.kind !== 'working') return { ...set, index: set.index + from };
        // A back-off's load is its top set's drop: the fresh straight target's load asked goes, as
        // `asBackOffs` and `withBackOffs` take it off (the twelfth review of round N: the plates
        // found again took the back-offs to the top set's plan, over the load it was lifted at).
        const next: SetPrescription = { ...set, index: set.index + from, ...backOff };
        delete next.asked;
        return next;
      }),
    ];
    target.warmupSets = target.sets.filter((set) => set.kind === 'warmup').length;
    target.dropSet = target.sets.some((set) => set.kind === 'drop');
    // Its top set done, the lines are its top set's, not a straight day's (the third review).
    if (!topDone) target.progression = built.progression;
    // Its top set still to come, it is the day's as built, as a swap back takes it: on top set plus
    // back-offs with their drop, or straight at the back-offs' load, saved as such a day (the
    // fifteenth review of round N: back at the gym on a day of high fatigue, it was saved unmarked),
    // unless a load the lifter set, or the coach's deload, made the day the lifter's own (the
    // sixteenth: a deload lifted was passed over).
    if (!topDone) {
      if (built.backOffDrop !== undefined) target.backOffDrop = built.backOffDrop;
      const own = target.manual?.weight === true && workingDone;
      if (built.atBackOffs && !own) target.atBackOffs = true;
      else delete target.atBackOffs;
    }
    // Picked up again, its sets to come are built afresh, as a swap back's are: a weight or reps
    // set by hand where it stopped go (the tenth and eleventh reviews of round N: the weight its
    // back-offs took, and the mark that kept them unfitted to the plates).
    withoutHandTargets(target);
    delete target.stopped;
    return true;
  };

  // A lift to push with no room today gives its place up (Maintenance 27, item 44). A catch-up or a
  // second workout never takes it: the push waits for a planned day (the review of round M).
  const givesWay = push && (!push.natural || offPlan) ? [push.exercise.id] : [];
  /**
   * A lasting swap of the lifter's puts the exercise swapped in wherever it fits here, never the
   * lift to push on a day it gives its place up (the re-check of item 44).
   */
  const swappedIn = (
    pick: CatalogExercise,
    rests: ReadonlySet<MuscleId>,
    trains?: ReadonlySet<MuscleId>,
  ): CatalogExercise => {
    for (const swap of kept.filter((candidate) => candidate.from === pick.id)) {
      const next = getExercise(swap.to);
      if (!next || givesWay.includes(next.id)) continue;
      // Never a lift that works a muscle that rests today (the review of round M), and in a
      // catch-up, one for as many of its slot's muscles as the lift it stands for: a front squat
      // for the back squat the quads and the glutes share leaves the glutes none (the third and
      // fourth reviews).
      if (next.primaryMuscles.some((muscle) => rests.has(muscle))) continue;
      if (trains && covers(next, trains) < covers(pick, trains)) continue;
      if (chosenExercises.some((chosen) => chosen.id === next.id) || away.has(next.id)) continue;
      if (isBlocked(checkExerciseFit(next, context))) continue;
      if (blocksCandidate(checkWorkoutConflicts([...chosenExercises, next], context), next.id)) {
        continue;
      }
      return next;
    }
    return pick;
  };

  /** Whether an exercise can join the exercises in the plan so far: not in, and no clash. */
  const fitsWith = (candidate: CatalogExercise): boolean =>
    !chosenExercises.some((chosen) => chosen.id === candidate.id) &&
    !blocksCandidate(checkWorkoutConflicts([...chosenExercises, candidate], context), candidate.id);

  const keptAll = [...[...keptBySlot.values()].flat(), ...keptUnslotted];
  // The lift swapped away today, from its own place or its extra, stays away for today's rebuilds
  // (the review of item 44).
  const pushSwappedAway = keptAll.some((entry) => entry.replacedFrom === push?.exercise.id);
  /**
   * Whether the lift to push can join today's plan: it fits here, no lasting swap took it, and it
   * was not swapped away today.
   */
  const pushFits = (lift: CatalogExercise): boolean =>
    !pushSwappedAway &&
    !swappedOut.has(lift.id) &&
    !away.has(lift.id) &&
    !isBlocked(checkExerciseFit(lift, context)) &&
    fitsWith(lift);
  // The place the plan has for the lift, unless a kept entry holds it. The lift leads once it is in
  // (below); its slot keeps its place, so a stand-in where the lift cannot go here does not lead.
  const pushSlot =
    push && push.natural
      ? template.slots.findIndex(
          (slotSpec, index) =>
            slotSpec.pattern === push.exercise.movementPattern && !keptBySlot.has(index),
        )
      : -1;
  // The plan the lifter's hand emptied today, laid out again, takes no lift (the nineteenth review
  // of round M: back at a place with a lift for it, a catch-up emptied was built whole); the split's
  // own day a place with no lift for the offer lays out is another plan.
  const emptiedHere = constraints.emptiedLayouts?.includes(template.id) === true;
  // The lift kept from before a rebuild: today has it already. One swapped away today keeps it out
  // (`pushSwappedAway`): a swap keeps the lift it replaced, through every later swap.
  const pushKept = keptAll.some(
    (entry) => !isStopped(entry) && entry.exerciseId === push?.exercise.id,
  );
  // The week's extra exposure: on a day with no place for the lift, when one is due (Maintenance
  // 27, item 44). Heavy and short: the style's strength range (an undulating plan's heavy day), two
  // to three sets, never to failure; first, so nothing comes before it.
  let extraId: string | null = null;
  if (
    push &&
    push.extraSets !== null &&
    constraints.pushProbe !== true &&
    !offPlan &&
    !pushKept &&
    !extraKept &&
    !template.slots.some((slotSpec) => slotSpec.pattern === push.exercise.movementPattern) &&
    pushFits(push.exercise)
  ) {
    const lift = push.exercise;
    const role: TrainingRole = 'primary-strength';
    // The day may take a set off (easier), never add one: the push sets the extra's sets.
    const prescription = pushedPrescription(
      push,
      'extra',
      extraBase(lift, profile),
      role,
      adjust,
      rirFloor(lift),
    );
    chosenExercises.push(lift);
    const id = idFor();
    const built = targetedFor(lift, role, prescription);
    entries.push({
      id,
      exerciseId: lift.id,
      role,
      sets: built.sets,
      progression: built.progression,
      restSeconds: prescription.restSeconds,
      warmupSets: built.warmupSets,
      dropSet: false,
      chosenFor: [...lift.primaryMuscles],
      locked: false,
      pinned: false,
      push: 'extra',
      // A straight day at the back-offs' load, saved as one (the fifth review of round N).
      ...(built.atBackOffs ? { atBackOffs: true as const } : {}),
    });
    extraId = id;
  }
  // A lift kept through a rebuild counts against its muscles as one picked here does, the sets it
  // has still to do and those done (the second review of round M): begun on the bench press, a
  // second workout gives the triceps no more than what is left of them.
  for (const entry of keptAll) {
    const stopped = isStopped(entry);
    const sets = entry.sets.filter(
      (set) => set.kind === 'working' && (!stopped || isDone(entry.id, set.index)),
    ).length;
    spend(entry.exerciseId, sets);
  }
  // The slots to fill: the template's, and in a catch-up, after them, a slot for each of the day's
  // muscles a slot's lift misses. A catch-up keeps them with the plan, so a rebuild around what it
  // keeps fills the same slots and every lift kept stays in its own (the seventh review of round M).
  const slots: Slot[] = template.slots.map((candidate) => ({
    ...candidate,
    muscles: [...candidate.muscles],
  }));
  const laidOut = slots.length;
  /**
   * The day's muscles a slot's lift misses that are still short, each a slot of its own, numbered
   * after the layout's and placed in the plan right after the slot (the sixth to ninth reviews of
   * round M: a front squat kept in the squat the quads and the glutes share), unless a later slot
   * carries it. A slot with no lift going on takes none (a stand-in skipped: nothing brings its sets
   * back), nor one whose lift the lifter swapped in today: the muscles it misses wait, as the swap
   * chose.
   */
  const missedBy = (planned: Slot, index: number): Slot[] => {
    const live = entries.filter((entry) => entry.slot === index && !isStopped(entry));
    if (live.length === 0 || live.some((entry) => entry.replacedFrom !== undefined)) return [];
    const works = new Set(live.flatMap((entry) => exerciseOf(entry.exerciseId).primaryMuscles));
    return planned.muscles.flatMap((muscle) => {
      const left = budget.get(muscle);
      if (works.has(muscle) || !left || left.sets < CATCH_UP.MIN_SETS) return [];
      if (slots.slice(index + 1).some((later) => later.muscles.includes(muscle))) return [];
      return [
        { ...planned, muscles: [muscle], sets: left.sets, minRir: left.minRir, after: index },
      ];
    });
  };
  const fill = (planned: Slot, index: number): void => {
    let slotSpec = planned;
    const kept = keptBySlot.get(index);
    const owed = owedBySlot.get(index);
    if (kept) {
      if (reopened(kept)) return;
      entries.push(...kept);
      // Work stopped at another place leaves its slot owing sets: a stand-in follows it. In a
      // catch-up or a second workout, not for fewer than a lift takes (the thirteenth review of
      // round M: the goblet squat stopped with one set owed took a one-set front squat), one with
      // nothing behind included (the seventeenth: a day off the plan as the engine reads it).
      if (owed === undefined || (offPlan && owed < CATCH_UP.MIN_SETS)) return;
    }
    // A slot the lifter's change left with nothing to come in takes no lift again (the seventeenth
    // review of round M: a rebuild put in a lift the change had found no comfortable one of), on any
    // day off the plan (the eighteenth: a second workout with nothing behind too).
    if (offPlan && closedSlots.has(index)) return;
    // The plan's own pick first, judged as if no swap were kept; one swapped out gives way to its
    // swap-in, or to the next best when the swap-in is already in the workout. An own pick a kept
    // swap already put in an earlier slot gives way to the next best too.
    // The slot's own kept entries count as themselves: the stand-in for one stopped here is judged
    // as the slot's own pick would be.
    const mine = new Set((kept ?? []).map((entry) => entry.exerciseId));
    const ownPicks = chosenExercises.map((chosen) =>
      mine.has(chosen.id) ? chosen : (ownOf.get(chosen.id) ?? chosen),
    );
    const spent = [...budget]
      .filter(([, left]) => left.sets < CATCH_UP.MIN_SETS)
      .map(([muscle]) => muscle);
    const rests = spent.length > 0 ? new Set([...resting, ...spent]) : resting;
    // A catch-up's slot is for its muscles still short (the third review of round M): its lift works
    // one of them directly, so a slot whose muscles have all been given their sets finds none.
    const short = catchUp
      ? planned.muscles.filter((muscle) => budget.has(muscle) && !spent.includes(muscle))
      : undefined;
    const slotBase: Picker = {
      ...picker,
      ...(rests === resting ? {} : { resting: rests }),
      ...(short ? { trains: new Set(short) } : {}),
    };
    // The lift to push takes its own place when it fits here (Maintenance 27, item 44), on a day of
    // the plan only.
    const pushPick =
      push && !offPlan && index === pushSlot && pushFits(push.exercise) ? push.exercise : undefined;
    const slotPicker: Picker = {
      ...slotBase,
      excluded: new Set([...(slotBase.excluded ?? []), ...givesWay]),
    };
    // A lift swapped away today is no pick of the plan's own, unless a kept swap has a lift in its
    // place: judged first, it gives way to its swap-in (the nineteenth review of round M: a swap
    // kept was also one made today, and its slot took the next best).
    const natural =
      pushPick ??
      pickForSlot(slotSpec, ownPicks, {
        ...slotBase,
        excluded: new Set([...givesWay, ...[...away].filter((id) => !swappedOut.has(id))]),
      });
    let pick = natural;
    if (natural && swappedOut.has(natural.id)) {
      const next = swappedIn(natural, rests, slotBase.trains);
      // With its swap-in unable to join and nothing else fitting, the plan's own pick stays:
      // a kept swap applies where it fits, and never empties a slot, unless that pick was swapped
      // away today.
      pick =
        next !== natural
          ? next
          : (pickForSlot(slotSpec, chosenExercises, slotPicker) ??
            (fitsWith(natural) && !away.has(natural.id) ? natural : undefined));
    } else if (natural && !fitsWith(natural)) {
      // Already in, or clashing with a kept swap's exercise: the next best that fits the plan.
      pick = pickForSlot(slotSpec, chosenExercises, slotPicker);
    }
    if (!pick && catchUp) {
      // No lift for the slot fits, every one working a muscle already given its sets, say: a muscle
      // it is for that still lacks its own takes the next slot that carries it, a lift there working
      // it and no muscle that rests (the second review of round M: the squat has given the glutes
      // theirs and every hinge works them, so the hamstrings take the leg curl).
      for (const muscle of short ?? []) {
        const left = budget.get(muscle);
        if (!left) continue;
        for (const other of slotsFor(profile, muscle)) {
          if (other.pattern === planned.pattern) continue;
          const instead = { ...other, muscles: [muscle], sets: left.sets, minRir: left.minRir };
          const found = pickForSlot(instead, chosenExercises, {
            ...slotPicker,
            trains: new Set([muscle]),
          });
          if (found) {
            slotSpec = instead;
            pick = found;
            break;
          }
        }
        if (pick) break;
      }
    }
    if (!pick) {
      // A slot whose every lift works a muscle that rests today stays out, quietly: the muscle
      // waits for the week's own sessions (the review of round M). So does a catch-up's slot whose
      // muscles all have their sets: a layout kept from another place may have a movement this one
      // has no lift for, and the slot is not needed (the eighth review of round M).
      const restsHere =
        rests.size > 0 &&
        pickForSlot(slotSpec, ownPicks, {
          ...picker,
          excluded: new Set(givesWay),
          resting: undefined,
        });
      if (!restsHere && short?.length !== 0) {
        compromises.push(
          `No ${slotSpec.pattern.replace(/-/g, ' ')} option fits ${location?.name ?? 'this place'} and your limits.`,
        );
      }
      return;
    }
    // The day's muscles this lift works directly: never more sets than the least left of theirs,
    // never less reserve than the most any of them asks.
    const shares = pick.primaryMuscles.flatMap((muscle) => budget.get(muscle) ?? []);
    const limit: Slot = {
      ...slotSpec,
      sets: Math.min(slotSpec.sets ?? Infinity, ...shares.map((left) => left.sets)),
      minRir: Math.max(slotSpec.minRir ?? 0, offPlanRir, ...shares.map((left) => left.minRir)),
    };
    if (natural && pick !== natural) ownOf.set(pick.id, natural);
    chosenExercises.push(pick);
    const id = idFor();
    const ownPrescription = withinCatchUp(
      prescribeFor(pick, slotSpec.role, profile, history),
      limit,
    );
    // The lift to push keeps to the push's sets for the week and never goes to failure.
    const basePrescription =
      pushPick && push
        ? { ...ownPrescription, sets: Math.min(ownPrescription.sets, push.naturalSets) }
        : ownPrescription;
    const adjusted =
      pushPick && push
        ? pushedPrescription(
            push,
            'natural',
            ownPrescription,
            slotSpec.role,
            adjust,
            rirFloor(pick),
          )
        : adjustPrescription(basePrescription, slotSpec.role, adjust, rirFloor(pick));
    // A day's adjustment never takes a catch-up past its sets or under its reserve; a replacement
    // carries only the working sets its slot still owes.
    const within = withinCatchUp(adjusted, limit);
    const prescription =
      owed === undefined ? within : { ...within, sets: Math.min(within.sets, owed) };
    for (const left of shares) left.sets -= prescription.sets;
    // Asked to make it harder, the time fit may take back an added set, never one the plan had.
    if ((adjust?.sets ?? 0) > 0) {
      plannedSets.set(
        id,
        owed === undefined ? basePrescription.sets : Math.min(basePrescription.sets, owed),
      );
    }
    // A main lift picked here takes top set plus back-offs (item 11), off the plan and in a deload
    // week aside, where the day shapes every set; the lift to push keeps the push's sets.
    const built = targetedFor(
      pick,
      slotSpec.role,
      prescription,
      !offPlan && deload === null && !pushPick && owed === undefined,
    );
    // In a catch-up, a lift goes in for every one of the day's muscles it works directly, as the
    // budget counts it: the bench press for what is left of the triceps (the third review of round M).
    const serves = [
      ...slotSpec.muscles,
      ...[...budget.keys()].filter((muscle) => !slotSpec.muscles.includes(muscle)),
    ];
    const chosenFor = serves.filter((muscle) => pick.primaryMuscles.includes(muscle));
    entries.push({
      id,
      exerciseId: pick.id,
      role: slotSpec.role,
      sets: built.sets,
      progression: built.progression,
      restSeconds: prescription.restSeconds,
      warmupSets: built.warmupSets,
      dropSet: false,
      chosenFor: chosenFor.length > 0 ? chosenFor : [...pick.primaryMuscles],
      locked: false,
      pinned: false,
      slot: index,
      ...(natural && pick !== natural ? { standsFor: natural.id } : {}),
      ...(pushPick ? { push: 'natural' as const } : {}),
      ...(built.backOffDrop !== undefined ? { backOffDrop: built.backOffDrop } : {}),
      ...(built.atBackOffs ? { atBackOffs: true as const } : {}),
    });
  };
  // The slots filled in the plan's order: a slot added for a muscle a lift misses right after the
  // slot it was added for, a strength slot's before the curl's, though it keeps its number after
  // the layout's (the eighth to tenth reviews of round M). Its lift is planned, and its muscles'
  // sets spent, where the lifter does it, with the work before it today that comes before it.
  const filled = new Set<number>();
  const fillFrom = (index: number): void => {
    filled.add(index);
    const planned = slots[index] as Slot;
    fill(planned, index);
    if (catchUp && index < laidOut) slots.push(...missedBy(planned, index));
    for (let child = 0; child < slots.length; child += 1) {
      if (!filled.has(child) && slots[child]?.after === index) fillFrom(child);
    }
  };
  // An added slot's number comes after its own slot's, which fills it; one whose own slot is not
  // there comes in its number's order.
  for (let index = 0; index < slots.length; index += 1) {
    if (!filled.has(index)) fillFrom(index);
  }
  // The plan the lifter's hand emptied today, laid out again where it has a lift, takes none (the
  // nineteenth review of round M: back at a place with a lift for it, a catch-up emptied was built
  // whole). Where this place has no lift for it, the day is the split's own, as for any offer with
  // none here, and that is another plan.
  const emptiedAgain = emptiedHere && entries.length > 0;
  if (emptiedAgain) {
    entries.length = 0;
    plannedSets.clear();
  }
  // Names, once every lift is picked (the tenth to twelfth reviews of round M): a lift planned
  // again keeps the name it had in the plan before, wherever it is planned; a slot's new lift takes
  // the name of the lift it replaces there, when that lift is planned nowhere now; else its slot's
  // own name, or one past every name taken. A rebuild renames no lift it plans again, and the
  // change list names only what changed.
  {
    const numbered = (id: string) => Number(/^e(\d+)$/.exec(id)?.[1] ?? 0);
    const had = allEntries(constraints.keepBlocks ?? []);
    const before = had.filter((entry) => !isStopped(entry) && !keptIds.has(entry.id));
    const added = entries.filter((entry) => !keptIds.has(entry.id));
    const named = new Map<WorkoutEntry, string>();
    const used = new Set(keptIds);
    const take = (entry: WorkoutEntry, name: string) => {
      named.set(entry, name);
      used.add(name);
    };
    for (const entry of added) {
      const same = before.find((was) => was.exerciseId === entry.exerciseId && !used.has(was.id));
      if (same) take(entry, same.id);
    }
    for (const entry of added) {
      if (named.has(entry) || entry.slot === undefined) continue;
      const was = before.find(
        (candidate) => candidate.slot === entry.slot && !used.has(candidate.id),
      );
      if (was) take(entry, was.id);
    }
    for (const entry of added) {
      if (named.has(entry)) continue;
      const at = entry.slot ?? (entry.push === 'extra' ? template.slots.length : undefined);
      const own = at === undefined ? undefined : `e${at + 1}`;
      // Past every name taken, and every name the plan had: a lift left out by this rebuild keeps
      // its own (the fifteenth review: a stand-in took the leg curl's, "Replaced Leg Curl"), its
      // slot's own name too (the sixteenth: a lunge took a glute bridge's left out elsewhere).
      take(
        entry,
        own !== undefined && !used.has(own) && !had.some((was) => was.id === own)
          ? own
          : `e${Math.max(0, ...[...used, ...had.map((was) => was.id)].map(numbered)) + 1}`,
      );
    }
    const counts = [...named].flatMap(([entry, name]) => {
      const count = plannedSets.get(entry.id);
      plannedSets.delete(entry.id);
      return count === undefined ? [] : [[name, count] as const];
    });
    for (const [name, count] of counts) plannedSets.set(name, count);
    for (const [entry, name] of named) {
      if (extraId === entry.id) extraId = name;
      entry.id = name;
    }
  }
  entries.push(...keptUnslotted);

  // The lift to push leads (Maintenance 27, item 44), kept from before a rebuild too. The day's
  // extra leads whatever it holds now: swapped for another exercise, or stopped and stood in for,
  // its entries keep the first places in their order (the review and the re-check of item 44).
  const extras = entries.filter((entry) => entry.push === 'extra');
  const leading =
    extras.length > 0
      ? extras
      : entries.filter((entry) => !isStopped(entry) && pushMarkOf(entry) !== undefined).slice(0, 1);
  entries.splice(
    0,
    entries.length,
    ...leading,
    ...entries.filter((entry) => !leading.includes(entry)),
  );
  const pushEntry = leading.find((entry) => !isStopped(entry) && pushMarkOf(entry) !== undefined);
  const workingCount = (entry: WorkoutEntry) =>
    entry.sets.filter((set) => set.kind === 'working').length;
  // The day's extra in the plan, new or kept: its cap and its drop-set rule hold through every
  // rebuild (the re-check of item 44).
  const dayExtra =
    extraId ?? extras.find((entry) => !isStopped(entry))?.id ?? extras[0]?.id ?? null;

  // On the extra exposure's day, the lift's muscles stay under their weekly cap: sets come off an
  // isolation lift for them first, never more than the extra adds (Maintenance 27, item 44). A
  // lift kept from before a rebuild keeps its sets.
  const capTrims: { id: string; count: number }[] = [];
  if (push && dayExtra !== null) {
    // A rebuild keeping the day's extra weighed nothing before: it plans the days after now.
    ahead ??= sessionsAhead(input, [
      ...history,
      plannedRecord(
        {
          locationId: location?.id ?? null,
          templateId: template.id,
          blocks: entries.map((entry) => straightBlock(entry, exerciseOf)),
        },
        now,
        null,
      ),
    ]);
    const { trims } = pushCap({
      lift: push.exercise,
      extraId: dayExtra,
      extraSets:
        extraId !== null
          ? (push.extraSets ?? 0)
          : extras.reduce((sum, entry) => sum + workingCount(entry), 0),
      planned: plannedWork(entries, keptIds),
      history,
      now,
      ahead,
    });
    for (const [id, count] of trims) {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry || keptIds.has(id)) continue;
      for (let taken = 0; taken < count; taken += 1) {
        const last = entry.sets.filter((set) => set.kind === 'working').pop();
        if (last) entry.sets = entry.sets.filter((set) => set !== last);
      }
      capTrims.push({ id, count });
    }
  }
  // Asked to make it harder, the time fit takes back the sets harder added, never one of the lift
  // to push's or the day's extra's: harder adds none to them (the re-check of item 44).
  if ((adjust?.sets ?? 0) > 0) {
    for (const entry of entries) {
      if (isStopped(entry) || plannedSets.has(entry.id)) continue;
      if (entry.push === 'extra' || pushMarkOf(entry) !== undefined) {
        plannedSets.set(entry.id, workingCount(entry));
      }
    }
  }

  // The main lift is the first one still to do: a lift stopped at another place is history,
  // and the stand-in carrying its sets leads in its place. The week's extra exposure of a lift to
  // push is not the day's main lift; it leads besides it.
  const anchor =
    entries.find(
      (entry) => entry.role === 'primary-strength' && !isStopped(entry) && entry.push !== 'extra',
    ) ?? entries[0];
  const anchorId = anchor?.id;

  let blocks: WorkoutBlock[] = entries.map((entry) => straightBlock(entry, exerciseOf));

  // Pairings whose members are all kept survive as they were.
  for (const original of constraints.keepBlocks ?? []) {
    if (original.kind === 'straight') continue;
    if (!original.entries.every((member) => keptIds.has(member.id))) continue;
    // A member closed at its logged sets has nothing left to pair.
    if (original.entries.some((member) => closedIds.has(member.id))) continue;
    const members = original.entries
      .map((member) => entries.find((entry) => entry.id === member.id))
      .filter((entry): entry is WorkoutEntry => entry !== undefined);
    if (members.length !== original.entries.length) continue;
    const firstIndex = blocks.findIndex((block) => block.entries[0] === members[0]);
    if (firstIndex < 0) continue;
    blocks = blocks.filter((block) => !members.includes(block.entries[0] as WorkoutEntry));
    blocks.splice(firstIndex, 0, {
      ...original,
      entries: members,
      rounds: Math.max(...members.map(roundsOf)),
    });
  }

  // Each fitting outcome once, however many passes it took (Maintenance 25).
  const fitLog = new FittingLog();
  const generalWarmup =
    constraints.generalWarmupMinutesOverride ?? generalWarmupMinutes(targetMinutes);
  // The lifter's own pace (Maintenance 28, item 4): the plan is fitted to how long their
  // workouts take, read from their finished workouts since the last reset.
  const pace = personalPace(history, input.resets?.pace ?? null);
  const estimate = (): TimeBreakdown =>
    estimateWorkout(blocks, generalWarmup, exerciseOf, isDone, pace.factor);

  // What keeps getting cut (Maintenance 34): a muscle the time fit cut last session is spared
  // next, after every muscle not cut, and one cut twice running after those, within the same
  // rank of the leave-out order: the main lifts still stay, and the isolation moves take turns.
  const cutBefore = cutRunning(history, now);
  const cutRank = (entry: WorkoutEntry) =>
    Math.max(
      0,
      ...exerciseOf(entry.exerciseId).primaryMuscles.map((muscle) => cutBefore.get(muscle) ?? 0),
    );
  const blockCutRank = (block: WorkoutBlock) => Math.max(...block.entries.map(cutRank));
  const untouchable = (entry: WorkoutEntry) =>
    entry.id === anchorId ||
    entry.id === pushEntry?.id ||
    entry.pinned ||
    entry.locked ||
    keptIds.has(entry.id);
  // What a session too long for its length leaves out first (Maintenance 24,
  // docs/research/short-sessions.md): the main lifts stay, and an isolation exercise goes first,
  // by leaveOutRank against the main lifts still in the plan. Within a rank, and among the main
  // lifts when those must go too, the lowest value first, as before. A block ranks as its
  // highest-ranked exercise.
  const trainedByMainLifts = () => mainLiftSets(allEntries(blocks), exerciseOf);
  const leaveOutTier = (entries: readonly WorkoutEntry[], trained: (muscle: MuscleId) => number) =>
    Math.max(...entries.map((entry) => leaveOutRank(exerciseOf(entry.exerciseId), trained)));
  const nextToLeaveOut = (): WorkoutBlock | undefined => {
    const candidates = blocks.filter((block) => !block.entries.some(untouchable));
    if (candidates.length === 0) return undefined;
    const trained = trainedByMainLifts();
    return [...candidates].sort(
      (a, b) =>
        leaveOutTier(a.entries, trained) - leaveOutTier(b.entries, trained) ||
        blockCutRank(a) - blockCutRank(b) ||
        blockValue(a) - blockValue(b),
    )[0];
  };
  // Paired blocks save time, so they outrank their weakest member when something must go,
  // and time efficiency matters even more on short sessions.
  const pairedBonus = targetMinutes <= 30 ? 55 : 25;
  const blockValue = (block: WorkoutBlock) =>
    Math.min(...block.entries.map((entry) => entryValue(entry, weightOf, preferredIds))) +
    (block.kind === 'straight' ? 0 : pairedBonus);

  // Blocks the row cap and the time fit left out, in the order they went; the fill-back pass
  // reads them (the row cap's too since Maintenance 24).
  const leftOut: WorkoutBlock[] = [];
  const dropBlock = (block: WorkoutBlock, why: string) => {
    blocks = blocks.filter((candidate) => candidate.id !== block.id);
    leftOut.push(block);
    fitLog.add(`Left out ${block.label} ${why}.`);
  };
  // A circuit's three moves shrink to a pair before the circuit goes whole (Maintenance 24): a
  // pair is the least that still alternates moves, and paired moves keep their volume in less
  // time (Zhang et al. 2025). The move the order leaves out first goes, and can come back on its
  // own.
  const shrinkCircuit = (block: WorkoutBlock, why: string): boolean => {
    if (block.kind !== 'circuit' || block.entries.length !== 3) return false;
    const trained = trainedByMainLifts();
    const [gone] = [...block.entries].sort(
      (a, b) =>
        leaveOutTier([a], trained) - leaveOutTier([b], trained) ||
        entryValue(a, weightOf, preferredIds) - entryValue(b, weightOf, preferredIds),
    );
    if (!gone) return false;
    block.entries = block.entries.filter((entry) => entry !== gone);
    const names = block.entries.map((entry) => exerciseOf(entry.exerciseId).name);
    block.kind = 'superset';
    block.id = `s-${block.entries.map((entry) => entry.id).join('-')}`;
    block.label = `A1 ${names[0]} + A2 ${names[1]}`;
    block.rounds = roundsRun(block);
    leftOut.push(straightBlock(gone, exerciseOf));
    fitLog.add(`Left out ${exerciseOf(gone.exerciseId).name} from the circuit ${why}.`);
    return true;
  };

  // 2. Circuits (only when they suit the goal), then smart supersets, among new entries only.
  const isolationEntries = () =>
    allEntries(blocks).filter(
      (entry) =>
        restCategory(entry.role) === 'isolation' &&
        !keptIds.has(entry.id) &&
        blocks.some((block) => block.kind === 'straight' && block.entries[0]?.id === entry.id),
    );

  if (profile.techniques.circuits && !template.strengthPriority && targetMinutes <= 30) {
    const members = isolationEntries().slice(0, 3);
    const compatible =
      members.length >= 3 &&
      members.every((a, i) =>
        members.every(
          (b, j) =>
            i >= j ||
            !isBlocked(
              checkSupersetPair(exerciseOf(a.exerciseId), exerciseOf(b.exerciseId), context),
            ),
        ),
      );
    if (compatible) {
      const rounds = Math.min(3, ...members.map(roundsOf));
      const circuit: WorkoutBlock = {
        id: `c-${members.map((entry) => entry.id).join('-')}`,
        kind: 'circuit',
        label: `Circuit ×${rounds}: ${members.map((entry) => exerciseOf(entry.exerciseId).name).join(' / ')}`,
        entries: members,
        rounds,
        restBetweenRoundsSeconds: 75,
      };
      const memberIds = new Set(members.map((entry) => entry.id));
      const firstIndex = blocks.findIndex((block) =>
        block.entries.some((entry) => memberIds.has(entry.id)),
      );
      blocks = blocks.filter((block) => !block.entries.some((entry) => memberIds.has(entry.id)));
      blocks.splice(firstIndex, 0, circuit);
      fitLog.add(`Ran ${members.length} isolation moves as a ${rounds}-round circuit.`);
    }
  }

  if (profile.techniques.supersets) {
    let pairs = 0;
    const candidates = isolationEntries();
    // Off the plan, a pair never puts what is left of today's work before what was missed (the
    // fresh review before shipping: a second workout's superset paired a lift for the hamstrings'
    // remainder with one for the missed rear delts): both its lifts are for what was missed, or
    // both for what is left.
    const behind = new Set(
      (catchUp?.muscles ?? []).filter((item) => item.why === 'behind').map((item) => item.muscle),
    );
    const missedLift = (entry: WorkoutEntry) =>
      exerciseOf(entry.exerciseId).primaryMuscles.some((muscle) => behind.has(muscle));
    for (let i = 0; i < candidates.length - 1 && pairs < 2; i += 1) {
      const a = candidates[i];
      if (!a || !blocks.some((block) => block.kind === 'straight' && block.entries[0]?.id === a.id))
        continue;
      for (let j = i + 1; j < candidates.length; j += 1) {
        const b = candidates[j];
        if (
          !b ||
          !blocks.some((block) => block.kind === 'straight' && block.entries[0]?.id === b.id)
        )
          continue;
        const exerciseA = exerciseOf(a.exerciseId);
        const exerciseB = exerciseOf(b.exerciseId);
        const conflicts = checkSupersetPair(exerciseA, exerciseB, context);
        const shareMuscle = exerciseA.primaryMuscles.some((muscle) =>
          exerciseB.primaryMuscles.includes(muscle),
        );
        if (isBlocked(conflicts) || shareMuscle) continue;
        if (offPlan && missedLift(a) !== missedLift(b)) continue;
        const rounds = Math.max(roundsOf(a), roundsOf(b));
        const superset: WorkoutBlock = {
          id: `s-${a.id}-${b.id}`,
          kind: 'superset',
          label: `A1 ${exerciseA.name} + A2 ${exerciseB.name}`,
          entries: [a, b],
          rounds,
          restBetweenRoundsSeconds: Math.max(
            45,
            Math.round((Math.max(a.restSeconds, b.restSeconds) * 0.75) / 5) * 5,
          ),
        };
        const indexA = blocks.findIndex((block) => block.entries[0]?.id === a.id);
        blocks = blocks.filter(
          (block) => block.entries[0]?.id !== a.id && block.entries[0]?.id !== b.id,
        );
        blocks.splice(indexA, 0, superset);
        fitLog.add(`Paired ${exerciseA.name} with ${exerciseB.name} as a superset.`);
        pairs += 1;
        break;
      }
    }
  }

  // The plan's own sets before the fit: what it cuts is kept on the workout (Maintenance 34).
  const beforeFit = directSets(allEntries(blocks), exerciseOf);
  // 3. Cap the number of list rows for the chosen length; paired rows count once.
  const cap = capFor(targetMinutes);
  while (blocks.length > cap) {
    const lowest = nextToLeaveOut();
    if (!lowest) break;
    dropBlock(lowest, `to fit ${targetMinutes} min`);
  }

  // 4. Fit the remaining session to the target time, highest value last.
  const floorFor = (entry: WorkoutEntry) => MIN_REST_SECONDS[restCategory(entry.role)];
  const shortenRests = (): boolean => {
    let changed = false;
    for (const block of blocks) {
      for (const entry of block.entries) {
        if (frozenIds.has(entry.id)) continue;
        const next = Math.max(floorFor(entry), Math.round((entry.restSeconds * 0.85) / 5) * 5);
        if (next < entry.restSeconds) {
          entry.restSeconds = next;
          for (const set of entry.sets) if (set.kind === 'working') set.restSeconds = next;
          changed = true;
        }
      }
      if (block.kind !== 'straight' && !block.entries.some((entry) => frozenIds.has(entry.id))) {
        const next = Math.max(45, Math.round((block.restBetweenRoundsSeconds * 0.85) / 5) * 5);
        if (next < block.restBetweenRoundsSeconds) {
          block.restBetweenRoundsSeconds = next;
          changed = true;
        }
      }
    }
    if (changed) fitLog.add(SHORTENED_RESTS);
    return changed;
  };
  const remainingWorking = (entry: WorkoutEntry) =>
    entry.sets.filter((set) => set.kind === 'working' && !isDone(entry.id, set.index));
  const trimmable = (entry: WorkoutEntry): boolean => {
    // Locked and logged entries keep their sets unless the user asked for an exact end.
    if (
      !hardCap &&
      !trimmableKept.has(entry.id) &&
      (keptIds.has(entry.id) || entry.locked || entry.pinned)
    ) {
      return false;
    }
    // The lift to push keeps two sets at least, as its extra exposure has (item 44), and so does
    // every lift of a catch-up or a second workout, an end time's too (the thirteenth review of
    // round M): a lift goes before one is cut to a single set.
    const floor =
      entry.id === anchorId
        ? hardCap
          ? 2
          : 3
        : entry.id === pushEntry?.id || offPlan
          ? 2
          : hardCap
            ? 1
            : 2;
    const planned = hardCap ? 0 : (plannedSets.get(entry.id) ?? 0);
    return remainingWorking(entry).length > Math.max(floor, planned);
  };
  const syncRoundsOf = (target: WorkoutEntry) => {
    for (const block of blocks) {
      if (block.kind !== 'straight' && block.entries.includes(target)) {
        // A pair or circuit runs its longest member's rounds (Maintenance 24; a pair since the
        // eighth pass of Maintenance 26, item 42), and a circuit's label names them.
        block.rounds = roundsRun(block);
        if (block.kind === 'circuit') {
          block.label = block.label.replace(/^Circuit ×\d+/, `Circuit ×${block.rounds}`);
        }
      }
      if (block.kind === 'straight' && block.entries[0] === target) block.rounds = roundsOf(target);
    }
  };
  // The sets trimmed, latest last, each with where it sat: a lift left on its own takes them back
  // (Maintenance 24).
  const trimmed: { entry: WorkoutEntry; set: SetPrescription; at: number }[] = [];
  const trimSets = (): boolean => {
    const ordered = allEntries(blocks)
      .filter(trimmable)
      .sort(
        (a, b) =>
          cutRank(a) - cutRank(b) ||
          entryValue(a, weightOf, preferredIds) - entryValue(b, weightOf, preferredIds),
      );
    const target = ordered[0];
    if (!target) return false;
    const lastWorking = [...remainingWorking(target)].pop();
    if (!lastWorking) return false;
    trimmed.push({ entry: target, set: lastWorking, at: target.sets.indexOf(lastWorking) });
    target.sets = target.sets.filter((set) => set !== lastWorking);
    // A set the week's need gave it goes first (Maintenance 34): its count goes with it.
    if (target.carried !== undefined) {
      if (target.carried > 1) target.carried -= 1;
      else delete target.carried;
    }
    syncRoundsOf(target);
    const trimmedName = exerciseOf(target.exerciseId).name;
    fitLog.add(`trimmed|${trimmedName}`, trimmedLine(trimmedName));
    return true;
  };

  let guard = 0;
  let restsExhausted = false;
  const limit = hardCap ? targetMinutes : targetMinutes + 1;
  // The moves left out, the one the leave-out order keeps longest first (Maintenance 24): the
  // day's only work for a muscle before a move the main lifts cover, then the best.
  const keptLongestFirst = (entries: readonly WorkoutEntry[]): WorkoutEntry[] => {
    const trained = trainedByMainLifts();
    return [...entries].sort(
      (a, b) =>
        leaveOutTier([b], trained) - leaveOutTier([a], trained) ||
        entryValue(b, weightOf, preferredIds) - entryValue(a, weightOf, preferredIds),
    );
  };
  const onItsOwn = (entry: WorkoutEntry, move: WorkoutEntry) => {
    const count = (candidate: WorkoutEntry) =>
      candidate.sets.filter((set) => set.kind === 'working').length;
    const sets = count(move);
    const fewer = sets < count(entry) ? ` at ${sets} ${sets === 1 ? 'set' : 'sets'}` : '';
    fitLog.add(
      `Kept ${exerciseOf(entry.exerciseId).name} on its own${fewer}: the minutes left fit it.`,
    );
  };
  // A move brought back on its own is tried as the plan would run it by now (Maintenance 24): its
  // rest shortened as far as the fit shortens rests, at its sets, then one fewer at a time down to
  // two (one for an exact end), never under the sets the plan had before harder added one. The row
  // cap leaves rows out before any rest is shortened or set trimmed.
  const tryInPlace = (entry: WorkoutEntry): WorkoutEntry | null => {
    const move = cloneEntry(entry);
    move.restSeconds = Math.min(move.restSeconds, floorFor(move));
    for (const set of move.sets) if (set.kind === 'working') set.restSeconds = move.restSeconds;
    const block = straightBlock(move, exerciseOf);
    blocks.push(block);
    // A catch-up's or a second workout's lift comes back at two at least, an end time's too (the
    // fourteenth review of round M: the EZ-bar curl came back on its own at one set).
    const least = hardCap && !offPlan ? 1 : Math.max(2, plannedSets.get(move.id) ?? 0);
    for (;;) {
      if (estimate().totalMinutes <= limit) return move;
      const working = move.sets.filter((set) => set.kind === 'working');
      if (working.length <= least) break;
      move.sets = move.sets.filter((set) => set !== working[working.length - 1]);
      block.rounds = working.length - 1;
    }
    blocks = blocks.filter((candidate) => candidate !== block);
    return null;
  };
  // With nothing that fits in the row's place, the lifts left take back the sets the fit trimmed,
  // the last trimmed first, each where it sat, while the minutes fit them (Maintenance 24): the
  // time is theirs.
  const giveBackTrimmed = () => {
    const left = allEntries(blocks);
    for (const { entry, set, at } of [...trimmed].reverse()) {
      if (!left.includes(entry)) continue;
      const sets = entry.sets;
      entry.sets = [...sets.slice(0, at), set, ...sets.slice(at)];
      syncRoundsOf(entry);
      if (estimate().totalMinutes <= limit) {
        const name = exerciseOf(entry.exerciseId).name;
        fitLog.add(`gave back|${name}`, gaveBackLine(name));
        continue;
      }
      entry.sets = sets;
      syncRoundsOf(entry);
    }
  };
  // Down to two exercises, a row that still does not fit goes, and a move left out that fits in
  // its place comes in (Maintenance 24): a main lift gives way this way once no isolation move is
  // left (docs/research/short-sessions.md, point 3). With none that fits, the row goes all the
  // same: the main lift stays, never a row to leave out, at its fewest sets by now, and the time
  // is that lift's.
  const swapForFit = (row: WorkoutBlock): void => {
    blocks = blocks.filter((candidate) => candidate !== row);
    let placed: { entry: WorkoutEntry; move: WorkoutEntry } | undefined;
    for (const entry of keptLongestFirst(leftOut.flatMap((block) => block.entries))) {
      const move = tryInPlace(entry);
      if (move) {
        placed = { entry, move };
        break;
      }
    }
    leftOut.push(row);
    fitLog.add(`Left out ${row.label} so the session fits ${targetMinutes} min.`);
    if (placed) onItsOwn(placed.entry, placed.move);
    else giveBackTrimmed();
  };
  // The rests a length asks for are the plan's own, whatever the lifter's pace: the pace trims sets
  // and moves, never a rest (the review of item 4: rests cut for it were the ones read against).
  const overAtPlanPace = (): boolean =>
    pace.factor === 1 ||
    estimateWorkout(blocks, generalWarmup, exerciseOf, isDone).totalMinutes > limit;
  while (estimate().totalMinutes > limit && guard < 40) {
    guard += 1;
    if (!restsExhausted && overAtPlanPace() && shortenRests()) continue;
    restsExhausted = true;
    if (trimSets()) continue;
    const lowest = nextToLeaveOut();
    if (!lowest) break;
    if (shrinkCircuit(lowest, `so the session fits ${targetMinutes} min`)) continue;
    if (hardCap || allEntries(blocks).length > 2) {
      dropBlock(lowest, `so the session fits ${targetMinutes} min`);
      continue;
    }
    swapForFit(lowest);
  }

  // 4b. Use the minutes a dropped block left behind. Blocks go whole, so the last one out can
  // leave a gap far bigger than the overrun it cured; a move from it, on its own, often fits where
  // the pair did not. Moves come back while they fit, the one the leave-out order keeps longest
  // first, each tried in place (Maintenance 24).
  if (estimate().totalMinutes <= limit) {
    for (const entry of keptLongestFirst(
      [...leftOut].reverse().flatMap((block) => block.entries),
    )) {
      if (blocks.length >= cap) break;
      // A move the fit already brought back stays once.
      if (allEntries(blocks).some((candidate) => candidate.id === entry.id)) continue;
      const move = tryInPlace(entry);
      if (move) onItsOwn(entry, move);
    }
  }
  // With an exact end time the rows went one by one to fit it: the lifts left take back the sets
  // the fit trimmed from them while the time still fits them (Maintenance 24).
  if (hardCap) giveBackTrimmed();
  // The muscles the fit cut: fewer direct sets than the plan gave them (Maintenance 34).
  const afterFit = directSets(allEntries(blocks), exerciseOf);
  const fitCut = MUSCLE_IDS.filter(
    (muscle) => (afterFit.get(muscle) ?? 0) < (beforeFit.get(muscle) ?? 0),
  );

  // 5. One optional, intelligent drop set on a safe isolation move. A drop set is a set taken
  // to failure, so a style that takes nothing to failure plans none.
  // None in a catch-up or a second workout: a few sets each, none to failure (the review of round M).
  // None on a day that keeps every set short of failure (a head cold, Maintenance 33).
  if (
    !offPlan &&
    dayRirFloor(adjust) === 0 &&
    profile.techniques.dropSets &&
    allowsFailure(resolveStyle(profile))
  ) {
    const deficitMuscles = new Set(
      priorities
        .filter(
          (priority) =>
            priority.weeklyTarget > 0 && priority.weeklySetsDone / priority.weeklyTarget < 0.5,
        )
        .map((priority) => priority.muscle),
    );
    const alreadyPlanned = allEntries(blocks).some((entry) => entry.dropSet);
    const target = alreadyPlanned
      ? undefined
      : [...allEntries(blocks)].reverse().find(
          (entry) =>
            restCategory(entry.role) === 'isolation' &&
            !keptIds.has(entry.id) &&
            exerciseOf(entry.exerciseId).dropSetSafe &&
            // On the extra exposure's day the extra is its muscles' added volume: no drop set for
            // them, which the cap could not count (the review of item 44).
            !(
              dayExtra !== null &&
              push !== null &&
              sharesPrimary(exerciseOf(entry.exerciseId), push.exercise)
            ) &&
            // A set the weights here pushed to its effort at a light load takes no drop set.
            !entryPushedToEffort(entry) &&
            !blocks.some(
              (block) => block.kind === 'superset' && block.entries[0]?.id === entry.id,
            ) &&
            (targetMinutes < defaultMinutes ||
              entry.chosenFor.some((muscle) => deficitMuscles.has(muscle))),
        );
    if (target) {
      const before = estimate().totalMinutes;
      target.dropSet = true;
      target.sets.push({
        index: target.sets.length,
        kind: 'drop',
        targetReps: [8, 12],
        targetRir: 0,
        targetWeight: null,
        restSeconds: 0,
      });
      if (estimate().totalMinutes > limit && before <= limit) {
        target.dropSet = false;
        target.sets.pop();
      } else {
        fitLog.add(
          `Added a drop set to ${exerciseOf(target.exerciseId).name} for extra volume in less time.`,
        );
      }
    }
  }

  for (const conflict of checkWorkoutConflicts(
    allEntries(blocks).map((entry) => exerciseOf(entry.exerciseId)),
    context,
  )) {
    if (conflict.severity === 'warn') compromises.push(conflict.message);
  }

  // 6. The need carried forward (Maintenance 34, the approved proposal part 2: "Carry forward the
  // need, not the exercise ... filled by whatever exercise fits next time, within a per-session
  // limit"): a set more on a lift that works a muscle the week is short of (`carry`, what today owes
  // it once the sessions after today are counted), accessories first, never over two more than the
  // lift's own nor the muscle over 11 sets today, and only into the room the length leaves, so the
  // plan's own sets are never displaced. None on a catch-up or a second workout, in a deload week, on
  // a day of high fatigue, of an illness (Maintenance 33's gate: a head cold keeps every set short of
  // failure, a fever is a rest day) or under "Make it easier", and none for a muscle still inside its
  // recovery window (Maintenance 33): its sets wait for it. A lift begun, kept, set by hand, in a
  // circuit or with a drop set takes none (a pair runs its longer member's rounds, so a set more on
  // one is a round more for it).
  const carriedFor = new Map<WorkoutEntry, MuscleId[]>();
  const carry = constraints.carry ?? {};
  if (
    !offPlan &&
    deload === null &&
    fatigue.level !== 'high' &&
    illnessOf(constraints.readiness ?? null) === null &&
    (constraints.adjust?.sets ?? 0) >= 0 &&
    Object.keys(carry).length > 0
  ) {
    const windows = recoveryWindows(
      history,
      dayRecovery({
        readiness: constraints.readiness ?? null,
        history,
        now,
        resets: input.resets ?? null,
      }),
    );
    const recovering = (muscle: MuscleId) => {
      const window = windows.get(muscle);
      return window !== undefined && hoursSince(window, now) < window.hours;
    };
    const setsToday = (muscle: MuscleId) =>
      allEntries(blocks).reduce((sum, entry) => {
        const exercise = exerciseOf(entry.exerciseId);
        const working = entry.sets.filter((set) => set.kind === 'working').length;
        if (exercise.primaryMuscles.includes(muscle)) return sum + working;
        if (exercise.secondaryMuscles.includes(muscle)) return sum + working * INDIRECT_SET_WEIGHT;
        return sum;
      }, 0);
    const owed = (muscle: MuscleId) => (carry[muscle] ?? 0) - setsToday(muscle);
    const takes = (block: WorkoutBlock, entry: WorkoutEntry, muscle: MuscleId) => {
      const last = [...entry.sets].reverse().find((set) => set.kind === 'working');
      return (
        block.kind !== 'circuit' &&
        exerciseOf(entry.exerciseId).primaryMuscles.includes(muscle) &&
        last !== undefined &&
        last.tier !== 'top' &&
        !entry.locked &&
        !entry.pinned &&
        !keptIds.has(entry.id) &&
        entry.manual?.sets !== true &&
        !entry.dropSet &&
        !entry.sets.some((set) => isDone(entry.id, set.index)) &&
        (entry.carried ?? 0) < RULES.carryLiftSets.value
      );
    };
    const owing = (Object.keys(carry) as MuscleId[])
      .filter((muscle) => !recovering(muscle) && owed(muscle) >= 1)
      .sort((a, b) => owed(b) - owed(a));
    let room = true;
    for (const muscle of owing) {
      while (room && owed(muscle) >= 1 && setsToday(muscle) + 1 <= RULES.carryMuscleSets.value) {
        const lift = blocks
          .flatMap((block) => block.entries.filter((entry) => takes(block, entry, muscle)))
          .sort(
            (a, b) =>
              Number(a.role === 'primary-strength') - Number(b.role === 'primary-strength') ||
              (a.carried ?? 0) - (b.carried ?? 0),
          )[0];
        const last = lift && [...lift.sets].reverse().find((set) => set.kind === 'working');
        if (!lift || !last) break;
        lift.sets.push({ ...last, index: Math.max(...lift.sets.map((set) => set.index)) + 1 });
        syncRoundsOf(lift);
        if (estimate().totalMinutes > limit) {
          lift.sets.pop();
          syncRoundsOf(lift);
          room = false;
          break;
        }
        lift.carried = (lift.carried ?? 0) + 1;
        carriedFor.set(lift, [...new Set([...(carriedFor.get(lift) ?? []), muscle])]);
      }
    }
    for (const [entry, muscles] of carriedFor) {
      if (!entry.progression) continue;
      const count = entry.carried ?? 0;
      const line = `${count === 1 ? 'A set' : `${count} sets`} more for the ${musclesInWords(muscles)}, which this week is short of.`;
      entry.progression = {
        ...entry.progression,
        evidence: [line, ...entry.progression.evidence.filter((one) => !CARRIED_LINE.test(one))],
      };
    }
  }

  const time = estimate();
  const overBy = Math.max(0, Math.round((time.totalMinutes - targetMinutes) * 10) / 10);
  if (overBy > 1) {
    compromises.push(
      `Even the leanest version runs about ${Math.round(overBy)} min over ${targetMinutes} min.`,
    );
  }

  // 5. Week-aware order: after the anchor, accessories for muscles behind their weekly target lead.
  // A catch-up or a second workout is laid out in its own order, what it is for in it (the ninth
  // review of round M: the order moved a catch-up's squat behind its calf raise).
  const behindNames: string[] = [];
  if (keep.length === 0 && blocks.length > 2 && !offPlan) {
    const isBehind = (block: WorkoutBlock) =>
      block.kind === 'straight' &&
      (block.entries[0] as WorkoutEntry).chosenFor.some(
        (muscle) => loads[muscle] === 'behind' || muscle === focus,
      );
    // The lift to push and the day's main lift keep the top places (the review of item 44).
    const holds = (block: WorkoutBlock | undefined, entry: WorkoutEntry | undefined) =>
      block !== undefined &&
      entry !== undefined &&
      block.entries.some((one) => one.id === entry.id);
    const lead = holds(blocks[0], pushEntry) && holds(blocks[1], anchor) ? 2 : 1;
    const head = blocks.slice(0, lead);
    const rest = blocks.slice(lead);
    const led = rest.filter(isBehind);
    if (led.length > 0 && led.length < rest.length) {
      blocks = [...head, ...led, ...rest.filter((block) => !isBehind(block))];
      for (const block of led) {
        for (const muscle of (block.entries[0] as WorkoutEntry).chosenFor) {
          if (
            (loads[muscle] === 'behind' || muscle === focus) &&
            !behindNames.includes(muscleName(muscle))
          ) {
            behindNames.push(muscleName(muscle));
          }
        }
      }
    }
  }

  const anchorExercise = anchor ? exerciseOf(anchor.exerciseId) : undefined;
  const topPriorities = priorities.slice(0, 3);
  const reasons: string[] = [
    ...(spec && (catchUp !== null || spec.kind === 'second') ? catchUpLines(spec, blocks) : []),
    `Goal ${goalLabel(profile.goals.primary)}${profile.goals.secondary !== 'none' ? ` with ${goalLabel(profile.goals.secondary)}` : ''}: ${template.title.toLowerCase()} session, ${styleLine(profile)}.`,
    `Priority muscles today: ${topPriorities.map((priority) => priority.reason).join('; ')}.`,
    `Built for ${location?.name ?? 'your place'} from the equipment saved there, every pick checked by the conflict engine.`,
  ];
  // What leads: the lift to push, else the day's extra swapped or stood in for, else the main lift
  // (the re-check of item 44: a swapped extra led while the lines named the main lift first), or a
  // lift still to do that comes before it: in a catch-up's layout kept from another place, a lift
  // begun or pinned there (the eighth review of round M).
  const inOrder = allEntries(blocks);
  const firstToDo = inOrder.find((entry) => !isStopped(entry));
  const beforeMain =
    firstToDo !== undefined &&
    anchor !== undefined &&
    inOrder.indexOf(firstToDo) < inOrder.indexOf(anchor);
  const leaderEntry =
    pushEntry ?? leading.find((entry) => !isStopped(entry)) ?? (beforeMain ? firstToDo : anchor);
  const leader = leaderEntry ? exerciseOf(leaderEntry.exerciseId) : undefined;
  if (push && pushEntry) {
    reasons.push(
      pushLine(
        push.exercise.name,
        pushTargetText(push.push, profile.units),
        pushEntry.push === 'extra',
        true,
        // Under Light weights the extra is in the style's longer range, and Foundation keeps a new
        // lifter off the heavy one: not heavy (the review and the re-check).
        heavyExtra(profile),
      ),
    );
  }
  if (anchorExercise && anchor) {
    reasons.push(mainLiftLine(anchorExercise.name, anchor.role, anchor === leaderEntry));
  }
  // The cap's sets off lifts the plan still has: one the time fit left out says nothing here.
  const inPlan = new Map(allEntries(blocks).map((entry) => [entry.id, entry]));
  const capLines = capTrims.flatMap(({ id, count }) => {
    const entry = inPlan.get(id);
    return entry
      ? [`${count} ${count === 1 ? 'set' : 'sets'} off ${exerciseOf(entry.exerciseId).name}`]
      : [];
  });
  if (capLines.length > 0 && push) {
    reasons.push(
      `With the extra ${push.exercise.name}, its muscles stay under their weekly cap: ${capLines.join(', ')}.`,
    );
  }
  if (push && !pushEntry && !pushPlace(template.slots) && push.noExtra !== null) {
    reasons.push(`No extra ${push.exercise.name} today: ${push.noExtra}.`);
  }
  if (keep.length > 0)
    reasons.push(
      `Kept ${keep.length} ${keep.length === 1 ? 'exercise' : 'exercises'} in place: logged sets and pinned picks never move.`,
    );
  reasons.push(...swapLines(blocks, constraints.swaps ?? [], preferredIds));
  if (exposure.sessionsLast14Days === 0)
    reasons.push('No history yet, so weekly volume starts from the plan defaults.');
  if (exposure.sessionsLast14Days > 0) {
    const ready = template.muscles.filter((muscle) => {
      const days = exposure.daysSinceMuscle[muscle];
      return days === undefined || days >= 2;
    });
    const resting = MUSCLE_IDS.filter(
      (muscle) =>
        !template.muscles.includes(muscle) && (exposure.daysSinceMuscle[muscle] ?? 99) < 2,
    );
    const readyDays = Math.floor(
      Math.min(...ready.map((muscle) => exposure.daysSinceMuscle[muscle] ?? 7)),
    );
    reasons.push(
      `${
        ready.length > 0
          ? `${ready.slice(0, 3).map(muscleName).join(', ')} ${ready.length === 1 ? 'has' : 'have'} had ${readyDays}+ days to recover`
          : `${template.title} muscles are the freshest available`
      }${
        resting.length > 0
          ? `; ${resting.slice(0, 2).map(muscleName).join(' and ')} trained in the last two days, so ${resting.length === 1 ? 'it sits' : 'they sit'} out`
          : ''
      }: ${template.title.toLowerCase()} today.`,
    );
  }
  if (carriedFor.size > 0) {
    const sets = [...carriedFor.keys()].reduce((sum, entry) => sum + (entry.carried ?? 0), 0);
    const muscles = [...new Set([...carriedFor.values()].flat())];
    reasons.push(
      `This week is short of the ${musclesInWords(muscles)}: ${sets === 1 ? 'a set' : `${sets} sets`} more for ${muscles.length === 1 ? 'it' : 'them'}, in the room ${targetMinutes} min leaves.`,
    );
  }
  if (behindNames.length > 0) {
    reasons.push(
      `${behindNames.slice(0, 3).join(', ')} ${behindNames.length === 1 ? 'is' : 'are'} behind this week: the accessories lead with ${behindNames.length === 1 ? 'it' : 'them'}.`,
    );
  }
  if (
    focus !== null &&
    allEntries(blocks).some((entry) => exerciseOf(entry.exerciseId).primaryMuscles.includes(focus))
  ) {
    reasons.push(
      `${muscleName(focus)} ${muscleVerb(focus, 'leads', 'lead')} today: your coach focus.`,
    );
  }
  if (deload) reasons.push(deloadReason(blocks, deload));
  const paceLine = paceReason(pace);
  if (paceLine) reasons.push(paceLine);
  // A loaded version in place of a bodyweight move outgrown, or too light by default (item 31):
  // said of an entry the rule put in, not one a swap did (the swap says so), and only where the
  // bodyweight move could stand.
  const doneHere = lastDoneHere(history, location?.id ?? null);
  for (const entry of allEntries(blocks)) {
    if (entry.standsFor !== undefined) continue;
    const bodyweightId = BODYWEIGHT_VERSION[entry.exerciseId];
    const bodyweight = bodyweightId ? getExercise(bodyweightId) : undefined;
    if (!bodyweight || isBlocked(checkExerciseFit(bodyweight, context))) continue;
    const line = loadedVersionLine(entry.exerciseId, outgrown, swappedOut, doneHere);
    if (line) reasons.push(line);
  }
  reasons.push(
    `${profile.restStyle.charAt(0).toUpperCase() + profile.restStyle.slice(1)} rests; supersets ${profile.techniques.supersets ? 'on' : 'off'}, drop sets ${profile.techniques.dropSets ? 'on' : 'off'}, circuits ${profile.techniques.circuits ? 'on' : 'off'}.`,
  );

  const count = allEntries(blocks).length;
  // A catch-up or second workout with no lift left, each one working a muscle that rests today: the
  // day plans as with nothing behind (the review of round M). One the lifter's changes emptied, its
  // slots kept with the plan, stays the catch-up it was, with nothing more for today (the thirteenth
  // review of round M: "Make it harder" after its only lift was left out planned the push day).
  const rebuilt = (constraints.catchUpSlots?.length ?? 0) > 0;
  // Nor one the lifter's own changes emptied: with nothing set aside today it has lifts (the
  // fourteenth review of round M: a length picked after its only lift was left out planned the push
  // day, a set to failure among it).
  // Built again with the lifts the lifter set aside, and the joints reported today, set aside too
  // (the fifteenth review of round M: "Hurts" set the lift aside and recorded the joint, which still
  // ruled it out).
  // A joint reported in the check-in sets no lift aside, and empties a catch-up all the same (the
  // sixteenth review). So do the lifts swapped away today (the eighteenth).
  const emptiedByLifter = (): boolean => {
    if (
      (constraints.excludeExerciseIds?.length ?? 0) === 0 &&
      (constraints.painJoints?.length ?? 0) === 0 &&
      away.size === 0
    ) {
      return false;
    }
    // The offer as it would be with nothing set aside, the layout emptied today too: whether the
    // place has a lift for it at all (the nineteenth review of round M).
    const open: GenerationConstraints = {
      ...constraints,
      excludeExerciseIds: [],
      painJoints: [],
      awayIds: [],
    };
    delete open.emptiedLayouts;
    const whole = generateWorkout({ ...input, constraints: open });
    return whole.templateId === template.id && allEntries(whole.blocks).length > 0;
  };
  if (catchUp !== null && count === 0 && !rebuilt && !emptiedAgain && !emptiedByLifter()) {
    return generateWorkout({
      ...input,
      constraints: { ...constraints, catchUp: { ...catchUp, muscles: [] } },
    });
  }
  const fittedLabel =
    constraints.targetMinutesOverride !== undefined
      ? `, fitted to the ${targetMinutes} min left`
      : fitLog.size > 0 && duration !== 'default'
        ? `, fitted to ${targetMinutes} min`
        : '';
  // A second workout with nothing left to give: every lift left works a muscle that rests today. A
  // catch-up the lifter's changes emptied has nothing more either.
  const nothing = (spec?.kind === 'second' || catchUp !== null) && count === 0;
  const summary = nothing
    ? 'Nothing more for today.'
    : `${template.title}: ${exercisesCount(count)} in about ${Math.round(time.totalMinutes)} min${leader ? `, ${leader.name} first` : ''}${fittedLabel}.`;

  return {
    id: `wk-${localDayKey(now)}-${template.id}-${duration}`,
    templateId: template.id,
    title: nothing && spec?.kind === 'second' ? CATCH_UP_TITLES.second.title : template.title,
    goal: goalLabel(profile.goals.primary),
    generatedAt: now,
    locationId: location?.id ?? null,
    duration: {
      choice: duration,
      targetMinutes,
      defaultMinutes,
      estimatedMinutes: Math.round(time.totalMinutes),
      overByMinutes: overBy,
      ...(pace.factor !== 1 ? { pace: pace.factor } : {}),
    },
    musclePriorities: priorities,
    blocks,
    warmup: {
      generalMinutes: generalWarmup,
      rampEntryIds: allEntries(blocks)
        .filter((entry) => entry.warmupSets > 0)
        .map((entry) => entry.id),
      note: warmupNote(generalWarmup, targetMinutes),
    },
    explanation: { summary, reasons, fittingSteps: fitLog.lines(), time },
    confidence:
      exposure.sessionsLast14Days >= 3
        ? 'high'
        : exposure.sessionsLast14Days >= 1
          ? 'medium'
          : 'low',
    compromises: [...new Set(compromises)],
    recalibration: { version: 1, lastTrigger: null },
    // What the time fit cut (Maintenance 34): the next plan spares those muscles.
    ...(fitCut.length > 0 ? { fitCut } : {}),
    ...(catchUp
      ? {
          catchUpSlots: slots.map((candidate) => ({
            ...candidate,
            muscles: [...candidate.muscles],
          })),
        }
      : {}),
  };
}

function goalLabel(
  goal: UserProfile['goals']['primary'] | UserProfile['goals']['secondary'],
): string {
  switch (goal) {
    case 'build-muscle':
      return 'build muscle';
    case 'bigger-arms':
      return 'bigger arms';
    case 'bigger-chest':
      return 'bigger chest';
    case 'overall-size':
      return 'more overall size';
    case 'strength':
      return 'strength progress';
    case 'balanced':
      return 'build muscle';
    case 'none':
      return 'none';
  }
}

function styleLine(profile: UserProfile): string {
  const info = styleInfo(resolveStyle(profile));
  // Under Auto the line says which style the goals came to.
  return isAutoStyle(profile)
    ? `${info.session} (${info.name}, picked from your goals)`
    : info.session;
}

/**
 * The line on the plan's main lift. It leads while it comes first; moved later (busy equipment,
 * or by hand) it is still the main lift, and the line says so (Maintenance 25).
 */
export function mainLiftLine(name: string, role: TrainingRole, leads: boolean): string {
  return leads
    ? `${name} leads as the ${roleLabel(role)} lift with full rests and warm-up ramp sets.`
    : `${name} is the ${roleLabel(role)} lift, with full rests and warm-up ramp sets.`;
}

const MAIN_LIFT_LINE =
  /^(.+?) (?:leads as|is) the .+ lift,? with full rests and warm-up ramp sets\.$/;

/** The lift a main-lift line names, or null for any other line. */
export function mainLiftName(line: string): string | null {
  return MAIN_LIFT_LINE.exec(line)?.[1] ?? null;
}

export function isMainLiftLine(line: string): boolean {
  return MAIN_LIFT_LINE.test(line);
}

function roleLabel(role: TrainingRole): string {
  return role.replace(/-/g, ' ');
}

export function describeMuscles(muscles: readonly MuscleId[]): string {
  return muscles.map(muscleName).join(', ');
}
