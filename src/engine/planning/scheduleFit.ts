import { WEEKDAYS, type UserProfile, type Weekday } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { localDayKey, localWeekKey, localWeekday } from '../../core/time/localDate';

/**
 * The week the lifter actually trains (Maintenance 27, the owner's item 46,
 * docs/research/real-week.md): days trained other than the schedule for four complete weeks
 * running bring one card to move the schedule, and the split follows the new number of days once
 * the lifter takes it. No study says how many weeks make a pattern; four whole weeks, every one on
 * the same side of the schedule, keeps a false card rare (under 1% for a lifter who misses a day in
 * three weeks of ten at random), and the card is only an offer.
 */
export const SCHEDULE_FIT = {
  /** Complete Monday-to-Sunday weeks with training that the pattern is read from. */
  WEEKS: 4,
  /** How far back those weeks may lie: the consistency chart's eight. */
  LOOK_BACK_WEEKS: 8,
  /** A weekday trained in this many of the weeks is one the lifter trains on. */
  REGULAR_IN: 3,
  /** The schedule's own range of sessions a week, as Settings offers it. */
  MIN_FREQUENCY: 2,
  MAX_FREQUENCY: 6,
} as const;

/** One of the weeks read: its Monday (on the device), and the weekdays trained in it. */
export interface TrainedWeek {
  monday: string;
  days: Weekday[];
}

export interface ScheduleFit {
  weeks: TrainedWeek[];
  /** The days a week the lifter trains, when every week fell on one side of the schedule. */
  measured: number | null;
  /** The sessions a week the move sets, within Settings' range; null where the count stays. */
  real: number | null;
  /** Weekdays trained in at least three of the four weeks. */
  regular: Weekday[];
  /** The schedule the card offers. */
  proposal: { weeklyFrequency: number; availableDays: Weekday[] };
}

const byWeekday = (a: Weekday, b: Weekday) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b);

/** The local dates with a completed working set, and their weekdays: two workouts are one day. */
function trainingDays(history: readonly WorkoutRecord[]): Map<string, Weekday> {
  const days = new Map<string, Weekday>();
  for (const record of history) {
    const trained = record.entries.some((entry) =>
      entry.sets.some((set) => set.kind === 'working' && set.completed),
    );
    if (!trained) continue;
    // The day it began: one finished after midnight, or the next morning, is the day it was
    // started (the review of item 46).
    const at = record.startedAt;
    days.set(localDayKey(at), localWeekday(at));
  }
  return days;
}

/** The Monday key `weeks` weeks before the week of `now`. */
function mondayBefore(now: string, weeks: number): string {
  const monday = localWeekKey(now);
  const [year, month, day] = monday.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day - 7 * weeks, 12);
  return localDayKey(date.toISOString());
}

/**
 * The real week against the schedule, or null when it fits or there is too little to read: the
 * last four complete weeks that had training, within eight, after the schedule was last set.
 */
export function scheduleFit(
  history: readonly WorkoutRecord[],
  profile: Pick<UserProfile, 'schedule'>,
  now: string,
): ScheduleFit | null {
  const trained = trainingDays(history);
  const setWeek = profile.schedule.since ? localWeekKey(profile.schedule.since) : null;
  const weeks: TrainedWeek[] = [];
  for (
    let back = 1;
    back <= SCHEDULE_FIT.LOOK_BACK_WEEKS && weeks.length < SCHEDULE_FIT.WEEKS;
    back += 1
  ) {
    const monday = mondayBefore(now, back);
    // Only whole weeks after the schedule was set count: a move starts the reading afresh.
    if (setWeek !== null && monday <= setWeek) break;
    const days = [...trained.entries()]
      .filter(([key]) => localWeekKey(new Date(`${key}T12:00:00`).toISOString()) === monday)
      .map(([, weekday]) => weekday)
      .sort(byWeekday);
    if (days.length > 0) weeks.unshift({ monday, days });
  }
  if (weeks.length < SCHEDULE_FIT.WEEKS) return null;

  const { weeklyFrequency, availableDays } = profile.schedule;
  const counts = weeks.map((week) => week.days.length);
  const fewer = counts.every((count) => count < weeklyFrequency);
  const more = counts.every((count) => count > weeklyFrequency);
  const sorted = [...counts].sort((a, b) => a - b);
  const median = ((sorted[1] as number) + (sorted[2] as number)) / 2;
  // A half rounds toward the schedule's number: the cautious way.
  const toward = median < weeklyFrequency ? Math.ceil(median) : Math.floor(median);
  const measured = fewer || more ? toward : null;
  // Kept within Settings' range; a count the range cannot reach is no move of the count (the
  // review of item 46).
  const clamped =
    measured === null
      ? null
      : Math.min(SCHEDULE_FIT.MAX_FREQUENCY, Math.max(SCHEDULE_FIT.MIN_FREQUENCY, measured));
  const real = clamped !== null && clamped !== weeklyFrequency ? clamped : null;

  const times = new Map<Weekday, number>();
  for (const week of weeks) for (const day of week.days) times.set(day, (times.get(day) ?? 0) + 1);
  const regular = [...times.entries()]
    .filter(([, count]) => count >= SCHEDULE_FIT.REGULAR_IN)
    .map(([day]) => day)
    .sort(byWeekday);
  // Off in days: a day trained most weeks that the schedule does not have. Days that vary from
  // week to week name no day to move to, so they bring no card (the review of item 46).
  const offDays = regular.some((day) => !availableDays.includes(day));
  if (real === null && !offDays) return null;

  const frequency = real ?? weeklyFrequency;
  const days = new Set<Weekday>([...regular, ...availableDays.filter((day) => times.has(day))]);
  // Never fewer days than sessions: the most-trained others first.
  const others = [...times.entries()]
    .filter(([day]) => !days.has(day))
    .sort((a, b) => b[1] - a[1] || byWeekday(a[0], b[0]))
    .map(([day]) => day);
  for (const day of others) {
    if (days.size >= frequency) break;
    days.add(day);
  }
  for (const day of availableDays) {
    if (days.size >= frequency) break;
    days.add(day);
  }
  const proposal = { weeklyFrequency: frequency, availableDays: [...days].sort(byWeekday) };
  // Never fewer days than sessions: with no day to fill from, no card.
  if (proposal.availableDays.length < proposal.weeklyFrequency) return null;
  const same =
    proposal.weeklyFrequency === weeklyFrequency &&
    proposal.availableDays.length === availableDays.length &&
    proposal.availableDays.every((day) => availableDays.includes(day));
  if (same) return null;
  return { weeks, measured, real, regular, proposal };
}

/** "Mon", "Mon and Wed", "Mon, Wed and Sat". */
export function dayList(days: readonly Weekday[]): string {
  const names = days.map((day) => `${day.charAt(0).toUpperCase()}${day.slice(1)}`);
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
