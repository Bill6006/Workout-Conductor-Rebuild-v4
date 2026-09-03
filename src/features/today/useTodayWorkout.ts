import { useEffect, useMemo } from 'react';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import type { WorkoutSession } from '../../core/state/session';
import { useNow } from '../../core/time/clock';
import type { LocationProfile } from '../../core/validation/location';
import type { UserProfile } from '../../core/validation/profile';
import type { ConflictContext } from '../../engine/conflicts/conflictEngine';
import { contextFor } from '../../engine/recalibration/recalibrate';
import type { GeneratedWorkout } from '../../engine/workout/types';

export interface TodayWorkout {
  profile: UserProfile;
  location: LocationProfile | undefined;
  workout: GeneratedWorkout;
  session: WorkoutSession;
  /** Length of the complete Default session, the number the dropdown's Default option shows. */
  defaultEstimatedMinutes: number;
  /** Conflict context with this session's busy stations, pain, and avoided moves applied. */
  context: ConflictContext;
}

/**
 * Today's workout session, shared by the Today and Workout tabs. The store
 * owns it; this hook only asks the store to re-check the session when the day
 * changes and resolves the pieces screens need.
 */
export function useTodayWorkout(): TodayWorkout | null {
  const state = useAppState();
  const store = useAppStore();
  const nowEpoch = useNow();
  const day = new Date(nowEpoch || 0).toISOString().slice(0, 10);
  const { profile, locations, session } = state;

  useEffect(() => {
    store.refreshSession();
  }, [store, day]);

  return useMemo(() => {
    if (!profile || !session) return null;
    const location = locations.find((candidate) => candidate.id === profile.currentLocationId);
    return {
      profile,
      location,
      workout: session.workout,
      session,
      defaultEstimatedMinutes: session.defaultEstimatedMinutes,
      context: contextFor({ profile, location }, session.constraints),
    };
  }, [profile, locations, session]);
}
