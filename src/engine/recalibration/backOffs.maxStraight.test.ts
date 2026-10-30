import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../../engine/workout/types';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { DB_BENCH, entryOf, home, plan, run, shape } from '../../test/backOffs';
import { STRENGTH_MAXES_ID, type StrengthMaxes } from '../../engine/progression/maxes';

/**
 * Maintenance 32, the owner's item 11 (the fourth review of round N): a max entered reads a main
 * lift's target as every plan does: a lift secondary today after a session on the structure, and a
 * top set the place cannot load as asked, run straight at the back-offs' load. Synthetic data only.
 */

function structured(
  exerciseId: string,
  templateId: string,
  daysAgo: number,
  top: SetSpec,
  backOffs: SetSpec[],
  drop = 0.05,
): WorkoutRecord {
  const done = record(daysAgo, exerciseId, [top, ...backOffs], [4, 6], 2, { templateId });
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
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

const liftIn = (workout: GeneratedWorkout, exerciseId: string): WorkoutEntry =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId)!;

/** A max that says less than the log: the log stays the evidence, the target should not move. */
const maxOf = (exerciseId: string, e1rm: number): StrengthMaxes => ({
  id: STRENGTH_MAXES_ID,
  maxes: { [exerciseId]: { e1rm, units: 'lb', enteredAt: RECORD_NOW, from: null } },
  prompts: {},
});

describe('a max entered on a lift straight after a session on the structure, the fourth review of round N', () => {
  it('the row secondary on the upper day keeps the back-offs’ load through a max entered', () => {
    const ROW = 'barbell-row';
    const history = [
      structured(ROW, 'pull-arms', 7, [5, 185, 1], backOffsAt(175)),
      structured(ROW, 'pull-arms', 3, [5, 190, 1], backOffsAt(180)),
    ];
    const workout = plan(history, undefined, { templateId: 'upper' });
    const before = liftIn(workout, ROW);
    expect(before.role).toBe('secondary-strength');
    // The plan (third review's fix): straight at 2 in reserve at the back-offs' load, 185.
    expect(shape(before)).toEqual([
      [185, 2, 'straight'],
      [185, 2, 'straight'],
      [185, 2, 'straight'],
    ]);
    // The lifter enters a max that says less than the log: nothing should move.
    const entered = run({ type: 'max', exerciseId: ROW }, workout, {
      history,
      maxes: maxOf(ROW, 200),
    });
    const after = liftIn(entered.workout, ROW);
    // Fails on 5894333: [190, 2] on every set, "Hit the reps with little in reserve: hold the load".
    expect(after.progression?.evidence.join(' ')).not.toContain('little in reserve');
    expect(shape(after)).toEqual(shape(before));
    // Still a day at the back-offs' load, saved as one (the fourth review of round N).
    expect(after.atBackOffs).toBe(true);
  });

  it('the dumbbell bench press at dumbbells only to 100 keeps the back-offs’ load through a max entered', () => {
    const homeUpTo = (cap: number) => ({
      ...home,
      loading: {
        dumbbells: { kind: 'dumbbells' as const, ranges: [{ from: 5, to: cap, step: 5 }] },
      },
    });
    const history = [
      structured(DB_BENCH, 'push-arms', 7, [5, 95, 1], backOffsAt(90)),
      structured(DB_BENCH, 'push-arms', 3, [5, 100, 1], backOffsAt(95)),
    ];
    const location = homeUpTo(100);
    const workout = plan(history, undefined, {}, location);
    const before = entryOf(workout, DB_BENCH);
    expect(before.role).toBe('primary-strength');
    // The back-offs' load off the 105 asked: 99.75, 100 to the nearest weight here.
    expect(Math.max(...shape(before).map((set) => set[0] as number))).toBeLessThanOrEqual(100);
    const entered = run({ type: 'max', exerciseId: DB_BENCH }, workout, {
      history,
      location,
      maxes: maxOf(DB_BENCH, 100),
    });
    const after = entryOf(entered.workout, DB_BENCH);
    expect(shape(after)).toEqual(shape(before));
  });
});

describe('a lift at the back-offs’ load swapped for another, the fourth review of round N', () => {
  it('the upper day’s row swapped for the cable row: no longer a day at the back-offs’ load', () => {
    const ROW = 'barbell-row';
    const history = [
      structured(ROW, 'pull-arms', 7, [5, 185, 1], backOffsAt(175)),
      structured(ROW, 'pull-arms', 3, [5, 190, 1], backOffsAt(180)),
    ];
    const workout = plan(history, undefined, { templateId: 'upper' });
    const row = liftIn(workout, ROW);
    expect(row.atBackOffs).toBe(true);
    const swapped = run(
      { type: 'replace', entryId: row.id, exerciseId: 'seated-cable-row' },
      workout,
      {
        history,
      },
    );
    const cable = allEntries(swapped.workout.blocks).find((entry) => entry.id === row.id)!;
    expect(cable.exerciseId).toBe('seated-cable-row');
    expect(cable.atBackOffs).toBeUndefined();
  });
});

describe('reps set by hand on a day at the back-offs’ load, then a max entered, the fourth review of round N', () => {
  it('the lift reads its straight day as every plan does: still a day at the back-offs’ load', () => {
    const ROW = 'barbell-row';
    const history = [
      structured(ROW, 'pull-arms', 7, [5, 185, 1], backOffsAt(175)),
      structured(ROW, 'pull-arms', 3, [5, 190, 1], backOffsAt(180)),
    ];
    const workout = plan(history, undefined, { templateId: 'upper' });
    const row = liftIn(workout, ROW);
    expect(row.atBackOffs).toBe(true);
    // Reps set by hand: the sets keep their weight, still the back-offs' load.
    const repped = run({ type: 'rep-range', entryId: row.id, reps: [8, 10] }, workout, { history });
    expect(liftIn(repped.workout, ROW).atBackOffs).toBe(true);
    // A max entered reads the lift's straight day as every plan does, at the back-offs' load after
    // a session on the structure (the ninth review of round N), and keeps it saved as one (the
    // tenth: the mark went, and the next top set stepped from the back-offs' load).
    const entered = run({ type: 'max', exerciseId: ROW }, repped.workout, {
      history,
      maxes: maxOf(ROW, 200),
    });
    const after = liftIn(entered.workout, ROW);
    expect(
      after.sets.filter((set) => set.kind === 'working').map((set) => set.targetWeight),
    ).toEqual([185, 185, 185]);
    expect(after.atBackOffs).toBe(true);
  });
});
