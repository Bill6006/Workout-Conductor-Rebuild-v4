import { describe, expect, it } from 'vitest';
import { EXERCISES, requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import { record } from '../../test/records';
import { buildSets, prescribe } from './roles';
import {
  applyProgression,
  estimateOneRepMax,
  performanceHistory,
  rampWeights,
  recommendNextTarget,
} from './progression';

const profile = createDefaultProfile('2026-09-10T12:00:00.000Z');

const bench = requireExercise('barbell-bench-press');
const fly = requireExercise('cable-fly');
const strengthRx = prescribe(bench, 'primary-strength', profile);
const isoRx = prescribe(fly, 'isolation', profile);

describe('progression engine', () => {
  it('starts without a load when nothing was logged', () => {
    const target = recommendNextTarget({
      exercise: bench,
      role: 'primary-strength',
      prescription: strengthRx,
      history: [],
      profile,
    });
    expect(target).toMatchObject({ mode: 'start', weight: null, sessions: 0, confidence: 'low' });
    expect(target.reps).toEqual(strengthRx.reps);
  });

  it('adds a load step to a strength lift once every set clears the floor with reps in reserve', () => {
    const history = [
      record(3, bench.id, [
        [5, 185, 2],
        [5, 185, 2],
        [4, 185, 2],
        [4, 185, 1],
      ]),
    ];
    const target = recommendNextTarget({
      exercise: bench,
      role: 'primary-strength',
      prescription: strengthRx,
      history,
      profile,
    });
    expect(target).toMatchObject({ mode: 'weight', weight: 190, increment: 5, sessions: 1 });
    expect(target.evidence[0]).toMatch(/^Last: 185 lb × 5, 5, 4, 4 @ RIR 1\.8/);
    const tight = [
      record(3, bench.id, [
        [5, 185, 0],
        [4, 185, 0],
        [4, 185, 0],
      ]),
    ];
    expect(
      recommendNextTarget({
        exercise: bench,
        role: 'primary-strength',
        prescription: strengthRx,
        history: tight,
        profile,
      }).mode,
    ).toBe('maintain');
  });

  it('uses double progression for hypertrophy work and never punishes one poor session', () => {
    const top = [
      record(
        2,
        fly.id,
        [
          [15, 40, 1],
          [15, 40, 1],
          [15, 40, 0],
        ],
        [10, 15],
        1,
      ),
    ];
    expect(
      recommendNextTarget({
        exercise: fly,
        role: 'isolation',
        prescription: isoRx,
        history: top,
        profile,
      }),
    ).toMatchObject({ mode: 'weight', weight: 50 });

    const inside = [
      record(
        2,
        fly.id,
        [
          [12, 40, 1],
          [11, 40, 1],
          [10, 40, 0],
        ],
        [10, 15],
        1,
      ),
    ];
    expect(
      recommendNextTarget({
        exercise: fly,
        role: 'isolation',
        prescription: isoRx,
        history: inside,
        profile,
      }),
    ).toMatchObject({ mode: 'reps', weight: 40 });

    const missedOnce = [
      record(
        2,
        fly.id,
        [
          [9, 40, 0],
          [8, 40, 0],
        ],
        [10, 15],
        1,
      ),
      record(
        5,
        fly.id,
        [
          [12, 40, 1],
          [11, 40, 1],
        ],
        [10, 15],
        1,
      ),
    ];
    expect(
      recommendNextTarget({
        exercise: fly,
        role: 'isolation',
        prescription: isoRx,
        history: missedOnce,
        profile,
      }),
    ).toMatchObject({ mode: 'maintain', weight: 40 });

    const missedTwice = [
      record(
        2,
        fly.id,
        [
          [9, 40, 0],
          [8, 40, 0],
        ],
        [10, 15],
        1,
      ),
      record(
        5,
        fly.id,
        [
          [9, 40, 0],
          [8, 40, 0],
        ],
        [10, 15],
        1,
      ),
    ];
    expect(
      recommendNextTarget({
        exercise: fly,
        role: 'isolation',
        prescription: isoRx,
        history: missedTwice,
        profile,
      }),
    ).toMatchObject({ mode: 'deload', weight: 30 });

    const missedThrice = [...missedTwice, record(8, fly.id, [[8, 40, 0]], [10, 15], 1)];
    expect(
      recommendNextTarget({
        exercise: fly,
        role: 'isolation',
        prescription: isoRx,
        history: missedThrice,
        profile,
      }),
    ).toMatchObject({ mode: 'regress', weight: 30 });
  });

  it('offers an extra set after two sessions at the top of the range and holds loads under high fatigue', () => {
    const history = [
      record(
        2,
        fly.id,
        [
          [15, 40, 1],
          [15, 40, 1],
        ],
        [10, 15],
        1,
      ),
      record(
        5,
        fly.id,
        [
          [15, 40, 1],
          [15, 40, 1],
        ],
        [10, 15],
        1,
      ),
    ];
    const target = recommendNextTarget({
      exercise: fly,
      role: 'isolation',
      prescription: isoRx,
      history,
      profile,
    });
    expect(target.setsAdvice).toBe(1);
    expect(target.confidence).toBe('medium');
    const tired = recommendNextTarget({
      exercise: fly,
      role: 'isolation',
      prescription: isoRx,
      history,
      profile,
      fatigueLevel: 'high',
    });
    expect(tired).toMatchObject({ mode: 'maintain', weight: 40 });
  });

  it('inherits the progression family when the exact exercise has no history', () => {
    const sibling = EXERCISES.find(
      (candidate) =>
        candidate.id !== bench.id && candidate.progressionFamily === bench.progressionFamily,
    );
    if (!sibling) return;
    const history = [
      record(3, sibling.id, [
        [5, 100, 2],
        [5, 100, 2],
      ]),
    ];
    const points = performanceHistory(history, bench);
    expect(points[0]).toMatchObject({ viaFamily: true, exerciseId: sibling.id, bestWeight: 100 });
    const target = recommendNextTarget({
      exercise: bench,
      role: 'primary-strength',
      prescription: strengthRx,
      history,
      profile,
    });
    expect(target.viaFamily).toBe(true);
    expect(target.evidence[0]).toContain(sibling.name);
  });

  it('writes loads into sets: working, ramp, and drop, and respects manual values', () => {
    const target = recommendNextTarget({
      exercise: bench,
      role: 'primary-strength',
      prescription: strengthRx,
      history: [
        record(3, bench.id, [
          [5, 185, 2],
          [5, 185, 2],
          [5, 185, 2],
          [5, 185, 2],
        ]),
      ],
      profile,
    });
    const sets = applyProgression(buildSets(strengthRx, 2), target, 5);
    expect(sets.filter((set) => set.kind === 'warmup').map((set) => set.targetWeight)).toEqual([
      95, 145,
    ]);
    expect(
      sets.filter((set) => set.kind === 'working').every((set) => set.targetWeight === 190),
    ).toBe(true);
    const withDrop = applyProgression(
      [
        ...buildSets(strengthRx, 0),
        {
          index: 9,
          kind: 'drop',
          targetReps: [8, 12],
          targetRir: 0,
          targetWeight: null,
          restSeconds: 0,
        },
      ],
      target,
      5,
    );
    expect(withDrop.find((set) => set.kind === 'drop')?.targetWeight).toBe(150);
    const manual = applyProgression(
      buildSets(strengthRx, 0).map((set) => ({
        ...set,
        targetWeight: 200,
        targetReps: [3, 5] as [number, number],
      })),
      target,
      5,
      { weight: true, reps: true },
    );
    expect(manual.every((set) => set.targetWeight === 200 && set.targetReps[0] === 3)).toBe(true);
    expect(rampWeights(200, 1, 5)).toEqual([120]);
    expect(rampWeights(null, 2, 5)).toEqual([null, null]);
    expect(estimateOneRepMax(185, 5)).toBe(215.8);
  });
});
