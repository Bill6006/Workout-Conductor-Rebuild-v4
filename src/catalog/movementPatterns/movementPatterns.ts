/**
 * Movement patterns. Used for balance, duplicate detection, alternative
 * ranking, and the placeholder demonstration diagrams.
 */

export const MOVEMENT_PATTERN_IDS = [
  'horizontal-push',
  'incline-push',
  'vertical-push',
  'horizontal-pull',
  'vertical-pull',
  'squat',
  'hinge',
  'lunge',
  'hip-extension',
  'knee-extension',
  'knee-flexion',
  'calf-raise',
  'elbow-flexion',
  'elbow-extension',
  'shoulder-abduction',
  'chest-fly',
  'rear-delt-fly',
  'shrug',
  'core-anti-extension',
  'core-flexion',
  'core-anti-rotation',
  'carry',
] as const;

export type MovementPatternId = (typeof MOVEMENT_PATTERN_IDS)[number];

export interface MovementPatternDefinition {
  readonly id: MovementPatternId;
  readonly name: string;
  /** Compound patterns move more than one joint and carry the strength work. */
  readonly compound: boolean;
  readonly description: string;
}

export const MOVEMENT_PATTERNS: readonly MovementPatternDefinition[] = [
  {
    id: 'horizontal-push',
    name: 'Horizontal push',
    compound: true,
    description: 'Pressing away from the chest',
  },
  {
    id: 'incline-push',
    name: 'Incline push',
    compound: true,
    description: 'Pressing up and away from the upper chest',
  },
  { id: 'vertical-push', name: 'Vertical push', compound: true, description: 'Pressing overhead' },
  {
    id: 'horizontal-pull',
    name: 'Horizontal pull',
    compound: true,
    description: 'Rowing toward the torso',
  },
  {
    id: 'vertical-pull',
    name: 'Vertical pull',
    compound: true,
    description: 'Pulling down from overhead',
  },
  { id: 'squat', name: 'Squat', compound: true, description: 'Knee-dominant lower body' },
  { id: 'hinge', name: 'Hinge', compound: true, description: 'Hip-dominant lower body' },
  { id: 'lunge', name: 'Lunge', compound: true, description: 'Single-leg knee-dominant' },
  {
    id: 'hip-extension',
    name: 'Hip extension',
    compound: true,
    description: 'Glute-driven hip drive',
  },
  { id: 'knee-extension', name: 'Knee extension', compound: false, description: 'Isolated quads' },
  { id: 'knee-flexion', name: 'Knee flexion', compound: false, description: 'Isolated hamstrings' },
  { id: 'calf-raise', name: 'Calf raise', compound: false, description: 'Isolated calves' },
  { id: 'elbow-flexion', name: 'Elbow flexion', compound: false, description: 'Curls' },
  {
    id: 'elbow-extension',
    name: 'Elbow extension',
    compound: false,
    description: 'Triceps extensions and pushdowns',
  },
  {
    id: 'shoulder-abduction',
    name: 'Shoulder abduction',
    compound: false,
    description: 'Lateral raises',
  },
  { id: 'chest-fly', name: 'Chest fly', compound: false, description: 'Isolated chest' },
  {
    id: 'rear-delt-fly',
    name: 'Rear delt fly',
    compound: false,
    description: 'Rear delts and upper back',
  },
  { id: 'shrug', name: 'Shrug', compound: false, description: 'Isolated traps' },
  {
    id: 'core-anti-extension',
    name: 'Core anti-extension',
    compound: false,
    description: 'Bracing against extension',
  },
  { id: 'core-flexion', name: 'Core flexion', compound: false, description: 'Trunk flexion' },
  {
    id: 'core-anti-rotation',
    name: 'Core anti-rotation',
    compound: false,
    description: 'Resisting rotation',
  },
  { id: 'carry', name: 'Carry', compound: true, description: 'Loaded walking' },
];

const BY_ID = new Map(MOVEMENT_PATTERNS.map((pattern) => [pattern.id, pattern]));

export function isMovementPatternId(value: string): value is MovementPatternId {
  return BY_ID.has(value as MovementPatternId);
}

export function movementPatternName(id: MovementPatternId): string {
  return BY_ID.get(id)?.name ?? id;
}

export function isCompoundPattern(id: MovementPatternId): boolean {
  return BY_ID.get(id)?.compound ?? false;
}
