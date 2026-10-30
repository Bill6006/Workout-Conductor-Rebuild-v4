import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { STRENGTH_MAXES_ID, type StrengthMaxes } from '../progression/maxes';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { plan, run } from '../../test/backOffs';

/**
 * The tenth review of round N. A max entered on a main lift whose reps were set by hand at another
 * range, on its main day, builds it straight (the fourth and ninth passes), and then puts the reps
 * set by hand back with the reserve each set had: the old top set's 1 lands on the first straight
 * set, so a straight day asks one set at a top set's reserve.
 *
 * The spec (docs/reports/maintenance-32.md): "The top set at 1 in reserve ... the back-offs ... at 2
 * in reserve"; "A day that runs the lift straight after a session on the structure ... takes its
 * back-offs' load ... at the day's reserve" (`straightAfterTop`: "its back-offs' load, the drop in
 * force off the load its top set would carry, at the day's reserve"); the ninth pass, "A max with
 * reps set by hand at another range reads its straight day as every plan does". A straight set
 * never carries the top set's reserve: the first review's MEDIUM, "the coach's deload ... kept a top
 * set one rep short of failure, where every eased load runs straight", eased every set to the
 * back-offs' reserve.
 *
 * What happens: `restoreHandReps` (`withReps`) puts back each working set's `targetRir` from
 * `ownReps`, read while the lift had a top set (1) and back-offs (2), onto the straight sets the
 * other-range branch built at the day's reserve.
 *
 * Steps: the row's last two pull days on the structure (top sets 185 and 190, back-offs 175 and 180);
 * today's pull day plans a top set of 195 at 1 and back-offs of 185 at 2. The lifter sets its reps to
 * 6-8 by hand (the tiers and reserves kept), then enters a max of 200 lb ("kept"): four straight sets
 * of 185 × 6-8, the first at 1 in reserve and no tier, the others at 2.
 *
 * Also fails on 1bbd451 (the sets at 190 then, the first at 1 too): older than the ninth pass.
 * Synthetic data only.
 */

const ROW = 'barbell-row';

function structured(daysAgo: number, top: SetSpec, backOff: number): WorkoutRecord {
  const back: SetSpec = [5, backOff, 2];
  const done = record(daysAgo, ROW, [top, back, back, back], [4, 6], 2, {
    templateId: 'pull-arms',
  });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

const rowIn = (workout: GeneratedWorkout): WorkoutEntry =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === ROW && !entry.stopped)!;

const working = (entry: WorkoutEntry) =>
  entry.sets
    .filter((set) => set.kind === 'working')
    .map((set) => `${set.tier ?? 'straight'} ${set.targetWeight} @${set.targetRir}`);

const maxOf = (e1rm: number): StrengthMaxes => ({
  id: STRENGTH_MAXES_ID,
  maxes: { [ROW]: { e1rm, units: 'lb', enteredAt: RECORD_NOW, from: null } },
  prompts: {},
});

describe('a max entered on the row’s pull day with its reps set by hand at another range', () => {
  it('builds every straight set at the day’s reserve, none at the top set’s', () => {
    const log = [structured(7, [5, 185, 1], 175), structured(3, [5, 190, 1], 180)];
    const workout = plan(log, undefined, { templateId: 'pull-arms' });
    expect(working(rowIn(workout))).toEqual([
      'top 195 @1',
      'back-off 185 @2',
      'back-off 185 @2',
      'back-off 185 @2',
    ]);
    const ranged = run({ type: 'rep-range', entryId: rowIn(workout).id, reps: [6, 8] }, workout, {
      history: log,
    });
    const entered = run({ type: 'max', exerciseId: ROW }, ranged.workout, {
      history: log,
      maxes: maxOf(200),
    });
    expect(entered.max).toBe('kept');
    const sets = working(rowIn(entered.workout));
    // Straight, as the fourth and ninth passes settled.
    expect(sets.every((set) => set.startsWith('straight '))).toBe(true);
    // On 25fd689: ['straight 185 @1', 'straight 185 @2', 'straight 185 @2', 'straight 185 @2'].
    expect(
      sets.filter((set) => !set.endsWith('@2')),
      sets.join(', '),
    ).toEqual([]);
  });
});
