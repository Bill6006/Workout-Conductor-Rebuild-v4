import { exercisesByPattern } from '../../../catalog/exercises/catalog';
import type { CatalogExercise } from '../../../catalog/exercises/exerciseSchema';
import type { MovementPatternId } from '../../../catalog/movementPatterns/movementPatterns';
import { muscleName } from '../../../catalog/muscles/muscles';
import type { LocationProfile } from '../../../core/validation/location';
import type { UserProfile } from '../../../core/validation/profile';
import {
  checkExerciseFit,
  checkSupersetPair,
  checkWorkoutConflicts,
  isBlocked,
} from '../../../engine/conflicts/conflictEngine';
import { buildConflictContext, preferredIdsOf } from '../../../engine/conflicts/context';

/**
 * SYNTHETIC DEMO WORKOUT (until Phase 3).
 *
 * A small deterministic preview so the Today screen feels real before the
 * workout-generation engine exists. It now draws from the structured catalog
 * and passes every pick through the conflict engine, but it is still not the
 * engine: no weekly volume, no progression, no time-fitting. Phase 3 replaces it.
 */

export type DemoRole = 'strength' | 'hypertrophy' | 'isolation';

export interface DemoExercise {
  exercise: CatalogExercise;
  role: DemoRole;
  sets: number;
  reps: string;
  restSeconds: number;
  superset?: 'A1' | 'A2';
  dropSet?: boolean;
}

export interface DemoWorkout {
  synthetic: true;
  title: string;
  focus: string[];
  exercises: DemoExercise[];
  estimatedMinutes: number;
  why: string[];
  compromises: string[];
}

type Slot = [MovementPatternId, DemoRole];

const TEMPLATES = {
  'chest-arms': {
    title: 'Chest + Arms focus',
    slots: [
      ['horizontal-push', 'strength'],
      ['incline-push', 'hypertrophy'],
      ['horizontal-pull', 'hypertrophy'],
      ['chest-fly', 'isolation'],
      ['elbow-extension', 'isolation'],
      ['elbow-flexion', 'isolation'],
      ['shoulder-abduction', 'isolation'],
    ] as Slot[],
  },
  'full-body-strength': {
    title: 'Full-body strength',
    slots: [
      ['squat', 'strength'],
      ['horizontal-push', 'strength'],
      ['horizontal-pull', 'hypertrophy'],
      ['hinge', 'hypertrophy'],
      ['vertical-push', 'hypertrophy'],
      ['elbow-flexion', 'isolation'],
      ['elbow-extension', 'isolation'],
    ] as Slot[],
  },
  'upper-hypertrophy': {
    title: 'Upper-body hypertrophy',
    slots: [
      ['horizontal-push', 'strength'],
      ['vertical-pull', 'hypertrophy'],
      ['incline-push', 'hypertrophy'],
      ['horizontal-pull', 'hypertrophy'],
      ['shoulder-abduction', 'isolation'],
      ['elbow-flexion', 'isolation'],
      ['elbow-extension', 'isolation'],
    ] as Slot[],
  },
} as const;

type TemplateKey = keyof typeof TEMPLATES;

const PRESCRIPTIONS: Record<
  DemoRole,
  { sets: number; rest: Record<UserProfile['restStyle'], number> }
> = {
  strength: { sets: 4, rest: { short: 120, standard: 150, long: 180 } },
  hypertrophy: { sets: 3, rest: { short: 60, standard: 90, long: 120 } },
  isolation: { sets: 3, rest: { short: 45, standard: 60, long: 90 } },
};

function chooseTemplate(profile: UserProfile): TemplateKey {
  const goals = [profile.goals.primary, profile.goals.secondary];
  if (profile.goals.primary === 'strength' || profile.trainingStyle === 'strength-focus') {
    return 'full-body-strength';
  }
  if (goals.includes('bigger-arms') || goals.includes('bigger-chest')) {
    return 'chest-arms';
  }
  return 'upper-hypertrophy';
}

function repsFor(exercise: CatalogExercise, role: DemoRole): string {
  const range =
    role === 'strength' && exercise.repRanges.strength
      ? exercise.repRanges.strength
      : exercise.repRanges.hypertrophy;
  return `${range[0]}-${range[1]}`;
}

function pickForSlot(
  pattern: MovementPatternId,
  role: DemoRole,
  chosen: readonly CatalogExercise[],
  context: ReturnType<typeof buildConflictContext>,
  preferredIds: ReadonlySet<string>,
): CatalogExercise | undefined {
  const chosenIds = new Set(chosen.map((exercise) => exercise.id));
  const candidates = exercisesByPattern(pattern)
    .filter((exercise) => !chosenIds.has(exercise.id))
    .filter((exercise) => (role === 'strength' ? exercise.compound : true))
    .filter((exercise) => !isBlocked(checkExerciseFit(exercise, context)))
    .filter((exercise) => !isBlocked(checkWorkoutConflicts([...chosen, exercise], context)));

  const score = (exercise: CatalogExercise) =>
    role === 'strength'
      ? exercise.strengthSuitability * 10 + exercise.hypertrophySuitability
      : exercise.hypertrophySuitability * 10 + exercise.strengthSuitability;

  // Equal picks: prefer the option with less joint stress, then the quicker setup.
  const stress = (exercise: CatalogExercise) =>
    Object.values(exercise.jointStress).reduce(
      (total, level) => total + (level === 'high' ? 2 : level === 'moderate' ? 1 : 0),
      0,
    );

  candidates.sort(
    (a, b) =>
      Number(preferredIds.has(b.id)) - Number(preferredIds.has(a.id)) ||
      score(b) - score(a) ||
      stress(a) - stress(b) ||
      a.setupSeconds - b.setupSeconds ||
      a.name.localeCompare(b.name),
  );
  return candidates[0];
}

export function buildDemoWorkout(
  profile: UserProfile,
  location: LocationProfile | undefined,
): DemoWorkout {
  const context = buildConflictContext(profile, location);
  const preferredIds = preferredIdsOf(profile);
  const templateKey = chooseTemplate(profile);
  const template = TEMPLATES[templateKey];
  const compromises: string[] = [];
  const maxExercises = Math.min(
    8,
    Math.max(4, Math.round(profile.schedule.typicalDurationMinutes / 9)),
  );

  const chosenExercises: CatalogExercise[] = [];
  const chosen: DemoExercise[] = [];
  for (const [pattern, role] of template.slots) {
    if (chosen.length >= maxExercises) break;
    const pick = pickForSlot(pattern, role, chosenExercises, context, preferredIds);
    if (!pick) {
      compromises.push(
        `No ${pattern.replace(/-/g, ' ')} option fits ${location?.name ?? 'this place'} and your limits.`,
      );
      continue;
    }
    chosenExercises.push(pick);
    const prescription = PRESCRIPTIONS[role];
    chosen.push({
      exercise: pick,
      role,
      sets: prescription.sets,
      reps: repsFor(pick, role),
      restSeconds: prescription.rest[profile.restStyle],
    });
  }

  if (profile.techniques.supersets) {
    const isolationIndexes = chosen
      .map((entry, index) => (entry.role === 'isolation' ? index : -1))
      .filter((index) => index >= 0);
    if (isolationIndexes.length >= 2) {
      const [first, second] = isolationIndexes.slice(-2) as [number, number];
      const a1 = chosen[first];
      const a2 = chosen[second];
      if (a1 && a2 && !isBlocked(checkSupersetPair(a1.exercise, a2.exercise, context))) {
        a1.superset = 'A1';
        a2.superset = 'A2';
        a1.restSeconds = 15;
      }
    }
  }

  if (profile.techniques.dropSets) {
    const target = [...chosen]
      .reverse()
      .find(
        (entry) =>
          entry.role === 'isolation' && entry.superset !== 'A1' && entry.exercise.dropSetSafe,
      );
    if (target) target.dropSet = true;
  }

  const workSeconds = chosen.reduce(
    (total, entry) => total + entry.exercise.setupSeconds + entry.sets * (40 + entry.restSeconds),
    0,
  );
  const estimatedMinutes = Math.round(5 + workSeconds / 60);

  const focus = [...new Set(chosen.flatMap((entry) => entry.exercise.primaryMuscles))]
    .slice(0, 5)
    .map(muscleName);

  for (const conflict of checkWorkoutConflicts(chosenExercises, context)) {
    if (conflict.severity === 'warn') compromises.push(conflict.message);
  }

  const why: string[] = [];
  why.push(`Primary goal ${goalPhrase(profile.goals.primary)}: ${templateReason(templateKey)}.`);
  if (profile.goals.secondary !== 'none') {
    why.push(
      `Secondary goal ${goalPhrase(profile.goals.secondary)} keeps direct arm and chest work in.`,
    );
  }
  why.push(
    `Built for ${location?.name ?? 'your location'} using only the equipment saved there, checked by the conflict engine.`,
  );
  if (chosen.some((entry) => entry.superset)) {
    why.push('Supersets are on, so the last two isolation moves are paired to save time.');
  }
  if (chosen.some((entry) => entry.dropSet)) {
    why.push('Drop sets are on, so one drop-set-safe isolation move ends with a drop set.');
  }
  why.push(
    `${restLabel(profile.restStyle)} rests, ${profile.schedule.typicalDurationMinutes}-minute typical session.`,
  );

  return {
    synthetic: true,
    title: `${template.title} (demo)`,
    focus,
    exercises: chosen,
    estimatedMinutes,
    why,
    compromises: [...new Set(compromises)],
  };
}

function goalPhrase(
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
      return 'strength';
    case 'balanced':
      return 'balanced development';
    case 'none':
      return 'none';
  }
}

function templateReason(key: TemplateKey): string {
  switch (key) {
    case 'chest-arms':
      return 'one heavy press first, then chest and arm volume';
    case 'full-body-strength':
      return 'heavy compound lifts first, arms as a finisher';
    case 'upper-hypertrophy':
      return 'a press and a pull first, then upper-body volume';
  }
}

function restLabel(style: UserProfile['restStyle']): string {
  switch (style) {
    case 'short':
      return 'Short';
    case 'standard':
      return 'Standard';
    case 'long':
      return 'Long';
  }
}
