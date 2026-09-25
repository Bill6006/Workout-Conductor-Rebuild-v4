import { dropSetWeight } from './dropSet';
import { EQUIPMENT } from '../../catalog/equipment/equipment';
import { requireExercise } from '../../catalog/exercises/catalog';
import { holdById, targetText } from '../workout/setText';
import type { CatalogExercise, Joint, TrainingRole } from '../../catalog/exercises/exerciseSchema';
import { muscleName, type MuscleId } from '../../catalog/muscles/muscles';
import { rankAlternatives } from '../alternatives/rankAlternatives';
import {
  PAIN_FLAGS,
  blocksCandidate,
  checkExerciseFit,
  checkWorkoutConflicts,
  isBlocked,
  type ConflictContext,
} from '../conflicts/conflictEngine';
import { preferredIdsOf } from '../conflicts/context';
import { estimateWorkout, resolveTargetMinutes, type SetDonePredicate } from '../duration/duration';
import { fitWeight, loadingFor, nudge, type Loading } from '../loading/loading';
import { weightStep } from '../plateMath/plateMath';
import {
  applyProgression,
  capTarget,
  entryPushedToEffort,
  extraRepsFor,
  rampWeights,
  recommendNextTarget,
  summarizeProgression,
  type NextTarget,
} from '../progression/progression';
import {
  buildSets,
  easyWarmupReps,
  prescribeFor,
  rampRoom,
  rampSetsFor,
  restCategory,
  rirFloor,
  type Prescription,
  type RampContext,
} from '../progression/roles';
import { barWeightFor, hasNoLoad } from '../progression/startingLoad';
import { interpretFatigue } from '../recovery/fatigue';
import { precedingWorkToday } from '../recovery/sessionContext';
import { DELOAD_LOAD_SCALE, DELOAD_RIR_DELTA } from '../planning/deload';
import {
  closeAtLogged,
  deloadReason,
  generateWorkout,
  prescriptionForDay,
  rampContextFor,
  sessionConflictContext,
  sessionWork,
  targetAtPlace,
  type GenerationConstraints,
  type KeptEntry,
  type PrescriptionAdjustment,
  withSwapLines,
} from '../workoutGenerator/generate';
import {
  allEntries,
  isStopped,
  stoppedBefore,
  roundsRun,
  workingSets,
  type DurationChoice,
  type EntryProgression,
  type GeneratedWorkout,
  type ProgressionMode,
  type RackNote,
  type SetPrescription,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../workout/types';
import { composeSummary, diffWorkouts } from './diff';
import { TRIGGER_REGISTRY, jointLabel } from './triggers';
import type {
  CompletedWork,
  Readiness,
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationScope,
  SessionConstraints,
  TriggerType,
} from './types';

/**
 * The central Recalibration Engine. Every change to a workout after it is
 * generated goes through `recalibrate`: one typed request in, one result out.
 *
 * Scope is decided here, never by a screen:
 * - local: one exercise changes (replace, busy station, pain, skip, pin, reps
 *   far from target, target weight). Everything else stays byte-for-byte.
 * - partial: the remaining workout is rebuilt around logged and locked work
 *   (readiness, resume, finish early, harder or easier, exact end time, and
 *   any full trigger once the workout has started or something is locked).
 * - full: nothing has started and nothing is locked, so the generator runs
 *   again with the session's constraints.
 *
 * The engine is pure: it never mutates the request. A failed or invalid
 * rebuild returns `ok: false` with the previous workout so the caller can keep
 * it, which is the rollback.
 */

const LOCAL_TRIGGERS = new Set<TriggerType>([
  'equipment-busy',
  'replace',
  'skip',
  'pain',
  'uncomfortable',
  'pin',
  'performance',
  'target-weight',
  'max',
  'add-exercise',
  'sets',
  'add-warmup',
  'rep-range',
  'reorder',
  'split-superset',
  'drop-set',
  'rest-adjust',
]);
const PARTIAL_TRIGGERS = new Set<TriggerType>([
  'readiness',
  'resume',
  'finish-early',
  'intensity',
  'end-by',
]);
const LONG_INTERRUPTION_SECONDS = 20 * 60;
/** Targets whose load is read from an estimate for a rep range, not from the lift's own sets. */
const ESTIMATED_MODES: ReadonlySet<ProgressionMode> = new Set(['start', 'estimate', 'return']);
/** One exercise never carries more working sets than this in a session, however the sets are added. */
export const MAX_WORKING_SETS = 8;
const MIN_REMAINING_MINUTES = 5;
const FAR_FROM_TARGET_REPS = 3;
const TECHNIQUE_LABEL = { supersets: 'Supersets', dropSets: 'Drop sets', circuits: 'Circuits' };

export function emptyConstraints(): SessionConstraints {
  return {
    busyEquipment: [],
    avoidExerciseIds: [],
    painJoints: [],
    endBy: null,
    deload: null,
    focus: null,
    readiness: null,
    intensity: 0,
  };
}

export function emptyCompleted(): CompletedWork {
  return { startedAt: null, elapsedSeconds: 0, currentEntryId: null, sets: [] };
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function hasStarted(completed: CompletedWork): boolean {
  return completed.startedAt !== null || completed.elapsedSeconds > 0 || completed.sets.length > 0;
}

export function scopeFor(request: RecalibrationRequest): RecalibrationScope {
  const type = request.trigger.type;
  if (LOCAL_TRIGGERS.has(type)) return 'local';
  if (PARTIAL_TRIGGERS.has(type)) return 'partial';
  const anyLocked =
    request.lockedEntryIds.length > 0 ||
    allEntries(request.workout.blocks).some((entry) => entry.locked || entry.pinned);
  return hasStarted(request.completed) || anyLocked ? 'partial' : 'full';
}

export function recalibrate(request: RecalibrationRequest): RecalibrationResult {
  const started = nowMs();
  const scope = scopeFor(request);
  const evaluated = [...TRIGGER_REGISTRY[request.trigger.type].evaluating];
  try {
    const outcome = execute(request, scope);
    const context = contextFor(request, outcome.constraints);
    validateWorkout(outcome.workout, request, context);
    const changes = diffWorkouts(request.workout, outcome.workout);
    const summary = composeSummary({
      prefix: outcome.prefix,
      headline: outcome.headline,
      unchanged: outcome.unchanged,
      previous: request.workout,
      next: outcome.workout,
      changes,
      notes: outcome.notes,
    });
    const workout: GeneratedWorkout = {
      ...outcome.workout,
      id: request.workout.id,
      // A line about a kept swap says only what is still true of this workout.
      explanation: {
        ...outcome.workout.explanation,
        reasons: withSwapLines(
          outcome.workout.explanation.reasons,
          outcome.workout.blocks,
          request.swaps ?? [],
        ),
      },
      recalibration: {
        version: request.workout.recalibration.version + 1,
        lastTrigger: request.trigger.type,
      },
    };
    return {
      ok: true,
      scope,
      workout,
      duration: outcome.duration,
      constraints: outcome.constraints,
      changes,
      summary,
      evaluated,
      durationMs: Math.round((nowMs() - started) * 10) / 10,
    };
  } catch (error) {
    return {
      ok: false,
      scope,
      error: error instanceof Error ? error.message : 'Recalibration failed.',
      workout: request.workout,
      durationMs: Math.round((nowMs() - started) * 10) / 10,
    };
  }
}

/** The conflict context for this request with the session's constraints applied. */
export function contextFor(
  request: Pick<RecalibrationRequest, 'profile' | 'location'>,
  constraints: SessionConstraints,
): ConflictContext {
  return sessionConflictContext(request.profile, request.location, {
    excludeExerciseIds: constraints.avoidExerciseIds,
    unavailableEquipment: constraints.busyEquipment,
    painJoints: constraints.painJoints,
  });
}

interface Outcome {
  workout: GeneratedWorkout;
  constraints: SessionConstraints;
  duration: DurationChoice;
  prefix?: string;
  headline?: string;
  /** The headline when the change leaves the workout as it was. */
  unchanged?: string;
  notes: string[];
}

function cloneConstraints(constraints: SessionConstraints): SessionConstraints {
  return {
    busyEquipment: [...constraints.busyEquipment],
    avoidExerciseIds: [...constraints.avoidExerciseIds],
    painJoints: [...constraints.painJoints],
    endBy: constraints.endBy,
    readiness: constraints.readiness ? { ...constraints.readiness } : null,
    intensity: constraints.intensity,
    deload: constraints.deload ? { ...constraints.deload } : null,
    focus: constraints.focus ?? null,
  };
}

function cloneSet(set: SetPrescription): SetPrescription {
  return { ...set, targetReps: [set.targetReps[0], set.targetReps[1]] };
}

function cloneWorkout(workout: GeneratedWorkout): GeneratedWorkout {
  return {
    ...workout,
    duration: { ...workout.duration },
    musclePriorities: workout.musclePriorities.map((priority) => ({ ...priority })),
    blocks: workout.blocks.map((block) => ({
      ...block,
      entries: block.entries.map((entry) => ({
        ...entry,
        sets: entry.sets.map(cloneSet),
        chosenFor: [...entry.chosenFor],
      })),
    })),
    warmup: { ...workout.warmup, rampEntryIds: [...workout.warmup.rampEntryIds] },
    explanation: {
      ...workout.explanation,
      reasons: [...workout.explanation.reasons],
      fittingSteps: [...workout.explanation.fittingSteps],
      time: { ...workout.explanation.time },
    },
    compromises: [...workout.compromises],
    recalibration: { ...workout.recalibration },
  };
}

interface Classified {
  frozenIds: Set<string>;
  lockedIds: Set<string>;
  isDone: SetDonePredicate;
}

function classify(request: RecalibrationRequest): Classified {
  const doneKeys = new Set(request.completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
  const frozenIds = new Set(request.completed.sets.map((set) => set.entryId));
  const lockedIds = new Set<string>(request.lockedEntryIds);
  for (const entry of allEntries(request.workout.blocks)) {
    if (entry.locked || entry.pinned) lockedIds.add(entry.id);
  }
  if (request.currentEntryId) lockedIds.add(request.currentEntryId);
  return {
    frozenIds,
    lockedIds,
    isDone: (entryId, setIndex) => doneKeys.has(`${entryId}:${setIndex}`),
  };
}

function keptEntries(
  request: RecalibrationRequest,
  classified: Classified,
  context: ConflictContext,
  trimmable: ReadonlySet<string> = new Set(),
): KeptEntry[] {
  return (
    allEntries(request.workout.blocks)
      .filter((entry) => classified.frozenIds.has(entry.id) || classified.lockedIds.has(entry.id))
      .map((entry) => ({
        entry,
        frozen: classified.frozenIds.has(entry.id),
        fits: !isBlocked(checkExerciseFit(requireExercise(entry.exerciseId), context)),
      }))
      // A locked pick that no longer fits the place or the joint cannot be performed, so it is rebuilt.
      .filter((kept) => kept.frozen || kept.fits)
      // Logged work that cannot go on here stays as history, and the rest of it is replaced.
      .map(({ entry, frozen, fits }) =>
        frozen && !fits
          ? { entry, frozen, closed: true }
          : { entry, frozen, ...(trimmable.has(entry.id) ? { trimmable: true } : {}) },
      )
  );
}

interface RebuildOptions {
  choice: DurationChoice;
  constraints: SessionConstraints;
  resume?: boolean;
  /** Kept lifts fitted to the time like lifts not begun (`settleKept`). */
  trimmable?: ReadonlySet<string>;
}

/** "Make it harder" or "easier" in force: one set more or fewer, a rep less or more in reserve. */
function intensityAdjust(level: number): PrescriptionAdjustment | undefined {
  const sign = Math.sign(level);
  return sign === 0 ? undefined : { sets: sign, rir: -sign, restFactor: 1 };
}

/**
 * The day's adjustments in force (Maintenance 24, docs/research/effort-setting.md): "Make it
 * harder" or "easier", and a check-in's own on top. Every rebuild of the rest of the workout
 * applies them, as the button and the check-in do.
 */
function dayAdjust(constraints: SessionConstraints): PrescriptionAdjustment | undefined {
  const harder = intensityAdjust(constraints.intensity);
  const checkIn = constraints.readiness ? readinessAdjustment(constraints.readiness) : undefined;
  if (!harder) return checkIn;
  if (!checkIn) return harder;
  return {
    sets: harder.sets + checkIn.sets,
    rir: harder.rir + checkIn.rir,
    restFactor: harder.restFactor * checkIn.restFactor,
  };
}

function minutesUntil(iso: string, from: string): number | null {
  const minutes = (Date.parse(iso) - Date.parse(from)) / 60000;
  return Number.isFinite(minutes) ? minutes : null;
}

function rebuild(
  request: RecalibrationRequest,
  scope: RecalibrationScope,
  options: RebuildOptions,
): GeneratedWorkout {
  const { choice, constraints } = options;
  const context = contextFor(request, constraints);
  const classified = classify(request);
  const started = hasStarted(request.completed);
  const fullTarget = resolveTargetMinutes(choice, request.profile.schedule.typicalDurationMinutes);
  let targetMinutesOverride: number | undefined = started
    ? Math.max(
        MIN_REMAINING_MINUTES,
        Math.round(fullTarget - request.completed.elapsedSeconds / 60),
      )
    : undefined;
  let hardCap = false;
  if (constraints.endBy) {
    const left = minutesUntil(constraints.endBy, request.timestamp);
    if (left !== null) {
      targetMinutesOverride = Math.max(MIN_REMAINING_MINUTES, Math.round(left));
      hardCap = true;
    }
  }
  const keep = scope === 'full' ? [] : keptEntries(request, classified, context, options.trimmable);
  const generation: GenerationConstraints = {
    keep,
    keepBlocks: request.workout.blocks,
    excludeExerciseIds: constraints.avoidExerciseIds,
    unavailableEquipment: constraints.busyEquipment,
    painJoints: constraints.painJoints,
    templateId: scope === 'full' ? undefined : request.workout.templateId,
    targetMinutesOverride,
    generalWarmupMinutesOverride: started ? (options.resume ? 1.5 : 0) : undefined,
    hardCap,
    isSetDone: classified.isDone,
    completedSets: request.completed.sets,
    adjust: dayAdjust(constraints),
    readiness: constraints.readiness,
    deload: constraints.deload,
    focusMuscle: constraints.focus,
    sessionLoading: request.loading,
    swaps: request.swaps,
  };
  return generateWorkout({
    profile: request.profile,
    location: request.location,
    history: request.history,
    now: request.timestamp,
    duration: choice,
    constraints: generation,
    maxes: request.maxes,
  });
}

function findEntry(
  workout: GeneratedWorkout,
  entryId: string,
): { entry: WorkoutEntry; block: WorkoutBlock } {
  for (const block of workout.blocks) {
    const entry = block.entries.find((candidate) => candidate.id === entryId);
    if (entry) return { entry, block };
  }
  throw new Error('That exercise is no longer in the workout.');
}

function relabel(block: WorkoutBlock): void {
  const names = block.entries.map((entry) => requireExercise(entry.exerciseId).name);
  if (block.kind === 'straight') block.label = names[0] ?? block.label;
  else if (block.kind === 'superset')
    block.label = names.map((name, index) => `A${index + 1} ${name}`).join(' + ');
  else block.label = `Circuit ×${block.rounds}: ${names.join(' / ')}`;
}

/**
 * Today's prescription: a deload week covering the session adds a rep in reserve, as for every
 * exercise the plan picks; every rebuild keeps it (Maintenance 23).
 */
function prescriptionToday(
  request: RecalibrationRequest,
  exercise: CatalogExercise,
  role: TrainingRole,
): Prescription {
  const base = prescribeFor(exercise, role, request.profile, request.history);
  return request.constraints.deload !== null
    ? { ...base, rir: Math.min(4, base.rir + DELOAD_RIR_DELTA) }
    : base;
}

/**
 * How far a lift's effort sits from its plain target (Maintenance 24): "Make it harder" or
 * "easier" and a check-in move its reps in reserve, and a refit, a max or a swap keeps that. It
 * counts only as far as the day's own settings reach: a deload week is in the plain target
 * already, so a lift planned before it cannot cancel it, and a setting since taken back does not
 * stay on.
 */
function effortShift(request: RecalibrationRequest, entry: WorkoutEntry, plainRir: number): number {
  // Read on the first set still to come: a set done may be from before the day's settings.
  const working = entry.sets.filter((set) => set.kind === 'working');
  const done = (index: number) =>
    request.completed.sets.some((set) => set.entryId === entry.id && set.setIndex === index);
  const current = (working.find((set) => !done(set.index)) ?? working[0])?.targetRir;
  if (current === undefined) return 0;
  const day = dayAdjust(request.constraints)?.rir ?? 0;
  // The day's settings, the whole of them first: a reserve held at its limit (4, or the
  // exercise's floor) shows them as much as any.
  const floor = rirFloor(requireExercise(entry.exerciseId));
  for (let shift = day; shift !== 0; shift -= Math.sign(day)) {
    if (Math.min(4, Math.max(floor, plainRir + shift)) === current) return shift;
  }
  return Math.max(Math.min(0, day), Math.min(Math.max(0, day), current - plainRir));
}

/** A prescription carrying an effort shift, within the reserve its exercise allows. */
function shifted(
  prescription: Prescription,
  shift: number,
  exercise: CatalogExercise,
): Prescription {
  if (shift === 0) return prescription;
  return {
    ...prescription,
    rir: Math.min(4, Math.max(rirFloor(exercise), prescription.rir + shift)),
  };
}

/** A lift's target today from a prescription, with the work before it this session. */
function targetToday(
  request: RecalibrationRequest,
  workout: GeneratedWorkout,
  /** Null for an exercise not in the workout yet: all of today's work comes before it. */
  entryId: string | null,
  exercise: CatalogExercise,
  role: TrainingRole,
  prescription: Prescription,
): NextTarget {
  const context = sessionContextFor(request, workout, entryId, exercise);
  return recommendNextTarget({
    exercise,
    role,
    prescription,
    history: request.history,
    profile: request.profile,
    fatigueLevel: interpretFatigue(
      request.history,
      request.timestamp,
      request.constraints.readiness,
    ).level,
    now: request.timestamp,
    maxes: request.maxes,
    session: { precedingSets: context.precedingSets },
  });
}

/** The effort shift a lift carries, read against its own plain target today. */
function effortShiftOf(
  request: RecalibrationRequest,
  workout: GeneratedWorkout,
  entry: WorkoutEntry,
): number {
  const exercise = requireExercise(entry.exerciseId);
  const plain = prescriptionToday(request, exercise, entry.role);
  return effortShift(
    request,
    entry,
    targetToday(request, workout, entry.id, exercise, entry.role, plain).rir,
  );
}

/** A target on the weights here: lighter in a deload week, and never under the bar. */
function fitToday(
  request: RecalibrationRequest,
  target: NextTarget,
  loading: Loading,
  exercise: CatalogExercise,
  role: TrainingRole,
): NextTarget {
  const deload = request.constraints.deload !== null;
  return targetAtPlace(
    target,
    deload ? { sets: 0, rir: 0, restFactor: 1, loadScale: DELOAD_LOAD_SCALE } : undefined,
    loading,
    barWeightFor(exercise, request.profile.units),
    request.profile.units,
    role,
  );
}

/**
 * A pushed set autoregulation or the coach moved up (Maintenance 23): at the load asked or
 * heavier it takes the range asked and stands in for nothing; still under it, it takes the reps
 * the push gives at its new weight. Reps set by hand (`own`) stay as the lifter set them.
 */
function repush(set: SetPrescription, role: TrainingRole, own = false): void {
  const asked = set.asked;
  if (!asked || set.targetWeight === null) return;
  if (set.targetWeight >= asked.weight - 1e-6) {
    if (!own) set.targetReps = [asked.reps[0], asked.reps[1]];
    delete set.asked;
    return;
  }
  if (own) return;
  const reserve = restCategory(role) === 'strength' ? null : set.targetRir;
  const extra = extraRepsFor(asked.weight, set.targetWeight, asked.reps, reserve);
  set.targetReps = [asked.reps[0] + extra, asked.reps[1] + extra];
}

/** Reps set by hand on a working set, and whether the set was already pushed when they were. */
interface HandReps {
  reps: [number, number];
  rir: number;
  /** The range the set already stands in for, when it has a record. */
  record?: [number, number];
}

/** The reps and reserve of an entry's working sets, in order, when the lifter set them by hand. */
function ownReps(entry: WorkoutEntry): HandReps[] {
  if (entry.manual?.reps !== true) return [];
  return entry.sets
    .filter((set) => set.kind === 'working')
    .map((set) => ({
      reps: [set.targetReps[0], set.targetReps[1]],
      rir: set.targetRir,
      ...(set.asked ? { record: [set.asked.reps[0], set.asked.reps[1]] as [number, number] } : {}),
    }));
}

/**
 * Rebuilt working sets take back the reps the lifter set by hand, in order, and the record of
 * what they stand in for where the weights here make less (Maintenance 23).
 */
function withReps(
  sets: SetPrescription[],
  hand: readonly HandReps[],
  asked: SetPrescription['asked'],
): SetPrescription[] {
  let at = 0;
  return sets.map((set) => {
    if (set.kind !== 'working') return set;
    const kept = hand[at];
    at += 1;
    const next = kept
      ? {
          ...set,
          targetReps: [kept.reps[0], kept.reps[1]] as [number, number],
          targetRir: kept.rir,
        }
      : { ...set };
    // What they stand in for: the load asked, at the range the set already stood in for (the
    // plan's, where the reps were set on a set already pushed), or at the reps set where they
    // were set at the load (Maintenance 23), as a refit of a started lift records them.
    if (asked) {
      const reps = kept ? (kept.record ?? kept.reps) : asked.reps;
      next.asked = { weight: asked.weight, reps: [reps[0], reps[1]] };
    }
    return next;
  });
}

/**
 * Reps set by hand back on sets rebuilt from an entered max (Maintenance 23), with the record of
 * what they stand in for where the weights here make less: the load asked as the plan fits it,
 * so where the step rule holds the load they stand in for nothing, as when the reps are set after
 * the max. A lift with no load warms up with a few easy reps under them.
 */
function restoreHandReps(
  entry: WorkoutEntry,
  hand: readonly HandReps[],
  request: RecalibrationRequest,
  target: NextTarget,
  loading: Loading,
  exercise: CatalogExercise,
): void {
  const stands = fitToday(request, target, loading, exercise, entry.role).asked;
  entry.sets = withReps(entry.sets, hand, stands);
  const lead = hand[0];
  if (lead && hasNoLoad(exercise)) {
    entry.sets = entry.sets.map((set) =>
      set.kind === 'warmup' ? { ...set, targetReps: easyWarmupReps(lead.reps) } : set,
    );
  }
}

/**
 * A target fitted without moving the reps: reps set by hand stay, so the line names the load
 * alone and no set stands in for anything (Maintenance 23).
 */
function ownTarget(target: NextTarget): NextTarget {
  return { ...target, hold: true, from: null };
}

/** The target a pushed set stands in for (Maintenance 23), to fit again to the weights here. */
function standInTarget(
  asked: NonNullable<SetPrescription['asked']>,
  rir: number,
  hold: boolean,
  from: number | null = null,
): NextTarget {
  return {
    weight: asked.weight,
    reps: [asked.reps[0], asked.reps[1]],
    rir,
    mode: 'maintain',
    increment: 0,
    sessions: 0,
    viaFamily: false,
    confidence: 'low',
    evidence: [],
    setsAdvice: 0,
    from,
    ...(hold ? { hold: true } : {}),
  };
}

function sameAsked(a: SetPrescription['asked'], b: SetPrescription['asked']): boolean {
  if (!a || !b) return a === b;
  return a.weight === b.weight && a.reps[0] === b.reps[0] && a.reps[1] === b.reps[1];
}

/** The line of the note an entry carries by its target: a rack note's, or its cap's. */
function noteLine(progression: EntryProgression | undefined): string | undefined {
  if (!progression) return undefined;
  if (progression.rack) return progression.rack.line;
  if (!progression.capped) return undefined;
  return progression.evidence.find((line) => line.startsWith('Held at the heaviest weight here ('));
}

/** The line and note a refit leaves on the entry: a plate or weight it could not make, or its cap. */
interface RefitNote {
  line: string;
  rack?: RackNote;
  capped?: { at: number };
}

/**
 * A started exercise under new weights: the sets it has logged stay as they are, and the ones
 * still to come land on what the weights here make, with the reps that keep the effort. A load
 * the weights changed goes back to the one asked for once they make it again; reps set by hand
 * stay. True when a set moved.
 */
function refitStarted(
  entry: WorkoutEntry,
  loading: Loading,
  request: RecalibrationRequest,
  isDone: SetDonePredicate,
): boolean {
  const units = request.profile.units;
  const floor = barWeightFor(requireExercise(entry.exerciseId), units);
  const before = entry.progression?.rack;
  // The load the weights here last fitted the lift to, when they made less than asked.
  const planned = before?.loaded ?? entry.progression?.capped?.at ?? null;
  const hold = holdById(entry.exerciseId);
  // Reps set by hand are the lifter's: they stay, and only the load is fitted (Maintenance 23).
  const own = entry.manual?.reps === true;
  // The first working weight still to come, before the refit: ramps follow it only if it moves.
  const leadBefore =
    entry.sets.find(
      (set) => set.kind === 'working' && !isDone(entry.id, set.index) && set.targetWeight !== null,
    )?.targetWeight ?? null;
  let note: RefitNote | null = null;
  let moved = false;
  let changed = false;
  let toCome = false;
  // Whether every set still to come says what it stands in for, so the note can be rewritten.
  let known = true;
  entry.sets = entry.sets.map((set) => {
    if (isDone(entry.id, set.index) || set.targetWeight === null) return set;
    if (set.kind !== 'working') {
      const weight = fitWeight(set.targetWeight, loading, floor);
      if (weight === set.targetWeight) return set;
      moved = true;
      return { ...set, targetWeight: weight };
    }
    toCome = true;
    // What the plan asked for, before any weights changed it: the set says so (Maintenance 23),
    // and a plan saved before then says so through its rack note.
    const changedBefore =
      !set.asked && before !== undefined && Math.abs(set.targetWeight - before.loaded) < 1e-6;
    // Reps set by hand are fitted from the weight they were set at (Maintenance 23): the load a
    // refit recorded them standing in for, at their own range, so it comes back where the weights
    // make it again; otherwise the weight they show.
    const setAt =
      own &&
      set.asked &&
      set.asked.reps[0] === set.targetReps[0] &&
      set.asked.reps[1] === set.targetReps[1]
        ? set.asked.weight
        : set.targetWeight;
    const base: NonNullable<SetPrescription['asked']> = (!own && set.asked) || {
      weight: changedBefore && !own ? before.asked : setAt,
      reps:
        changedBefore && !own
          ? [set.targetReps[0] - before.extra, set.targetReps[1] - before.extra]
          : [set.targetReps[0], set.targetReps[1]],
    };
    // Fitted again as the plan fits a target, the heaviest weight here included: the weights
    // coming back give the load back, and a muscle-building set well short runs to its reserve.
    // It fits from the weight the lift's target moved from, so the step rule holds where the
    // plan's did (Maintenance 23); reps set by hand take no step.
    const from = own ? null : (entry.progression?.from ?? null);
    const fitted = capTarget(
      standInTarget(base, set.targetRir, hold || own, from),
      loading,
      units,
      entry.role,
    );
    const weight = fitted.weight ?? base.weight;
    const targetReps: [number, number] = [fitted.reps[0], fitted.reps[1]];
    // Reps set by hand, fitted under the load they were set at, stand in for it, and back at the
    // load they stand in for nothing (Maintenance 23).
    const asked = own
      ? set.asked && weight >= set.asked.weight - 1e-6
        ? undefined
        : (set.asked ??
          (!hold && weight < base.weight - 1e-6
            ? { weight: base.weight, reps: [base.reps[0], base.reps[1]] as [number, number] }
            : undefined))
      : fitted.asked;
    // The note by the target comes from what the set stands in for; for reps set by hand it
    // names the load alone.
    const askedFit =
      own && asked
        ? capTarget(standInTarget(asked, set.targetRir, true), loading, units, entry.role)
        : null;
    const noteFit =
      askedFit?.weight !== null &&
      askedFit?.weight !== undefined &&
      Math.abs(askedFit.weight - weight) < 1e-6
        ? askedFit
        : fitted;
    if (!(own ? asked : set.asked || changedBefore)) known = false;
    if (!note && (noteFit.rack || noteFit.capped)) {
      note = {
        line: noteFit.evidence.at(-1) ?? '',
        ...(noteFit.rack ? { rack: noteFit.rack } : {}),
        ...(noteFit.capped ? { capped: noteFit.capped } : {}),
      };
    }
    // A pushed set, or one with reps set by hand, stays as it is where the change leaves its lift
    // alone, the fit standing in for what the set does: at the same weight as before, reps a rule
    // moved included, or where the lift's own fit is unchanged and the set sits at a weight
    // autoregulation moved it to that the weights here still make.
    if (
      set.asked &&
      sameAsked(own ? asked : fitted.asked, set.asked) &&
      (Math.abs(weight - set.targetWeight) < 1e-6 ||
        (planned !== null &&
          Math.abs(weight - planned) < 1e-6 &&
          Math.abs(fitWeight(set.targetWeight, loading, floor) - set.targetWeight) < 1e-6))
    ) {
      return set;
    }
    const same =
      weight === set.targetWeight &&
      targetReps[0] === set.targetReps[0] &&
      targetReps[1] === set.targetReps[1];
    if (same && sameAsked(asked, set.asked)) return set;
    changed = true;
    if (!same) moved = true;
    const next: SetPrescription = { ...set, targetWeight: weight, targetReps };
    if (asked) next.asked = asked;
    else delete next.asked;
    return next;
  });
  // Ramps still to come follow a working weight that moved (Maintenance 23): the rest of the
  // ramp the plan makes for the new weight, each heavier than the ramp before it and lighter than
  // the working weight, and gone where there is no room. Only the ramps after the last working
  // set done lead into it. The plan's own ramps sit under its working sets' numbers; a ramp put in
  // since (put back after a long break, or on a lift picked up again) has a later number and
  // climbs on its own, whatever was lifted before the break. A working weight that did not move
  // leaves them as they are.
  const lead =
    entry.sets.find(
      (set) => set.kind === 'working' && !isDone(entry.id, set.index) && set.targetWeight !== null,
    )?.targetWeight ?? null;
  if (lead !== null && leadBefore !== null && Math.abs(lead - leadBefore) > 1e-6) {
    const firstNumber = Math.min(
      ...entry.sets.filter((set) => set.kind === 'working').map((set) => set.index),
    );
    let lastDone = -1;
    entry.sets.forEach((set, at) => {
      if (set.kind === 'working' && isDone(entry.id, set.index)) lastDone = at;
    });
    const leading = entry.sets.filter((set, at) => set.kind === 'warmup' && at > lastDone);
    const liftedOf = (sets: SetPrescription[]) =>
      sets.flatMap((set) => {
        const logged = request.completed.sets.find(
          (one) => one.entryId === entry.id && one.setIndex === set.index,
        );
        const weight = logged && !logged.skipped ? logged.weight : null;
        return weight === null || weight === undefined ? [] : [weight];
      });
    const gone: SetPrescription[] = [];
    const climb = (group: SetPrescription[], lifted: number[]) => {
      const done = group.filter((set) => isDone(entry.id, set.index));
      const pending = group.filter(
        (set) => !isDone(entry.id, set.index) && set.targetWeight !== null,
      );
      if (pending.length === 0) return;
      let below = lifted.length > 0 ? Math.max(...lifted) : null;
      const loads = rampWeights(lead, done.length + pending.length, loading.step, floor).slice(
        done.length,
      );
      pending.forEach((set, index) => {
        const load = loads[index];
        const weight = load === null || load === undefined ? null : fitWeight(load, loading, floor);
        if (
          weight === null ||
          weight >= lead - 1e-6 ||
          (below !== null && weight <= below + 1e-6)
        ) {
          gone.push(set);
          return;
        }
        below = weight;
        if (weight !== set.targetWeight) {
          set.targetWeight = weight;
          moved = true;
        }
      });
    };
    const since = leading.filter((set) => set.index > firstNumber);
    climb(
      leading.filter((set) => set.index < firstNumber),
      liftedOf(leading.filter((set) => isDone(entry.id, set.index))),
    );
    climb(since, liftedOf(since.filter((set) => isDone(entry.id, set.index))));
    if (gone.length > 0) {
      entry.sets = entry.sets.filter((set) => !gone.includes(set));
      entry.warmupSets = Math.max(0, entry.warmupSets - gone.length);
      moved = true;
    }
  }
  // A drop set still to come leaves a lift now pushed to its effort (Maintenance 23).
  if (
    entry.dropSet &&
    entryPushedToEffort(entry) &&
    !entry.sets.some((set) => set.kind === 'drop' && isDone(entry.id, set.index))
  ) {
    entry.sets = entry.sets.filter((set) => set.kind !== 'drop');
    entry.dropSet = false;
    moved = true;
  }
  // The lines change with the sets: a lift the change did not touch keeps what it said, and a
  // finished one keeps the lines it was done with. Where the sets say what they stand in for, a
  // note that no longer fits is rewritten: no "Held at the heaviest weight here (20 lb)" where
  // 50 lb is made, or where a pair of 40s makes it a gap instead.
  // Reps set by hand on a lift the step rule held: its note goes where the weights now make the
  // load it held back from (Maintenance 23).
  const gapClosed =
    own &&
    before !== undefined &&
    Math.abs(fitWeight(before.asked, loading, floor) - before.asked) < 1e-6;
  const stale =
    toCome &&
    (known || gapClosed) &&
    (note as RefitNote | null)?.line !== noteLine(entry.progression);
  if (entry.progression && (changed || stale)) {
    const rest = { ...entry.progression };
    delete rest.rack;
    delete rest.capped;
    const evidence = rest.evidence.filter(
      (line) => line !== before?.line && !line.startsWith('Held at the heaviest weight here ('),
    );
    const found = note as RefitNote | null;
    entry.progression = found
      ? {
          ...rest,
          evidence: [...evidence, found.line],
          ...(found.rack ? { rack: found.rack } : {}),
          ...(found.capped ? { capped: found.capped } : {}),
        }
      : { ...rest, evidence };
  }
  return moved;
}

/**
 * One entry's sets still to come, fitted to the weights at the request's place, after a change
 * of weights or, since Maintenance 23, of place: a lift under way or with reps set by hand from
 * what its sets stand in for, one not started from a fresh target there. Logged sets, weights set
 * by hand and a stopped entry stay as they are. True when the entry was fitted again.
 */
function refitEntry(
  entry: WorkoutEntry,
  workout: GeneratedWorkout,
  request: RecalibrationRequest,
  isDone: SetDonePredicate,
): boolean {
  if (entry.manual?.weight || isStopped(entry)) return false;
  // A lift with any set done or skipped is fitted in place, so those sets keep their kind and
  // their number (Maintenance 23), and so is one with reps set by hand: they are fitted from the
  // weight they were set at, as on a lift under way. Only a lift untouched takes a fresh target.
  const touched = request.completed.sets.some((set) => set.entryId === entry.id);
  if (touched || entry.manual?.reps === true) {
    return refitStarted(
      entry,
      loadingOf(request, requireExercise(entry.exerciseId)),
      request,
      isDone,
    );
  }
  const exercise = requireExercise(entry.exerciseId);
  const plain = prescriptionToday(request, exercise, entry.role);
  const plainTarget = targetToday(request, workout, entry.id, exercise, entry.role, plain);
  // The effort the lift carries ("Make it harder" or "easier", a check-in) stays (Maintenance 24).
  const prescription = shifted(plain, effortShift(request, entry, plainTarget.rir), exercise);
  const target =
    prescription === plain
      ? plainTarget
      : targetToday(request, workout, entry.id, exercise, entry.role, prescription);
  const working = entry.sets.filter((set) => set.kind === 'working').length || prescription.sets;
  const context = sessionContextFor(request, workout, entry.id, exercise);
  const loading = loadingOf(request, exercise);
  const fitted = fitToday(request, target, loading, exercise, entry.role);
  const warmupSets = rampSetsFor(
    exercise,
    entry.role,
    workout.duration.targetMinutes,
    context.ramp,
    {
      weight: fitted.weight,
      step: loading.step,
      floor: barWeightFor(exercise, request.profile.units),
    },
  );
  entry.warmupSets = warmupSets;
  entry.sets = applyProgression(
    buildSets(
      { ...prescription, sets: working, restSeconds: entry.restSeconds },
      warmupSets,
      exercise,
    ),
    fitted,
    loading.step,
    entry.manual ?? {},
    barWeightFor(exercise, request.profile.units),
    loading,
  );
  // A plan from before an exercise stopped suiting a drop set loses it (Maintenance 23).
  entry.dropSet = entry.dropSet && exercise.dropSetSafe && !entryPushedToEffort(entry);
  if (entry.dropSet) entry.sets.push(dropSetAt(entry.sets.length));
  entry.progression = summarizeProgression(fitted);
  return true;
}

/** What this exercise can be loaded to at the request's place today. */
function loadingOf(request: RecalibrationRequest, exercise: CatalogExercise): Loading {
  return loadingFor(request.location?.loading, request.loading, exercise, request.profile.units);
}

/**
 * Session context for one entry: what the entries before it have done today
 * (all of them, for an entry not yet in the workout), and the ramp it deserves.
 * `through` counts the entry's own logged sets too, for an exercise picking up again.
 */
function sessionContextFor(
  request: RecalibrationRequest,
  workout: GeneratedWorkout,
  entryId: string | null,
  exercise: CatalogExercise,
  through = false,
): { precedingSets: number; afterBreak: boolean; ramp: RampContext } {
  const before: WorkoutEntry[] = [];
  for (const entry of allEntries(workout.blocks)) {
    if (entry.id === entryId && !through) break;
    before.push(entry);
    if (entry.id === entryId) break;
  }
  const earlier = sessionWork(before, request.completed.sets, requireExercise);
  const preceding = precedingWorkToday(exercise, earlier, request.timestamp);
  return {
    precedingSets: preceding.sets,
    afterBreak: preceding.afterBreak,
    ramp: rampContextFor(exercise, earlier, preceding.afterBreak),
  };
}

/**
 * Sets for an exercise taking a place in today's workout: its own target from its history, with
 * the work already done before it today and what this place can load, and the ramps the session
 * calls for. `working` null takes the prescription's count; set indices start at `from`.
 */
function targetedSets(
  request: RecalibrationRequest,
  workout: GeneratedWorkout,
  entryId: string,
  exercise: CatalogExercise,
  role: TrainingRole,
  working: number | null,
  restSeconds: number,
  options: { from?: number; through?: boolean; shift?: number; warmups?: number } = {},
): { sets: SetPrescription[]; warmupSets: number; progression: EntryProgression } {
  // A deload week covering the session lightens it like every exercise the plan picks: one
  // more rep in reserve and lighter loads; its set count is the one it takes over. The effort
  // the entry it replaces carried comes with it (Maintenance 24).
  const prescription = shifted(
    prescriptionToday(request, exercise, role),
    options.shift ?? 0,
    exercise,
  );
  const context = sessionContextFor(request, workout, entryId, exercise, options.through);
  const target = recommendNextTarget({
    exercise,
    role,
    prescription,
    history: request.history,
    profile: request.profile,
    fatigueLevel: interpretFatigue(
      request.history,
      request.timestamp,
      request.constraints.readiness,
    ).level,
    now: request.timestamp,
    maxes: request.maxes,
    session: { precedingSets: context.precedingSets },
  });
  const loading = loadingOf(request, exercise);
  const floor = barWeightFor(exercise, request.profile.units);
  const fitted = fitToday(request, target, loading, exercise, role);
  // At least the ramps the lift already has, one added by hand included; those past the room
  // under the working weight come first and keep no weight, as a ramp added by hand comes.
  const load = { weight: fitted.weight, step: loading.step, floor };
  const warmupSets = Math.max(
    options.warmups ?? 0,
    rampSetsFor(exercise, role, workout.duration.targetMinutes, context.ramp, load),
  );
  const weighed = Math.min(warmupSets, rampRoom(load));
  const from = options.from ?? 0;
  const sets = [
    ...buildSets({ ...prescription, sets: 0 }, warmupSets - weighed, exercise),
    ...applyProgression(
      buildSets(
        { ...prescription, sets: working ?? prescription.sets, restSeconds },
        weighed,
        exercise,
      ),
      fitted,
      loading.step,
      {},
      floor,
      loading,
    ),
  ].map((set, index) => ({ ...set, index: index + from }));
  return { sets, warmupSets, progression: summarizeProgression(fitted) };
}

/**
 * Lifts the rebuild keeps with nothing of them logged yet take a change of the day's settings like
 * every lift not begun, keeping their exercise and place (Maintenance 24): the lift in front, one
 * you pinned, and one you swapped in. Their sets go to the plan's own count under the new settings
 * (`prescriptionForDay`, the generator's rule), never above the sets it has on a cut or under them
 * on a restore, since the fit to time may have trimmed it already, with the new settings' effort
 * and load and the ramps it has; the rebuild then fits them to the time like any lift not begun.
 * One the coach added, one standing in for a stopped lift, and one whose sets, reps or weight you
 * set by hand keep their sets.
 */
function settleKept(
  request: RecalibrationRequest,
  constraints: SessionConstraints,
): { workout: GeneratedWorkout; trimmable: Set<string> } {
  const entries = allEntries(request.workout.blocks);
  const logged = new Set(request.completed.sets.map((set) => set.entryId));
  const standsIn = (entry: WorkoutEntry) =>
    entry.slot !== undefined &&
    entries.some((other) => other !== entry && other.slot === entry.slot && isStopped(other));
  const settling = entries.filter(
    (entry) =>
      (entry.id === request.currentEntryId || entry.pinned || entry.locked) &&
      // One the coach added sits outside the plan's places, with the sets it offered.
      !(entry.locked && entry.slot === undefined) &&
      !logged.has(entry.id) &&
      !entry.manual?.reps &&
      !entry.manual?.weight &&
      !entry.manual?.sets &&
      !isStopped(entry) &&
      !standsIn(entry),
  );
  const trimmable = new Set<string>();
  if (settling.length === 0) return { workout: request.workout, trimmable };
  const workout = cloneWorkout(request.workout);
  const next = { ...request, workout, constraints };
  for (const kept of settling) {
    const { entry, block } = findEntry(workout, kept.id);
    const exercise = requireExercise(entry.exerciseId);
    const base = prescribeFor(exercise, entry.role, request.profile, request.history);
    const planned = (settings: SessionConstraints) =>
      prescriptionForDay(
        base,
        entry.role,
        dayAdjust(settings),
        settings.deload,
        rirFloor(exercise),
      );
    const before = planned(request.constraints);
    const after = planned(constraints);
    if (before.sets === after.sets && before.rir === after.rir) continue;
    const working = entry.sets.filter((set) => set.kind === 'working').length;
    const count =
      after.sets < before.sets
        ? Math.min(after.sets, working)
        : after.sets > before.sets
          ? Math.max(after.sets, working)
          : working;
    const built = targetedSets(
      next,
      workout,
      entry.id,
      exercise,
      entry.role,
      Math.min(MAX_WORKING_SETS, count),
      entry.restSeconds,
      {
        shift: after.rir - prescriptionToday(next, exercise, entry.role).rir,
        warmups: entry.sets.filter((set) => set.kind === 'warmup').length,
      },
    );
    entry.sets = entry.dropSet ? [...built.sets, dropSetAt(built.sets.length)] : built.sets;
    entry.warmupSets = built.warmupSets;
    entry.progression = built.progression;
    syncRounds(block);
    relabel(block);
    trimmable.add(entry.id);
  }
  return { workout, trimmable };
}

/**
 * What a change of the day's settings did to the lifts still to come (Maintenance 24): fewer or
 * more sets, more or less in reserve. The check-in's words come from it, so at their fewest sets a
 * cut that takes none says only what moved. A lift stopped here, for a sore joint or the place,
 * gave its sets to a stand-in, which is no cut.
 */
function dayChange(
  request: RecalibrationRequest,
  workout: GeneratedWorkout,
): { fewer: boolean; more: boolean; easier: boolean; harder: boolean } {
  const { isDone } = classify(request);
  const before = new Map(allEntries(request.workout.blocks).map((entry) => [entry.id, entry]));
  const toDo = (entry: WorkoutEntry) =>
    entry.sets.filter((set) => set.kind === 'working' && !isDone(entry.id, set.index));
  const change = { fewer: false, more: false, easier: false, harder: false };
  for (const entry of allEntries(workout.blocks)) {
    const old = before.get(entry.id);
    if (!old || old.exerciseId !== entry.exerciseId || isStopped(entry)) continue;
    const [was, now] = [toDo(old), toDo(entry)];
    if (now.length < was.length) change.fewer = true;
    if (now.length > was.length) change.more = true;
    const [from, to] = [was[0]?.targetRir, now[0]?.targetRir];
    if (from === undefined || to === undefined) continue;
    if (to > from) change.easier = true;
    if (to < from) change.harder = true;
  }
  return change;
}

/**
 * After a long break the entry in front of the lifter gets one light ramp
 * set back before its remaining working sets, at three fifths of the load; a lift with no load
 * takes a few easy reps with no weight (Maintenance 23).
 * Nothing changes when its sets are all logged or a ramp is already waiting.
 */
function rampBack(workout: GeneratedWorkout, request: RecalibrationRequest): string | null {
  if (!request.currentEntryId) return null;
  const { isDone } = classify(request);
  const found = allEntries(workout.blocks).find((entry) => entry.id === request.currentEntryId);
  if (!found) return null;
  const nextIndex = found.sets.findIndex(
    (set) => set.kind !== 'drop' && !isDone(found.id, set.index),
  );
  if (nextIndex < 0) return null;
  const next = found.sets[nextIndex] as SetPrescription;
  if (next.kind === 'warmup') return null;
  const exercise = requireExercise(found.exerciseId);
  const loading = loadingOf(request, exercise);
  const floor = barWeightFor(exercise, request.profile.units);
  const room = rampRoom({ weight: next.targetWeight, step: loading.step, floor });
  if (room < 1) return null;
  const [weight] = rampWeights(next.targetWeight, 1, loading.step, floor);
  // A pushed set's ramp reads the range it stands in for, never the push's extra reps.
  const reps = next.asked?.reps ?? next.targetReps;
  found.sets.splice(nextIndex, 0, {
    index: nextSetIndex(found),
    kind: 'warmup',
    targetReps: hasNoLoad(exercise)
      ? easyWarmupReps(reps)
      : [Math.max(3, reps[0]), Math.max(5, reps[1])],
    targetRir: 5,
    // No working weight, no ramp weight: never a made-up one.
    targetWeight:
      weight === undefined || weight === null ? null : fitWeight(weight, loading, floor),
    restSeconds: 45,
  });
  found.warmupSets += 1;
  if (!workout.warmup.rampEntryIds.includes(found.id)) workout.warmup.rampEntryIds.push(found.id);
  return exercise.name;
}

function dropSetAt(index: number): SetPrescription {
  return {
    index,
    kind: 'drop',
    targetReps: [8, 12],
    targetRir: 0,
    targetWeight: null,
    restSeconds: 0,
  };
}

/** An entry id the workout does not use yet. */
function spareEntryId(workout: GeneratedWorkout): string {
  const numbers = allEntries(workout.blocks).map((entry) =>
    Number(/^e(\d+)$/.exec(entry.id)?.[1] ?? 0),
  );
  return `e${Math.max(0, ...numbers) + 1}`;
}

/** The muscles an entry was chosen for, as far as the exercise swapped in trains them. */
function chosenForSwap(chosenFor: readonly MuscleId[], exercise: CatalogExercise): MuscleId[] {
  const overlap = chosenFor.filter((muscle) => exercise.primaryMuscles.includes(muscle));
  return overlap.length > 0 ? overlap : [...exercise.primaryMuscles];
}

function pairedId(kind: WorkoutBlock['kind'], members: readonly WorkoutEntry[]): string {
  return `${kind === 'circuit' ? 'c' : 's'}-${members.map((member) => member.id).join('-')}`;
}

function straightFor(member: WorkoutEntry): WorkoutBlock {
  return {
    id: `b-${member.id}`,
    kind: 'straight',
    label: requireExercise(member.exerciseId).name,
    entries: [member],
    rounds: workingSets(member).length,
    restBetweenRoundsSeconds: member.restSeconds,
  };
}

/**
 * Ends a pairing whose rounds can no longer line up: the entry leaving (and a stand-in after it)
 * runs its own sets, and the moves left run theirs, still paired when two or more are left.
 */
function endPairing(
  workout: GeneratedWorkout,
  block: WorkoutBlock,
  leaving: WorkoutEntry,
  following: WorkoutEntry[] = [],
): void {
  const at = workout.blocks.indexOf(block);
  const others = block.entries.filter((member) => member !== leaving);
  const rest: WorkoutBlock[] =
    others.length >= 2
      ? [
          {
            ...block,
            kind: others.length === 2 ? 'superset' : 'circuit',
            id: pairedId(others.length === 2 ? 'superset' : 'circuit', others),
            entries: others,
          },
        ]
      : others.map(straightFor);
  for (const paired of rest) {
    syncRounds(paired);
    relabel(paired);
  }
  workout.blocks.splice(at, 1, straightFor(leaving), ...following.map(straightFor), ...rest);
}

/**
 * Puts a stand-in right after the entry it follows. In a pairing whose rounds have not started
 * it takes the stopped move's place and the pairing goes on. Once rounds are under way the
 * moves' sets no longer line up round by round, so the pairing ends and each move runs its own
 * sets from here.
 */
function placeStandIn(
  workout: GeneratedWorkout,
  entry: WorkoutEntry,
  block: WorkoutBlock,
  stand: WorkoutEntry,
  isDone: SetDonePredicate,
): void {
  const at = workout.blocks.indexOf(block);
  if (block.kind === 'straight') {
    workout.blocks.splice(at + 1, 0, straightFor(stand));
    return;
  }
  const others = block.entries.filter((member) => member !== entry);
  const underway = others.some((member) =>
    member.sets.some((set) => set.kind === 'working' && isDone(member.id, set.index)),
  );
  if (!underway) {
    block.entries = block.entries.map((member) => (member === entry ? stand : member));
    block.id = pairedId(block.kind, block.entries);
    syncRounds(block);
    relabel(block);
    workout.blocks.splice(at, 0, straightFor(entry));
    return;
  }
  endPairing(workout, block, entry, [stand]);
}

/**
 * Swaps the exercise of one entry. An entry not started takes the new exercise whole, keeping
 * its role and rest. One with sets logged or skipped keeps them under the exercise they were
 * done on (Maintenance 22): it stops there, and the new exercise follows it for the working sets
 * still to come, targeted as its own lift after today's work. Before, the entry was renamed and
 * kept the old exercise's targets (a barbell's weight asked of each dumbbell) and filed the sets
 * already logged under the new name. Swapping to an exercise stopped earlier today picks that one
 * up again instead of adding it twice.
 */
function applySubstitution(
  workout: GeneratedWorkout,
  entry: WorkoutEntry,
  block: WorkoutBlock,
  exercise: CatalogExercise,
  request: RecalibrationRequest,
  lock: boolean,
): void {
  const earlier = stoppedBefore(workout.blocks, entry).find(
    (candidate) => candidate.exerciseId === exercise.id,
  );
  if (earlier) {
    swapBack(workout, entry, earlier, request, lock);
    return;
  }
  if (request.completed.sets.some((set) => set.entryId === entry.id)) {
    standIn(workout, entry, block, exercise, request, lock);
    return;
  }
  const previousId = entry.exerciseId;
  const working = entry.sets.filter((set) => set.kind === 'working').length;
  const built = targetedSets(
    request,
    workout,
    entry.id,
    exercise,
    entry.role,
    working || null,
    entry.restSeconds,
    { shift: effortShiftOf(request, workout, entry) },
  );
  entry.sets = built.sets;
  entry.progression = built.progression;
  entry.warmupSets = built.warmupSets;
  withoutHandTargets(entry);
  if (entry.dropSet) {
    if (exercise.dropSetSafe && !entryPushedToEffort(entry)) {
      entry.sets.push(dropSetAt(nextSetIndex(entry)));
    } else entry.dropSet = false;
  }
  entry.exerciseId = exercise.id;
  // Swapped again, it still says what today's plan had; swapped back to that, it says nothing.
  // What a kept swap put it in for (`standsFor`) stays: the keep switch reads it.
  const own = entry.replacedFrom ?? previousId;
  if (own === exercise.id) delete entry.replacedFrom;
  else entry.replacedFrom = own;
  entry.locked = lock || entry.locked;
  entry.chosenFor = chosenForSwap(entry.chosenFor, exercise);
  relabel(block);
}

/**
 * An entry whose sets to come are built afresh (a swap, a swap back): the reps or the weight set
 * by hand were for the sets it had, and no longer apply (Maintenance 23).
 */
function withoutHandTargets(entry: WorkoutEntry): void {
  if (!entry.manual?.reps && !entry.manual?.weight) return;
  const manual = { ...entry.manual };
  delete manual.reps;
  delete manual.weight;
  entry.manual = manual;
}

/** A started entry stops at its logged sets, and the new exercise follows it for the rest. */
function standIn(
  workout: GeneratedWorkout,
  entry: WorkoutEntry,
  block: WorkoutBlock,
  exercise: CatalogExercise,
  request: RecalibrationRequest,
  lock: boolean,
): void {
  const { isDone } = classify(request);
  const owed = entry.sets.filter(
    (set) => set.kind === 'working' && !isDone(entry.id, set.index),
  ).length;
  const dropOwed = entry.sets.some((set) => set.kind === 'drop' && !isDone(entry.id, set.index));
  // The effort the lift carried, read before it stops (Maintenance 24).
  const shift = effortShiftOf(request, workout, entry);
  closeAtLogged(entry, isDone, 'swap');
  syncRounds(block);
  relabel(block);
  if (owed === 0) return;
  const stand: WorkoutEntry = {
    id: spareEntryId(workout),
    exerciseId: exercise.id,
    role: entry.role,
    sets: [],
    restSeconds: entry.restSeconds,
    warmupSets: 0,
    dropSet: false,
    chosenFor: chosenForSwap(entry.chosenFor, exercise),
    locked: lock || entry.locked,
    pinned: false,
    ...(entry.slot === undefined ? {} : { slot: entry.slot }),
    replacedFrom: entry.exerciseId,
  };
  placeStandIn(workout, entry, block, stand, isDone);
  const built = targetedSets(
    request,
    workout,
    stand.id,
    exercise,
    entry.role,
    owed,
    entry.restSeconds,
    { shift },
  );
  stand.sets = built.sets;
  stand.warmupSets = built.warmupSets;
  stand.progression = built.progression;
  if (dropOwed && exercise.dropSetSafe && !entryPushedToEffort(stand)) {
    stand.sets.push(dropSetAt(nextSetIndex(stand)));
    stand.dropSet = true;
  }
  const { block: home } = findEntry(workout, stand.id);
  syncRounds(home);
  relabel(home);
  if (stand.warmupSets > 0) workout.warmup.rampEntryIds.push(stand.id);
}

/**
 * Swapping to an exercise stopped earlier today picks it up again for the working sets the
 * swapped entry still owed, instead of adding it twice. The swapped entry stops at its logged
 * sets, or goes when it has none.
 */
function swapBack(
  workout: GeneratedWorkout,
  entry: WorkoutEntry,
  stopped: WorkoutEntry,
  request: RecalibrationRequest,
  lock: boolean,
): void {
  const { isDone } = classify(request);
  const owed = entry.sets.filter(
    (set) => set.kind === 'working' && !isDone(entry.id, set.index),
  ).length;
  const dropOwed = entry.sets.some((set) => set.kind === 'drop' && !isDone(entry.id, set.index));
  // The effort the lift swapped away carried, read before it stops (Maintenance 24).
  const shift = effortShiftOf(request, workout, entry);
  if (request.completed.sets.some((set) => set.entryId === entry.id)) {
    const { block } = findEntry(workout, entry.id);
    closeAtLogged(entry, isDone, 'swap');
    // Stopped inside a pairing, it leaves it: the rounds no longer line up.
    if (block.kind === 'straight') {
      syncRounds(block);
      relabel(block);
    } else {
      endPairing(workout, block, entry);
    }
  } else {
    removeEntry(workout, entry.id);
  }
  if (owed === 0) return;
  const exercise = requireExercise(stopped.exerciseId);
  const built = targetedSets(
    request,
    workout,
    stopped.id,
    exercise,
    stopped.role,
    owed,
    stopped.restSeconds,
    { from: nextSetIndex(stopped), through: true, shift },
  );
  stopped.sets = [...stopped.sets, ...built.sets];
  withoutHandTargets(stopped);
  if (dropOwed && exercise.dropSetSafe && !entryPushedToEffort(stopped)) {
    stopped.sets.push(dropSetAt(nextSetIndex(stopped)));
  }
  stopped.warmupSets = stopped.sets.filter((set) => set.kind === 'warmup').length;
  stopped.dropSet = stopped.sets.some((set) => set.kind === 'drop');
  stopped.progression = built.progression;
  stopped.locked = lock || stopped.locked;
  delete stopped.stopped;
  const { block } = findEntry(workout, stopped.id);
  syncRounds(block);
  relabel(block);
  if (built.warmupSets > 0 && !workout.warmup.rampEntryIds.includes(stopped.id)) {
    workout.warmup.rampEntryIds.push(stopped.id);
  }
}

function removeEntry(workout: GeneratedWorkout, entryId: string): WorkoutEntry {
  const { entry, block } = findEntry(workout, entryId);
  block.entries = block.entries.filter((candidate) => candidate.id !== entryId);
  if (block.entries.length === 0) {
    workout.blocks = workout.blocks.filter((candidate) => candidate.id !== block.id);
  } else if (block.entries.length === 1) {
    const only = block.entries[0] as WorkoutEntry;
    block.id = `b-${only.id}`;
    block.kind = 'straight';
    block.rounds = workingSets(only).length;
    block.restBetweenRoundsSeconds = only.restSeconds;
    relabel(block);
  } else {
    if (block.kind === 'circuit' && block.entries.length === 2) {
      block.kind = 'superset';
      block.id = `s-${block.entries.map((member) => member.id).join('-')}`;
    }
    syncRounds(block);
    relabel(block);
  }
  workout.warmup.rampEntryIds = workout.warmup.rampEntryIds.filter((id) => id !== entryId);
  return entry;
}

function gentleOn(exercise: CatalogExercise, joint: Joint | undefined): boolean {
  if (!joint) return true;
  const stress = exercise.jointStress[joint];
  return stress === undefined || stress === 'low';
}

/**
 * A lift a sore joint rules out, as the conflict engine does: high stress on it, or a movement the
 * joint rules out. Moderate stress only warns, so it takes no lift out of a rebuild.
 */
function ruledOutBy(exercise: CatalogExercise, joint: Joint): boolean {
  const flag = PAIN_FLAGS[joint];
  return (
    exercise.jointStress[joint] === 'high' ||
    (flag !== undefined && exercise.limitationFlags.includes(flag))
  );
}

function bestAlternative(
  request: RecalibrationRequest,
  workout: GeneratedWorkout,
  entry: WorkoutEntry,
  block: WorkoutBlock,
  context: ConflictContext,
  options: { preferLowStressOn?: Joint } = {},
): CatalogExercise | undefined {
  const current = requireExercise(entry.exerciseId);
  const others = allEntries(workout.blocks)
    .filter((candidate) => candidate.id !== entry.id)
    .map((candidate) => requireExercise(candidate.exerciseId));
  const partner =
    block.kind === 'superset' ? block.entries.find((member) => member.id !== entry.id) : undefined;
  const result = rankAlternatives({
    current,
    context,
    otherExercises: others,
    supersetPartner: partner ? requireExercise(partner.exerciseId) : undefined,
    dropSetPlanned: entry.dropSet,
    plannedSets: { sets: workingSets(entry).length, restSeconds: entry.restSeconds },
    signals: { preferredIds: preferredIdsOf(request.profile) },
    limit: 8,
  });
  let candidates = result.candidates;
  if (options.preferLowStressOn) {
    const gentle = candidates.filter((candidate) =>
      gentleOn(candidate.exercise, options.preferLowStressOn),
    );
    if (gentle.length > 0) candidates = gentle;
  }
  return candidates.find(
    (candidate) =>
      !blocksCandidate(
        checkWorkoutConflicts([...others, candidate.exercise], context),
        candidate.exercise.id,
      ),
  )?.exercise;
}

/** Re-estimates time and compromises after a local edit. */
function refresh(
  workout: GeneratedWorkout,
  request: RecalibrationRequest,
  constraints: SessionConstraints,
): void {
  const { isDone } = classify(request);
  const time = estimateWorkout(
    workout.blocks,
    workout.warmup.generalMinutes,
    requireExercise,
    isDone,
  );
  const target = workout.duration.targetMinutes;
  const overBy = Math.max(0, Math.round((time.totalMinutes - target) * 10) / 10);
  // The deload line names lighter loads only while a lift has them (Maintenance 24).
  const deload = constraints.deload;
  const reasons = deload
    ? workout.explanation.reasons.map((reason) =>
        reason.startsWith('Deload week (') ? deloadReason(workout.blocks, deload) : reason,
      )
    : workout.explanation.reasons;
  workout.explanation = { ...workout.explanation, time, reasons };
  workout.duration = {
    ...workout.duration,
    estimatedMinutes: Math.round(time.totalMinutes),
    overByMinutes: overBy,
  };
  const context = contextFor(request, constraints);
  const warnings = checkWorkoutConflicts(
    allEntries(workout.blocks).map((entry) => requireExercise(entry.exerciseId)),
    context,
  )
    .filter((conflict) => conflict.severity === 'warn')
    .map((conflict) => conflict.message);
  const structural = workout.compromises.filter((line) => /^(No |Even the leanest)/.test(line));
  // No fit ran after a change to one lift (Maintenance 24): the line says only how far over.
  const over = overBy > 1 ? [`Runs about ${Math.round(overBy)} min over ${target} min.`] : [];
  workout.compromises = [
    ...new Set([
      ...structural.filter((line) => !line.startsWith('Even the leanest')),
      ...over,
      ...warnings,
    ]),
  ];
}

/** Replaces or removes every entry that no longer fits the context; logged-out entries are left alone. */
function substituteUnfit(
  workout: GeneratedWorkout,
  request: RecalibrationRequest,
  context: ConflictContext,
  options: { joint?: Joint; forceEntryId?: string } = {},
): { replaced: number; removed: number; notes: string[] } {
  const { isDone } = classify(request);
  const notes: string[] = [];
  let replaced = 0;
  let removed = 0;
  for (const entry of allEntries(workout.blocks)) {
    if (!entry.sets.some((set) => set.kind === 'working' && !isDone(entry.id, set.index))) continue;
    const exercise = requireExercise(entry.exerciseId);
    const blocked = isBlocked(checkExerciseFit(exercise, context));
    const forced = entry.id === options.forceEntryId;
    const moderate = options.joint ? exercise.jointStress[options.joint] === 'moderate' : false;
    if (!blocked && !forced && !moderate) continue;
    const { block } = findEntry(workout, entry.id);
    const alternative = bestAlternative(request, workout, entry, block, context, {
      preferLowStressOn: options.joint,
    });
    if (alternative && (blocked || forced || gentleOn(alternative, options.joint))) {
      applySubstitution(workout, entry, block, alternative, request, false);
      replaced += 1;
    } else if (blocked || forced) {
      removeEntry(workout, entry.id);
      removed += 1;
      notes.push(`Left out ${exercise.name}: nothing safe fits right now.`);
    }
  }
  return { replaced, removed, notes };
}

function equipmentNames(ids: readonly string[]): string {
  const names = ids.map((id) => EQUIPMENT.find((item) => item.id === id)?.name ?? id);
  return names.length > 0 ? names.join(' + ') : 'Station';
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function readinessAdjustment(readiness: Readiness): PrescriptionAdjustment | undefined {
  const low = readiness.energy <= 2 || readiness.sleep <= 2 || readiness.motivation <= 2;
  const sore = readiness.soreness >= 4;
  if (!low && !sore) return undefined;
  return { sets: -1, rir: low ? 1 : 0, restFactor: 1 };
}

/** Changes that make no sense on an exercise that has stopped: its sets went to a stand-in. */
const STOPPED_REFUSES: ReadonlySet<string> = new Set([
  'sets',
  'add-warmup',
  'rep-range',
  'drop-set',
  'target-weight',
  'rest-adjust',
  'pin',
  'equipment-busy',
]);

function execute(request: RecalibrationRequest, scope: RecalibrationScope): Outcome {
  const { trigger } = request;
  if ('entryId' in trigger && STOPPED_REFUSES.has(trigger.type)) {
    const target = allEntries(request.workout.blocks).find((entry) => entry.id === trigger.entryId);
    if (target && isStopped(target)) {
      throw new Error(
        `${requireExercise(target.exerciseId).name} has stopped: nothing is left to change on it.`,
      );
    }
  }
  const constraints = cloneConstraints(request.constraints);
  const base: Outcome = {
    workout: request.workout,
    constraints,
    duration: request.duration,
    notes: [],
  };
  const place = request.location?.name ?? 'your place';

  switch (trigger.type) {
    case 'duration': {
      const workout = rebuild(request, scope, { choice: trigger.choice, constraints });
      const elapsed = Math.round(request.completed.elapsedSeconds / 60);
      return {
        ...base,
        workout,
        duration: trigger.choice,
        prefix:
          trigger.choice === 'default'
            ? 'Back to Default time'
            : hasStarted(request.completed)
              ? `Recalibrated to ${trigger.choice} min with ${elapsed} min done`
              : `Recalibrated to ${trigger.choice} min`,
      };
    }
    case 'location': {
      // Every lift the rebuild keeps goes on at the weights at the new place, as when the weights
      // change (Maintenance 23): one under way or with reps set by hand from what its sets stand
      // in for, one kept but not started (the lift in front, a pinned one) from a fresh target
      // there. They are fitted
      // first, so the session is fitted to time with the sets they will have; the lifts the
      // rebuild picks are fitted there already.
      let from = request;
      if (scope !== 'full') {
        const classified = classify(request);
        const refitted = cloneWorkout(request.workout);
        const kept = new Set(
          keptEntries(request, classified, contextFor(request, constraints))
            .filter((item) => !item.closed)
            .map((item) => item.entry.id),
        );
        for (const entry of allEntries(refitted.blocks)) {
          if (kept.has(entry.id)) refitEntry(entry, refitted, request, classified.isDone);
        }
        from = { ...request, workout: refitted };
      }
      return {
        ...base,
        workout: rebuild(from, scope, { choice: request.duration, constraints }),
        prefix: `Rebuilt for ${place}`,
      };
    }
    case 'equipment':
      return {
        ...base,
        workout: rebuild(request, scope, { choice: request.duration, constraints }),
        prefix: `Updated for the equipment at ${place}`,
      };
    case 'technique':
      return {
        ...base,
        workout: rebuild(request, scope, { choice: request.duration, constraints }),
        prefix: `${TECHNIQUE_LABEL[trigger.technique]} ${request.profile.techniques[trigger.technique] ? 'on' : 'off'}`,
      };
    case 'profile':
      return {
        ...base,
        workout: rebuild(request, scope, { choice: request.duration, constraints }),
        prefix: 'Rebuilt for your updated profile',
      };

    case 'replace': {
      const workout = cloneWorkout(request.workout);
      const { entry, block } = findEntry(workout, trigger.entryId);
      const previous = requireExercise(entry.exerciseId);
      const next = requireExercise(trigger.exerciseId);
      const context = contextFor(request, constraints);
      const fit = checkExerciseFit(next, context);
      const blocked = fit.find((conflict) => conflict.severity === 'block');
      if (blocked) throw new Error(blocked.message);
      const { isDone } = classify(request);
      if (
        request.completed.sets.some((set) => set.entryId === entry.id) &&
        !entry.sets.some((set) => set.kind === 'working' && !isDone(entry.id, set.index))
      ) {
        throw new Error(`${previous.name} is done: nothing is left to swap.`);
      }
      applySubstitution(workout, entry, block, next, request, true);
      refresh(workout, request, constraints);
      return {
        ...base,
        workout,
        headline: `Swapped ${previous.name} for ${next.name}.`,
        notes: fit.filter((conflict) => conflict.severity === 'warn').map((c) => c.message),
      };
    }

    case 'equipment-busy': {
      const workout = cloneWorkout(request.workout);
      const { entry } = findEntry(workout, trigger.entryId);
      const exercise = requireExercise(entry.exerciseId);
      const available = contextFor(request, constraints).availableEquipment;
      const group =
        exercise.equipment.find((option) => option.every((id) => available.has(id))) ??
        exercise.equipment[0] ??
        [];
      constraints.busyEquipment = [...new Set([...constraints.busyEquipment, ...group])];
      const context = contextFor(request, constraints);
      const outcome = substituteUnfit(workout, request, context, { forceEntryId: entry.id });
      refresh(workout, request, constraints);
      return {
        ...base,
        workout,
        constraints,
        prefix: `${equipmentNames(group)} busy`,
        notes: outcome.notes,
      };
    }

    case 'pain': {
      const workout = cloneWorkout(request.workout);
      const { entry } = findEntry(workout, trigger.entryId);
      constraints.painJoints = [...new Set([...constraints.painJoints, trigger.joint])];
      constraints.avoidExerciseIds = [
        ...new Set([...constraints.avoidExerciseIds, entry.exerciseId]),
      ];
      const context = contextFor(request, constraints);
      const outcome = substituteUnfit(workout, request, context, {
        joint: trigger.joint,
        forceEntryId: entry.id,
      });
      refresh(workout, request, constraints);
      return {
        ...base,
        workout,
        constraints,
        prefix: `Protecting your ${jointLabel(trigger.joint)}`,
        notes: outcome.notes,
      };
    }

    case 'uncomfortable': {
      const workout = cloneWorkout(request.workout);
      const { entry, block } = findEntry(workout, trigger.entryId);
      const previous = requireExercise(entry.exerciseId);
      const { isDone } = classify(request);
      if (!entry.sets.some((set) => set.kind === 'working' && !isDone(entry.id, set.index))) {
        throw new Error(`${previous.name} is done: nothing is left to swap.`);
      }
      constraints.avoidExerciseIds = [
        ...new Set([...constraints.avoidExerciseIds, entry.exerciseId]),
      ];
      const context = contextFor(request, constraints);
      const alternative = bestAlternative(request, workout, entry, block, context);
      if (alternative) {
        applySubstitution(workout, entry, block, alternative, request, false);
        refresh(workout, request, constraints);
        return {
          ...base,
          workout,
          constraints,
          headline: `${previous.name} replaced by ${alternative.name} for comfort.`,
        };
      }
      removeEntry(workout, entry.id);
      refresh(workout, request, constraints);
      return {
        ...base,
        workout,
        constraints,
        headline: `Left out ${previous.name}: no comfortable alternative fits ${place}.`,
      };
    }

    case 'skip': {
      const workout = cloneWorkout(request.workout);
      if (request.completed.sets.some((done) => done.entryId === trigger.entryId)) {
        const { entry } = findEntry(workout, trigger.entryId);
        throw new Error(
          `${requireExercise(entry.exerciseId).name} has logged sets, so it stays; skip the rest of it from its set list instead.`,
        );
      }
      const before = workout.duration.estimatedMinutes;
      const removed = removeEntry(workout, trigger.entryId);
      constraints.avoidExerciseIds = [
        ...new Set([...constraints.avoidExerciseIds, removed.exerciseId]),
      ];
      // Skipping an exercise that carried a stopped one's sets skips those sets too: nothing
      // brings them back at the next rebuild.
      for (const stopped of stoppedBefore(workout.blocks, removed)) {
        stopped.stopped = { owed: stopped.stopped?.owed ?? 0, why: 'skip' };
      }
      refresh(workout, request, constraints);
      const saved = Math.max(0, before - workout.duration.estimatedMinutes);
      return {
        ...base,
        workout,
        constraints,
        headline: `Skipped ${requireExercise(removed.exerciseId).name}: about ${saved} min saved.`,
      };
    }

    case 'pin': {
      const workout = cloneWorkout(request.workout);
      const { entry } = findEntry(workout, trigger.entryId);
      entry.pinned = trigger.pinned;
      entry.locked = trigger.pinned;
      const name = requireExercise(entry.exerciseId).name;
      return {
        ...base,
        workout,
        headline: trigger.pinned
          ? `Pinned ${name}: it stays through every recalibration.`
          : `Unpinned ${name}.`,
      };
    }

    case 'performance': {
      const workout = cloneWorkout(request.workout);
      const { entry } = findEntry(workout, trigger.entryId);
      const { isDone } = classify(request);
      const name = requireExercise(entry.exerciseId).name;
      const logged =
        entry.sets.find((set) => set.index === trigger.setIndex) ??
        entry.sets.find((set) => set.kind === 'working');
      if (!logged) return { ...base, workout, headline: `No sets left to adjust on ${name}.` };
      const [min, max] = logged.targetReps;
      const remaining = entry.sets.filter(
        (set) =>
          set.kind === 'working' && set.index > trigger.setIndex && !isDone(entry.id, set.index),
      );
      const plan = trigger.plan;
      if (plan?.kind === 'weight' && remaining.length > 0) {
        const lifted = requireExercise(entry.exerciseId);
        const loading = loadingOf(request, lifted);
        const stepSize = loading.step;
        const floor = barWeightFor(lifted, request.profile.units) ?? 0;
        for (const set of remaining) {
          // The weight actually lifted is the ground truth; the plan moves from it, one real
          // step at a time where the place has a fixed set of weights.
          const current = trigger.actualWeight ?? set.targetWeight ?? null;
          if (current !== null) {
            const moved =
              loading.available !== null
                ? nudge(current, plan.delta > 0 ? 1 : -1, loading.available, stepSize)
                : Math.round((current + plan.delta) / stepSize) * stepSize;
            const next = Math.max(stepSize, floor, moved);
            // Only a set that really moves changes: at the heaviest weight "up" stays where it is.
            // A pushed set moved up takes the reps its push gives there; moved down, it keeps
            // them and is easier (Maintenance 23).
            if (next !== set.targetWeight) {
              const up = set.targetWeight !== null && next > set.targetWeight;
              set.targetWeight = next;
              if (up) repush(set, entry.role, entry.manual?.reps === true);
            }
          }
        }
        return { ...base, workout, headline: `${name}: ${plan.reason}` };
      }
      const shift = plan
        ? plan.kind === 'reps'
          ? plan.shift
          : 0
        : trigger.actualReps >= max + FAR_FROM_TARGET_REPS
          ? 2
          : trigger.actualReps <= min - FAR_FROM_TARGET_REPS
            ? -2
            : 0;
      if (shift === 0 || remaining.length === 0) {
        return {
          ...base,
          workout,
          headline:
            shift === 0
              ? plan
                ? `${name}: ${plan.reason}`
                : `${trigger.actualReps} reps is close to the ${min}-${max} target on ${name}: no change.`
              : `No sets left to adjust on ${name}.`,
        };
      }
      for (const set of remaining) {
        set.targetReps = [
          Math.max(1, set.targetReps[0] + shift),
          Math.max(2, set.targetReps[1] + shift),
        ];
      }
      const first = remaining[0] as SetPrescription;
      if (plan) return { ...base, workout, headline: `${name}: ${plan.reason}` };
      return {
        ...base,
        workout,
        headline:
          shift > 0
            ? `Adjusted the next ${remaining.length} ${remaining.length === 1 ? 'set' : 'sets'} of ${name}: aim for ${first.targetReps[0]}-${first.targetReps[1]} reps and add a little weight.`
            : `Adjusted the next ${remaining.length} ${remaining.length === 1 ? 'set' : 'sets'} of ${name}: aim for ${first.targetReps[0]}-${first.targetReps[1]} reps at the same weight.`,
      };
    }

    case 'add-exercise': {
      // The coverage card's tap: a few sets of an accessory for a muscle with nothing today,
      // placed after the plan and locked so a later fit keeps it.
      const workout = cloneWorkout(request.workout);
      const exercise = requireExercise(trigger.exerciseId);
      if (allEntries(workout.blocks).some((entry) => entry.exerciseId === exercise.id)) {
        throw new Error(`${exercise.name} is already in the workout.`);
      }
      const role: TrainingRole = exercise.compound ? 'secondary-hypertrophy' : 'isolation';
      // Fitted as the plan fits an exercise (Maintenance 24): to the weights at the place, a
      // deload week, the day's fatigue and its "Make it harder" or "easier"; the sets are the
      // ones the coach offered.
      const prescription = {
        ...shifted(
          prescriptionToday(request, exercise, role),
          dayAdjust(constraints)?.rir ?? 0,
          exercise,
        ),
        sets: Math.max(1, Math.round(trigger.sets)),
      };
      const loading = loadingOf(request, exercise);
      const target = fitToday(
        request,
        targetToday(request, workout, null, exercise, role, prescription),
        loading,
        exercise,
        role,
      );
      const numbers = allEntries(workout.blocks)
        .map((entry) => Number(entry.id.replace(/^e/, '')))
        .filter((value) => Number.isFinite(value));
      const entry: WorkoutEntry = {
        id: `e${Math.max(0, ...numbers) + 1}`,
        exerciseId: exercise.id,
        role,
        sets: applyProgression(
          buildSets(prescription, 0, exercise),
          target,
          loading.step,
          {},
          barWeightFor(exercise, request.profile.units),
          loading,
        ),
        progression: summarizeProgression(target),
        restSeconds: prescription.restSeconds,
        warmupSets: 0,
        dropSet: false,
        chosenFor: [trigger.muscle],
        locked: true,
        pinned: false,
      };
      workout.blocks.push({
        id: `b-${entry.id}`,
        kind: 'straight',
        label: exercise.name,
        entries: [entry],
        rounds: workingSets(entry).length,
        restBetweenRoundsSeconds: entry.restSeconds,
      });
      refresh(workout, request, constraints);
      return {
        ...base,
        workout,
        headline: `${exercise.name} added: ${prescription.sets} sets for ${muscleName(trigger.muscle).toLowerCase()}.`,
      };
    }

    case 'loading': {
      // The place's weights changed, or a plate is missing today: every entry's sets still to
      // come take loads that exist here, a started one included. Logged sets and weights set by
      // hand stay as they are. Nothing is swapped, added, or removed.
      const workout = cloneWorkout(request.workout);
      const { isDone } = classify(request);
      let updated = 0;
      for (const entry of allEntries(workout.blocks)) {
        if (refitEntry(entry, workout, request, isDone)) updated += 1;
      }
      // The session's length follows the sets as they now stand (Maintenance 23).
      if (updated > 0) refresh(workout, request, constraints);
      const place = request.location?.name ?? 'this place';
      return {
        ...base,
        workout,
        headline: updated > 0 ? `Loads matched to what ${place} has.` : 'No loads to change.',
      };
    }

    case 'max': {
      // The lifter entered a max: every unlogged, untouched entry of that lift starts from it,
      // and so does every other lift never logged, through the cross-exercise estimate.
      const workout = cloneWorkout(request.workout);
      const named = requireExercise(trigger.exerciseId);
      const weightOf = (entry: WorkoutEntry) =>
        entry.sets.find((set) => set.kind === 'working')?.targetWeight ?? null;
      const before = new Map(
        allEntries(request.workout.blocks).map((entry) => [entry.id, weightOf(entry)]),
      );
      let updated = 0;
      let others = 0;
      let raised = 0;
      let hasHistory = false;
      for (const entry of allEntries(workout.blocks)) {
        const own = entry.exerciseId === trigger.exerciseId;
        if (isStopped(entry)) continue;
        if (!own && entry.progression?.mode !== 'start') continue;
        // A lift with any set done or skipped, its ramp included, keeps its sets and their
        // numbers: its max counts from the next session (Maintenance 23).
        const touched = request.completed.sets.some((set) => set.entryId === entry.id);
        if (touched || entry.manual?.weight) continue;
        const exercise = requireExercise(entry.exerciseId);
        const plain = prescriptionToday(request, exercise, entry.role);
        const context = sessionContextFor(request, workout, entry.id, exercise);
        const byHand = entry.manual?.reps === true;
        const handReps = ownReps(entry);
        const targetFor = (asked: Prescription) =>
          targetToday(request, workout, entry.id, exercise, entry.role, asked);
        const plainTarget = targetFor(plain);
        // The effort the lift carries ("Make it harder" or "easier", a check-in) stays
        // (Maintenance 24).
        const prescription = shifted(plain, effortShift(request, entry, plainTarget.rir), exercise);
        let target = prescription === plain ? plainTarget : targetFor(prescription);
        const working =
          entry.sets.filter((set) => set.kind === 'working').length || prescription.sets;
        // A load read from an estimate for a rep range, with reps set by hand: the load for those
        // reps, as the max sheet shows it, never the heavier one for the plan's (Maintenance 23).
        const hand = handReps[0];
        if (byHand && hand && ESTIMATED_MODES.has(target.mode)) {
          target = targetFor({ ...prescription, reps: hand.reps, rir: hand.rir });
        }
        const loading = loadingOf(request, exercise);
        const fitted = fitToday(
          request,
          byHand ? ownTarget(target) : target,
          loading,
          exercise,
          entry.role,
        );
        const warmupSets = rampSetsFor(
          exercise,
          entry.role,
          workout.duration.targetMinutes,
          context.ramp,
          {
            weight: fitted.weight,
            step: loading.step,
            floor: barWeightFor(exercise, request.profile.units),
          },
        );
        entry.warmupSets = warmupSets;
        entry.sets = applyProgression(
          buildSets(
            { ...prescription, sets: working, restSeconds: entry.restSeconds },
            warmupSets,
            exercise,
          ),
          fitted,
          loading.step,
          {},
          barWeightFor(exercise, request.profile.units),
          loading,
        );
        if (byHand) restoreHandReps(entry, handReps, request, target, loading, exercise);
        // A plan from before an exercise stopped suiting a drop set loses it (Maintenance 23).
        entry.dropSet = entry.dropSet && exercise.dropSetSafe && !entryPushedToEffort(entry);
        if (entry.dropSet) entry.sets.push(dropSetAt(entry.sets.length));
        entry.progression = summarizeProgression(fitted);
        if (own) {
          updated += 1;
          if (fitted.mode !== 'start') hasHistory = true;
          const was = before.get(entry.id) ?? null;
          const now = weightOf(entry);
          if (was !== null && now !== null && now > was) raised += 1;
        } else {
          others += 1;
        }
      }
      // The plan's lines follow the loads a max moved, a deload week's among them (Maintenance 24).
      refresh(workout, request, constraints);
      return {
        ...base,
        workout,
        headline:
          updated === 0
            ? request.completed.sets.some((set) => set.exerciseId === named.id && !set.skipped)
              ? `${named.name} already has logged sets today; your max counts from the next session.`
              : request.completed.sets.some((set) => set.exerciseId === named.id)
                ? `${named.name} is already under way today; your max counts from the next session.`
                : // Nothing of it done: its weight was set for today (Maintenance 23).
                  `Max saved. ${named.name} keeps the weight set for today.`
            : !hasHistory
              ? `First target for ${named.name} set from your max.`
              : raised > 0
                ? `${named.name}: the target moved toward your max.`
                : `Max saved. Your logged sets already put ${named.name} at this target.`,
        notes:
          others > 0
            ? [
                `${others} other lift${others === 1 ? '' : 's'} never logged take${others === 1 ? 's' : ''} a first target from it too.`,
              ]
            : [],
      };
    }

    case 'target-weight': {
      const workout = cloneWorkout(request.workout);
      const { entry } = findEntry(workout, trigger.entryId);
      const { isDone } = classify(request);
      const name = requireExercise(entry.exerciseId).name;
      for (const set of entry.sets) {
        if (set.kind !== 'warmup' && !isDone(entry.id, set.index)) {
          // A pushed set moved up takes the reps its push gives at the new weight, or the range
          // asked at the load asked; moved down it keeps its reps and is easier (Maintenance 23).
          const up =
            trigger.weight !== null &&
            set.targetWeight !== null &&
            trigger.weight > set.targetWeight;
          set.targetWeight = trigger.weight;
          if (trigger.weight === null) delete set.asked;
          else if (up) repush(set, entry.role, entry.manual?.reps === true);
        }
      }
      // The ramps still to come follow the weight you set: under it, never under the bar, and
      // gone when nothing lighter than the bar exists.
      if (trigger.weight !== null) {
        const exercise = requireExercise(entry.exerciseId);
        const loading = loadingOf(request, exercise);
        const floor = barWeightFor(exercise, request.profile.units);
        const pending = entry.sets.filter(
          (set) => set.kind === 'warmup' && !isDone(entry.id, set.index),
        );
        const room = rampRoom({ weight: trigger.weight, step: loading.step, floor });
        const dropped = pending.splice(0, Math.max(0, pending.length - room));
        entry.sets = entry.sets.filter((set) => !dropped.includes(set));
        entry.warmupSets = Math.max(0, entry.warmupSets - dropped.length);
        const loads = rampWeights(trigger.weight, pending.length, loading.step, floor);
        pending.forEach((set, index) => {
          const load = loads[index];
          set.targetWeight =
            load === null || load === undefined ? null : fitWeight(load, loading, floor);
        });
      }
      entry.manual = { ...entry.manual, weight: true };
      return {
        ...base,
        workout,
        headline:
          trigger.weight === null
            ? `Target weight cleared for ${name}.`
            : `Target ${trigger.weight} ${request.profile.units} for ${name}.`,
      };
    }

    case 'readiness': {
      const readiness = trigger.readiness;
      constraints.readiness = { ...readiness, jointDiscomfort: [...readiness.jointDiscomfort] };
      constraints.painJoints = [
        ...new Set([...constraints.painJoints, ...readiness.jointDiscomfort]),
      ];
      const adjust = readinessAdjustment(readiness);
      // A check-in that takes back an earlier one's adjustment brings the full workout back
      // (Maintenance 24); kept as it was, the plan would stay cut while the check-in says otherwise.
      const earlier = request.constraints.readiness
        ? readinessAdjustment(request.constraints.readiness)
        : undefined;
      const restored = !adjust && earlier !== undefined;
      const choice: DurationChoice =
        readiness.timePressure && request.duration === 'default' ? 45 : request.duration;
      if (
        !adjust &&
        !restored &&
        readiness.jointDiscomfort.length === 0 &&
        choice === request.duration
      ) {
        return { ...base, constraints, headline: 'Feeling good: full workout kept.' };
      }
      const settled = settleKept(request, constraints);
      const workout = rebuild({ ...request, workout: settled.workout }, scope, {
        choice,
        constraints,
        trimmable: settled.trimmable,
      });
      // The words say what changed on the lifts still to come: at their fewest sets a cut takes
      // none, and only the reserve moves (Maintenance 24).
      const change = dayChange(request, workout);
      // Sets are named only where the day's settings moved them that way: the rebuild also fits
      // the time (the minutes left once started, a new length), which is no part of the check-in.
      // The reserve moves with the settings alone.
      const sets =
        (dayAdjust(constraints)?.sets ?? 0) - (dayAdjust(request.constraints)?.sets ?? 0);
      const fewer = sets < 0 && change.fewer;
      const more = sets > 0 && change.more;
      const { easier, harder } = change;
      const parts: string[] = [];
      const cut = [fewer ? 'fewer sets' : '', easier ? 'an extra rep in reserve' : ''];
      if (fewer || easier) parts.push(cut.filter(Boolean).join(' with '));
      if (more || harder) {
        parts.push(
          more && harder
            ? 'the planned sets and effort back'
            : more
              ? 'the planned sets back'
              : 'the planned effort back',
        );
      }
      const back = restored && parts.length === 1 && (more || harder);
      // A sore joint is named only where a lift it rules out, with sets still to come, left the plan
      // or stopped for it.
      const { isDone } = classify(request);
      const going = new Set(
        allEntries(workout.blocks)
          .filter((entry) => !isStopped(entry))
          .map((entry) => entry.exerciseId),
      );
      const eased = readiness.jointDiscomfort.filter((joint) =>
        allEntries(request.workout.blocks).some(
          (entry) =>
            entry.sets.some((set) => set.kind === 'working' && !isDone(entry.id, set.index)) &&
            !going.has(entry.exerciseId) &&
            ruledOutBy(requireExercise(entry.exerciseId), joint),
        ),
      );
      if (eased.length > 0) parts.push(`easier on your ${eased.map(jointLabel).join(' and ')}`);
      if (choice !== request.duration) parts.push(`fitted to ${choice} min for time pressure`);
      const only = back && parts.length === 1 ? (parts[0] as string) : null;
      return {
        ...base,
        workout,
        constraints,
        duration: choice,
        prefix: only
          ? `${only.charAt(4).toUpperCase()}${only.slice(5)}`
          : parts.length > 0
            ? `Adjusted for today (${parts.join(', ')})`
            : 'Checked in',
        // Nothing left to bring back (the lift under way keeps its sets, and sets at their fewest
        // stay): no claim that anything came back. Otherwise the words name only what changed.
        unchanged:
          restored && parts.length === 0 && readiness.jointDiscomfort.length === 0
            ? 'Feeling good: nothing left to change.'
            : undefined,
      };
    }

    case 'resume': {
      const away = Math.round(trigger.awaySeconds / 60);
      if (trigger.awaySeconds < LONG_INTERRUPTION_SECONDS || !hasStarted(request.completed)) {
        return { ...base, headline: `Back after ${away} min: nothing to change.` };
      }
      const workout = rebuild(request, scope, {
        choice: request.duration,
        constraints,
        resume: true,
      });
      const ramped = rampBack(workout, request);
      return {
        ...base,
        workout,
        prefix: `Back after ${away} min`,
        notes: [
          ramped
            ? `One light ramp set on ${ramped} before you continue; the rest of the session starts fresher too.`
            : 'The rest of the session starts fresher: ramps are back where they are needed.',
        ],
      };
    }

    case 'finish-early': {
      const workout = cloneWorkout(request.workout);
      const { frozenIds } = classify(request);
      const keepIds = new Set([
        ...frozenIds,
        ...(request.currentEntryId ? [request.currentEntryId] : []),
      ]);
      const leaving = allEntries(workout.blocks).filter((entry) => !keepIds.has(entry.id));
      for (const entry of leaving) removeEntry(workout, entry.id);
      refresh(workout, request, constraints);
      return {
        ...base,
        workout,
        headline:
          leaving.length === 0
            ? 'Finishing early: nothing left to remove.'
            : `Finishing early: ${leaving.length} ${leaving.length === 1 ? 'exercise' : 'exercises'} left out.`,
      };
    }

    case 'intensity': {
      const step = trigger.direction === 'harder' ? 1 : -1;
      constraints.intensity = Math.max(-2, Math.min(2, constraints.intensity + step));
      const settled = settleKept(request, constraints);
      const workout = rebuild({ ...request, workout: settled.workout }, scope, {
        choice: request.duration,
        constraints,
        trimmable: settled.trimmable,
      });
      return {
        ...base,
        workout,
        constraints,
        prefix: `Rest of the workout made ${trigger.direction}`,
      };
    }

    case 'sets': {
      const workout = cloneWorkout(request.workout);
      const { entry, block } = findEntry(workout, trigger.entryId);
      const { isDone } = classify(request);
      const exercise = requireExercise(entry.exerciseId);
      if (trigger.workingDelta > 0) {
        const workingNow = entry.sets.filter((set) => set.kind === 'working').length;
        if (workingNow >= MAX_WORKING_SETS) {
          return {
            ...base,
            workout,
            headline: `${exercise.name} stays at ${workingNow} working sets: past that another set adds fatigue, not growth.`,
          };
        }
        const last = [...entry.sets].reverse().find((set) => set.kind === 'working');
        const prescription = prescribeFor(exercise, entry.role, request.profile, request.history);
        const added: SetPrescription = {
          index: nextSetIndex(entry),
          kind: 'working',
          targetReps: last ? [last.targetReps[0], last.targetReps[1]] : prescription.reps,
          targetRir: last?.targetRir ?? prescription.rir,
          targetWeight: last?.targetWeight ?? null,
          restSeconds: entry.restSeconds,
          ...(last?.asked
            ? {
                asked: {
                  weight: last.asked.weight,
                  reps: [last.asked.reps[0], last.asked.reps[1]] as [number, number],
                },
              }
            : {}),
        };
        const dropAt = entry.sets.findIndex((set) => set.kind === 'drop');
        if (dropAt >= 0) entry.sets.splice(dropAt, 0, added);
        else entry.sets.push(added);
      } else {
        const removable = [...entry.sets]
          .reverse()
          .find((set) => set.kind === 'working' && !isDone(entry.id, set.index));
        const working = entry.sets.filter((set) => set.kind === 'working').length;
        if (!removable || working <= 1) {
          return { ...base, workout, headline: `${exercise.name} keeps its last working set.` };
        }
        entry.sets = entry.sets.filter((set) => set !== removable);
      }
      entry.manual = { ...entry.manual, sets: true };
      syncRounds(block);
      refresh(workout, request, constraints);
      const count = entry.sets.filter((set) => set.kind === 'working').length;
      return {
        ...base,
        workout,
        headline: `${exercise.name}: ${count} working ${count === 1 ? 'set' : 'sets'}.`,
      };
    }

    case 'add-warmup': {
      const workout = cloneWorkout(request.workout);
      const { entry } = findEntry(workout, trigger.entryId);
      const name = requireExercise(entry.exerciseId).name;
      const { isDone } = classify(request);
      // The ramp leads into the working sets still to come, so it reads their range: a pushed
      // set's, the one it stands in for, never the push's extra reps (Maintenance 23).
      const first =
        entry.sets.find((set) => set.kind === 'working' && !isDone(entry.id, set.index)) ??
        entry.sets.find((set) => set.kind === 'working');
      const reps = first?.asked?.reps ?? first?.targetReps ?? [8, 10];
      // A lift with no load warms up with one set of a few easy reps (Maintenance 23), well under
      // the working sets: a second would only tire it. One skipped was never done.
      const noLoad = hasNoLoad(requireExercise(entry.exerciseId));
      const skipped = new Set(
        request.completed.sets
          .filter((set) => set.entryId === entry.id && set.skipped)
          .map((set) => set.setIndex),
      );
      if (noLoad && entry.sets.some((set) => set.kind === 'warmup' && !skipped.has(set.index))) {
        throw new Error(`${name} already has its warm-up set.`);
      }
      entry.sets.unshift({
        index: nextSetIndex(entry),
        kind: 'warmup',
        targetReps: noLoad ? easyWarmupReps(reps) : [Math.max(3, reps[0]), Math.max(5, reps[1])],
        targetRir: 5,
        targetWeight: null,
        restSeconds: 45,
      });
      entry.warmupSets += 1;
      if (!workout.warmup.rampEntryIds.includes(entry.id))
        workout.warmup.rampEntryIds.push(entry.id);
      refresh(workout, request, constraints);
      return {
        ...base,
        workout,
        headline: `Added a ramp set to ${name}; ramp sets never count as working sets.`,
      };
    }

    case 'rep-range': {
      const [low, high] = trigger.reps;
      if (!(
        Number.isInteger(low) &&
        Number.isInteger(high) &&
        low >= 1 &&
        high >= low &&
        high <= 120
      )) {
        throw new Error('The rep range must be whole numbers between 1 and 120, low first.');
      }
      const workout = cloneWorkout(request.workout);
      const { entry, block } = findEntry(workout, trigger.entryId);
      const { isDone } = classify(request);
      const name = requireExercise(entry.exerciseId).name;
      let changed = 0;
      for (const set of entry.sets) {
        if (set.kind === 'working' && !isDone(entry.id, set.index)) {
          set.targetReps = [low, high];
          changed += 1;
        }
      }
      if (changed > 0) entry.manual = { ...entry.manual, reps: true };
      // A lift with no load warms up with a few easy reps: they follow the working range down or
      // up, and stay well under it (Maintenance 23).
      if (changed > 0 && hasNoLoad(requireExercise(entry.exerciseId))) {
        for (const set of entry.sets) {
          if (set.kind === 'warmup' && !isDone(entry.id, set.index)) {
            set.targetReps = easyWarmupReps([low, high]);
          }
        }
      }
      // The note by the target names the load alone once the reps are the lifter's, as after a
      // change of weights: no push's extra reps beside them (Maintenance 23).
      if (changed > 0) refitEntry(entry, workout, request, isDone);
      // Fewer reps over more sets: the work moves into one more set at the new range.
      const workingNow = entry.sets.filter((set) => set.kind === 'working').length;
      const addSet = trigger.workingDelta === 1 && changed > 0 && workingNow < MAX_WORKING_SETS;
      if (addSet) {
        const last = [...entry.sets].reverse().find((set) => set.kind === 'working');
        const added: SetPrescription = {
          index: nextSetIndex(entry),
          kind: 'working',
          targetReps: [low, high],
          targetRir: last?.targetRir ?? 2,
          targetWeight: last?.targetWeight ?? null,
          restSeconds: entry.restSeconds,
          ...(last?.asked
            ? {
                asked: {
                  weight: last.asked.weight,
                  reps: [last.asked.reps[0], last.asked.reps[1]] as [number, number],
                },
              }
            : {}),
        };
        const dropAt = entry.sets.findIndex((set) => set.kind === 'drop');
        if (dropAt >= 0) entry.sets.splice(dropAt, 0, added);
        else entry.sets.push(added);
        entry.manual = { ...entry.manual, sets: true };
      }
      // The session's length follows the sets it now has.
      syncRounds(block);
      refresh(workout, request, constraints);
      const count = entry.sets.filter((set) => set.kind === 'working').length;
      return {
        ...base,
        workout,
        headline: addSet
          ? `${name}: ${count} sets of ${low}-${high}.`
          : changed > 0
            ? `${name}: ${targetText([low, high], holdById(entry.exerciseId))} for the remaining ${changed === 1 ? 'set' : 'sets'}.`
            : `No sets left to change on ${name}.`,
      };
    }

    case 'reorder': {
      const workout = cloneWorkout(request.workout);
      const { frozenIds } = classify(request);
      const index = workout.blocks.findIndex((block) =>
        block.entries.some((entry) => entry.id === trigger.entryId),
      );
      if (index < 0) throw new Error('That exercise is no longer in the workout.');
      const target = trigger.direction === 'up' ? index - 1 : index + 1;
      const moving = workout.blocks[index] as WorkoutBlock;
      if (target < 0 || target >= workout.blocks.length) {
        return {
          ...base,
          workout,
          headline: `${moving.label} is already ${trigger.direction === 'up' ? 'first' : 'last'}.`,
        };
      }
      const started = (block: WorkoutBlock) =>
        block.entries.some(
          (entry) => frozenIds.has(entry.id) || entry.id === request.currentEntryId,
        );
      const other = workout.blocks[target] as WorkoutBlock;
      if (started(moving) || started(other)) {
        throw new Error('Started exercises keep their place in the order.');
      }
      workout.blocks[index] = other;
      workout.blocks[target] = moving;
      refresh(workout, request, constraints);
      return { ...base, workout, headline: `Moved ${moving.label} ${trigger.direction}.` };
    }

    case 'split-superset': {
      const workout = cloneWorkout(request.workout);
      const at = workout.blocks.findIndex((block) => block.id === trigger.blockId);
      const block = workout.blocks[at];
      if (!block || block.kind === 'straight') throw new Error('That row is not a superset.');
      const { frozenIds } = classify(request);
      if (block.entries.some((entry) => frozenIds.has(entry.id))) {
        throw new Error('A superset with logged rounds stays together.');
      }
      const straight: WorkoutBlock[] = block.entries.map((entry) => ({
        id: `b-${entry.id}`,
        kind: 'straight',
        label: requireExercise(entry.exerciseId).name,
        entries: [entry],
        rounds: workingSets(entry).length,
        restBetweenRoundsSeconds: entry.restSeconds,
      }));
      workout.blocks.splice(at, 1, ...straight);
      refresh(workout, request, constraints);
      return { ...base, workout, headline: `Split ${block.label} into straight sets.` };
    }

    case 'drop-set': {
      const workout = cloneWorkout(request.workout);
      const { entry, block } = findEntry(workout, trigger.entryId);
      const { isDone } = classify(request);
      const exercise = requireExercise(entry.exerciseId);
      const existing = entry.sets.find((set) => set.kind === 'drop');
      if (trigger.on) {
        if (!exercise.dropSetSafe) throw new Error(`${exercise.name} is not safe for a drop set.`);
        if (existing)
          return { ...base, workout, headline: `${exercise.name} already has a drop set.` };
        // The load comes from a working set actually lifted, never from the plan. Until the
        // last working set is logged the drop set carries none, and the store fills it in then.
        const lifted = request.completed.sets
          .filter((done) => done.entryId === entry.id && done.kind === 'working' && !done.skipped)
          .sort((a, b) => a.setIndex - b.setIndex)
          .map((done) => done.weight)
          .filter((weight): weight is number => typeof weight === 'number' && weight > 0);
        const workingLeft = entry.sets.some(
          (set) => set.kind === 'working' && !isDone(entry.id, set.index),
        );
        const last = lifted[lifted.length - 1];
        const step = weightStep(exercise, request.profile.units);
        entry.sets.push({
          index: nextSetIndex(entry),
          kind: 'drop',
          targetReps: [8, 12],
          targetRir: 0,
          targetWeight:
            last !== undefined && !workingLeft
              ? fitWeight(dropSetWeight(last, step), loadingOf(request, exercise))
              : null,
          restSeconds: 0,
        });
        entry.dropSet = true;
      } else {
        if (!existing) return { ...base, workout, headline: `${exercise.name} has no drop set.` };
        if (isDone(entry.id, existing.index)) throw new Error('A logged drop set stays.');
        entry.sets = entry.sets.filter((set) => set !== existing);
        entry.dropSet = false;
      }
      syncRounds(block);
      refresh(workout, request, constraints);
      return {
        ...base,
        workout,
        headline: trigger.on
          ? `Drop set added to ${exercise.name}: strip about 20% after the last set and go.`
          : `Drop set removed from ${exercise.name}.`,
      };
    }

    case 'rest-adjust': {
      const workout = cloneWorkout(request.workout);
      const { entry, block } = findEntry(workout, trigger.entryId);
      const { isDone } = classify(request);
      const name = requireExercise(entry.exerciseId).name;
      const next = Math.max(30, Math.min(300, entry.restSeconds + trigger.deltaSeconds));
      entry.restSeconds = next;
      for (const set of entry.sets) {
        if (set.kind === 'working' && !isDone(entry.id, set.index)) set.restSeconds = next;
      }
      block.restBetweenRoundsSeconds =
        block.kind === 'straight'
          ? next
          : Math.max(30, Math.min(300, block.restBetweenRoundsSeconds + trigger.deltaSeconds));
      entry.manual = { ...entry.manual, rest: true };
      refresh(workout, request, constraints);
      return {
        ...base,
        workout,
        headline: `${name}: ${next >= 60 ? `${Math.round((next / 60) * 10) / 10} min` : `${next} s`} rest for the remaining sets.`,
      };
    }

    case 'end-by': {
      constraints.endBy = trigger.time;
      const workout = rebuild(request, scope, { choice: request.duration, constraints });
      return {
        ...base,
        workout,
        constraints,
        prefix: trigger.time ? `Ends by ${formatClock(trigger.time)}` : 'Exact end time off',
      };
    }
  }
}

function nextSetIndex(entry: WorkoutEntry): number {
  return Math.max(-1, ...entry.sets.map((set) => set.index)) + 1;
}

/** A block's rounds after a change; a circuit's are the rounds it runs (Maintenance 24). */
function syncRounds(block: WorkoutBlock): void {
  block.rounds =
    block.kind === 'straight'
      ? workingSets(block.entries[0] as WorkoutEntry).length
      : block.kind === 'circuit'
        ? roundsRun(block)
        : Math.min(...block.entries.map((member) => workingSets(member).length));
}

/** Invariants every result must satisfy before it can replace the previous workout. */
function validateWorkout(
  workout: GeneratedWorkout,
  request: RecalibrationRequest,
  context: ConflictContext,
): void {
  const entries = allEntries(workout.blocks);
  if (entries.length === 0 && request.trigger.type !== 'finish-early') {
    throw new Error('The rebuilt workout came back empty, so nothing was changed.');
  }
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id))
      throw new Error('The rebuilt workout repeated a row, so nothing was changed.');
    ids.add(entry.id);
    requireExercise(entry.exerciseId);
    if (entry.sets.length === 0)
      throw new Error(
        `${requireExercise(entry.exerciseId).name} came back with no sets, so nothing was changed.`,
      );
  }
  const exerciseIds = entries.map((entry) => entry.exerciseId);
  if (new Set(exerciseIds).size !== exerciseIds.length) {
    throw new Error('The same exercise appeared twice, so nothing was changed.');
  }
  for (const block of workout.blocks) {
    if (block.entries.length === 0)
      throw new Error('An empty row was produced, so nothing was changed.');
    if (block.kind === 'superset' && block.entries.length !== 2)
      throw new Error('A superset must hold exactly two moves, so nothing was changed.');
    if (block.kind === 'circuit' && block.entries.length < 3)
      throw new Error('A circuit must hold three moves, so nothing was changed.');
  }
  for (const done of request.completed.sets) {
    const entry = entries.find((candidate) => candidate.id === done.entryId);
    const name = requireExercise(done.exerciseId).name;
    if (!entry)
      throw new Error(`Logged sets for ${name} would have been lost, so nothing was changed.`);
    if (!entry.sets.some((set) => set.index === done.setIndex))
      throw new Error(`A logged set of ${name} would have been lost, so nothing was changed.`);
  }
  const frozen = new Set(request.completed.sets.map((set) => set.entryId));
  const future = entries
    .filter((entry) => !frozen.has(entry.id))
    .map((entry) => requireExercise(entry.exerciseId));
  const blocked = checkWorkoutConflicts(future, context).find((c) => c.severity === 'block');
  if (blocked) throw new Error(blocked.message);
}
