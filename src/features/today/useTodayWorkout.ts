import { useMemo } from 'react';
import { useAppState } from '../../core/state/useAppStore';
import { useNow } from '../../core/time/clock';
import type { LocationProfile } from '../../core/validation/location';
import type { UserProfile } from '../../core/validation/profile';
import { buildConflictContext } from '../../engine/conflicts/context';
import type { ConflictContext } from '../../engine/conflicts/conflictEngine';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import type { GeneratedWorkout } from '../../engine/workout/types';

export interface TodayWorkout {
  profile: UserProfile;
  location: LocationProfile | undefined;
  workout: GeneratedWorkout;
  context: ConflictContext;
}

/**
 * Today's generated workout, shared by the Today and Workout tabs. Generation is
 * pure and fast, so it is memoised on its inputs and re-run whenever the
 * profile, place, history, day, or workout-length choice changes.
 */
export function useTodayWorkout(): TodayWorkout | null {
  const state = useAppState();
  const nowEpoch = useNow();
  const day = new Date(nowEpoch || 0).toISOString();
  const { profile, locations, history, durationChoice } = state;

  return useMemo(() => {
    if (!profile) return null;
    const location = locations.find((candidate) => candidate.id === profile.currentLocationId);
    const workout = generateWorkout({
      profile,
      location,
      history,
      now: day,
      duration: durationChoice,
    });
    return { profile, location, workout, context: buildConflictContext(profile, location) };
  }, [profile, locations, history, day, durationChoice]);
}
