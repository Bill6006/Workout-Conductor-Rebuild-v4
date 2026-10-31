import type { MuscleId } from '../../catalog/muscles/muscles';
import { localDayKey, localWeekKey } from '../../core/time/localDate';
import type { LongerAnswer, TimeAnswer, TimeOffers } from '../../core/validation/timeOffers';
import { RULES } from '../rules/ruleTable';

/**
 * What "Longer would help" learns from its answers (Maintenance 34; the owner, 2026-10-31): "The app
 * should learn the difference between repeatedly CHOOSING a short session and actually having limited
 * time. ... if I accept/tap it and train longer, that is evidence I had more time available; if I
 * choose 'Not now,' treat that as choosing the shorter session for that occasion. Do not infer
 * permanent availability from one response. Learn the pattern over time. Today's explicitly chosen
 * workout length always overrides forecasts and learned expectations."
 *
 * A pattern reads the latest answers of the last weeks and needs two of a kind; it only paces the
 * suggestion and words the honest card. It never changes a length: the length the lifter picks is
 * the day's.
 */

const DAY_MS = 86_400_000;

/** The answers a pattern reads: the latest few of the last weeks, newest first. */
function recentAnswers(record: TimeOffers, now: string): TimeAnswer[] {
  const since = Date.parse(now) - RULES.offersWeeks.value * 7 * DAY_MS;
  return record.answers
    .filter((answer) => answer.at <= now && Date.parse(answer.at) >= since)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, RULES.offersRead.value);
}

export type TimePattern = 'has-time' | 'chooses-short' | 'limited';

const PATTERN_OF: Record<LongerAnswer, TimePattern> = {
  longer: 'has-time',
  'not-now': 'chooses-short',
  same: 'limited',
};

/**
 * The pattern the answers show: the answer given most among the latest, two of a kind at least,
 * the newer where two kinds tie; null with no pattern yet. With it, the newest answer of its kind.
 */
export function timePattern(
  record: TimeOffers,
  now: string,
): { pattern: TimePattern; latest: string } | null {
  const recent = recentAnswers(record, now);
  const counts = new Map<LongerAnswer, number>();
  for (const answer of recent) counts.set(answer.answer, (counts.get(answer.answer) ?? 0) + 1);
  const most = Math.max(0, ...counts.values());
  if (most < RULES.offersPattern.value) return null;
  // Newest first: the first answer of a kind given most is the newer of a tie.
  const lead = recent.find((answer) => counts.get(answer.answer) === most)!;
  return { pattern: PATTERN_OF[lead.answer], latest: lead.at };
}

/**
 * Until when the suggestion rests: two weeks after the newest answer of a pattern of choosing the
 * shorter session, four after one of the time running short; null when it does not rest.
 */
export function longerPausedUntil(record: TimeOffers, now: string): string | null {
  const read = timePattern(record, now);
  if (!read || read.pattern === 'has-time') return null;
  const days =
    read.pattern === 'chooses-short' ? RULES.chosenPauseDays.value : RULES.limitedPauseDays.value;
  const until = new Date(Date.parse(read.latest) + days * DAY_MS).toISOString();
  return until > now ? until : null;
}

/** The muscles the lifter said "Not now" to this week: they wait for the next (decision 5). */
export function skippedThisWeek(record: TimeOffers, now: string): Set<MuscleId> {
  const week = localWeekKey(now);
  return new Set(
    record.answers
      .filter((answer) => answer.answer === 'not-now' && answer.week === week)
      .flatMap((answer) => answer.muscles),
  );
}

/**
 * Whether the suggestion may be on screen now: once a day at most, and on two days in seven; the
 * day's showing goes on all day. Never while a pattern rests it.
 */
export function mayShowLonger(record: TimeOffers, now: string): boolean {
  if (longerPausedUntil(record, now) !== null) return false;
  const today = localDayKey(now);
  const days = new Set(
    record.shown
      .filter((at) => at <= now && Date.parse(now) - Date.parse(at) < 7 * DAY_MS)
      .map((at) => localDayKey(at)),
  );
  if (days.has(today)) return true;
  return days.size < RULES.longerPerWeek.value;
}

/** The suggestion on screen now: the day's one showing, the record kept to two weeks. */
export function withShown(record: TimeOffers, now: string): TimeOffers {
  const today = localDayKey(now);
  if (record.shown.some((at) => localDayKey(at) === today)) return record;
  const since = Date.parse(now) - 14 * DAY_MS;
  return {
    ...record,
    shown: [...record.shown.filter((at) => Date.parse(at) >= since), now],
  };
}

/** An answer kept, the record kept to the weeks a pattern reads. */
export function withAnswer(record: TimeOffers, answer: TimeAnswer): TimeOffers {
  const since = Date.parse(answer.at) - RULES.offersWeeks.value * 7 * DAY_MS;
  return {
    ...record,
    answers: [...record.answers.filter((one) => Date.parse(one.at) >= since), answer],
  };
}

/**
 * The suggestion taken, answered once the workout ends (`resolvePending`): trained past halfway
 * from the length it was to the length taken, the time was there; less, it ran short; the length
 * picked back down before the end, the shorter session was chosen after all.
 */
export function resolvePending(
  record: TimeOffers,
  done: { at: string; trainedMinutes: number; chosenMinutes: number },
): TimeOffers {
  const pending = record.pending;
  if (!pending) return record;
  const settled: TimeOffers = { ...record, pending: null };
  // Taken on another day: that day's workout never ended, and says nothing.
  if (localDayKey(pending.at) !== localDayKey(done.at)) return settled;
  const step = pending.to - pending.from;
  const answer: LongerAnswer =
    done.chosenMinutes < pending.to - 1e-6
      ? 'not-now'
      : done.trainedMinutes >= pending.from + RULES.trainedLonger.value * step
        ? 'longer'
        : 'same';
  return withAnswer(settled, {
    at: pending.at,
    week: pending.week,
    muscles: [...pending.muscles],
    from: pending.from,
    to: pending.to,
    answer,
  });
}

/** Two records of the answers as one: every showing and answer either holds, the newer pending. */
export function mergeTimeOffers(saved: TimeOffers, shown: TimeOffers): TimeOffers {
  const days = new Map<string, string>();
  for (const at of [...saved.shown, ...shown.shown]) {
    const day = localDayKey(at);
    const other = days.get(day);
    if (other === undefined || at < other) days.set(day, at);
  }
  const answers = new Map<string, TimeAnswer>();
  for (const answer of [...saved.answers, ...shown.answers]) {
    answers.set(`${answer.at}|${answer.week}`, answer);
  }
  const newer = <T extends { at: string }>(a: T | null | undefined, b: T | null | undefined) =>
    !a ? (b ?? null) : !b ? a : a.at >= b.at ? a : b;
  return {
    ...saved,
    ...shown,
    shown: [...days.values()].sort(),
    answers: [...answers.values()].sort((a, b) => a.at.localeCompare(b.at)),
    pending: newer(saved.pending, shown.pending),
    goalsTime: newer(saved.goalsTime, shown.goalsTime),
  };
}
