import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { activePush, pushTargetText } from '../../engine/planning/pushLift';
import {
  PUSH_PACE,
  READING_RULE,
  dateCheck,
  paceReadings,
  pushPace,
  sessionsSince,
  targetIn,
} from '../../engine/planning/pushPace';

/**
 * What Progress says of a lift to push (Maintenance 27, the owner's item 44): the pace toward its
 * target with the band the lifter's own scatter gives it, where the pace leads within the twelve
 * weeks the evidence covers, and a target date against it. Never two single readings compared.
 */
export interface PushCard {
  title: string;
  /** The pace, or how far the baseline has to go. */
  headline: string;
  lines: string[];
  /** How the pace is read, for the card's foot. */
  method: string;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const percent = (share: number) => {
  const value = Math.round(share * 1000) / 10;
  return `${value > 0 ? '+' : ''}${value}%`;
};

const dayText = (epochMs: number) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(epochMs));

export const PUSH_METHOD = `Read from each session's first working set of the lift since the push began, up to ${PUSH_PACE.MAX_READ_REPS} reps with ${PUSH_PACE.MAX_READ_RIR} or fewer in reserve, as an estimated max; a line through them, each rep range at its own level. The band is your own scatter about that line: a logged max varies about 4 to 5% from day to day (Grgic et al. 2020), so a pace needs ${PUSH_PACE.SHOW_WEEKS} weeks and ${PUSH_PACE.SHOW_READINGS} sessions before it means anything.`;

export function pushCard(
  profile: UserProfile,
  history: readonly WorkoutRecord[],
  now: string,
): PushCard | null {
  const active = activePush(profile);
  if (!active) return null;
  const { push, exercise } = active;
  const units = profile.units;
  const target = targetIn(push, units);
  const by = push.by ? ` by ${dayText(Date.parse(push.by))}` : '';
  const title = `${exercise.name} to ${pushTargetText(push, units)}${by}`;
  const readings = paceReadings(history, exercise.id, push.since);
  const state = pushPace({ readings, since: push.since, now, target });
  const lines: string[] = [];
  const nowMs = Date.parse(now);

  const dated = (current: number | null) => {
    if (!push.by || current === null) return;
    const check = dateCheck({
      state,
      target,
      by: push.by,
      now,
      current,
      newLifter: profile.experience === 'beginner',
    });
    if (!check) {
      lines.push(`${dayText(Date.parse(push.by))} has passed: set a new date in Settings.`);
      return;
    }
    if (check.needed <= 0) return;
    if (check.likely === false) {
      lines.push(
        `Unlikely by ${dayText(Date.parse(push.by))} at your current pace: it needs about ${percent(check.needed)} a week.`,
      );
    } else if (check.likely === true) {
      lines.push(`Within reach by ${dayText(Date.parse(push.by))} at your current pace.`);
    }
    if (check.ambitious) {
      lines.push(
        `Ambitious: about ${percent(check.needed)} a week, where trained lifters gained about 5 to 16% in 8 to 12 weeks of study (about 0.5 to 1.5% a week; group figures with very wide spreads, not a limit).`,
      );
    }
  };

  if (state.kind === 'none') {
    // Sessions that gave none say why: a set past the reading's reps reads nothing (the re-check
    // of item 44: Light weights logs its pushed lift at 10 to 15 reps).
    const sessions = sessionsSince(history, exercise.id, push.since);
    return {
      title,
      headline: 'No reading yet',
      lines: [
        sessions > 0
          ? `None of its ${sessions} ${sessions === 1 ? 'session' : 'sessions'} since the push began gave one: a reading is ${READING_RULE}.`
          : `A reading is ${READING_RULE}.`,
      ],
      method: PUSH_METHOD,
    };
  }
  if (state.kind === 'baseline') {
    const togo = [
      state.sessionsToGo > 0
        ? `${state.sessionsToGo} more ${state.sessionsToGo === 1 ? 'session' : 'sessions'}`
        : null,
      state.weeksToGo > 0
        ? `${state.weeksToGo} more ${state.weeksToGo === 1 ? 'week' : 'weeks'}`
        : null,
    ].filter((part): part is string => part !== null);
    lines.push(
      togo.length > 0
        ? `Building a baseline: ${state.readings} ${state.readings === 1 ? 'reading' : 'readings'} so far, ${togo.join(' and ')} to go.`
        : `Building a baseline: ${state.readings} readings so far, but they scatter more than they climb. A pace shows once the line is clearer, or at ${PUSH_PACE.CLEAR_WEEKS} weeks.`,
    );
    if (state.current !== null) lines.push(`Now about ${state.current} ${units} (estimated max).`);
    dated(state.current);
    return { title, headline: 'Building a baseline', lines, method: PUSH_METHOD };
  }

  lines.push(`Now about ${Math.round(state.current)} ${units} (estimated max).`);
  const projection = state.projection;
  if (projection.kind === 'reached') {
    lines.push('Target reached: set a new one in Settings, or stop the push.');
  } else if (projection.kind === 'within') {
    const at = (weeks: number) => dayText(nowMs + weeks * WEEK_MS);
    const latest =
      projection.latest !== null && projection.latest <= PUSH_PACE.PROJECT_WEEKS
        ? at(projection.latest)
        : null;
    lines.push(
      `At this pace, around ${at(projection.weeks)} (likely ${at(projection.earliest)}${latest ? ` to ${latest}` : ' or later'}).`,
    );
  } else if (projection.kind === 'beyond') {
    lines.push(
      `At this pace, more than ${PUSH_PACE.PROJECT_WEEKS} weeks away. Gains usually slow with time and strength (Steele et al. 2023), so no date is given.`,
    );
  } else {
    lines.push('The line has not risen over the push.');
  }
  dated(state.current);
  return {
    title,
    headline: `About ${percent(state.weekly)} a week (likely ${percent(state.low)} to ${percent(state.high)})`,
    lines,
    method: PUSH_METHOD,
  };
}
