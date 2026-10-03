import { describe, expect, it } from 'vitest';
import { createDraft, setGymAccess, setLocationEquipment, updateProfile } from '../profile/draft';
import { ONBOARDING_STEPS, STEP_COUNT, validateAll, validateStep } from './steps';

const NOW = '2026-09-02T12:00:00.000Z';

describe('onboarding steps', () => {
  it('defines seven short steps in plan order', () => {
    expect(STEP_COUNT).toBe(7);
    expect(ONBOARDING_STEPS.map((step) => step.id)).toEqual([
      'goals',
      'schedule',
      'places',
      'exercises',
      'limitations',
      'style',
      'units',
    ]);
  });

  it('accepts the default draft everywhere', () => {
    expect(validateAll(createDraft(NOW))).toEqual([]);
  });

  it('checks the age on the units step, in words (eleventh re-check)', () => {
    const aged = (age: number | undefined) =>
      updateProfile(createDraft(NOW), (profile) => ({ ...profile, age }));
    expect(validateStep('units', aged(12))).toEqual(['Age must be from 13 to 100.']);
    expect(validateStep('units', aged(101))).toEqual(['Age must be from 13 to 100.']);
    expect(validateStep('units', aged(30))).toEqual([]);
    expect(validateStep('units', aged(undefined))).toEqual([]);
  });

  it('flags a frequency above the available days', () => {
    const draft = updateProfile(createDraft(NOW), (profile) => ({
      ...profile,
      schedule: { ...profile.schedule, weeklyFrequency: 5, availableDays: ['mon', 'wed'] },
    }));
    expect(validateStep('schedule', draft)).toEqual([
      'You chose 5 sessions but only 2 available days.',
    ]);
  });

  it('requires some home equipment without gym access', () => {
    let draft = setGymAccess(createDraft(NOW), false, NOW);
    draft = setLocationEquipment(draft, 'home', [], NOW);
    expect(validateStep('places', draft)).toHaveLength(1);
    expect(validateStep('places', setGymAccess(draft, true, NOW))).toEqual([]);
  });

  it('rejects a nonsense bodyweight', () => {
    const draft = updateProfile(createDraft(NOW), (profile) => ({ ...profile, bodyweight: 0 }));
    expect(validateStep('units', draft)).toEqual(['Bodyweight must be a positive number.']);
  });
});
