import { useEffect, useMemo } from 'react';
import type { AppState } from '../../core/state/appStore';
import { checkInDayOf, elapsedSeconds } from '../../core/state/session';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { useMomentReached, useNow } from '../../core/time/clock';
import {
  conductCoach,
  declineKey,
  isNudge,
  type CoachCard,
} from '../../engine/coach/coachConductor';
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
> & {
  lastExportAt: AppState['localSettings']['lastExportAt'];
  /** The new cards the lifter has seen (Maintenance 33): the card limits read it. */
  coachShown?: AppState['coachShown'];
  /** What the lifter reset of what the app learned (Maintenance 27, item 47). */
  learnedResets?: AppState['learnedResets'];
  /** The reserve-check estimate the history is read through (the second review of Maintenance 33). */
  readEstimate?: AppState['readEstimate'];
};

/**
 * The fatigue, strategy, and coach conductor engines over the current session and history: the
 * one reading the screens show (Maintenance 25: the coach's tests read the same one).
 */
export function coachContextOf(parts: CoachParts, nowEpoch: number | null): CoachContext | null {
  const { session, profile, history, locations, cloud } = parts;
  if (!session || !profile) return null;
  const now = nowEpoch ? new Date(nowEpoch).toISOString() : session.createdAt;
  const fatigue = interpretFatigue(history, now);
  const strategy = analyzeStrategy({ history, profile, now, fatigue });
  const policy = coachingPolicy(profile.experience);
  const location = locations.find((candidate) => candidate.id === profile.currentLocationId);
  const card = conductCoach({
    workout: session.workout,
    status: session.status,
    madeAt: checkInDayOf(session),
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
    ...(parts.coachShown ? { shown: parts.coachShown } : {}),
    location,
    loading: session.loading,
    upcoming: planWeek(profile, location, history, now, parts.learnedResets ?? null),
    focus: parts.coachFocus?.muscle ?? null,
    swaps: parts.lastingSwaps.filter((swap) => !swapIsPast(swap, now)),
    resets: parts.learnedResets ?? null,
    reserveEstimate: parts.readEstimate ?? null,
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
  // The log as the rules read it (Maintenance 27, item 43): reserve through the checked error.
  const history = useAppSelector((state) => state.readHistory);
  const lastExportAt = useAppSelector((state) => state.localSettings.lastExportAt);
  const workoutCount = useAppSelector((state) => state.workoutCount);
  const coachRoutes = useAppSelector((state) => state.coachRoutes);
  const coachDeclines = useAppSelector((state) => state.coachDeclines);
  const coachFocus = useAppSelector((state) => state.coachFocus);
  const locations = useAppSelector((state) => state.locations);
  const cloud = useAppSelector((state) => state.cloud);
  const lastingSwaps = useAppSelector((state) => state.lastingSwaps);
  const learnedResets = useAppSelector((state) => state.learnedResets);
  const coachShown = useAppSelector((state) => state.coachShown);
  const readEstimate = useAppSelector((state) => state.readEstimate);
  const store = useAppStore();
  const minute = useNow();
  // The minute clock, brought to a running rest's end when it comes, so an offer about the rest
  // goes as the rest ends (Maintenance 25).
  const rest = session?.rest ?? null;
  const restEnd = rest && rest.pausedRemaining === null ? Date.parse(rest.endsAt) : null;
  const restOver = useMomentReached(restEnd);
  const nowEpoch = restOver && restEnd !== null ? Math.max(minute, restEnd) : minute;

  const context = useMemo(
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
          learnedResets,
          coachShown,
          readEstimate,
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
      learnedResets,
      coachShown,
      readEstimate,
      nowEpoch,
    ],
  );
  // A new coaching card on screen is remembered, for the card limits (Maintenance 33).
  const signal = context?.card?.signal;
  const unseen =
    signal !== undefined && isNudge(signal) && coachShown.shown[declineKey(signal)] === undefined;
  useEffect(() => {
    if (unseen && signal) void store.noteCoachShown(signal).catch(() => undefined);
  }, [unseen, signal, store]);
  return context;
}
