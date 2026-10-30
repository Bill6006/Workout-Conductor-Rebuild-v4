import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, type SetSpec } from '../../test/records';
import { backOffLoad } from '../progression/backOffs';
import { bench, plan, shape } from '../../test/backOffs';

/**
 * The fifth review of round N. The research the round rests on (docs/research/top-set-back-offs.md,
 * "The sets"): the back-offs' load is "the top set's logged load × 0.95, rounded to the equipment
 * step", and "the drop also sits inside Helms's tested 2–6% range". `backOffLoad` snaps 0.95 × the
 * top set down (`fitWeight`, "never above the one asked for"), so on the gym's 5 lb steps most
 * barbell top sets from 205 to 245 lb take back-offs 6-7% lighter (205 → 190, 7.3%): outside the
 * tested range, where rounding to the step gives 195 (4.9%). Synthetic data only.
 */

function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, 'barbell-bench-press', [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

describe('the back-offs’ load off a 205 lb top set, 5 lb steps', () => {
  it('is the top set × 0.95 rounded to the step, inside the tested 2-6%', () => {
    const history = [
      structured(
        3,
        [5, 200, 1],
        [
          [5, 190, 2],
          [5, 190, 2],
          [5, 190, 2],
        ],
      ),
    ];
    const sets = shape(bench(plan(history)));
    expect(sets[0]).toEqual([205, 1, 'top']);
    const backOff = sets[1]![0] as number;
    const drop = (205 - backOff) / 205;
    // On 7f23a26: 190, a 7.3% drop.
    expect(drop, `back-offs at ${backOff}`).toBeLessThanOrEqual(0.06);
    expect(backOff).toBe(195);
  });
});

describe('the back-offs’ load at its edges', () => {
  const steps = { step: 5, floor: null, loading: null };

  it('while a drop is in force, never the top set’s own load, where the place has one under it', () => {
    // 5% under 30 lb is 28.5: 30 is nearer, but that is the top set's own load.
    expect(backOffLoad(30, 0.05, steps)).toBe(25);
    // Never under the bar: 5% under the empty bar stays at the bar.
    expect(backOffLoad(45, 0.05, { ...steps, floor: 45 })).toBe(45);
  });

  it('never over the top set as lifted', () => {
    // A top set logged at a weight off the grid, the drop narrowed to nothing: 100, never 105.
    expect(backOffLoad(103.5, 0, steps)).toBe(100);
    // On the grid at a drop of nothing: the top set's own load.
    expect(backOffLoad(100, 0, steps)).toBe(100);
  });

  it('a half step rounds up: 5% under 150 is 142.5, 145 (3.3%, inside the tested range)', () => {
    expect(backOffLoad(150, 0.05, steps)).toBe(145);
  });
});
