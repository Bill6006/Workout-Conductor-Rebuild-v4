import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { record, type SetSpec } from '../../test/records';
import { plan, shape } from '../../test/backOffs';

/**
 * The seventh review of round N. A break that ends a run of misses, read past the straight days at
 * the back-offs' load. The row trained every eleven days or so: its top set missed its floor on a
 * pull day, the upper day eleven days later (the row secondary, straight at its back-offs' load,
 * saved as such a day) lifted as asked, and the next pull day eleven days after that missed it
 * again. The sixth review reads the progression's runs past such days, so the two misses are two in
 * a row; but the run's break (`breakBetween`, three weeks or more with no session of the lift) is
 * read on that history too, the upper day gone: 22 days between the two top sets read as a break,
 * the run ends at one, "Missed the floor last time; one session is not a trend, so repeat the load",
 * the top set at 165 a third time. The lift was never three weeks untrained. With the same sessions
 * a week closer together, the micro-deload comes. The spec: a break is measured from the lift's
 * sessions, whatever the read passes over (the sixth review); a top set that misses keeps the
 * maintain and deload rules. Synthetic data only.
 */

const ROW = 'barbell-row';

function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, ROW, [top, ...backOffs], [4, 6], 2, { templateId: 'pull-arms' });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

/** The upper day: the row secondary, straight at its back-offs' load, saved as such a day. */
function upperDay(daysAgo: number, weight: number): WorkoutRecord {
  const done = record(
    daysAgo,
    ROW,
    [
      [5, weight, 2],
      [5, weight, 2],
      [5, weight, 2],
    ],
    [4, 6],
    2,
    { templateId: 'upper' },
  );
  done.entries[0]!.role = 'secondary-strength';
  done.entries[0]!.atBackOffs = true;
  return done;
}

const backOffsAt = (weight: number): SetSpec[] => [
  [5, weight, 2],
  [5, weight, 2],
  [5, weight, 2],
];

const rowIn = (workout: GeneratedWorkout): WorkoutEntry =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === ROW)!;

/** Two top sets a rep under the floor at no reserve, the upper day between. */
const sessions = (first: number, between: number, last: number) => [
  structured(first, [3, 165, 0], backOffsAt(155)),
  upperDay(between, 155),
  structured(last, [3, 165, 0], backOffsAt(155)),
];

describe('the row’s top set missed twice, an upper day between, trained every eleven days', () => {
  it('a week closer together: the micro-deload', () => {
    const row = rowIn(plan(sessions(18, 9, 3), undefined, { templateId: 'pull-arms' }));
    expect(row.progression?.mode).toBe('deload');
  });

  it('never three weeks untrained: the micro-deload all the same', () => {
    const row = rowIn(plan(sessions(25, 14, 3), undefined, { templateId: 'pull-arms' }));
    const line = (row.progression?.evidence ?? []).join(' / ');
    // On e6ed7ed: 'maintain', the top set at 165 a third time, "Missed the floor last time; one
    // session is not a trend, so repeat the load."
    expect(row.progression?.mode, line).toBe('deload');
    expect(
      shape(row).every(([weight]) => (weight as number) < 165),
      line,
    ).toBe(true);
  });
});
