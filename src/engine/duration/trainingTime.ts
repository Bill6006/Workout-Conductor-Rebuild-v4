import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { WorkoutBlock } from '../workout/types';
import { estimateSeconds } from './duration';

/**
 * A workout's training time and the lifter's own pace (Maintenance 28, the owner's items 3 and 4).
 *
 * Training time is read off the log times of the sets done, never off how long a workout stayed
 * open: the run up to the first set (the general warm-up, getting set up and the set) and each wait
 * between two sets, each counted only as far as training takes it. Training ends with the last set,
 * as the plan's own estimate does; a skip takes no time. A workout left open for a day counts its
 * sets, not the day. It is never more than the workout's own clock, which already leaves pauses out.
 * Old workouts are read the same way: every set has kept its log time since Phase 5; one with no
 * set time at all (an import) keeps its clock.
 *
 * The pace is the lifter's training time against the plan's own estimate of the sets they did,
 * workout by workout: the median of the latest eight, from three on. Plans are then fitted to it,
 * so a 45-minute plan takes this lifter about 45 minutes. These are measurement rules, not training
 * ones: the pace changes how much fits in a length, while the rests, weights and reps stay as the
 * length sets them (the review of item 4: rests cut for a pace were the ones its reading was read
 * against).
 */
export const TRAINING_TIME = {
  /** Up to the first set: the general warm-up (at most five minutes), getting set up and the set. */
  FIRST_SET_MINUTES: 10,
  /**
   * Between two sets: the longest rest a plan sets (three minutes under the long rest style, three
   * and a half with the coach's added half minute), the set itself and the walk to the next lift.
   * A longer wait is time away, not training.
   */
  GAP_MINUTES: 10,
  /**
   * Sets logged this close one after another were logged at one go, after they were done: the wait
   * before them held them all, so it counts as far as each of them takes it (the review of item 3:
   * a lifter logging an exercise at a time read as fast).
   */
  ONE_GO_SECONDS: 60,
} as const;

const MINUTE_MS = 60_000;

type Timed = Pick<WorkoutRecord, 'startedAt' | 'completedAt' | 'elapsedSeconds' | 'entries'> & {
  trainingSeconds?: number;
};

/** A workout's training time in seconds, measured from the log times of its sets done. */
export function measureTrainingSeconds(record: Timed): number {
  const times = record.entries
    .flatMap((entry) => entry.sets)
    // A skip is a tap, not training (the review of item 3: one made hours on counted a wait).
    .filter((set) => set.completed)
    .map((set) => (set.loggedAt ? Date.parse(set.loggedAt) : Number.NaN))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const clock = record.elapsedSeconds ?? null;
  // No set with a time (a workout imported from elsewhere): nothing to measure the waits by, so
  // the workout's own clock stands.
  if (times.length === 0) return clock === null ? 0 : Math.round(clock);
  const start = Date.parse(record.startedAt);
  let total = 0;
  let before: number | null = Number.isFinite(start) ? start : null;
  let cap = TRAINING_TIME.FIRST_SET_MINUTES;
  for (let index = 0; index < times.length;) {
    // The sets logged at one go from here, and the wait before them, counted for each of them.
    let next = index + 1;
    while (
      next < times.length &&
      (times[next] as number) - (times[next - 1] as number) <= TRAINING_TIME.ONE_GO_SECONDS * 1000
    ) {
      next += 1;
    }
    const first = times[index] as number;
    if (before !== null) {
      total += Math.min(Math.max(0, first - before), cap * (next - index) * MINUTE_MS);
    }
    total += (times[next - 1] as number) - first;
    before = times[next - 1] as number;
    cap = TRAINING_TIME.GAP_MINUTES;
    index = next;
  }
  const seconds = Math.round(total / 1000);
  // The workout's own clock leaves its pauses out: never more than it.
  return clock !== null && clock > 0 ? Math.min(seconds, Math.round(clock)) : seconds;
}

/** A workout's training time: as saved since Maintenance 28, or measured from its sets. */
export function trainingSeconds(record: Timed): number {
  return record.trainingSeconds ?? measureTrainingSeconds(record);
}

/** A workout's training time in whole minutes. */
export function trainingMinutes(record: Timed): number {
  return Math.round(trainingSeconds(record) / 60);
}

/**
 * The plan's own estimate, at its own pace, of the sets a workout did: what its training time is
 * read against. The plan cut to the sets done (a skip took no time), its general warm-up when any
 * set was done.
 */
export function estimateDoneSeconds(
  blocks: readonly WorkoutBlock[],
  done: (entryId: string, setIndex: number) => boolean,
  generalWarmupMinutes: number,
  exerciseOf: (id: string) => CatalogExercise,
): number {
  const cut = blocks
    .map((block) => ({
      ...block,
      entries: block.entries
        .map((entry) => ({ ...entry, sets: entry.sets.filter((set) => done(entry.id, set.index)) }))
        .filter((entry) => entry.sets.length > 0),
    }))
    .filter((block) => block.entries.length > 0);
  if (cut.length === 0) return 0;
  const { work, rest, setup } = estimateSeconds(cut, exerciseOf);
  return Math.round(generalWarmupMinutes * 60 + work + rest + setup);
}

/** The lifter's pace: how the plan's minutes are read for them (the owner's item 4). */
export const PACE = {
  /** The latest workouts it reads. */
  READINGS: 8,
  /** Workouts it needs before plans are fitted to it. */
  ACT_FROM: 3,
  /** A workout whose estimate is shorter says too little about a pace. */
  MIN_ESTIMATE_MINUTES: 10,
  /** A workout further off its estimate than this is a slip in the log, not a pace. */
  RATIO_LOW: 0.5,
  RATIO_HIGH: 2,
  /** As far as the pace may move a plan's minutes either way. */
  FACTOR_LOW: 0.8,
  FACTOR_HIGH: 1.5,
} as const;

export interface PaceReading {
  at: string;
  /** Training time over the plan's own estimate of the sets done. */
  ratio: number;
}

/**
 * Each finished workout that reads as a pace, oldest first: one saved with the plan's estimate of
 * its sets (from Maintenance 28 on), long enough to say something, not far off it, and after the
 * lifter's reset when there is one.
 */
export function paceReadings(
  history: readonly (Timed & Pick<WorkoutRecord, 'estimatedSeconds'>)[],
  resetAt: string | null = null,
): PaceReading[] {
  const from = resetAt ? Date.parse(resetAt) : Number.NEGATIVE_INFINITY;
  const out: PaceReading[] = [];
  for (const record of history) {
    const estimate = record.estimatedSeconds ?? 0;
    if (estimate < PACE.MIN_ESTIMATE_MINUTES * 60) continue;
    if (!(Date.parse(record.startedAt) >= from)) continue;
    const ratio = trainingSeconds(record) / estimate;
    if (!(ratio >= PACE.RATIO_LOW && ratio <= PACE.RATIO_HIGH)) continue;
    out.push({ at: record.startedAt, ratio });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export interface PersonalPace {
  /** Workouts read, up to the latest eight. */
  readings: number;
  /** Their median ratio, or null with none. */
  ratio: number | null;
  /** Whether plans are fitted to it: from three workouts. */
  usable: boolean;
  /** What a plan's minutes are multiplied by: 1 until it is usable. */
  factor: number;
}

export function personalPace(
  history: readonly (Timed & Pick<WorkoutRecord, 'estimatedSeconds'>)[],
  resetAt: string | null = null,
): PersonalPace {
  const readings = paceReadings(history, resetAt).slice(-PACE.READINGS);
  if (readings.length === 0) return { readings: 0, ratio: null, usable: false, factor: 1 };
  const sorted = readings.map((reading) => reading.ratio).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const ratio =
    sorted.length % 2 === 1
      ? (sorted[middle] as number)
      : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
  const usable = readings.length >= PACE.ACT_FROM;
  const factor = usable ? Math.min(PACE.FACTOR_HIGH, Math.max(PACE.FACTOR_LOW, ratio)) : 1;
  return { readings: readings.length, ratio, usable, factor };
}
