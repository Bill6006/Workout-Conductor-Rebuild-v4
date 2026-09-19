import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW, record } from '../../test/records';
import {
  ZONE_FRACTION,
  capTarget,
  estimateOneRepMax,
  loadFromEstimate,
  recommendNextTarget,
} from './progression';
import type { Prescription } from './roles';

const bench = requireExercise('barbell-bench-press');
const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };

const HEAVY: Prescription = { sets: 4, reps: [4, 6], rir: 2, restSeconds: 150 };
const MODERATE: Prescription = { sets: 4, reps: [6, 10], rir: 2, restSeconds: 135 };
const LIGHT: Prescription = { sets: 4, reps: [10, 15], rir: 1, restSeconds: 120 };

function target(prescription: Prescription, history: ReturnType<typeof record>[]) {
  return recommendNextTarget({
    exercise: bench,
    role: 'primary-strength',
    prescription,
    history,
    profile,
    now: RECORD_NOW,
  });
}

/** A clean heavy day: 185 for fives with two in reserve. */
const heavyDay = (daysAgo: number, weight = 185) =>
  record(
    daysAgo,
    bench.id,
    [
      [5, weight, 2],
      [5, weight, 2],
      [5, weight, 2],
    ],
    [4, 6],
    2,
  );

const lightDay = (daysAgo: number, weight = 135) =>
  record(
    daysAgo,
    bench.id,
    [
      [12, weight, 1],
      [12, weight, 1],
      [11, weight, 1],
    ],
    [10, 15],
    1,
  );

describe('a weight belongs to the rep range it was lifted at', () => {
  it('carries nothing across when today is a range the lift has never been run at', () => {
    const next = target(LIGHT, [heavyDay(3)]);
    const e1rm = estimateOneRepMax(185, 5);
    expect(next.mode).toBe('estimate');
    expect(next.weight).toBe(loadFromEstimate(e1rm, 15, 1, ZONE_FRACTION, 5));
    // Far lighter than the fives were, because fifteen reps are asked of it.
    expect(next.weight).toBeLessThan(185 * 0.8);
    expect(next.reps).toEqual([10, 15]);
    expect(next.evidence.at(-1)).toContain('Last run at 4-6 reps; today is 10-15');
  });

  it('goes up, not down, when the range moves from light to heavy', () => {
    const next = target(HEAVY, [lightDay(3)]);
    expect(next.mode).toBe('estimate');
    expect(next.weight).toBeGreaterThan(135);
  });

  it('progresses each range from its own last session once it has one', () => {
    // Heavy nine days ago, light three days ago, heavy again today: the fives are the reference.
    const next = target(HEAVY, [lightDay(3), heavyDay(9)]);
    expect(next.mode).toBe('weight');
    expect(next.weight).toBe(190);
    expect(next.evidence[0]).toContain('185 lb');
    expect(next.reference?.recordId).toBe(heavyDay(9).id);
    // And the light day answers to the light day: a clean one, so it earns its own step.
    const light = target(LIGHT, [heavyDay(3), lightDay(9)]);
    expect(light.evidence[0]).toContain('135 lb');
    expect(light.weight).toBe(140);
    expect(light.reference?.recordId).toBe(lightDay(9).id);
  });

  it('counts a miss only against its own range', () => {
    const missedHeavy = record(
      3,
      bench.id,
      [
        [3, 205, 0],
        [3, 205, 0],
      ],
      [4, 6],
      2,
    );
    // The missed fives do not hold back a light day that went well.
    const light = target(LIGHT, [missedHeavy, lightDay(6)]);
    expect(light.mode).not.toBe('maintain');
    expect(light.evidence.join(' ')).not.toContain('Missed the floor');
  });

  it('treats ranges two reps apart as the same one, so a cap that pushes the reps changes nothing', () => {
    const capped = record(
      3,
      bench.id,
      [
        [8, 185, 2],
        [8, 185, 2],
      ],
      [6, 8],
      2,
    );
    const next = target(HEAVY, [capped]);
    expect(next.mode).not.toBe('estimate');
    expect(next.evidence[0]).toContain('185 lb');
    // And the cap rule still works on top of it.
    const held = capTarget(
      { ...next, weight: 300 },
      { available: null, step: 5, cap: 225, perSide: null } as never,
      'lb',
    );
    expect(held.weight).toBe(225);
  });

  it('lets a stale session of today’s range go when newer ones in other ranges say more', () => {
    // The last fives were ten weeks ago; the lift has been trained light since.
    const next = target(HEAVY, [lightDay(3, 155), heavyDay(70, 165)]);
    expect(next.mode).toBe('estimate');
    expect(next.evidence.at(-1)).toContain('Last run at 10-15 reps');
  });

  it('measures a break from the last session of any range, not the last one at today’s range', () => {
    // Heavy 25 days ago, light 4 days ago: no three-week break happened.
    const next = target(HEAVY, [lightDay(4), heavyDay(25)]);
    expect(next.mode).not.toBe('return');
    expect(next.weight).toBe(190);
  });

  it('changes nothing for a lift that stays at one range', () => {
    const steady = target(HEAVY, [heavyDay(3), heavyDay(7)]);
    expect(steady.mode).toBe('weight');
    expect(steady.weight).toBe(190);
    expect(steady.sessions).toBe(2);
    const moderate = target(MODERATE, [
      record(3, bench.id, [[8, 165, 2]], [6, 10], 2),
      record(7, bench.id, [[7, 165, 2]], [6, 10], 2),
    ]);
    expect(moderate.mode).toBe('weight');
    expect(moderate.weight).toBe(170);
    expect(moderate.sessions).toBe(2);
  });
});
