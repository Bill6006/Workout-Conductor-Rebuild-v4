import type { Weekday } from '../validation/profile';

/**
 * Dates as the lifter lives them: the device's own calendar day and week, not UTC's (Maintenance
 * 27). A workout at 9 pm on a Sunday in New York is Sunday's, not Monday's. Since Maintenance 28
 * (the owner's item 1) every count of days reads them: today, the week, a weekday, the day shown.
 * Elapsed time stays elapsed time: the hours since a muscle was trained, a break of three weeks.
 */

/** The calendar day of an instant on this device, as `YYYY-MM-DD`; empty for an unreadable one. */
export function localDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** The day of the week of an instant on this device. */
export function localWeekday(iso: string): Weekday {
  return WEEKDAYS[(new Date(iso).getDay() + 6) % 7] as Weekday;
}

/**
 * Whole calendar days on this device from one instant's day to another's: Monday evening to the
 * next Monday morning is seven, whatever the hours, and a clock change between them counts no day.
 */
export function localDaysBetween(from: string, to: string): number {
  const day = (iso: string) => {
    const date = new Date(iso);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  };
  return Math.round((day(to) - day(from)) / 86_400_000);
}

/**
 * The instant `days` calendar days on, on this device, at the same clock time: a clock change
 * between counts no day (the re-check of item 44: 24-hour steps landed on the same Sunday, or
 * skipped one).
 */
export function addLocalDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/** Midnight on this device at the start of the instant's day, as an ISO instant. */
export function startOfLocalDay(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
}

/**
 * The calendar day a boundary of a day window names: its day twelve hours in. That is the day of
 * a midnight on this device, and of one on a device within twelve hours of it (a window planned
 * there and synced here). A boundary kept from before Maintenance 28 is read by `fromUtcMidnight`
 * first.
 */
export function dayOfBoundary(iso: string): string {
  return new Date(Date.parse(iso) + 12 * 3_600_000).toISOString();
}

/**
 * A boundary of a day window kept from before Maintenance 28, at midnight UTC, as midnight on this
 * device on that calendar day; any other boundary as it is (the review of item 1: such a window ran
 * by UTC days, and far east of UTC it was named a day late).
 */
export function fromUtcMidnight(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.000)?Z$/.exec(iso);
  if (!match) return iso;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toISOString();
}

/** The Monday that starts the device's week holding the instant, as `YYYY-MM-DD`. */
export function localWeekKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDayKey(monday.toISOString());
}
