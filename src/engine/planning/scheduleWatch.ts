import { getExercise } from '../../catalog/exercises/catalog';
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
 * recovery-time-course.md, Schedule watch): the four weeks after a change of the sessions a week or
 * the days, set against the weeks before, on the compound lifts' first sets. The lifts together
 * clearly under the weeks before, beyond week-to-week noise, two or more of them each, and still
 * under in their first sets after a few easier days once those four weeks are over: a finding.
 * Anything less is silence. Declines only: a stall cannot be told from noise in so few weeks.
 */

const DAY_MS = 86_400_000;

/** A lift clearly under the weeks before the change. */
export interface WatchedLift {
  exerciseId: string;
  /** How far under, as a share: 0.06 is 6% under the weeks before. */
  fall: number;
  /** Its first sets read before the change and in the four weeks after it. */
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

/** A schedule as the watch reads it: its sessions and days, and when they were last set. */
export type WatchedSchedule = ScheduleDays & { since?: string | undefined };

/**
 * The record a schedule change writes (`saved`, the one kept before it). The card's own way back is
 * never watched, so it never offers back the schedule that was falling. A change and another within
 * the week are one change: the first one's time and the schedule before it stand, and a change
 * undone within the week leaves nothing to watch.
 */
export function nextScheduleMove(
  saved: ScheduleMove | null,
  before: ScheduleDays,
  after: WatchedSchedule,
  now: string,
  back: boolean,
): ScheduleMove {
  const days = (schedule: ScheduleDays) => ({
    weeklyFrequency: schedule.weeklyFrequency,
    availableDays: [...schedule.availableDays],
  });
  const to = days(after);
  const since = after.since ?? null;
  if (back) return { id: SCHEDULE_MOVE_ID, at: now, from: days(before), to, since, watched: false };
  if (
    saved !== null &&
    saved.watched &&
    Date.parse(now) - Date.parse(saved.at) < RULES.watchMergeDays.value * DAY_MS
  ) {
    return { ...saved, to, since, watched: scheduleMoved(saved.from, after) };
  }
  return { id: SCHEDULE_MOVE_ID, at: now, from: days(before), to, since, watched: true };
}

/** An ask's range and reserve, its load left out: an ask is `load|low-high|reserve`. */
const shapeOf = (ask: string) => ask.slice(ask.indexOf('|') + 1);

/**
 * How one set did against an earlier one, as a share (0.92 is 8% under). Where the plan asked the
 * same range and reserve of both, they are set against each other as lifted, whatever the loads: a
 * load the plan lowered after missed sessions is the very fall the watch looks for, and one it
 * raised, lifted, is none (the review of Maintenance 36). Where it asked another range or reserve (a
 * deload week, a new split's range, a day's reserve), each is read against its own ask
 * (`againstEarlier`). Null where one has an ask and the other none.
 */
export function watchShare(read: AskedRead, earlier: AskedRead): number | null {
  if ((read.ask === null) !== (earlier.ask === null) || earlier.lifted <= 0) return null;
  if (read.ask === null || shapeOf(read.ask) === shapeOf(earlier.ask as string)) {
    return read.lifted / earlier.lifted;
  }
  return againstEarlier(read, earlier);
}

/**
 * How a lift's sets did against the sets before, as a share under (0.06 is 6% under): the mean over
 * every pair that reads (`watchShare`), in logs, so a block of sessions is set against a block
 * (block means); with the sets on each side that paired, which the noise is read for. Null with no
 * pair that reads.
 */
export function fallAgainst(
  after: readonly AskedRead[],
  before: readonly AskedRead[],
): { fall: number; after: number; before: number } | null {
  let sum = 0;
  let count = 0;
  const pairedAfter = new Set<number>();
  const pairedBefore = new Set<number>();
  after.forEach((read, at) => {
    before.forEach((earlier, from) => {
      const share = watchShare(read, earlier);
      if (share === null || share <= 0) return;
      sum += Math.log(share);
      count += 1;
      pairedAfter.add(at);
      pairedBefore.add(from);
    });
  });
  return count === 0
    ? null
    : { fall: 1 - Math.exp(sum / count), after: pairedAfter.size, before: pairedBefore.size };
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

/** A fall with its noise: the session's error × √(1/n after + 1/n before), for the sets paired. */
interface Fall {
  fall: number;
  noise: number;
}

/**
 * Whether falls side by side clear the noise of their mean: the mean of the lifts' falls against
 * z × √(the sum of their noises squared) ÷ their count. One test for the lifts together, however
 * many are read (the review of Maintenance 36: two coincidences among twenty lifts read were likely).
 */
function clearsTogether(falls: readonly Fall[]): boolean {
  const mean = falls.reduce((sum, item) => sum + item.fall, 0) / falls.length;
  const noise = Math.sqrt(falls.reduce((sum, item) => sum + item.noise ** 2, 0)) / falls.length;
  return mean > RULES.watchZ.value * noise;
}

/** A compound lift as the watch measured it over the four weeks after the change. */
interface Measured extends Fall {
  exerciseId: string;
  before: readonly LiftRead[];
  /** Its sets before and in the four weeks after that paired. */
  pairedBefore: number;
  pairedAfter: number;
  error: number;
  /** Its sets after those four weeks, oldest first. */
  later: readonly LiftRead[];
}

/**
 * The watch on the last change (`move`), read `now`, while the schedule is still the one it made
 * (`current`, set when the record says: a schedule set again since without a record of its own
 * leaves nothing to compare). Nothing after eight weeks, or for a change it leaves alone, and
 * nothing before the four weeks after the change are over: it speaks only on sets after them.
 *
 * The compound lifts with four first sets or more that pair in the four weeks after the change and
 * before it (the weeks before running to eight where four hold too few), and no break longer than
 * strength holds around it, are each measured: the four weeks after against the weeks before,
 * against the noise (`sessionError`). The four weeks are read once and stay as read: the lifts together must
 * clear the noise of their mean, and two or more must each clear their own. Then, from fresh sets:
 * each of those lifts' first set after the four weeks that came three days or more after its muscles
 * last had hard sets, together still under beyond their noise. A fall that clears after easier days
 * is a hard stretch passing, not the schedule.
 */
export function scheduleWatch(
  move: ScheduleMove | null,
  current: WatchedSchedule,
  history: readonly WorkoutRecord[],
  now: string,
): ScheduleWatchFinding | null {
  if (move === null || !move.watched || scheduleMoved(move.to, current)) return null;
  if ((move.since ?? null) !== (current.since ?? null)) return null;
  const at = Date.parse(move.at);
  const end = Date.parse(now);
  if (!Number.isFinite(at) || !Number.isFinite(end)) return null;
  if (end - at > RULES.watchLongestDays.value * DAY_MS) return null;
  const blockEnd = at + RULES.watchBlockDays.value * DAY_MS;
  const least = RULES.watchSessions.value;
  const measured: Measured[] = [];
  for (const [exerciseId, reads] of liftReads(history)) {
    // Compound lifts only: an isolation lift's max reads poorly, and every lift read is another
    // chance of a coincidence (the review of Maintenance 36).
    if (getExercise(exerciseId)?.compound !== true) continue;
    const before = readsBefore(reads, at);
    const after = reads.filter((read) => {
      const time = Date.parse(read.at);
      return time > at && time <= blockEnd;
    });
    if (brokenOff([...before, ...after])) continue;
    const error = sessionError(before);
    const read = fallAgainst(
      after.map((item) => item.read),
      before.map((item) => item.read),
    );
    if (read === null || read.after < least || read.before < least) continue;
    measured.push({
      exerciseId,
      fall: read.fall,
      noise: fallThreshold(read.after, read.before, error) / RULES.watchZ.value,
      before,
      pairedBefore: read.before,
      pairedAfter: read.after,
      error,
      later: reads.filter((item) => {
        const time = Date.parse(item.at);
        return time > blockEnd && time <= end;
      }),
    });
  }
  if (measured.length < RULES.watchLifts.value || !clearsTogether(measured)) return null;
  // Two or more of them each clearly under: the sets after easier days below are read for those
  // alone, and two or more must have one.
  const falling = measured.filter((lift) => lift.fall > RULES.watchZ.value * lift.noise);
  const still: Fall[] = [];
  for (const lift of falling) {
    const first = lift.later.find(
      (read) => read.easierDays === null || read.easierDays >= RULES.watchEasierDays.value,
    );
    if (!first) continue;
    const read = fallAgainst(
      [first.read],
      lift.before.map((item) => item.read),
    );
    if (read === null) continue;
    still.push({
      fall: read.fall,
      noise: fallThreshold(read.after, read.before, lift.error) / RULES.watchZ.value,
    });
  }
  if (still.length < RULES.watchLifts.value || !clearsTogether(still)) return null;
  falling.sort((a, b) => b.fall - a.fall);
  return {
    at: move.at,
    from: {
      weeklyFrequency: move.from.weeklyFrequency,
      availableDays: [...move.from.availableDays],
    },
    lifts: falling.map((lift) => ({
      exerciseId: lift.exerciseId,
      fall: lift.fall,
      before: lift.pairedBefore,
      after: lift.pairedAfter,
    })),
  };
}
