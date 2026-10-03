import { useMemo } from 'react';
import type { AppState } from '../../core/state/appStore';
import { elapsedSeconds } from '../../core/state/session';
import { useAppSelector } from '../../core/state/useAppStore';
import { useMomentReached, useNow } from '../../core/time/clock';
import { conductCoach, type CoachCard } from '../../engine/coach/coachConductor';
import { coachingPolicy, type CoachingPolicy } from '../../engine/coach/experience';
import { swapIsPast } from '../../engine/planning/lastingSwaps';
import { planWeek } from '../../engine/planning/weeklyPlan';
import { interpretFatigue, type FatigueSignal } from '../../engine/recovery/fatigue';
import { analyzeStrategy, type StrategyInsight } from '../../engine/strategy/strategy';

export interface CoachContext {
  card: CoachCard | null;
  fatigue: FatigueSignal;
  strategy: StrategyInsight[];
  policy: CoachingPolicy;
}

/** The parts of the app's state the coach reads. */
export type CoachParts = Pick<
  AppState,
  | 'session'
  | 'profile'
  | 'history'
  | 'workoutCount'
  | 'coachRoutes'
  | 'coachDeclines'
  | 'coachFocus'
  | 'locations'
  | 'cloud'
  | 'lastingSwaps'
> & { lastExportAt: AppState['localSettings']['lastExportAt'] };

/**
 * The fatigue, strategy, and coach conductor engines over the current session and history: the
 * one reading the screens show (Maintenance 25: the coach's tests read the same one).
 */
export function coachContextOf(parts: CoachParts, nowEpoch: number | null): CoachContext | null {
  const { session, profile, history, locations, cloud } = parts;
  if (!session || !profile) return null;
  const now = nowEpoch ? new Date(nowEpoch).toISOString() : session.createdAt;
  const fatigue = interpretFatigue(history, now, session.constraints.readiness);
  const strategy = analyzeStrategy({ history, profile, now, fatigue });
  const policy = coachingPolicy(profile.experience);
  const location = locations.find((candidate) => candidate.id === profile.currentLocationId);
  const card = conductCoach({
    workout: session.workout,
    status: session.status,
    duration: session.duration,
    completed: session.completed,
    constraints: session.constraints,
    profile,
    history,
    now,
    fatigue,
    strategy,
    lastExportAt: parts.lastExportAt,
    accepted: session.coachAccepted,
    rest: session.rest
      ? {
          entryId: session.rest.entryId,
          setIndex: session.rest.setIndex,
          startedAt: session.rest.startedAt,
          endsAt: session.rest.endsAt,
          pausedRemaining: session.rest.pausedRemaining,
        }
      : null,
    elapsedSeconds: nowEpoch ? elapsedSeconds(session, nowEpoch) : 0,
    cloudCurrent:
      cloud.configured &&
      cloud.pending === 0 &&
      cloud.lastSyncAt !== null &&
      cloud.lastError === null,
    workoutCount: parts.workoutCount,
    policy,
    routes: parts.coachRoutes,
    declines: parts.coachDeclines,
    location,
    loading: session.loading,
    upcoming: planWeek(profile, location, history, now),
    focus: parts.coachFocus?.muscle ?? null,
    swaps: parts.lastingSwaps.filter((swap) => !swapIsPast(swap, now)),
  });
  return { card, fatigue, strategy, policy };
}

/**
 * Runs the fatigue, strategy, and coach conductor engines over the current
 * session and history. Pure and memoised: it recomputes only when the session,
 * history, profile, or the minute clock changes.
 */
export function useCoach(): CoachContext | null {
  const session = useAppSelector((state) => state.session);
  const profile = useAppSelector((state) => state.profile);
  const history = useAppSelector((state) => state.history);
  const lastExportAt = useAppSelector((state) => state.localSettings.lastExportAt);
  const workoutCount = useAppSelector((state) => state.workoutCount);
  const coachRoutes = useAppSelector((state) => state.coachRoutes);
  const coachDeclines = useAppSelector((state) => state.coachDeclines);
  const coachFocus = useAppSelector((state) => state.coachFocus);
  const locations = useAppSelector((state) => state.locations);
  const cloud = useAppSelector((state) => state.cloud);
  const lastingSwaps = useAppSelector((state) => state.lastingSwaps);
  const minute = useNow();
  // The minute clock, brought to a running rest's end when it comes, so an offer about the rest
  // goes as the rest ends (Maintenance 25).
  const rest = session?.rest ?? null;
  const restEnd = rest && rest.pausedRemaining === null ? Date.parse(rest.endsAt) : null;
  const restOver = useMomentReached(restEnd);
  const nowEpoch = restOver && restEnd !== null ? Math.max(minute, restEnd) : minute;

  return useMemo(
    () =>
      coachContextOf(
        {
          session,
          profile,
          history,
          lastExportAt,
          workoutCount,
          coachRoutes,
          coachDeclines,
          coachFocus,
          locations,
          cloud,
          lastingSwaps,
        },
        nowEpoch,
      ),
    [
      session,
      profile,
      history,
      lastExportAt,
      workoutCount,
      coachRoutes,
      coachDeclines,
      coachFocus,
      locations,
      cloud,
      lastingSwaps,
      nowEpoch,
    ],
  );
}
