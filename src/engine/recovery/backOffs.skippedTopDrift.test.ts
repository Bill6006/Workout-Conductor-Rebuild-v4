import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { interpretFatigue } from './fatigue';
import { exerciseProgress } from '../scoring/analytics';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { BENCH } from '../../test/backOffs';

/**
 * The seventh review of round N. A session whose top set was skipped, its back-offs done as asked
 * (the third and sixth reviews' case): the progression passes over it (`completedWorking` reads the
 * top set alone, and there is none), but the fatigue's drift in estimated maxes and the Progress
 * trend read its back-offs, 5% lighter by design, as the lift's best: "Estimated maxes fell 5% over
 * the last two sessions" (a point toward high fatigue, which takes the main lift off the structure)
 * and a falling trend on Progress, after nothing but a skipped set. The fifth review kept the
 * straight days at the back-offs' load out of both for that reason. The spec: what reads a lift's
 * sessions over weeks (the fatigue's drift, the Progress trend among them) reads the top sets
 * alone. Synthetic data only.
 */

/**
 * The bench press on top set plus back-offs; `top` null: the top set skipped, saved as the app saves
 * a skip (0 reps, no weight, not completed).
 */
function structured(daysAgo: number, top: SetSpec | null, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top ?? [0, null, null], ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
    if (at === 0 && top === null) set.completed = false;
  });
  return done;
}

const backOffsAt = (weight: number): SetSpec[] => [
  [5, weight, 2],
  [5, weight, 2],
  [5, weight, 2],
];

const history = [
  structured(10, [5, 195, 1], backOffsAt(185)),
  structured(6, [5, 200, 1], backOffsAt(190)),
  // The top set skipped, the back-offs at 190 as asked.
  structured(3, null, backOffsAt(190)),
];

describe('a top set skipped, its back-offs done as asked', () => {
  it('is no fall in the fatigue’s estimated maxes', () => {
    const fatigue = interpretFatigue(history, RECORD_NOW);
    // On e6ed7ed: performanceDrift -5, "Estimated maxes fell 5% over the last two sessions."
    expect(fatigue.evidence.join(' ')).not.toContain('Estimated maxes fell');
    expect(fatigue.performanceDrift ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('is no fall in the Progress trend', () => {
    const row = exerciseProgress(history).find((candidate) => candidate.exerciseId === BENCH)!;
    // On e6ed7ed: trendPct -2.5, the back-offs' 190 x 5 read against the top set's 195 x 5.
    expect(row.trendPct ?? 0).toBeGreaterThanOrEqual(0);
  });
});
