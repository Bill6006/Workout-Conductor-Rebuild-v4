import {
  SCHEDULE_MOVE_ID,
  scheduleMoved,
  type ScheduleDays,
  type ScheduleMove,
} from '../../core/validation/scheduleMove';
import type { Weekday } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { againstEarlier, type AskedRead } from '../recovery/againstAsked';
import { liftReads, type LiftRead } from '../recovery/recovery';
import { RULES } from '../rules/ruleTable';

/**
 * The schedule watch (Maintenance 36; the approved proposal, part 2, docs/research/
 * recovery-time-course.md, Schedule watch): the weeks after a change of the sessions a week or the
 * days, set against the weeks before. Each lift's first sets after the change are read against its
 * first sets before, each set against what it asked (`againstEarlier`), so the plan's own change
 * lifted as asked is never a fall. Two lifts or more clearly under the weeks before, beyond
 * week-to-week noise, and still under after a few easier days, are a finding; anything less is
 * silence. Declines only: a stall cannot be told from noise in so few weeks.
 */

const DAY_MS = 86_400_000;

/** A lift clearly under the weeks before the change. */
export interface WatchedLift {
  exerciseId: string;
  /** How far under, as a share: 0.06 is 6% under the weeks before. */
  fall: number;
  /** Its first sets read before the change and after it. */
  before: number;
  after: number;
}

/** What the watch found: the change, the schedule before it, and the lifts down since. */
export interface ScheduleWatchFinding {
  at: string;
  from: { weeklyFrequency: number; availableDays: Weekday[] };
  /** Two or more, the largest fall first. */
  lifts: WatchedLift[];
}

/**
 * The record a schedule change writes (`saved`, the one kept before it). The card's own way back is
 * never watched, so it never offers back the schedule that was falling. A change and another within
 * the week are one change: the first one's time and the schedule before it stand, and a change
 * undone within the week leaves nothing to watch.
 */
export function nextScheduleMove(
  saved: ScheduleMove | null,
  before: ScheduleDays,
  after: ScheduleDays,
  now: string,
  back: boolean,
): ScheduleMove {
  const days = (schedule: ScheduleDays) => ({
    weeklyFrequency: schedule.weeklyFrequency,
    availableDays: [...schedule.availableDays],
  });
  const to = days(after);
  if (back) return { id: SCHEDULE_MOVE_ID, at: now, from: days(before), to, watched: false };
  if (
    saved !== null &&
    saved.watched &&
    Date.parse(now) - Date.parse(saved.at) < RULES.watchMergeDays.value * DAY_MS
  ) {
    return { ...saved, to, watched: scheduleMoved(saved.from, after) };
  }
  return { id: SCHEDULE_MOVE_ID, at: now, from: days(before), to, watched: true };
}

/**
 * How a lift's sets did against the sets before, as a share under (0.06 is 6% under): the mean over
 * every pair of how each did against each, in logs, so a block of sessions is set against a block
 * (block means). Null with no pair that reads.
 */
export function fallAgainst(
  after: readonly AskedRead[],
  before: readonly AskedRead[],
): number | null {
  let sum = 0;
  let count = 0;
  for (const read of after) {
    for (const earlier of before) {
      const share = againstEarlier(read, earlier);
      if (share === null || share <= 0) continue;
      sum += Math.log(share);
      count += 1;
    }
  }
  return count === 0 ? null : 1 - Math.exp(sum / count);
}

/** The fall the noise could make: z × the session's error × √(1/n after + 1/n before). */
export function fallThreshold(
  after: number,
  before: number,
  error: number = RULES.watchError.value,
): number {
  return RULES.watchZ.value * error * Math.sqrt(1 / after + 1 / before);
}

/**
 * A lift's session-to-session error, read from its sets before the change: the spread of their
 * maxes as lifted around their trend, in logs, once there are ten or more (the research: "after
 * about 10 sessions, use the person's own SD around their trend"); the literature's 4% before that.
 * Never under 4%: a steady spread is not trusted to make the watch quicker to speak, while a wider
 * one makes it slower, so a noisy lifter is not told a fall the noise made.
 */
export function sessionError(reads: readonly LiftRead[]): number {
  const floor = RULES.watchError.value;
  const count = reads.length;
  if (count < RULES.watchOwnSessions.value) return floor;
  const days = reads.map((read) => Date.parse(read.at) / DAY_MS);
  const logs = reads.map((read) => Math.log(read.read.lifted));
  const mean = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const dayMean = mean(days);
  const logMean = mean(logs);
  let across = 0;
  let together = 0;
  for (let at = 0; at < count; at += 1) {
    across += ((days[at] as number) - dayMean) ** 2;
    together += ((days[at] as number) - dayMean) * ((logs[at] as number) - logMean);
  }
  const slope = across > 0 ? together / across : 0;
  let squares = 0;
  for (let at = 0; at < count; at += 1) {
    const residual = (logs[at] as number) - logMean - slope * ((days[at] as number) - dayMean);
    squares += residual ** 2;
  }
  return Math.max(floor, Math.sqrt(squares / (count - 2)));
}

/** The lift's sets before the change: the four weeks before, eight where four hold too few. */
function readsBefore(reads: readonly LiftRead[], at: number): LiftRead[] {
  const within = (days: number) =>
    reads.filter((read) => {
      const time = Date.parse(read.at);
      return time < at && time >= at - days * DAY_MS;
    });
  const near = within(RULES.watchBlockDays.value);
  return near.length >= RULES.watchSessions.value ? near : within(RULES.watchLongestDays.value);
}

/** Whether a lift went longer without a session than strength holds, around the change. */
function brokenOff(reads: readonly LiftRead[]): boolean {
  for (let at = 1; at < reads.length; at += 1) {
    const gap = Date.parse((reads[at] as LiftRead).at) - Date.parse((reads[at - 1] as LiftRead).at);
    if (gap > RULES.watchBreakDays.value * DAY_MS) return true;
  }
  return false;
}

/**
 * The watch on the last change (`move`), read `now`: nothing in the first four weeks after it, or
 * after eight, or for a change it leaves alone, or once the schedule is no longer the one the change
 * made (`current`: changed since without a record, the watch has nothing to compare). Each lift with four first sets or more on each side
 * is read: its fall against the weeks before must clear the noise (`sessionError`), and so must the
 * fall of its sets after three days or more without hard sets for its muscles alone (still there
 * after easier days, not a hard week passing). A lift with a break longer than strength holds around
 * the change is not read: the break would explain a fall. Two lifts or more make a finding.
 */
export function scheduleWatch(
  move: ScheduleMove | null,
  current: ScheduleDays,
  history: readonly WorkoutRecord[],
  now: string,
): ScheduleWatchFinding | null {
  if (move === null || !move.watched || scheduleMoved(move.to, current)) return null;
  const at = Date.parse(move.at);
  const end = Date.parse(now);
  if (!Number.isFinite(at) || !Number.isFinite(end)) return null;
  if (end - at < RULES.watchBlockDays.value * DAY_MS) return null;
  if (end - at > RULES.watchLongestDays.value * DAY_MS) return null;
  const lifts: WatchedLift[] = [];
  for (const [exerciseId, reads] of liftReads(history)) {
    const before = readsBefore(reads, at);
    const after = reads.filter((read) => {
      const time = Date.parse(read.at);
      return time > at && time <= end;
    });
    const least = RULES.watchSessions.value;
    if (before.length < least || after.length < least) continue;
    if (brokenOff([...before, ...after])) continue;
    const earlier = before.map((read) => read.read);
    const error = sessionError(before);
    const fall = fallAgainst(
      after.map((read) => read.read),
      earlier,
    );
    if (fall === null || fall <= fallThreshold(after.length, before.length, error)) continue;
    const easier = after.filter(
      (read) => read.easierDays === null || read.easierDays >= RULES.watchEasierDays.value,
    );
    if (easier.length === 0) continue;
    const still = fallAgainst(
      easier.map((read) => read.read),
      earlier,
    );
    if (still === null || still <= fallThreshold(easier.length, before.length, error)) continue;
    lifts.push({ exerciseId, fall, before: before.length, after: after.length });
  }
  if (lifts.length < RULES.watchLifts.value) return null;
  lifts.sort((a, b) => b.fall - a.fall);
  return {
    at: move.at,
    from: {
      weeklyFrequency: move.from.weeklyFrequency,
      availableDays: [...move.from.availableDays],
    },
    lifts,
  };
}
