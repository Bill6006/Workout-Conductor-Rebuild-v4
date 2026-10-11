import type { Weekday } from '../validation/profile';

/**
 * Dates as the lifter lives them: the device's own calendar day and week, not UTC's (Maintenance
 * 27). A workout at 9 pm on a Sunday in New York is Sunday's, not Monday's. The older counts that
 * still read UTC days wait for the agreed item 1 ("use the local date everywhere").
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

/** The Monday that starts the device's week holding the instant, as `YYYY-MM-DD`. */
export function localWeekKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDayKey(monday.toISOString());
}
