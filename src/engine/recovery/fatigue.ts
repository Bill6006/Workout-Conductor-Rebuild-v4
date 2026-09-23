import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { Readiness } from '../recalibration/types';
import { holdById } from '../workout/setText';
import { ratingPainWords } from './painReport';

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
  /** Saved check-ins (last three) with low energy or sleep. */
  readinessTrend: number;
  /** Consecutive working sets in the last two sessions logged well past the usual rest. */
  longRests: number;
  /** Percent change of each lift's estimated max, newest against previous, averaged; null without pairs. */
  performanceDrift: number | null;
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
    const named = recentRatings.find((rating) => rating?.pain && rating.joint);
    const words = named ? ratingPainWords(named) : null;
    evidence.push(
      words
        ? `${words.charAt(0).toUpperCase()}${words.slice(1)} reported in a recent session.`
        : 'Pain reported in a recent session.',
    );
  }

  // Saved check-ins: a trend, not just today.
  const checkIns = qualifying
    .slice(0, 3)
    .map(
      (record) =>
        (record as { readiness?: { energy: number; sleep: number; soreness: number } | null })
          .readiness ?? null,
    )
    .filter(
      (entry): entry is { energy: number; sleep: number; soreness: number } => entry !== null,
    );
  const readinessTrend = checkIns.filter((entry) => entry.energy <= 2 || entry.sleep <= 2).length;
  const soreTrend = checkIns.filter((entry) => entry.soreness >= 4).length;
  if (readinessTrend >= 2) {
    score += 1;
    evidence.push(
      `Low energy or sleep in ${readinessTrend} of the last ${checkIns.length} check-ins.`,
    );
  }
  if (soreTrend >= 2) {
    score += 1;
    evidence.push(`Sore in ${soreTrend} of the last ${checkIns.length} check-ins.`);
  }

  // Rests that ran long between logged sets suggest grinding.
  let longRests = 0;
  for (const record of qualifying.slice(0, 2)) {
    for (const entry of record.entries) {
      const stamps = entry.sets
        .filter(
          (set) => set.kind === 'working' && set.completed && typeof set.loggedAt === 'string',
        )
        .map((set) => Date.parse(set.loggedAt as string))
        .filter((stamp) => !Number.isNaN(stamp))
        .sort((a, b) => a - b);
      const limit = entry.role?.includes('strength') ? 300_000 : 240_000;
      for (let index = 1; index < stamps.length; index += 1) {
        if ((stamps[index] as number) - (stamps[index - 1] as number) > limit) longRests += 1;
      }
    }
  }
  if (longRests >= 3) {
    score += 1;
    evidence.push(
      `Rests ran long: ${longRests} sets in the last two sessions took well over the usual rest.`,
    );
  }

  // Performance drift per lift: newest estimated max against the previous one, averaged.
  const maxes = new Map<string, number[]>();
  for (const record of qualifying.slice(0, 4)) {
    for (const entry of record.entries) {
      // A hold's seconds are not reps, so they carry no estimated max to drift.
      if (holdById(entry.exerciseId)) continue;
      let best = 0;
      for (const set of entry.sets) {
        if (set.kind === 'working' && set.completed && set.weight !== null) {
          best = Math.max(best, set.weight * (1 + Math.min(set.reps, 12) / 30));
        }
      }
      if (best > 0) maxes.set(entry.exerciseId, [...(maxes.get(entry.exerciseId) ?? []), best]);
    }
  }
  const changes: number[] = [];
  for (const list of maxes.values()) {
    if (list.length >= 2 && (list[1] as number) > 0) {
      changes.push((((list[0] as number) - (list[1] as number)) / (list[1] as number)) * 100);
    }
  }
  const performanceDrift =
    changes.length > 0
      ? Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 10) / 10
      : null;
  if (performanceDrift !== null && performanceDrift <= -10) {
    score += 2;
    evidence.push(
      `Estimated maxes fell ${Math.abs(performanceDrift)}% over the last two sessions.`,
    );
  } else if (performanceDrift !== null && performanceDrift <= -5) {
    score += 1;
    evidence.push(
      `Estimated maxes fell ${Math.abs(performanceDrift)}% over the last two sessions.`,
    );
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
  return {
    level,
    score,
    evidence,
    sessionsLast7Days,
    consecutiveDays,
    rirDrift,
    hardRatings,
    readinessTrend,
    longRests,
    performanceDrift,
  };
}
