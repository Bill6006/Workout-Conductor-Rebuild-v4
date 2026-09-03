import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { Readiness } from '../recalibration/types';

/**
 * Fatigue interpretation from actual records and today's readiness: sessions
 * in the last week, consecutive training days, how far logged reps in reserve
 * drifted below the targets, hard or painful session ratings, and the
 * check-in. The result feeds progression (hold loads when fatigue is high),
 * the coach, and the strategy analysis. Never a diagnosis from one poor set.
 */

export type FatigueLevel = 'fresh' | 'normal' | 'elevated' | 'high';

export interface FatigueSignal {
  level: FatigueLevel;
  score: number;
  evidence: string[];
  sessionsLast7Days: number;
  consecutiveDays: number;
  /** Average logged RIR minus target RIR over the last two sessions; negative means closer to failure. */
  rirDrift: number | null;
  hardRatings: number;
}

const DAY_MS = 86_400_000;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function interpretFatigue(
  history: readonly WorkoutRecord[],
  nowIso: string,
  readiness: Readiness | null = null,
): FatigueSignal {
  const now = Date.parse(nowIso);
  const qualifying = history
    .filter((record) =>
      record.entries.some((entry) =>
        entry.sets.some((set) => set.kind === 'working' && set.completed),
      ),
    )
    .sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt));
  const evidence: string[] = [];
  let score = 0;

  const sessionsLast7Days = qualifying.filter(
    (record) => now - Date.parse(record.completedAt ?? record.startedAt) <= 7 * DAY_MS,
  ).length;
  if (sessionsLast7Days >= 5) {
    score += 2;
    evidence.push(`${sessionsLast7Days} sessions in the last 7 days.`);
  } else if (sessionsLast7Days === 4) {
    score += 1;
    evidence.push('4 sessions in the last 7 days.');
  }

  const days = [
    ...new Set(qualifying.map((record) => dayKey(record.completedAt ?? record.startedAt))),
  ];
  let consecutiveDays = 0;
  let cursor = dayKey(nowIso);
  const yesterday = (key: string) =>
    new Date(Date.parse(`${key}T12:00:00.000Z`) - DAY_MS).toISOString().slice(0, 10);
  if (!days.includes(cursor)) cursor = yesterday(cursor);
  while (days.includes(cursor)) {
    consecutiveDays += 1;
    cursor = yesterday(cursor);
  }
  if (consecutiveDays >= 4) {
    score += 2;
    evidence.push(`${consecutiveDays} training days in a row.`);
  } else if (consecutiveDays === 3) {
    score += 1;
    evidence.push('3 training days in a row.');
  }

  const drifts: number[] = [];
  for (const record of qualifying.slice(0, 2)) {
    for (const entry of record.entries) {
      for (const set of entry.sets) {
        if (
          set.kind === 'working' &&
          set.completed &&
          set.rir !== null &&
          typeof set.targetRir === 'number'
        ) {
          drifts.push(set.rir - set.targetRir);
        }
      }
    }
  }
  const rirDrift =
    drifts.length >= 3
      ? Math.round((drifts.reduce((a, b) => a + b, 0) / drifts.length) * 10) / 10
      : null;
  if (rirDrift !== null && rirDrift <= -1) {
    score += 2;
    evidence.push(`Working ${Math.abs(rirDrift)} reps closer to failure than planned.`);
  } else if (rirDrift !== null && rirDrift <= -0.5) {
    score += 1;
    evidence.push('Sets running slightly closer to failure than planned.');
  }

  const recentRatings = qualifying
    .slice(0, 3)
    .map((record) => record.rating)
    .filter(Boolean);
  const hardRatings = recentRatings.filter((rating) => rating?.effort === 'too-hard').length;
  if (hardRatings >= 2) {
    score += 2;
    evidence.push(`${hardRatings} of the last ${recentRatings.length} sessions rated too hard.`);
  } else if (hardRatings === 1) {
    score += 1;
    evidence.push('One recent session rated too hard.');
  }
  if (recentRatings.some((rating) => rating?.pain)) {
    score += 1;
    evidence.push('Pain reported in a recent session.');
  }

  if (readiness) {
    if (readiness.energy <= 2 || readiness.sleep <= 2) {
      score += 2;
      evidence.push('Low energy or sleep in today’s check-in.');
    }
    if (readiness.soreness >= 4) {
      score += 1;
      evidence.push('Sore today.');
    }
    if (readiness.energy >= 4 && readiness.sleep >= 4 && readiness.soreness <= 2) {
      score -= 1;
      evidence.push('Feeling fresh in today’s check-in.');
    }
  }

  const level: FatigueLevel =
    score >= 5 ? 'high' : score >= 3 ? 'elevated' : score >= 1 ? 'normal' : 'fresh';
  if (evidence.length === 0) evidence.push('No fatigue signals in recent sessions.');
  return { level, score, evidence, sessionsLast7Days, consecutiveDays, rirDrift, hardRatings };
}
