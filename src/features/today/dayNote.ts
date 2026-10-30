import type { WorkoutSession } from '../../core/state/session';
import { builtCatchUp } from '../../engine/workoutGenerator/generate';
import { allEntries } from '../../engine/workout/types';

/**
 * The one line Today gives a day that offers a catch-up or a second workout (Maintenance 31, the
 * owner's items 12 and 32), read from the plan as it was built. Where a catch-up is offered the
 * full session is one tap away: a catch-up is offered, never pushed, and missing a session costs
 * little (docs/research/catch-up-and-second-workout.md). A second workout with nothing left to
 * give says so, and the full session is one tap away there too, the lifter's to choose. A day not
 * ticked says so even with no catch-up to offer: a new lifter's, or one in a deload week (the
 * review of round M).
 */
export interface DayNote {
  text: string;
  /** Take the full session (true) or the day's own session again (false), with the button's words. */
  action?: { label: string; full: boolean };
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
  // A copy with no lift that is none of the day's offer has nothing to start: the full session a tap
  // away, as on a plan of the offer emptied (the twenty-fifth review: an empty second workout
  // loaded on another day left a day of the plan with nothing in it and no button).
  if (day && !stored && allEntries(session.workout.blocks).length === 0) {
    return {
      text: ticked
        ? 'Nothing more for today.'
        : 'Not one of your training days: nothing more for today.',
      action: { label: 'Full session', full: true },
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
    if (full) {
      return {
        text: 'Not one of your training days.',
        ...(behind ? { action: { label: 'Catch-up instead', full: false } } : {}),
      };
    }
    // A catch-up the lifter's changes emptied has nothing more (the thirteenth review of round M).
    if (built && allEntries(session.workout.blocks).length === 0) {
      return {
        text: 'Not one of your training days: nothing more for today.',
        action: { label: 'Full session', full: true },
      };
    }
    if (built) {
      return {
        text: `Not one of your training days: a ${session.workout.duration.estimatedMinutes}-minute catch-up for what is behind this week.`,
        action: { label: 'Full session', full: true },
      };
    }
    return {
      text: behind
        ? 'Not one of your training days, and nothing behind this week can be caught up today.'
        : 'Not one of your training days, and nothing is behind this week.',
    };
  }
  if (full)
    return { text: 'You trained today.', action: { label: 'Go easy instead', full: false } };
  // A second workout the lifter's changes emptied has nothing more either (the fourteenth review of
  // round M).
  if (built && allEntries(session.workout.blocks).length === 0) {
    return {
      text: `You trained today${nothingBehind}: nothing more for today.`,
      action: { label: 'Full session', full: true },
    };
  }
  if (built)
    return {
      text: ledWith
        ? 'You trained today: this one leads with what you missed and goes easy on the rest.'
        : 'You trained today: this one goes easy, with only what is left of today’s work.',
    };
  if (allEntries(session.workout.blocks).length > 0)
    return { text: `You trained today${nothingBehind}: what you trained sits out.` };
  return {
    text: `You trained today${nothingBehind}: nothing more for today.`,
    action: { label: 'Full session', full: true },
  };
}
