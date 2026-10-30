import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { STRENGTH_MAXES_ID, type StrengthMaxes } from '../progression/maxes';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { gym, plan, profileOf, run } from '../../test/backOffs';
import { savedAs } from '../../test/backOffsSim';

/**
 * The tenth review of round N. A max entered on a lift whose reps were set by hand at another range
 * than the plan's builds it straight at its back-offs' load (the ninth pass), but never marks the
 * day as one at the back-offs' load, and takes away the mark the plan gave it: the lift's next top
 * set reads that day as a session of its own and steps from the back-offs' load, the fourth
 * review's HIGH through the max sheet.
 *
 * The spec (docs/reports/maintenance-32.md): the fourth pass, "a straight day at the back-offs' load
 * is saved as one, and a lift's top set reads past such days as past its back-offs" (its HIGH: "its
 * next main day read the straight day at the back-offs' load at the top set's reserve, and one step
 * up from there was the top set it lifted last time"); the ninth, "A max with reps set by hand at
 * another range reads its straight day as every plan does, at the back-offs' load after a session
 * on the structure"; every plan marks that day (`mainLiftTarget`'s `straight: true`, saved as
 * `atBackOffs`). Maintenance 25: a max that says less than the log moves nothing ("kept").
 *
 * What happens: the max trigger's other-range branch (recalibrate.ts `fittedFrom`) takes only
 * `mainLiftTarget(...).target` and returns `straight: false`, so `entry.atBackOffs` is deleted.
 *
 * Steps: the row's last two pull days on the structure (top sets 185 and 190 × 5 at 1, back-offs
 * 175 and 180). Today, the upper day: the row straight at its back-offs' load, 185 × 4-6 at 2,
 * marked. The lifter sets its reps to 6-8 by hand (still marked), then enters a max of 200 lb, less
 * than the log says ("kept"): still 185 on every set, the mark gone. Lifted as asked (185 × 7 at 2)
 * and saved, the next pull day's top set is 190 × 4-6, where the same day without the max gives
 * 195, a step up from the last top set. The same on the pull day itself (reps 6-8, then the max:
 * four straight sets of 185, unmarked; the next pull day's top set 190, the last top set's own load
 * again, where read past the day it steps to 195).
 *
 * Passes on 1bbd451 (before the ninth pass, the branch built the sets at the top set's own load, 190,
 * and the next top set read 190 × 7 at 2 and stepped to 195). Synthetic data only.
 */

const ROW = 'barbell-row';
const DAY = 86_400_000;

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

const history = (): WorkoutRecord[] => [
  structured(7, [5, 185, 1], 175),
  structured(3, [5, 190, 1], 180),
];

const rowIn = (workout: GeneratedWorkout): WorkoutEntry =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === ROW && !entry.stopped)!;

const loads = (entry: WorkoutEntry) =>
  entry.sets.filter((set) => set.kind === 'working').map((set) => set.targetWeight as number);

/** Straight at the back-offs' load (185, 5% under the 190 top set), the day is marked as one. */
const markedWhereAtBackOffs = (entry: WorkoutEntry) =>
  !loads(entry).every((load) => load === 185) ||
  entry.sets.some((set) => set.tier !== undefined) ||
  entry.atBackOffs === true;

const maxOf = (e1rm: number): StrengthMaxes => ({
  id: STRENGTH_MAXES_ID,
  maxes: { [ROW]: { e1rm, units: 'lb', enteredAt: RECORD_NOW, from: null } },
  prompts: {},
});

/** Today's day, the row's reps set by hand, a max entered or not; then the next pull day. */
function today(templateId: string, maxEntered: boolean) {
  const log = history();
  const workout = plan(log, undefined, { templateId });
  const ranged = run({ type: 'rep-range', entryId: rowIn(workout).id, reps: [6, 8] }, workout, {
    history: log,
  });
  const done = maxEntered
    ? run({ type: 'max', exerciseId: ROW }, ranged.workout, { history: log, maxes: maxOf(200) })
    : ranged;
  const row = rowIn(done.workout);
  const saved = savedAs(done.workout, RECORD_NOW, `today-${templateId}`);
  const next = generateWorkout({
    profile: profileOf(),
    location: gym,
    history: [...log, saved],
    now: new Date(Date.parse(RECORD_NOW) + 2 * DAY).toISOString(),
    duration: 'default',
    constraints: { templateId: 'pull-arms' },
  });
  const top = rowIn(next).sets.find((set) => set.tier === 'top');
  return { row, outcome: done.max, top: top?.targetWeight ?? null, line: rowIn(next).progression };
}

describe('a max entered on the row with its reps set by hand at another range', () => {
  it('the upper day at the back-offs’ load stays marked, and the next top set steps from the last one', () => {
    const plain = today('upper', false);
    expect(plain.row.atBackOffs).toBe(true);
    expect(loads(plain.row)).toEqual([185, 185, 185]);
    expect(plain.top).toBe(195);
    const entered = today('upper', true);
    expect(entered.outcome).toBe('kept');
    // On 25fd689: [185, 185, 185], the mark gone, and the next pull day's top set 190, a step up
    // from 185. On 1bbd451: [190, 190, 190] (the ninth review's finding), the next top set 195.
    expect(
      { markedAtBackOffs: markedWhereAtBackOffs(entered.row), nextTop: entered.top },
      `${loads(entered.row).join(', ')} / ${(entered.line?.evidence ?? []).join(' / ')}`,
    ).toEqual({ markedAtBackOffs: true, nextTop: 195 });
  });

  it('the pull day run straight at the back-offs’ load is marked, and the next top set steps from the last one', () => {
    const entered = today('pull-arms', true);
    expect(entered.outcome).toBe('kept');
    // On 25fd689: four straight sets of 185, unmarked, and the next pull day's top set 190, a step
    // up from 185 and the last top set's own load. On 1bbd451: [190, 190, 190, 190], the next 195.
    expect(
      { markedAtBackOffs: markedWhereAtBackOffs(entered.row), nextTop: entered.top },
      `${loads(entered.row).join(', ')} / ${(entered.line?.evidence ?? []).join(' / ')}`,
    ).toEqual({ markedAtBackOffs: true, nextTop: 195 });
  });
});
