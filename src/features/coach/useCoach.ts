import { useMemo } from 'react';
import { useAppSelector } from '../../core/state/useAppStore';
import { useNow } from '../../core/time/clock';
import { conductCoach, type CoachCard } from '../../engine/coach/coachConductor';
import { coachingPolicy, type CoachingPolicy } from '../../engine/coach/experience';
import { interpretFatigue, type FatigueSignal } from '../../engine/recovery/fatigue';
import { analyzeStrategy, type StrategyInsight } from '../../engine/strategy/strategy';

export interface CoachContext {
  card: CoachCard | null;
  fatigue: FatigueSignal;
  strategy: StrategyInsight[];
  policy: CoachingPolicy;
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
  const nowEpoch = useNow();

  return useMemo(() => {
    if (!session || !profile) return null;
    const now = nowEpoch ? new Date(nowEpoch).toISOString() : session.createdAt;
    const fatigue = interpretFatigue(history, now, session.constraints.readiness);
    const strategy = analyzeStrategy({ history, profile, now, fatigue });
    const policy = coachingPolicy(profile.experience);
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
      lastExportAt,
      workoutCount,
      policy,
      routes: coachRoutes,
      declines: coachDeclines,
    });
    return { card, fatigue, strategy, policy };
  }, [session, profile, history, lastExportAt, workoutCount, coachRoutes, coachDeclines, nowEpoch]);
}
