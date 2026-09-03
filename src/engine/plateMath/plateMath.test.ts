import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { plateMath, weightStep } from './plateMath';

describe('plate math', () => {
  it('loads plates per side from the bar weight with the standard inventory', () => {
    const bench = requireExercise('barbell-bench-press');
    const result = plateMath(bench, 185, 'lb');
    expect(result.kind).toBe('bar');
    expect(result.barWeight).toBe(45);
    expect(result.perSide).toEqual([45, 25]);
    expect(result.remainder).toBe(0);
    expect(result.line).toBe('Bar 45 + per side: 45, 25');
    expect(plateMath(bench, 100, 'kg').perSide).toEqual([25, 15]);
    expect(plateMath(bench, 45, 'lb').line).toBe('Empty bar (45 lb)');
    expect(plateMath(bench, 188, 'lb').line).toContain('short');
  });

  it('clarifies per-hand loads and stacks', () => {
    const dumbbell = requireExercise('incline-dumbbell-press');
    expect(plateMath(dumbbell, 50, 'lb')).toMatchObject({
      kind: 'each-hand',
      line: '50 lb in each hand (2 × 50)',
    });
    const stack = { load: 'stack' as const, barWeight: undefined, name: 'Cable Fly' };
    expect(plateMath(stack, 120, 'lb').line).toBe('Pin the stack at 120 lb');
    expect(weightStep(dumbbell, 'lb')).toBe(5);
    expect(weightStep(stack, 'kg')).toBe(5);
    expect(weightStep(requireExercise('barbell-bench-press'), 'kg')).toBe(2.5);
  });
});
