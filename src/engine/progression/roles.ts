import type { CatalogExercise, TrainingRole } from '../../catalog/exercises/exerciseSchema';
import type { StyleId, UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { resolveStyle } from '../planning/styleAdvice';
import type { SetPrescription } from '../workout/types';

/**
 * Progression roles turn an exercise and its role in the session into a
 * concrete prescription: sets, rep range, RIR, and rest. Strength roles use
 * lower reps, longer rests, and fewer high-quality sets; hypertrophy roles use
 * moderate reps, controlled RIR, and shorter rests. No tempo unless needed.
 * The programming style (the lifter's pick, or what Auto comes to) shapes each
 * role; `docs/research/programming-styles.md` has the research behind each one.
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

/** The rep zones an undulating lift rotates through. */
export type RepZone = 'heavy' | 'moderate' | 'light';

/** The style a prescription is written under, and for an undulating lift the zone it is on. */
export interface StyleContext {
  style: StyleId;
  zone?: RepZone;
}

/** The lifts that carry a session: the ones an undulating style rotates. */
export function undulates(role: TrainingRole): boolean {
  return (
    role === 'primary-strength' || role === 'secondary-strength' || role === 'primary-hypertrophy'
  );
}

/** A lift with a strength range has three zones; one without it has no heavy day. */
export function zonesFor(exercise: Pick<CatalogExercise, 'repRanges'>): RepZone[] {
  return exercise.repRanges.strength ? ['heavy', 'moderate', 'light'] : ['moderate', 'light'];
}

/** The zone a lift is on after this many logged sessions of it: each session moves it one on. */
export function zoneForCount(
  exercise: Pick<CatalogExercise, 'repRanges'>,
  sessions: number,
): RepZone {
  const zones = zonesFor(exercise);
  return zones[((Math.trunc(sessions) % zones.length) + zones.length) % zones.length] as RepZone;
}

/**
 * The light end of a lift: from the top of its usual range up, never past 25. A hold's range is
 * seconds, and a light day does not shorten it.
 */
export function lightRange(
  exercise: Pick<CatalogExercise, 'repRanges'> & Partial<Pick<CatalogExercise, 'measure'>>,
): [number, number] {
  if (exercise.measure === 'seconds') return exercise.repRanges.hypertrophy;
  const low = Math.min(exercise.repRanges.hypertrophy[1], 20);
  return [low, Math.min(low + 5, 25)];
}

export function zoneReps(
  exercise: Pick<CatalogExercise, 'repRanges'>,
  zone: RepZone,
): [number, number] {
  if (zone === 'light') return lightRange(exercise);
  if (zone === 'heavy') return exercise.repRanges.strength ?? exercise.repRanges.hypertrophy;
  return exercise.repRanges.hypertrophy;
}

const ZONE_REST_FACTOR: Record<RepZone, number> = { heavy: 1, moderate: 0.9, light: 0.8 };

/** Logged sessions of a lift: what moves an undulating lift to its next zone. */
export function loggedSessionsOf(exerciseId: string, history: readonly WorkoutRecord[]): number {
  return history.filter((record) =>
    record.entries.some(
      (entry) =>
        entry.exerciseId === exerciseId &&
        entry.sets.some((set) => set.kind === 'working' && set.completed),
    ),
  ).length;
}

export function styleContextFor(
  exercise: CatalogExercise,
  role: TrainingRole,
  profile: UserProfile,
  history: readonly WorkoutRecord[],
): StyleContext {
  const style = resolveStyle(profile);
  if (style !== 'undulating' || !undulates(role)) return { style };
  return { style, zone: zoneForCount(exercise, loggedSessionsOf(exercise.id, history)) };
}

/** `prescribe` with the style read from the profile and, for an undulating lift, the zone from the log. */
export function prescribeFor(
  exercise: CatalogExercise,
  role: TrainingRole,
  profile: UserProfile,
  history: readonly WorkoutRecord[],
): Prescription {
  return prescribe(exercise, role, profile, styleContextFor(exercise, role, profile, history));
}

export function prescribe(
  exercise: CatalogExercise,
  role: TrainingRole,
  profile: UserProfile,
  context?: StyleContext,
): Prescription {
  const style = context?.style ?? resolveStyle(profile);
  const factor = REST_STYLE_FACTOR[profile.restStyle];
  const strengthReps = exercise.repRanges.strength ?? exercise.repRanges.hypertrophy;
  const hypertrophyReps = exercise.repRanges.hypertrophy;
  // Light weights puts every lift at the light end; Foundation keeps a new lifter off the heavy
  // range and well short of failure; Lean-down takes nothing to failure.
  const light = style === 'high-rep';
  const foundation = style === 'foundation';
  const moreVolume = style === 'hypertrophy-focus' || light;
  const heavyReps = light ? lightRange(exercise) : foundation ? hypertrophyReps : strengthReps;
  const volumeReps = light ? lightRange(exercise) : hypertrophyReps;
  const volumeRir = foundation ? 2 : 1;

  let base: Prescription;
  switch (role) {
    case 'primary-strength':
      base = {
        sets: moreVolume || foundation ? 3 : 4,
        reps: heavyReps,
        rir: light ? 1 : foundation ? 3 : 2,
        restSeconds: light || foundation ? 120 : 150,
      };
      break;
    case 'secondary-strength':
      base = {
        sets: 3,
        reps: heavyReps,
        rir: light ? 1 : foundation ? 3 : 2,
        restSeconds: light || foundation ? 105 : 135,
      };
      break;
    case 'primary-hypertrophy':
      base = {
        sets: moreVolume ? 4 : 3,
        reps: style === 'strength-focus' ? strengthReps : volumeReps,
        rir: volumeRir,
        restSeconds: light || foundation ? 90 : 120,
      };
      break;
    case 'secondary-hypertrophy':
      base = {
        sets: foundation ? 2 : 3,
        reps: volumeReps,
        rir: volumeRir,
        restSeconds: light ? 75 : 90,
      };
      break;
    case 'specialization':
      base = { sets: foundation ? 3 : 4, reps: volumeReps, rir: volumeRir, restSeconds: 75 };
      break;
    case 'finisher':
      base = {
        sets: 2,
        reps: volumeReps,
        rir: foundation ? 2 : style === 'lean-down' ? 1 : 0,
        restSeconds: 45,
      };
      break;
    case 'corrective':
    case 'warm-up':
      base = { sets: 2, reps: hypertrophyReps, rir: 3, restSeconds: 45 };
      break;
    case 'isolation':
      base = { sets: foundation ? 2 : 3, reps: volumeReps, rir: volumeRir, restSeconds: 60 };
      break;
  }

  // An undulating lift takes its reps, reserve, and rest from the zone it is on today.
  if (style === 'undulating' && undulates(role)) {
    const zone = context?.zone ?? 'moderate';
    base = {
      ...base,
      reps: zoneReps(exercise, zone),
      rir: zone === 'heavy' ? 2 : zone === 'light' ? 1 : role === 'primary-hypertrophy' ? 1 : 2,
      restSeconds: Math.round((base.restSeconds * ZONE_REST_FACTOR[zone]) / 5) * 5,
    };
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
