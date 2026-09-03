/**
 * Muscle model. Granular enough for volume accounting and alternative ranking,
 * small enough to stay readable in the UI.
 */

export const MUSCLE_IDS = [
  'chest',
  'upper-chest',
  'front-delts',
  'side-delts',
  'rear-delts',
  'traps',
  'lats',
  'upper-back',
  'lower-back',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'obliques',
] as const;

export type MuscleId = (typeof MUSCLE_IDS)[number];

export const MUSCLE_GROUPS = ['chest', 'shoulders', 'back', 'arms', 'legs', 'core'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export interface MuscleDefinition {
  readonly id: MuscleId;
  readonly name: string;
  readonly group: MuscleGroup;
}

export const MUSCLES: readonly MuscleDefinition[] = [
  { id: 'chest', name: 'Chest', group: 'chest' },
  { id: 'upper-chest', name: 'Upper chest', group: 'chest' },
  { id: 'front-delts', name: 'Front delts', group: 'shoulders' },
  { id: 'side-delts', name: 'Side delts', group: 'shoulders' },
  { id: 'rear-delts', name: 'Rear delts', group: 'shoulders' },
  { id: 'traps', name: 'Traps', group: 'back' },
  { id: 'lats', name: 'Lats', group: 'back' },
  { id: 'upper-back', name: 'Upper back', group: 'back' },
  { id: 'lower-back', name: 'Lower back', group: 'back' },
  { id: 'biceps', name: 'Biceps', group: 'arms' },
  { id: 'triceps', name: 'Triceps', group: 'arms' },
  { id: 'forearms', name: 'Forearms', group: 'arms' },
  { id: 'quads', name: 'Quads', group: 'legs' },
  { id: 'hamstrings', name: 'Hamstrings', group: 'legs' },
  { id: 'glutes', name: 'Glutes', group: 'legs' },
  { id: 'calves', name: 'Calves', group: 'legs' },
  { id: 'abs', name: 'Abs', group: 'core' },
  { id: 'obliques', name: 'Obliques', group: 'core' },
];

const BY_ID = new Map(MUSCLES.map((muscle) => [muscle.id, muscle]));

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  back: 'Back',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
};

export function isMuscleId(value: string): value is MuscleId {
  return BY_ID.has(value as MuscleId);
}

export function muscleName(id: MuscleId): string {
  return BY_ID.get(id)?.name ?? id;
}

export function muscleGroupOf(id: MuscleId): MuscleGroup {
  return BY_ID.get(id)?.group ?? 'core';
}
