import { resolveExerciseIds } from '../../catalog/exercises/catalog';
import type { LocationProfile } from '../../core/validation/location';
import type { UserProfile } from '../../core/validation/profile';
import type { ConflictContext } from './conflictEngine';

/** Builds the conflict context for a profile at a place. */
export function buildConflictContext(
  profile: UserProfile,
  location: LocationProfile | undefined,
  timeBudgetMinutes?: number,
): ConflictContext {
  return {
    availableEquipment: new Set(location?.equipment ?? []),
    locationName: location?.name,
    limitations: profile.limitations,
    dislikedIds: resolveExerciseIds(profile.exercisePreferences.disliked),
    ...(timeBudgetMinutes !== undefined ? { timeBudgetMinutes } : {}),
  };
}

export function preferredIdsOf(profile: UserProfile): Set<string> {
  return resolveExerciseIds(profile.exercisePreferences.preferred);
}
