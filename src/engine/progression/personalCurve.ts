import { getExercise } from '../../catalog/exercises/catalog';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RESERVE_CHECK, reserveReadings, suitsReserveCheck } from './reserveCheck';

/**
 * Each lift's own reps-to-weight curve (Maintenance 27, the owner's item 41,
 * docs/research/personal-curves.md). Every target turns a load into reps and back with one curve
 * for everyone, Epley's: a set of `w` for `r` reps reads as a max of `w × (1 + r / 30)`. People
 * differ in how many reps they get at a share of their max (Nuzzo et al., 2024), so a lift can have
 * its own constant `k` in place of 30. It is learned only from item 43's sets taken to failure,
 * never from judged reserve, and it moves nothing on a lift until the readings pin it down: the
 * precision it takes was found by simulation (personalCurve.simulation.test.ts), not chosen.
 */

const DAY_MS = 86_400_000;

export const PERSONAL_CURVE = {
  /** The constant everyone's targets use (Epley). */
  POPULATION_K: 30,
  /**
   * How far lifters' own constants spread: about a fifth of the reps at a share of the max between
   * trained people (Nuzzo et al., 2024, PMID 37792272, net of test error), about 30 ± 6.
   */
  PRIOR_SD: 6,
  /** A pair that reads a constant outside this is noise, not a lifter (five spreads out). */
  K_MIN: 12,
  K_MAX: 60,
  /** Reps to failure, retested, vary by 0.7 to 1.1 reps (Mitter et al., 2022, PMID 35511896). */
  READ_SD: 1.0,
  /**
   * How much a trained lifter's max may move in a week between two readings: 0.5 to 2.5% in study
   * blocks (research for item 41); the middle of the lower part.
   */
  DRIFT_PER_WEEK: 0.01,
  /** Readings more than this many days apart are not paired: the max has moved between them. */
  PAIR_DAYS: 14,
  /** Readings fewer reps to failure apart than this say almost nothing about the curve. */
  PAIR_REPS: 6,
  /** Readings older than twelve weeks are not used: the curve can move with training. */
  WINDOW_DAYS: 84,
  /**
   * The curve moves a lift's targets once its constant is this sure (one standard deviation), or
   * once it is confidently different from 30 (below). Both set from the simulation
   * (personalCurve.simulation.test.ts): in every schedule and last-set loss simulated, either gate
   * left the curve worse than the rule by more than 1% of the load in at most a tenth of targets,
   * and better on average.
   */
  ACTIVE_SD: 2.5,
  /**
   * A curve this many of its spreads above 30, or below what the largest last-set loss could make
   * of 30, acts too: a difference the loss cannot explain. A check is always a lift's last set, so
   * its reps may run short of a fresh set's; how far is unsettled, and the simulation spans 0 to 20%.
   */
  DIFFERENT_Z: 2,
  LOSS_BOUND: 0.2,
  /** A curve speaks for the reps its readings spanned, one either side, and no further. */
  SPAN_MARGIN: 1,
  /**
   * The reach the population rule reads a set and asks a target to (`estimateOneRepMax`,
   * `exactLoadFromEstimate`: twelve reps). The curve reads to the same reach and changes only the
   * constant, so a lift with a curve of 30 gets exactly what everyone gets: any difference is the
   * lift's own (Maintenance 26 found an earlier curve's gains came from reading past twelve, a
   * change for everyone, not a curve).
   */
  RULE_READ_REPS: 12,
} as const;

/** One set taken to failure on the lift: a load and the reps it took. */
export interface CurveReading {
  at: string;
  weight: number;
  /** Reps to failure, every good rep counted. */
  reps: number;
}

/** Item 43's sets to failure on one lift, within the window, oldest first. */
export function curveReadings(
  history: readonly WorkoutRecord[],
  exerciseId: string,
  now: string,
  resetAt: string | null = null,
): CurveReading[] {
  if (!suitsReserveCheck(getExercise(exerciseId))) return [];
  return reserveReadings(history)
    .filter(
      (reading) =>
        reading.exerciseId === exerciseId &&
        !reading.stopped &&
        reading.weight !== null &&
        reading.weight > 0 &&
        reading.total >= 1 &&
        reading.total <= RESERVE_CHECK.MAX_TOTAL &&
        (Date.parse(now) - Date.parse(reading.at)) / DAY_MS <= PERSONAL_CURVE.WINDOW_DAYS &&
        (resetAt === null || Date.parse(reading.at) >= Date.parse(resetAt)),
    )
    .map((reading) => ({ at: reading.at, weight: reading.weight as number, reps: reading.total }));
}

/** A pair of readings and the constant it reads. */
export interface CurvePair {
  heavier: CurveReading;
  lighter: CurveReading;
  k: number;
  /** Its variance: the reps' own noise and the max moving between the two days. */
  variance: number;
}

function daysApart(a: CurveReading, b: CurveReading): number {
  return Math.abs(Date.parse(a.at) - Date.parse(b.at)) / DAY_MS;
}

/**
 * The constant two readings read, if both were taken at the same max: `w₁ (1 + n₁/k)` equals
 * `w₂ (1 + n₂/k)`. Its variance comes from each reading's reps (READ_SD) and from the max moving
 * between their days (DRIFT_PER_WEEK a week), carried through by the delta method.
 */
export function pairConstant(a: CurveReading, b: CurveReading): CurvePair | null {
  const [heavier, lighter] = a.weight >= b.weight ? [a, b] : [b, a];
  const gap = heavier.weight - lighter.weight;
  if (!(gap > 0) || lighter.reps - heavier.reps < PERSONAL_CURVE.PAIR_REPS) return null;
  if (daysApart(heavier, lighter) > PERSONAL_CURVE.PAIR_DAYS) return null;
  const k = (lighter.weight * lighter.reps - heavier.weight * heavier.reps) / gap;
  if (!(k >= PERSONAL_CURVE.K_MIN && k <= PERSONAL_CURVE.K_MAX)) return null;
  const drift = (PERSONAL_CURVE.DRIFT_PER_WEEK * daysApart(heavier, lighter)) / 7;
  const fromReps =
    (PERSONAL_CURVE.READ_SD ** 2 * (heavier.weight ** 2 + lighter.weight ** 2)) / gap ** 2;
  const fromDrift =
    (drift * heavier.weight * lighter.weight * (lighter.reps - heavier.reps)) ** 2 / gap ** 4;
  return { heavier, lighter, k, variance: fromReps + fromDrift };
}

/**
 * Pairs that share no reading, the most informative first: each reading pairs at most once, so no
 * reading counts twice.
 */
export function curvePairs(readings: readonly CurveReading[]): CurvePair[] {
  const all: CurvePair[] = [];
  readings.forEach((first, index) => {
    for (const second of readings.slice(index + 1)) {
      const pair = pairConstant(first, second);
      if (pair) all.push(pair);
    }
  });
  all.sort((a, b) => a.variance - b.variance);
  const used = new Set<CurveReading>();
  return all.filter((pair) => {
    if (used.has(pair.heavier) || used.has(pair.lighter)) return false;
    used.add(pair.heavier);
    used.add(pair.lighter);
    return true;
  });
}

export interface LiftCurve {
  /** The lift's constant: the population's, drawn toward its readings. */
  k: number;
  /** How sure (one standard deviation). */
  sd: number;
  /** Pairs read. */
  pairs: number;
  /** Readings on the lift in the window. */
  readings: number;
  /** The reps to failure its pairs spanned, one either side: where it may speak. */
  span: [number, number] | null;
  /** Sure enough to move the lift's targets. */
  active: boolean;
}

/** A lift's own curve from its sets to failure. */
export function liftCurve(
  history: readonly WorkoutRecord[],
  exerciseId: string,
  now: string,
  resetAt: string | null = null,
): LiftCurve {
  const readings = curveReadings(history, exerciseId, now, resetAt);
  const pairs = curvePairs(readings);
  const prior = 1 / PERSONAL_CURVE.PRIOR_SD ** 2;
  const precision = pairs.reduce((total, pair) => total + 1 / pair.variance, prior);
  const k =
    pairs.reduce(
      (total, pair) => total + pair.k / pair.variance,
      PERSONAL_CURVE.POPULATION_K * prior,
    ) / precision;
  const sd = 1 / Math.sqrt(precision);
  const reps = pairs.flatMap((pair) => [pair.heavier.reps, pair.lighter.reps]);
  const span: [number, number] | null =
    reps.length > 0
      ? [
          Math.min(...reps) - PERSONAL_CURVE.SPAN_MARGIN,
          Math.max(...reps) + PERSONAL_CURVE.SPAN_MARGIN,
        ]
      : null;
  return {
    k,
    sd,
    pairs: pairs.length,
    readings: readings.length,
    span,
    active: pairs.length > 0 && (sd <= PERSONAL_CURVE.ACTIVE_SD || different(k, sd)),
  };
}

/** A constant confidently away from the population's, beyond what a last-set loss could make. */
function different(k: number, sd: number): boolean {
  const { POPULATION_K, DIFFERENT_Z, LOSS_BOUND } = PERSONAL_CURVE;
  return (
    (k - POPULATION_K) / sd >= DIFFERENT_Z ||
    (POPULATION_K * (1 - LOSS_BOUND) - k) / sd >= DIFFERENT_Z
  );
}

/** Whether a curve speaks for a number of reps to failure. */
export function withinSpan(curve: Pick<LiftCurve, 'span'>, reps: number): boolean {
  return curve.span !== null && reps >= curve.span[0] && reps <= curve.span[1];
}

/**
 * The load a target takes on a lift's own curve: the rule's load (`ruleWeight`), moved by how the
 * lift's curve differs from the population's between the last set's reps to failure (its reps plus
 * the reserve read for it) and the target's (`toReps`: its top reps plus its reserve). The rule's
 * own reading of the last set, at its logged reps, stays, so its margin is the same for every
 * lifter (the review of item 41); at a constant of 30 the load is the rule's. Null where the curve
 * is not active or does not speak for both counts, each in reps to failure as its readings are.
 */
export function curveLoad(
  curve: LiftCurve,
  ruleWeight: number,
  last: { reps: number; rir: number | null },
  toReps: number,
): number | null {
  const fromReps = last.reps + (last.rir ?? 0);
  if (!curve.active || !withinSpan(curve, fromReps) || !withinSpan(curve, toReps)) return null;
  return (
    (ruleWeight * ruleLoad(1, fromReps, toReps, curve.k)) /
    ruleLoad(1, fromReps, toReps, PERSONAL_CURVE.POPULATION_K)
  );
}

/** The rule's conversion at a constant: a set read to twelve reps, a target asked to twelve. */
export function ruleLoad(fromWeight: number, fromReps: number, toReps: number, k: number): number {
  const reach = PERSONAL_CURVE.RULE_READ_REPS;
  return (fromWeight * (1 + Math.min(fromReps, reach) / k)) / (1 + Math.min(toReps, reach) / k);
}

/**
 * Whether a set to failure today, at about `reps` to failure, would pair with a recent reading on
 * the lift that has no pair yet: item 43's check then goes where it teaches the curve most.
 */
export function wouldPair(
  history: readonly WorkoutRecord[],
  exerciseId: string,
  reps: number,
  weight: number | null,
  now: string,
  resetAt: string | null = null,
): boolean {
  const readings = curveReadings(history, exerciseId, now, resetAt);
  const paired = new Set(curvePairs(readings).flatMap((pair) => [pair.heavier, pair.lighter]));
  return readings.some(
    (reading) =>
      !paired.has(reading) &&
      Math.abs(reading.reps - reps) >= PERSONAL_CURVE.PAIR_REPS &&
      (Date.parse(now) - Date.parse(reading.at)) / DAY_MS <= PERSONAL_CURVE.PAIR_DAYS &&
      (weight === null || Math.abs(reading.weight - weight) > 1e-6),
  );
}
