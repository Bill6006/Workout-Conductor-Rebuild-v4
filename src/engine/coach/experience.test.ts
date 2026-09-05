import { describe, expect, it } from 'vitest';
import { coachingPolicy, policyLabel } from './experience';

describe('coaching policy by experience', () => {
  it('explains to beginners and keeps the all-clear card', () => {
    const policy = coachingPolicy('beginner');
    expect(policy.tone).toBe('explain');
    expect(policy.showClearCard).toBe(true);
    expect(policy.hideObvious).toBe(false);
    expect(policy.cleanSessionsToProgress).toBe(1);
    expect(policy.stallExposures).toBe(3);
  });

  it('is brief with intermediate and advanced lifters and hides the obvious', () => {
    for (const level of ['intermediate', 'advanced'] as const) {
      const policy = coachingPolicy(level);
      expect(policy.tone).toBe('brief');
      expect(policy.showClearCard).toBe(false);
      expect(policy.hideObvious).toBe(true);
      expect(policy.stallExposures).toBe(4);
    }
    expect(coachingPolicy('advanced').cleanSessionsToProgress).toBe(2);
    expect(coachingPolicy('advanced').topSessionsToProgress).toBe(2);
    expect(coachingPolicy('advanced').reserveTolerance).toBe(0);
  });

  it('falls back to intermediate and labels itself', () => {
    expect(coachingPolicy(null).level).toBe('intermediate');
    expect(policyLabel(coachingPolicy('advanced'))).toBe('Advanced');
  });
});
