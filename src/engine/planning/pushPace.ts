import { addLocalDays, startOfLocalDay } from '../../core/time/localDate';
import type { UnitSystem } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { convertWeight, maxFromSet } from '../progression/maxes';
import { SHORT_BY_REPS, shortBy } from '../progression/shortfall';
import type { PushLift } from './pushLift';

/**
 * The pace toward a pushed lift's target (Maintenance 27, the owner's item 44,
 * docs/research/push-lift.md). Every number is the research doc's:
 *
 * - Each session's first working set of the lift, up to twelve reps with a logged reserve of three
 *   or less, read as a max: weight × (1 + (reps + reserve) / 30), the capacity a hard start reads
 *   (`bad-start.md`).
 * - A least-squares line through the logarithms of those maxes over the push, with an offset for
 *   each rep range, since people's reps-to-weight curves differ (Nuzzo et al. 2024); a reading more
 *   than three spreads off the line is set aside and the line fitted again.
 * - Its band is the lifter's own scatter about it, never a fixed figure. A logged max carries about
 *   5% noise (the 1RM's day-to-day 4.2%, Grgic et al. 2020, with misjudged reserve), so a pace needs
 *   weeks: shown after six weeks and ten readings, and then once its band is narrower than the pace
 *   itself or twelve weeks have passed.
 * - Projected no further than twelve weeks, the horizon of almost all the evidence; gains slow with
 *   time and strength (Steele et al. 2023; Latella et al. 2020), so past it the card says so.
 */
export const PUSH_PACE = {
  MAX_READ_REPS: 12,
  MAX_READ_RIR: 3,
  SHOW_WEEKS: 6,
  SHOW_READINGS: 10,
  CLEAR_WEEKS: 12,
  PROJECT_WEEKS: 12,
  /** A reading this many spreads off the line is set aside. */
  OUTLIER_SPREADS: 3,
  /**
   * A logged max's own noise, about 5% (the 1RM's day-to-day 4.2%, Grgic et al. 2020, with
   * misjudged reserve): the least spread a reading is judged against, so a lift logged the same
   * every session does not make its first real step look like a slip (the re-check of item 44).
   */
  READING_NOISE: 0.05,
  /** The review the coach offers, and the pace a stall is read from. */
  REVIEW_WEEKS: 12,
  STALL_WEEKS: 6,
  /**
   * A week's gain past which a target date is ambitious for a lifter without a pace of their own:
   * trained lifters gained about 5 to 16% in 8 to 12 week trials (about 0.5 to 1.5% a week), and
   * new lifters about 2% a week early on (Abe et al. 2000; Johnsen et al. 2021; Refsnes et al.
   * 2025). Group means with very wide spreads, never a limit.
   */
  AMBITIOUS_WEEKLY: 0.015,
  AMBITIOUS_WEEKLY_NEW: 0.02,
} as const;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** Below this, a log-max's slope or spread is the arithmetic's rounding. */
const ROUNDING = 1e-9;

/** What makes a reading, as the cards say it. */
export const READING_RULE = `its first working set each session, at ${PUSH_PACE.MAX_READ_REPS} reps or fewer with ${PUSH_PACE.MAX_READ_RIR} or fewer in reserve`;

/** One session's reading: when, the max its first working set reads, and its rep range. */
export interface PaceReading {
  at: string;
  e1rm: number;
  range: string;
}

const whenOf = (record: WorkoutRecord) => record.completedAt ?? record.startedAt;

/**
 * The readings since the push began: each session's first completed working set of the lift, read
 * as a max in the lifter's units, while it is a clean reading (`MAX_READ_REPS`, `MAX_READ_RIR`).
 */
/** Sessions with a completed working set of the lift since the push began. */
export function sessionsSince(
  history: readonly WorkoutRecord[],
  exerciseId: string,
  since: string,
): number {
  const from = Date.parse(since);
  return history.filter(
    (record) =>
      Date.parse(whenOf(record)) >= from &&
      record.entries.some(
        (entry) =>
          entry.exerciseId === exerciseId &&
          entry.sets.some((set) => set.kind === 'working' && set.completed),
      ),
  ).length;
}

export function paceReadings(
  history: readonly WorkoutRecord[],
  exerciseId: string,
  since: string,
): PaceReading[] {
  const from = Date.parse(since);
  const out: PaceReading[] = [];
  for (const record of history) {
    if (Date.parse(whenOf(record)) < from) continue;
    const set = record.entries
      .filter((entry) => entry.exerciseId === exerciseId)
      .flatMap((entry) => entry.sets)
      .find((candidate) => candidate.kind === 'working' && candidate.completed);
    if (!set || set.weight === null || set.weight <= 0 || set.rir === null) continue;
    if (set.reps < 1 || set.reps > PUSH_PACE.MAX_READ_REPS || set.rir > PUSH_PACE.MAX_READ_RIR) {
      continue;
    }
    out.push({
      at: whenOf(record),
      e1rm: maxFromSet(set.weight, set.reps + set.rir),
      range: set.targetReps ? `${set.targetReps[0]}-${set.targetReps[1]}` : 'any',
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** A 97.5% point of Student's t, for a band of 95% either side. */
function tQuantile(df: number): number {
  const table = [12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23];
  if (df < 1) return Infinity;
  if (df <= table.length) return table[df - 1] as number;
  return 1.96 + 2.4 / df;
}

/** The line through the readings: a week's change in the log of the max, and its spread. */
interface Fit {
  slope: number;
  se: number;
  df: number;
  spread: number;
  intercepts: Map<string, number>;
  used: PaceReading[];
}

function fitLine(readings: readonly PaceReading[], since: number): Fit | null {
  const groups = new Map<string, PaceReading[]>();
  for (const reading of readings) {
    groups.set(reading.range, [...(groups.get(reading.range) ?? []), reading]);
  }
  const x = (reading: PaceReading) => (Date.parse(reading.at) - since) / WEEK_MS;
  const y = (reading: PaceReading) => Math.log(reading.e1rm);
  let sxx = 0;
  let sxy = 0;
  const means = new Map<string, { x: number; y: number }>();
  for (const [range, members] of groups) {
    const mx = members.reduce((sum, one) => sum + x(one), 0) / members.length;
    const my = members.reduce((sum, one) => sum + y(one), 0) / members.length;
    means.set(range, { x: mx, y: my });
    for (const one of members) {
      sxx += (x(one) - mx) ** 2;
      sxy += (x(one) - mx) * (y(one) - my);
    }
  }
  const df = readings.length - groups.size - 1;
  if (sxx <= 0 || df < 1) return null;
  // Rounding in the sums is no pace: readings logged the same every session fit a flat line
  // exactly (the re-check of item 44: a band topping out at 2e-16 never read as flat).
  const slope = Math.abs(sxy / sxx) < ROUNDING ? 0 : sxy / sxx;
  const intercepts = new Map(
    [...means].map(([range, mean]) => [range, mean.y - slope * mean.x] as const),
  );
  const residual = (one: PaceReading) =>
    y(one) - ((intercepts.get(one.range) ?? 0) + slope * x(one));
  const sse = readings.reduce((sum, one) => sum + residual(one) ** 2, 0);
  const spread = Math.sqrt(sse / df) < ROUNDING ? 0 : Math.sqrt(sse / df);
  return { slope, se: spread / Math.sqrt(sxx), df, spread, intercepts, used: [...readings] };
}

/** Where the push stands. */
export type PaceState =
  /** Nothing read yet. */
  | { kind: 'none' }
  /** Readings, but too few or too short for a pace to mean anything yet. */
  | {
      kind: 'baseline';
      readings: number;
      sessionsToGo: number;
      weeksToGo: number;
      current: number | null;
    }
  /** A pace, its band, and where it leads. */
  | {
      kind: 'pace';
      readings: number;
      /** The week's change, as a share: 0.01 is 1% a week. */
      weekly: number;
      low: number;
      high: number;
      /** The max the line reads now, in the lifter's units. */
      current: number;
      projection: Projection;
    };

/** Where a pace leads: the target reached, the weeks it needs and their range, or not by then. */
export type Projection =
  | { kind: 'reached' }
  /** Within the evidence's horizon: about `weeks`, likely `earliest` to `latest` (null: open). */
  | { kind: 'within'; weeks: number; earliest: number; latest: number | null }
  /** Further than the horizon: gains usually slow, so no date is given. */
  | { kind: 'beyond'; earliest: number | null }
  /** The pace is flat or falling. */
  | { kind: 'flat' };

/** The target in the lifter's units. */
export function targetIn(push: PushLift, units: UnitSystem): number {
  return convertWeight(push.target, push.units, units);
}

/**
 * The pace of a push from its readings, in the lifter's units (readings are in the units the sets
 * were logged in, which are the lifter's).
 */
export function pushPace(input: {
  readings: readonly PaceReading[];
  since: string;
  now: string;
  target: number;
}): PaceState {
  const { readings, target } = input;
  if (readings.length === 0) return { kind: 'none' };
  const since = Date.parse(input.since);
  // Never under none: a clock read up to a minute before the push was set is its start.
  const weeks = Math.max(0, (Date.parse(input.now) - since) / WEEK_MS);
  let fit = fitLine(readings, since);
  // A reading far off the line (a slip in the log, a bad day) is set aside, and the line fitted
  // again; one reading, one pass. The one furthest off is judged against the line and the spread
  // fitted without it: a reading inside the spread it is judged by can hide itself (the review of
  // item 44).
  if (fit && readings.length > 4) {
    const line = fit;
    const off = (on: Fit, one: PaceReading) =>
      Math.abs(
        Math.log(one.e1rm) -
          ((on.intercepts.get(one.range) ?? 0) +
            on.slope * ((Date.parse(one.at) - since) / WEEK_MS)),
      );
    const worst = [...line.used].sort((a, b) => off(line, b) - off(line, a))[0];
    const without = worst
      ? fitLine(
          readings.filter((one) => one !== worst),
          since,
        )
      : null;
    if (
      worst &&
      without &&
      without.intercepts.has(worst.range) &&
      off(without, worst) >
        PUSH_PACE.OUTLIER_SPREADS * Math.max(without.spread, Math.log(1 + PUSH_PACE.READING_NOISE))
    ) {
      fit = without;
    }
  }
  const latest = readings.at(-1) as PaceReading;
  const nowX = weeks;
  const current = fit
    ? Math.exp((fit.intercepts.get(latest.range) ?? Math.log(latest.e1rm)) + fit.slope * nowX)
    : latest.e1rm;
  const half = fit ? tQuantile(fit.df) * fit.se : Infinity;
  const enough = weeks >= PUSH_PACE.SHOW_WEEKS && readings.length >= PUSH_PACE.SHOW_READINGS;
  // A line the readings fit exactly is as clear as a line gets, flat or not (the re-check).
  const clear =
    fit !== null && (half < Math.abs(fit.slope) || half === 0 || weeks >= PUSH_PACE.CLEAR_WEEKS);
  if (!fit || !enough || !clear) {
    return {
      kind: 'baseline',
      readings: readings.length,
      sessionsToGo: Math.max(0, PUSH_PACE.SHOW_READINGS - readings.length),
      weeksToGo: Math.max(0, Math.ceil(PUSH_PACE.SHOW_WEEKS - weeks)),
      current: Math.round(current),
    };
  }
  const weekly = Math.exp(fit.slope) - 1;
  const low = Math.exp(fit.slope - half) - 1;
  const high = Math.exp(fit.slope + half) - 1;
  return {
    kind: 'pace',
    readings: readings.length,
    weekly,
    low,
    high,
    current,
    projection: project(current, target, fit.slope, fit.slope - half, fit.slope + half),
  };
}

function project(
  current: number,
  target: number,
  slope: number,
  low: number,
  high: number,
): Projection {
  if (current >= target) return { kind: 'reached' };
  const gap = Math.log(target / current);
  if (slope <= 0) return { kind: 'flat' };
  const weeks = gap / slope;
  const earliest = high > 0 ? gap / high : null;
  if (weeks > PUSH_PACE.PROJECT_WEEKS) return { kind: 'beyond', earliest };
  return {
    kind: 'within',
    weeks,
    earliest: earliest ?? weeks,
    latest: low > 0 ? gap / low : null,
  };
}

/**
 * A target date against the pace: the week's gain it needs, and whether the pace's band reaches
 * it. Without a pace yet, against what lifters at the stage gain (`AMBITIOUS_WEEKLY`).
 */
export function dateCheck(input: {
  state: PaceState;
  target: number;
  by: string;
  now: string;
  current: number | null;
  newLifter: boolean;
}): { needed: number; likely: boolean | null; ambitious: boolean } | null {
  // The day set is the lifter's whole day: it passes as that day ends on the device (the review
  // of Maintenance 28, item 1; it is kept as its noon).
  const ends = Date.parse(startOfLocalDay(addLocalDays(input.by, 1)));
  const weeks = (ends - Date.parse(input.now)) / WEEK_MS;
  const current = input.current;
  if (current === null || current <= 0 || weeks <= 0) return null;
  if (current >= input.target) return { needed: 0, likely: true, ambitious: false };
  const needed = Math.exp(Math.log(input.target / current) / weeks) - 1;
  const ambitious =
    needed > (input.newLifter ? PUSH_PACE.AMBITIOUS_WEEKLY_NEW : PUSH_PACE.AMBITIOUS_WEEKLY);
  const likely = input.state.kind === 'pace' ? needed <= input.state.high : null;
  return { needed, likely, ambitious };
}

/**
 * The lift fell well short on its first working set in each of its last two sessions since the push
 * began: the hard start's reading (`shortfall.ts`) twice running, the one marker of overreaching
 * the evidence trusts (a sustained fall in performance, Grandou et al. 2020). The latest of the two,
 * so each such run is its own; null when not (sessions before the push say nothing of it: the
 * review of item 44).
 */
export function shortTwiceRunning(
  history: readonly WorkoutRecord[],
  exerciseId: string,
  since: string | null = null,
): string | null {
  const sessions = [...history]
    .filter((record) => record.entries.some((entry) => entry.exerciseId === exerciseId))
    .filter((record) => since === null || Date.parse(whenOf(record)) >= Date.parse(since))
    .sort((a, b) => whenOf(b).localeCompare(whenOf(a)))
    .slice(0, 2);
  if (sessions.length < 2) return null;
  const short = sessions.every((record) => {
    const set = record.entries
      .filter((entry) => entry.exerciseId === exerciseId)
      .flatMap((entry) => entry.sets)
      .find((candidate) => candidate.kind === 'working' && candidate.completed);
    if (!set?.targetReps || set.rir === null || set.targetRir === undefined) return false;
    return shortBy(set.targetReps[0], set.targetRir, set.reps, set.rir) >= SHORT_BY_REPS;
  });
  return short ? whenOf(sessions[0] as WorkoutRecord) : null;
}
