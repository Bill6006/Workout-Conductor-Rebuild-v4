import { describe, expect, it } from 'vitest';
import { EXERCISES, requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import { record } from '../../test/records';
import { emptyMaxes, recordMax } from './maxes';
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
  it('starts a bar lift at the empty bar and a stack lift without a load when nothing was logged', () => {
    const target = recommendNextTarget({
      exercise: bench,
      role: 'primary-strength',
      prescription: strengthRx,
      history: [],
      profile,
    });
    expect(target).toMatchObject({ mode: 'start', weight: 45, sessions: 0, confidence: 'low' });
    expect(target.reps).toEqual(strengthRx.reps);
    expect(target.evidence.join(' ')).toMatch(/start with the empty bar \(45 lb\)/);
    expect(target.evidence.join(' ')).toMatch(/Add your bodyweight in Settings/);

    const stack = recommendNextTarget({
      exercise: fly,
      role: 'isolation',
      prescription: isoRx,
      history: [],
      profile,
    });
    expect(stack).toMatchObject({ mode: 'start', weight: null });
    expect(stack.evidence.join(' ')).toMatch(/enter the weight you use/);
  });

  it('starts from the bodyweight estimate, and from an entered max before that', () => {
    const heavier = { ...profile, bodyweight: 180, sex: 'male' as const, age: 30 };
    const estimated = recommendNextTarget({
      exercise: bench,
      role: 'primary-strength',
      prescription: strengthRx,
      history: [],
      profile: heavier,
    });
    // Reference max 1.0 x 180 lb; 8 effective reps: 180 / 1.2667 = 142.1; 85% = 120.8 -> 120.
    expect(estimated).toMatchObject({ mode: 'start', weight: 120, confidence: 'low' });
    expect(estimated.evidence.join(' ')).toMatch(
      /Starting estimate from your 180 lb bodyweight, intermediate lifter, male, age 30: about 180 lb max/,
    );

    const maxes = recordMax(
      emptyMaxes(),
      bench.id,
      { kind: 'set', weight: 185, reps: 5 },
      'lb',
      '2026-09-10T12:00:00.000Z',
    );
    const entered = recommendNextTarget({
      exercise: bench,
      role: 'primary-strength',
      prescription: strengthRx,
      history: [],
      profile: heavier,
      maxes,
    });
    // 185 x 5 -> 215.8 max; 215.8 / 1.2667 = 170.4; 90% = 153.3 -> 155.
    expect(entered).toMatchObject({ mode: 'start', weight: 155, viaFamily: false });
    expect(entered.evidence.join(' ')).toMatch(/Your max for Barbell Bench Press: 215.8 lb/);
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

describe('progression by experience', () => {
  const advanced = { ...profile, experience: 'advanced' as const };
  const advancedRx = prescribe(bench, 'primary-strength', advanced);
  const clean = (daysAgo: number, rir = 2) =>
    record(daysAgo, bench.id, [
      [5, 185, rir],
      [5, 185, rir],
      [5, 185, rir],
    ]);

  it('makes an advanced lifter bank two clean strength sessions before load moves', () => {
    const base = {
      exercise: bench,
      role: 'primary-strength' as const,
      prescription: advancedRx,
      profile: advanced,
    };
    const one = recommendNextTarget({ ...base, history: [clean(3)] });
    expect(one.mode).toBe('maintain');
    expect(one.weight).toBe(185);
    expect(one.evidence.join(' ')).toMatch(/Advanced policy: load moves after 2 clean sessions/);

    const two = recommendNextTarget({ ...base, history: [clean(3), clean(7)] });
    expect(two.mode).toBe('weight');
    expect(two.weight).toBe(190);
    expect(two.evidence.join(' ')).toMatch(/2 clean sessions in a row/);

    // Under the prescribed reserve does not count as clean for an advanced lifter.
    const tight = recommendNextTarget({ ...base, history: [clean(3, 1.5), clean(7)] });
    expect(tight.mode).toBe('maintain');
    expect(tight.evidence.join(' ')).toMatch(/under the prescribed reserve/);
  });

  it('keeps intermediate progression as before and asks advanced lifters for two top sessions', () => {
    const top = isoRx.reps[1];
    const session = (daysAgo: number) =>
      record(
        daysAgo,
        fly.id,
        [
          [top, 40, 1],
          [top, 40, 1],
        ],
        isoRx.reps,
        1,
      );
    const intermediate = recommendNextTarget({
      exercise: fly,
      role: 'isolation',
      prescription: isoRx,
      history: [session(3)],
      profile,
    });
    expect(intermediate.mode).toBe('weight');

    const advancedIso = prescribe(fly, 'isolation', advanced);
    const base = {
      exercise: fly,
      role: 'isolation' as const,
      prescription: advancedIso,
      profile: advanced,
    };
    const once = recommendNextTarget({ ...base, history: [session(3)] });
    expect(once.mode).toBe('reps');
    expect(once.evidence.join(' ')).toMatch(
      /Advanced policy: load moves after 2 sessions at the top/,
    );
    const twice = recommendNextTarget({ ...base, history: [session(3), session(7)] });
    expect(twice.mode).toBe('weight');
  });
});

describe('targets from the estimated max', () => {
  const clean = (daysAgo: number) =>
    record(daysAgo, bench.id, [
      [5, 185, 2],
      [5, 185, 2],
    ]);

  it('comes back from a break at a percentage of the estimated max, deeper after a long one', () => {
    const base = {
      exercise: bench,
      role: 'primary-strength' as const,
      prescription: strengthRx,
      profile,
    };
    const now = '2026-09-10T12:00:00.000Z';
    const recent = recommendNextTarget({ ...base, history: [clean(10)], now });
    expect(recent.mode).toBe('weight');

    const back = recommendNextTarget({ ...base, history: [clean(25)], now });
    expect(back.mode).toBe('return');
    // e1rm 215.8; 6 reps at RIR 2 = 8 effective reps; 90% of 215.8 / (1 + 8/30) = 153 -> 155.
    expect(back.weight).toBe(155);
    expect(back.evidence.join(' ')).toMatch(
      /25 days since the last session: back at 90% of the estimated max \(215\.8 lb\)/,
    );

    const long = recommendNextTarget({ ...base, history: [clean(50)], now });
    expect(long.mode).toBe('return');
    expect(long.weight).toBe(145);
    expect(long.evidence.join(' ')).toMatch(/back at 85%/);

    // Without a clock the rule stays off, so older callers behave as before.
    expect(recommendNextTarget({ ...base, history: [clean(50)] }).mode).toBe('weight');
  });

  it('starts a new variation from a discounted family estimate, converted between load types', () => {
    const closeGrip = requireExercise('close-grip-bench-press');
    const sameBar = recommendNextTarget({
      exercise: bench,
      role: 'primary-strength',
      prescription: strengthRx,
      history: [record(3, closeGrip.id, [[5, 100, 2]])],
      profile,
    });
    expect(sameBar.mode).toBe('estimate');
    expect(sameBar.viaFamily).toBe(true);
    // e1rm 116.7 on the close grip (reference 0.85) -> 137.3 on the flat bench; 90% of 137.3 / 1.2667 = 97.6 -> 100.
    expect(sameBar.weight).toBe(100);
    expect(sameBar.evidence.join(' ')).toContain(
      `New variation: 90% of the family estimate (137.3 lb max, converted from ${closeGrip.name})`,
    );

    const dumbbell = requireExercise('dumbbell-bench-press');
    const perHand = recommendNextTarget({
      exercise: bench,
      role: 'primary-strength',
      prescription: strengthRx,
      history: [record(3, dumbbell.id, [[8, 60, 2]])],
      profile,
    });
    // 60 lb per hand x 8 -> 76 max per hand; x 1 / 0.4 -> 190 on the bar; 90% of 190 / 1.2667 = 135.
    expect(perHand.weight).toBe(135);
    expect(perHand.evidence.join(' ')).toContain(`converted from ${dumbbell.name}`);
  });

  describe('learning from overrides in the next target', () => {
    it('steps the target up when the lifter kept lifting above the suggestion', () => {
      const above = [2, 5, 8, 11].map((daysAgo) => {
        const base = record(daysAgo, bench.id, [
          [5, 190, 2],
          [5, 190, 2],
        ]);
        return {
          ...base,
          entries: base.entries.map((entry) => ({
            ...entry,
            sets: entry.sets.map((set) => ({ ...set, targetWeight: 185 })),
          })),
        };
      });
      const target = recommendNextTarget({
        exercise: bench,
        role: 'primary-strength',
        prescription: strengthRx,
        history: above,
        profile,
      });
      // Clean sessions at 190 earn +5, and the habit of lifting above the target adds another step.
      expect(target.mode).toBe('weight');
      expect(target.weight).toBe(200);
      expect(target.evidence.join(' ')).toMatch(
        /lifted above the suggested load in 4 of the last 4 sessions/,
      );
    });
  });
});
