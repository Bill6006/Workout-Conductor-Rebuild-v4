import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import {
  PERSONAL_CURVE,
  curveLoad,
  curvePairs,
  curveReadings,
  liftCurve,
  pairConstant,
  ruleLoad,
  withinSpan,
  wouldPair,
  type CurveReading,
  type LiftCurve,
} from './personalCurve';
import { estimateOneRepMax, loadFromEstimate } from './progression';

const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(Date.parse(RECORD_NOW) - daysAgo * DAY).toISOString();

/** A workout with one reserve check: `weight` for `total` reps to failure. */
function check(
  daysAgo: number,
  weight: number,
  total: number,
  options: { exerciseId?: string; stopped?: boolean; failedEarly?: boolean; id?: string } = {},
): WorkoutRecord {
  const when = at(daysAgo);
  return {
    id: options.id ?? `w-${daysAgo}-${weight}-${total}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'pull-arms',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: options.exerciseId ?? 'cable-curl',
        plannedSets: 1,
        sets: [
          {
            kind: 'working',
            reps: Math.max(1, total - 2),
            weight,
            rir: 1,
            completed: true,
            setIndex: 0,
            loggedAt: when,
            reserveCheck: {
              total,
              ...(options.stopped ? { stopped: true } : {}),
              ...(options.failedEarly ? { failedEarly: true } : {}),
            },
          },
        ],
      },
    ],
  };
}

/** Readings exactly on a curve of `k` with a max of `max`, at the loads for these reps. */
function onCurve(k: number, max: number, reps: number[], daysApart = 7): WorkoutRecord[] {
  return reps.map((n, index) =>
    check(daysApart * (reps.length - 1 - index), max / (1 + n / k), n, { id: `w-${index}` }),
  );
}

const reading = (weight: number, reps: number, daysAgo = 0): CurveReading => ({
  at: at(daysAgo),
  weight,
  reps,
});

describe('the readings a curve learns from', () => {
  it('are the checks on the lift in the last twelve weeks that went to failure', () => {
    const history = [
      check(3, 40, 15),
      check(10, 50, 8, { failedEarly: true }),
      check(20, 45, 12, { stopped: true }),
      check(PERSONAL_CURVE.WINDOW_DAYS + 1, 40, 15),
      check(5, 40, 15, { exerciseId: 'leg-extension' }),
      check(4, 40, 21),
    ];
    expect(curveReadings(history, 'cable-curl', RECORD_NOW).map((one) => one.reps)).toEqual([
      8, 15,
    ]);
  });

  it('are none on a lift a check does not suit, or before a reset', () => {
    expect(
      curveReadings(
        [check(3, 40, 15, { exerciseId: 'dumbbell-curl' })],
        'dumbbell-curl',
        RECORD_NOW,
      ),
    ).toEqual([]);
    expect(curveReadings([check(10, 40, 15)], 'cable-curl', RECORD_NOW, at(5))).toEqual([]);
  });
});

describe('the constant a pair reads', () => {
  it('is the k at which both loads give the same max', () => {
    // On k = 24 with a max of 100: 8 reps at 75, 16 reps at 60.
    const pair = pairConstant(reading(75, 8), reading(60, 16));
    expect(pair?.k).toBeCloseTo(24, 6);
    expect(pair?.heavier.weight).toBe(75);
  });

  it('needs reps far enough apart, a load between them, days close, and a believable constant', () => {
    // Five reps apart at a believable constant (24.5): too close to say much. Six apart pairs.
    expect(pairConstant(reading(75, 8), reading(65, 8 + PERSONAL_CURVE.PAIR_REPS - 1))).toBeNull();
    expect(pairConstant(reading(75, 8), reading(63, 8 + PERSONAL_CURVE.PAIR_REPS))?.k).toBeCloseTo(
      23.5,
      6,
    );
    expect(pairConstant(reading(60, 8), reading(60, 16))).toBeNull();
    expect(pairConstant(reading(75, 8, PERSONAL_CURVE.PAIR_DAYS + 1), reading(60, 16))).toBeNull();
    expect(pairConstant(reading(75, 8, PERSONAL_CURVE.PAIR_DAYS), reading(60, 16))).not.toBeNull();
    // A constant past the bounds is noise: 8 reps at 100 and 16 at 99.
    expect(pairConstant(reading(100, 8), reading(99, 16))).toBeNull();
  });

  it('is less sure the further apart the days', () => {
    const near = pairConstant(reading(75, 8, 0), reading(60, 16, 0))!;
    const far = pairConstant(reading(75, 8, 14), reading(60, 16, 0))!;
    expect(far.variance).toBeGreaterThan(near.variance);
  });

  it('pairs each reading once, the surest pairs first', () => {
    const pairs = curvePairs([reading(75, 8, 14), reading(60, 16, 7), reading(75, 8, 0)]);
    expect(pairs).toHaveLength(1);
  });
});

describe("a lift's curve", () => {
  it("is the population's, and not active, with no pairs", () => {
    const curve = liftCurve([check(3, 40, 15)], 'cable-curl', RECORD_NOW);
    expect(curve.k).toBe(PERSONAL_CURVE.POPULATION_K);
    expect(curve.sd).toBe(PERSONAL_CURVE.PRIOR_SD);
    expect(curve.active).toBe(false);
    expect(curve.span).toBeNull();
  });

  it('is drawn from 30 toward its pairs, and grows surer with more', () => {
    const one = liftCurve(onCurve(22, 100, [8, 16]), 'cable-curl', RECORD_NOW);
    const three = liftCurve(onCurve(22, 100, [8, 16, 8, 16, 8, 16]), 'cable-curl', RECORD_NOW);
    expect(one.k).toBeLessThan(30);
    expect(one.k).toBeGreaterThan(22);
    expect(three.k).toBeLessThan(one.k);
    expect(three.sd).toBeLessThan(one.sd);
    expect(three.span).toEqual([7, 17]);
  });

  it('acts once it is sure enough, even within what a last-set loss could explain', () => {
    // Twelve weekly checks on a curve of 24.5: sure enough, though not far enough from 30 to act on
    // the difference alone.
    const sure = liftCurve(
      onCurve(
        24.5,
        100,
        Array.from({ length: 12 }, (_, i) => (i % 2 ? 16 : 8)),
      ),
      'cable-curl',
      RECORD_NOW,
    );
    expect(sure.sd).toBeLessThanOrEqual(PERSONAL_CURVE.ACTIVE_SD);
    expect(sure.k).toBeGreaterThan(PERSONAL_CURVE.POPULATION_K * (1 - PERSONAL_CURVE.LOSS_BOUND));
    expect(sure.active).toBe(true);
  });

  it('acts when confidently far from 30, before it is that sure', () => {
    // A lifter who gets far more reps than most: loads close together, so less sure, but clearly
    // above 30, where a last-set loss could only have hidden more.
    const high = liftCurve(
      onCurve(48, 100, [8, 16, 8, 16, 8, 16, 8, 16]),
      'cable-curl',
      RECORD_NOW,
    );
    expect(high.sd).toBeGreaterThan(PERSONAL_CURVE.ACTIVE_SD);
    expect(high.k).toBeGreaterThan(30);
    expect(high.active).toBe(true);
  });

  it('does not act near 30 on a few checks', () => {
    const near = liftCurve(onCurve(31, 100, [8, 16, 8, 16]), 'cable-curl', RECORD_NOW);
    expect(near.pairs).toBe(2);
    expect(near.active).toBe(false);
  });

  it('does not act below 30 by less than a last-set loss could explain', () => {
    // 26 is within what a fifth fewer reps on a last set would make of 30.
    const shallow = liftCurve(onCurve(26, 100, [8, 16, 8, 16, 8, 16]), 'cable-curl', RECORD_NOW);
    expect(shallow.sd).toBeGreaterThan(PERSONAL_CURVE.ACTIVE_SD);
    expect(shallow.active).toBe(false);
  });

  it('speaks only for the reps its pairs spanned', () => {
    const curve = liftCurve(onCurve(14, 100, [8, 16, 8, 16, 8, 16]), 'cable-curl', RECORD_NOW);
    expect(curve.active).toBe(true);
    expect(withinSpan(curve, 7)).toBe(true);
    expect(withinSpan(curve, 17)).toBe(true);
    expect(withinSpan(curve, 6)).toBe(false);
    expect(withinSpan(curve, 18)).toBe(false);
    expect(curveLoad(curve, 75, { reps: 6, rir: 0 }, 12)).toBeNull();
    // Six with two left is eight to failure, inside the span: reps to failure, as its readings.
    expect(curveLoad(curve, 75, { reps: 6, rir: 2 }, 12)).not.toBeNull();
    expect(curveLoad({ ...curve, active: false }, 75, { reps: 8, rir: 0 }, 12)).toBeNull();
  });
});

describe('the conversion a curve makes', () => {
  it('is the rule everyone gets at a constant of 30, to the same twelve reps', () => {
    const conversions: [number, number][] = [
      [5, 12],
      [8, 15],
      [12, 6],
      [15, 20],
    ];
    for (const [from, to] of conversions) {
      const max = estimateOneRepMax(100, from);
      // The rule rounds its estimate to a tenth of a pound: the same within that.
      expect(ruleLoad(100, from, to, 30)).toBeCloseTo(loadFromEstimate(max, to, 0, 1, 0.0001), 1);
    }
  });

  it("moves the rule's load by the curve's own shape in reps to failure", () => {
    const curve: LiftCurve = { k: 20, sd: 1, pairs: 3, readings: 6, span: [4, 18], active: true };
    // At a constant of 30 the rule's load stands, whatever the reserve: its margin is everyone's.
    expect(curveLoad({ ...curve, k: 30 }, 100, { reps: 6, rir: 2 }, 12)).toBeCloseTo(100, 9);
    // Six with two left is eight to failure: the curve's shape from eight, not from six.
    const read = curveLoad(curve, 100, { reps: 6, rir: 2 }, 12)!;
    expect(read).toBeCloseTo((100 * ruleLoad(1, 8, 12, 20)) / ruleLoad(1, 8, 12, 30), 9);
    expect(read).toBeGreaterThan(curveLoad(curve, 100, { reps: 6, rir: null }, 12)!);
  });

  it('asks less of a lifter whose curve is lower when the reps go up', () => {
    expect(ruleLoad(100, 6, 12, 20)).toBeLessThan(ruleLoad(100, 6, 12, 30));
    expect(ruleLoad(100, 12, 6, 20)).toBeGreaterThan(ruleLoad(100, 12, 6, 30));
  });
});

describe('whether a check today would pair', () => {
  it('does with a recent reading far enough apart in reps and at another load', () => {
    const history = [check(5, 75, 8)];
    expect(wouldPair(history, 'cable-curl', 16, 60, RECORD_NOW)).toBe(true);
    expect(wouldPair(history, 'cable-curl', 10, 70, RECORD_NOW)).toBe(false);
    expect(wouldPair(history, 'cable-curl', 16, 75, RECORD_NOW)).toBe(false);
  });

  it('does not with a reading that has its pair, or one too old', () => {
    expect(wouldPair([check(5, 75, 8), check(3, 60, 16)], 'cable-curl', 16, 60, RECORD_NOW)).toBe(
      false,
    );
    expect(
      wouldPair([check(PERSONAL_CURVE.PAIR_DAYS + 1, 75, 8)], 'cable-curl', 16, 60, RECORD_NOW),
    ).toBe(false);
  });
});
