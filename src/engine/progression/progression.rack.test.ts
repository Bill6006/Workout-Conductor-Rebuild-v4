import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { PLATES_KEY, loadingFor } from '../loading/loading';
import { capTarget, rackFit, type NextTarget } from './progression';

const bench = requireExercise('barbell-bench-press');
const full = loadingFor(undefined, undefined, bench, 'lb');
const noSmallPlatesToday = loadingFor(undefined, { missingPlates: [2.5] }, bench, 'lb');
/** A rack that never had 2.5s. */
const rackWithoutSmall = loadingFor(
  { [PLATES_KEY]: { kind: 'plates', perSide: [45, 35, 25, 10, 5] } },
  undefined,
  bench,
  'lb',
);

function target(weight: number, reps: [number, number] = [8, 10], from: number | null = null) {
  const next: NextTarget = {
    weight,
    reps,
    rir: 2,
    mode: 'weight',
    increment: 5,
    sessions: 3,
    viaFamily: false,
    confidence: 'high',
    evidence: ['Top of the range: add 5 lb.'],
    setsAdvice: 0,
    from,
  };
  return next;
}

describe('a target the plates cannot make', () => {
  it('comes down to what they make, with the reps that keep the effort, and says why', () => {
    const fitted = capTarget(target(100), noSmallPlatesToday, 'lb');
    expect(fitted.weight).toBe(95);
    expect(fitted.reps).toEqual([10, 12]);
    expect(fitted.rack).toEqual({
      asked: 100,
      loaded: 95,
      extra: 2,
      line: 'No 2.5s today: 95 instead of 100, two extra reps.',
    });
    expect(fitted.evidence.at(-1)).toBe('No 2.5s today: 95 instead of 100, two extra reps.');
  });

  it('names the plates themselves when the rack never makes it', () => {
    const fitted = capTarget(target(100), rackWithoutSmall, 'lb');
    expect(fitted.weight).toBe(95);
    expect(fitted.rack?.line).toBe('The plates here make 95, not 100 lb: two extra reps.');
  });

  it('leaves a target the plates make exactly as it was', () => {
    expect(capTarget(target(100), full, 'lb')).toEqual(target(100));
    expect(capTarget(target(95), noSmallPlatesToday, 'lb')).toEqual(target(95));
  });

  it('a plate missing today is the reason given, even where the step would hold the load', () => {
    const fitted = capTarget(target(100, [8, 10], 95), noSmallPlatesToday, 'lb');
    expect(fitted.weight).toBe(95);
    expect(fitted.rack?.line).toBe('No 2.5s today: 95 instead of 100, two extra reps.');
    // On a rack that never had them, the step itself is the reason, as before.
    const held = capTarget(target(100, [8, 10], 95), rackWithoutSmall, 'lb');
    expect(held.weight).toBe(95);
    expect(held.rack?.line).toBe(
      'The next weight here after 95 lb is 105: the reps go up first, and the load follows once they are earned.',
    );
  });

  it('keeps the added reps between one and three, and never past twenty', () => {
    expect(rackFit(100, [8, 10], noSmallPlatesToday, 'lb')?.extra).toBe(2);
    // A big drop still adds at most three.
    const odd = loadingFor(
      { [PLATES_KEY]: { kind: 'plates', perSide: [45] } },
      undefined,
      bench,
      'lb',
    );
    expect(rackFit(125, [8, 10], odd, 'lb')).toMatchObject({ loaded: 45, extra: 3 });
    expect(rackFit(100, [18, 20], noSmallPlatesToday, 'lb')).toMatchObject({
      extra: 0,
      line: 'No 2.5s today: 95 instead of 100, the reps are already at the top.',
    });
  });
});
