import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, type SetSpec } from '../../test/records';
import { entryOf, plan, shape } from '../../test/backOffs';

/**
 * The fifth review of round N. A lift main one day and secondary another (the row on the pull and
 * the upper day). The last pull day's top set was skipped, its back-offs done: a skip is no top set
 * lifted, so the progression reads the pull day before it, a top set lifted as asked. On the upper
 * day the row runs straight, and `mainLiftTarget` asks `ranOnTopSet` of the lift's last session
 * only: the skipped top set says no, so `straightAfterTop` never runs and the top set of the session
 * read is read as straight sets: its load on every set at a straight set's reserve, and "Hit the
 * reps with little in reserve: hold the load". The third review fixed this for a day the lift is
 * main (a catch-up), reading the session its target is read from; the spec: a straight day after a
 * session on the structure, a day the lift is secondary included, takes the back-offs' load.
 * Synthetic data only.
 */

const ROW = 'barbell-row';

function pullDay(
  daysAgo: number,
  top: SetSpec,
  backOffs: SetSpec[],
  topSkipped = false,
): WorkoutRecord {
  const done = record(daysAgo, ROW, [top, ...backOffs], [4, 6], 2, { templateId: 'pull-arms' });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  if (topSkipped) {
    const first = entry.sets[0]!;
    first.completed = false;
    first.reps = 0;
    first.weight = null;
    first.rir = null;
  }
  return done;
}

const backOffsAt = (weight: number): SetSpec[] => [
  [5, weight, 2],
  [5, weight, 2],
  [5, weight, 2],
];

describe('the upper day’s row after a pull day whose top set was skipped', () => {
  it('the control: after a pull day with its top set done, the back-offs’ load', () => {
    const history = [
      pullDay(10, [5, 185, 1], backOffsAt(175)),
      pullDay(6, [5, 190, 1], backOffsAt(180)),
    ];
    const row = entryOf(plan(history, undefined, { templateId: 'upper' }), ROW);
    expect(row.role).toBe('secondary-strength');
    expect(Math.max(...shape(row).map((set) => set[0] as number))).toBeLessThanOrEqual(185);
  });

  it('the top set skipped last time: still the back-offs’ load, never the top set’s at 2 in reserve', () => {
    const history = [
      pullDay(10, [5, 190, 1], backOffsAt(180)),
      pullDay(6, [0, null, null], backOffsAt(180), true),
    ];
    // The pull day reads the top set of 10 days ago: 195 on its next top set.
    expect(shape(entryOf(plan(history, undefined, { templateId: 'pull-arms' }), ROW))[0]).toEqual([
      195,
      1,
      'top',
    ]);
    const row = entryOf(plan(history, undefined, { templateId: 'upper' }), ROW);
    expect(row.role).toBe('secondary-strength');
    const sets = shape(row);
    expect(sets.every((set) => set[2] === 'straight' && set[1] === 2)).toBe(true);
    const words = (row.progression?.evidence ?? []).join(' / ');
    // On 7f23a26: every set at the top set's 190, "little in reserve: hold the load".
    expect(Math.max(...sets.map((set) => set[0] as number)), words).toBeLessThanOrEqual(185);
    expect(words).not.toContain('little in reserve');
  });
});
