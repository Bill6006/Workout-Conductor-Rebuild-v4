import { describe, expect, it } from 'vitest';
import {
  createDraft,
  hasGymAccess,
  homeLocation,
  setGymAccess,
  setLocationEquipment,
} from './draft';

const NOW = '2026-09-02T12:00:00.000Z';

describe('profile draft', () => {
  it('starts with Home and Gym and trains at the gym', () => {
    const draft = createDraft(NOW);
    expect(hasGymAccess(draft)).toBe(true);
    expect(draft.profile.currentLocationId).toBe('gym');
    expect(homeLocation(draft)?.equipment.length).toBeGreaterThan(0);
  });

  it('removing gym access drops the Gym location and falls back to Home', () => {
    const noGym = setGymAccess(createDraft(NOW), false, NOW);
    expect(hasGymAccess(noGym)).toBe(false);
    expect(noGym.profile.currentLocationId).toBe('home');
    expect(setGymAccess(noGym, false, NOW)).toBe(noGym);

    const restored = setGymAccess(noGym, true, NOW);
    expect(hasGymAccess(restored)).toBe(true);
    expect(restored.profile.currentLocationId).toBe('gym');
  });

  it('updates a location equipment list with normalization', () => {
    const draft = setLocationEquipment(
      createDraft(NOW),
      'home',
      ['barbell', 'nope', 'barbell'],
      '2026-09-03T00:00:00.000Z',
    );
    expect(homeLocation(draft)?.equipment).toEqual(['barbell']);
    expect(homeLocation(draft)?.updatedAt).toBe('2026-09-03T00:00:00.000Z');
  });
});
