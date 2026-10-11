import { getExercise, requireExercise } from '../../catalog/exercises/catalog';
import { jointWord } from '../../catalog/exercises/joints';
import { JOINTS, type Joint } from '../../catalog/exercises/exerciseSchema';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { PAIN_PATTERN_SOURCE, type CoachDeclines } from '../coach/coachConductor';
import { weightStep } from '../plateMath/plateMath';
import { PERSONAL_CURVE, curveReadings, liftCurve } from '../progression/personalCurve';
import { overrideBias, OVERRIDE_MAJORITY, OVERRIDE_WINDOW } from '../progression/overrides';
import { RESERVE_CHECK, reserveCheckStatus, reserveReadings } from '../progression/reserveCheck';
import { resolveStyle } from '../planning/styleAdvice';
import { painPatterns } from '../recovery/painPattern';
import type { LearnedKind, LearnedResets } from './resets';

/**
 * What the app has learned about the lifter (Maintenance 27, the owner's item 47): one page with
 * each learned value, what it is read from and the research behind it, and a reset. A reset never
 * deletes a logged set; the learner reads only what is logged after it.
 */

/** The page's sections, each a learned value. */
export interface LearnedSection {
  key: LearnedKind | 'pace' | 'declines';
  title: string;
  /** Where it stands, in one line. */
  status: string;
  /** What it has learned, one line each (a lift, a joint, an offer). */
  items: string[];
  /** What it is read from, and the research. */
  evidence: string;
  /** When the lifter last reset it. */
  resetAt: string | null;
  /** The reset's label, or null where there is nothing to reset. */
  reset: string | null;
}

const DAY_MS = 86_400_000;

const isJoint = (value: string): value is Joint => (JOINTS as readonly string[]).includes(value);

const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** The lifts in the log, newest first. */
function liftsIn(history: readonly WorkoutRecord[]): string[] {
  const seen = new Set<string>();
  const newestFirst = [...history].sort((a, b) =>
    (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt),
  );
  for (const record of newestFirst) for (const entry of record.entries) seen.add(entry.exerciseId);
  return [...seen].filter((id) => getExercise(id) !== undefined);
}

/** The last check was taken under another style than the plan runs now. */
function styleChanged(input: LearnedInput): boolean {
  const last = reserveReadings(input.history).at(-1);
  return last?.style != null && last.style !== resolveStyle(input.profile);
}

function reserveSection(input: LearnedInput): LearnedSection {
  const resetAt = input.resets.reserve ?? null;
  const status = reserveCheckStatus({
    history: input.history,
    profile: input.profile,
    now: input.now,
    resetAt,
  });
  const { estimate } = status;
  const items: string[] = [];
  const checks = plural(estimate.readings, 'check');
  let line: string;
  if (estimate.usable) {
    const off = Math.abs(estimate.bias);
    const rounded = Math.round(off * 10) / 10;
    const way = estimate.bias >= 0 ? 'more' : 'fewer';
    line =
      estimate.correction === 0
        ? `You judge it about right: within half a rep, from ${checks}.`
        : `You have about ${rounded} ${rounded === 1 ? 'rep' : 'reps'} ${way} left than you judge, from ${checks}.`;
    // The rules read it only while the checks are on (the review of item 47).
    if (status.on && estimate.correction !== 0 && estimate.band) {
      items.push(
        `On machine and cable isolation sets of ${estimate.band[0]} to ${estimate.band[1]} reps in all, the reserve you log is read as ${Math.abs(estimate.correction)} ${estimate.correction > 0 ? 'more' : 'fewer'}.`,
      );
    }
  } else if (!status.on && estimate.readings > 0) {
    // Off, the checks learn nothing more: say what there is, and that it is not read (the re-check).
    line = `Reserve checks are off: nothing is read through your ${checks}.`;
  } else if (estimate.readings >= RESERVE_CHECK.USABLE_READINGS) {
    line = `Not settled: your ${checks} scatter by more than ${RESERVE_CHECK.MAX_SCATTER} reps, so nothing is read through them yet.`;
  } else if (estimate.readings > 0) {
    line = `Still learning: ${checks} of the ${RESERVE_CHECK.USABLE_READINGS} it needs.`;
  } else if (!status.on) {
    line = 'Nothing learned: reserve checks are off.';
  } else if (status.lastAt && resetAt && Date.parse(status.lastAt) < Date.parse(resetAt)) {
    line = `Nothing learned since you reset it on ${shortDay(resetAt)}.`;
  } else if (status.lastAt && styleChanged(input)) {
    line = 'Nothing learned since your style changed: the checks start again under this one.';
  } else if (status.lastAt) {
    line = 'Nothing learned yet: no recent check measured your judgement.';
  } else {
    line = 'Nothing learned yet: no reserve check taken.';
  }
  if (!status.on && estimate.usable)
    items.push('Reserve checks are off, so it is not used and nothing new is learned.');
  if (status.lastAt) items.push(`Last check: ${shortDay(status.lastAt)}.`);
  return {
    key: 'reserve',
    title: 'How well you judge reps in reserve',
    status: line,
    items,
    evidence:
      'From your reserve checks: the last set of a machine or cable isolation lift taken on past your usual stop, the reps you judged left against the reps you then did. Lifters judge about one rep low on average (Halperin et al. 2022); yours is drawn toward that until your checks agree. Settings, Programming, turns the checks on or off.',
    resetAt,
    reset: 'Start learning again',
  };
}

function curveSection(input: LearnedInput): LearnedSection {
  const resetAt = input.resets.curves ?? null;
  const items: string[] = [];
  let active = 0;
  for (const exerciseId of liftsIn(input.history)) {
    const readings = curveReadings(input.history, exerciseId, input.now, resetAt);
    if (readings.length === 0) continue;
    const curve = liftCurve(input.history, exerciseId, input.now, resetAt);
    const name = requireExercise(exerciseId).name;
    if (curve.active) {
      active += 1;
      const way =
        curve.k < PERSONAL_CURVE.POPULATION_K
          ? 'your reps fall off with weight faster than most people’s'
          : 'your reps hold up with weight better than most people’s';
      items.push(
        `${name}: ${way}, from ${plural(curve.readings, 'set')} to failure; it sets a return after a break and the first target of a new rep range.`,
      );
    } else {
      items.push(
        `${name}: not sure enough yet, from ${plural(readings.length, 'set')} to failure; more checks at two rep ranges far apart settle it.`,
      );
    }
  }
  return {
    key: 'curves',
    title: 'Each lift’s own reps-to-weight curve',
    status:
      items.length === 0
        ? 'Nothing learned yet: it reads your reserve checks’ sets to failure.'
        : active > 0
          ? `In use on ${plural(active, 'lift')}.`
          : 'Learning: not in use on any lift yet.',
    items,
    evidence: `From your reserve checks’ sets to failure on a lift, in the last ${PERSONAL_CURVE.WINDOW_DAYS / 7} weeks, at two rep ranges: the reps you got at each weight. It is drawn toward the curve most people follow (Epley) and used only once your checks pin it down; a simulation of 2,000 lifters set that line.`,
    resetAt,
    reset: 'Forget the curves',
  };
}

function habitSection(input: LearnedInput): LearnedSection {
  const resetAt = input.resets.habit ?? null;
  const items: string[] = [];
  for (const exerciseId of liftsIn(input.history)) {
    const exercise = requireExercise(exerciseId);
    const bias = overrideBias(
      input.history,
      exerciseId,
      weightStep(exercise, input.profile.units),
      resetAt,
    );
    if (bias.steps === 0) continue;
    items.push(
      bias.steps > 0
        ? `${exercise.name}: above the suggested weight in ${bias.above} of your last ${bias.compared} sessions, so its target steps up to meet you.`
        : `${exercise.name}: below the suggested weight in ${bias.below} of your last ${bias.compared} sessions, so its target steps down to meet you.`,
    );
  }
  return {
    key: 'habit',
    title: 'Lifting above or below the suggested weight',
    status:
      items.length === 0
        ? 'Nothing learned: you lift about what is suggested.'
        : `Learned on ${plural(items.length, 'lift')}.`,
    items,
    evidence: `From the first working set of each lift’s last ${OVERRIDE_WINDOW} sessions: in ${OVERRIDE_MAJORITY} of them half a step or more off the suggested weight, the target moves a step your way instead of asking again.`,
    resetAt,
    reset: 'Forget the habit',
  };
}

function painSection(input: LearnedInput): LearnedSection {
  const resetAt = input.resets.pain ?? null;
  const items = painPatterns({ history: input.history, now: input.now, since: resetAt }).map(
    (pattern) => {
      const exercise = requireExercise(pattern.exerciseId).name;
      const other = requireExercise(pattern.alternativeId).name;
      const joint = jointWord(pattern.joint);
      return `${joint.charAt(0).toUpperCase()}${joint.slice(1)} pain with ${exercise} in ${pattern.reportDates.length} of ${plural(pattern.sessions, 'session')}, not with ${other} in ${pattern.cleanDates.length}.`;
    },
  );
  return {
    key: 'pain',
    title: 'Pain patterns',
    status:
      items.length === 0
        ? 'None: no joint keeps hurting with one exercise.'
        : `${plural(items.length, 'pattern')} in what you logged, not a diagnosis.`,
    items,
    evidence:
      'From the pain you noted on an exercise, or after a workout where one exercise loaded that joint, over the last six weeks: at least two sessions a week or more apart, in at least half the sessions with it, the latest included, and none with its alternative in two. Check-in soreness never counts for an exercise.',
    resetAt,
    reset: 'Forget the patterns',
  };
}

/** A declined offer's name, from where it came. */
export function declineName(key: string): string {
  // A key is the offer's source, then the lift it was about (or `*`); a source may hold `|` itself.
  const cut = key.lastIndexOf('|');
  const source = cut < 0 ? key : key.slice(0, cut);
  const exerciseId = cut < 0 ? '*' : key.slice(cut + 1);
  const lift = exerciseId !== '*' ? getExercise(exerciseId)?.name : undefined;
  const on = lift ? ` on ${lift}` : '';
  if (source.startsWith('pain pattern|')) {
    const joint = source.split('|')[2];
    const known = joint !== undefined && isJoint(joint);
    return `A pain pattern${known ? ` at the ${jointWord(joint)}` : ''}${on}`;
  }
  if (source.startsWith('push: stop')) return `Ending the lift to push${on}`;
  if (source.startsWith('push: review')) return `The twelve-week review of the lift to push${on}`;
  if (source.startsWith('strategy: ')) return `A suggestion about your plan${on}`;
  // Every offer by what it offered, never by the coach's own name for it (the review of item 47).
  const names: Record<string, string> = {
    'extra set': 'An extra set',
    'weekly coverage': 'Sets for a muscle behind its week',
    capped: 'At the heaviest weight here',
    'schedule move': 'Moving the schedule',
    'style: undulating': 'Rotating the rep ranges',
    'style: goals': 'A style that fits your goals',
    'variety: flat': 'A change for an accessory gone flat',
    'stall: route': 'The next step for a stalled lift',
    'stall: undershooting': 'Sets ending too easy on a stalled lift',
    'fewer reps': 'Fewer reps than last time',
    progression: 'A lighter reset for a lift',
    'drop-set opportunity': 'An optional drop set',
    'in-session reps': 'A longer rest between sets',
    fatigue: 'A lighter day for fatigue',
    'backup age': 'Backing up your history',
    'unfinished workout': 'Closing a workout left open',
    'rating pain': 'Pain after your last workout',
    'session pain': 'Protecting a joint today',
    'profile limitations': 'Watching a joint on a lift',
  };
  return `${names[source] ?? 'An offer'}${on}`;
}

function declineSection(input: LearnedInput): LearnedSection {
  // A pain pattern put away stays away until a new report, which names a new pattern: one whose
  // pattern has moved on, or gone, keeps nothing away and is not listed (the review of item 47).
  const live = new Set(
    painPatterns({ history: input.history, now: input.now, since: input.resets.pain ?? null }).map(
      (pattern) =>
        `${PAIN_PATTERN_SOURCE}|${pattern.exerciseId}|${pattern.joint}|${pattern.reportDates.at(-1)}`,
    ),
  );
  const isPain = (key: string) => key.startsWith(`${PAIN_PATTERN_SOURCE}|`);
  const entries = Object.entries(input.declines.declines)
    .filter(([key]) => !isPain(key) || live.has(key.slice(0, key.lastIndexOf('|'))))
    .sort((a, b) => b[1].lastAt.localeCompare(a[1].lastAt));
  const items = entries.map(([key, decline]) => {
    const back = Date.parse(decline.lastAt) + 7 * DAY_MS;
    const when = isPain(key)
      ? `declined ${shortDay(decline.lastAt)}: back with a new report`
      : decline.count >= 2
        ? 'declined twice: it stays away'
        : Date.parse(input.now) < back
          ? `declined ${shortDay(decline.lastAt)}: back from ${shortDay(new Date(back).toISOString())}`
          : `declined ${shortDay(decline.lastAt)}`;
    return `${declineName(key)}: ${when}.`;
  });
  return {
    key: 'declines',
    title: 'Offers you declined',
    status: items.length === 0 ? 'None.' : `${plural(items.length, 'offer')}.`,
    items,
    evidence:
      'Not now on an offer keeps it away for a week; twice, until you clear it here. A pain pattern’s stays away until a new report; a safety card’s, for that workout only.',
    resetAt: null,
    reset: items.length === 0 ? null : 'Clear them',
  };
}

export interface LearnedInput {
  history: readonly WorkoutRecord[];
  profile: UserProfile;
  now: string;
  resets: LearnedResets;
  declines: CoachDeclines;
}

export function learnedSections(input: LearnedInput): LearnedSection[] {
  return [
    {
      key: 'pace',
      title: 'Your pace',
      status: 'Not learned yet.',
      items: [],
      evidence:
        'How long your sets and rests take: workout times come from the plan’s own estimate of each set and rest.',
      resetAt: null,
      reset: null,
    },
    habitSection(input),
    curveSection(input),
    reserveSection(input),
    painSection(input),
    declineSection(input),
  ];
}
