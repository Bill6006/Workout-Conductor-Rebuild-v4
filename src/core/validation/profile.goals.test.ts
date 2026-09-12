import { describe, expect, it } from 'vitest';
import { GOAL_OPTIONS, SECONDARY_GOAL_OPTIONS } from '../../features/profile/labels';
import { createDefaultProfile, normalizeGoals, parseProfile } from './profile';

describe('goals', () => {
  it('offers five honest choices and no retired one', () => {
    expect(GOAL_OPTIONS.map((option) => option.value)).toEqual([
      'build-muscle',
      'bigger-arms',
      'bigger-chest',
      'overall-size',
      'strength',
    ]);
    expect(SECONDARY_GOAL_OPTIONS.some((option) => option.value === 'balanced')).toBe(false);
    expect(GOAL_OPTIONS.find((option) => option.value === 'overall-size')?.description).toBe(
      'Legs, back, and chest lead',
    );
  });

  it('reads a stored Balanced development as Build muscle, which is what it always did', () => {
    expect(normalizeGoals({ primary: 'balanced', secondary: 'none' })).toEqual({
      primary: 'build-muscle',
      secondary: 'none',
    });
    expect(normalizeGoals({ primary: 'strength', secondary: 'balanced' })).toEqual({
      primary: 'strength',
      secondary: 'none',
    });
    expect(normalizeGoals({ primary: 'balanced', secondary: 'build-muscle' })).toEqual({
      primary: 'build-muscle',
      secondary: 'none',
    });
    const same = { primary: 'bigger-arms' as const, secondary: 'strength' as const };
    expect(normalizeGoals(same)).toBe(same);

    const stored = {
      ...createDefaultProfile('2026-09-10T12:00:00.000Z'),
      goals: { primary: 'balanced' as const, secondary: 'bigger-arms' as const },
    };
    expect(parseProfile(stored).goals).toEqual({
      primary: 'build-muscle',
      secondary: 'bigger-arms',
    });
  });
});
