import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile, type ProgramStyle } from '../../core/validation/profile';
import { RECORD_NOW, record } from '../../test/records';
import {
  lightRange,
  loggedSessionsOf,
  prescribe,
  prescribeFor,
  styleContextFor,
  undulates,
  zoneForCount,
  zoneReps,
  zonesFor,
} from './roles';

const bench = requireExercise('barbell-bench-press');
const incline = requireExercise('incline-dumbbell-press');
const fly = requireExercise('cable-fly');
const base = createDefaultProfile(RECORD_NOW);
const under = (programStyle: ProgramStyle) => ({ ...base, programStyle });

describe('prescriptions by style', () => {
  it('leaves the three original styles exactly as they were', () => {
    expect(prescribe(bench, 'primary-strength', under('hybrid'))).toEqual({
      sets: 4,
      reps: bench.repRanges.strength,
      rir: 2,
      restSeconds: 150,
    });
    expect(prescribe(bench, 'primary-strength', under('hypertrophy-focus')).sets).toBe(3);
    expect(prescribe(incline, 'primary-hypertrophy', under('hypertrophy-focus')).sets).toBe(4);
    expect(prescribe(bench, 'primary-hypertrophy', under('strength-focus')).reps).toEqual(
      bench.repRanges.strength,
    );
    expect(prescribe(fly, 'isolation', under('hybrid'))).toEqual({
      sets: 3,
      reps: fly.repRanges.hypertrophy,
      rir: 1,
      restSeconds: 60,
    });
  });

  it('Light weights puts every lift at the light end, close to failure', () => {
    const profile = under('high-rep');
    const main = prescribe(bench, 'primary-strength', profile);
    expect(main.reps).toEqual(lightRange(bench));
    expect(main.reps[0]).toBeGreaterThanOrEqual(bench.repRanges.hypertrophy[1]);
    expect(main.rir).toBe(1);
    expect(prescribe(fly, 'isolation', profile).reps).toEqual(lightRange(fly));
    expect(prescribe(incline, 'primary-hypertrophy', profile).sets).toBe(4);
  });

  it('the light end never passes 25 reps and always has room to work in', () => {
    for (const exercise of [bench, incline, fly, requireExercise('push-up')]) {
      const [low, high] = lightRange(exercise);
      expect(high).toBeLessThanOrEqual(25);
      expect(high - low).toBe(5);
    }
  });

  it('Foundation keeps a new lifter off the heavy range, on fewer sets, well short of failure', () => {
    const profile = under('foundation');
    const main = prescribe(bench, 'primary-strength', profile);
    expect(main).toEqual({ sets: 3, reps: bench.repRanges.hypertrophy, rir: 3, restSeconds: 120 });
    expect(prescribe(fly, 'isolation', profile)).toMatchObject({ sets: 2, rir: 2 });
    expect(prescribe(fly, 'finisher', profile).rir).toBe(2);
  });

  it('Lean-down keeps the heavy lift and the sets, and takes nothing to failure', () => {
    const hybrid = under('hybrid');
    const lean = under('lean-down');
    for (const role of ['primary-strength', 'secondary-strength', 'isolation'] as const) {
      expect(prescribe(bench, role, lean)).toEqual(prescribe(bench, role, hybrid));
    }
    expect(prescribe(fly, 'finisher', hybrid).rir).toBe(0);
    expect(prescribe(fly, 'finisher', lean).rir).toBe(1);
  });

  it('Auto prescribes what the goals come to', () => {
    const auto = { ...under('auto'), goals: { primary: 'strength', secondary: 'none' } as const };
    expect(prescribe(bench, 'primary-hypertrophy', auto)).toEqual(
      prescribe(bench, 'primary-hypertrophy', under('strength-focus')),
    );
    const losing = { ...auto, goals: { ...auto.goals, bodyweight: 'lose' as const } };
    expect(prescribe(fly, 'finisher', losing).rir).toBe(1);
  });
});

describe('undulating zones', () => {
  it('rotates a lift with a strength range through three zones, and one without through two', () => {
    expect(zonesFor(bench)).toEqual(['heavy', 'moderate', 'light']);
    expect(zonesFor(fly)).toEqual(['moderate', 'light']);
    expect([0, 1, 2, 3, 4].map((count) => zoneForCount(bench, count))).toEqual([
      'heavy',
      'moderate',
      'light',
      'heavy',
      'moderate',
    ]);
    expect([0, 1, 2].map((count) => zoneForCount(fly, count))).toEqual([
      'moderate',
      'light',
      'moderate',
    ]);
  });

  it('gives each zone its own reps, reserve, and rest, on the lifts that carry the session', () => {
    const profile = under('undulating');
    const heavy = prescribe(bench, 'primary-strength', profile, {
      style: 'undulating',
      zone: 'heavy',
    });
    const moderate = prescribe(bench, 'primary-strength', profile, {
      style: 'undulating',
      zone: 'moderate',
    });
    const light = prescribe(bench, 'primary-strength', profile, {
      style: 'undulating',
      zone: 'light',
    });
    expect(heavy.reps).toEqual(zoneReps(bench, 'heavy'));
    expect(moderate.reps).toEqual(bench.repRanges.hypertrophy);
    expect(light.reps).toEqual(lightRange(bench));
    expect([heavy.rir, moderate.rir, light.rir]).toEqual([2, 2, 1]);
    expect(heavy.restSeconds).toBeGreaterThan(moderate.restSeconds);
    expect(moderate.restSeconds).toBeGreaterThan(light.restSeconds);
    expect(heavy.sets).toBe(moderate.sets);
  });

  it('leaves accessories alone', () => {
    expect(undulates('isolation')).toBe(false);
    expect(prescribe(fly, 'isolation', under('undulating'))).toEqual(
      prescribe(fly, 'isolation', under('hybrid')),
    );
  });

  it('moves a lift one zone on with each logged session of it', () => {
    const profile = under('undulating');
    const session = (daysAgo: number) =>
      record(daysAgo, bench.id, [
        [5, 185, 2],
        [5, 185, 2],
      ]);
    expect(loggedSessionsOf(bench.id, [])).toBe(0);
    expect(styleContextFor(bench, 'primary-strength', profile, []).zone).toBe('heavy');
    expect(styleContextFor(bench, 'primary-strength', profile, [session(3)]).zone).toBe('moderate');
    expect(prescribeFor(bench, 'primary-strength', profile, [session(3), session(6)]).reps).toEqual(
      lightRange(bench),
    );
    // Another lift's sessions do not move this one.
    expect(
      styleContextFor(bench, 'primary-strength', profile, [
        record(2, incline.id, [[8, 60, 1]], [6, 10], 1),
      ]).zone,
    ).toBe('heavy');
    // Outside undulating there is no zone at all.
    expect(styleContextFor(bench, 'primary-strength', under('hybrid'), [session(3)])).toEqual({
      style: 'hybrid',
    });
  });
});
