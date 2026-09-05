import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { FatigueSignal } from '../recovery/fatigue';
import { computeExposure } from '../volume/weeklyVolume';

/**
 * A deload week, recommended from accumulated fatigue and planned with a date
 * on the Plan tab. While the week runs, every generated session carries one
 * set fewer per exercise, one more rep in reserve, and loads ten percent
 * lighter, and says so. Nothing is planned without a tap.
 */

export interface DeloadWindow {
  startsAt: string;
  endsAt: string;
}

export interface DeloadRecommendation {
  recommended: boolean;
  window: DeloadWindow | null;
  reasons: string[];
}

export interface DeloadWeek extends DeloadWindow {
  id: 'deload-week';
  plannedAt: string;
  reasons: string[];
}

export const DELOAD_WEEK_ID = 'deload-week';
export const DELOAD_LOAD_SCALE = 0.9;
export const DELOAD_SETS_DELTA = -1;
export const DELOAD_RIR_DELTA = 1;

const DAY_MS = 86_400_000;
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function weekdayOf(iso: string): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[(new Date(iso).getUTCDay() + 6) % 7] as (typeof WEEKDAYS)[number];
}

function dayStart(iso: string, offsetDays: number): string {
  const date = new Date(Date.parse(iso) + offsetDays * DAY_MS);
  return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

/** The next available training day after today, then a seven-day window. */
export function nextWindow(profile: UserProfile, now: string): DeloadWindow {
  const available = new Set<string>(profile.schedule.availableDays);
  for (let offset = 1; offset <= 7; offset += 1) {
    const start = dayStart(now, offset);
    if (available.size === 0 || available.has(weekdayOf(start))) {
      return { startsAt: start, endsAt: dayStart(start, 7) };
    }
  }
  const start = dayStart(now, 1);
  return { startsAt: start, endsAt: dayStart(start, 7) };
}

export function inDeloadWindow(window: DeloadWindow | null | undefined, now: string): boolean {
  if (!window) return false;
  const at = Date.parse(now);
  return at >= Date.parse(window.startsAt) && at < Date.parse(window.endsAt);
}

export function windowIsPast(window: DeloadWindow, now: string): boolean {
  return Date.parse(now) >= Date.parse(window.endsAt);
}

/**
 * Recommend a deload when fatigue has accumulated: a dense fortnight plus a
 * fatigue score that is elevated or high, and at least one sign the body is
 * not keeping up (maxes slipping, sets running close to failure, hard
 * ratings, or poor check-ins).
 */
export function recommendDeload(
  history: readonly WorkoutRecord[],
  fatigue: FatigueSignal,
  profile: UserProfile,
  now: string,
): DeloadRecommendation {
  const exposure = computeExposure(history, now);
  const reasons: string[] = [];
  if (exposure.sessionsLast14Days >= 6) {
    reasons.push(`${exposure.sessionsLast14Days} sessions in the last 14 days.`);
  }
  const signs: string[] = [];
  if (fatigue.performanceDrift !== null && fatigue.performanceDrift <= -5) {
    signs.push(
      `estimated maxes fell ${Math.abs(fatigue.performanceDrift)}% over the last two sessions`,
    );
  }
  if (fatigue.rirDrift !== null && fatigue.rirDrift <= -0.5) {
    signs.push('sets have been running closer to failure than planned');
  }
  if (fatigue.hardRatings >= 2) signs.push(`${fatigue.hardRatings} recent sessions rated too hard`);
  if (fatigue.readinessTrend >= 2) signs.push('low energy or sleep in most recent check-ins');
  const recommended = exposure.sessionsLast14Days >= 6 && fatigue.score >= 4 && signs.length > 0;
  if (signs.length > 0) {
    reasons.push(`${signs[0]!.charAt(0).toUpperCase()}${signs[0]!.slice(1)}.`);
    for (const sign of signs.slice(1))
      reasons.push(`${sign.charAt(0).toUpperCase()}${sign.slice(1)}.`);
  }
  reasons.push(`Fatigue ${fatigue.level} (score ${fatigue.score}).`);
  return {
    recommended,
    window: recommended ? nextWindow(profile, now) : null,
    reasons,
  };
}

export function formatWindow(window: DeloadWindow): string {
  const format = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  const lastDay = new Date(Date.parse(window.endsAt) - DAY_MS).toISOString();
  return `${format(window.startsAt)} to ${format(lastDay)}`;
}
