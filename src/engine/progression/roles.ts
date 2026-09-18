import type { CatalogExercise, TrainingRole } from '../../catalog/exercises/exerciseSchema';
import type { UserProfile } from '../../core/validation/profile';
import type { SetPrescription } from '../workout/types';

/**
 * Progression roles turn an exercise and its role in the session into a
 * concrete prescription: sets, rep range, RIR, and rest. Strength roles use
 * lower reps, longer rests, and fewer high-quality sets; hypertrophy roles use
 * moderate reps, controlled RIR, and shorter rests. No tempo unless needed.
 */

export interface Prescription {
  sets: number;
  reps: [number, number];
  rir: number;
  restSeconds: number;
}

const REST_STYLE_FACTOR: Record<UserProfile['restStyle'], number> = {
  short: 0.8,
  standard: 1,
  long: 1.2,
};

export const MIN_REST_SECONDS: Record<'strength' | 'hypertrophy' | 'isolation', number> = {
  strength: 120,
  hypertrophy: 60,
  isolation: 45,
};

export function restCategory(role: TrainingRole): 'strength' | 'hypertrophy' | 'isolation' {
  if (role === 'primary-strength' || role === 'secondary-strength') return 'strength';
  if (role === 'isolation' || role === 'finisher' || role === 'corrective' || role === 'warm-up') {
    return 'isolation';
  }
  return 'hypertrophy';
}

export function prescribe(
  exercise: CatalogExercise,
  role: TrainingRole,
  profile: UserProfile,
): Prescription {
  const style = profile.trainingStyle;
  const factor = REST_STYLE_FACTOR[profile.restStyle];
  const strengthReps = exercise.repRanges.strength ?? exercise.repRanges.hypertrophy;
  const hypertrophyReps = exercise.repRanges.hypertrophy;

  let base: Prescription;
  switch (role) {
    case 'primary-strength':
      base = {
        sets: style === 'hypertrophy-focus' ? 3 : 4,
        reps: strengthReps,
        rir: 2,
        restSeconds: 150,
      };
      break;
    case 'secondary-strength':
      base = { sets: 3, reps: strengthReps, rir: 2, restSeconds: 135 };
      break;
    case 'primary-hypertrophy':
      base = {
        sets: style === 'hypertrophy-focus' ? 4 : 3,
        reps: style === 'strength-focus' ? strengthReps : hypertrophyReps,
        rir: 1,
        restSeconds: 120,
      };
      break;
    case 'secondary-hypertrophy':
      base = { sets: 3, reps: hypertrophyReps, rir: 1, restSeconds: 90 };
      break;
    case 'specialization':
      base = { sets: 4, reps: hypertrophyReps, rir: 1, restSeconds: 75 };
      break;
    case 'finisher':
      base = { sets: 2, reps: hypertrophyReps, rir: 0, restSeconds: 45 };
      break;
    case 'corrective':
    case 'warm-up':
      base = { sets: 2, reps: hypertrophyReps, rir: 3, restSeconds: 45 };
      break;
    case 'isolation':
      base = { sets: 3, reps: hypertrophyReps, rir: 1, restSeconds: 60 };
      break;
  }

  return {
    ...base,
    restSeconds: Math.round((base.restSeconds * factor) / 5) * 5,
  };
}

export function buildSets(prescription: Prescription, warmupSets: number): SetPrescription[] {
  const sets: SetPrescription[] = [];
  for (let index = 0; index < warmupSets; index += 1) {
    sets.push({
      index: sets.length,
      kind: 'warmup',
      targetReps: [Math.max(3, prescription.reps[0]), Math.max(5, prescription.reps[1])],
      targetRir: 5,
      targetWeight: null,
      restSeconds: 45,
    });
  }
  for (let index = 0; index < prescription.sets; index += 1) {
    sets.push({
      index: sets.length,
      kind: 'working',
      targetReps: prescription.reps,
      targetRir: prescription.rir,
      targetWeight: null,
      restSeconds: prescription.restSeconds,
    });
  }
  return sets;
}

/** Warm-up ramp sets for the exercise's ramp type and the session length. */
/** What the session has already done before an exercise, as far as its ramps care. */
export interface RampContext {
  /** Earlier work today on the same movement pattern, with the heaviest working weight among it. */
  samePattern: { weight: number | null } | null;
  /** An earlier exercise today shares a primary muscle group. */
  sameMuscles: boolean;
  /** A long break separates the earlier work from now, so the joints are cold again. */
  afterBreak: boolean;
}

/** The load the ramps lead up to, and the grid they can sit on. */
export interface RampLoad {
  weight: number | null;
  step: number;
  /** The empty bar for bar lifts: no ramp goes under it. */
  floor: number | null;
}

/** A later exercise on a pattern already trained today earns one light set only when this much heavier. */
export const MARKEDLY_HEAVIER = 1.25;

/**
 * Distinct loads on the grid under the working weight: how many ramps could
 * differ from it. The empty bar as the working weight leaves none.
 */
export function rampRoom(load: RampLoad): number {
  if (load.weight === null) return Number.POSITIVE_INFINITY;
  const start = load.floor ?? load.step;
  return Math.max(0, Math.floor((load.weight - load.step - start) / load.step + 1e-9) + 1);
}

/**
 * Ramp sets for an exercise, decided from the session so far rather than the
 * exercise alone. A warm-up does two jobs: raising tissue temperature, which
 * the first exercise already did, and rehearsing the movement at the load,
 * which is about the nervous system and the joint angle. Only the second
 * survives into later exercises. So the first heavy compound keeps its full
 * ramp; a later exercise on the same pattern gets none unless it is markedly
 * heavier; a later exercise on the same muscles at a new angle gets one light
 * set; the first exercise to load a cold joint gets a full ramp again; and a
 * long break puts the full ramp back. A ramp never sits at the working weight.
 */
export function rampSetsFor(
  exercise: CatalogExercise,
  role: TrainingRole,
  targetMinutes: number,
  context: RampContext | null = null,
  load: RampLoad | null = null,
): number {
  if (exercise.warmup === 'none') return 0;
  if (role !== 'primary-strength' && role !== 'secondary-strength' && exercise.warmup !== 'full')
    return 0;
  let count =
    targetMinutes <= 15
      ? exercise.warmup === 'full'
        ? 1
        : 0
      : targetMinutes <= 30
        ? 1
        : exercise.warmup === 'full'
          ? 2
          : 1;
  if (count === 0) return 0;
  if (context && !context.afterBreak) {
    if (context.samePattern) {
      const heavier =
        load !== null &&
        load.weight !== null &&
        context.samePattern.weight !== null &&
        load.weight >= context.samePattern.weight * MARKEDLY_HEAVIER;
      count = heavier ? 1 : 0;
    } else if (context.sameMuscles) {
      count = Math.min(count, 1);
    }
  }
  if (load && load.weight !== null) count = Math.min(count, rampRoom(load));
  return count;
}

export const ROLE_RANK: Record<TrainingRole, number> = {
  'primary-strength': 100,
  'secondary-strength': 80,
  'primary-hypertrophy': 70,
  specialization: 65,
  'secondary-hypertrophy': 50,
  isolation: 30,
  corrective: 20,
  finisher: 10,
  'warm-up': 5,
};
