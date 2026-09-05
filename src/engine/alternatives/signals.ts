import { getExercise } from '../../catalog/exercises/catalog';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { performanceHistory } from '../progression/progression';
import { ROUTE_STEPS, type CoachRoutes } from '../strategy/plateau';
import { computeWeeklyVolume, weeklyTargets } from '../volume/weeklyVolume';
import { preferredIdsOf } from '../conflicts/context';
import type { RankingSignals } from './rankAlternatives';

/**
 * Everything the alternatives ranking can know beyond the catalog: what you
 * have done and when, how loaded each muscle already is this week, which
 * joints hurt today, and whether the coach route for the current lift is
 * asking for a variation. Built once per sheet from the app state.
 */

export type MuscleLoad = 'behind' | 'open' | 'covered';

export interface SignalSources {
  profile: UserProfile;
  history: readonly WorkoutRecord[];
  now: string;
  sessionPainJoints?: readonly Joint[];
  coachRoutes?: CoachRoutes;
  currentExerciseId: string;
}

const DAY_MS = 86_400_000;

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function muscleLoads(
  history: readonly WorkoutRecord[],
  profile: UserProfile,
  now: string,
): Record<MuscleId, MuscleLoad> {
  const volume = computeWeeklyVolume(history, now);
  const targets = weeklyTargets(profile);
  const loads = {} as Record<MuscleId, MuscleLoad>;
  for (const muscle of MUSCLE_IDS) {
    const target = targets[muscle];
    const done = volume[muscle].direct + volume[muscle].indirect;
    loads[muscle] =
      target <= 0
        ? 'open'
        : done >= target * 0.9
          ? 'covered'
          : done <= target * 0.4
            ? 'behind'
            : 'open';
  }
  return loads;
}

export function buildRankingSignals(sources: SignalSources): RankingSignals {
  const { profile, history, now } = sources;
  const familiarIds = new Set<string>();
  const lastPerformance = new Map<string, { daysAgo: number; line: string }>();
  const seen = new Set<string>();
  for (const record of history) {
    for (const entry of record.entries) {
      if (entry.sets.some((set) => set.kind === 'working' && set.completed)) {
        familiarIds.add(entry.exerciseId);
        seen.add(entry.exerciseId);
      }
    }
  }
  for (const id of seen) {
    const exercise = getExercise(id);
    if (!exercise) continue;
    const [point] = performanceHistory(history, exercise, 1).filter(
      (candidate) => !candidate.viaFamily,
    );
    if (!point) continue;
    const daysAgo = Math.max(0, Math.floor((Date.parse(now) - Date.parse(point.date)) / DAY_MS));
    const load = point.bestWeight === null ? 'bodyweight' : `${point.bestWeight} ${profile.units}`;
    lastPerformance.set(id, {
      daysAgo,
      line: `last done ${shortDate(point.date)}: ${load} × ${point.bestReps}`,
    });
  }
  const route = sources.coachRoutes?.routes[sources.currentExerciseId];
  const routeWantsVariation =
    route !== undefined && !route.exhausted && ROUTE_STEPS[route.step] === 'variation';
  return {
    preferredIds: preferredIdsOf(profile),
    familiarIds,
    lastPerformance,
    muscleLoad: muscleLoads(history, profile, now),
    sessionPainJoints: new Set(sources.sessionPainJoints ?? []),
    routeWantsVariation,
  };
}
