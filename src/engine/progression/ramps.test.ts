import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { rampWeights } from './progression';
import { MARKEDLY_HEAVIER, rampRoom, rampSetsFor, type RampContext } from './roles';

const bench = requireExercise('barbell-bench-press');
const cold: RampContext = { samePattern: null, sameMuscles: false, afterBreak: false };
const bar = { step: 5, floor: 45 };

describe('ramps decided from the whole session', () => {
  it('keeps the full ramp on the first heavy compound of a cold pattern', () => {
    expect(rampSetsFor(bench, 'primary-strength', 60)).toBe(2);
    expect(rampSetsFor(bench, 'primary-strength', 60, cold, { weight: 135, ...bar })).toBe(2);
  });

  it('gives none on a pattern already trained today, one when markedly heavier', () => {
    const trained: RampContext = { ...cold, samePattern: { weight: 100 } };
    expect(rampSetsFor(bench, 'primary-strength', 60, trained, { weight: 105, ...bar })).toBe(0);
    expect(
      rampSetsFor(bench, 'primary-strength', 60, trained, {
        weight: 100 * MARKEDLY_HEAVIER,
        ...bar,
      }),
    ).toBe(1);
  });

  it('gives one light set on warm muscles at a new angle, and the full ramp back after a long break', () => {
    const warm: RampContext = { ...cold, sameMuscles: true };
    expect(rampSetsFor(bench, 'primary-strength', 60, warm, { weight: 135, ...bar })).toBe(1);
    const back: RampContext = { samePattern: { weight: 100 }, sameMuscles: true, afterBreak: true };
    expect(rampSetsFor(bench, 'primary-strength', 60, back, { weight: 135, ...bar })).toBe(2);
  });

  it('never puts a ramp at the working weight: none at the empty bar, one just above it', () => {
    expect(rampRoom({ weight: 45, ...bar })).toBe(0);
    expect(rampRoom({ weight: 50, ...bar })).toBe(1);
    expect(rampRoom({ weight: 10, step: 5, floor: null })).toBe(1);
    expect(rampRoom({ weight: null, step: 5, floor: null })).toBe(Number.POSITIVE_INFINITY);
    expect(rampSetsFor(bench, 'primary-strength', 60, cold, { weight: 45, ...bar })).toBe(0);
    expect(rampSetsFor(bench, 'primary-strength', 60, cold, { weight: 50, ...bar })).toBe(1);
  });
});

describe('ramp weights', () => {
  it('sit under the working weight, never under the bar, each heavier than the last', () => {
    expect(rampWeights(200, 1, 5)).toEqual([120]);
    expect(rampWeights(200, 2, 5, 45)).toEqual([100, 150]);
    expect(rampWeights(50, 1, 5, 45)).toEqual([45]);
    expect(rampWeights(55, 2, 5, 45)).toEqual([45, 50]);
    expect(rampWeights(60, 2, 5, 45)).toEqual([45, 50]);
    expect(rampWeights(null, 2, 5)).toEqual([null, null]);
  });
});
