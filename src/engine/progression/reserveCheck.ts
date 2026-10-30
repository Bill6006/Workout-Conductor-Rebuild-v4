import { getExercise } from '../../catalog/exercises/catalog';
import { isHold, type CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { localWeekKey } from '../../core/time/localDate';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allowsFailure, resolveStyle } from '../planning/styleAdvice';
import type { WorkoutBlock, WorkoutEntry } from '../workout/types';

/**
 * How well the lifter judges reps in reserve (Maintenance 27, the owner's item 43,
 * docs/research/reserve-check.md). Opt-in: now and then the last set of one machine or cable
 * isolation lift goes on past the lifter's usual stop to a rep that stalls. The reps left at the
 * stop, against the reserve the lifter judged there, are a reading of their error; a few readings
 * give their typical error, and the rules that read logged reserve read it through that error.
 */

const DAY_MS = 86_400_000;

export const RESERVE_CHECK = {
  /**
   * Lifters judge about one rep fewer than they have left (0.95 reps, 95% CI 0.17 to 1.73;
   * Halperin et al., 2022, Sports Medicine, PMID 34542869): where an estimate starts.
   */
  POPULATION_UNDER: 0.95,
  /**
   * The spread of one judgement around the truth is about 1.45 reps (Halperin 2022), and it mixes
   * a lifter's own lean with set-to-set noise; no study separates the two. Splitting it evenly
   * (1.0 and 1.0, about 1.41 together) is a modelling choice the simulation checks.
   */
  PERSON_SD: 1.0,
  READING_SD: 1.0,
  /** Four readings narrow an estimate to about half a rep (1 / sqrt(5) = 0.45). */
  USABLE_READINGS: 4,
  /** Weekly until five readings (practice narrows the error: Wiedenmann et al., 2026). */
  LEARNING_READINGS: 5,
  /** Then one every four weeks: the research suggests four to six; four keeps item 41's data fresh. */
  KEEP_DAYS: 28,
  /** Six weeks with no reading start the learning again. */
  RESTART_DAYS: 42,
  /**
   * A check only where the set's planned stop is near enough to failure: the bottom of its range
   * plus its reserve at most 13 reps (the error grows by about 0.47 reps a rep past 12 to failure;
   * Halperin 2022).
   */
  ELIGIBLE_BAND: 13,
  /** A reading past 20 reps in all says little: about 60% of a max (Nuzzo et al., 2024). */
  MAX_TOTAL: 20,
  /** A reading is never moved by more than two reps, however lopsided the readings. */
  MAX_CORRECTION: 2,
  /**
   * The latest eight readings make the estimate: practice narrows a lifter's error over weeks
   * (Wiedenmann et al., 2026; Hermann et al., 2025), so the newest say most.
   */
  LATEST_READINGS: 8,
  /** Readings scattered wider than two reps say no single error: nothing is read through them. */
  MAX_SCATTER: 2,
  /** The first session back after three weeks or more takes no check (the app's own break rule). */
  RETURN_DAYS: 21,
} as const;

/** Roles a set to failure does not suit: a corrective or warm-up move is about quality. */
const NOT_FOR_CHECKS: ReadonlySet<string> = new Set(['corrective', 'warm-up']);

/**
 * A lift a set to failure suits: one joint, on a machine or a cable stack, counted in reps. No
 * free weights (most weight-room injuries seen in emergency rooms involve free weights, often a
 * dropped one: Kerr et al., 2010, PMID 20139328) and no multi-joint lift.
 */
export function suitsReserveCheck(exercise: CatalogExercise | undefined): boolean {
  return Boolean(
    exercise &&
    !exercise.compound &&
    exercise.load === 'stack' &&
    (exercise.station === 'machine' || exercise.station === 'cable') &&
    !isHold(exercise) &&
    !NOT_FOR_CHECKS.has(exercise.defaultRole),
  );
}

/** One set taken on to failure, as the log keeps it. */
export interface ReserveReading {
  exerciseId: string;
  recordId: string;
  at: string;
  weight: number | null;
  /** Reps at the lifter's usual stop: the set's own logged reps. */
  stop: number;
  /** The reserve they judged at the stop. */
  judged: number | null;
  /** Reps in all, to the rep that stalled. */
  total: number;
  /** The lifter stalled before their usual stop: reps to failure, but no judgement to check. */
  failedEarly: boolean;
  /** Stopped for pain or form: not a set to failure at all. */
  stopped: boolean;
  /** The style the plan ran under when it was taken. */
  style: string | null;
}

/** The readings in the log, oldest first. */
export function reserveReadings(history: readonly WorkoutRecord[]): ReserveReading[] {
  const readings: ReserveReading[] = [];
  for (const record of history) {
    for (const entry of record.entries) {
      for (const set of entry.sets) {
        const check = set.reserveCheck;
        if (!check || set.kind !== 'working' || !set.completed) continue;
        readings.push({
          exerciseId: entry.exerciseId,
          recordId: record.id,
          at: set.loggedAt ?? record.completedAt ?? record.startedAt,
          weight: set.weight,
          stop: set.reps,
          judged: set.rir,
          total: check.total,
          failedEarly: check.failedEarly === true,
          stopped: check.stopped === true,
          style: check.style ?? null,
        });
      }
    }
  }
  return readings.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * The reps the lifter had left at their stop, less the reserve they judged: positive when they had
 * more left than they thought. Null for a reading that cannot say.
 */
export function readingError(reading: ReserveReading): number | null {
  if (reading.failedEarly || reading.stopped || reading.judged === null) return null;
  if (!suitsReserveCheck(getExercise(reading.exerciseId))) return null;
  if (reading.total < reading.stop || reading.total > RESERVE_CHECK.MAX_TOTAL) return null;
  return reading.total - reading.stop - reading.judged;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS;
}

/**
 * The readings that make the present estimate: those after the last reset, under the style the
 * plan runs now, and since the last gap of six weeks without one. Nothing when the last reading is
 * six weeks old.
 */
export function currentRun(
  readings: readonly ReserveReading[],
  options: { now: string; style: string; resetAt?: string | null },
): ReserveReading[] {
  let start = 0;
  readings.forEach((reading, index) => {
    const before = options.resetAt && Date.parse(reading.at) < Date.parse(options.resetAt);
    const otherStyle = reading.style !== null && reading.style !== options.style;
    if (before || otherStyle) {
      start = index + 1;
      return;
    }
    const previous = readings[index - 1];
    if (
      index > start &&
      previous &&
      daysBetween(previous.at, reading.at) >= RESERVE_CHECK.RESTART_DAYS
    ) {
      start = index;
    }
  });
  const run = readings.slice(start);
  const last = run[run.length - 1];
  if (last && daysBetween(last.at, options.now) >= RESERVE_CHECK.RESTART_DAYS) return [];
  return run;
}

export interface ReserveEstimate {
  /** Readings that count. */
  readings: number;
  /** How widely they scatter (a sample standard deviation), with two or more. */
  scatter: number | null;
  /** Their plain average error, when there are any. */
  mean: number | null;
  /** The estimate: reps more left than judged, drawn toward the population's 0.95. */
  bias: number;
  /** How far the estimate could be off (one standard deviation). */
  sd: number;
  /** Enough readings to act on. */
  usable: boolean;
  /** Whole reps added to a logged reserve the estimate covers; 0 until usable. */
  correction: number;
  /**
   * The sets it speaks for: the reps in all the lifter believed its readings had (the reps at the
   * stop plus the reserve judged there), widened by one. A logged set is matched the same way, by
   * its reps plus its logged reserve, the only total any set carries.
   */
  band: [number, number] | null;
}

/** The lifter's typical error from a run of readings (a normal model, drawn to the population). */
export function reserveEstimate(run: readonly ReserveReading[]): ReserveEstimate {
  const counted = run
    .map((reading) => ({ reading, error: readingError(reading) }))
    .filter((item): item is { reading: ReserveReading; error: number } => item.error !== null)
    .slice(-RESERVE_CHECK.LATEST_READINGS);
  const n = counted.length;
  const sum = counted.reduce((total, item) => total + item.error, 0);
  const scatter =
    n >= 2
      ? Math.sqrt(counted.reduce((total, item) => total + (item.error - sum / n) ** 2, 0) / (n - 1))
      : null;
  const priorPrecision = 1 / RESERVE_CHECK.PERSON_SD ** 2;
  const readingPrecision = 1 / RESERVE_CHECK.READING_SD ** 2;
  const precision = priorPrecision + n * readingPrecision;
  const bias =
    (RESERVE_CHECK.POPULATION_UNDER * priorPrecision + sum * readingPrecision) / precision;
  const usable =
    n >= RESERVE_CHECK.USABLE_READINGS &&
    (scatter === null || scatter <= RESERVE_CHECK.MAX_SCATTER);
  const whole = Math.sign(bias) * Math.round(Math.abs(bias));
  const correction = usable
    ? Math.max(-RESERVE_CHECK.MAX_CORRECTION, Math.min(RESERVE_CHECK.MAX_CORRECTION, whole)) || 0
    : 0;
  const believed = counted.map((item) => item.reading.stop + (item.reading.judged ?? 0));
  return {
    readings: n,
    scatter,
    mean: n > 0 ? sum / n : null,
    bias,
    sd: 1 / Math.sqrt(precision),
    usable,
    correction,
    band: n > 0 ? [Math.min(...believed) - 1, Math.max(...believed) + 1] : null,
  };
}

export type ReserveCheckPhase = 'learning' | 'keeping';

export interface ReserveCheckStatus {
  /** The lifter opted in and the plan's style takes sets to failure. */
  on: boolean;
  phase: ReserveCheckPhase;
  /** A check is due in the next session that has a place for one. */
  due: boolean;
  estimate: ReserveEstimate;
  /** The latest check taken, counted or not. */
  lastAt: string | null;
}

/** Where the checks stand for a lifter now. */
export function reserveCheckStatus(input: {
  history: readonly WorkoutRecord[];
  profile: Pick<UserProfile, 'programStyle' | 'trainingStyle' | 'goals' | 'experience'> & {
    reserveCheck?: boolean;
  };
  now: string;
  resetAt?: string | null;
}): ReserveCheckStatus {
  const style = resolveStyle(input.profile);
  const on = input.profile.reserveCheck === true && allowsFailure(style);
  const readings = reserveReadings(input.history);
  const run = currentRun(readings, { now: input.now, style, resetAt: input.resetAt ?? null });
  const estimate = reserveEstimate(run);
  const phase: ReserveCheckPhase =
    estimate.readings < RESERVE_CHECK.LEARNING_READINGS ? 'learning' : 'keeping';
  const last = readings[readings.length - 1] ?? null;
  const lastAt = last?.at ?? null;
  const spaced =
    lastAt === null
      ? true
      : phase === 'learning'
        ? localWeekKey(lastAt) !== localWeekKey(input.now)
        : daysBetween(lastAt, input.now) >= RESERVE_CHECK.KEEP_DAYS;
  return { on, phase, due: on && spaced, estimate, lastAt };
}

/** The set a check goes on. */
export interface ReserveCheckSet {
  entryId: string;
  setIndex: number;
  exerciseId: string;
}

/** The last working set of an entry, the one a check takes. */
function lastWorking(entry: WorkoutEntry) {
  const working = entry.sets.filter((set) => set.kind === 'working');
  return working[working.length - 1];
}

/** Whether a lift in today's plan can take today's check. */
export function takesReserveCheck(entry: WorkoutEntry): boolean {
  const exercise = getExercise(entry.exerciseId);
  if (!suitsReserveCheck(exercise) || NOT_FOR_CHECKS.has(entry.role)) return false;
  const last = lastWorking(entry);
  return Boolean(last && last.targetReps[0] + last.targetRir <= RESERVE_CHECK.ELIGIBLE_BAND);
}

/**
 * The set today's check goes on, or none: a check due, a day fit for it (no deload, no low or sore
 * check-in, no hard start, not the first session back after a break), and a lift that takes one.
 * Among those, a lift whose next reading would pair with a recent one far enough apart for its own
 * curve (item 41) first; else the lift done most often lately, so one lift gathers the readings;
 * else the first in the plan.
 */
export function reserveCheckSet(input: {
  blocks: readonly WorkoutBlock[];
  history: readonly WorkoutRecord[];
  status: ReserveCheckStatus;
  now: string;
  /**
   * The day's own state: a deload, a low check-in, a hard start, or a day off the plan (a catch-up or
   * a second workout, where no set goes to failure: the twenty-first review of round M).
   */
  day: { deload: boolean; lowCheckIn: boolean; hardStart: boolean; offPlan?: boolean };
  /** Whether a reading on a lift today would complete a pair for its curve (item 41). */
  pairs?: (exerciseId: string, entry: WorkoutEntry) => boolean;
}): ReserveCheckSet | null {
  if (!input.status.due) return null;
  if (input.day.deload || input.day.lowCheckIn || input.day.hardStart || input.day.offPlan) {
    return null;
  }
  const latest = input.history.reduce<string | null>((newest, record) => {
    const at = record.completedAt ?? record.startedAt;
    return newest === null || Date.parse(at) > Date.parse(newest) ? at : newest;
  }, null);
  if (latest !== null && daysBetween(latest, input.now) >= RESERVE_CHECK.RETURN_DAYS) return null;
  // A straight set or a superset's: a circuit runs on with short rests, where a set to failure
  // would hold up the round.
  const candidates = input.blocks
    .filter((block) => block.kind !== 'circuit')
    .flatMap((block) => block.entries)
    .filter(takesReserveCheck);
  if (candidates.length === 0) return null;
  // Sessions in the last twelve weeks that logged the lift.
  const regular = (exerciseId: string) =>
    input.history.filter(
      (record) =>
        daysBetween(record.completedAt ?? record.startedAt, input.now) <= 84 &&
        record.entries.some(
          (logged) =>
            logged.exerciseId === exerciseId &&
            logged.sets.some((set) => set.kind === 'working' && set.completed),
        ),
    ).length;
  const paired = input.pairs
    ? candidates.find((entry) => input.pairs?.(entry.exerciseId, entry))
    : undefined;
  const chosen =
    paired ??
    candidates.reduce((best, entry) =>
      regular(entry.exerciseId) > regular(best.exerciseId) ? entry : best,
    );
  const set = lastWorking(chosen);
  return set ? { entryId: chosen.id, setIndex: set.index, exerciseId: chosen.exerciseId } : null;
}

/**
 * The reserve the rules read for a logged set: as logged, or with the lifter's typical error added
 * where the estimate covers the set (a lift like the ones checked, in the reps its readings span).
 */
export function readReserve(
  exercise: CatalogExercise | undefined,
  reps: number,
  rir: number | null,
  estimate: Pick<ReserveEstimate, 'correction' | 'band'> | null,
): number | null {
  if (rir === null || !estimate || estimate.correction === 0 || !estimate.band) return rir;
  if (!suitsReserveCheck(exercise)) return rir;
  const total = reps + rir;
  if (total < estimate.band[0] || total > estimate.band[1]) return rir;
  return Math.max(0, Math.min(10, rir + estimate.correction));
}

/**
 * The reserve a check set measured at its stop (the review of item 43): none where it stalled
 * before the stop (its reps are its reps in all), the reps past the stop for one taken to failure.
 * Null for one stopped for pain or form, or numbers that cannot be a reading.
 */
export function measuredReserve(set: {
  reps: number;
  reserveCheck?: { total: number; failedEarly?: boolean; stopped?: boolean };
}): number | null {
  const check = set.reserveCheck;
  if (!check || check.stopped) return null;
  if (check.failedEarly) return 0;
  if (check.total < set.reps || check.total > RESERVE_CHECK.MAX_TOTAL) return null;
  return Math.min(10, check.total - set.reps);
}

/**
 * The log as the rules read it: every logged reserve the estimate covers read through it, and a
 * check set's own reserve as it measured it. A view for the engines only, each changed set keeping
 * what was logged beside it (`loggedRir`); the log itself, its exports and its copies keep what was
 * logged.
 */
export function withReadReserve(
  history: readonly WorkoutRecord[],
  estimate: Pick<ReserveEstimate, 'correction' | 'band'> | null,
): readonly WorkoutRecord[] {
  // A check set's own reserve is a measurement, read whatever the estimate (the re-check of item
  // 43); the error is read in only where an estimate is in force.
  let any = false;
  const read = history.map((record) => {
    let changed = false;
    const entries = record.entries.map((entry) => {
      const exercise = getExercise(entry.exerciseId);
      if (!suitsReserveCheck(exercise)) return entry;
      const sets = entry.sets.map((set) => {
        if (set.kind !== 'working') return set;
        const rir =
          measuredReserve(set) ??
          (estimate ? readReserve(exercise, set.reps, set.rir, estimate) : set.rir);
        if (rir === set.rir) return set;
        changed = true;
        return { ...set, rir, loggedRir: set.rir };
      });
      return sets.some((set, index) => set !== entry.sets[index]) ? { ...entry, sets } : entry;
    });
    if (changed) any = true;
    return changed ? { ...record, entries } : record;
  });
  return any ? read : history;
}

/**
 * What was logged for a set's reserve, where the rules read it as something else (the review of
 * item 43): the read log keeps it beside the reserve it reads.
 */
export function loggedReserveOf(set: { rir: number | null }): number | null {
  const read = set as { rir: number | null; loggedRir?: number | null };
  return read.loggedRir !== undefined ? read.loggedRir : read.rir;
}

/** What a reading said, in a line: the reps left at the stop against the reserve judged there. */
export function readingLine(
  reading: Pick<ReserveReading, 'stop' | 'judged' | 'total' | 'failedEarly' | 'stopped'>,
): string {
  if (reading.stopped) return 'Stopped before failure: this check counts for nothing.';
  if (reading.failedEarly || reading.judged === null) {
    return `${reading.total} reps to failure, before your usual stop: no judgement to check this time.`;
  }
  // The numbers a reading cannot use are said to count for nothing, never read out (the review).
  if (reading.total > RESERVE_CHECK.MAX_TOTAL) {
    return `${reading.total} reps in all, past ${RESERVE_CHECK.MAX_TOTAL}: a set that long says little about judging reserve, so this check counts for nothing.`;
  }
  if (reading.total < reading.stop) {
    return 'Fewer reps in all than at your stop: this check counts for nothing.';
  }
  const left = reading.total - reading.stop;
  const off = left - reading.judged;
  const judged = `You judged ${reading.judged} left at ${reading.stop} and did ${reading.total} in all`;
  if (off === 0) return `${judged}: exactly right.`;
  const reps = Math.abs(off) === 1 ? 'rep' : 'reps';
  const were = `${left} ${left === 1 ? 'was' : 'were'} left`;
  return off > 0
    ? `${judged}: ${were}, ${off} ${reps} more than you judged.`
    : `${judged}: ${were}, ${-off} ${reps} fewer than you judged.`;
}
