import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { TEMPO_EVIDENCE, notation, tempoCue, truncate } from './tempo';

const bench = requireExercise('barbell-bench-press');
const fly = requireExercise('cable-fly');

describe('tempo cues', () => {
  it('follows the set’s job, not the exercise, with lower-pause-lift-squeeze notation', () => {
    expect(tempoCue('primary-strength', 'working', bench).tempo).toBe('2-1-X-0');
    expect(tempoCue('primary-hypertrophy', 'working', bench).tempo).toBe('3-0-1-0');
    expect(tempoCue('isolation', 'working', fly).tempo).toBe('2-0-2-1');
    expect(tempoCue('primary-strength', 'warmup', bench).tempo).toBe('2-0-1-0');
    expect(tempoCue('primary-strength', 'warmup', bench).why).toContain('ramp set');
    expect(tempoCue('isolation', 'drop', fly).why).toContain('drop set');
  });

  it('models phases in seconds so a bar can show them in proportion', () => {
    const strength = tempoCue('primary-strength', 'working', bench);
    expect(strength.phases.map((phase) => phase.key)).toEqual(['lower', 'hold', 'lift', 'squeeze']);
    expect(strength.phases[2]).toMatchObject({ fast: true, seconds: 1 });
    expect(strength.totalSeconds).toBe(4);
    expect(notation(strength.phases)).toBe('2-1-X-0');
    const isolation = tempoCue('isolation', 'working', fly);
    expect(isolation.totalSeconds).toBe(5);
  });

  it('carries evidence for every choice and the exercise’s first execution step as the cue', () => {
    const strength = tempoCue('primary-strength', 'working', bench);
    expect(strength.evidence).toContain(TEMPO_EVIDENCE.intent);
    expect(
      strength.evidence.every((line) => /\(.*\d{4}.*\)|coaching practice|never count/.test(line)),
    ).toBe(true);
    expect(tempoCue('isolation', 'working', fly).evidence[0]).toBe(TEMPO_EVIDENCE.squeeze);
    const cue = strength.cue;
    expect(cue).toBe(truncate(bench.instructions.execution[0] as string));
    expect(cue?.length).toBeLessThanOrEqual(72);
    expect(truncate('short')).toBe('short');
  });
});
