import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { tempoCue, truncate } from './tempo';

const bench = requireExercise('barbell-bench-press');
const fly = requireExercise('cable-fly');

describe('tempo cues', () => {
  it('follows the set’s job, not the exercise', () => {
    expect(tempoCue('primary-strength', 'working', bench).tempo).toBe('2-1-X');
    expect(tempoCue('primary-hypertrophy', 'working', bench).tempo).toBe('3-0-1');
    expect(tempoCue('isolation', 'working', fly).tempo).toBe('2-1-2');
    expect(tempoCue('primary-strength', 'warmup', bench).why).toContain('ramp set');
    expect(tempoCue('isolation', 'drop', fly).why).toContain('drop set');
  });

  it('carries the exercise’s first execution step as the cue, shortened', () => {
    const cue = tempoCue('primary-strength', 'working', bench).cue;
    expect(cue).toBe(truncate(bench.instructions.execution[0] as string));
    expect(cue?.length).toBeLessThanOrEqual(88);
    expect(truncate('short')).toBe('short');
    const long = truncate('a'.repeat(50) + ' ' + 'b'.repeat(60));
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBeLessThanOrEqual(88);
  });
});
