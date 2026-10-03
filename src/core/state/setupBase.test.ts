import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { setupBase } from './setupBase';

/**
 * Maintenance 25, the tenth review's re-checks: what a setup run starts from. Places count even
 * when no profile can be read, so places that come back during a first setup are never written
 * over (the tenth re-check).
 */

const NOW = '2026-09-02T12:00:00.000Z';

describe('what a setup run starts from', () => {
  it('is nothing on a phone with no profile and no places', () => {
    expect(setupBase(null, [])).toBeNull();
  });

  it('counts the places stored when no profile can be read (tenth re-check)', () => {
    const places = createDefaultLocations({ gymAccess: true }, NOW);
    expect(setupBase(null, places)).toBe(`none|gym@${NOW},home@${NOW}`);
  });

  it('counts the profile and the places, in any order', () => {
    const profile = createDefaultProfile(NOW);
    const places = createDefaultLocations({ gymAccess: true }, NOW);
    expect(setupBase(profile, places)).toBe(setupBase(profile, [...places].reverse()));
    expect(setupBase(profile, places)).toBe(`${profile.updatedAt}|gym@${NOW},home@${NOW}`);
  });
});
