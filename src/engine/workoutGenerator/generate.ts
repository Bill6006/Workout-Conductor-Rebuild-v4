import { exercisesByPattern, requireExercise } from '../../catalog/exercises/catalog';
import type { CatalogExercise, Joint, TrainingRole } from '../../catalog/exercises/exerciseSchema';
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns';
import { muscleName, type MuscleId } from '../../catalog/muscles/muscles';
import type { LocationProfile } from '../../core/validation/location';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import {
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
  prescribe,
  rampSetsFor,
  restCategory,
  type Prescription,
} from '../progression/roles';
import { weightStep } from '../plateMath/plateMath';
import {
  applyProgression,
  recommendNextTarget,
  summarizeProgression,
} from '../progression/progression';
import type { Readiness } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import {
  computeExposure,
  computeMusclePriorities,
  computeWeeklyVolume,
  type Exposure,
} from '../volume/weeklyVolume';
import {
  allEntries,
  workingSets,
  type DurationChoice,
  type GeneratedWorkout,
  type MusclePriority,
  type TimeBreakdown,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../workout/types';

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
}

export interface PrescriptionAdjustment {
  /** Working sets to add (positive) or remove (negative) from new entries. */
  sets: number;
  /** Reps in reserve to add to new entries. */
  rir: number;
  restFactor: number;
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
  adjust?: PrescriptionAdjustment;
  /** Today's check-in, so fatigue can hold loads. */
  readiness?: Readiness | null;
}

export interface GenerationInput {
  profile: UserProfile;
  location: LocationProfile | undefined;
  history: readonly WorkoutRecord[];
  now: string;
  duration: DurationChoice;
  constraints?: GenerationConstraints;
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
): Template {
  const weightOf = new Map(priorities.map((priority) => [priority.muscle, priority.weight]));
  const strengthGoal =
    profile.goals.primary === 'strength' || profile.trainingStyle === 'strength-focus';
  const pool =
    profile.schedule.weeklyFrequency <= 3
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
    const score = average + rotation + strengthBonus;
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

interface Picker {
  context: ConflictContext;
  preferredIds: ReadonlySet<string>;
  exposure: Exposure;
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
  const chosenIds = new Set(chosen.map((exercise) => exercise.id));
  const strengthRole = restCategory(slotSpec.role) === 'strength';
  const candidates = exercisesByPattern(slotSpec.pattern)
    .filter((exercise) => !chosenIds.has(exercise.id))
    .filter((exercise) => (strengthRole ? exercise.compound : true))
    .filter((exercise) => !isBlocked(checkExerciseFit(exercise, picker.context)))
    .filter((exercise) => !isBlocked(checkWorkoutConflicts([...chosen, exercise], picker.context)));

  const score = (exercise: CatalogExercise) => {
    const suitability = strengthRole
      ? exercise.strengthSuitability * 10 + exercise.hypertrophySuitability
      : exercise.hypertrophySuitability * 10 + exercise.strengthSuitability;
    const preferred = picker.preferredIds.has(exercise.id) ? 15 : 0;
    const days = picker.exposure.daysSinceExercise[exercise.id];
    const familiarity = days === undefined ? 0 : days < 1.5 ? -8 : days <= 21 ? 6 : 0;
    return (
      suitability +
      preferred +
      familiarity -
      stressPenalty(exercise) * 2 -
      exercise.setupSeconds / 60
    );
  };

  candidates.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  return candidates[0];
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

function adjustPrescription(
  prescription: Prescription,
  role: TrainingRole,
  adjust: PrescriptionAdjustment | undefined,
): Prescription {
  if (!adjust) return prescription;
  const floor = role === 'primary-strength' ? 3 : 2;
  return {
    ...prescription,
    sets: clamp(prescription.sets + adjust.sets, floor, 5),
    rir: clamp(prescription.rir + adjust.rir, 0, 4),
    restSeconds: Math.max(
      MIN_REST_SECONDS[restCategory(role)],
      round5(prescription.restSeconds * adjust.restFactor),
    ),
  };
}

export function generateWorkout(input: GenerationInput): GeneratedWorkout {
  const { profile, location, history, now, duration } = input;
  const constraints = input.constraints ?? {};
  const exerciseOf = (id: string) => requireExercise(id);
  const context = sessionConflictContext(profile, location, constraints);
  const preferredIds = preferredIdsOf(profile);
  const volume = computeWeeklyVolume(history, now);
  const exposure = computeExposure(history, now);
  const priorities = computeMusclePriorities(profile, volume, exposure);
  const weightOf = new Map(priorities.map((priority) => [priority.muscle, priority.weight]));
  const template =
    (constraints.templateId
      ? TEMPLATES.find((candidate) => candidate.id === constraints.templateId)
      : undefined) ?? chooseTemplate(profile, priorities, exposure);
  const defaultMinutes = profile.schedule.typicalDurationMinutes;
  const targetMinutes =
    constraints.targetMinutesOverride ?? resolveTargetMinutes(duration, defaultMinutes);
  const hardCap = constraints.hardCap ?? false;
  const isDone: SetDonePredicate = constraints.isSetDone ?? (() => false);
  const compromises: string[] = [];
  const picker: Picker = { context, preferredIds, exposure };
  const fatigue = interpretFatigue(history, now, constraints.readiness ?? null);

  // Entries the caller keeps: logged work is frozen; pinned picks, explicit
  // selections, and accepted alternatives stay in their slots.
  const keep = constraints.keep ?? [];
  const keptIds = new Set(keep.map((kept) => kept.entry.id));
  const frozenIds = new Set(keep.filter((kept) => kept.frozen).map((kept) => kept.entry.id));
  const keptBySlot = new Map<number, WorkoutEntry>();
  const keptUnslotted: WorkoutEntry[] = [];
  for (const kept of keep) {
    const entry = cloneEntry(kept.entry);
    if (
      entry.slot !== undefined &&
      entry.slot < template.slots.length &&
      !keptBySlot.has(entry.slot)
    ) {
      keptBySlot.set(entry.slot, entry);
    } else {
      keptUnslotted.push(entry);
    }
  }

  // 1. Fill the template's slots from the catalog around the kept entries.
  const chosenExercises: CatalogExercise[] = [...keptBySlot.values(), ...keptUnslotted].map(
    (entry) => exerciseOf(entry.exerciseId),
  );
  const entries: WorkoutEntry[] = [];
  template.slots.forEach((slotSpec, index) => {
    const kept = keptBySlot.get(index);
    if (kept) {
      entries.push(kept);
      return;
    }
    const pick = pickForSlot(slotSpec, chosenExercises, picker);
    if (!pick) {
      compromises.push(
        `No ${slotSpec.pattern.replace(/-/g, ' ')} option fits ${location?.name ?? 'this place'} and your limits.`,
      );
      return;
    }
    chosenExercises.push(pick);
    const prescription = adjustPrescription(
      prescribe(pick, slotSpec.role, profile),
      slotSpec.role,
      constraints.adjust,
    );
    const warmupSets = rampSetsFor(pick, slotSpec.role, targetMinutes);
    const target = recommendNextTarget({
      exercise: pick,
      role: slotSpec.role,
      prescription,
      history,
      profile,
      fatigueLevel: fatigue.level,
    });
    const chosenFor = slotSpec.muscles.filter((muscle) => pick.primaryMuscles.includes(muscle));
    entries.push({
      id: `e${index + 1}`,
      exerciseId: pick.id,
      role: slotSpec.role,
      sets: applyProgression(
        buildSets(prescription, warmupSets),
        target,
        weightStep(pick, profile.units),
      ),
      progression: summarizeProgression(target),
      restSeconds: prescription.restSeconds,
      warmupSets,
      dropSet: false,
      chosenFor: chosenFor.length > 0 ? chosenFor : [...pick.primaryMuscles],
      locked: false,
      pinned: false,
      slot: index,
    });
  });
  entries.push(...keptUnslotted);

  const anchor = entries.find((entry) => entry.role === 'primary-strength') ?? entries[0];
  const anchorId = anchor?.id;

  let blocks: WorkoutBlock[] = entries.map((entry) => straightBlock(entry, exerciseOf));

  // Pairings whose members are all kept survive as they were.
  for (const original of constraints.keepBlocks ?? []) {
    if (original.kind === 'straight') continue;
    if (!original.entries.every((member) => keptIds.has(member.id))) continue;
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

  const dropBlock = (block: WorkoutBlock, why: string) => {
    blocks = blocks.filter((candidate) => candidate.id !== block.id);
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
    return remainingWorking(entry).length > floor;
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
      dropBlock(lowest, `so the session fits ${targetMinutes} min`);
      continue;
    }
    break;
  }

  // 5. One optional, intelligent drop set on a safe isolation move.
  if (profile.techniques.dropSets) {
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
      : [...allEntries(blocks)]
          .reverse()
          .find(
            (entry) =>
              restCategory(entry.role) === 'isolation' &&
              !keptIds.has(entry.id) &&
              exerciseOf(entry.exerciseId).dropSetSafe &&
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
  if (exposure.sessionsLast14Days === 0)
    reasons.push('No history yet, so weekly volume starts from the plan defaults.');
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
      return 'balanced development';
    case 'none':
      return 'none';
  }
}

function styleLine(profile: UserProfile): string {
  switch (profile.trainingStyle) {
    case 'hybrid':
      return 'heavy strength work first and hypertrophy volume after it';
    case 'hypertrophy-focus':
      return 'moderate loads and more total volume';
    case 'strength-focus':
      return 'heavier loads, lower reps, longer rests';
  }
}

function roleLabel(role: TrainingRole): string {
  return role.replace(/-/g, ' ');
}

export function describeMuscles(muscles: readonly MuscleId[]): string {
  return muscles.map(muscleName).join(', ');
}
