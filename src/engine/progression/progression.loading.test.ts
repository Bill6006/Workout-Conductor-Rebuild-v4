import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import { record } from '../../test/records';
import type { Loading } from '../loading/loading';
import { capTarget, recommendNextTarget, type NextTarget } from './progression';
import { prescribe } from './roles';

const NOW = '2026-09-18T12:00:00.000Z';

/** The owner's leg curl stack: tens to 100, then twenties. */
const STACK: Loading = {
  available: [50, 60, 70, 80, 90, 100, 120, 140],
  step: 10,
  cap: 140,
  perSide: null,
};

function target(weight: number, from: number | null, reps: [number, number] = [8, 12]): NextTarget {
  return {
    weight,
    reps,
    rir: 2,
    mode: 'weight',
    increment: 5,
    sessions: 3,
    viaFamily: false,
    confidence: 'high',
    evidence: ['Top of the range on every set: add 5 lb and work back up the range.'],
    setsAdvice: 0,
    from,
  };
}

describe('a step the place cannot make', () => {
  it('holds the load where it was and pushes the reps until the next real weight is earned', () => {
    const fitted = capTarget(target(105, 100), STACK, 'lb');
    expect(fitted.weight).toBe(100);
    expect(fitted.reps).toEqual([10, 14]);
    expect(fitted.capped).toBeUndefined();
    expect(fitted.evidence.at(-1)).toBe(
      'The next weight here after 100 lb is 120: the reps go up first, and the load follows once they are earned.',
    );
  });

  it('lets a target that reaches the next weight through', () => {
    const fitted = capTarget(target(120, 100), STACK, 'lb');
    expect(fitted.weight).toBe(120);
    expect(fitted.reps).toEqual([8, 12]);
    expect(fitted.evidence).toHaveLength(1);
  });

  it('leaves a held or lowered load alone, and a bar with no list alone', () => {
    expect(capTarget(target(100, 100), STACK, 'lb')).toEqual(target(100, 100));
    expect(capTarget(target(90, 100), STACK, 'lb')).toEqual(target(90, 100));
    const bar: Loading = { available: null, step: 10, cap: null, perSide: [45, 25, 10, 5] };
    expect(capTarget(target(105, 100), bar, 'lb')).toEqual(target(105, 100));
  });

  it('still caps at the heaviest weight, with the ceiling marked', () => {
    const fitted = capTarget(target(145, 140), STACK, 'lb');
    expect(fitted.weight).toBe(140);
    expect(fitted.capped).toEqual({ at: 140 });
    expect(fitted.reps).toEqual([10, 14]);
  });

  it('the progression engine records the weight a target moved from', () => {
    const bench = requireExercise('barbell-bench-press');
    const profile = createDefaultProfile(NOW);
    const history = [
      record(3, 'barbell-bench-press', [
        [6, 185, 2],
        [6, 185, 2],
      ]),
    ];
    const next = recommendNextTarget({
      exercise: bench,
      role: 'primary-strength',
      prescription: prescribe(bench, 'primary-strength', profile),
      history,
      profile,
      now: NOW,
    });
    expect(next.from).toBe(185);
  });
});
