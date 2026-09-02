import { z } from 'zod';
import { GYM_DEFAULT_EQUIPMENT, normalizeEquipment } from '../../catalog/equipment/equipment';
import {
  GYM_LOCATION_ID,
  HOME_LOCATION_ID,
  LocationProfileSchema,
  createDefaultLocations,
  createLocation,
  type LocationProfile,
} from '../../core/validation/location';
import {
  UserProfileSchema,
  createDefaultProfile,
  type UserProfile,
} from '../../core/validation/profile';

/**
 * An editable copy of the profile plus its locations. Onboarding and Settings
 * both edit a ProfileDraft through the same editors, so there is exactly one
 * editing model.
 */

export interface ProfileDraft {
  profile: UserProfile;
  locations: LocationProfile[];
}

export const OnboardingDraftSchema = z.object({
  step: z.number().int().min(0),
  profile: UserProfileSchema,
  locations: z.array(LocationProfileSchema),
});

export type OnboardingDraft = z.infer<typeof OnboardingDraftSchema>;

export function createDraft(now: string): ProfileDraft {
  const locations = createDefaultLocations({ gymAccess: true }, now);
  return { profile: createDefaultProfile(now, GYM_LOCATION_ID), locations };
}

export function draftFromState(profile: UserProfile, locations: LocationProfile[]): ProfileDraft {
  return { profile: structuredClone(profile), locations: structuredClone(locations) };
}

export function hasGymAccess(draft: ProfileDraft): boolean {
  return draft.locations.some((location) => location.id === GYM_LOCATION_ID);
}

export function homeLocation(draft: ProfileDraft): LocationProfile | undefined {
  return draft.locations.find((location) => location.id === HOME_LOCATION_ID);
}

export function updateProfile(
  draft: ProfileDraft,
  recipe: (profile: UserProfile) => UserProfile,
): ProfileDraft {
  return { ...draft, profile: recipe(draft.profile) };
}

export function setGymAccess(draft: ProfileDraft, enabled: boolean, now: string): ProfileDraft {
  if (enabled === hasGymAccess(draft)) return draft;
  if (enabled) {
    const gym = createLocation(
      { id: GYM_LOCATION_ID, name: 'Gym', kind: 'gym', equipment: GYM_DEFAULT_EQUIPMENT },
      now,
    );
    return {
      ...draft,
      locations: [...draft.locations, gym],
      profile: { ...draft.profile, currentLocationId: GYM_LOCATION_ID },
    };
  }
  const locations = draft.locations.filter((location) => location.id !== GYM_LOCATION_ID);
  const currentStillExists = locations.some(
    (location) => location.id === draft.profile.currentLocationId,
  );
  return {
    ...draft,
    locations,
    profile: currentStillExists
      ? draft.profile
      : { ...draft.profile, currentLocationId: HOME_LOCATION_ID },
  };
}

export function setLocationEquipment(
  draft: ProfileDraft,
  locationId: string,
  equipment: readonly string[],
  now: string,
): ProfileDraft {
  return {
    ...draft,
    locations: draft.locations.map((location) =>
      location.id === locationId
        ? { ...location, equipment: normalizeEquipment(equipment), updatedAt: now }
        : location,
    ),
  };
}

export function toggleInList<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
