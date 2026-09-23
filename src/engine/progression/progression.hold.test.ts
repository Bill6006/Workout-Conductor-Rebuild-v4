import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { isHold } from '../../catalog/exercises/exerciseSchema';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { workSecondsFor } from '../duration/duration';
import { detectPersonalRecords } from '../scoring/personalRecords';
import { estimateFromOtherLifts } from './crossEstimate';
import type { Loading } from '../loading/loading';
import {
  HOLD_STEP_SECONDS,
  capTarget,
  performanceHistory,
  recommendNextTarget,
} from './progression';
import { lightRange, prescribe } from './roles';

/**
 * Maintenance 20: Plank and Farmer Carry are holds. Their seconds sit in the reps fields, today's
 * target first and the top of the range second; the seconds grow by five once every set reaches
 * them, and nothing that reads reps as strength reads a hold.
 */

const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const plank = requireExercise('plank');
const carry = requireExercise('farmer-carry');
const plankRx = prescribe(plank, 'finisher', profile);
const carryRx = prescribe(carry, 'finisher', profile);

function held(exerciseId: string, days: number, sets: SetSpec[], target: [number, number]) {
  return record(days, exerciseId, sets, target, 0);
}

function next(
  exercise: typeof plank,
  history: ReturnType<typeof held>[],
  extra: { fatigueLevel?: 'high' } = {},
) {
  return recommendNextTarget({
    exercise,
    role: 'finisher',
    prescription: exercise === plank ? plankRx : carryRx,
    history,
    profile,
    now: RECORD_NOW,
    ...extra,
  });
}

/** Dumbbells from 5 to the given heaviest, in the steps a rack of them has. */
function dumbbells(available: number[]): Loading {
  return { available, step: 5, cap: available[available.length - 1] ?? null, perSide: null };
}

/** Two sessions of Farmer Carry at 50 lb that held the full 40 s on every set. */
const carriedToTheTop = [
  held(
    'farmer-carry',
    3,
    [
      [40, 50, null],
      [40, 50, null],
    ],
    [35, 40],
  ),
  held(
    'farmer-carry',
    6,
    [
      [40, 50, null],
      [40, 50, null],
    ],
    [35, 40],
  ),
];

describe('holds in the catalog', () => {
  it('marks Plank and Farmer Carry as holds, with no drop sets and a range the light day keeps', () => {
    expect(isHold(plank)).toBe(true);
    expect(isHold(carry)).toBe(true);
    expect(isHold(requireExercise('dead-bug'))).toBe(false);
    expect(plank.dropSetSafe).toBe(false);
    expect(carry.dropSetSafe).toBe(false);
    expect(plankRx.reps).toEqual([30, 60]);
    expect(lightRange(plank)).toEqual([30, 60]);
    expect(lightRange(requireExercise('cable-fly'))).not.toEqual(
      requireExercise('cable-fly').repRanges.hypertrophy,
    );
  });
});

describe('the seconds a hold asks for next', () => {
  it('starts at the bottom of the range, and ignores a related exercise', () => {
    const first = next(plank, []);
    expect(first).toMatchObject({ hold: true, mode: 'start', reps: [30, 60] });
    expect(first.evidence).toEqual([
      'First time: hold 30 s, and the seconds grow as it gets easier.',
    ]);
    // A Dead Bug's reps are not a Plank's seconds.
    const family = next(plank, [held('dead-bug', 3, [[12, null, 1]], [10, 15])]);
    expect(family.reps).toEqual([30, 60]);
  });

  it('grows five seconds past the shortest hold once every set reached the target', () => {
    const steady = next(plank, [
      held(
        'plank',
        3,
        [
          [30, null, null],
          [32, null, null],
        ],
        [30, 60],
      ),
    ]);
    expect(steady).toMatchObject({ mode: 'reps', reps: [30 + HOLD_STEP_SECONDS, 60] });
    expect(steady.evidence[0]).toBe('Held 30 s or more on every set: 35 s next.');
    const strong = next(plank, [
      held(
        'plank',
        3,
        [
          [42, null, null],
          [41, null, null],
        ],
        [35, 60],
      ),
    ]);
    expect(strong.reps).toEqual([45, 60]);
    // Never past the top.
    const near = next(plank, [
      held(
        'plank',
        3,
        [
          [58, null, null],
          [59, null, null],
        ],
        [55, 60],
      ),
    ]);
    expect(near.reps).toEqual([60, 60]);
  });

  it('holds the target after a short set, and at the top says a harder variation is next', () => {
    const short = next(plank, [
      held(
        'plank',
        3,
        [
          [38, null, null],
          [30, null, null],
        ],
        [35, 60],
      ),
    ]);
    expect(short).toMatchObject({ mode: 'maintain', reps: [35, 60] });
    expect(short.evidence[0]).toBe('A set came in under 35 s: 35 s again.');
    const top = next(plank, [
      held(
        'plank',
        3,
        [
          [60, null, null],
          [61, null, null],
        ],
        [60, 60],
      ),
    ]);
    expect(top).toMatchObject({ mode: 'maintain', reps: [60, 60], setsAdvice: 0 });
    expect(top.evidence[0]).toMatch(/ready for a harder variation/);
  });

  it('keeps a carry at its load while the seconds grow, and adds weight from the bottom at the top', () => {
    const growing = next(carry, [
      held(
        'farmer-carry',
        3,
        [
          [25, 50, null],
          [26, 50, null],
        ],
        [20, 40],
      ),
    ]);
    expect(growing).toMatchObject({ weight: 50, reps: [30, 40] });
    const atTop = next(carry, [
      held(
        'farmer-carry',
        3,
        [
          [40, 50, null],
          [40, 50, null],
        ],
        [35, 40],
      ),
      held(
        'farmer-carry',
        6,
        [
          [40, 50, null],
          [40, 50, null],
        ],
        [35, 40],
      ),
    ]);
    expect(atTop.mode).toBe('weight');
    expect(atTop.weight).toBeGreaterThan(50);
    expect(atTop.reps).toEqual([20, 40]);
    expect(atTop.evidence[0]).toMatch(/from 20 s again\.$/);
  });
});

describe('a hold at the top, after a break, and when tired', () => {
  it('keeps the full seconds when the weights here go no heavier, and takes the next real one', () => {
    const atTop = next(carry, carriedToTheTop);
    const capped = capTarget(atTop, dumbbells([30, 40, 50]), 'lb');
    expect(capped).toMatchObject({ weight: 50, mode: 'maintain', reps: [40, 40] });
    expect(capped.evidence[0]).toMatch(/no heavier weight here than 50 lb: 40 s again\.$/);
    // A rack that skips 55 goes to 60 from the bottom, rather than waiting on reps a hold has not.
    const jumped = capTarget(atTop, dumbbells([40, 50, 60, 70]), 'lb');
    expect(jumped).toMatchObject({ weight: 60, reps: [20, 40] });
  });

  it('starts again from the bottom after a long break, a carry a step lighter', () => {
    const plankBreak = next(plank, [held('plank', 30, [[50, null, null]], [45, 60])]);
    expect(plankBreak).toMatchObject({ mode: 'return', reps: [30, 60], weight: null });
    expect(plankBreak.evidence[0]).toBe('30 days since the last session: back to 30 s.');
    const carryBreak = next(carry, [held('farmer-carry', 30, [[30, 50, null]], [25, 40])]);
    expect(carryBreak).toMatchObject({ mode: 'return', reps: [20, 40], weight: 45 });
  });

  it('repeats the target when fatigue is high, and says a twice-missed carry comes down', () => {
    const tired = next(plank, [held('plank', 3, [[40, null, null]], [35, 60])], {
      fatigueLevel: 'high',
    });
    expect(tired).toMatchObject({ mode: 'maintain', reps: [35, 60] });
    expect(tired.evidence[0]).toBe('Fatigue is high: 35 s again.');
    const missed = next(carry, [
      held('farmer-carry', 3, [[25, 50, null]], [30, 40]),
      held('farmer-carry', 6, [[26, 50, null]], [30, 40]),
    ]);
    expect(missed.mode).toBe('deload');
    expect(missed.weight).toBeLessThan(50);
    expect(missed.reps).toEqual([30, 40]);
    expect(missed.evidence[0]).toMatch(
      /^Short of 30 s more than once in a row: \d+ lb for 30 s\.$/,
    );
  });
});

describe('what never reads a hold as reps', () => {
  const carried = [held('farmer-carry', 3, [[40, 50, null]], [20, 40])];

  it('gives no estimated max, no cross-lift estimate and no personal record', () => {
    expect(performanceHistory(carried, carry)[0]?.e1rm).toBeNull();
    expect(
      estimateFromOtherLifts(requireExercise('barbell-row'), carried, RECORD_NOW, 'lb'),
    ).toBeNull();
    const longer = held('farmer-carry', 1, [[40, 60, null]], [20, 40]);
    expect(detectPersonalRecords(longer, [...carried, longer])).toEqual([]);
  });

  it("counts a hold's own seconds in the time estimate", () => {
    const finisher = { role: 'finisher' as const, progression: undefined };
    expect(workSecondsFor(finisher, { kind: 'working', targetReps: [30, 60] }, true)).toBe(35);
    expect(workSecondsFor(finisher, { kind: 'working', targetReps: [30, 60] })).toBe(230);
  });
});
