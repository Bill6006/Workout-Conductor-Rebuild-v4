import { equipmentLabel } from '../equipment/equipment';
import type { MovementPatternId } from '../movementPatterns/movementPatterns';
import { muscleGroupOf, type MuscleGroup, type MuscleId } from '../muscles/muscles';
import { ARM_CORE_EXERCISES } from './data/armsCore';
import { LEG_EXERCISES } from './data/legs';
import { PULL_EXERCISES } from './data/pull';
import { PUSH_EXERCISES } from './data/push';
import type { CatalogExercise } from './exerciseSchema';

/**
 * The curated exercise catalog. Lookups are by id, by name or alias, by
 * pattern, and by muscle; nothing downstream depends on names alone.
 */

export const EXERCISES: readonly CatalogExercise[] = [
  ...PUSH_EXERCISES,
  ...PULL_EXERCISES,
  ...LEG_EXERCISES,
  ...ARM_CORE_EXERCISES,
];

const BY_ID: ReadonlyMap<string, CatalogExercise> = new Map(
  EXERCISES.map((exercise) => [exercise.id, exercise]),
);

export function normalizeExerciseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const BY_NAME: ReadonlyMap<string, CatalogExercise> = (() => {
  const map = new Map<string, CatalogExercise>();
  for (const exercise of EXERCISES) {
    map.set(normalizeExerciseName(exercise.name), exercise);
    for (const alias of exercise.aliases) {
      map.set(normalizeExerciseName(alias), exercise);
    }
  }
  return map;
})();

/**
 * User-owned custom exercises, registered by the store after hydration so every
 * lookup below resolves them exactly like catalog entries. Never persisted here.
 */
const CUSTOM_REGISTRY = new Map<string, CatalogExercise>();

export function registerCustomExercises(list: readonly CatalogExercise[]): void {
  CUSTOM_REGISTRY.clear();
  for (const exercise of list) CUSTOM_REGISTRY.set(exercise.id, exercise);
}

export function customExercises(): CatalogExercise[] {
  return [...CUSTOM_REGISTRY.values()];
}

/** Catalog plus registered custom exercises. */
export function allExercises(): CatalogExercise[] {
  return [...EXERCISES, ...CUSTOM_REGISTRY.values()];
}

export function getExercise(id: string): CatalogExercise | undefined {
  return BY_ID.get(id) ?? CUSTOM_REGISTRY.get(id);
}

export function requireExercise(id: string): CatalogExercise {
  const exercise = BY_ID.get(id) ?? CUSTOM_REGISTRY.get(id);
  if (!exercise) throw new RangeError(`Unknown exercise ${id}`);
  return exercise;
}

/** Resolves a user-entered name (or alias) to a catalog exercise. */
export function findExerciseByName(name: string): CatalogExercise | undefined {
  return BY_NAME.get(normalizeExerciseName(name));
}

/** Resolves a list of names to catalog ids, ignoring names the catalog does not know. */
export function resolveExerciseIds(names: readonly string[]): Set<string> {
  const ids = new Set<string>();
  for (const name of names) {
    const exercise = findExerciseByName(name);
    if (exercise) ids.add(exercise.id);
  }
  return ids;
}

export function exercisesByPattern(pattern: MovementPatternId): CatalogExercise[] {
  return EXERCISES.filter((exercise) => exercise.movementPattern === pattern);
}

export function exercisesByMuscle(muscle: MuscleId): CatalogExercise[] {
  return EXERCISES.filter((exercise) => exercise.primaryMuscles.includes(muscle));
}

export function primaryMuscleGroups(exercise: CatalogExercise): MuscleGroup[] {
  return [...new Set(exercise.primaryMuscles.map(muscleGroupOf))];
}

export interface CatalogSearch {
  query?: string;
  muscleGroup?: MuscleGroup;
}

export function searchExercises(search: CatalogSearch): CatalogExercise[] {
  const query = search.query ? normalizeExerciseName(search.query) : '';
  return EXERCISES.filter((exercise) => {
    if (search.muscleGroup && !primaryMuscleGroups(exercise).includes(search.muscleGroup)) {
      return false;
    }
    if (!query) return true;
    const haystack = [exercise.name, ...exercise.aliases, ...exercise.primaryMuscles]
      .map(normalizeExerciseName)
      .join(' | ');
    return haystack.includes(query);
  });
}

export function exerciseNames(): string[] {
  return EXERCISES.map((exercise) => exercise.name);
}

export function equipmentSatisfied(
  exercise: CatalogExercise,
  available: ReadonlySet<string>,
): boolean {
  return exercise.equipment.some((group) => group.every((id) => available.has(id)));
}

/** Human label for the equipment group that fits, or the first group when none fits. */
export function exerciseEquipmentLabel(
  exercise: CatalogExercise,
  available?: ReadonlySet<string>,
): string {
  const group =
    (available
      ? exercise.equipment.find((candidate) => candidate.every((id) => available.has(id)))
      : undefined) ??
    exercise.equipment[0] ??
    [];
  if (group.length === 0) return 'Bodyweight';
  return group.map(equipmentLabel).join(' + ');
}
