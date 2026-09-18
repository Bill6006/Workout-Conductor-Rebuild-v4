import { dropSetWeight } from './dropSet';
import { EQUIPMENT } from '../../catalog/equipment/equipment';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { CatalogExercise, Joint, TrainingRole } from '../../catalog/exercises/exerciseSchema';
import { muscleName } from '../../catalog/muscles/muscles';
import { rankAlternatives } from '../alternatives/rankAlternatives';
import {
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
  rampWeights,
  recommendNextTarget,
  summarizeProgression,
} from '../progression/progression';
import {
  buildSets,
  prescribe,
  rampRoom,
  rampSetsFor,
  type RampContext,
} from '../progression/roles';
import { barWeightFor } from '../progression/startingLoad';
import { precedingWorkToday } from '../recovery/sessionContext';
import {
  generateWorkout,
  rampContextFor,
  sessionConflictContext,
  sessionWork,
  type GenerationConstraints,
  type KeptEntry,
  type PrescriptionAdjustment,
} from '../workoutGenerator/generate';
import {
  allEntries,
  workingSets,
  type DurationChoice,
  type GeneratedWorkout,
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
      previous: request.workout,
      next: outcome.workout,
      changes,
      notes: outcome.notes,
    });
    const workout: GeneratedWorkout = {
      ...outcome.workout,
      id: request.workout.id,
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
): KeptEntry[] {
  return (
    allEntries(request.workout.blocks)
      .filter((entry) => classified.frozenIds.has(entry.id) || classified.lockedIds.has(entry.id))
      .map((entry) => ({ entry, frozen: classified.frozenIds.has(entry.id) }))
      // A locked pick that no longer fits the place or the joint cannot be performed, so it is rebuilt.
      .filter(
        (kept) =>
          kept.frozen ||
          !isBlocked(checkExerciseFit(requireExercise(kept.entry.exerciseId), context)),
      )
  );
}

interface RebuildOptions {
  choice: DurationChoice;
  constraints: SessionConstraints;
  adjust?: PrescriptionAdjustment;
  resume?: boolean;
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
  const keep = scope === 'full' ? [] : keptEntries(request, classified, context);
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
    adjust: options.adjust,
    readiness: constraints.readiness,
    deload: constraints.deload,
    focusMuscle: constraints.focus,
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

/** What this exercise can be loaded to at the request's place today. */
function loadingOf(request: RecalibrationRequest, exercise: CatalogExercise): Loading {
  return loadingFor(request.location?.loading, request.loading, exercise, request.profile.units);
}

/**
 * Session context for one entry: what the entries before it have done today
 * (all of them, for an entry not yet in the workout), and the ramp it deserves.
 */
function sessionContextFor(
  request: RecalibrationRequest,
  workout: GeneratedWorkout,
  entryId: string | null,
  exercise: CatalogExercise,
): { precedingSets: number; afterBreak: boolean; ramp: RampContext } {
  const before: WorkoutEntry[] = [];
  for (const entry of allEntries(workout.blocks)) {
    if (entry.id === entryId) break;
    before.push(entry);
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
 * After a long break the entry in front of the lifter gets one light ramp
 * set back before its remaining working sets, at three fifths of the load.
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
  found.sets.splice(nextIndex, 0, {
    index: nextSetIndex(found),
    kind: 'warmup',
    targetReps: [Math.max(3, next.targetReps[0]), Math.max(5, next.targetReps[1])],
    targetRir: 5,
    targetWeight: weight === undefined ? null : fitWeight(weight ?? 0, loading, floor),
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

/** Swaps the exercise of one entry, keeping its role, rest, and any logged sets exactly as they are. */
function applySubstitution(
  entry: WorkoutEntry,
  block: WorkoutBlock,
  exercise: CatalogExercise,
  request: RecalibrationRequest,
  lock: boolean,
): void {
  const logged = request.completed.sets.some((set) => set.entryId === entry.id);
  const previousId = entry.exerciseId;
  if (!logged) {
    const prescription = prescribe(exercise, entry.role, request.profile);
    const working = entry.sets.filter((set) => set.kind === 'working').length || prescription.sets;
    const context = sessionContextFor(request, request.workout, entry.id, exercise);
    const target = recommendNextTarget({
      exercise,
      role: entry.role,
      prescription,
      history: request.history,
      profile: request.profile,
      now: request.timestamp,
      maxes: request.maxes,
      session: { precedingSets: context.precedingSets },
    });
    const loading = loadingOf(request, exercise);
    const fitted = capTarget(target, loading, request.profile.units);
    const warmupSets = rampSetsFor(
      exercise,
      entry.role,
      request.workout.duration.targetMinutes,
      context.ramp,
      {
        weight: fitted.weight,
        step: loading.step,
        floor: barWeightFor(exercise, request.profile.units),
      },
    );
    entry.sets = applyProgression(
      buildSets({ ...prescription, sets: working, restSeconds: entry.restSeconds }, warmupSets),
      fitted,
      loading.step,
      {},
      barWeightFor(exercise, request.profile.units),
      loading,
    );
    entry.progression = summarizeProgression(fitted);
    entry.warmupSets = warmupSets;
    if (entry.dropSet) {
      if (exercise.dropSetSafe) entry.sets.push(dropSetAt(entry.sets.length));
      else entry.dropSet = false;
    }
  } else if (entry.dropSet && !exercise.dropSetSafe) {
    entry.sets = entry.sets.filter((set) => set.kind !== 'drop');
    entry.dropSet = false;
  }
  entry.exerciseId = exercise.id;
  entry.replacedFrom = previousId;
  entry.locked = lock || entry.locked;
  const overlap = entry.chosenFor.filter((muscle) => exercise.primaryMuscles.includes(muscle));
  entry.chosenFor = overlap.length > 0 ? overlap : [...exercise.primaryMuscles];
  relabel(block);
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
    block.rounds = Math.min(...block.entries.map((member) => workingSets(member).length));
    relabel(block);
  }
  workout.warmup.rampEntryIds = workout.warmup.rampEntryIds.filter((id) => id !== entryId);
  return entry;
}

function isFullyDone(entry: WorkoutEntry, isDone: SetDonePredicate): boolean {
  const working = entry.sets.filter((set) => set.kind === 'working');
  return working.length > 0 && working.every((set) => isDone(entry.id, set.index));
}

function gentleOn(exercise: CatalogExercise, joint: Joint | undefined): boolean {
  if (!joint) return true;
  const stress = exercise.jointStress[joint];
  return stress === undefined || stress === 'low';
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
    (candidate) => !isBlocked(checkWorkoutConflicts([...others, candidate.exercise], context)),
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
  workout.explanation = { ...workout.explanation, time };
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
  const over =
    overBy > 1
      ? [`Even the leanest version runs about ${Math.round(overBy)} min over ${target} min.`]
      : [];
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
    if (isFullyDone(entry, isDone)) continue;
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
      applySubstitution(entry, block, alternative, request, false);
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

function execute(request: RecalibrationRequest, scope: RecalibrationScope): Outcome {
  const { trigger } = request;
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
    case 'location':
      return {
        ...base,
        workout: rebuild(request, scope, { choice: request.duration, constraints }),
        prefix: `Rebuilt for ${place}`,
      };
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
      applySubstitution(entry, block, next, request, true);
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
      constraints.avoidExerciseIds = [
        ...new Set([...constraints.avoidExerciseIds, entry.exerciseId]),
      ];
      const context = contextFor(request, constraints);
      const alternative = bestAlternative(request, workout, entry, block, context);
      if (alternative) {
        applySubstitution(entry, block, alternative, request, false);
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
            set.targetWeight = Math.max(stepSize, floor, moved);
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
      const prescription = {
        ...prescribe(exercise, role, request.profile),
        sets: Math.max(1, Math.round(trigger.sets)),
      };
      const target = recommendNextTarget({
        exercise,
        role,
        prescription,
        history: request.history,
        profile: request.profile,
        now: request.timestamp,
        maxes: request.maxes,
        session: {
          precedingSets: sessionContextFor(request, workout, null, exercise).precedingSets,
        },
      });
      const numbers = allEntries(workout.blocks)
        .map((entry) => Number(entry.id.replace(/^e/, '')))
        .filter((value) => Number.isFinite(value));
      const entry: WorkoutEntry = {
        id: `e${Math.max(0, ...numbers) + 1}`,
        exerciseId: exercise.id,
        role,
        sets: applyProgression(
          buildSets(prescription, 0),
          target,
          weightStep(exercise, request.profile.units),
          {},
          barWeightFor(exercise, request.profile.units),
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
      // The place's weights changed, or a plate is missing today: every unlogged, untouched
      // entry takes loads that exist here. Nothing is swapped, added, or removed.
      const workout = cloneWorkout(request.workout);
      let updated = 0;
      for (const entry of allEntries(workout.blocks)) {
        const logged = request.completed.sets.some(
          (set) => set.entryId === entry.id && set.kind === 'working' && !set.skipped,
        );
        if (logged || entry.manual?.weight) continue;
        const exercise = requireExercise(entry.exerciseId);
        const prescription = prescribe(exercise, entry.role, request.profile);
        const working =
          entry.sets.filter((set) => set.kind === 'working').length || prescription.sets;
        const context = sessionContextFor(request, workout, entry.id, exercise);
        const target = recommendNextTarget({
          exercise,
          role: entry.role,
          prescription,
          history: request.history,
          profile: request.profile,
          now: request.timestamp,
          maxes: request.maxes,
          session: { precedingSets: context.precedingSets },
        });
        const loading = loadingOf(request, exercise);
        const fitted = capTarget(target, loading, request.profile.units);
        const rampLogged = request.completed.sets.some(
          (set) => set.entryId === entry.id && set.kind === 'warmup',
        );
        const warmupSets = rampLogged
          ? entry.warmupSets
          : rampSetsFor(exercise, entry.role, workout.duration.targetMinutes, context.ramp, {
              weight: fitted.weight,
              step: loading.step,
              floor: barWeightFor(exercise, request.profile.units),
            });
        entry.warmupSets = warmupSets;
        entry.sets = applyProgression(
          buildSets({ ...prescription, sets: working, restSeconds: entry.restSeconds }, warmupSets),
          fitted,
          loading.step,
          entry.manual ?? {},
          barWeightFor(exercise, request.profile.units),
          loading,
        );
        if (entry.dropSet && exercise.dropSetSafe) entry.sets.push(dropSetAt(entry.sets.length));
        entry.progression = summarizeProgression(fitted);
        updated += 1;
      }
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
      let updated = 0;
      let others = 0;
      for (const entry of allEntries(workout.blocks)) {
        const own = entry.exerciseId === trigger.exerciseId;
        if (!own && entry.progression?.mode !== 'start') continue;
        const logged = request.completed.sets.some(
          (set) => set.entryId === entry.id && set.kind === 'working' && !set.skipped,
        );
        if (logged || entry.manual?.weight) continue;
        const exercise = requireExercise(entry.exerciseId);
        const prescription = prescribe(exercise, entry.role, request.profile);
        const working =
          entry.sets.filter((set) => set.kind === 'working').length || prescription.sets;
        const context = sessionContextFor(request, workout, entry.id, exercise);
        const target = recommendNextTarget({
          exercise,
          role: entry.role,
          prescription,
          history: request.history,
          profile: request.profile,
          now: request.timestamp,
          maxes: request.maxes,
          session: { precedingSets: context.precedingSets },
        });
        const loading = loadingOf(request, exercise);
        const fitted = capTarget(target, loading, request.profile.units);
        const rampLogged = request.completed.sets.some(
          (set) => set.entryId === entry.id && set.kind === 'warmup',
        );
        const warmupSets = rampLogged
          ? entry.warmupSets
          : rampSetsFor(exercise, entry.role, workout.duration.targetMinutes, context.ramp, {
              weight: fitted.weight,
              step: loading.step,
              floor: barWeightFor(exercise, request.profile.units),
            });
        entry.warmupSets = warmupSets;
        entry.sets = applyProgression(
          buildSets({ ...prescription, sets: working, restSeconds: entry.restSeconds }, warmupSets),
          fitted,
          loading.step,
          {},
          barWeightFor(exercise, request.profile.units),
          loading,
        );
        if (entry.dropSet && exercise.dropSetSafe) entry.sets.push(dropSetAt(entry.sets.length));
        entry.progression = summarizeProgression(fitted);
        if (own) updated += 1;
        else others += 1;
      }
      return {
        ...base,
        workout,
        headline:
          updated > 0
            ? `First target for ${named.name} set from your max.`
            : `${named.name} already has logged sets; the next session starts from your max.`,
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
        if (set.kind !== 'warmup' && !isDone(entry.id, set.index))
          set.targetWeight = trigger.weight;
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
      const choice: DurationChoice =
        readiness.timePressure && request.duration === 'default' ? 45 : request.duration;
      if (!adjust && readiness.jointDiscomfort.length === 0 && choice === request.duration) {
        return { ...base, constraints, headline: 'Feeling good: full workout kept.' };
      }
      const workout = rebuild(request, scope, { choice, constraints, adjust });
      const parts: string[] = [];
      if (adjust)
        parts.push(
          adjust.rir > 0 ? 'fewer sets with an extra rep in reserve' : 'one set fewer per exercise',
        );
      if (readiness.jointDiscomfort.length > 0)
        parts.push(`easier on your ${readiness.jointDiscomfort.map(jointLabel).join(' and ')}`);
      if (choice !== request.duration) parts.push(`fitted to ${choice} min for time pressure`);
      return {
        ...base,
        workout,
        constraints,
        duration: choice,
        prefix: `Adjusted for today (${parts.join(', ')})`,
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
      const sign = Math.sign(constraints.intensity);
      const adjust: PrescriptionAdjustment | undefined =
        sign === 0 ? undefined : { sets: sign, rir: -sign, restFactor: 1 };
      const workout = rebuild(request, scope, { choice: request.duration, constraints, adjust });
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
        const last = [...entry.sets].reverse().find((set) => set.kind === 'working');
        const prescription = prescribe(exercise, entry.role, request.profile);
        const added: SetPrescription = {
          index: nextSetIndex(entry),
          kind: 'working',
          targetReps: last ? [last.targetReps[0], last.targetReps[1]] : prescription.reps,
          targetRir: last?.targetRir ?? prescription.rir,
          targetWeight: last?.targetWeight ?? null,
          restSeconds: entry.restSeconds,
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
      const first = entry.sets.find((set) => set.kind === 'working');
      const reps = first?.targetReps ?? [8, 10];
      entry.sets.unshift({
        index: nextSetIndex(entry),
        kind: 'warmup',
        targetReps: [Math.max(3, reps[0]), Math.max(5, reps[1])],
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
      const { entry } = findEntry(workout, trigger.entryId);
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
      return {
        ...base,
        workout,
        headline:
          changed > 0
            ? `${name}: ${low}-${high} reps for the remaining ${changed === 1 ? 'set' : 'sets'}.`
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

function syncRounds(block: WorkoutBlock): void {
  block.rounds =
    block.kind === 'straight'
      ? workingSets(block.entries[0] as WorkoutEntry).length
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
