import { z } from 'zod';
import { WEEKDAYS, type Weekday } from './profile';

/**
 * The schedule watch's record (Maintenance 36; the approved proposal, part 2: "Watch after a move.
 * Compare the weeks after a schedule change with the weeks before. If it's clearly worse than normal
 * week-to-week noise, show one card with the old schedule one tap away. If not, stay silent."): the
 * last change of the sessions a week or the days, when it was made, and the schedules before it and
 * after. Kept in the meta store and copied to the cloud like every meta record; one that does not
 * read is none, and the watch says nothing.
 */

export const SCHEDULE_MOVE_ID = 'schedule-move';

/** The sessions a week and the days, as the profile keeps them. */
const ScheduleDaysSchema = z.looseObject({
  weeklyFrequency: z.number().int().min(1).max(7),
  availableDays: z.array(z.enum(WEEKDAYS)).min(1).max(7),
});

export const ScheduleMoveSchema = z.looseObject({
  id: z.literal(SCHEDULE_MOVE_ID),
  /** When the schedule changed. */
  at: z.iso.datetime(),
  /** The schedule before it: what the card offers to go back to. */
  from: ScheduleDaysSchema,
  /** The schedule it made: the watch reads only while the schedule is still this one. */
  to: ScheduleDaysSchema,
  /**
   * When that schedule was set, as the profile keeps it: a schedule set again since without a
   * record of its own is not the one the record made (the review of Maintenance 36). None
   * where the profile kept none; one that does not read matches no schedule.
   */
  since: z.iso.datetime().nullable().catch(null).default(null),
  /**
   * False for a change the watch leaves alone: the card's own way back, or a change undone within
   * the week. A flag missing or that does not read leaves it alone too, the quiet side.
   */
  watched: z.boolean().catch(false).default(false),
});

export type ScheduleMove = z.infer<typeof ScheduleMoveSchema>;

/** The sessions a week and the days: what a schedule change changes. */
export interface ScheduleDays {
  weeklyFrequency: number;
  availableDays: readonly Weekday[];
}

/** The record as stored; one that does not read is none. */
export function parseScheduleMove(raw: unknown): ScheduleMove | null {
  const result = ScheduleMoveSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Whether two schedules differ in what the watch watches: the sessions a week, or the days. */
export function scheduleMoved(before: ScheduleDays, after: ScheduleDays): boolean {
  const days = (schedule: ScheduleDays) => [...new Set(schedule.availableDays)].sort().join();
  return before.weeklyFrequency !== after.weeklyFrequency || days(before) !== days(after);
}
