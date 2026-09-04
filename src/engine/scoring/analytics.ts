import { getExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, muscleName, type MuscleId } from '../../catalog/muscles/muscles';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { performanceHistory, type PerformancePoint } from '../progression/progression';
import { restCategory } from '../progression/roles';
import { qualifyingSessions } from '../strategy/strategy';
import { computeWeeklyVolume, goalWeights, weeklyTargets } from '../volume/weeklyVolume';

/**
 * Progress analytics. Every score carries its definition, the data it used, a
 * sample count, a confidence, and a plain explanation, so the screen never
 * shows a number without saying where it came from. Sparse data reads as low or
 * no confidence instead of false precision.
 */

export type Confidence = 'none' | 'low' | 'medium' | 'high';

export interface Score<T> {
  value: T;
  definition: string;
  samples: number;
  confidence: Confidence;
  explanation: string;
  data: string[];
}

const DAY_MS = 86_400_000;

export function confidenceFor(samples: number): Confidence {
  if (samples <= 0) return 'none';
  if (samples <= 2) return 'low';
  if (samples <= 5) return 'medium';
  return 'high';
}

function when(record: WorkoutRecord): string {
  return record.completedAt ?? record.startedAt;
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Monday 00:00 UTC of the week containing the date. */
function weekStart(iso: string): number {
  const date = new Date(iso);
  const day = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day);
}

export interface WeekBucket {
  start: string;
  label: string;
  sessions: number;
  planned: number;
}

export interface ConsistencyValue {
  weeks: WeekBucket[];
  thisWeek: number;
  planned: number;
  averagePerWeek: number | null;
  streakWeeks: number;
}

export function consistencyScore(
  history: readonly WorkoutRecord[],
  profile: UserProfile,
  now: string,
  weeks = 8,
): Score<ConsistencyValue> {
  const sessions = qualifyingSessions(history);
  const planned = profile.schedule.weeklyFrequency;
  const currentStart = weekStart(now);
  const buckets: WeekBucket[] = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = currentStart - index * 7 * DAY_MS;
    const end = start + 7 * DAY_MS;
    const count = sessions.filter((record) => {
      const at = Date.parse(when(record));
      return at >= start && at < end;
    }).length;
    buckets.push({
      start: new Date(start).toISOString(),
      label: shortDate(new Date(start).toISOString()),
      sessions: count,
      planned,
    });
  }
  const firstSession =
    sessions.length > 0 ? Date.parse(when(sessions[sessions.length - 1] as WorkoutRecord)) : null;
  const active = buckets.filter(
    (bucket) => firstSession !== null && Date.parse(bucket.start) + 7 * DAY_MS > firstSession,
  );
  const averagePerWeek =
    active.length > 0
      ? Math.round(
          (active.reduce((sum, bucket) => sum + bucket.sessions, 0) / active.length) * 10,
        ) / 10
      : null;
  let streakWeeks = 0;
  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    const bucket = buckets[index] as WeekBucket;
    if (bucket.sessions >= 1) streakWeeks += 1;
    else if (index === buckets.length - 1) continue;
    else break;
  }
  const thisWeek = buckets[buckets.length - 1]?.sessions ?? 0;
  return {
    value: { weeks: buckets, thisWeek, planned, averagePerWeek, streakWeeks },
    definition: `Sessions with at least one completed working set, counted per calendar week (Monday to Sunday) against your planned ${planned} per week.`,
    samples: sessions.length,
    confidence: confidenceFor(active.length >= 2 ? sessions.length : Math.min(sessions.length, 2)),
    explanation:
      sessions.length === 0
        ? 'No sessions logged yet, so there is nothing to average.'
        : `${sessions.length} sessions over ${active.length} ${active.length === 1 ? 'week' : 'weeks'} since your first: ${averagePerWeek} per week on average, ${streakWeeks} ${streakWeeks === 1 ? 'week' : 'weeks'} in a row with training.`,
    data: buckets.map((bucket) => `Week of ${bucket.label}: ${bucket.sessions} of ${planned}`),
  };
}

export interface EfficiencyValue {
  averageRatio: number | null;
  averageActualMinutes: number | null;
  averagePlannedMinutes: number | null;
  setsPer10Min: number | null;
}

export function durationEfficiency(history: readonly WorkoutRecord[]): Score<EfficiencyValue> {
  const sessions = qualifyingSessions(history)
    .filter((record) => (record.elapsedSeconds ?? 0) > 0 && (record.plannedMinutes ?? 0) > 0)
    .slice(0, 10);
  if (sessions.length === 0) {
    return {
      value: {
        averageRatio: null,
        averageActualMinutes: null,
        averagePlannedMinutes: null,
        setsPer10Min: null,
      },
      definition:
        'Actual duration against the planned length, and completed working sets per ten minutes, over the last ten sessions.',
      samples: 0,
      confidence: 'none',
      explanation: 'No timed sessions yet.',
      data: [],
    };
  }
  const actual = sessions.map((record) => (record.elapsedSeconds ?? 0) / 60);
  const planned = sessions.map((record) => record.plannedMinutes ?? 0);
  const sets = sessions.map((record) =>
    record.entries.reduce(
      (sum, entry) =>
        sum + entry.sets.filter((set) => set.kind === 'working' && set.completed).length,
      0,
    ),
  );
  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const averageActualMinutes = Math.round(avg(actual) * 10) / 10;
  const averagePlannedMinutes = Math.round(avg(planned) * 10) / 10;
  const averageRatio = Math.round((averageActualMinutes / averagePlannedMinutes) * 100) / 100;
  const totalMinutes = actual.reduce((a, b) => a + b, 0);
  // Density needs real training time; a session shorter than five minutes says nothing.
  const setsPer10Min =
    totalMinutes >= 5
      ? Math.round((sets.reduce((a, b) => a + b, 0) / totalMinutes) * 100) / 10
      : null;
  return {
    value: { averageRatio, averageActualMinutes, averagePlannedMinutes, setsPer10Min },
    definition:
      'Actual duration against the planned length, and completed working sets per ten minutes, over the last ten sessions.',
    samples: sessions.length,
    confidence: confidenceFor(sessions.length),
    explanation: `${sessions.length} timed ${sessions.length === 1 ? 'session' : 'sessions'}: about ${averageActualMinutes} min actual against ${averagePlannedMinutes} min planned (${Math.round(averageRatio * 100)}%)${
      setsPer10Min === null
        ? '; density needs at least five minutes of logged training.'
        : `, ${setsPer10Min} working sets per 10 min.`
    }`,
    data: sessions.map(
      (record, index) =>
        `${shortDate(when(record))}: ${Math.round(actual[index] as number)} min of ${planned[index]} planned, ${sets[index]} sets`,
    ),
  };
}

export type CoverageBand = 'under' | 'in' | 'over';

export interface MuscleCoverageRow {
  muscle: MuscleId;
  name: string;
  direct: number;
  indirect: number;
  total: number;
  target: number;
  band: CoverageBand;
  priority: boolean;
  lastWeekTotal: number;
}

export function bandFor(total: number, target: number): CoverageBand {
  if (target <= 0) return 'in';
  if (total < target * 0.7) return 'under';
  if (total > target * 1.3) return 'over';
  return 'in';
}

/** This week's direct and indirect sets per muscle against the weekly target band. */
export function muscleCoverage(
  history: readonly WorkoutRecord[],
  profile: UserProfile,
  now: string,
): MuscleCoverageRow[] {
  const thisWeek = computeWeeklyVolume(history, now);
  const lastWeek = computeWeeklyVolume(
    history,
    new Date(Date.parse(now) - 7 * DAY_MS).toISOString(),
  );
  const targets = weeklyTargets(profile);
  const weights = goalWeights(profile);
  return MUSCLE_IDS.map((muscle) => {
    const direct = Math.round(thisWeek[muscle].direct * 10) / 10;
    const indirect = Math.round(thisWeek[muscle].indirect * 10) / 10;
    const total = Math.round((direct + indirect) * 10) / 10;
    return {
      muscle,
      name: muscleName(muscle),
      direct,
      indirect,
      total,
      target: targets[muscle],
      band: bandFor(total, targets[muscle]),
      priority: weights[muscle] >= 1.05,
      lastWeekTotal: Math.round((lastWeek[muscle].direct + lastWeek[muscle].indirect) * 10) / 10,
    };
  }).sort(
    (a, b) =>
      Number(b.priority) - Number(a.priority) ||
      (b.target - b.total) / Math.max(1, b.target) - (a.target - a.total) / Math.max(1, a.target) ||
      a.name.localeCompare(b.name),
  );
}

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  sessions: number;
  best: { weight: number | null; reps: number; e1rm: number | null; date: string };
  latestE1rm: number | null;
  /** Latest e1RM against the oldest of the last four points, in percent. */
  trendPct: number | null;
  lastDate: string;
  timesReplaced: number;
  timesSkipped: number;
  points: PerformancePoint[];
}

export function exerciseProgress(history: readonly WorkoutRecord[]): ExerciseProgress[] {
  const ids = new Set<string>();
  const replaced = new Map<string, number>();
  const skipped = new Map<string, number>();
  for (const record of history) {
    for (const entry of record.entries) {
      if (entry.sets.some((set) => set.kind === 'working' && set.completed))
        ids.add(entry.exerciseId);
      if (entry.replacedFrom)
        replaced.set(entry.replacedFrom, (replaced.get(entry.replacedFrom) ?? 0) + 1);
    }
    for (const id of record.skippedExerciseIds) skipped.set(id, (skipped.get(id) ?? 0) + 1);
  }
  for (const id of [...replaced.keys(), ...skipped.keys()]) ids.add(id);
  const rows: ExerciseProgress[] = [];
  for (const exerciseId of ids) {
    const exercise = getExercise(exerciseId);
    if (!exercise) continue;
    const points = performanceHistory(history, exercise, 8).filter((point) => !point.viaFamily);
    const best = points.reduce<ExerciseProgress['best'] | null>((current, point) => {
      const candidate = {
        weight: point.bestWeight,
        reps: point.bestReps,
        e1rm: point.e1rm,
        date: point.date,
      };
      if (!current) return candidate;
      if ((candidate.e1rm ?? 0) > (current.e1rm ?? 0)) return candidate;
      if (candidate.e1rm === null && current.e1rm === null && candidate.reps > current.reps)
        return candidate;
      return current;
    }, null);
    const latest = points[0];
    const oldest = points[Math.min(3, points.length - 1)];
    const trendPct =
      latest &&
      oldest &&
      latest !== oldest &&
      latest.e1rm !== null &&
      oldest.e1rm !== null &&
      oldest.e1rm > 0
        ? Math.round(((latest.e1rm - oldest.e1rm) / oldest.e1rm) * 1000) / 10
        : null;
    rows.push({
      exerciseId,
      name: exercise.name,
      sessions: points.length,
      best: best ?? { weight: null, reps: 0, e1rm: null, date: '' },
      latestE1rm: latest?.e1rm ?? null,
      trendPct,
      lastDate: latest?.date ?? '',
      timesReplaced: replaced.get(exerciseId) ?? 0,
      timesSkipped: skipped.get(exerciseId) ?? 0,
      points,
    });
  }
  return rows.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

export interface StrengthEstimate {
  exerciseId: string;
  name: string;
  e1rm: number;
  weight: number;
  reps: number;
  sessions: number;
  confidence: Confidence;
}

export function estimatedStrength(
  progress: readonly ExerciseProgress[],
  units: string,
): Score<StrengthEstimate[]> {
  const estimates = progress
    .filter((row) => row.best.e1rm !== null && row.best.weight !== null)
    .map((row) => ({
      exerciseId: row.exerciseId,
      name: row.name,
      e1rm: row.best.e1rm as number,
      weight: row.best.weight as number,
      reps: row.best.reps,
      sessions: row.sessions,
      confidence: confidenceFor(row.sessions),
    }))
    .sort((a, b) => b.e1rm - a.e1rm)
    .slice(0, 6);
  const samples = estimates.reduce((sum, item) => sum + item.sessions, 0);
  return {
    value: estimates,
    definition:
      'Estimated one-rep max from the best completed working set of each exercise, using Epley: weight × (1 + reps ÷ 30), reps capped at 12.',
    samples,
    confidence:
      estimates.length === 0
        ? 'none'
        : confidenceFor(Math.min(...estimates.map((item) => item.sessions))),
    explanation:
      estimates.length === 0
        ? 'Log weights on your sets and estimates appear here.'
        : 'An estimate, not a test. Sets of 12 or more reps say little about a true max, so they are capped. Confidence follows how many sessions each exercise has.',
    data: estimates.map(
      (item) =>
        `${item.name}: ${item.weight} ${units} × ${item.reps} → about ${Math.round(item.e1rm)} ${units} (${item.sessions} ${item.sessions === 1 ? 'session' : 'sessions'})`,
    ),
  };
}

export interface Rankings {
  mostProductive: ExerciseProgress[];
  frequentlyReplaced: ExerciseProgress[];
}

export function rankings(progress: readonly ExerciseProgress[]): Rankings {
  return {
    mostProductive: [...progress]
      .filter((row) => row.sessions >= 3 && row.trendPct !== null)
      .sort((a, b) => (b.trendPct ?? 0) - (a.trendPct ?? 0))
      .slice(0, 5),
    frequentlyReplaced: [...progress]
      .filter((row) => row.timesReplaced + row.timesSkipped >= 2)
      .sort((a, b) => b.timesReplaced + b.timesSkipped - (a.timesReplaced + a.timesSkipped))
      .slice(0, 5),
  };
}

export function painPatterns(
  history: readonly WorkoutRecord[],
): Score<{ joint: string; count: number }[]> {
  const sessions = qualifyingSessions(history).slice(0, 12);
  const counts = new Map<string, number>();
  let painSessions = 0;
  for (const record of sessions) {
    const joints = new Set([
      ...(record.painJoints ?? []),
      ...(record.readiness?.jointDiscomfort ?? []),
    ]);
    if (joints.size > 0 || record.rating?.pain) painSessions += 1;
    for (const joint of joints) counts.set(joint, (counts.get(joint) ?? 0) + 1);
    if (record.rating?.pain && joints.size === 0)
      counts.set('unspecified', (counts.get('unspecified') ?? 0) + 1);
  }
  const value = [...counts.entries()]
    .map(([joint, count]) => ({ joint, count }))
    .sort((a, b) => b.count - a.count);
  return {
    value,
    definition:
      'Sessions in the last twelve where a joint was reported painful during the workout, in the check-in, or in the rating.',
    samples: sessions.length,
    confidence: confidenceFor(sessions.length),
    explanation:
      value.length === 0
        ? `No pain reported in the last ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}.`
        : `${painSessions} of the last ${sessions.length} sessions reported pain; ${value[0]?.joint.replace('-', ' ')} most often.`,
    data: value.map(
      (item) =>
        `${item.joint.replace('-', ' ')}: ${item.count} ${item.count === 1 ? 'session' : 'sessions'}`,
    ),
  };
}

export interface TechniqueUsage {
  sessions: number;
  supersetSessions: number;
  dropSets: number;
  strengthSets: number;
  hypertrophySets: number;
}

export function techniqueUsage(history: readonly WorkoutRecord[]): Score<TechniqueUsage> {
  const sessions = qualifyingSessions(history).slice(0, 12);
  let supersetSessions = 0;
  let dropSets = 0;
  let strengthSets = 0;
  let hypertrophySets = 0;
  for (const record of sessions) {
    if (
      record.entries.some(
        (entry) => entry.blockKind === 'superset' || entry.blockKind === 'circuit',
      )
    )
      supersetSessions += 1;
    for (const entry of record.entries) {
      const exercise = getExercise(entry.exerciseId);
      for (const set of entry.sets) {
        if (!set.completed) continue;
        if (set.kind === 'drop') dropSets += 1;
        if (set.kind !== 'working') continue;
        const role = entry.role as Parameters<typeof restCategory>[0] | undefined;
        const strength = role
          ? restCategory(role) === 'strength'
          : Boolean(exercise?.compound && exercise.strengthSuitability === 3);
        if (strength) strengthSets += 1;
        else hypertrophySets += 1;
      }
    }
  }
  const total = strengthSets + hypertrophySets;
  return {
    value: { sessions: sessions.length, supersetSessions, dropSets, strengthSets, hypertrophySets },
    definition:
      'Over the last twelve sessions: sessions that used a superset or circuit, completed drop sets, and completed working sets by strength versus hypertrophy role.',
    samples: sessions.length,
    confidence: confidenceFor(sessions.length),
    explanation:
      total === 0
        ? 'No completed working sets yet.'
        : `${supersetSessions} of ${sessions.length} sessions used pairings, ${dropSets} drop ${dropSets === 1 ? 'set' : 'sets'}; ${Math.round((strengthSets / total) * 100)}% of working sets were strength work and ${Math.round((hypertrophySets / total) * 100)}% hypertrophy.`,
    data: [
      `Superset or circuit sessions: ${supersetSessions}`,
      `Drop sets completed: ${dropSets}`,
      `Strength sets: ${strengthSets} · hypertrophy sets: ${hypertrophySets}`,
    ],
  };
}
