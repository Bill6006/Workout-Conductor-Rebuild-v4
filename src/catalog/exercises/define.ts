import { isCompoundPattern, type MovementPatternId } from '../movementPatterns/movementPatterns';
import type { MuscleId } from '../muscles/muscles';
import {
  ExerciseSchema,
  type CatalogExercise,
  type DemandLevel,
  type Difficulty,
  type Joint,
  type LimitationFlag,
  type LoadType,
  type StationType,
  type StressLevel,
  type TrainingRole,
  type WarmupRamp,
} from './exerciseSchema';

/**
 * Compact authoring helper for catalog entries. Fills sensible defaults from
 * the movement pattern and equipment so each exercise only states what is
 * specific to it, then validates the result against ExerciseSchema.
 */

export interface ExerciseInput {
  id: string;
  name: string;
  aliases?: string[];
  pattern: MovementPatternId;
  primary: MuscleId[];
  secondary?: MuscleId[];
  equipment: string[][];
  family: string;
  strength: 0 | 1 | 2 | 3;
  hypertrophy: 0 | 1 | 2 | 3;
  role?: TrainingRole;
  compound?: boolean;
  unilateral?: boolean;
  setupSeconds?: number;
  transition?: 0 | 1 | 2 | 3;
  station?: StationType;
  grip?: DemandLevel;
  stability?: DemandLevel;
  joints?: Partial<Record<Joint, StressLevel>>;
  flags?: LimitationFlag[];
  dropSetSafe?: boolean;
  supersetFriendly?: boolean;
  difficulty?: Difficulty;
  load?: LoadType;
  reps?: { strength?: [number, number]; hypertrophy?: [number, number] };
  substitutions?: string[];
  setup: string[];
  execution: string[];
  breathing?: string;
  mistakes: string[];
  warmup?: WarmupRamp;
}

// Equipment requirement shorthands (any-of groups of all-of ids).
export const BW: string[][] = [[]];
export const BAND: string[][] = [['resistance-bands']];
export const DB: string[][] = [['dumbbells'], ['adjustable-dumbbells']];
export const DB_BENCH: string[][] = [
  ['dumbbells', 'flat-bench'],
  ['dumbbells', 'adjustable-bench'],
  ['adjustable-dumbbells', 'flat-bench'],
  ['adjustable-dumbbells', 'adjustable-bench'],
];
export const DB_INCLINE: string[][] = [
  ['dumbbells', 'adjustable-bench'],
  ['adjustable-dumbbells', 'adjustable-bench'],
];
export const BB: string[][] = [['barbell']];
export const BB_BENCH: string[][] = [
  ['barbell', 'flat-bench'],
  ['barbell', 'adjustable-bench'],
];
export const BB_INCLINE: string[][] = [['barbell', 'adjustable-bench']];
export const BB_RACK: string[][] = [['barbell', 'squat-rack']];
export const CABLE: string[][] = [['cable-station'], ['functional-trainer']];
export const KB: string[][] = [['kettlebells']];

const PULL_PATTERNS: MovementPatternId[] = [
  'horizontal-pull',
  'vertical-pull',
  'hinge',
  'carry',
  'shrug',
];

function primaryEquipment(groups: string[][]): string | undefined {
  return groups[0]?.[0];
}

function defaultLoad(groups: string[][]): LoadType {
  const first = primaryEquipment(groups);
  if (!first) return 'bodyweight';
  if (first === 'barbell') return 'barbell';
  if (first === 'ez-bar') return 'ez-bar';
  if (first === 'trap-bar') return 'trap-bar';
  if (first === 'smith-machine') return 'smith';
  if (first === 'dumbbells' || first === 'adjustable-dumbbells') return 'dumbbell-each';
  if (first === 'kettlebells') return 'kettlebell';
  if (first === 'resistance-bands') return 'band';
  if (
    ['pull-up-bar', 'dip-station', 'suspension-trainer', 'ab-wheel', 'weight-vest'].includes(first)
  ) {
    return 'bodyweight';
  }
  return 'stack';
}

function defaultStation(groups: string[][]): StationType {
  const first = groups[0] ?? [];
  if (first.includes('squat-rack')) return 'rack';
  if (
    first.includes('barbell') &&
    (first.includes('flat-bench') || first.includes('adjustable-bench'))
  ) {
    return 'bench-press';
  }
  if (first.includes('flat-bench') || first.includes('adjustable-bench')) return 'bench';
  const lead = first[0];
  if (!lead) return 'floor';
  if (
    lead === 'cable-station' ||
    lead === 'functional-trainer' ||
    lead === 'lat-pulldown' ||
    lead === 'seated-row'
  ) {
    return 'cable';
  }
  if (lead === 'pull-up-bar') return 'pull-up-bar';
  if (lead === 'dip-station') return 'dip-station';
  if (
    [
      'chest-press-machine',
      'shoulder-press-machine',
      'pec-deck',
      'leg-press',
      'hack-squat',
      'leg-extension',
      'leg-curl',
      'preacher-curl-machine',
      'smith-machine',
    ].includes(lead)
  ) {
    return 'machine';
  }
  return 'open';
}

function defaultSetup(groups: string[][]): number {
  const first = primaryEquipment(groups);
  if (!first) return 10;
  if (first === 'barbell' || first === 'trap-bar') return 90;
  if (first === 'smith-machine') return 60;
  if (first === 'ez-bar') return 45;
  if (first === 'resistance-bands') return 20;
  if (first === 'dumbbells' || first === 'adjustable-dumbbells' || first === 'kettlebells')
    return 30;
  if (first === 'pull-up-bar' || first === 'dip-station' || first === 'ab-wheel') return 10;
  return 45;
}

function defaultLocations(groups: string[][]): ('home' | 'gym' | 'travel')[] {
  const ids = new Set(groups.flat());
  const gymOnly = [
    'squat-rack',
    'smith-machine',
    'cable-station',
    'functional-trainer',
    'lat-pulldown',
    'seated-row',
    'chest-press-machine',
    'shoulder-press-machine',
    'pec-deck',
    'leg-press',
    'hack-squat',
    'leg-extension',
    'leg-curl',
    'preacher-curl-machine',
    'dip-station',
    'trap-bar',
  ];
  const everywhere = groups.some(
    (group) => group.length === 0 || group.every((id) => id === 'resistance-bands'),
  );
  if (everywhere) return ['home', 'gym', 'travel'];
  const needsGym = groups.every((group) => group.some((id) => gymOnly.includes(id)));
  if (needsGym) return ['gym'];
  if (ids.has('dumbbells') || ids.has('adjustable-dumbbells') || ids.has('kettlebells'))
    return ['home', 'gym', 'travel'];
  return ['home', 'gym'];
}

function barWeightFor(load: LoadType): CatalogExercise['barWeight'] {
  switch (load) {
    case 'barbell':
      return { lb: 45, kg: 20 };
    case 'ez-bar':
      return { lb: 25, kg: 10 };
    case 'trap-bar':
      return { lb: 60, kg: 27 };
    case 'smith':
      return { lb: 20, kg: 9 };
    default:
      return undefined;
  }
}

function defaultRole(compound: boolean, strength: number, hypertrophy: number): TrainingRole {
  if (compound && strength === 3) return 'primary-strength';
  if (compound && strength === 2 && hypertrophy < 3) return 'secondary-strength';
  if (compound && hypertrophy >= 2) return 'primary-hypertrophy';
  if (compound) return 'secondary-hypertrophy';
  return 'isolation';
}

function defaultReps(input: ExerciseInput, compound: boolean): CatalogExercise['repRanges'] {
  const bodyweightOrBand =
    (input.equipment[0]?.length ?? 0) === 0 ||
    primaryEquipment(input.equipment) === 'resistance-bands';
  const strength = input.reps?.strength ?? (compound && input.strength >= 2 ? [4, 6] : undefined);
  const hypertrophy =
    input.reps?.hypertrophy ?? (compound ? [6, 10] : bodyweightOrBand ? [12, 20] : [10, 15]);
  return strength ? { strength, hypertrophy } : { hypertrophy };
}

export function defineExercise(input: ExerciseInput): CatalogExercise {
  const compound = input.compound ?? isCompoundPattern(input.pattern);
  const load = input.load ?? defaultLoad(input.equipment);
  const heavyBarbell =
    compound && (load === 'barbell' || load === 'trap-bar') && input.strength === 3;
  const spinal = input.pattern === 'squat' || input.pattern === 'hinge';

  const exercise: CatalogExercise = {
    id: input.id,
    name: input.name,
    aliases: input.aliases ?? [],
    primaryMuscles: input.primary,
    secondaryMuscles: input.secondary ?? [],
    movementPattern: input.pattern,
    compound,
    unilateral: input.unilateral ?? false,
    strengthSuitability: input.strength,
    hypertrophySuitability: input.hypertrophy,
    defaultRole: input.role ?? defaultRole(compound, input.strength, input.hypertrophy),
    equipment: input.equipment,
    locationSuitability: defaultLocations(input.equipment),
    setupSeconds: input.setupSeconds ?? defaultSetup(input.equipment),
    transitionCost:
      input.transition ??
      (load === 'barbell' || load === 'trap-bar'
        ? 2
        : load === 'stack' || load === 'smith'
          ? 1
          : 0),
    station: input.station ?? defaultStation(input.equipment),
    repRanges: defaultReps(input, compound),
    dropSetSafe: input.dropSetSafe ?? !(heavyBarbell || (spinal && load !== 'stack')),
    supersetFriendly: input.supersetFriendly ?? !(compound && input.strength === 3),
    stabilityDemand:
      input.stability ??
      (load === 'stack' || load === 'smith' ? 'low' : compound ? 'medium' : 'low'),
    gripDemand:
      input.grip ??
      (PULL_PATTERNS.includes(input.pattern)
        ? 'high'
        : input.pattern === 'elbow-flexion'
          ? 'medium'
          : 'low'),
    jointStress: input.joints ?? {},
    limitationFlags: input.flags ?? [],
    substitutions: input.substitutions ?? [],
    instructions: {
      setup: input.setup,
      execution: input.execution,
      breathing:
        input.breathing ?? 'Inhale and brace before the hard part, exhale through the effort.',
      mistakes: input.mistakes,
    },
    difficulty: input.difficulty ?? (heavyBarbell ? 'intermediate' : 'beginner'),
    progressionFamily: input.family,
    warmup:
      input.warmup ?? (compound && input.strength >= 2 ? 'full' : compound ? 'short' : 'none'),
    load,
    ...(barWeightFor(load) ? { barWeight: barWeightFor(load) } : {}),
    mediaId: input.id,
    productionEnabled: false,
  };

  return ExerciseSchema.parse(exercise);
}
