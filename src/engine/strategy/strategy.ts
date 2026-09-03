import { getExercise, requireExercise } from '../../catalog/exercises/catalog';
import { muscleName, type MuscleId, MUSCLE_IDS } from '../../catalog/muscles/muscles';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { weightStep } from '../plateMath/plateMath';
import { performanceHistory, type PerformancePoint } from '../progression/progression';
import type { FatigueSignal } from '../recovery/fatigue';
import { computeWeeklyVolume, goalWeights, weeklyTargets } from '../volume/weeklyVolume';

/**
 * Multi-session strategy: plateau diagnosis across recent qualifying sessions,
 * computed on demand from the records (no stored analysis snapshots). Every
 * insight needs at least two sessions of evidence and stays a recommendation
 * the user applies; nothing here changes a workout by itself.
 */

export type PlateauKind = 'load' | 'rep' | 'fatigue' | 'recovery' | 'fit' | 'coverage';

export type StrategyRecommendation =
  | 'hold'
  | 'add-reps'
  | 'add-weight'
  | 'increase-rest'
  | 'micro-deload'
  | 'adjust-volume'
  | 'open-alternatives';

export interface StrategyInsight {
  kind: PlateauKind;
  recommendation: StrategyRecommendation;
  headline: string;
  why: string[];
  exerciseId?: string;
  muscle?: MuscleId;
  sessions: number;
  confidence: 'low' | 'medium' | 'high';
  severity: number;
}

export interface StrategyInput {
  history: readonly WorkoutRecord[];
  profile: UserProfile;
  now: string;
  fatigue: FatigueSignal;
}

const DAY_MS = 86_400_000;

/** Records with at least one completed working set, newest first. */
export function qualifyingSessions(history: readonly WorkoutRecord[]): WorkoutRecord[] {
  return history
    .filter((record) =>
      record.entries.some((entry) =>
        entry.sets.some((set) => set.kind === 'working' && set.completed),
      ),
    )
    .sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt));
}

function sameLoad(a: PerformancePoint, b: PerformancePoint, step: number): boolean {
  if (a.bestWeight === null || b.bestWeight === null) return a.bestWeight === b.bestWeight;
  return Math.abs(a.bestWeight - b.bestWeight) < step / 2;
}

function firstToLastDrop(point: PerformancePoint): number {
  const first = point.sets[0];
  const last = point.sets[point.sets.length - 1];
  return first && last ? first.reps - last.reps : 0;
}

function exerciseInsights(
  input: StrategyInput,
  sessions: readonly WorkoutRecord[],
): StrategyInsight[] {
  const insights: StrategyInsight[] = [];
  const ids = new Set(
    sessions.flatMap((record) =>
      record.entries
        .filter((entry) => entry.sets.some((set) => set.kind === 'working' && set.completed))
        .map((entry) => entry.exerciseId),
    ),
  );
  for (const exerciseId of ids) {
    const exercise = getExercise(exerciseId);
    if (!exercise) continue;
    const points = performanceHistory(sessions, exercise, 4).filter((point) => !point.viaFamily);
    if (points.length < 3) continue;
    const [a, b, c] = points as [PerformancePoint, PerformancePoint, PerformancePoint];
    const step = weightStep(exercise, input.profile.units);
    const units = input.profile.units;
    const stuck = sameLoad(a, b, step) && sameLoad(b, c, step);
    const load = a.bestWeight === null ? 'bodyweight' : `${a.bestWeight} ${units}`;

    if (stuck && [a, b, c].filter((point) => point.topAll).length >= 2) {
      insights.push({
        kind: 'load',
        recommendation: 'add-weight',
        headline: `${exercise.name} is ready for more load`,
        why: [
          `Three sessions at ${load} while hitting the top of the range.`,
          `Next step: add ${step} ${units} and work back up the range.`,
        ],
        exerciseId,
        sessions: 3,
        confidence: 'high',
        severity: 2,
      });
      continue;
    }
    if (stuck && [a, b].every((point) => point.under)) {
      insights.push({
        kind: 'load',
        recommendation: 'micro-deload',
        headline: `${exercise.name} is stalling at ${load}`,
        why: [
          'Below the rep floor two sessions in a row at the same load.',
          'A 10% micro-deload rebuilds the reps before adding load again.',
        ],
        exerciseId,
        sessions: 2,
        confidence: 'medium',
        severity: 3,
      });
      continue;
    }
    const drops = [a, b, c].filter((point) => firstToLastDrop(point) >= 2).length;
    if (drops >= 2) {
      insights.push({
        kind: 'rep',
        recommendation: 'increase-rest',
        headline: `${exercise.name} fades late in the sets`,
        why: [
          `Reps dropped by 2 or more from the first to the last set in ${drops} of the last 3 sessions.`,
          'More rest between sets keeps the later sets in range.',
        ],
        exerciseId,
        sessions: drops,
        confidence: 'medium',
        severity: 2,
      });
      continue;
    }
    if (stuck && !a.topAll && a.bestReps <= c.bestReps && a.floorAll && c.floorAll) {
      insights.push({
        kind: 'rep',
        recommendation: 'add-reps',
        headline: `${exercise.name} reps have flattened`,
        why: [
          `Best set ${c.bestReps} reps three sessions ago, ${a.bestReps} now, at ${load}.`,
          'Hold the load and push each set one rep higher before adding weight.',
        ],
        exerciseId,
        sessions: 3,
        confidence: 'medium',
        severity: 1,
      });
    }
  }
  return insights;
}

function fitInsights(sessions: readonly WorkoutRecord[]): StrategyInsight[] {
  const appearances = new Map<string, { total: number; swappedOrSkipped: number }>();
  for (const record of sessions.slice(0, 8)) {
    for (const entry of record.entries) {
      const ids = [entry.exerciseId, ...(entry.replacedFrom ? [entry.replacedFrom] : [])];
      for (const id of ids) {
        const stat = appearances.get(id) ?? { total: 0, swappedOrSkipped: 0 };
        stat.total += 1;
        if (
          (entry.replacedFrom && id === entry.replacedFrom) ||
          record.skippedExerciseIds.includes(id)
        ) {
          stat.swappedOrSkipped += 1;
        }
        appearances.set(id, stat);
      }
    }
  }
  const insights: StrategyInsight[] = [];
  for (const [exerciseId, stat] of appearances) {
    if (stat.total < 3 || stat.swappedOrSkipped < 2) continue;
    const exercise = getExercise(exerciseId);
    if (!exercise) continue;
    insights.push({
      kind: 'fit',
      recommendation: 'open-alternatives',
      headline: `${exercise.name} keeps getting swapped or skipped`,
      why: [
        `${stat.swappedOrSkipped} of its last ${stat.total} appearances were replaced or skipped.`,
        'Pick an alternative you will actually do, or mark it disliked in the Library.',
      ],
      exerciseId,
      sessions: stat.swappedOrSkipped,
      confidence: stat.total >= 4 ? 'high' : 'medium',
      severity: 2,
    });
  }
  return insights;
}

function coverageInsights(
  input: StrategyInput,
  sessions: readonly WorkoutRecord[],
): StrategyInsight[] {
  const recent = sessions.filter(
    (record) =>
      Date.parse(input.now) - Date.parse(record.completedAt ?? record.startedAt) <= 14 * DAY_MS,
  );
  if (recent.length < 3) return [];
  const thisWeek = computeWeeklyVolume(input.history, input.now);
  const lastWeek = computeWeeklyVolume(
    input.history,
    new Date(Date.parse(input.now) - 7 * DAY_MS).toISOString(),
  );
  const weights = goalWeights(input.profile);
  const targets = weeklyTargets(input.profile);
  const insights: StrategyInsight[] = [];
  for (const muscle of MUSCLE_IDS) {
    if (weights[muscle] < 1.05) continue;
    const target = targets[muscle];
    if (target <= 0) continue;
    const done = thisWeek[muscle].direct + thisWeek[muscle].indirect;
    const before = lastWeek[muscle].direct + lastWeek[muscle].indirect;
    if (done < target * 0.5 && before < target * 0.5) {
      insights.push({
        kind: 'coverage',
        recommendation: 'adjust-volume',
        headline: `${muscleName(muscle)} is under its weekly target`,
        why: [
          `${Math.round(done)} of ${target} sets this week and ${Math.round(before)} of ${target} last week.`,
          'One more set on its exercises, or a session that leads with it, closes the gap.',
        ],
        muscle,
        sessions: recent.length,
        confidence: 'medium',
        severity: 1,
      });
    }
  }
  return insights;
}

function recoveryInsights(
  input: StrategyInput,
  sessions: readonly WorkoutRecord[],
): StrategyInsight[] {
  const insights: StrategyInsight[] = [];
  const { fatigue } = input;
  const anchors = sessions.slice(0, 4).map((record) => {
    const best = record.entries
      .flatMap((entry) =>
        entry.sets
          .filter((set) => set.kind === 'working' && set.completed && set.weight !== null)
          .map((set) => ({
            id: entry.exerciseId,
            e1rm: (set.weight ?? 0) * (1 + Math.min(set.reps, 12) / 30),
          })),
      )
      .sort((a, b) => b.e1rm - a.e1rm)[0];
    return best ?? null;
  });
  const [n1, n2, o1, o2] = anchors;
  const declining =
    n1 && n2 && o1 && o2 && (n1.e1rm + n2.e1rm) / 2 < ((o1.e1rm + o2.e1rm) / 2) * 0.95;
  if (fatigue.level === 'high' && declining) {
    insights.push({
      kind: 'fatigue',
      recommendation: 'micro-deload',
      headline: 'Fatigue is high and performance is slipping',
      why: [
        ...fatigue.evidence.slice(0, 2),
        'Top-set estimates fell 5% or more over the last two sessions.',
      ],
      sessions: 4,
      confidence: 'medium',
      severity: 3,
    });
  } else if (fatigue.level === 'high') {
    insights.push({
      kind: 'fatigue',
      recommendation: 'hold',
      headline: 'Fatigue is high',
      why: [...fatigue.evidence.slice(0, 3), 'Hold loads today and let the reps confirm recovery.'],
      sessions: Math.max(2, fatigue.sessionsLast7Days),
      confidence: 'medium',
      severity: 2,
    });
  }
  if (fatigue.consecutiveDays >= 3 || fatigue.hardRatings >= 2) {
    insights.push({
      kind: 'recovery',
      recommendation: 'hold',
      headline: 'Recovery is behind',
      why: [
        fatigue.consecutiveDays >= 3
          ? `${fatigue.consecutiveDays} training days in a row.`
          : `${fatigue.hardRatings} recent sessions rated too hard.`,
        'A rest day, or a shorter session at held loads, beats a flat one.',
      ],
      sessions: Math.max(2, fatigue.consecutiveDays),
      confidence: 'medium',
      severity: 2,
    });
  }
  return insights;
}

export function analyzeStrategy(input: StrategyInput): StrategyInsight[] {
  const sessions = qualifyingSessions(input.history).slice(0, 12);
  if (sessions.length < 2) return [];
  return [
    ...exerciseInsights(input, sessions),
    ...fitInsights(sessions),
    ...coverageInsights(input, sessions),
    ...recoveryInsights(input, sessions),
  ].sort((a, b) => b.severity - a.severity || a.headline.localeCompare(b.headline));
}

/** Plain-language feedback on a just-saved session, exercise by exercise, then overall. */
export function sessionFeedback(
  record: WorkoutRecord,
  history: readonly WorkoutRecord[],
  profile: UserProfile,
): string[] {
  const units = profile.units;
  const before = history.filter((candidate) => candidate.id !== record.id);
  const lines: string[] = [];
  let progressed = 0;
  let onTarget = 0;
  let short = 0;
  for (const entry of record.entries) {
    const sets = entry.sets.filter((set) => set.kind === 'working' && set.completed);
    if (sets.length === 0) continue;
    const exercise = requireExercise(entry.exerciseId);
    const previous = performanceHistory(before, exercise, 1).find((point) => !point.viaFamily);
    const best = [...sets].sort(
      (a, b) => (b.weight ?? 0) * b.reps - (a.weight ?? 0) * a.reps || b.reps - a.reps,
    )[0] as (typeof sets)[number];
    const floor = sets.every((set) => !set.targetReps || set.reps >= set.targetReps[0]);
    const planned = entry.plannedSets ?? sets.length;
    const bestLine = `${best.weight === null ? 'bodyweight' : `${best.weight} ${units}`} × ${best.reps}`;
    if (
      previous &&
      previous.e1rm !== null &&
      best.weight !== null &&
      best.weight * (1 + Math.min(best.reps, 12) / 30) > previous.e1rm * 1.02
    ) {
      progressed += 1;
      lines.push(
        `${exercise.name}: progressed, ${previous.bestWeight ?? 'bodyweight'} × ${previous.bestReps} became ${bestLine}.`,
      );
    } else if (sets.length < planned || !floor) {
      short += 1;
      lines.push(
        `${exercise.name}: short, ${sets.length} of ${planned} sets${floor ? '' : ' with reps under the floor'}. Hold the load next time.`,
      );
    } else {
      onTarget += 1;
      lines.push(`${exercise.name}: on target at ${bestLine}.`);
    }
  }
  if (lines.length === 0) return ['Nothing logged this session, so there is nothing to grade.'];
  const summary = `${progressed} progressed, ${onTarget} on target, ${short} short.`;
  const rating = record.rating;
  const tone = rating?.pain
    ? 'Pain was reported: the next session protects that joint first.'
    : rating?.effort === 'too-hard'
      ? 'Rated too hard: loads hold until the reps come easier.'
      : rating?.effort === 'too-easy'
        ? 'Rated too easy: the next targets step up where the reps allow.'
        : '';
  return [summary, ...lines.slice(0, 6), ...(tone ? [tone] : [])];
}
