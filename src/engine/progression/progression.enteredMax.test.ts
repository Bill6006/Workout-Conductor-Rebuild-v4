import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW, record } from '../../test/records';
import { emptyMaxes, recordMax, type StrengthMaxes } from './maxes';
import { ENTERED_MAX_STEPS, recommendNextTarget } from './progression';
import { prescribe } from './roles';

const bench = requireExercise('barbell-bench-press');
const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };

/** Bench three days ago: 185 for fives with two in reserve, an estimated max near 216. */
const history = [
  record(3, 'barbell-bench-press', [
    [5, 185, 2],
    [5, 185, 2],
    [5, 185, 2],
  ]),
];

function daysAgo(days: number): string {
  return new Date(Date.parse(RECORD_NOW) - days * 86_400_000).toISOString();
}

function target(maxes: StrengthMaxes | null) {
  return recommendNextTarget({
    exercise: bench,
    role: 'primary-strength',
    prescription: prescribe(bench, 'primary-strength', profile),
    history,
    profile,
    now: RECORD_NOW,
    maxes,
  });
}

describe('a max entered on a lift that already has logged sets', () => {
  it('moves the target toward it when it is newer than the last session and says more', () => {
    const plain = target(null);
    if (plain.weight === null) throw new Error('expected a weight');
    const maxes = recordMax(emptyMaxes(), bench.id, { kind: 'max', e1rm: 275 }, 'lb', daysAgo(1));
    const lifted = target(maxes);
    expect(lifted.weight).toBe(plain.weight + ENTERED_MAX_STEPS * plain.increment);
    expect(lifted.evidence.at(-1)).toBe(
      'Your max of 275 lb, entered after your last session, says more than your logged sets: up 2 steps toward it. Your next logged session takes over.',
    );
  });

  it('never goes past what the max itself implies', () => {
    const plain = target(null);
    if (plain.weight === null) throw new Error('expected a weight');
    // A max some way above the log implies a target one step up, so one step is all it moves.
    const maxes = recordMax(emptyMaxes(), bench.id, { kind: 'max', e1rm: 262 }, 'lb', daysAgo(1));
    const lifted = target(maxes);
    expect(lifted.weight).toBe(plain.weight + plain.increment);
    expect(lifted.evidence.at(-1)).toMatch(/up a step toward it/);
    // And one that implies no more than the log already asks for changes nothing.
    const modest = recordMax(emptyMaxes(), bench.id, { kind: 'max', e1rm: 240 }, 'lb', daysAgo(1));
    expect(target(modest).weight).toBe(plain.weight);
  });

  it('leaves the log in charge when the max is older than the last session, or says no more', () => {
    const plain = target(null);
    const older = recordMax(emptyMaxes(), bench.id, { kind: 'max', e1rm: 275 }, 'lb', daysAgo(10));
    expect(target(older).weight).toBe(plain.weight);
    expect(target(older).evidence).toEqual(plain.evidence);
    const same = recordMax(emptyMaxes(), bench.id, { kind: 'max', e1rm: 216 }, 'lb', daysAgo(1));
    expect(target(same).weight).toBe(plain.weight);
  });

  it('counts a best set the same way as a typed max', () => {
    const plain = target(null);
    if (plain.weight === null) throw new Error('expected a weight');
    const maxes = recordMax(
      emptyMaxes(),
      bench.id,
      { kind: 'set', weight: 225, reps: 5 },
      'lb',
      daysAgo(1),
    );
    expect(target(maxes).weight ?? 0).toBeGreaterThan(plain.weight);
  });
});
