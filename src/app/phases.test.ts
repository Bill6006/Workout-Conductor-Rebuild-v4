import { describe, expect, it } from 'vitest';
import { CURRENT_PHASE, CURRENT_PHASE_GATE, PHASES, getPhase } from './phases';

describe('phases', () => {
  it('defines the nine plan phases numbered 0 through 8 in order', () => {
    expect(PHASES.map((phase) => phase.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('gives every phase a name', () => {
    for (const phase of PHASES) {
      expect(phase.name.length).toBeGreaterThan(5);
    }
  });

  it('points CURRENT_PHASE at a defined phase', () => {
    expect(() => getPhase(CURRENT_PHASE)).not.toThrow();
    expect(getPhase(0).name).toBe('Repository, Live Pages, and Scaffold');
  });

  it('rejects unknown phases loudly', () => {
    expect(() => getPhase(42)).toThrow(RangeError);
  });

  it('never claims GREEN for itself', () => {
    expect(['in-progress', 'yellow']).toContain(CURRENT_PHASE_GATE);
  });
});
