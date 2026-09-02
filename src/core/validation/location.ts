import { z } from 'zod';
import {
  GYM_DEFAULT_EQUIPMENT,
  HOME_DEFAULT_EQUIPMENT,
  normalizeEquipment,
} from '../../catalog/equipment/equipment';

/**
 * Location profiles own the equipment available at a place (Home, Gym, Travel,
 * Custom). The Home profile IS the user's home equipment; nothing else stores it.
 */

export const LOCATION_KINDS = ['home', 'gym', 'travel', 'custom'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const HOME_LOCATION_ID = 'home';
export const GYM_LOCATION_ID = 'gym';

export const LocationProfileSchema = z.looseObject({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1).max(40),
  kind: z.enum(LOCATION_KINDS),
  equipment: z.array(z.string().min(1)).max(100),
  notes: z.string().max(300),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type LocationProfile = z.infer<typeof LocationProfileSchema>;

export interface NewLocation {
  id?: string;
  name: string;
  kind: LocationKind;
  equipment?: readonly string[];
  notes?: string;
}

export function createLocation(input: NewLocation, now: string): LocationProfile {
  return {
    id:
      input.id ??
      `loc-${now.replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim(),
    kind: input.kind,
    equipment: normalizeEquipment(input.equipment ?? []),
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
  };
}

export interface DefaultLocationOptions {
  gymAccess: boolean;
  homeEquipment?: readonly string[];
}

/** Home always exists; Gym exists when the user has gym access. */
export function createDefaultLocations(
  options: DefaultLocationOptions,
  now: string,
): LocationProfile[] {
  const locations = [
    createLocation(
      {
        id: HOME_LOCATION_ID,
        name: 'Home',
        kind: 'home',
        equipment: options.homeEquipment ?? HOME_DEFAULT_EQUIPMENT,
      },
      now,
    ),
  ];
  if (options.gymAccess) {
    locations.push(
      createLocation(
        { id: GYM_LOCATION_ID, name: 'Gym', kind: 'gym', equipment: GYM_DEFAULT_EQUIPMENT },
        now,
      ),
    );
  }
  return locations;
}

export function parseLocation(raw: unknown): LocationProfile {
  return LocationProfileSchema.parse(raw);
}
