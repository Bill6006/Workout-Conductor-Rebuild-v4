import { describe, expect, it } from 'vitest';
import type { CompletedWork, RecalibrationSuccess } from './types';
import { allEntries, type WorkoutEntry } from '../workout/types';
import {
  BENCH,
  DB_BENCH,
  bench,
  entryOf,
  home,
  plan,
  profileOf,
  run,
  trained,
} from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * The fifth adversarial review of Maintenance 33: "Lighter" taken after the lift under way was
 * swapped, or moved by a place, takes no set off what stands in for it, so the same two taps give
 * the chest a set more in one order than in the other.
 *
 * Steps: a hybrid lifter's push day, the bench press on a top set (190 × 4-6 at 1 in reserve) and
 * three back-offs (180 × 4-6 at 2). They lift the top set (5 reps at 190). Then, in one order, they
 * swap the bench press for the dumbbell bench press (or move to the home place, which has no
 * barbell, and the dumbbell bench press stands in), and take "Lighter for the chest" from the "too
 * soon" card; in the other, "Lighter" first, then the swap (or the move).
 *
 * The rule: the report: "a set fewer and a rep more in reserve on that muscle's lifts still to come,
 * at the same loads, a rep fewer"; `lightenUnderWay`: on a lift under way "a set fewer off its sets
 * still to come, above the floor and never off a count the lifter set". The dumbbell bench press is
 * a chest lift still to come, its count the plan's, set by no one's hand.
 *
 * What happens: "Lighter" first, the bench press under way is eased (`lightenUnderWay`), two
 * back-offs 180 × 3-5 at 3, and the dumbbell bench press takes those two. The swap (or the move)
 * first, the dumbbell bench press stands in with the three sets the bench press owed, and "Lighter"
 * reaches it through the hard start's rule (`easeTake`: "never off a count ... a stopped lift handed
 * on", a rule of item 42's ninth pass for a count a hard start may have eased already): a rep more
 * in reserve, no set fewer, 3 × 3-5 at 3, while the summary says "Lighter today for the chest: 1
 * set trimmed" for the cable fly's set. The lift swapped back, or picked up at the gym
 * (`lighterPickedUp`, the fourth pass), keeps the three: the chest's main lift a set over what
 * "Lighter" gives it.
 *
 * In the build since Maintenance 33's "Lighter" (older than the fourth pass, reached by its swap back
 * and pick-up). On the previous head (3d24e37) both tests fail at the same assertions.
 *
 * Synthetic data only.
 *
 * The fix (the fifth pass): "Lighter" takes its set off a stand-in, its floor the slot's, unless an
 * ease took one from the lift it took over (`easeTake`); a lift picked up again takes it as a lift
 * under way does where no ease took one before its stop (`lighterPickedUp`).
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
    .map((set) => [set.targetReps, set.targetRir]);

/** The bench press's top set lifted, its back-offs worked out from it. */
function afterTopSet() {
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
  const done = run(
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
  return { done, options, completed, entry };
}

const lighterOn = (from: RecalibrationSuccess, options: object, extra: object = {}) =>
  run({ type: 'lighter', muscle: 'chest' }, from.workout, {
    ...options,
    ...extra,
    constraints: from.constraints,
  });

describe('"Lighter" after a lift under way is swapped or moved', () => {
  it('takes a set off what stands in for it, as before the swap', () => {
    const { done, options, completed, entry } = afterTopSet();
    // "Lighter" first, then the swap: two sets to come.
    const first = lighterOn(done, options);
    expect(toCome(bench(first.workout), completed)).toEqual([
      [[3, 5], 3],
      [[3, 5], 3],
    ]);
    const swappedAfter = run(
      { type: 'replace', entryId: entry.id, exerciseId: DB_BENCH },
      first.workout,
      {
        ...options,
        constraints: first.constraints,
      },
    );
    const expected = toCome(entryOf(swappedAfter.workout, DB_BENCH), completed);
    expect(expected).toEqual([
      [[3, 5], 3],
      [[3, 5], 3],
    ]);

    // The swap first, then "Lighter".
    const swapped = run(
      { type: 'replace', entryId: entry.id, exerciseId: DB_BENCH },
      done.workout,
      {
        ...options,
        constraints: done.constraints,
      },
    );
    const lighter = lighterOn(swapped, options);
    expect(lighter.constraints.lighter).toEqual(['chest']);
    expect(toCome(entryOf(lighter.workout, DB_BENCH), completed)).toEqual(expected);
  });

  it('takes a set off what stands in for it at another place, and back at the gym', () => {
    const { done, options, completed } = afterTopSet();
    const atHome = run({ type: 'location' }, done.workout, {
      ...options,
      location: home,
      constraints: done.constraints,
    });
    const lighter = lighterOn(atHome, options, { location: home });
    expect(toCome(entryOf(lighter.workout, DB_BENCH), completed)).toEqual([
      [[3, 5], 3],
      [[3, 5], 3],
    ]);
    const back = run({ type: 'location' }, lighter.workout, {
      ...options,
      constraints: lighter.constraints,
    });
    expect(toCome(bench(back.workout), completed)).toEqual([
      [[3, 5], 3],
      [[3, 5], 3],
    ]);
  });
});

describe('a hard start, the lift under way before it swapped', () => {
  it('takes no set off what stands in for it', () => {
    // The fifth pass's own: item 42's ninth pass, what stands in "takes no set more"; the hard
    // start never takes from a count a stopped lift handed on, one it never reached included.
    const { done, options, completed, entry } = afterTopSet();
    const others = allEntries(done.workout.blocks)
      .filter((one) => one.id !== entry.id)
      .slice(0, 2);
    const short: CompletedWork = {
      ...completed,
      sets: [
        ...completed.sets,
        ...others.map((one) => {
          const set = one.sets.find((each) => each.kind === 'working')!;
          return {
            entryId: one.id,
            exerciseId: one.exerciseId,
            setIndex: set.index,
            kind: 'working' as const,
            reps: 2,
            weight: set.targetWeight,
            rir: 0,
            completedAt: RECORD_NOW,
          };
        }),
      ],
    };
    const hard = run(
      { type: 'bad-start', low: true, lifts: others.map((one) => one.exerciseId) },
      done.workout,
      { ...options, completed: short },
    );
    expect(hard.constraints.badStart).toBe(true);
    const swapped = run(
      { type: 'replace', entryId: entry.id, exerciseId: DB_BENCH },
      hard.workout,
      { ...options, completed: short, constraints: hard.constraints },
    );
    // The bench owed its three back-offs; what stands in takes them all.
    expect(toCome(entryOf(swapped.workout, DB_BENCH), short)).toHaveLength(3);
  });
});
