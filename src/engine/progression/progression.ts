import { getExercise } from '../../catalog/exercises/catalog';
import type { CatalogExercise, TrainingRole } from '../../catalog/exercises/exerciseSchema';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { coachingPolicy, policyLabel } from '../coach/experience';
import { overrideBias } from './overrides';
import { weightStep } from '../plateMath/plateMath';
import type { EntryProgression, ProgressionMode, SetPrescription } from '../workout/types';
import { restCategory, type Prescription } from './roles';

/**
 * The progression engine: the next target for an exercise from its actual
 * completed records. Strength roles progress by load once every set clears the
 * rep floor with reps in reserve; hypertrophy and isolation roles use double
 * progression (reps to the top of the range, then load). One poor session is
 * never punished; two in a row earn a micro-deload and three a reset. A new
 * exercise in the same progression family inherits its family's history.
 */

export interface PerformanceSet {
  reps: number;
  weight: number | null;
  rir: number | null;
  targetReps: [number, number] | null;
  targetRir: number | null;
}

export interface PerformancePoint {
  date: string;
  exerciseId: string;
  viaFamily: boolean;
  sets: PerformanceSet[];
  bestWeight: number | null;
  bestReps: number;
  /** Every completed working set reached the top of its target range. */
  topAll: boolean;
  /** Every completed working set reached the floor of its target range. */
  floorAll: boolean;
  /** At least one completed working set fell below its floor. */
  under: boolean;
  avgRir: number | null;
  /** Estimated one-rep max of the best set (Epley), null without a weight. */
  e1rm: number | null;
  plannedSets: number;
}

export interface NextTarget {
  weight: number | null;
  reps: [number, number];
  rir: number;
  mode: ProgressionMode;
  increment: number;
  sessions: number;
  viaFamily: boolean;
  confidence: EntryProgression['confidence'];
  evidence: string[];
  /** 1 when an extra set is worth offering (never applied automatically). */
  setsAdvice: 0 | 1;
}

export function estimateOneRepMax(weight: number, reps: number): number {
  return Math.round(weight * (1 + Math.min(reps, 12) / 30) * 10) / 10;
}

function completedWorking(record: WorkoutRecord, exerciseId: string) {
  return record.entries
    .filter((entry) => entry.exerciseId === exerciseId)
    .flatMap((entry) =>
      entry.sets
        .filter((set) => set.kind === 'working' && set.completed)
        .map((set) => ({
          reps: set.reps,
          weight: set.weight,
          rir: set.rir,
          targetReps: set.targetReps ?? null,
          targetRir: typeof set.targetRir === 'number' ? set.targetRir : null,
          planned: entry.plannedSets ?? 0,
        })),
    );
}

function toPoint(
  record: WorkoutRecord,
  exerciseId: string,
  viaFamily: boolean,
): PerformancePoint | null {
  const sets = completedWorking(record, exerciseId);
  if (sets.length === 0) return null;
  const weights = sets.map((set) => set.weight).filter((w): w is number => w !== null);
  const bestWeight = weights.length > 0 ? Math.max(...weights) : null;
  const best = [...sets].sort(
    (a, b) => (b.weight ?? 0) * b.reps - (a.weight ?? 0) * a.reps || b.reps - a.reps,
  )[0] as (typeof sets)[number];
  const withTarget = sets.filter((set) => set.targetReps !== null);
  const rirs = sets.map((set) => set.rir).filter((r): r is number => r !== null);
  return {
    date: record.completedAt ?? record.startedAt,
    exerciseId,
    viaFamily,
    sets: sets.map(({ reps, weight, rir, targetReps, targetRir }) => ({
      reps,
      weight,
      rir,
      targetReps,
      targetRir,
    })),
    bestWeight,
    bestReps: best.reps,
    topAll:
      withTarget.length > 0 &&
      withTarget.every((set) => set.reps >= (set.targetReps as [number, number])[1]),
    floorAll:
      withTarget.length > 0 &&
      withTarget.every((set) => set.reps >= (set.targetReps as [number, number])[0]),
    under: withTarget.some((set) => set.reps < (set.targetReps as [number, number])[0]),
    avgRir:
      rirs.length > 0
        ? Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10
        : null,
    e1rm: best.weight !== null ? estimateOneRepMax(best.weight, best.reps) : null,
    plannedSets: sets[0]?.planned ?? 0,
  };
}

/**
 * Completed performances of an exercise, newest first. Without any for the
 * exact exercise, the same progression family stands in (marked viaFamily).
 */
export function performanceHistory(
  history: readonly WorkoutRecord[],
  exercise: Pick<CatalogExercise, 'id' | 'progressionFamily'>,
  limit = 6,
): PerformancePoint[] {
  const newestFirst = [...history].sort((a, b) =>
    (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt),
  );
  const exact: PerformancePoint[] = [];
  for (const record of newestFirst) {
    const point = toPoint(record, exercise.id, false);
    if (point) exact.push(point);
    if (exact.length >= limit) break;
  }
  if (exact.length > 0) return exact;
  const family: PerformancePoint[] = [];
  for (const record of newestFirst) {
    for (const entry of record.entries) {
      if (entry.exerciseId === exercise.id) continue;
      const other = getExercise(entry.exerciseId);
      if (!other || other.progressionFamily !== exercise.progressionFamily) continue;
      const point = toPoint(record, entry.exerciseId, true);
      if (point) family.push(point);
    }
    if (family.length >= limit) break;
  }
  return family.slice(0, limit);
}

function roundToStep(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export interface NextTargetInput {
  exercise: CatalogExercise;
  role: TrainingRole;
  prescription: Prescription;
  history: readonly WorkoutRecord[];
  profile: UserProfile;
  fatigueLevel?: 'fresh' | 'normal' | 'elevated' | 'high';
  /** When given, a gap of RETURN_AFTER_DAYS or more since the last session starts from the estimate. */
  now?: string;
}

const DAY_MS = 86_400_000;
/** A break this long makes the last load an unsafe guess; the estimated max carries over. */
export const RETURN_AFTER_DAYS = 21;
export const LONG_BREAK_DAYS = 42;

/** Load for a rep target at a given reserve from an estimated one-rep max (Epley, inverted). */
export function loadFromEstimate(
  e1rm: number,
  reps: number,
  rir: number,
  fraction: number,
  step: number,
): number {
  const effective = Math.min(reps + rir, 12);
  return roundToStep((e1rm / (1 + effective / 30)) * fraction, step);
}

/** Modes that follow the lifter's own habit of lifting above or below the suggestion. */
const BIASABLE: ReadonlySet<ProgressionMode> = new Set(['weight', 'reps', 'maintain', 'double']);

export function recommendNextTarget(input: NextTargetInput): NextTarget {
  const target = recommendBaseTarget(input);
  if (target.weight === null || !BIASABLE.has(target.mode)) return target;
  const bias = overrideBias(input.history, input.exercise.id, target.increment);
  if (bias.steps === 0 || !bias.evidence) return target;
  return {
    ...target,
    weight: roundToStep(target.weight + bias.steps * target.increment, target.increment),
    evidence: [...target.evidence, bias.evidence],
  };
}

function recommendBaseTarget(input: NextTargetInput): NextTarget {
  const { exercise, role, prescription, history, profile } = input;
  const units = profile.units;
  const step = weightStep(exercise, units);
  const points = performanceHistory(history, exercise);
  const base: Omit<NextTarget, 'mode' | 'weight' | 'evidence' | 'confidence'> = {
    reps: prescription.reps,
    rir: prescription.rir,
    increment: step,
    sessions: points.length,
    viaFamily: points[0]?.viaFamily ?? false,
    setsAdvice: 0,
  };
  const last = points[0];
  if (!last) {
    return {
      ...base,
      mode: 'start',
      weight: null,
      confidence: 'low',
      evidence: [
        'First time logged: enter the weight you use and the next target follows from it.',
      ],
    };
  }

  const strength = restCategory(role) === 'strength';
  const lastLine = `Last${last.viaFamily ? ` (${getExercise(last.exerciseId)?.name ?? 'same family'})` : ''}: ${
    last.bestWeight === null ? 'bodyweight' : `${last.bestWeight} ${units}`
  } × ${last.sets.map((set) => set.reps).join(', ')}${
    last.avgRir === null ? '' : ` @ RIR ${last.avgRir}`
  } (${shortDate(last.date)})`;
  const evidence: string[] = [lastLine];
  let consecutiveUnder = 0;
  for (const point of points) {
    if (!point.under) break;
    consecutiveUnder += 1;
  }
  let consecutiveTop = 0;
  for (const point of points) {
    if (!point.topAll) break;
    consecutiveTop += 1;
  }
  const policy = coachingPolicy(profile.experience);
  const clean = (point: PerformancePoint) =>
    point.floorAll &&
    (point.avgRir === null || point.avgRir >= prescription.rir - policy.reserveTolerance);
  let consecutiveClean = 0;
  for (const point of points) {
    if (!clean(point)) break;
    consecutiveClean += 1;
  }
  const confidence: NextTarget['confidence'] =
    points.length >= 3 && !last.viaFamily ? 'high' : points.length >= 2 ? 'medium' : 'low';
  const weight = last.bestWeight;

  const result = (
    mode: ProgressionMode,
    nextWeight: number | null,
    line: string,
    extra: Partial<NextTarget> = {},
  ): NextTarget => ({
    ...base,
    ...extra,
    mode,
    weight: nextWeight,
    confidence,
    evidence: [...evidence, line, ...(extra.evidence ?? [])],
  });

  if (last.viaFamily) {
    const estimate =
      last.e1rm === null
        ? null
        : loadFromEstimate(last.e1rm, prescription.reps[1], prescription.rir, 0.9, step);
    return result(
      'estimate',
      estimate,
      last.e1rm === null
        ? 'New variation with no load history in its family: log a set and the target follows.'
        : `New variation: 90% of the family estimate (${last.e1rm} ${units} max) for ${prescription.reps[0]}-${prescription.reps[1]} reps at RIR ${prescription.rir}; log a set and the target follows.`,
    );
  }
  const daysSince = input.now
    ? Math.floor((Date.parse(input.now) - Date.parse(last.date)) / DAY_MS)
    : 0;
  if (daysSince >= RETURN_AFTER_DAYS && last.e1rm !== null) {
    const fraction = daysSince >= LONG_BREAK_DAYS ? 0.85 : 0.9;
    return result(
      'return',
      loadFromEstimate(last.e1rm, prescription.reps[1], prescription.rir, fraction, step),
      `${daysSince} days since the last session: back at ${Math.round(fraction * 100)}% of the estimated max (${last.e1rm} ${units}) and rebuilding from there.`,
    );
  }
  if (consecutiveUnder >= 3) {
    return result(
      'regress',
      weight === null
        ? null
        : Math.min(roundToStep(weight * 0.85, step), Math.max(step, weight - step)),
      'Below the rep floor three sessions running: reset 15% and rebuild; an alternative may fit better.',
    );
  }
  if (consecutiveUnder >= 2) {
    return result(
      'deload',
      weight === null
        ? null
        : Math.min(roundToStep(weight * 0.9, step), Math.max(step, weight - step)),
      'Missed the floor twice in a row: micro-deload 10% and win the reps back.',
    );
  }
  if (last.under) {
    return result(
      'maintain',
      weight,
      'Missed the floor last time; one session is not a trend, so repeat the load.',
    );
  }
  if (input.fatigueLevel === 'high') {
    return result('maintain', weight, 'Fatigue is high: hold the load and hit the reps cleanly.');
  }
  const setsAdvice: 0 | 1 = !strength && consecutiveTop >= 2 ? 1 : 0;
  const setsLine =
    setsAdvice === 1 ? ['Two sessions at the top of the range: an extra set is on the table.'] : [];

  if (weight === null) {
    return result(
      last.topAll ? 'reps' : 'maintain',
      null,
      last.topAll
        ? 'Bodyweight at the top of the range: add reps or load the movement.'
        : 'Bodyweight inside the range: keep building reps.',
      { setsAdvice, evidence: setsLine },
    );
  }

  if (strength) {
    if (clean(last)) {
      if (consecutiveClean >= policy.cleanSessionsToProgress) {
        return result(
          'weight',
          roundToStep(weight + step, step),
          policy.cleanSessionsToProgress > 1
            ? `${consecutiveClean} clean sessions in a row, every set past the floor with reps in reserve: add ${step} ${units}.`
            : `Every set cleared the floor with reps in reserve: add ${step} ${units}.`,
          { setsAdvice, evidence: setsLine },
        );
      }
      return result(
        'maintain',
        weight,
        `${policyLabel(policy)} policy: load moves after ${policy.cleanSessionsToProgress} clean sessions in a row; ${consecutiveClean} banked, hold the load once more.`,
        { setsAdvice, evidence: setsLine },
      );
    }
    return result(
      'maintain',
      weight,
      last.floorAll
        ? policy.reserveTolerance === 0
          ? 'Hit the reps but under the prescribed reserve: hold the load and bank a cleaner session.'
          : 'Hit the reps with little in reserve: hold the load and bank a cleaner session.'
        : 'Hold the load until every set clears the floor.',
    );
  }

  if (last.topAll) {
    if (consecutiveTop >= policy.topSessionsToProgress) {
      return result(
        'weight',
        roundToStep(weight + step, step),
        policy.topSessionsToProgress > 1
          ? `Top of the range on every set ${consecutiveTop} sessions running: add ${step} ${units} and work back up the range.`
          : `Top of the range on every set: add ${step} ${units} and work back up the range.`,
        { setsAdvice, evidence: setsLine },
      );
    }
    return result(
      'reps',
      weight,
      `${policyLabel(policy)} policy: load moves after ${policy.topSessionsToProgress} sessions at the top of the range; ${consecutiveTop} so far, so one more rep per set first.`,
      { setsAdvice, evidence: setsLine },
    );
  }
  if (last.floorAll) {
    return result('reps', weight, 'Inside the range: same load, one more rep per set.', {
      setsAdvice,
      evidence: setsLine,
    });
  }
  return result('maintain', weight, 'Hold the load until every set clears the floor.');
}

/** Ramp-set loads for a working weight: one ramp at 60%, two at 50% and 75%. */
export function rampWeights(
  working: number | null,
  count: number,
  step: number,
): (number | null)[] {
  if (working === null || count <= 0) return Array.from({ length: Math.max(0, count) }, () => null);
  const fractions = count === 1 ? [0.6] : count === 2 ? [0.5, 0.75] : [0.4, 0.6, 0.8];
  return fractions.slice(0, count).map((fraction) => roundToStep(working * fraction, step));
}

/**
 * Writes the target loads and reps into a set list: working sets get the next
 * target, ramp sets get calculated loads, and a drop set about 80% of the
 * working load. Sets the user set by hand are left alone.
 */
export function applyProgression(
  sets: SetPrescription[],
  target: NextTarget,
  step: number,
  manual: { weight?: boolean; reps?: boolean } = {},
): SetPrescription[] {
  const warmups = sets.filter((set) => set.kind === 'warmup');
  const ramps = rampWeights(target.weight, warmups.length, step);
  let rampIndex = 0;
  return sets.map((set) => {
    if (set.kind === 'warmup') {
      const weight = ramps[rampIndex] ?? null;
      rampIndex += 1;
      return { ...set, targetWeight: manual.weight ? set.targetWeight : weight };
    }
    if (set.kind === 'drop') {
      return {
        ...set,
        targetWeight:
          manual.weight || target.weight === null
            ? set.targetWeight
            : roundToStep(target.weight * 0.8, step),
      };
    }
    return {
      ...set,
      targetWeight: manual.weight ? set.targetWeight : target.weight,
      targetReps: manual.reps ? set.targetReps : [target.reps[0], target.reps[1]],
      targetRir: manual.reps ? set.targetRir : target.rir,
    };
  });
}

export function summarizeProgression(target: NextTarget): EntryProgression {
  return {
    mode: target.mode,
    evidence: target.evidence,
    sessions: target.sessions,
    viaFamily: target.viaFamily,
    confidence: target.confidence,
    setsAdvice: target.setsAdvice,
  };
}
