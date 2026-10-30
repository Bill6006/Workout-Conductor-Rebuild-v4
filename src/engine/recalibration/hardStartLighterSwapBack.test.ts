import { describe, expect, it } from 'vitest';
import { emptyCompleted } from './recalibrate';
import type { CompletedSet, CompletedWork } from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { BENCH, DB_BENCH, bench, entryOf, plan, profileOf, run } from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * The third adversarial review of Maintenance 33: with a hard start in force, "Lighter" on a lift
 * under way is still lost when the lifter swaps the lift and swaps back to it.
 *
 * Steps: a hybrid lifter's push day. They lift every working set of the bench press, then the first
 * set of the incline dumbbell press (three sets of 6-10 at 1 in reserve, 45 lb): the two lifts read
 * as a hard start, and the rest is eased; the incline press, under way before it, keeps its own sets
 * (item 42). The "too soon" card names the upper chest, and they tap "Lighter for the upper chest":
 * the incline press's sets still to come become one at 45 lb for 5-9 at 2. Its bench is taken, so
 * they swap to the dumbbell bench press, and when it is free they swap back to the incline press.
 * Without the hard start the same steps bring the incline press back eased (the second review's
 * fix).
 *
 * The rule: the lighter option takes a lift under way "on its sets still to come, for good: the
 * workout never gives it back" (recalibrate.ts, `lightenUnderWay`); the second review's finding and
 * fix for the same steps without a hard start ("swapped back, its sets came back at the plan's
 * reserve with 'Lighter' still in force for its muscle"; the report: "'Lighter' ... comes back eased
 * on a lift swapped back"); the lighter option "takes the hard start's ease too, never on top of
 * one: the larger of each part" (`easeTheRest`), so with both in force the lift is eased at least as
 * "Lighter" eased it.
 *
 * What happens: `swapBack` eases what the lift owes only "with no hard start's ease over it"
 * (`request.constraints.badStart ? [] : request.constraints.lighter`), and the hard start's own ease
 * never lands on a block begun (`easeTheRest`). So the incline press comes back at 45 lb for 6-10 at
 * 1, the plan's, eased by neither, with "Lighter" for the upper chest and the hard start both in
 * force. It fails before the second review's fix too (80893d4), where no swap back kept "Lighter".
 *
 * Synthetic data only.
 */

const profile = profileOf('hybrid');
const INCLINE = 'incline-dumbbell-press';

const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
const toCome = (entry: WorkoutEntry, completed: CompletedWork) =>
  working(entry)
    .filter(
      (set) =>
        !completed.sets.some((done) => done.entryId === entry.id && done.setIndex === set.index),
    )
    .map((set) => [set.targetWeight, set.targetReps, set.targetRir]);

const live = (workout: GeneratedWorkout, exerciseId: string) =>
  allEntries(workout.blocks).find(
    (entry) => entry.exerciseId === exerciseId && entry.stopped === undefined,
  )!;

/** Working sets logged as asked, a minute apart. */
function logged(sets: { entry: WorkoutEntry; index: number }[]): CompletedWork {
  const done: CompletedSet[] = sets.map(({ entry, index }, at) => {
    const set = entry.sets.find((each) => each.index === index)!;
    return {
      entryId: entry.id,
      exerciseId: entry.exerciseId,
      setIndex: index,
      kind: 'working',
      reps: set.targetReps[0],
      weight: set.targetWeight,
      rir: set.targetRir,
      completedAt: new Date(Date.parse(RECORD_NOW) + at * 60_000).toISOString(),
    };
  });
  return {
    ...emptyCompleted(),
    startedAt: RECORD_NOW,
    currentEntryId: sets.at(-1)!.entry.id,
    sets: done,
  };
}

describe('"Lighter" under a hard start, swapped and swapped back', () => {
  it('keeps the lighter sets still to come', () => {
    const workout = plan(undefined, profile);
    const press = bench(workout);
    const incline = entryOf(workout, INCLINE);
    const completed = logged([
      ...working(press).map((set) => ({ entry: press, index: set.index })),
      { entry: incline, index: working(incline)[0]!.index },
    ]);

    const hard = run({ type: 'bad-start', low: true, lifts: [BENCH, INCLINE] }, workout, {
      completed,
      profile,
    });
    expect(hard.constraints.badStart).toBe(true);
    // Under way before the hard start, the incline press keeps its sets.
    expect(toCome(live(hard.workout, INCLINE), completed)).toEqual([
      [45, [6, 10], 1],
      [45, [6, 10], 1],
    ]);
    const lighter = run({ type: 'lighter', muscle: 'upper-chest' }, hard.workout, {
      completed,
      profile,
      constraints: hard.constraints,
    });
    const eased = toCome(live(lighter.workout, INCLINE), completed);
    expect(eased).toEqual([[45, [5, 9], 2]]);

    const swapped = run(
      { type: 'replace', entryId: live(lighter.workout, INCLINE).id, exerciseId: DB_BENCH },
      lighter.workout,
      { completed, profile, constraints: lighter.constraints },
    );
    const back = run(
      { type: 'replace', entryId: live(swapped.workout, DB_BENCH).id, exerciseId: INCLINE },
      swapped.workout,
      { completed, profile, constraints: swapped.constraints },
    );
    expect(back.constraints.badStart).toBe(true);
    expect(back.constraints.lighter).toEqual(['upper-chest']);
    expect(toCome(live(back.workout, INCLINE), completed)).toEqual(eased);
  });
});
