import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import { buildSets, prescribe } from '../../engine/progression/roles';
import { EFFORT_EVIDENCE, REST_EVIDENCE, effortGuidance, restGuidance } from './effort';

const NOW = '2026-09-03T12:00:00.000Z';
const profile = createDefaultProfile(NOW);

describe('effort and rest guidance', () => {
  it('matches the prescribed targets: working sets by role, warm-ups easy, drops to the last clean rep', () => {
    const strength = prescribe(requireExercise('barbell-bench-press'), 'primary-strength', profile);
    expect(strength.rir).toBe(2);
    const working = effortGuidance('working', strength.rir, 'primary-strength');
    expect(working.label).toBe('RIR 2');
    expect(working.why).toContain('stop 2 clean reps short');
    expect(working.evidence).toEqual([EFFORT_EVIDENCE.strength, EFFORT_EVIDENCE.scale]);

    const sets = buildSets(strength, 2);
    const ramp = sets.find((set) => set.kind === 'warmup');
    expect(ramp?.targetRir).toBe(5);
    const warm = effortGuidance('warmup', ramp!.targetRir, 'primary-strength');
    expect(warm.label).toBe('RIR 5 · easy');
    expect(warm.evidence[0]).toBe(EFFORT_EVIDENCE.ramp);

    const hypertrophy = prescribe(requireExercise('dumbbell-row'), 'primary-hypertrophy', profile);
    expect(hypertrophy.rir).toBe(1);
    expect(effortGuidance('working', hypertrophy.rir, 'primary-hypertrophy').why).toContain(
      'stop 1 clean rep short',
    );
    expect(effortGuidance('working', 0, 'finisher').label).toBe('RIR 0 · last clean rep');
    expect(effortGuidance('drop', 0, 'isolation').label).toBe('last clean rep');
  });

  it('cites the rest evidence for the role and names the fitted floors only when fitted', () => {
    const strength = prescribe(requireExercise('barbell-bench-press'), 'primary-strength', profile);
    expect(strength.restSeconds).toBe(150);
    const rest = restGuidance('primary-strength', strength.restSeconds);
    expect(rest.label).toBe('Rest 2.5 min');
    expect(rest.evidence).toEqual([REST_EVIDENCE.strength, REST_EVIDENCE.style]);

    const hypertrophy = prescribe(requireExercise('dumbbell-row'), 'primary-hypertrophy', profile);
    expect(hypertrophy.restSeconds).toBe(120);
    expect(
      prescribe(requireExercise('dumbbell-row'), 'secondary-hypertrophy', profile).restSeconds,
    ).toBe(90);
    expect(restGuidance('primary-hypertrophy', 120, true).evidence).toEqual([
      REST_EVIDENCE.hypertrophy,
      REST_EVIDENCE.fitted,
      REST_EVIDENCE.style,
    ]);
    expect(restGuidance('isolation', 45).label).toBe('Rest 45 s');
    expect(restGuidance('finisher', 45).evidence[0]).toBe(REST_EVIDENCE.isolation);
  });

  it('every evidence line names its source', () => {
    for (const line of [...Object.values(EFFORT_EVIDENCE), ...Object.values(REST_EVIDENCE)]) {
      expect(line.length).toBeGreaterThan(40);
    }
    for (const line of [
      EFFORT_EVIDENCE.strength,
      EFFORT_EVIDENCE.hypertrophy,
      EFFORT_EVIDENCE.isolation,
      EFFORT_EVIDENCE.scale,
      REST_EVIDENCE.strength,
      REST_EVIDENCE.hypertrophy,
      REST_EVIDENCE.isolation,
    ]) {
      expect(line).toMatch(/\d{4}/);
    }
  });
});
