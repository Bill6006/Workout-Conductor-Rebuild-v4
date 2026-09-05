import { getExercise } from '../../catalog/exercises/catalog';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { CoachingPolicy } from '../coach/experience';
import { performanceHistory, type PerformancePoint } from '../progression/progression';

/**
 * Stall detection by exposure, and the coach route that follows.
 *
 * An exposure is one session with completed working sets of a lift. A lift
 * has stalled when the newest N exposures (N from the experience policy) show
 * no better estimated max than the oldest of them, and the sets were done at
 * the prescribed effort. Sets that ended far from failure are a different
 * diagnosis (undershooting), and missed reps are left to the progression
 * engine's deload rules.
 *
 * A stalled lift gets a route of one-tap steps, walked one step at a time:
 * shift the rep range, swap for a variation, take a short deload, add volume.
 * The route lives in the `meta` store, is backed up, and is closed the moment
 * the lift's estimated max moves. Nothing here is applied by itself.
 */

export type StallKind = 'stalled-at-effort' | 'undershooting';

export interface StallDiagnosis {
  exerciseId: string;
  kind: StallKind;
  /** Exposures in the window that showed no better estimated max. */
  exposures: number;
  totalExposures: number;
  baselineE1rm: number;
  latestE1rm: number;
  effortMet: number;
  effortUnknown: number;
  firstDate: string;
  lastDate: string;
  why: string[];
}

export type RouteStep = 'rep-range' | 'variation' | 'deload' | 'volume';

export const ROUTE_STEPS: readonly RouteStep[] = ['rep-range', 'variation', 'deload', 'volume'];

export const ROUTE_STEP_LABEL: Record<RouteStep, string> = {
  'rep-range': 'shift the rep range',
  variation: 'swap for a variation',
  deload: 'short deload',
  volume: 'add a set',
};

export interface CoachRoute {
  exerciseId: string;
  /** Index into ROUTE_STEPS of the step currently on offer. */
  step: number;
  startedAt: string;
  baselineE1rm: number;
  applied: { step: number; at: string }[];
  /** Every step was tried without the max moving. */
  exhausted: boolean;
}

export interface CoachRoutes {
  id: 'coach-routes';
  routes: Record<string, CoachRoute>;
}

export const COACH_ROUTES_ID = 'coach-routes';

export function emptyRoutes(): CoachRoutes {
  return { id: COACH_ROUTES_ID, routes: {} };
}

function effortTarget(point: PerformancePoint): number | null {
  const targets = point.sets
    .map((set) => set.targetRir)
    .filter((value): value is number => value !== null);
  if (targets.length === 0) return null;
  return targets.reduce((a, b) => a + b, 0) / targets.length;
}

/** At or beyond the prescribed effort: the sets ended within half a rep of the target RIR. */
function effortMet(point: PerformancePoint): boolean | null {
  const target = effortTarget(point);
  if (target === null || point.avgRir === null) return null;
  return point.avgRir <= target + 0.5;
}

function undershot(point: PerformancePoint): boolean {
  const target = effortTarget(point);
  return target !== null && point.avgRir !== null && point.avgRir >= target + 1.5;
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function exactExposures(
  history: readonly WorkoutRecord[],
  exerciseId: string,
  limit = 8,
): PerformancePoint[] {
  const exercise = getExercise(exerciseId);
  if (!exercise) return [];
  return performanceHistory(history, exercise, limit).filter(
    (point) => !point.viaFamily && point.e1rm !== null,
  );
}

function diagnose(
  exerciseId: string,
  points: PerformancePoint[],
  policy: CoachingPolicy,
  units: string,
): StallDiagnosis | null {
  const window = points.slice(0, policy.stallExposures);
  if (window.length < policy.stallExposures) return null;
  const oldest = window[window.length - 1] as PerformancePoint;
  const baseline = oldest.e1rm as number;
  const newer = window.slice(0, -1);
  const improved = newer.some((point) => (point.e1rm as number) > baseline * 1.01);
  if (improved) return null;
  const missed = window.filter((point) => point.under).length;
  if (missed >= 2) return null;
  // Every set at the top of the range last time is progression's job (add load), not a stall.
  if ((window[0] as PerformancePoint).topAll) return null;
  const met = window.filter((point) => effortMet(point) === true).length;
  const unknown = window.filter((point) => effortMet(point) === null).length;
  const under = window.filter(undershot).length;
  const latest = window[0] as PerformancePoint;
  const name = getExercise(exerciseId)?.name ?? exerciseId;
  const span = `${shortDate(oldest.date)} to ${shortDate(latest.date)}`;
  const maxLine = `Best estimated max ${baseline} ${units} then, ${latest.e1rm} ${units} now (${span}).`;
  if (under * 2 >= window.length) {
    return {
      exerciseId,
      kind: 'undershooting',
      exposures: window.length,
      totalExposures: points.length,
      baselineE1rm: baseline,
      latestE1rm: latest.e1rm as number,
      effortMet: met,
      effortUnknown: unknown,
      firstDate: oldest.date,
      lastDate: latest.date,
      why: [
        maxLine,
        `Sets ended ${Math.round((latest.avgRir ?? 0) * 10) / 10} reps in reserve on average, well short of the prescribed effort, in ${under} of ${window.length} exposures.`,
      ],
    };
  }
  return {
    exerciseId,
    kind: 'stalled-at-effort',
    exposures: window.length,
    totalExposures: points.length,
    baselineE1rm: baseline,
    latestE1rm: latest.e1rm as number,
    effortMet: met,
    effortUnknown: unknown,
    firstDate: oldest.date,
    lastDate: latest.date,
    why: [
      maxLine,
      unknown === window.length
        ? `${name}: effort was not logged, so the stall is read from the loads and reps alone.`
        : `Prescribed effort was reached in ${met} of ${window.length - unknown} logged exposures.`,
    ],
  };
}

/** Every lift with enough exposures and no progress, newest evidence first. */
export function detectStalls(
  history: readonly WorkoutRecord[],
  profile: UserProfile,
  policy: CoachingPolicy,
): StallDiagnosis[] {
  const ids = new Set(
    history.flatMap((record) =>
      record.entries
        .filter((entry) => entry.sets.some((set) => set.kind === 'working' && set.completed))
        .map((entry) => entry.exerciseId),
    ),
  );
  const stalls: StallDiagnosis[] = [];
  for (const exerciseId of ids) {
    const points = exactExposures(history, exerciseId);
    const stall = diagnose(exerciseId, points, policy, profile.units);
    if (stall) stalls.push(stall);
  }
  return stalls.sort(
    (a, b) => b.exposures - a.exposures || a.exerciseId.localeCompare(b.exerciseId),
  );
}

export interface RouteEvent {
  exerciseId: string;
  kind: 'started' | 'advanced' | 'resolved' | 'exhausted';
  step: number;
  detail: string;
}

/** Marks the step on offer as applied now; starts the route first if the stall had none yet. */
export function applyRouteStep(
  routes: CoachRoutes,
  exerciseId: string,
  step: number,
  baselineE1rm: number,
  now: string,
): CoachRoutes {
  const existing = routes.routes[exerciseId] ?? {
    exerciseId,
    step: 0,
    startedAt: now,
    baselineE1rm,
    applied: [],
    exhausted: false,
  };
  if (existing.applied.some((entry) => entry.step === step)) return routes;
  return {
    ...routes,
    routes: {
      ...routes.routes,
      [exerciseId]: { ...existing, step, applied: [...existing.applied, { step, at: now }] },
    },
  };
}

/**
 * After a workout: start routes for new stalls, close routes whose lift moved,
 * and advance a route once its applied step has had its exposures.
 */
export function reconcileRoutes(
  routes: CoachRoutes,
  stalls: readonly StallDiagnosis[],
  history: readonly WorkoutRecord[],
  policy: CoachingPolicy,
  now: string,
): { routes: CoachRoutes; events: RouteEvent[] } {
  const next: Record<string, CoachRoute> = { ...routes.routes };
  const events: RouteEvent[] = [];
  for (const stall of stalls) {
    if (stall.kind !== 'stalled-at-effort' || next[stall.exerciseId]) continue;
    next[stall.exerciseId] = {
      exerciseId: stall.exerciseId,
      step: 0,
      startedAt: now,
      baselineE1rm: stall.latestE1rm,
      applied: [],
      exhausted: false,
    };
    events.push({
      exerciseId: stall.exerciseId,
      kind: 'started',
      step: 0,
      detail: `Stalled for ${stall.exposures} exposures; route opened.`,
    });
  }
  for (const route of Object.values(next)) {
    const points = exactExposures(history, route.exerciseId);
    const latest = points[0]?.e1rm ?? null;
    if (latest !== null && latest > route.baselineE1rm * 1.01) {
      delete next[route.exerciseId];
      events.push({
        exerciseId: route.exerciseId,
        kind: 'resolved',
        step: route.step,
        detail: `Estimated max moved from ${route.baselineE1rm} to ${latest}; route closed.`,
      });
      continue;
    }
    const applied = route.applied.find((entry) => entry.step === route.step);
    if (!applied || route.exhausted) continue;
    const since = points.filter((point) => point.date > applied.at).length;
    if (since < policy.exposuresPerRouteStep) continue;
    if (route.step + 1 >= ROUTE_STEPS.length) {
      next[route.exerciseId] = { ...route, exhausted: true };
      events.push({
        exerciseId: route.exerciseId,
        kind: 'exhausted',
        step: route.step,
        detail: 'Every route step was tried without the max moving.',
      });
    } else {
      next[route.exerciseId] = { ...route, step: route.step + 1 };
      events.push({
        exerciseId: route.exerciseId,
        kind: 'advanced',
        step: route.step + 1,
        detail: `${ROUTE_STEP_LABEL[ROUTE_STEPS[route.step] as RouteStep]} did not move the max after ${since} exposures.`,
      });
    }
  }
  return { routes: { id: COACH_ROUTES_ID, routes: next }, events };
}

/** "1 shift the rep range (done) → 2 swap for a variation (now) → 3 short deload → 4 add a set" */
export function describeRoute(route: Pick<CoachRoute, 'step' | 'applied' | 'exhausted'>): string {
  return ROUTE_STEPS.map((step, index) => {
    const label = `${index + 1} ${ROUTE_STEP_LABEL[step]}`;
    if (route.applied.some((entry) => entry.step === index) && index !== route.step) {
      return `${label} (done)`;
    }
    if (index === route.step) return `${label} (${route.exhausted ? 'tried' : 'now'})`;
    return label;
  }).join(' → ');
}
