import type { WorkoutSession } from '../../core/state/session';
import { builtCatchUp } from '../../engine/workoutGenerator/generate';
import { allEntries } from '../../engine/workout/types';

/**
 * The one line Today gives a day off the plan or a day already trained (Maintenance 31, the owner's
 * items 12 and 32), read from the plan as it was built. It says what the plan is, never asks: the
 * app chooses the day's one workout (the owner, 2026-10-31: "the user does NOT choose between
 * 'Catch-up' and 'Full session'"), from the week, the recovery, the place and the length picked. A
 * day not ticked says so even with nothing behind: a new lifter's, or one in a deload week (the
 * review of round M). A session saved with the full session taken before keeps it for its day.
 */
export interface DayNote {
  text: string;
}

export function dayNoteOf(
  session: WorkoutSession,
  /** Whether the lifter's schedule ticks today. */
  ticked = true,
): DayNote | null {
  if (session.status !== 'preview') return null;
  // A saved workout loaded is told as the day's offer only where the day offers its kind, a catch-up
  // only where something is behind; elsewhere the line says the day as it is (the twenty-fourth and
  // twenty-fifth reviews of round M: a catch-up saved on a Wednesday said "Not one of your training
  // days" on a Thursday the schedule ticks, and "for what is behind this week" with nothing behind).
  const own = session.constraints.catchUp;
  const day = session.constraints.dayChoices;
  const offered = day?.catchUp;
  const offers =
    offered && (offered.kind === 'second' || offered.muscles.length > 0) ? offered.kind : null;
  const stored = day && own && offers !== own.kind ? null : own;
  // A copy with no lift that is none of the day's offer has nothing to start, and says so (the
  // twenty-fifth review: an empty second workout loaded on another day left a day of the plan with
  // nothing in it and no line). A copy with no lift is no longer loaded (the owner, 2026-10-31);
  // one loaded before the change, its lifts emptied by hand since, still reads so.
  if (day && !stored && allEntries(session.workout.blocks).length === 0) {
    return {
      text: ticked
        ? 'Nothing more for today.'
        : 'Not one of your training days: nothing more for today.',
    };
  }
  if (!stored) return ticked ? null : { text: 'Not one of your training days.' };
  const full = session.constraints.fullSession === true;
  // Something is behind this week; and whether today's session was built from it, or planned as
  // with nothing behind, each lift for it working a muscle that rests today.
  const behind = stored.muscles.length > 0;
  const built = builtCatchUp(stored, session.workout).muscles.length > 0;
  // What a lift went in for: the second workout leads with what was missed only where one did, as
  // "Why this workout" says (the review of round M).
  const covered = new Set(allEntries(session.workout.blocks).flatMap((entry) => entry.chosenFor));
  const ledWith = stored.muscles.some((item) => item.why === 'behind' && covered.has(item.muscle));
  const nothingBehind = behind ? '' : ', and nothing is behind this week';
  if (stored.kind === 'catch-up') {
    if (full) return { text: 'Not one of your training days.' };
    // A catch-up the lifter's changes emptied has nothing more (the thirteenth review of round M).
    if (built && allEntries(session.workout.blocks).length === 0) {
      return { text: 'Not one of your training days: nothing more for today.' };
    }
    if (built) {
      return {
        text: `Not one of your training days: a ${session.workout.duration.estimatedMinutes}-minute catch-up for what is behind this week.`,
      };
    }
    return {
      text: behind
        ? 'Not one of your training days, and nothing behind this week can be caught up today.'
        : 'Not one of your training days, and nothing is behind this week.',
    };
  }
  if (full) return { text: 'You trained today.' };
  // A second workout the lifter's changes emptied has nothing more either (the fourteenth review of
  // round M).
  if (built && allEntries(session.workout.blocks).length === 0) {
    return { text: `You trained today${nothingBehind}: nothing more for today.` };
  }
  if (built)
    return {
      text: ledWith
        ? 'You trained today: this one leads with what you missed and goes easy on the rest.'
        : 'You trained today: this one goes easy, with only what is left of today’s work.',
    };
  if (allEntries(session.workout.blocks).length > 0)
    return { text: `You trained today${nothingBehind}: what you trained sits out.` };
  return { text: `You trained today${nothingBehind}: nothing more for today.` };
}
