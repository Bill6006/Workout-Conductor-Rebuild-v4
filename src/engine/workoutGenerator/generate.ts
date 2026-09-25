import { muscleLoads, type MuscleLoad } from '../alternatives/signals';
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
import type { UserProfile } from '../../core/validation/profile';
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
  type SetDonePredicate,
} from '../duration/duration';
import {
  MIN_REST_SECONDS,
  ROLE_RANK,
  buildSets,
  prescribeFor,
  rampSetsFor,
  restCategory,
  rirFloor,
  type Prescription,
  type RampContext,
} from '../progression/roles';
import { allowsFailure, isAutoStyle, resolveStyle } from '../planning/styleAdvice';
import { styleInfo } from '../planning/styles';
import { loadingFor, type SessionLoading } from '../loading/loading';
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
import { precedingWorkToday, type EarlierWork } from '../recovery/sessionContext';
import {
  computeExposure,
  computeMusclePriorities,
  computeWeeklyVolume,
  type Exposure,
} from '../volume/weeklyVolume';
import {
  allEntries,
  isStopped,
  workingSets,
  type DurationChoice,
  type GeneratedWorkout,
  type MusclePriority,
  type TimeBreakdown,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../workout/types';
import type { LastingSwap } from '../planning/lastingSwaps';

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
}

/**
 * Ends an entry at its logged sets. Only unlogged sets go; a logged set, skipped or not, is
 * never touched. The first close writes on the entry how many working sets it still owed:
 * the sets it counted are gone after this, and every later rebuild still has to know.
 */
export function closeAtLogged(
  entry: WorkoutEntry,
  isDone: SetDonePredicate,
  why: 'place' | 'swap' = 'place',
): void {
  const planned = entry.sets.some((set) => set.kind === 'working');
  const owed = entry.sets.filter(
    (set) => set.kind === 'working' && !isDone(entry.id, set.index),
  ).length;
  entry.sets = entry.sets.filter((set) => isDone(entry.id, set.index));
  entry.warmupSets = entry.sets.filter((set) => set.kind === 'warmup').length;
  entry.dropSet = entry.sets.some((set) => set.kind === 'drop');
  if (entry.stopped === undefined && planned) entry.stopped = { owed, why };
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
}

/** A logged set as the session context needs it: whose, what kind, when, and whether it was skipped. */
export interface CompletedSetStamp {
  entryId: string;
  kind: 'warmup' | 'working' | 'drop';
  completedAt: string;
  skipped?: boolean;
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
}

interface Slot {
  pattern: MovementPatternId;
  role: TrainingRole;
  muscles: MuscleId[];
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
  // A new lifter gains most from training each muscle about three times a week (Rhea et al.,
  // 2003), which full-body and upper/lower sessions give and a four-way split does not.
  const pool =
    profile.schedule.weeklyFrequency <= 3 || style === 'foundation'
      ? [FULL_BODY, UPPER, LOWER]
      : strengthGoal
        ? [FULL_BODY, LOWER, UPPER, PUSH_ARMS, PULL_ARMS]
        : [PUSH_ARMS, PULL_ARMS, LOWER, UPPER];
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
}

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
  const candidates = exercisesByPattern(slotSpec.pattern)
    .filter((exercise) => !chosenIds.has(exercise.id))
    .filter((exercise) => (strengthRole ? exercise.compound : true))
    .filter((exercise) => !isBlocked(checkExerciseFit(exercise, picker.context)))
    .filter(
      (exercise) =>
        !blocksCandidate(checkWorkoutConflicts([...chosen, exercise], picker.context), exercise.id),
    );

  const score = (exercise: CatalogExercise) => {
    const suitability = strengthRole
      ? exercise.strengthSuitability * 10 + exercise.hypertrophySuitability
      : exercise.hypertrophySuitability * 10 + exercise.strengthSuitability;
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
      focus -
      stressPenalty(exercise) * 2 -
      exercise.setupSeconds / 60
    );
  };

  // A preferred exercise that fits the slot wins it outright; the score only orders the rest,
  // and preferred ones among themselves.
  const tier = (exercise: CatalogExercise) => (picker.preferredIds.has(exercise.id) ? 1 : 0);
  candidates.sort(
    (a, b) => tier(b) - tier(a) || score(b) - score(a) || a.name.localeCompare(b.name),
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
  const candidates = allExercises()
    .filter((exercise) => exercise.primaryMuscles.includes(muscle))
    .filter((exercise) => !chosenIds.has(exercise.id))
    .filter((exercise) => !isBlocked(checkExerciseFit(exercise, picker.context)))
    .filter(
      (exercise) =>
        !blocksCandidate(checkWorkoutConflicts([...chosen, exercise], picker.context), exercise.id),
    );
  const score = (exercise: CatalogExercise) =>
    exercise.hypertrophySuitability * 10 +
    (exercise.compound ? 0 : 8) +
    (picker.preferredIds.has(exercise.id) ? 15 : 0) -
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
 * swap-in fits this place. Where the swap-in does not fit, the plan's own pick stands.
 */
export function swappedOutIds(
  swaps: readonly LastingSwap[],
  context: ConflictContext,
): Set<string> {
  return new Set(
    swaps
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
): string[] {
  const byFrom = new Map(swaps.map((swap) => [swap.from, swap]));
  return allEntries(blocks).flatMap((entry) => {
    const swap = entry.standsFor ? byFrom.get(entry.standsFor) : undefined;
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
): string[] {
  const isSwapLine = (line: string) => line.endsWith(KEPT_LINE) || line.endsWith(AROUND_LINE);
  const others = reasons.filter((line) => !isSwapLine(line));
  const first = reasons.findIndex(isSwapLine);
  const lead = others.reduce(
    (last, line, index) =>
      line.includes(' leads as the ') || line.startsWith('Kept ') ? index : last,
    Math.min(others.length, 3) - 1,
  );
  const at = first >= 0 ? first : lead + 1;
  return [...others.slice(0, at), ...swapLines(blocks, swaps), ...others.slice(at)];
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
}): Picker {
  const context = sessionConflictContext(input.profile, input.location, input.constraints ?? {});
  return {
    context,
    preferredIds: preferredIdsOf(input.profile),
    exposure: computeExposure(input.history, input.now),
    loads: muscleLoads(input.history, input.profile, input.now),
    focus: input.focus ?? null,
    excluded: swappedOutIds(input.swaps ?? [], context),
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
    rounds: workingSets(entry).length,
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
  return {
    ...target,
    weight: Math.max(step, Math.round((target.weight * scale) / step) * step),
    evidence: [...target.evidence, `Deload week: loads ${Math.round((1 - scale) * 100)}% lighter.`],
  };
}

/** A deload can scale a bar lift under the empty bar; the bar is the floor. */
export function floorTarget(target: NextTarget, floor: number | null): NextTarget {
  if (floor === null || target.weight === null || target.weight >= floor) return target;
  return { ...target, weight: floor };
}

function adjustPrescription(
  prescription: Prescription,
  role: TrainingRole,
  adjust: PrescriptionAdjustment | undefined,
  /** The exercise's `rirFloor`: harder never takes it under this. */
  minRir = 0,
): Prescription {
  if (!adjust) return prescription;
  const floor = role === 'primary-strength' ? 3 : 2;
  return {
    ...prescription,
    sets: clamp(prescription.sets + adjust.sets, floor, 5),
    rir: clamp(prescription.rir + adjust.rir, minRir, 4),
    restSeconds: Math.max(
      MIN_REST_SECONDS[restCategory(role)],
      round5(prescription.restSeconds * adjust.restFactor),
    ),
  };
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
  const template =
    (constraints.templateId
      ? TEMPLATES.find((candidate) => candidate.id === constraints.templateId)
      : undefined) ?? chooseTemplate(profile, priorities, exposure, loads, focus);
  const deload = constraints.deload ?? null;
  const adjust: PrescriptionAdjustment | undefined = deload
    ? {
        sets: (constraints.adjust?.sets ?? 0) + DELOAD_SETS_DELTA,
        rir: (constraints.adjust?.rir ?? 0) + DELOAD_RIR_DELTA,
        restFactor: constraints.adjust?.restFactor ?? 1,
        loadScale: DELOAD_LOAD_SCALE,
      }
    : constraints.adjust;
  const defaultMinutes = profile.schedule.typicalDurationMinutes;
  const targetMinutes =
    constraints.targetMinutesOverride ?? resolveTargetMinutes(duration, defaultMinutes);
  const hardCap = constraints.hardCap ?? false;
  const isDone: SetDonePredicate = constraints.isSetDone ?? (() => false);
  const completedSets = constraints.completedSets ?? [];
  const compromises: string[] = [];
  // Swapped out for weeks where the swap-in fits here: out of the whole plan, every slot.
  const swappedOut = swappedOutIds(constraints.swaps ?? [], context);
  const picker: Picker = { context, preferredIds, exposure, loads, focus, excluded: swappedOut };
  const fatigue = interpretFatigue(history, now, constraints.readiness ?? null);

  // Entries the caller keeps: logged work is frozen; pinned picks, explicit
  // selections, and accepted alternatives stay in their slots.
  const keep = constraints.keep ?? [];
  const keptIds = new Set(keep.map((kept) => kept.entry.id));
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
  // New entries are named by their slot, unless a kept entry already has that name.
  const takenIds = new Set(keep.map((kept) => kept.entry.id));
  let spareId = Math.max(
    template.slots.length,
    ...[...takenIds].map((id) => Number(/^e(\d+)$/.exec(id)?.[1] ?? 0)),
  );
  const idFor = (index: number): string => {
    let id = `e${index + 1}`;
    if (takenIds.has(id)) {
      spareId += 1;
      id = `e${spareId}`;
    }
    takenIds.add(id);
    return id;
  };
  const entries: WorkoutEntry[] = [];
  const plannedSets = new Map<string, number>();
  // Stopped entries that do not fit here were ended again by the caller; the others fit now.
  const closedNow = new Set(keep.filter((kept) => kept.closed).map((kept) => kept.entry.id));
  // The lifter's lasting swaps, by the exercise swapped out.
  const swapOf = new Map((constraints.swaps ?? []).map((swap) => [swap.from, swap]));
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
  ) => {
    // What comes before this exercise today, planned or done, and whether a long break sits
    // between: the target and the ramps both read it.
    const earlier = sessionWork(entries, completedSets, exerciseOf);
    const preceding = precedingWorkToday(exercise, earlier, now);
    const baseTarget = recommendNextTarget({
      exercise,
      role,
      prescription,
      history,
      profile,
      fatigueLevel: fatigue.level,
      now,
      maxes,
      session: { precedingSets: preceding.sets },
    });
    const floor = barWeightFor(exercise, profile.units);
    // What this place can load: the target lands on a weight that exists here, or holds at
    // the heaviest one with the reps pushed instead.
    const loading = loadingFor(
      location?.loading,
      constraints.sessionLoading,
      exercise,
      profile.units,
    );
    const target = capTarget(
      floorTarget(scaleForDeload(baseTarget, adjust, loading.step), floor),
      loading,
      profile.units,
      role,
    );
    const warmupSets = rampSetsFor(
      exercise,
      role,
      targetMinutes,
      rampContextFor(exercise, earlier, preceding.afterBreak),
      { weight: target.weight, step: loading.step, floor },
    );
    return {
      sets: applyProgression(
        buildSets(prescription, warmupSets, exercise),
        target,
        loading.step,
        {},
        floor,
        loading,
      ),
      warmupSets,
      progression: summarizeProgression(target),
    };
  };

  /**
   * Back where a stopped exercise fits again, it picks up the sets its slot still owes
   * (Maintenance 22), unless the lifter chose another exercise for the slot or a stand-in is
   * under way. A stand-in kept only because it came next, with nothing logged, gives way.
   * True when the slot was filled this way.
   */
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
    const owed = Math.min(...kept.filter(isStopped).map(owedBy));
    if (!(owed > 0)) return false;
    // The stopped entries stay as the history they are; a stand-in that gave way goes.
    for (const entry of others) {
      if (isStopped(entry)) continue;
      const at = chosenExercises.findIndex((chosen) => chosen.id === entry.exerciseId);
      if (at >= 0) chosenExercises.splice(at, 1);
    }
    entries.push(...kept.filter(isStopped));
    const exercise = exerciseOf(target.exerciseId);
    const adjusted = adjustPrescription(
      prescribeFor(exercise, target.role, profile, history),
      target.role,
      adjust,
      rirFloor(exercise),
    );
    const built = targetedFor(exercise, target.role, {
      ...adjusted,
      sets: Math.min(adjusted.sets, owed),
      restSeconds: target.restSeconds,
    });
    const from = Math.max(-1, ...target.sets.map((set) => set.index)) + 1;
    target.sets = [
      ...target.sets,
      ...built.sets.map((set) => ({ ...set, index: set.index + from })),
    ];
    target.warmupSets = target.sets.filter((set) => set.kind === 'warmup').length;
    target.dropSet = target.sets.some((set) => set.kind === 'drop');
    target.progression = built.progression;
    delete target.stopped;
    return true;
  };

  /** A lasting swap of the lifter's puts the exercise swapped in wherever it fits here. */
  const swappedIn = (pick: CatalogExercise): CatalogExercise => {
    const swap = swapOf.get(pick.id);
    const next = swap ? getExercise(swap.to) : undefined;
    if (!swap || !next) return pick;
    if (chosenExercises.some((chosen) => chosen.id === next.id)) return pick;
    if (isBlocked(checkExerciseFit(next, context))) return pick;
    if (blocksCandidate(checkWorkoutConflicts([...chosenExercises, next], context), next.id)) {
      return pick;
    }
    return next;
  };

  /** Whether an exercise can join the exercises in the plan so far: not in, and no clash. */
  const fitsWith = (candidate: CatalogExercise): boolean =>
    !chosenExercises.some((chosen) => chosen.id === candidate.id) &&
    !blocksCandidate(checkWorkoutConflicts([...chosenExercises, candidate], context), candidate.id);

  template.slots.forEach((slotSpec, index) => {
    const kept = keptBySlot.get(index);
    const owed = owedBySlot.get(index);
    if (kept) {
      if (reopened(kept)) return;
      entries.push(...kept);
      // Work stopped at another place leaves its slot owing sets: a stand-in follows it.
      if (owed === undefined) return;
    }
    // The plan's own pick first, judged as if no swap were kept; one swapped out gives way to its
    // swap-in, or to the next best when the swap-in is already in the workout. An own pick a kept
    // swap already put in an earlier slot gives way to the next best too.
    // The slot's own kept entries count as themselves: the stand-in for one stopped here is judged
    // as the slot's own pick would be.
    const mine = new Set((kept ?? []).map((entry) => entry.exerciseId));
    const ownPicks = chosenExercises.map((chosen) =>
      mine.has(chosen.id) ? chosen : (ownOf.get(chosen.id) ?? chosen),
    );
    const natural = pickForSlot(slotSpec, ownPicks, { ...picker, excluded: undefined });
    let pick = natural;
    if (natural && swappedOut.has(natural.id)) {
      const next = swappedIn(natural);
      // With its swap-in unable to join and nothing else fitting, the plan's own pick stays:
      // a kept swap applies where it fits, and never empties a slot.
      pick =
        next !== natural
          ? next
          : (pickForSlot(slotSpec, chosenExercises, picker) ??
            (fitsWith(natural) ? natural : undefined));
    } else if (natural && !fitsWith(natural)) {
      // Already in, or clashing with a kept swap's exercise: the next best that fits the plan.
      pick = pickForSlot(slotSpec, chosenExercises, picker);
    }
    if (!pick) {
      compromises.push(
        `No ${slotSpec.pattern.replace(/-/g, ' ')} option fits ${location?.name ?? 'this place'} and your limits.`,
      );
      return;
    }
    if (natural && pick !== natural) ownOf.set(pick.id, natural);
    chosenExercises.push(pick);
    const id = idFor(index);
    const basePrescription = prescribeFor(pick, slotSpec.role, profile, history);
    const adjusted = adjustPrescription(basePrescription, slotSpec.role, adjust, rirFloor(pick));
    // A replacement carries only the working sets its slot still owes.
    const prescription =
      owed === undefined ? adjusted : { ...adjusted, sets: Math.min(adjusted.sets, owed) };
    // Asked to make it harder, the time fit may take back an added set, never one the plan had.
    if ((adjust?.sets ?? 0) > 0) {
      plannedSets.set(
        id,
        owed === undefined ? basePrescription.sets : Math.min(basePrescription.sets, owed),
      );
    }
    const built = targetedFor(pick, slotSpec.role, prescription);
    const chosenFor = slotSpec.muscles.filter((muscle) => pick.primaryMuscles.includes(muscle));
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
    });
  });
  entries.push(...keptUnslotted);

  // The main lift is the first one still to do: a lift stopped at another place is history,
  // and the stand-in carrying its sets leads in its place.
  const anchor =
    entries.find((entry) => entry.role === 'primary-strength' && !isStopped(entry)) ?? entries[0];
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
      rounds: Math.min(...members.map((member) => workingSets(member).length)),
    });
  }

  const fittingSteps: string[] = [];
  const generalWarmup =
    constraints.generalWarmupMinutesOverride ?? generalWarmupMinutes(targetMinutes);
  const estimate = (): TimeBreakdown => estimateWorkout(blocks, generalWarmup, exerciseOf, isDone);

  const untouchable = (entry: WorkoutEntry) =>
    entry.id === anchorId || entry.pinned || entry.locked || keptIds.has(entry.id);
  const lowestValueBlock = (): WorkoutBlock | undefined => {
    const candidates = blocks.filter((block) => !block.entries.some(untouchable));
    if (candidates.length === 0) return undefined;
    return [...candidates].sort((a, b) => blockValue(a) - blockValue(b))[0];
  };
  // Paired blocks save time, so they outrank their weakest member when something must go,
  // and time efficiency matters even more on short sessions.
  const pairedBonus = targetMinutes <= 30 ? 55 : 25;
  const blockValue = (block: WorkoutBlock) =>
    Math.min(...block.entries.map((entry) => entryValue(entry, weightOf, preferredIds))) +
    (block.kind === 'straight' ? 0 : pairedBonus);

  // Blocks the time fit had to leave out, in the order they went; the fill-back pass reads them.
  const leftOutForTime: WorkoutBlock[] = [];
  const dropBlock = (block: WorkoutBlock, why: string, forTime = false) => {
    blocks = blocks.filter((candidate) => candidate.id !== block.id);
    if (forTime) leftOutForTime.push(block);
    fittingSteps.push(`Left out ${block.label} ${why}.`);
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
      const rounds = Math.min(3, ...members.map((entry) => workingSets(entry).length));
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
      fittingSteps.push(`Ran ${members.length} isolation moves as a ${rounds}-round circuit.`);
    }
  }

  if (profile.techniques.supersets) {
    let pairs = 0;
    const candidates = isolationEntries();
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
        const rounds = Math.min(workingSets(a).length, workingSets(b).length);
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
        fittingSteps.push(`Paired ${exerciseA.name} with ${exerciseB.name} as a superset.`);
        pairs += 1;
        break;
      }
    }
  }

  // 3. Cap the number of list rows for the chosen length; paired rows count once.
  const cap = capFor(targetMinutes);
  while (blocks.length > cap) {
    const lowest = lowestValueBlock();
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
    if (changed) fittingSteps.push('Shortened rests toward the realistic minimum.');
    return changed;
  };
  const remainingWorking = (entry: WorkoutEntry) =>
    entry.sets.filter((set) => set.kind === 'working' && !isDone(entry.id, set.index));
  const trimmable = (entry: WorkoutEntry): boolean => {
    // Locked and logged entries keep their sets unless the user asked for an exact end.
    if (!hardCap && (keptIds.has(entry.id) || entry.locked || entry.pinned)) return false;
    const floor = entry.id === anchorId ? (hardCap ? 2 : 3) : hardCap ? 1 : 2;
    const planned = hardCap ? 0 : (plannedSets.get(entry.id) ?? 0);
    return remainingWorking(entry).length > Math.max(floor, planned);
  };
  const trimSets = (): boolean => {
    const ordered = allEntries(blocks)
      .filter(trimmable)
      .sort(
        (a, b) => entryValue(a, weightOf, preferredIds) - entryValue(b, weightOf, preferredIds),
      );
    const target = ordered[0];
    if (!target) return false;
    const lastWorking = [...remainingWorking(target)].pop();
    if (!lastWorking) return false;
    target.sets = target.sets.filter((set) => set !== lastWorking);
    for (const block of blocks) {
      if (block.kind !== 'straight' && block.entries.includes(target)) {
        block.rounds = Math.min(...block.entries.map((entry) => workingSets(entry).length));
      }
      if (block.kind === 'straight' && block.entries[0] === target)
        block.rounds = workingSets(target).length;
    }
    fittingSteps.push(`Trimmed one set from ${exerciseOf(target.exerciseId).name}.`);
    return true;
  };

  let guard = 0;
  let restsExhausted = false;
  const limit = hardCap ? targetMinutes : targetMinutes + 1;
  while (estimate().totalMinutes > limit && guard < 40) {
    guard += 1;
    if (!restsExhausted && shortenRests()) continue;
    restsExhausted = true;
    if (trimSets()) continue;
    const lowest = lowestValueBlock();
    if (lowest && (hardCap || allEntries(blocks).length > 2)) {
      dropBlock(lowest, `so the session fits ${targetMinutes} min`, true);
      continue;
    }
    break;
  }

  // 4b. Use the minutes a dropped block left behind. Blocks go whole, so the last one out can
  // leave a gap far bigger than the overrun it cured; one move from it, on its own at the sets
  // already trimmed, often fits where the pair did not. Best of what went out first.
  if (estimate().totalMinutes <= limit) {
    const candidates = [...leftOutForTime]
      .reverse()
      .flatMap((block) => block.entries)
      .sort(
        (a, b) => entryValue(b, weightOf, preferredIds) - entryValue(a, weightOf, preferredIds),
      );
    for (const entry of candidates) {
      if (blocks.length >= cap) break;
      const block = straightBlock(entry, exerciseOf);
      blocks.push(block);
      if (estimate().totalMinutes > limit) {
        blocks = blocks.filter((candidate) => candidate !== block);
        continue;
      }
      fittingSteps.push(
        `Kept ${exerciseOf(entry.exerciseId).name} on its own: the minutes left fit it.`,
      );
    }
  }

  // 5. One optional, intelligent drop set on a safe isolation move. A drop set is a set taken
  // to failure, so a style that takes nothing to failure plans none.
  if (profile.techniques.dropSets && allowsFailure(resolveStyle(profile))) {
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
        fittingSteps.push(
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

  const time = estimate();
  const overBy = Math.max(0, Math.round((time.totalMinutes - targetMinutes) * 10) / 10);
  if (overBy > 1) {
    compromises.push(
      `Even the leanest version runs about ${Math.round(overBy)} min over ${targetMinutes} min.`,
    );
  }

  // 5. Week-aware order: after the anchor, accessories for muscles behind their weekly target lead.
  const behindNames: string[] = [];
  if (keep.length === 0 && blocks.length > 2) {
    const isBehind = (block: WorkoutBlock) =>
      block.kind === 'straight' &&
      (block.entries[0] as WorkoutEntry).chosenFor.some(
        (muscle) => loads[muscle] === 'behind' || muscle === focus,
      );
    const [first, ...rest] = blocks;
    const led = rest.filter(isBehind);
    if (led.length > 0 && led.length < rest.length) {
      blocks = [first as WorkoutBlock, ...led, ...rest.filter((block) => !isBehind(block))];
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
    `Goal ${goalLabel(profile.goals.primary)}${profile.goals.secondary !== 'none' ? ` with ${goalLabel(profile.goals.secondary)}` : ''}: ${template.title.toLowerCase()} session, ${styleLine(profile)}.`,
    `Priority muscles today: ${topPriorities.map((priority) => priority.reason).join('; ')}.`,
    `Built for ${location?.name ?? 'your place'} from the equipment saved there, every pick checked by the conflict engine.`,
  ];
  if (anchorExercise && anchor)
    reasons.push(
      `${anchorExercise.name} leads as the ${roleLabel(anchor.role)} lift with full rests and warm-up ramp sets.`,
    );
  if (keep.length > 0)
    reasons.push(
      `Kept ${keep.length} ${keep.length === 1 ? 'exercise' : 'exercises'} in place: logged sets and pinned picks never move.`,
    );
  reasons.push(...swapLines(blocks, constraints.swaps ?? []));
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
  if (deload) {
    reasons.push(
      `Deload week (${formatWindow(deload)}): one set fewer per exercise, one more rep in reserve, loads ${Math.round((1 - DELOAD_LOAD_SCALE) * 100)}% lighter.`,
    );
  }
  reasons.push(
    `${profile.restStyle.charAt(0).toUpperCase() + profile.restStyle.slice(1)} rests; supersets ${profile.techniques.supersets ? 'on' : 'off'}, drop sets ${profile.techniques.dropSets ? 'on' : 'off'}, circuits ${profile.techniques.circuits ? 'on' : 'off'}.`,
  );

  const count = allEntries(blocks).length;
  const fittedLabel =
    constraints.targetMinutesOverride !== undefined
      ? `, fitted to the ${targetMinutes} min left`
      : fittingSteps.length > 0 && duration !== 'default'
        ? `, fitted to ${targetMinutes} min`
        : '';
  const summary = `${template.title}: ${count} exercises in about ${Math.round(time.totalMinutes)} min${anchorExercise ? `, ${anchorExercise.name} first` : ''}${fittedLabel}.`;

  return {
    id: `wk-${now.slice(0, 10)}-${template.id}-${duration}`,
    templateId: template.id,
    title: template.title,
    goal: goalLabel(profile.goals.primary),
    generatedAt: now,
    locationId: location?.id ?? null,
    duration: {
      choice: duration,
      targetMinutes,
      defaultMinutes,
      estimatedMinutes: Math.round(time.totalMinutes),
      overByMinutes: overBy,
    },
    musclePriorities: priorities,
    blocks,
    warmup: {
      generalMinutes: generalWarmup,
      rampEntryIds: allEntries(blocks)
        .filter((entry) => entry.warmupSets > 0)
        .map((entry) => entry.id),
      note:
        generalWarmup === 0
          ? 'Already warmed up: continue with the remaining sets.'
          : targetMinutes <= 15
            ? 'Short general warm-up, then one ramp set on the main lift.'
            : `${generalWarmup} min general warm-up, then ramp sets on the main lifts; ramp sets never count as working sets.`,
    },
    explanation: { summary, reasons, fittingSteps, time },
    confidence:
      exposure.sessionsLast14Days >= 3
        ? 'high'
        : exposure.sessionsLast14Days >= 1
          ? 'medium'
          : 'low',
    compromises: [...new Set(compromises)],
    recalibration: { version: 1, lastTrigger: null },
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

function roleLabel(role: TrainingRole): string {
  return role.replace(/-/g, ' ');
}

export function describeMuscles(muscles: readonly MuscleId[]): string {
  return muscles.map(muscleName).join(', ');
}
