import { describe, expect, it } from 'vitest';
import { GYM_DEFAULT_EQUIPMENT, HOME_DEFAULT_EQUIPMENT } from '../../catalog/equipment/equipment';
import { LocationProfileSchema, createDefaultLocations, createLocation } from './location';

const NOW = '2026-09-02T12:00:00.000Z';

describe('locations', () => {
  it('creates Home and Gym by default, Home only without gym access', () => {
    const withGym = createDefaultLocations({ gymAccess: true }, NOW);
    expect(withGym.map((location) => location.id)).toEqual(['home', 'gym']);
    expect(withGym[0]?.equipment).toEqual([...HOME_DEFAULT_EQUIPMENT]);
    expect(withGym[1]?.equipment).toEqual([...GYM_DEFAULT_EQUIPMENT]);

    const homeOnly = createDefaultLocations({ gymAccess: false, homeEquipment: ['barbell'] }, NOW);
    expect(homeOnly.map((location) => location.id)).toEqual(['home']);
    expect(homeOnly[0]?.equipment).toEqual(['barbell']);
  });

  it('drops unknown equipment ids and generates an id for custom places', () => {
    const location = createLocation(
      { name: '  Hotel gym ', kind: 'travel', equipment: ['dumbbells', 'hoverboard', 'dumbbells'] },
      NOW,
    );
    expect(location.id).toMatch(/^loc-/);
    expect(location.name).toBe('Hotel gym');
    expect(location.equipment).toEqual(['dumbbells']);
    expect(LocationProfileSchema.safeParse(location).success).toBe(true);
  });

  it('rejects empty names and unknown kinds', () => {
    const base = createLocation({ name: 'Garage', kind: 'custom' }, NOW);
    expect(LocationProfileSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
    expect(LocationProfileSchema.safeParse({ ...base, kind: 'space' }).success).toBe(false);
  });
});
