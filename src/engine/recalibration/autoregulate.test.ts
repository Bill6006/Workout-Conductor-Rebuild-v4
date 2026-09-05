import { describe, expect, it } from 'vitest';
import { autoregulate, outcomeFor, type LoggedSetOutcome } from './autoregulate';

const target: [number, number] = [4, 6];

function set(reps: number, rir: number | null, weight: number | null = 185): LoggedSetOutcome {
  return outcomeFor({ targetReps: target, targetRir: 2 }, { reps, rir, weight });
}

describe('in-session autoregulation', () => {
  it('raises the next sets a step when the set was clearly easy', () => {
    const plan = autoregulate({
      set: set(6, 4),
      earlier: [],
      step: 5,
      remaining: 3,
      setNumber: 1,
      units: 'lb',
    });
    expect(plan).toMatchObject({ kind: 'weight', delta: 5 });
    expect(plan.reason).toBe(
      'Set 1: 6 reps with 4 in reserve against a target of 2: the next 3 sets go up 5 lb.',
    );
  });

  it('raises the next sets after two sets past the top, or one far past it', () => {
    const two = autoregulate({
      set: set(6, 2),
      earlier: [set(6, 2)],
      step: 5,
      remaining: 2,
      setNumber: 2,
      units: 'lb',
    });
    expect(two).toMatchObject({ kind: 'weight', delta: 5 });
    expect(two.reason).toMatch(/^Sets 1 and 2 both cleared the top of the range/);
    const far = autoregulate({
      set: set(9, null),
      earlier: [],
      step: 5,
      remaining: 1,
      setNumber: 1,
      units: 'lb',
    });
    expect(far).toMatchObject({ kind: 'weight', delta: 5 });
    expect(far.reason).toMatch(/well past the 4-6 target: the next set goes up 5 lb\./);
  });

  it('lowers the next sets a step after a grind under the floor, or far under it', () => {
    const grind = autoregulate({
      set: set(3, 0),
      earlier: [],
      step: 5,
      remaining: 2,
      setNumber: 1,
      units: 'lb',
    });
    expect(grind).toMatchObject({ kind: 'weight', delta: -5 });
    expect(grind.reason).toMatch(
      /nothing in reserve, under the 4 floor: the next 2 sets come down 5 lb/,
    );
    const far = autoregulate({
      set: set(1, 2),
      earlier: [],
      step: 5,
      remaining: 1,
      setNumber: 2,
      units: 'lb',
    });
    expect(far).toMatchObject({ kind: 'weight', delta: -5 });
  });

  it('shifts rep targets instead when there is no load, and does nothing on target', () => {
    const bodyweight = autoregulate({
      set: set(9, 3, null),
      earlier: [],
      step: 5,
      remaining: 2,
      setNumber: 1,
      units: 'lb',
    });
    expect(bodyweight).toMatchObject({ kind: 'reps', shift: 2 });
    const low = autoregulate({
      set: set(1, 0, null),
      earlier: [],
      step: 5,
      remaining: 2,
      setNumber: 1,
      units: 'lb',
    });
    expect(low).toMatchObject({ kind: 'reps', shift: -2 });
    const fine = autoregulate({
      set: set(5, 2),
      earlier: [],
      step: 5,
      remaining: 2,
      setNumber: 1,
      units: 'lb',
    });
    expect(fine.kind).toBe('none');
    expect(fine.reason).toBe('Set 1: 5 reps with 2 in reserve is on target; nothing changes.');
    // One easy-ish set at the top with the prescribed reserve is not enough on its own.
    const single = autoregulate({
      set: set(6, 2),
      earlier: [],
      step: 5,
      remaining: 2,
      setNumber: 1,
      units: 'lb',
    });
    expect(single.kind).toBe('none');
    // A missed floor with reps in reserve is one set, not a trend.
    const missed = autoregulate({
      set: set(3, 2),
      earlier: [],
      step: 5,
      remaining: 2,
      setNumber: 1,
      units: 'lb',
    });
    expect(missed.kind).toBe('none');
    expect(
      autoregulate({
        set: set(6, 4),
        earlier: [],
        step: 5,
        remaining: 0,
        setNumber: 3,
        units: 'lb',
      }).kind,
    ).toBe('none');
  });
});
