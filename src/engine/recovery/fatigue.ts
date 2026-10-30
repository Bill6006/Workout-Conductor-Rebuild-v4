import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { oncePerCheckIn } from '../readiness/checkIn';
import { holdById } from '../workout/setText';
import { againstEarlier, askedRead, type AskedRead } from './againstAsked';
import { ratingPainWords } from './painReport';

/**
 * Fatigue interpretation from actual records: how far logged reps in reserve drifted below the
 * targets, hard or painful session ratings, rests that ran long, and estimated maxes falling. The
 * result feeds progression (hold loads when fatigue is high), the coach, and the strategy analysis.
 * Never a diagnosis from one poor set.
 *
 * Since Maintenance 33 (docs/proposals/week-model-readiness-time.md, part 1; the owner's decision
 * 1) no day count scores: fatigue stays in the trained muscles (Behm 2021, 33818751), and
 * consecutive days are no problem in themselves (27682004, 29967584), so recovery is judged per
 * muscle (`recovery.ts`). Nor does the check-in: it lowers what the app expects of the day's first
 * sets, never the plan (`readCheckIn`). The week's sessions are still counted, for the words.
 */

export type FatigueLevel = 'fresh' | 'normal' | 'elevated' | 'high';

export interface FatigueSignal {
  level: FatigueLevel;
  score: number;
  evidence: string[];
  /** Sessions in the last seven days, for the words; they score nothing (Maintenance 33). */
  sessionsLast7Days: number;
  /** Average logged RIR minus target RIR over the last two sessions; negative means closer to failure. */
  rirDrift: number | null;
  hardRatings: number;
  /** Saved check-ins (last three) with low energy or sleep. */
  readinessTrend: number;
  /** Consecutive working sets in the last two sessions logged well past the usual rest. */
  longRests: number;
  /**
   * Percent change of each lift's estimated max, newest against previous, each set read against
   * what it asked (`againstAsked`), averaged; null without pairs (Maintenance 33).
   */
  performanceDrift: number | null;
  /** A lift's pair in the drift was read against what its sets asked: the words say so. */
  performanceAgainstAsked: boolean;
}

const DAY_MS = 86_400_000;

export function interpretFatigue(history: readonly WorkoutRecord[], nowIso: string): FatigueSignal {
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

  // Saved check-ins with low energy or sleep, counted for the deload's words; they score nothing.
  // Each told once, on a day of two workouts too (the fifth review of Maintenance 33).
  const readinessTrend = oncePerCheckIn(qualifying.slice(0, 3)).filter(
    (record) => record.readiness && (record.readiness.energy <= 2 || record.readiness.sleep <= 2),
  ).length;

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

  // Performance drift per lift: its newest session's best set against the session before's, each
  // read against what it asked (Maintenance 33, `againstAsked`): at the same ask as lifted, at
  // another against its own, so the plan's own change lifted as asked is no fall. A load planned
  // lighter later in a session (the eighth review of round N: a shoulder press after three pressing
  // lifts read 17% down against the full-body day's), in a deload week, or the plan's load step after
  // the reps climbed its range (the first review of Maintenance 33: read 10% down) is none. A
  // session saved with no targets is read as it is, and set only against another such.
  const reads = new Map<string, AskedRead[]>();
  const estimate = (weight: number, reps: number) => weight * (1 + Math.min(reps, 12) / 30);
  for (const record of qualifying.slice(0, 4)) {
    for (const entry of record.entries) {
      // A hold's seconds are not reps, so they carry no estimated max to drift; a straight day at
      // the back-offs' load is lighter by design, no fall (the fifth review of round N), nor are its
      // back-offs: a session with its top set skipped reads nothing (the seventh).
      if (holdById(entry.exerciseId) || entry.atBackOffs === true) continue;
      let best: { set: (typeof entry.sets)[number]; max: number } | null = null;
      for (const set of entry.sets) {
        if (
          set.kind !== 'working' ||
          !set.completed ||
          set.weight === null ||
          set.weight <= 0 ||
          set.tier === 'back-off'
        ) {
          continue;
        }
        const max = estimate(set.weight, set.reps);
        if (best === null || max > best.max) best = { set, max };
      }
      if (best !== null) {
        reads.set(entry.exerciseId, [
          ...(reads.get(entry.exerciseId) ?? []),
          askedRead(best.set, best.max, estimate),
        ]);
      }
    }
  }
  const changes: number[] = [];
  let performanceAgainstAsked = false;
  for (const list of reads.values()) {
    const [newest, before] = list;
    const share = newest && before ? againstEarlier(newest, before) : null;
    if (share !== null) {
      changes.push((share - 1) * 100);
      performanceAgainstAsked ||= newest?.ask !== null;
    }
  }
  const fell = (by: number) => `${performanceFellWords(by, performanceAgainstAsked)}.`;
  const performanceDrift =
    changes.length > 0
      ? Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 10) / 10
      : null;
  if (performanceDrift !== null && performanceDrift <= -10) {
    score += 2;
    evidence.push(fell(Math.abs(performanceDrift)));
  } else if (performanceDrift !== null && performanceDrift <= -5) {
    score += 1;
    evidence.push(fell(Math.abs(performanceDrift)));
  }

  const level: FatigueLevel =
    score >= 5 ? 'high' : score >= 3 ? 'elevated' : score >= 1 ? 'normal' : 'fresh';
  if (evidence.length === 0) evidence.push('No fatigue signals in recent sessions.');
  return {
    level,
    score,
    evidence,
    sessionsLast7Days,
    rirDrift,
    hardRatings,
    readinessTrend,
    longRests,
    performanceDrift,
    performanceAgainstAsked,
  };
}

/** The drift's fall in words, without the stop, as the evidence and the deload advice say it. */
export function performanceFellWords(by: number, againstAsked: boolean): string {
  return againstAsked
    ? `Lifts fell ${by}% against what their sets asked over the last two sessions`
    : `Estimated maxes fell ${by}% over the last two sessions`;
}
