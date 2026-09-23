import { getExercise } from '../../catalog/exercises/catalog';
import {
  isHold,
  type CatalogExercise,
  type TrainingRole,
} from '../../catalog/exercises/exerciseSchema';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { coachingPolicy, policyLabel } from '../coach/experience';
import { enteredMaxFor, type StrengthMaxes } from './maxes';
import { overrideBias } from './overrides';
import {
  ENTERED_FRACTION,
  START_FRACTION,
  barWeightFor,
  convertEstimate,
  estimateStartingMax,
  startRatio,
} from './startingLoad';
import { weightStep } from '../plateMath/plateMath';
import { estimateFromOtherLifts } from './crossEstimate';
import { fatigueSteps, precedingWorkInRecord } from '../recovery/sessionContext';
import { fitWeight, snapDown, type Loading } from '../loading/loading';
import { platesFor } from '../plateMath/plateMath';
import type {
  EntryProgression,
  ProgressionMode,
  RackNote,
  SetPrescription,
} from '../workout/types';
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
  /** The saved workout the point was read from. */
  recordId: string;
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
  /** Set when the target was held at the heaviest weight available and the reps pushed instead. */
  capped?: { at: number };
  /** The weight the target moved from: the last one lifted, when there is one. */
  from?: number | null;
  /** The weights here could not make the load asked for; the line says what they make instead. */
  rack?: RackNote;
  /** A hold: `reps` is [today's seconds, the top of the range], and loads never move the seconds. */
  hold?: boolean;
  /** The logged session the target was read from, and whether that day met its reps and reserve. */
  reference?: { recordId: string; exerciseId: string; clean: boolean };
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
    recordId: record.id,
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
    // A hold's reps are seconds: no strength estimate reads from them.
    e1rm:
      best.weight !== null && !isHold(getExercise(exerciseId))
        ? estimateOneRepMax(best.weight, best.reps)
        : null,
    plannedSets: sets[0]?.planned ?? 0,
  };
}

/**
 * Completed performances of an exercise, newest first. Without any for the
 * exact exercise, the same progression family stands in (marked viaFamily).
 */
export function performanceHistory(
  history: readonly WorkoutRecord[],
  exercise: Pick<CatalogExercise, 'id' | 'progressionFamily'> &
    Partial<Pick<CatalogExercise, 'measure'>>,
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
      // A hold's seconds never stand in for a lift's reps, nor reps for seconds.
      if (other.measure !== (exercise.measure ?? 'reps')) continue;
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
  /** Maxes the lifter entered by hand; they set the first target of a lift without its own history. */
  maxes?: StrengthMaxes | null;
  /** Session context: overlap-weighted working sets that come before this exercise today. */
  session?: { precedingSets: number };
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

const FATIGUE_MODES: ReadonlySet<ProgressionMode> = new Set([
  'weight',
  'double',
  'reps',
  'maintain',
]);

/**
 * Session context: the overlapping work before this exercise today against
 * the same measure on the day its target came from, and the load moved by the
 * difference. A target read from a logged set already carries that day's
 * fatigue, so the usual order changes nothing and nothing drifts.
 */
function withSessionFatigue(target: NextTarget, input: NextTargetInput): NextTarget {
  const session = input.session;
  const reference = target.reference;
  if (!session || !reference || target.weight === null || !FATIGUE_MODES.has(target.mode)) {
    return target;
  }
  const record = input.history.find((candidate) => candidate.id === reference.recordId);
  if (!record) return target;
  const before = precedingWorkInRecord(record, reference.exerciseId, getExercise);
  if (before === null) return target;
  const { steps, line } = fatigueSteps(session.precedingSets, before, reference.clean);
  if (steps === 0 || line === null) return target;
  return floorTarget(
    {
      ...target,
      weight: roundToStep(target.weight + steps * target.increment, target.increment),
      evidence: [...target.evidence, line],
    },
    input,
  );
}

/** A typed max outweighs the log only when it says at least this much more. */
export const ENTERED_MAX_MARGIN = 1.025;
/** How far one session moves toward an entered max. */
export const ENTERED_MAX_STEPS = 2;
/**
 * The share of what an entered max implies that a lift with logged history is asked for. A first
 * target on a lift never done stays more careful (`ENTERED_FRACTION`); here the movement is known
 * and the step limit is the safety.
 */
export const ENTERED_WITH_HISTORY_FRACTION = 0.95;

/**
 * A max entered on a lift that already has logged sets. The log is the better
 * evidence, so the max only counts while it is newer than the last logged
 * session and says more than those sets do; then the target moves toward what
 * the max implies, two steps at most, and the next logged session takes over
 * again. A lift without its own history takes its first target from the max
 * in `recommendBaseTarget`, as before.
 */
function withEnteredMax(target: NextTarget, input: NextTargetInput): NextTarget {
  const maxes = input.maxes ?? null;
  if (!maxes || target.weight === null || !FATIGUE_MODES.has(target.mode)) return target;
  const entry = maxes.maxes[input.exercise.id];
  if (!entry) return target;
  const last = performanceHistory(input.history, input.exercise, 1)[0];
  if (!last || last.viaFamily || last.e1rm === null) return target;
  if (!(Date.parse(entry.enteredAt) > Date.parse(last.date))) return target;
  const units = input.profile.units;
  const entered = enteredMaxFor(maxes, input.exercise.id, units);
  if (entered === null || entered < last.e1rm * ENTERED_MAX_MARGIN) return target;
  const step = target.increment;
  const implied = loadFromEstimate(
    entered,
    input.prescription.reps[1],
    input.prescription.rir,
    ENTERED_WITH_HISTORY_FRACTION,
    step,
  );
  const lifted = Math.min(implied, roundToStep(target.weight + ENTERED_MAX_STEPS * step, step));
  if (!(lifted > target.weight)) return target;
  const steps = Math.round((lifted - target.weight) / step);
  return floorTarget(
    {
      ...target,
      weight: lifted,
      evidence: [
        ...target.evidence,
        `Your max of ${Math.round(entered)} ${units}, entered after your last session, says more than your logged sets: up ${
          steps === 1 ? 'a step' : `${steps} steps`
        } toward it. Your next logged session takes over.`,
      ],
    },
    input,
  );
}

export function recommendNextTarget(input: NextTargetInput): NextTarget {
  const target = withSessionFatigue(withEnteredMax(recommendBiasedTarget(input), input), input);
  return settleHold(target, input.profile.units);
}

/** Seconds a hold's target grows by once every set reaches it. */
export const HOLD_STEP_SECONDS = 5;

/**
 * A hold's seconds (Maintenance 20). Its target is `reps[0]`, and `reps[1]` stays the top of the
 * range. It starts at the bottom; once every set of the last session reached its target it grows
 * by five seconds past the shortest hold, never beyond the top; a set short of it holds the
 * target. At the top on every set, a loaded carry takes the next weight (the load decision below
 * made that call) and starts again at the bottom, and a bodyweight hold is ready for a harder
 * variation. Only the hold's own sessions count: a related exercise's reps are not seconds.
 */
function withHoldSeconds(target: NextTarget, input: NextTargetInput): NextTarget {
  const [bottom, top] = input.prescription.reps;
  const units = input.profile.units;
  const hold = (seconds: number, line: string, mode: NextTarget['mode'] = target.mode) => ({
    ...target,
    hold: true,
    mode,
    // The seconds are the lever here; an extra set is not offered on a hold.
    setsAdvice: 0 as const,
    // The load moves only once the seconds reach the top; until then the last load stays.
    weight:
      mode === 'weight' || target.mode !== 'weight'
        ? target.weight
        : (target.from ?? target.weight),
    reps: [Math.min(top, Math.max(bottom, seconds)), top] as [number, number],
    evidence: [line],
  });
  const last = performanceHistory(input.history, input.exercise, 1).find(
    (point) => !point.viaFamily,
  );
  if (!last || last.sets.length === 0) {
    return hold(
      bottom,
      `First time: hold ${bottom} s, and the seconds grow as it gets easier.`,
      'start',
    );
  }
  const asked = last.sets.find((set) => set.targetReps !== null)?.targetReps?.[0] ?? bottom;
  const lastTarget = Math.min(top, Math.max(bottom, asked));
  const shortest = Math.min(...last.sets.map((set) => set.reps));
  // A long break starts the seconds again from the bottom, and a carry a step lighter.
  const daysSince = input.now
    ? Math.floor((Date.parse(input.now) - Date.parse(last.date)) / DAY_MS)
    : 0;
  if (daysSince >= RETURN_AFTER_DAYS) {
    const lastWeight = last.bestWeight;
    const lighter =
      lastWeight === null
        ? null
        : Math.max(target.increment, roundToStep(lastWeight - target.increment, target.increment));
    return {
      ...hold(
        bottom,
        lighter === null
          ? `${daysSince} days since the last session: back to ${bottom} s.`
          : `${daysSince} days since the last session: back to ${bottom} s at ${lighter} ${units}.`,
        'return',
      ),
      weight: lighter,
    };
  }
  if (shortest < lastTarget) {
    // Missed twice or more in a row, a carry comes down in load as any lift does; the seconds stay.
    if ((target.mode === 'deload' || target.mode === 'regress') && target.weight !== null) {
      return hold(
        lastTarget,
        `Short of ${lastTarget} s more than once in a row: ${target.weight} ${units} for ${lastTarget} s.`,
      );
    }
    return hold(
      lastTarget,
      `A set came in under ${lastTarget} s: ${lastTarget} s again.`,
      'maintain',
    );
  }
  if (input.fatigueLevel === 'high') {
    return hold(lastTarget, `Fatigue is high: ${lastTarget} s again.`, 'maintain');
  }
  if (last.sets.every((set) => set.reps >= top)) {
    if (target.mode === 'weight' && target.weight !== null) {
      return hold(
        bottom,
        `The full ${top} s on every set: ${target.weight} ${units} next, from ${bottom} s again.`,
      );
    }
    return target.weight === null
      ? hold(top, `The full ${top} s on every set: ready for a harder variation.`, 'maintain')
      : hold(top, `The full ${top} s on every set: the load goes up once it stays this steady.`);
  }
  const next = Math.max(lastTarget, Math.floor(shortest / HOLD_STEP_SECONDS) * HOLD_STEP_SECONDS);
  const grown = Math.min(top, next + HOLD_STEP_SECONDS);
  return hold(grown, `Held ${lastTarget} s or more on every set: ${grown} s next.`, 'reps');
}

function recommendBiasedTarget(input: NextTargetInput): NextTarget {
  const base = floorTarget(recommendBaseTarget(input), input);
  // A hold's seconds are decided on the base; the steps after it move only the load.
  const target = isHold(input.exercise) ? withHoldSeconds(base, input) : base;
  if (target.weight === null || !BIASABLE.has(target.mode)) return target;
  const bias = overrideBias(input.history, input.exercise.id, target.increment);
  if (bias.steps === 0 || !bias.evidence) return target;
  return floorTarget(
    {
      ...target,
      weight: roundToStep(target.weight + bias.steps * target.increment, target.increment),
      evidence: [...target.evidence, bias.evidence],
    },
    input,
  );
}

/** A bar lift never targets less than the empty bar, whatever the mode said. */
function floorTarget(target: NextTarget, input: NextTargetInput): NextTarget {
  const bar = barWeightFor(input.exercise, input.profile.units);
  if (bar === null || target.weight === null || target.weight >= bar) return target;
  return {
    ...target,
    weight: bar,
    evidence: [...target.evidence, `Never below the empty bar (${bar} ${input.profile.units}).`],
  };
}

/** Rep ranges whose tops sit this close are the same zone; holding at a cap moves a range by two. */
export const SAME_ZONE_REPS = 2;
/** A same-zone session older than this, with newer sessions in other zones, is no longer the reference. */
export const ZONE_REFERENCE_DAYS = 42;
/** The share of what the latest estimated max implies that a lift new to a rep range is asked for. */
export const ZONE_FRACTION = 0.95;

/** The top of the rep range a logged session was run at, when the log says. */
function zoneTop(point: PerformancePoint): number | null {
  const target = point.sets.find((set) => set.targetReps !== null)?.targetReps ?? null;
  return target ? target[1] : null;
}

/**
 * The sessions run at about the same rep range as the newest one. An estimated
 * max read from fives and one read from fifteens differ by a few percent for
 * the same lifter, so anything that compares them session to session (a stall)
 * has to compare like with like.
 */
export function sameZoneAsLatest(points: readonly PerformancePoint[]): PerformancePoint[] {
  const latest = points[0];
  const top = latest ? zoneTop(latest) : null;
  if (top === null) return [...points];
  return points.filter((point) => {
    const other = zoneTop(point);
    return other === null || Math.abs(other - top) <= SAME_ZONE_REPS;
  });
}

function sameZone(point: PerformancePoint, reps: [number, number]): boolean {
  const top = zoneTop(point);
  return top === null || Math.abs(top - reps[1]) <= SAME_ZONE_REPS;
}

function recommendBaseTarget(input: NextTargetInput): NextTarget {
  const { exercise, role, prescription, history, profile } = input;
  const units = profile.units;
  const step = weightStep(exercise, units);
  // A weight belongs to the rep range it was lifted at. When the range moves (an undulating
  // day, a new style, the same lift in a different role) the sessions run at today's range
  // are the reference, and without one the latest estimated max sets the load.
  const recent = performanceHistory(history, exercise, 12);
  const latest = recent[0];
  const zoned = latest && !latest.viaFamily;
  const inZone = zoned ? recent.filter((point) => sameZone(point, prescription.reps)) : recent;
  const zoneFresh =
    zoned &&
    inZone[0] !== undefined &&
    Date.parse(latest.date) - Date.parse(inZone[0].date) <= ZONE_REFERENCE_DAYS * DAY_MS;
  const newToZone = zoned && !zoneFresh;
  const points = (newToZone ? recent : inZone).slice(0, 6);
  const base: Omit<NextTarget, 'mode' | 'weight' | 'evidence' | 'confidence'> = {
    reps: prescription.reps,
    rir: prescription.rir,
    increment: step,
    sessions: points.length,
    viaFamily: points[0]?.viaFamily ?? false,
    setsAdvice: 0,
  };
  const last = points[0];
  const maxes = input.maxes ?? null;
  // A max the lifter entered sets the first target of a lift without its own history.
  const entered =
    maxes && (!last || last.viaFamily) ? enteredMaxFor(maxes, exercise.id, units) : null;
  if (entered !== null) {
    return {
      ...base,
      viaFamily: false,
      mode: 'start',
      weight: loadFromEstimate(
        entered,
        prescription.reps[1],
        prescription.rir,
        ENTERED_FRACTION,
        step,
      ),
      confidence: 'low',
      evidence: [
        `Your max for ${exercise.name}: ${entered} ${units}. The first target is ${Math.round(ENTERED_FRACTION * 100)}% of what it implies for ${prescription.reps[0]}-${prescription.reps[1]} reps at RIR ${prescription.rir}; log a set and the target follows.`,
      ],
    };
  }
  if (!last) {
    // Lifts with history say how strong the lifter is against the reference table.
    const cross = estimateFromOtherLifts(
      exercise,
      history,
      input.now ?? new Date().toISOString(),
      units,
      input.maxes ?? null,
    );
    if (cross) {
      return {
        ...base,
        mode: 'start',
        weight: loadFromEstimate(
          cross.e1rm,
          prescription.reps[1],
          prescription.rir,
          START_FRACTION,
          step,
        ),
        confidence: cross.confidence,
        evidence: [cross.evidence],
      };
    }
    const estimate = estimateStartingMax(exercise, profile);
    if (estimate) {
      return {
        ...base,
        mode: 'start',
        weight: loadFromEstimate(
          estimate.e1rm,
          prescription.reps[1],
          prescription.rir,
          START_FRACTION,
          step,
        ),
        confidence: 'low',
        evidence: [estimate.evidence],
      };
    }
    const hint =
      profile.bodyweight === undefined && startRatio(exercise) !== null
        ? ' Add your bodyweight in Settings for a starting estimate.'
        : '';
    const bar = barWeightFor(exercise, units);
    if (bar !== null) {
      return {
        ...base,
        mode: 'start',
        weight: bar,
        confidence: 'low',
        evidence: [
          `First time logged: start with the empty bar (${bar} ${units}), log what you do, and the next target follows from it.${hint}`,
        ],
      };
    }
    return {
      ...base,
      mode: 'start',
      weight: null,
      confidence: 'low',
      evidence: [
        `First time logged: enter the weight you use and the next target follows from it.${hint}`,
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
    from: weight,
    reference: { recordId: last.recordId, exerciseId: last.exerciseId, clean: clean(last) },
    confidence,
    evidence: [...evidence, line, ...(extra.evidence ?? [])],
  });

  if (last.viaFamily) {
    // A dumbbell per hand is not a barbell: convert the family estimate between load types.
    const source = getExercise(last.exerciseId);
    const familyMax =
      last.e1rm === null
        ? null
        : source
          ? convertEstimate(last.e1rm, source, exercise)
          : { e1rm: last.e1rm, converted: false };
    const estimate =
      familyMax === null
        ? null
        : loadFromEstimate(familyMax.e1rm, prescription.reps[1], prescription.rir, 0.9, step);
    return result(
      'estimate',
      estimate,
      familyMax === null
        ? 'New variation with no load history in its family: log a set and the target follows.'
        : `New variation: 90% of the family estimate (${familyMax.e1rm} ${units} max${familyMax.converted ? `, converted from ${source?.name ?? 'the family lift'}` : ''}) for ${prescription.reps[0]}-${prescription.reps[1]} reps at RIR ${prescription.rir}; log a set and the target follows.`,
    );
  }
  const daysSince = input.now
    ? Math.floor((Date.parse(input.now) - Date.parse((latest ?? last).date)) / DAY_MS)
    : 0;
  const enteredRecord = maxes?.maxes[exercise.id];
  if (
    daysSince >= RETURN_AFTER_DAYS &&
    maxes &&
    enteredRecord &&
    enteredRecord.enteredAt > last.date
  ) {
    const fresh = enteredMaxFor(maxes, exercise.id, units);
    if (fresh !== null) {
      return result(
        'return',
        loadFromEstimate(fresh, prescription.reps[1], prescription.rir, ENTERED_FRACTION, step),
        `${daysSince} days since the last session: starting from the max you entered (${fresh} ${units}) at ${Math.round(ENTERED_FRACTION * 100)}%; log a set and the target follows.`,
      );
    }
  }
  if (daysSince >= RETURN_AFTER_DAYS && last.e1rm !== null) {
    const fraction = daysSince >= LONG_BREAK_DAYS ? 0.85 : 0.9;
    return result(
      'return',
      loadFromEstimate(last.e1rm, prescription.reps[1], prescription.rir, fraction, step),
      `${daysSince} days since the last session: back at ${Math.round(fraction * 100)}% of the estimated max (${last.e1rm} ${units}) and rebuilding from there.`,
    );
  }
  if (newToZone && last.e1rm !== null) {
    const range = last.sets.find((set) => set.targetReps !== null)?.targetReps ?? null;
    return result(
      'estimate',
      loadFromEstimate(last.e1rm, prescription.reps[1], prescription.rir, ZONE_FRACTION, step),
      `${range ? `Last run at ${range[0]}-${range[1]} reps` : 'Last run at a different rep range'}; today is ${prescription.reps[0]}-${prescription.reps[1]}. The weight follows the reps: ${Math.round(ZONE_FRACTION * 100)}% of what your estimated max (${last.e1rm} ${units}) implies for ${prescription.reps[0]}-${prescription.reps[1]} at RIR ${prescription.rir}; log a set and the target follows.`,
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
  /** The empty bar for bar lifts: no ramp goes under it. */
  floor: number | null = null,
): (number | null)[] {
  if (working === null || count <= 0) return Array.from({ length: Math.max(0, count) }, () => null);
  const fractions = count === 1 ? [0.6] : count === 2 ? [0.5, 0.75] : [0.4, 0.6, 0.8];
  const start = floor ?? step;
  // A ramp never sits at the working weight: at least a step under it, never under the bar,
  // and each one heavier than the last.
  const top = Math.max(start, working - step);
  const weights = fractions
    .slice(0, count)
    .map((fraction) => roundToStep(working * fraction, step));
  const last = count - 1;
  weights[last] = Math.min(top, weights[last] as number);
  for (let index = last - 1; index >= 0; index -= 1) {
    weights[index] = Math.min(weights[index] as number, (weights[index + 1] as number) - step);
  }
  weights[0] = Math.max(start, weights[0] as number);
  for (let index = 1; index <= last; index += 1) {
    weights[index] = Math.min(
      top,
      Math.max(weights[index] as number, (weights[index - 1] as number) + step),
    );
  }
  return weights;
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
  /** The empty bar for bar lifts: no ramp, drop, or working load goes under it. */
  floor: number | null = null,
  /** What the place can load: every weight written lands on something that exists there. */
  loading: Loading | null = null,
): SetPrescription[] {
  const warmups = sets.filter((set) => set.kind === 'warmup');
  const ramps = rampWeights(target.weight, warmups.length, step, floor);
  const clamp = (weight: number | null) => {
    if (weight === null) return weight;
    const floored = floor === null ? weight : Math.max(weight, floor);
    return loading ? fitWeight(floored, loading, floor) : floored;
  };
  let rampIndex = 0;
  return sets.map((set) => {
    if (set.kind === 'warmup') {
      const weight = clamp(ramps[rampIndex] ?? null);
      rampIndex += 1;
      return { ...set, targetWeight: manual.weight ? set.targetWeight : weight };
    }
    if (set.kind === 'drop') {
      return {
        ...set,
        targetWeight:
          manual.weight || target.weight === null
            ? set.targetWeight
            : clamp(roundToStep(target.weight * 0.8, step)),
      };
    }
    return {
      ...set,
      targetWeight: manual.weight ? set.targetWeight : clamp(target.weight),
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
    capped: target.capped,
    ...(target.rack ? { rack: target.rack } : {}),
  };
}

const EXTRA_WORDS = ['', 'one extra rep', 'two extra reps', 'three extra reps'] as const;

/**
 * Reps that keep the effort the same at a lighter load: the estimated max stays where it was
 * (Epley). One to three more, and never past twenty.
 */
function extraRepsFor(asked: number, loaded: number, reps: readonly [number, number]): number {
  const middle = (reps[0] + reps[1]) / 2;
  const matched = 30 * (asked / loaded) * (1 + middle / 30) - 30;
  return Math.min(3, Math.max(1, Math.round(matched - middle)), Math.max(0, 20 - reps[1]));
}

function plateNames(plates: readonly number[]): string {
  const names = [...plates].sort((a, b) => a - b).map((plate) => `${plate}s`);
  return names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/**
 * Where the weights here cannot make a load: the one they make under it, the reps that keep
 * the effort, and the line that says so by the target. A plate missing today is named, since
 * that is why. Null when they make it, or when nothing here is that light.
 */
export function rackFit(
  asked: number,
  reps: readonly [number, number],
  loading: Loading,
  units: string,
  /** A hold's seconds stay as they are: only the load comes down. */
  hold = false,
): (RackNote & { missing: boolean }) | null {
  const available = loading.available;
  if (available === null || available.length === 0) return null;
  const loaded = snapDown(asked, available);
  if (loaded >= asked - 1e-6) return null;
  const extra = hold ? 0 : extraRepsFor(asked, loaded, reps);
  const what = hold ? '' : extra === 0 ? 'the reps are already at the top' : EXTRA_WORDS[extra];
  const missingToday = loading.missingToday ?? [];
  const usually = (loading.usual ?? []).some((weight) => Math.abs(weight - asked) < 1e-6);
  if (missingToday.length > 0 && usually && loading.perSide !== null) {
    // Name the plates whose return alone would make it; failing that, all of today's missing.
    const side = (asked - (available[0] as number)) / 2;
    const alone = missingToday.filter(
      (plate) => platesFor(side, [...(loading.perSide ?? []), plate]) !== null,
    );
    return {
      asked,
      loaded,
      extra,
      missing: true,
      line: `No ${plateNames(alone.length > 0 ? alone : missingToday)} today: ${loaded} instead of ${asked}${what ? `, ${what}` : ''}.`,
    };
  }
  const things = loading.perSide !== null ? 'plates' : 'weights';
  return {
    asked,
    loaded,
    extra,
    missing: false,
    line: `The ${things} here make ${loaded}, not ${asked} ${units}${what ? `: ${what}` : ''}.`,
  };
}

/**
 * Holds a target at the heaviest weight the place has and pushes the reps
 * instead, saying so. The next levers, a harder variation and an extra set,
 * are the coach's to offer, never applied here.
 */
export function capTarget(target: NextTarget, loading: Loading | null, units: string): NextTarget {
  return settleHold(fitToPlace(target, loading, units), units);
}

/**
 * A hold at the top of its range starts again from the bottom only for a heavier load. When the
 * weights here cannot go heavier than the load it was held at, it stays at the full seconds.
 */
function settleHold(target: NextTarget, units: string): NextTarget {
  const from = target.from ?? null;
  if (!target.hold || target.mode !== 'weight' || target.weight === null || from === null) {
    return target;
  }
  if (target.weight > from + 1e-6) return target;
  const top = target.reps[1];
  return {
    ...target,
    mode: 'maintain',
    reps: [top, top],
    evidence: [
      `The full ${top} s on every set, and no heavier weight here than ${from} ${units}: ${top} s again.`,
      ...target.evidence.slice(1),
    ],
  };
}

function fitToPlace(target: NextTarget, loading: Loading | null, units: string): NextTarget {
  if (!loading || target.weight === null) return target;
  const [low, high] = target.reps;
  // A hold's seconds are its own target; the load alone answers to the weights here.
  const shift = target.hold ? 0 : Math.min(2, Math.max(0, 20 - high));
  const holdAndPushReps = (weight: number, line: string, capped?: { at: number }): NextTarget => ({
    ...target,
    ...(capped ? { capped } : {}),
    weight,
    reps: [low + shift, high + shift],
    evidence: [...target.evidence, line],
  });
  if (loading.cap !== null && target.weight > loading.cap + 1e-6) {
    return holdAndPushReps(
      loading.cap,
      target.hold
        ? `Held at the heaviest weight here (${loading.cap} ${units}).`
        : `Held at the heaviest weight here (${loading.cap} ${units}): the reps go up instead${
            shift === 0 ? ', and they are already at the top' : ''
          }.`,
      { at: loading.cap },
    );
  }
  const fit = rackFit(target.weight, target.reps, loading, units, target.hold === true);
  if (!fit) return target;
  const { missing, ...note } = fit;
  // A step the place cannot make: snapped onto the weights here, the target would land on or
  // under the weight it moved from. The load holds there and the reps go up until the next
  // real weight is earned, rather than the increase being rounded away in silence. A plate
  // missing today says so instead: that is the reason, not the step.
  const from = target.from ?? null;
  const next = loading.available?.find((weight) => from !== null && weight > from + 1e-6);
  if (!missing && from !== null && target.weight > from + 1e-6 && fit.loaded <= from + 1e-6) {
    // A hold has no reps to earn the step with: it takes the next real weight, from the bottom.
    if (next !== undefined && target.hold) {
      return {
        ...target,
        weight: next,
        evidence: [
          ...target.evidence,
          `The next weight here after ${from} ${units} is ${next}: ${next} ${units}, from ${low} s.`,
        ],
      };
    }
    if (next !== undefined) {
      const line = `The next weight here after ${from} ${units} is ${next}: the reps go up first, and the load follows once they are earned.`;
      return {
        ...holdAndPushReps(fit.loaded, line),
        rack: { asked: target.weight, loaded: fit.loaded, extra: shift, line },
      };
    }
  }
  // Otherwise the load comes down to what the weights here make, and the reps keep the effort.
  return {
    ...target,
    weight: fit.loaded,
    reps: [low + fit.extra, high + fit.extra],
    evidence: [...target.evidence, fit.line],
    rack: note,
  };
}
