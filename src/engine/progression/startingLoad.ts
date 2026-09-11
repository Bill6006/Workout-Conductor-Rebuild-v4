import type { CatalogExercise, LoadType } from '../../catalog/exercises/exerciseSchema';
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns';
import type { UnitSystem, UserProfile } from '../../core/validation/profile';

/**
 * Where the first weight comes from. A lift with no history and no entered
 * max starts from a conservative estimate of its one-rep max: a reference
 * ratio of bodyweight per movement pattern and load type, scaled by
 * experience, sex, and age. The ratios are reference points for a first
 * session, not standards; the first logged set replaces them. Bar lifts never
 * fall below the empty bar, and a family estimate converts between load types
 * (a dumbbell per hand is not a barbell) before it stands in.
 */

export type LoadClass = 'bar' | 'each' | 'stack';

export function loadClass(load: LoadType): LoadClass | null {
  switch (load) {
    case 'barbell':
    case 'ez-bar':
    case 'trap-bar':
    case 'smith':
      return 'bar';
    case 'dumbbell-each':
    case 'kettlebell':
      return 'each';
    case 'stack':
      return 'stack';
    default:
      return null;
  }
}

/**
 * Reference one-rep max per pattern as a fraction of bodyweight for a bar
 * lift by an intermediate male lifter, in the spirit of published norms such
 * as the ACSM bench press and leg press tables and common strength-standard
 * tables. Dumbbells count per hand at 0.4 of the bar figure; stacks at 0.9.
 */
const PATTERN_BAR_RATIO: Record<MovementPatternId, number> = {
  'horizontal-push': 1,
  'incline-push': 0.8,
  'vertical-push': 0.65,
  'horizontal-pull': 0.9,
  'vertical-pull': 0.8,
  squat: 1.25,
  hinge: 1,
  lunge: 0.5,
  'hip-extension': 1.3,
  'knee-extension': 0.6,
  'knee-flexion': 0.45,
  'calf-raise': 1.2,
  'elbow-flexion': 0.4,
  'elbow-extension': 0.35,
  'shoulder-abduction': 0.2,
  'chest-fly': 0.3,
  'rear-delt-fly': 0.25,
  shrug: 1.2,
  'core-anti-extension': 0.3,
  'core-flexion': 0.4,
  'core-anti-rotation': 0.15,
  carry: 0.5,
};

const CLASS_FACTOR: Record<LoadClass, number> = { bar: 1, each: 0.4, stack: 0.9 };

/** Exercises where the pattern rule is too coarse: machines, single-bell moves, and heavier bars. */
const EXERCISE_RATIO: Readonly<Record<string, number | null>> = {
  'close-grip-bench-press': 0.85,
  'smith-machine-bench-press': 0.9,
  'arnold-press': 0.22,
  'chest-supported-row': 0.3,
  'lat-pulldown': 0.8,
  'straight-arm-pulldown': 0.3,
  'dumbbell-pullover': 0.3,
  'front-squat': 1,
  'goblet-squat': 0.35,
  'hack-squat': 1.4,
  'leg-press': 2.2,
  'smith-machine-squat': 1.1,
  'dumbbell-romanian-deadlift': 0.35,
  deadlift: 1.5,
  'trap-bar-deadlift': 1.6,
  'kettlebell-swing': 0.3,
  'step-up': null,
  'hip-thrust': 1.5,
  'leg-extension': 0.6,
  'leg-curl': 0.45,
  'leg-press-calf-raise': 1.5,
  'incline-dumbbell-curl': 0.12,
  'reverse-curl': 0.25,
  'wrist-curl': 0.12,
  'overhead-triceps-extension': 0.25,
  'cable-triceps-pushdown': 0.35,
  'bench-dip': null,
  'lateral-raise': 0.1,
  'cable-lateral-raise': 0.08,
  'dumbbell-fly': 0.15,
  'pec-deck': 0.5,
  'rear-delt-fly': 0.08,
  'reverse-pec-deck': 0.4,
  'face-pull': 0.3,
  'dumbbell-shrug': 0.4,
  'farmer-carry': 0.5,
};

const LOWER_BODY: ReadonlySet<MovementPatternId> = new Set([
  'squat',
  'hinge',
  'lunge',
  'hip-extension',
  'knee-extension',
  'knee-flexion',
  'calf-raise',
]);

export const EXPERIENCE_FACTOR: Record<UserProfile['experience'], number> = {
  beginner: 0.6,
  intermediate: 1,
  advanced: 1.3,
};

/** Starting loads are conservative: this fraction of the load the estimate implies. */
export const START_FRACTION = 0.85;
/** A max the lifter entered is trusted a little more. */
export const ENTERED_FRACTION = 0.9;

type StartExercise = Pick<CatalogExercise, 'id' | 'movementPattern' | 'load'>;

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * The reference max for this exercise as a fraction of bodyweight, in the
 * exercise's own load units (per hand for dumbbells); null for bodyweight and
 * band moves, which carry no load target.
 */
export function startRatio(exercise: StartExercise): number | null {
  if (exercise.id in EXERCISE_RATIO) return EXERCISE_RATIO[exercise.id] ?? null;
  const cls = loadClass(exercise.load);
  if (!cls) return null;
  return round(PATTERN_BAR_RATIO[exercise.movementPattern] * CLASS_FACTOR[cls], 3);
}

export function ageFactor(age: number | undefined): number {
  if (age === undefined || age < 35) return 1;
  if (age < 45) return 0.92;
  if (age < 55) return 0.84;
  if (age < 65) return 0.76;
  return 0.68;
}

/** Women's reference maxes sit lower for upper-body patterns than lower-body ones; unspecified sits between. */
export function sexFactor(sex: UserProfile['sex'], pattern: MovementPatternId): number {
  const lower = LOWER_BODY.has(pattern);
  if (sex === 'male') return 1;
  if (sex === 'female') return lower ? 0.7 : 0.6;
  return lower ? 0.85 : 0.8;
}

export interface StartingEstimate {
  /** Estimated one-rep max in the profile's units (per hand for dumbbells). */
  e1rm: number;
  ratio: number;
  evidence: string;
}

/** Estimated max from bodyweight, experience, sex, and age; null without a bodyweight or a load target. */
export function estimateStartingMax(
  exercise: StartExercise,
  profile: Pick<UserProfile, 'bodyweight' | 'experience' | 'sex' | 'age' | 'units'>,
): StartingEstimate | null {
  const ratio = startRatio(exercise);
  const bodyweight = profile.bodyweight;
  if (ratio === null || bodyweight === undefined || bodyweight <= 0) return null;
  const e1rm = round(
    bodyweight *
      ratio *
      EXPERIENCE_FACTOR[profile.experience] *
      sexFactor(profile.sex, exercise.movementPattern) *
      ageFactor(profile.age),
    1,
  );
  const parts = [`${bodyweight} ${profile.units} bodyweight`, `${profile.experience} lifter`];
  if (profile.sex) parts.push(profile.sex);
  if (profile.age !== undefined) parts.push(`age ${profile.age}`);
  const perHand = loadClass(exercise.load) === 'each' ? ' per hand' : '';
  return {
    e1rm,
    ratio,
    evidence: `Starting estimate from your ${parts.join(', ')}: about ${Math.round(e1rm)} ${profile.units} max${perHand}; the first target sits under it. Log a set and the target follows.`,
  };
}

/** The empty bar for bar lifts (from the catalog's bar weights), null for everything else. */
export function barWeightFor(
  exercise: Pick<CatalogExercise, 'load' | 'barWeight'>,
  units: UnitSystem,
): number | null {
  if (loadClass(exercise.load) !== 'bar') return null;
  return exercise.barWeight?.[units] ?? (units === 'lb' ? 45 : 20);
}

/** A bar lift never targets less than the empty bar. */
export function floorToBar(
  weight: number | null,
  exercise: Pick<CatalogExercise, 'load' | 'barWeight'>,
  units: UnitSystem,
): number | null {
  const bar = barWeightFor(exercise, units);
  if (bar === null || weight === null) return weight;
  return Math.max(weight, bar);
}

/**
 * Converts an estimated max between two exercises in the same family by their
 * reference ratios, so 60 lb per hand on a dumbbell press does not become a
 * 60 lb barbell press. Unchanged when either side has no reference.
 */
export function convertEstimate(
  e1rm: number,
  from: StartExercise,
  to: StartExercise,
): { e1rm: number; converted: boolean } {
  const source = startRatio(from);
  const target = startRatio(to);
  if (source === null || target === null || source === target || source <= 0) {
    return { e1rm, converted: false };
  }
  return { e1rm: round((e1rm * target) / source, 1), converted: true };
}
