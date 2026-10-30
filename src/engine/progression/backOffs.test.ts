import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile, type ProgramStyle } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import type { SetPrescription } from '../workout/types';
import {
  BACK_OFF,
  backOffDropFor,
  backOffLoad,
  backOffsSuit,
  carriesDayRir,
  effortRir,
  targetTakesBackOffs,
  topSetRir,
  withBackOffs,
} from './backOffs';

/**
 * Maintenance 32, the owner's item 11: a main lift as a top set and back-offs. Synthetic data only.
 */

const bench = requireExercise('barbell-bench-press');
const profile = (programStyle: ProgramStyle) => ({
  ...createDefaultProfile(RECORD_NOW),
  bodyweight: 185,
  programStyle,
});

describe('where a lift takes top set plus back-offs', () => {
  it('a main lift under Hybrid, Strength focus and Lean-down', () => {
    for (const style of ['hybrid', 'strength-focus', 'lean-down'] as const) {
      expect(backOffsSuit(bench, 'primary-strength', profile(style)), style).toBe(true);
    }
  });

  it('not under Hypertrophy focus, Undulating, Light weights or Foundation', () => {
    for (const style of ['hypertrophy-focus', 'undulating', 'high-rep', 'foundation'] as const) {
      expect(backOffsSuit(bench, 'primary-strength', profile(style)), style).toBe(false);
    }
  });

  it('a main lift only: a secondary strength lift stays on straight sets', () => {
    expect(backOffsSuit(bench, 'secondary-strength', profile('strength-focus'))).toBe(false);
    expect(backOffsSuit(bench, 'primary-hypertrophy', profile('hybrid'))).toBe(false);
  });

  it('not a lift with no weight to take off, nor a hold', () => {
    expect(backOffsSuit(requireExercise('push-up'), 'primary-strength', profile('hybrid'))).toBe(
      false,
    );
    // A carry holds a load for seconds: no reps to keep the same.
    const hold = requireExercise('farmer-carry');
    expect(backOffsSuit(hold, 'primary-strength', profile('hybrid'))).toBe(false);
  });

  it('straight sets where the load is a guess or eased, or the place cannot make it as asked', () => {
    for (const mode of ['start', 'estimate', 'return', 'deload', 'regress'] as const) {
      expect(targetTakesBackOffs({ weight: 190, mode }), mode).toBe(false);
    }
    expect(targetTakesBackOffs({ weight: 190, mode: 'weight' })).toBe(true);
    expect(targetTakesBackOffs({ weight: 190, mode: 'maintain' })).toBe(true);
    expect(targetTakesBackOffs({ weight: null, mode: 'weight' })).toBe(false);
    expect(targetTakesBackOffs({ weight: 190, mode: 'weight', asked: { weight: 200 } })).toBe(
      false,
    );
  });
});

describe('the top set and its back-offs', () => {
  const working = (weight: number, rir = 1, count = 4): SetPrescription[] => [
    {
      index: 0,
      kind: 'warmup',
      targetReps: [4, 6],
      targetRir: 5,
      targetWeight: 95,
      restSeconds: 45,
    },
    ...Array.from({ length: count }, (_, at) => ({
      index: at + 1,
      kind: 'working' as const,
      targetReps: [4, 6] as [number, number],
      targetRir: rir,
      targetWeight: weight,
      restSeconds: 150,
    })),
  ];
  const options = { step: 5, floor: 45, loading: null };

  it('the top set at 1 in reserve, the back-offs 5% lighter at the same reps and 2', () => {
    const sets = withBackOffs(working(190), BACK_OFF.DROP, options);
    expect(sets.map((set) => [set.kind, set.targetWeight, set.targetRir, set.tier])).toEqual([
      ['warmup', 95, 5, undefined],
      ['working', 190, 1, 'top'],
      ['working', 180, 2, 'back-off'],
      ['working', 180, 2, 'back-off'],
      ['working', 180, 2, 'back-off'],
    ]);
    expect(sets.every((set) => set.kind !== 'working' || set.targetReps[1] === 6)).toBe(true);
  });

  it('the drop off the top set, onto a weight the place has, never under the bar', () => {
    expect(backOffLoad(50, 0.05, options)).toBe(45);
    expect(backOffLoad(45, 0.05, options)).toBe(45);
    expect(backOffLoad(100, 0.05, { step: 10, floor: null, loading: null })).toBe(90);
    // A drop narrowed to nothing keeps the top set's load.
    expect(backOffLoad(190, 0, options)).toBe(190);
  });

  it('the day made easier moves every set: the top set at 2, the back-offs at 3', () => {
    const sets = withBackOffs(working(190, 2), BACK_OFF.DROP, options);
    expect(sets.filter((set) => set.kind === 'working').map((set) => set.targetRir)).toEqual([
      2, 3, 3, 3,
    ]);
    expect(topSetRir(3)).toBe(2);
    expect(topSetRir(2)).toBe(1);
    // Made harder, the back-offs go to 1, the top set stays at 1, never failure.
    expect(topSetRir(1)).toBe(1);
  });

  it('a load set by hand stays as set', () => {
    const sets = withBackOffs(working(190), BACK_OFF.DROP, {
      ...options,
      manual: { weight: true },
    });
    expect(sets.filter((set) => set.kind === 'working').map((set) => set.targetWeight)).toEqual([
      190, 190, 190, 190,
    ]);
    expect(sets.filter((set) => set.tier === 'back-off')).toHaveLength(3);
  });

  it('one working set is its top set', () => {
    // A lift cut to one working set keeps the top set's reserve, not a straight set's (the first
    // review of round N).
    expect(withBackOffs(working(190, 1, 1), BACK_OFF.DROP, options)).toEqual(
      working(190, 1, 1).map((set) => (set.kind === 'working' ? { ...set, tier: 'top' } : set)),
    );
  });

  it('the day’s effort reads on a back-off, which carries it as a straight set does', () => {
    const sets = withBackOffs(working(190), BACK_OFF.DROP, options);
    expect(effortRir(sets.filter((set) => set.kind === 'working'))).toBe(2);
    expect(effortRir(working(190, 2).filter((set) => set.kind === 'working'))).toBe(2);
    // A back-off, under "Make it harder" one rep from failure as its top set is.
    expect(
      effortRir([
        { tier: 'top', targetRir: 1 },
        { tier: 'back-off', targetRir: 1 },
      ]),
    ).toBe(1);
  });

  it('a top set alone carries the day’s reserve as its own, a plain day and a harder one alike', () => {
    const alone = [{ tier: 'top' as const, targetRir: 1 }];
    expect(carriesDayRir(alone, 2)).toBe(true);
    expect(carriesDayRir(alone, 1)).toBe(true);
    expect(carriesDayRir(alone, 3)).toBe(false);
    expect(carriesDayRir([{ tier: 'top', targetRir: 2 }], 3)).toBe(true);
  });
});

describe('the drop in force', () => {
  /** A session on the structure: a top set, then back-offs logged at a reserve, `daysAgo`. */
  const session = (
    daysAgo: number,
    drop: number,
    backOffs: SetSpec[],
    top: SetSpec = [5, 190, 1],
  ): WorkoutRecord => {
    const done = record(daysAgo, 'barbell-bench-press', [top, ...backOffs], [4, 6], 2);
    const entry = done.entries[0]!;
    entry.backOffDrop = drop;
    entry.sets.forEach((set, at) => {
      set.tier = at === 0 ? 'top' : 'back-off';
      set.targetRir = at === 0 ? 1 : 2;
    });
    return done;
  };
  const backOffs = (rir: number, reps = 5): SetSpec[] => [
    [reps, 180, rir],
    [reps, 180, rir],
    [reps, 180, rir],
  ];

  it('5% before any session on it, and the last session’s after', () => {
    expect(backOffDropFor('barbell-bench-press', [])).toBe(BACK_OFF.DROP);
    expect(backOffDropFor('barbell-bench-press', [session(3, 0.07, backOffs(2))])).toBe(0.07);
  });

  it('two sessions at the drop, the back-offs a rep or more harder than asked, widen it', () => {
    // A mean miss of 1.25 reps of reserve: 4% a rep, 5% wider.
    const history = [session(7, 0.05, backOffs(0.5)), session(3, 0.05, backOffs(1))];
    expect(backOffDropFor('barbell-bench-press', history)).toBe(0.1);
  });

  it('... easier narrows it, never under nothing', () => {
    const history = [session(7, 0.05, backOffs(3.5)), session(3, 0.05, backOffs(3.5))];
    expect(backOffDropFor('barbell-bench-press', history)).toBe(0);
  });

  it('reps under the floor count as reserve under none', () => {
    // Three reps at 1 in reserve, the floor four: a miss of two.
    const history = [session(7, 0.05, backOffs(1, 3)), session(3, 0.05, backOffs(1, 3))];
    expect(backOffDropFor('barbell-bench-press', history)).toBe(0.13);
  });

  it('one session, a miss under a rep, misses both ways, or another drop: it stays', () => {
    expect(backOffDropFor('barbell-bench-press', [session(3, 0.05, backOffs(0))])).toBe(0.05);
    expect(
      backOffDropFor('barbell-bench-press', [
        session(7, 0.05, backOffs(1.5)),
        session(3, 0.05, backOffs(1.5)),
      ]),
    ).toBe(0.05);
    // A rep harder, then three easier: a mean of one easier, but not the same way.
    expect(
      backOffDropFor('barbell-bench-press', [
        session(7, 0.05, backOffs(1)),
        session(3, 0.05, backOffs(5)),
      ]),
    ).toBe(0.05);
    expect(
      backOffDropFor('barbell-bench-press', [
        session(7, 0.09, backOffs(0)),
        session(3, 0.05, backOffs(0)),
      ]),
    ).toBe(0.05);
  });

  it('never wider than 20%', () => {
    const history = [session(7, 0.18, backOffs(0, 2)), session(3, 0.18, backOffs(0, 2))];
    expect(backOffDropFor('barbell-bench-press', history)).toBe(0.2);
  });

  it('passes over a session whose drop could not be read', () => {
    const unread = session(1, 0.05, backOffs(4));
    delete unread.entries[0]!.backOffDrop;
    const history = [session(7, 0.05, backOffs(0)), session(5, 0.05, backOffs(0)), unread];
    expect(backOffDropFor('barbell-bench-press', history)).toBe(0.13);
  });

  it('reads the lift’s own sessions on the structure only', () => {
    const straight = record(1, 'barbell-bench-press', backOffs(0), [4, 6], 2);
    const history = [session(7, 0.05, backOffs(0)), session(5, 0.05, backOffs(0)), straight];
    expect(backOffDropFor('barbell-bench-press', history)).toBe(0.13);
    expect(backOffDropFor('incline-dumbbell-press', history)).toBe(BACK_OFF.DROP);
  });
});
