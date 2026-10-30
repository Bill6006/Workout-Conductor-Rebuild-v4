import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { plan, run } from '../../test/backOffs';
import { STRENGTH_MAXES_ID, type StrengthMaxes } from '../progression/maxes';

/**
 * The ninth review of round N. A max entered on a lift whose reps were set by hand at another range
 * than the plan's, after a session on the structure: the rebuild reads the lift's last top set at a
 * straight set's reserve, the second and third reviews' defect through the eighth pass's
 * other-range branch.
 *
 * The spec (docs/reports/maintenance-32.md): "A day that runs the lift straight after a session on
 * the structure, a day it is a secondary lift included, takes its back-offs' load"; `straightAfterTop`:
 * "The top set's load asked at a straight set's reserve asks more than its reps allow"; the third
 * review's HIGH: a top set lifted as asked, read at a straight set's reserve, was called "little in
 * reserve: hold the load"; the fourth: "a max entered reads the target as every plan does"; the
 * eighth: "at another range, its own straight target (as the fourth pass settled), read past the
 * marked days"; Maintenance 25: a max that says less than the logged sets moves nothing, the log
 * stays the evidence, and the sheet says so ("kept").
 *
 * What happens: `fittedFrom`'s other-range branch reads `targetFor(prescription, past.history)`, the
 * plan's straight prescription (4-6 at 2 in reserve) off the last top set (190 × 5 at 1), and never
 * asks `straightAfterTop` whether that session ran on the structure, as `mainLiftTarget` does for
 * every plan: "Hit the reps with little in reserve: hold the load", 190 on every set.
 *
 * 1. The row on the upper day (secondary), its last two sessions pull days on the structure (top
 *    sets 185 and 190 × 5 at 1, back-offs 175 and 180): the plan runs it straight at the back-offs'
 *    load, 185 × 4-6 at 2. The lifter sets the reps to 8-10 by hand (the sets keep 185), then
 *    enters a max of 200 lb, less than the log says: every set goes to 190 × 8-10 at 2, the top
 *    set's load, with "little in reserve: hold the load", and the sheet says the max moved nothing
 *    (`kept`).
 * 2. The row on its pull day (main): top set 195, back-offs 185; reps set to 6-8 by hand keep the
 *    loads; the same max: four straight sets of 190, the back-offs 5 lb heavier at more reps, the
 *    same line, `kept`.
 *
 * Also fails on 412666e (before the eighth pass). Synthetic data only.
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

const backOffsAt = (weight: number): SetSpec[] => [
  [5, weight, 2],
  [5, weight, 2],
  [5, weight, 2],
];

const history = (): WorkoutRecord[] => [
  structured(7, [5, 185, 1], backOffsAt(175)),
  structured(3, [5, 190, 1], backOffsAt(180)),
];

const rowIn = (workout: GeneratedWorkout): WorkoutEntry =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === ROW)!;

const loads = (entry: WorkoutEntry) =>
  entry.sets.filter((set) => set.kind === 'working').map((set) => set.targetWeight as number);

/** A max that says less than the log: the log stays the evidence. */
const maxOf = (e1rm: number): StrengthMaxes => ({
  id: STRENGTH_MAXES_ID,
  maxes: { [ROW]: { e1rm, units: 'lb', enteredAt: RECORD_NOW, from: null } },
  prompts: {},
});

/** The day planned, the row's reps set by hand at another range, then a max entered. */
function handRepsThenMax(templateId: string, reps: [number, number]) {
  const log = history();
  const workout = plan(log, undefined, { templateId });
  const planned = rowIn(workout);
  const ranged = run({ type: 'rep-range', entryId: planned.id, reps }, workout, { history: log });
  const before = rowIn(ranged.workout);
  const entered = run({ type: 'max', exerciseId: ROW }, ranged.workout, {
    history: log,
    maxes: maxOf(200),
  });
  const after = rowIn(entered.workout);
  const line = (after.progression?.evidence ?? []).join(' / ');
  return { planned, before, after, line, outcome: entered.max };
}

describe('a max entered on the row with its reps set by hand at another range', () => {
  it('the upper day: no set over the back-offs’ load the plan asked, no top set read as a straight one', () => {
    const { planned, before, after, line, outcome } = handRepsThenMax('upper', [8, 10]);
    expect(planned.atBackOffs).toBe(true);
    expect(loads(planned)).toEqual([185, 185, 185]);
    expect(loads(before)).toEqual([185, 185, 185]);
    expect(outcome).toBe('kept');
    // On 34dc615 and 412666e: "Hit the reps with little in reserve: hold the load and bank a
    // cleaner session."
    expect(line).not.toContain('little in reserve');
    // On 34dc615 and 412666e: [190, 190, 190], the top set's load at 8-10 reps and 2 in reserve.
    expect(Math.max(...loads(after)), line).toBeLessThanOrEqual(185);
  });

  it('the pull day: no straight set at the top set’s load, the back-offs never heavier', () => {
    const { planned, before, after, line, outcome } = handRepsThenMax('pull-arms', [6, 8]);
    expect(loads(planned)).toEqual([195, 185, 185, 185]);
    expect(loads(before)).toEqual([195, 185, 185, 185]);
    expect(outcome).toBe('kept');
    // On 34dc615 and 412666e: the same line.
    expect(line).not.toContain('little in reserve');
    // On 34dc615 and 412666e: [190, 190, 190, 190], straight; the back-offs were 185.
    expect(Math.max(...loads(after)), line).toBeLessThanOrEqual(185);
  });
});
