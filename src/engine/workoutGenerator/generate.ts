import { exercisesByPattern, requireExercise } from '../../catalog/exercises/catalog';
import type { CatalogExercise, TrainingRole } from '../../catalog/exercises/exerciseSchema';
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
import { estimateWorkout, generalWarmupMinutes, resolveTargetMinutes } from '../duration/duration';
import {
  MIN_REST_SECONDS,
  ROLE_RANK,
  buildSets,
  prescribe,
  rampSetsFor,
  restCategory,
} from '../progression/roles';
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
 */

export interface GenerationInput {
  profile: UserProfile;
  location: LocationProfile | undefined;
  history: readonly WorkoutRecord[];
  now: string;
  duration: DurationChoice;
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

export function generateWorkout(input: GenerationInput): GeneratedWorkout {
  const { profile, location, history, now, duration } = input;
  const exerciseOf = (id: string) => requireExercise(id);
  const context = buildConflictContext(profile, location);
  const preferredIds = preferredIdsOf(profile);
  const volume = computeWeeklyVolume(history, now);
  const exposure = computeExposure(history, now);
  const priorities = computeMusclePriorities(profile, volume, exposure);
  const weightOf = new Map(priorities.map((priority) => [priority.muscle, priority.weight]));
  const template = chooseTemplate(profile, priorities, exposure);
  const defaultMinutes = profile.schedule.typicalDurationMinutes;
  const targetMinutes = resolveTargetMinutes(duration, defaultMinutes);
  const compromises: string[] = [];
  const picker: Picker = { context, preferredIds, exposure };

  // 1. Fill the template's slots from the catalog.
  const chosenExercises: CatalogExercise[] = [];
  const entries: WorkoutEntry[] = [];
  template.slots.forEach((slotSpec, index) => {
    const pick = pickForSlot(slotSpec, chosenExercises, picker);
    if (!pick) {
      compromises.push(
        `No ${slotSpec.pattern.replace(/-/g, ' ')} option fits ${location?.name ?? 'this place'} and your limits.`,
      );
      return;
    }
    chosenExercises.push(pick);
    const prescription = prescribe(pick, slotSpec.role, profile);
    const warmupSets = rampSetsFor(pick, slotSpec.role, targetMinutes);
    entries.push({
      id: `e${index + 1}`,
      exerciseId: pick.id,
      role: slotSpec.role,
      sets: buildSets(prescription, warmupSets),
      restSeconds: prescription.restSeconds,
      warmupSets,
      dropSet: false,
      chosenFor: slotSpec.muscles.filter((muscle) => pick.primaryMuscles.includes(muscle)).length
        ? slotSpec.muscles.filter((muscle) => pick.primaryMuscles.includes(muscle))
        : pick.primaryMuscles,
      locked: false,
      pinned: false,
    });
  });

  let blocks: WorkoutBlock[] = entries.map((entry) => straightBlock(entry, exerciseOf));
  const fittingSteps: string[] = [];
  const generalWarmup = generalWarmupMinutes(targetMinutes);
  const estimate = (): TimeBreakdown => estimateWorkout(blocks, generalWarmup, exerciseOf);
  const anchorId = entries[0]?.id;

  const lowestValueBlock = (): WorkoutBlock | undefined => {
    const candidates = blocks.filter(
      (block) =>
        !block.entries.some((entry) => entry.id === anchorId || entry.pinned || entry.locked),
    );
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

  // 2. Circuits (only when they suit the goal), then smart supersets.
  const isolationEntries = () =>
    allEntries(blocks).filter(
      (entry) =>
        restCategory(entry.role) === 'isolation' &&
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
        const next = Math.max(floorFor(entry), Math.round((entry.restSeconds * 0.85) / 5) * 5);
        if (next < entry.restSeconds) {
          entry.restSeconds = next;
          for (const set of entry.sets) if (set.kind === 'working') set.restSeconds = next;
          changed = true;
        }
      }
      if (block.kind !== 'straight') {
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
  const trimSets = (): boolean => {
    const ordered = allEntries(blocks)
      .filter((entry) => workingSets(entry).length > (entry.id === anchorId ? 3 : 2))
      .sort(
        (a, b) => entryValue(a, weightOf, preferredIds) - entryValue(b, weightOf, preferredIds),
      );
    const target = ordered[0];
    if (!target) return false;
    const lastWorking = [...target.sets].reverse().find((set) => set.kind === 'working');
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
  while (estimate().totalMinutes > targetMinutes + 1 && guard < 30) {
    guard += 1;
    if (!restsExhausted && shortenRests()) continue;
    restsExhausted = true;
    if (trimSets()) continue;
    const lowest = lowestValueBlock();
    if (lowest && allEntries(blocks).length > 2) {
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
    const target = [...allEntries(blocks)]
      .reverse()
      .find(
        (entry) =>
          restCategory(entry.role) === 'isolation' &&
          exerciseOf(entry.exerciseId).dropSetSafe &&
          !blocks.some((block) => block.kind === 'superset' && block.entries[0]?.id === entry.id) &&
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
      if (estimate().totalMinutes > targetMinutes + 1 && before <= targetMinutes + 1) {
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

  const anchor = entries[0] ? exerciseOf(entries[0].exerciseId) : undefined;
  const topPriorities = priorities.slice(0, 3);
  const reasons: string[] = [
    `Goal ${goalLabel(profile.goals.primary)}${profile.goals.secondary !== 'none' ? ` with ${goalLabel(profile.goals.secondary)}` : ''}: ${template.title.toLowerCase()} session, ${styleLine(profile)}.`,
    `Priority muscles today: ${topPriorities.map((priority) => priority.reason).join('; ')}.`,
    `Built for ${location?.name ?? 'your place'} from the equipment saved there, every pick checked by the conflict engine.`,
  ];
  if (anchor)
    reasons.push(
      `${anchor.name} leads as the ${roleLabel(entries[0]?.role ?? 'primary-strength')} lift with full rests and warm-up ramp sets.`,
    );
  if (exposure.sessionsLast14Days === 0)
    reasons.push('No history yet, so weekly volume starts from the plan defaults.');
  reasons.push(
    `${profile.restStyle.charAt(0).toUpperCase() + profile.restStyle.slice(1)} rests; supersets ${profile.techniques.supersets ? 'on' : 'off'}, drop sets ${profile.techniques.dropSets ? 'on' : 'off'}, circuits ${profile.techniques.circuits ? 'on' : 'off'}.`,
  );

  const count = allEntries(blocks).length;
  const summary = `${template.title}: ${count} exercises in about ${Math.round(time.totalMinutes)} min${anchor ? `, ${anchor.name} first` : ''}${fittingSteps.length > 0 && duration !== 'default' ? `, fitted to ${targetMinutes} min` : ''}.`;

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
        targetMinutes <= 15
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
