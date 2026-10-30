import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { plan, run } from '../../test/backOffs';
import { STRENGTH_MAXES_ID, type StrengthMaxes } from '../progression/maxes';

/**
 * The eighth review of round N. A max entered on a main lift whose reps were set by hand: the
 * seventh review's fix (and the fourth's) passed it by.
 *
 * The spec: "a max entered reads the lift's own straight target as every plan does" (the seventh
 * review), "a max entered reads the target as every plan does" (the fourth), the top set and the
 * lift's own straight target read past its straight days at the back-offs' load (the sixth); a max
 * that says less than the logged sets moves nothing ("the log stays the evidence", Maintenance 25).
 * Reps set by hand (`rep-range`) keep the lift on its top set and back-offs (`refitEntry` refits it
 * in place, tiers and all).
 *
 * What happens on abb5566: the `max` rebuild's `fittedFrom` takes `mainLiftTarget` only when no reps
 * were set by hand (`if (!byHand)`); with reps set by hand it reads `targetFor(prescription)` off the
 * whole history, the straight days at the back-offs' load read as the row's own, and builds straight
 * sets, the hand-set reps restored over them (the first keeps the top set's 1 in reserve, untiered).
 *
 * 1. The row's micro-deload day (its top set missed its floor two pull days running, the upper day
 *    between them at its back-offs' load, marked): the plan asks 150 on straight sets ("Missed the
 *    floor twice in a row: micro-deload 10%"). The lifter sets the reps to 4-6 by hand, then enters
 *    a max of 150 lb, less than the log says: every set goes to 165, the load missed twice ("Missed
 *    the floor last time; one session is not a trend, so repeat the load"), and the sheet says
 *    "Max saved. Your logged sets already put Barbell Row at this target." (`kept`). The seventh
 *    review's MEDIUM, through the reps set by hand.
 * 2. A plain pull day (top set 170 × 5 at 1 last week, the upper day at 160 since, marked): the plan
 *    asks a top set of 175 and back-offs at 165; reps set to 4-6 by hand keep that. A max of 150,
 *    less than the log: every set at 165 (stepped off the upper day's 160), the top set and the drop
 *    gone, the first set left at the top set's 1 in reserve, and the sheet says `kept` again.
 *
 * Also fails on 5dc61a7 and e6ed7ed. Synthetic data only.
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

/** Each working set's load, reserve and tier. */
const sets = (entry: WorkoutEntry) =>
  entry.sets
    .filter((set) => set.kind === 'working')
    .map((set) => [set.targetWeight, set.targetRir, set.tier ?? 'straight']);

const maxOf = (e1rm: number): StrengthMaxes => ({
  id: STRENGTH_MAXES_ID,
  maxes: { [ROW]: { e1rm, units: 'lb', enteredAt: RECORD_NOW, from: null } },
  prompts: {},
});

/** Today's pull day planned, the row's reps set to 4-6 by hand, then a max entered. */
function handRepsThenMax(history: WorkoutRecord[], e1rm: number) {
  const workout = plan(history, undefined, { templateId: 'pull-arms' });
  const planned = rowIn(workout);
  const ranged = run({ type: 'rep-range', entryId: planned.id, reps: [4, 6] }, workout, {
    history,
  });
  const before = rowIn(ranged.workout);
  const entered = run({ type: 'max', exerciseId: ROW }, ranged.workout, {
    history,
    maxes: maxOf(e1rm),
  });
  const after = rowIn(entered.workout);
  const line = (after.progression?.evidence ?? []).join(' / ');
  return { planned, before, after, line, outcome: entered.max };
}

describe('a max entered on the row with its reps set by hand', () => {
  it('its micro-deload day: a max under the log keeps the micro-deload', () => {
    const history = [
      structured(11, [3, 165, 0], backOffsAt(155)),
      upperDay(7, 155),
      structured(4, [3, 165, 0], backOffsAt(155)),
    ];
    const { planned, before, after, line, outcome } = handRepsThenMax(history, 150);
    expect(planned.progression?.mode).toBe('deload');
    expect(before.manual?.reps).toBe(true);
    expect(sets(before)).toEqual(sets(planned));
    // The sheet says the lift is lighter today to win back missed reps, as it does with no reps set
    // by hand (Maintenance 25: "a max does not change that")...
    expect(outcome).toBe('eased');
    // ...and nothing moves. On abb5566: every set at 165, 'maintain'.
    expect(sets(after), line).toEqual(sets(before));
  });

  it('a plain day: a max under the log moves no set', () => {
    const history = [structured(8, [5, 170, 1], backOffsAt(160)), upperDay(4, 160)];
    const { planned, before, after, line, outcome } = handRepsThenMax(history, 150);
    expect(sets(planned)[0]).toEqual([175, 1, 'top']);
    expect(sets(before)).toEqual(sets(planned));
    expect(outcome).toBe('kept');
    // On abb5566: [[165, 1, 'straight'], [165, 2, 'straight'] x 3]: the top set gone, the first
    // set left at the top set's 1 in reserve.
    expect(sets(after), line).toEqual(sets(before));
  });
});
