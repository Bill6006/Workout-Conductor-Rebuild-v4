import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import {
  ageFactor,
  barWeightFor,
  convertEstimate,
  estimateStartingMax,
  floorToBar,
  sexFactor,
  startRatio,
} from './startingLoad';

const profile = createDefaultProfile('2026-09-10T12:00:00.000Z');
const bench = requireExercise('barbell-bench-press');
const dumbbellBench = requireExercise('dumbbell-bench-press');
const pushUp = requireExercise('push-up');

describe('starting load references', () => {
  it('reads a reference ratio per exercise: bars by pattern, dumbbells per hand, machines by table', () => {
    expect(startRatio(bench)).toBe(1);
    expect(startRatio(dumbbellBench)).toBe(0.4);
    expect(startRatio(requireExercise('leg-press'))).toBe(2.2);
    expect(startRatio(requireExercise('lat-pulldown'))).toBe(0.8);
    expect(startRatio(requireExercise('ez-bar-curl'))).toBe(0.4);
    expect(startRatio(pushUp)).toBeNull();
    expect(startRatio(requireExercise('band-curl'))).toBeNull();
    // A custom exercise with no table entry falls back to its pattern and load type.
    expect(startRatio({ id: 'custom-sled-squat', movementPattern: 'squat', load: 'stack' })).toBe(
      1.125,
    );
  });

  it('scales by age and by sex, lower body less than upper', () => {
    expect(ageFactor(undefined)).toBe(1);
    expect(ageFactor(30)).toBe(1);
    expect(ageFactor(40)).toBe(0.92);
    expect(ageFactor(50)).toBe(0.84);
    expect(ageFactor(60)).toBe(0.76);
    expect(ageFactor(70)).toBe(0.68);
    expect(sexFactor('male', 'squat')).toBe(1);
    expect(sexFactor('female', 'horizontal-push')).toBe(0.6);
    expect(sexFactor('female', 'squat')).toBe(0.7);
    expect(sexFactor(undefined, 'horizontal-push')).toBe(0.8);
    expect(sexFactor(undefined, 'squat')).toBe(0.85);
  });

  it('estimates a starting max from bodyweight, experience, sex, and age, and says so', () => {
    const male = estimateStartingMax(bench, {
      ...profile,
      bodyweight: 180,
      sex: 'male',
      age: 30,
    });
    expect(male?.e1rm).toBe(180);
    expect(male?.evidence).toBe(
      'Starting estimate from your 180 lb bodyweight, intermediate lifter, male, age 30: about 180 lb max; the first target sits under it. Log a set and the target follows.',
    );
    // 60 kg x 0.4 per hand x 0.6 beginner x 0.6 female upper body x 0.84 (age 50) = 7.3 per hand.
    const beginner = estimateStartingMax(dumbbellBench, {
      ...profile,
      units: 'kg',
      bodyweight: 60,
      experience: 'beginner',
      sex: 'female',
      age: 50,
    });
    expect(beginner?.e1rm).toBe(7.3);
    expect(beginner?.evidence).toMatch(/about 7 kg max per hand/);
    expect(estimateStartingMax(bench, profile)).toBeNull();
    expect(estimateStartingMax(pushUp, { ...profile, bodyweight: 180 })).toBeNull();
  });

  it('knows the empty bar and never targets below it', () => {
    expect(barWeightFor(bench, 'lb')).toBe(45);
    expect(barWeightFor(bench, 'kg')).toBe(20);
    expect(barWeightFor(requireExercise('ez-bar-curl'), 'lb')).toBe(25);
    expect(barWeightFor(dumbbellBench, 'lb')).toBeNull();
    expect(floorToBar(30, bench, 'lb')).toBe(45);
    expect(floorToBar(95, bench, 'lb')).toBe(95);
    expect(floorToBar(null, bench, 'lb')).toBeNull();
    expect(floorToBar(30, dumbbellBench, 'lb')).toBe(30);
  });

  it('converts a family estimate between load types by their references', () => {
    expect(convertEstimate(76, dumbbellBench, bench)).toEqual({ e1rm: 190, converted: true });
    expect(convertEstimate(190, bench, dumbbellBench)).toEqual({ e1rm: 76, converted: true });
    expect(convertEstimate(100, bench, bench)).toEqual({ e1rm: 100, converted: false });
    expect(convertEstimate(100, pushUp, bench)).toEqual({ e1rm: 100, converted: false });
  });
});
