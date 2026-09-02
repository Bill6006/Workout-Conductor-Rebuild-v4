import { describe, expect, it } from 'vitest';
import { UserProfileSchema, createDefaultProfile, isValidProfile, parseProfile } from './profile';

const NOW = '2026-09-02T12:00:00.000Z';

describe('UserProfileSchema', () => {
  it('accepts the default profile with the plan defaults', () => {
    const profile = createDefaultProfile(NOW);
    expect(isValidProfile(profile)).toBe(true);
    expect(profile.goals.primary).toBe('build-muscle');
    expect(profile.trainingStyle).toBe('hybrid');
    expect(profile.techniques).toEqual({ supersets: true, dropSets: true, circuits: false });
    expect(profile.units).toBe('lb');
    expect(profile.bodyweight).toBeUndefined();
  });

  it('rejects unknown enum values and out-of-range numbers', () => {
    const base = createDefaultProfile(NOW);
    expect(isValidProfile({ ...base, goals: { primary: 'get-shredded', secondary: 'none' } })).toBe(
      false,
    );
    expect(isValidProfile({ ...base, schedule: { ...base.schedule, weeklyFrequency: 9 } })).toBe(
      false,
    );
    expect(isValidProfile({ ...base, schedule: { ...base.schedule, availableDays: [] } })).toBe(
      false,
    );
    expect(isValidProfile({ ...base, bodyweight: -5 })).toBe(false);
  });

  it('preserves unknown fields written by a newer version', () => {
    const base = createDefaultProfile(NOW);
    const parsed = parseProfile({
      ...base,
      futureField: { nested: true },
      limitations: { ...base.limitations, futureFlag: 'yes' },
    });
    expect(parsed.futureField).toEqual({ nested: true });
    expect((parsed.limitations as Record<string, unknown>).futureFlag).toBe('yes');
  });

  it('trims exercise names and rejects empty ones', () => {
    const base = createDefaultProfile(NOW);
    const parsed = UserProfileSchema.parse({
      ...base,
      exercisePreferences: { preferred: ['  Barbell Curl '], disliked: [] },
    });
    expect(parsed.exercisePreferences.preferred).toEqual(['Barbell Curl']);
    expect(
      isValidProfile({ ...base, exercisePreferences: { preferred: ['   '], disliked: [] } }),
    ).toBe(false);
  });
});
