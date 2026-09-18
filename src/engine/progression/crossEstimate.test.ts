import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW, record } from '../../test/records';
import { estimateFromOtherLifts } from './crossEstimate';
import { recommendNextTarget } from './progression';
import { prescribe } from './roles';
import { startRatio } from './startingLoad';

const bench = requireExercise('barbell-bench-press');
const incline = requireExercise('incline-dumbbell-press');
const squat = requireExercise('back-squat');
const pushUp = requireExercise('push-up');

const benchDay = record(3, 'barbell-bench-press', [
  [5, 185, 2],
  [5, 185, 2],
]);

describe('a starting estimate from other lifts', () => {
  it('scales a known max through the reference ratios, bodyweight not needed', () => {
    const estimate = estimateFromOtherLifts(incline, [benchDay], RECORD_NOW, 'lb');
    expect(estimate).not.toBeNull();
    if (!estimate) return;
    const benchMax = 185 * (1 + 5 / 30);
    const expected = (benchMax / (startRatio(bench) as number)) * (startRatio(incline) as number);
    expect(estimate.e1rm).toBeCloseTo(expected, 0);
    expect(estimate.fromExerciseId).toBe('barbell-bench-press');
    expect(estimate.confidence).toBe('low');
    expect(estimate.evidence).toMatch(
      /^From your Barbell Bench Press \(about 216 lb max\): about \d+ lb max per hand here/,
    );
  });

  it('weighs lifts on the same muscles most, and two of them earn medium confidence', () => {
    const history = [
      benchDay,
      record(5, 'overhead-press', [[6, 95, 2]]),
      record(2, 'back-squat', [[5, 275, 2]]),
    ];
    const estimate = estimateFromOtherLifts(incline, history, RECORD_NOW, 'lb');
    expect(estimate?.confidence).toBe('medium');
    expect(estimate?.evidence).toContain('and 2 other lifts');
    // A far-away lift alone still gives a number, but only a low-confidence one.
    const fromLegs = estimateFromOtherLifts(
      incline,
      [record(2, 'back-squat', [[5, 275, 2]])],
      RECORD_NOW,
      'lb',
    );
    expect(fromLegs?.confidence).toBe('low');
  });

  it('gives nothing without history, for a bodyweight move, or from stale sessions', () => {
    expect(estimateFromOtherLifts(incline, [], RECORD_NOW, 'lb')).toBeNull();
    expect(estimateFromOtherLifts(pushUp, [benchDay], RECORD_NOW, 'lb')).toBeNull();
    expect(
      estimateFromOtherLifts(
        squat,
        [record(200, 'barbell-bench-press', [[5, 185, 2]])],
        RECORD_NOW,
        'lb',
      ),
    ).toBeNull();
  });

  it('sets the first target of a lift never done, ahead of the bodyweight table', () => {
    const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
    const target = recommendNextTarget({
      exercise: incline,
      role: 'secondary-hypertrophy',
      prescription: prescribe(incline, 'secondary-hypertrophy', profile),
      history: [benchDay],
      profile,
      now: RECORD_NOW,
    });
    expect(target.mode).toBe('start');
    expect(target.evidence[0]).toMatch(/^From your Barbell Bench Press/);
    expect(target.weight).not.toBeNull();
    const fromTable = recommendNextTarget({
      exercise: incline,
      role: 'secondary-hypertrophy',
      prescription: prescribe(incline, 'secondary-hypertrophy', profile),
      history: [],
      profile,
      now: RECORD_NOW,
    });
    expect(fromTable.evidence[0]).toMatch(/^Starting estimate from your/);
  });
});
