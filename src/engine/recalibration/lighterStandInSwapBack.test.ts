import { describe, expect, it } from 'vitest';
import { emptyCompleted, planUnderTheEase } from './recalibrate';
import type { CompletedWork } from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { BENCH, DB_BENCH, bench, plan, profileOf, run, shape, topDone } from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * Maintenance 33, the third review: a lift swapped back after "Lighter" came in on what stood in
 * for it, not on the lift itself. No record of the lift's plan was kept when it stopped, so the swap
 * back records it with what it owes as the plan has it: the sets the stand-in's own record had still
 * to come (where "Lighter" took one off it), at the plan's effort. A saved copy gives that back.
 *
 * Steps: a hybrid lifter's push day; the bench press's top set logged, or its ramps alone and the
 * stand-in's first set after them (the stand-in under way, which "Lighter" takes a set off); the
 * bench swapped for the dumbbell bench press; "Lighter for the chest" taken there; the bench swapped
 * back; the workout saved to reuse (`planUnderTheEase`). The control: the same steps without
 * "Lighter". Synthetic data only.
 */

const profile = profileOf('hybrid');

const live = (workout: GeneratedWorkout, exerciseId: string): WorkoutEntry =>
  allEntries(workout.blocks).find(
    (entry) => entry.exerciseId === exerciseId && entry.stopped === undefined,
  )!;

const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');

/** These sets of a lift logged as asked, after what was logged before. */
function logged(
  before: CompletedWork,
  entry: WorkoutEntry,
  pick: (set: WorkoutEntry['sets'][number]) => boolean,
): CompletedWork {
  return {
    ...before,
    startedAt: RECORD_NOW,
    currentEntryId: entry.id,
    sets: [
      ...before.sets,
      ...entry.sets.filter(pick).map((set) => ({
        entryId: entry.id,
        exerciseId: entry.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: set.targetReps[0],
        weight: set.targetWeight,
        rir: set.kind === 'warmup' ? 5 : set.targetRir,
        completedAt: RECORD_NOW,
      })),
    ],
  };
}

function savedBench(lighter: boolean, under: 'top' | 'stand-in' = 'top') {
  const workout = plan(undefined, profile);
  const before: CompletedWork =
    under === 'top'
      ? topDone(bench(workout), 190)
      : logged(emptyCompleted(), bench(workout), (set) => set.kind === 'warmup');
  const swapped = run(
    { type: 'replace', entryId: live(workout, BENCH).id, exerciseId: DB_BENCH },
    workout,
    { completed: before, profile },
  );
  const first = working(live(swapped.workout, DB_BENCH))[0]!;
  const completed =
    under === 'top'
      ? before
      : logged(before, live(swapped.workout, DB_BENCH), (set) => set === first);
  const eased = lighter
    ? run({ type: 'lighter', muscle: 'chest' }, swapped.workout, {
        completed,
        profile,
        constraints: swapped.constraints,
      })
    : swapped;
  const back = run(
    { type: 'replace', entryId: live(eased.workout, DB_BENCH).id, exerciseId: BENCH },
    eased.workout,
    { completed, profile, constraints: eased.constraints },
  );
  return {
    standIn: working(live(swapped.workout, DB_BENCH)).length,
    eased: working(live(eased.workout, DB_BENCH)).length,
    saved: live(planUnderTheEase(back.workout), BENCH),
  };
}

describe('"Lighter" taken on the stand-in, the lift swapped back and saved', () => {
  it('keeps the lift as the plan has it, as the same steps without "Lighter" do', () => {
    const control = savedBench(false).saved;
    expect(shape(control)).toEqual([
      [190, 1, 'top'],
      [180, 2, 'back-off'],
      [180, 2, 'back-off'],
      [180, 2, 'back-off'],
    ]);
    expect(shape(savedBench(true).saved)).toEqual(shape(control));
  });

  it('keeps every set the plan has where "Lighter" took one off the stand-in', () => {
    const control = savedBench(false, 'stand-in');
    // The stand-in did one of the bench's four sets; a saved copy does them all again
    // (`withoutStops`).
    expect(working(control.saved)).toHaveLength(4);
    const taken = savedBench(true, 'stand-in');
    // Under way, the stand-in had three sets still to come; "Lighter" took one of them.
    expect(taken.standIn).toBe(4);
    expect(taken.eased).toBe(3);
    expect(shape(taken.saved)).toEqual(shape(control.saved));
  });
});
