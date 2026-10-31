import { localDayKey, localDaysBetween, localWeekday } from '../../core/time/localDate';
import type { Weekday } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RULES } from '../rules/ruleTable';
import type { DurationChoice } from '../workout/types';
import { trainedIn } from './catchUp';

/**
 * Each weekday's expected length (Maintenance 34, the approved proposal part 2: "Expected lengths
 * forecast the week; today's choice overrides immediately. The forecast weighs your last few weeks
 * by weekday, so it adapts within about two weeks if you start training longer"). Read from the
 * lifter's own sessions on that weekday over the last four weeks: the median of the latest three,
 * the latest of two, or the one; the Default with none, since another weekday's length says little
 * about this one. A day counts once, by its first session trained: a second workout is the day's
 * extra, not its length. A session from before lengths were kept reads as the Default.
 *
 * Lengths forecast the week and nothing more: goals never bend to them (proposal part 4), and the
 * length chosen for today always stands over the forecast (the owner, 2026-10-31).
 */

/** A length's minutes: the Default's are the lifter's own. */
export function choiceMinutes(choice: DurationChoice, defaultMinutes: number): number {
  return choice === 'default' ? defaultMinutes : choice;
}

export function expectedLength(
  history: readonly WorkoutRecord[],
  weekday: Weekday,
  now: string,
  defaultMinutes: number,
): DurationChoice {
  const window = RULES.lengthWeeks.value * 7;
  const firsts = new Map<string, WorkoutRecord>();
  for (const record of history) {
    if (record.startedAt > now || !trainedIn(record)) continue;
    if (localWeekday(record.startedAt) !== weekday) continue;
    const ago = localDaysBetween(record.startedAt, now);
    if (ago < 0 || ago > window) continue;
    const day = localDayKey(record.startedAt);
    const first = firsts.get(day);
    if (!first || record.startedAt < first.startedAt) firsts.set(day, record);
  }
  const latest = [...firsts.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, RULES.lengthSessions.value)
    .map((record) => record.durationChoice ?? 'default');
  if (latest.length === 0) return 'default';
  if (latest.length < RULES.lengthSessions.value) return latest[0] as DurationChoice;
  const sorted = [...latest].sort(
    (a, b) => choiceMinutes(a, defaultMinutes) - choiceMinutes(b, defaultMinutes),
  );
  return sorted[Math.floor(sorted.length / 2)] as DurationChoice;
}
