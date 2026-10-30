import { describe, expect, it } from 'vitest';
import { planUnderTheEase } from './recalibrate';
import type { CompletedWork } from './types';
import type { WorkoutEntry } from '../workout/types';
import {
  BENCH,
  DB_BENCH,
  bench,
  entryOf,
  home,
  plan,
  profileOf,
  run,
  shape,
  trained,
} from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * The fourth adversarial review of Maintenance 33: a lift "Lighter" eased under way, stopped at a
 * place and picked up again back where it fits, loses the ease while "Lighter" is in force.
 *
 * Steps: a hybrid lifter's push day: the bench press's top set lifted at 190 as asked. The "too
 * soon" card offers "Lighter for the chest" and they take it: the bench press's back-offs still to
 * come keep 180, a set fewer and a rep more in reserve (3-5 at 3). They move to the home place, which
 * has no barbell: the bench press stops at its sets done and the dumbbell bench press stands in,
 * eased the same (3-5 at 3). Back at the gym, the bench press picks up again.
 *
 * The rule: the report: "a set fewer and a rep more in reserve on that muscle's lifts still to come,
 * at the same loads, a rep fewer"; the second review's fix, `swapBack`: what a lift owes "comes back
 * eased as it went, its loads kept (...: swapped back, its sets came back at the plan's reserve with
 * 'Lighter' still in force for its muscle)".
 *
 * What happens: the generator's pick-up builds what the lift owes at the day's prescription
 * (`reopened` in generate.ts) and drops what stopped it, the record "Lighter" kept with it too; the
 * lift is begun, so the layer passes it by (`easeTheRest`), and nothing lays the ease again. The bench
 * press's back-offs come back at 4-6 at 2, the plan's, beside "Lighter" for the chest still in
 * force, and the summary says only "Replaced Dumbbell Bench Press with Barbell Bench Press for the
 * sets still to come." The same steps by a swap and a swap back keep the ease. In the build before
 * the third review too (9580f26).
 *
 * The fix (the fourth pass): a lift picked up again where it fits, its muscle under "Lighter", comes
 * back eased as it went, with the record of the plan its stop kept (`lighterPickedUp`).
 *
 * Synthetic data only.
 */

const profile = profileOf('hybrid');
const history = trained();

const toCome = (entry: WorkoutEntry, completed: CompletedWork) =>
  entry.sets
    .filter(
      (set) =>
        set.kind === 'working' &&
        !completed.sets.some((done) => done.entryId === entry.id && done.setIndex === set.index),
    )
    .map((set) => [set.targetWeight, set.targetReps, set.targetRir]);

/** The bench's top set lifted, "Lighter" for the chest taken or not, home and back to the gym. */
function homeAndBack(lighter: boolean) {
  const workout = plan(history, profile);
  const entry = bench(workout);
  const top = entry.sets.find((set) => set.tier === 'top')!;
  const completed: CompletedWork = {
    startedAt: RECORD_NOW,
    elapsedSeconds: 0,
    currentEntryId: entry.id,
    sets: [
      {
        entryId: entry.id,
        exerciseId: BENCH,
        setIndex: top.index,
        kind: 'working',
        reps: 5,
        weight: 190,
        rir: 1,
        completedAt: RECORD_NOW,
      },
    ],
  };
  const options = { completed, currentEntryId: entry.id, profile, history };
  const afterTop = run(
    {
      type: 'performance',
      entryId: entry.id,
      setIndex: top.index,
      actualReps: 5,
      actualWeight: 190,
      plan: { kind: 'none', reason: 'On target.' },
    },
    workout,
    options,
  );
  const eased = lighter
    ? run({ type: 'lighter', muscle: 'chest' }, afterTop.workout, options)
    : afterTop;
  const gone = run({ type: 'location' }, eased.workout, {
    ...options,
    location: home,
    constraints: eased.constraints,
  });
  return run({ type: 'location' }, gone.workout, { ...options, constraints: gone.constraints });
}

describe('"Lighter" on a lift under way, home and back to the gym', () => {
  it('gives a saved copy the plan back, as the same steps without "Lighter" do', () => {
    const control = bench(planUnderTheEase(homeAndBack(false).workout));
    const back = homeAndBack(true);
    expect(back.constraints.lighter).toEqual(['chest']);
    // The record of the plan its stop kept goes with it, for a copy saved after.
    expect(shape(bench(planUnderTheEase(back.workout)))).toEqual(shape(control));
  });

  it('keeps the lift eased while "Lighter" is in force', () => {
    const workout = plan(history, profile);
    const entry = bench(workout);
    const top = entry.sets.find((set) => set.tier === 'top')!;
    const completed: CompletedWork = {
      startedAt: RECORD_NOW,
      elapsedSeconds: 0,
      currentEntryId: entry.id,
      sets: [
        {
          entryId: entry.id,
          exerciseId: BENCH,
          setIndex: top.index,
          kind: 'working',
          reps: 5,
          weight: 190,
          rir: 1,
          completedAt: RECORD_NOW,
        },
      ],
    };
    const options = { completed, currentEntryId: entry.id, profile, history };
    const afterTop = run(
      {
        type: 'performance',
        entryId: entry.id,
        setIndex: top.index,
        actualReps: 5,
        actualWeight: 190,
        plan: { kind: 'none', reason: 'On target.' },
      },
      workout,
      options,
    );
    const lighter = run({ type: 'lighter', muscle: 'chest' }, afterTop.workout, options);
    const eased = toCome(bench(lighter.workout), completed);
    expect(eased).toEqual([
      [180, [3, 5], 3],
      [180, [3, 5], 3],
    ]);

    const gone = run({ type: 'location' }, lighter.workout, {
      ...options,
      location: home,
      constraints: lighter.constraints,
    });
    // At home the dumbbell bench press stands in, eased as "Lighter" eases it.
    expect(toCome(entryOf(gone.workout, DB_BENCH), completed).map((set) => set.slice(1))).toEqual([
      [[3, 5], 3],
      [[3, 5], 3],
    ]);
    const back = run({ type: 'location' }, gone.workout, {
      ...options,
      constraints: gone.constraints,
    });
    expect(back.constraints.lighter).toEqual(['chest']);
    expect(toCome(bench(back.workout), completed)).toEqual(eased);
  });
});

describe('"Lighter" on a lift with sets over its floor, under way, at a bare place and back', () => {
  it('comes back with the set the ease took gone once', () => {
    // The fifth pass's own: the incline press in Hypertrophy focus, four sets over a floor of two,
    // so a second set taken would show; "Lighter" took one under way, and the pick-up owes the rest.
    // A place with no equipment stops it (home has its dumbbells and bench).
    const own = profileOf('hypertrophy-focus');
    const bare = { ...home, id: 'bare', name: 'Bare', equipment: [] };
    const workout = plan(history, own);
    const incline = entryOf(workout, 'incline-dumbbell-press');
    const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
    expect(working(incline)).toHaveLength(4);
    const first = working(incline)[0]!;
    const completed: CompletedWork = {
      startedAt: RECORD_NOW,
      elapsedSeconds: 0,
      currentEntryId: incline.id,
      sets: [
        {
          entryId: incline.id,
          exerciseId: incline.exerciseId,
          setIndex: first.index,
          kind: 'working',
          reps: first.targetReps[0],
          weight: first.targetWeight,
          rir: first.targetRir,
          completedAt: RECORD_NOW,
        },
      ],
    };
    const options = { completed, currentEntryId: incline.id, profile: own, history };
    const eased = run({ type: 'lighter', muscle: 'upper-chest' }, workout, options);
    expect(working(entryOf(eased.workout, 'incline-dumbbell-press'))).toHaveLength(3);
    const gone = run({ type: 'location' }, eased.workout, {
      ...options,
      location: bare,
      constraints: eased.constraints,
    });
    expect(
      gone.workout.blocks.some((block) =>
        block.entries.some((entry) => entry.id === incline.id && entry.stopped !== undefined),
      ),
    ).toBe(true);
    const back = run({ type: 'location' }, gone.workout, {
      ...options,
      constraints: gone.constraints,
    });
    expect(working(entryOf(back.workout, 'incline-dumbbell-press'))).toHaveLength(3);
  });
});
