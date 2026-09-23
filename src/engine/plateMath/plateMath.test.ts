import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { plateMath, platesFor, sideWeights, weightStep } from './plateMath';

describe('plate math', () => {
  it('loads plates per side from the bar weight with the standard inventory', () => {
    const bench = requireExercise('barbell-bench-press');
    const result = plateMath(bench, 185, 'lb');
    expect(result.kind).toBe('bar');
    expect(result.barWeight).toBe(45);
    expect(result.perSide).toEqual([45, 25]);
    expect(result.remainder).toBe(0);
    expect(result.line).toBe('Bar 45 + 45, 25 each side · 185 lb');
    expect(plateMath(bench, 100, 'kg').perSide).toEqual([25, 15]);
    expect(plateMath(bench, 45, 'lb').line).toBe('Empty bar · 45 lb');
  });

  it('says what to load in one line, and never a shortfall', () => {
    const bench = requireExercise('barbell-bench-press');
    const noSmallPlates = [45, 35, 25, 10, 5];
    expect(plateMath(bench, 95, 'lb', noSmallPlates).line).toBe('Bar 45 + 25 each side · 95 lb');
    // A weight these plates cannot make names the two they can, either side of it.
    const hundred = plateMath(bench, 100, 'lb', noSmallPlates);
    expect(hundred.line).toBe('The plates here make 95 or 105, not 100 lb');
    expect(hundred.line).not.toContain('short');
    expect(hundred.perSide).toEqual([]);
    expect(plateMath(bench, 188, 'lb').line).toBe('The plates here make 185 or 190, not 188 lb');
  });

  it('finds combinations a heaviest-first fill would miss', () => {
    // 50 a side from 45s and 25s is two 25s; 45 then nothing fits.
    expect(platesFor(50, [45, 25])).toEqual([25, 25]);
    expect(platesFor(35, [45, 25])).toBeNull();
    expect(platesFor(47.5, [45, 35, 25, 10, 5, 2.5])).toEqual([45, 2.5]);
    expect(platesFor(0, [45])).toEqual([]);
    expect(sideWeights([45, 25], 100)).toEqual([0, 25, 45, 50, 70, 75, 90, 95, 100]);
    const bench = requireExercise('barbell-bench-press');
    expect(plateMath(bench, 145, 'lb', [45, 25]).line).toBe('Bar 45 + 25, 25 each side · 145 lb');
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
