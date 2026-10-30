import { describe, expect, it } from 'vitest';
import { emptyConstraints } from '../../engine/recalibration/recalibrate';
import { record } from '../../test/records';
import { BENCH, DB_BENCH, bench, entryOf, plan, run, shape, trained } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the first review of round N): a main lift cut to its top set
 * alone keeps it as its top set, and the drop, through a refit (a plate missing, a max entered, a
 * swap), so a set added after is a back-off at the drop; and the day's "Make it easier" holds on
 * it, a top set alone reading a rep under the day's reserve. Synthetic data only.
 */

describe('a main lift cut to its top set alone, then refitted, the first review of round N', () => {
  it('keeps its top set, and a set added after is still a back-off at the drop', () => {
    let trimmed = { workout: plan(), constraints: emptyConstraints() };
    const id = bench(trimmed.workout).id;
    for (let taken = 0; taken < 3; taken += 1) {
      trimmed = run({ type: 'sets', entryId: id, workingDelta: -1 }, trimmed.workout, {
        constraints: trimmed.constraints,
      });
    }
    expect(shape(bench(trimmed.workout))).toEqual([[190, 1, 'top']]);
    expect(bench(trimmed.workout).backOffDrop).toBe(0.05);

    // A 35 lb plate missing today: 190 and 180 are still made (the round's own test).
    const loading = { missingPlates: [35] };
    const refit = run({ type: 'loading' }, trimmed.workout, {
      constraints: trimmed.constraints,
      loading,
    });
    expect(shape(bench(refit.workout))).toEqual([[190, 1, 'top']]);
    expect(bench(refit.workout).backOffDrop).toBe(0.05);

    const added = run({ type: 'sets', entryId: id, workingDelta: 1 }, refit.workout, {
      constraints: refit.constraints,
      loading,
    });
    expect(shape(bench(added.workout))).toEqual([
      [190, 1, 'top'],
      [180, 2, 'back-off'],
    ]);
  });

  it('keeps the day’s "Make it easier" on it through a refit', () => {
    let state = run({ type: 'intensity', direction: 'easier' }, plan());
    expect(shape(bench(state.workout))[0]).toEqual([190, 2, 'top']);
    const id = bench(state.workout).id;
    while (shape(bench(state.workout)).length > 1) {
      state = run({ type: 'sets', entryId: id, workingDelta: -1 }, state.workout, {
        constraints: state.constraints,
      });
    }
    expect(shape(bench(state.workout))).toEqual([[190, 2, 'top']]);
    const refit = run({ type: 'loading' }, state.workout, {
      constraints: state.constraints,
      loading: { missingPlates: [35] },
    });
    // Still a day made easier: the top set two short of failure.
    expect(shape(bench(refit.workout))[0]?.[1]).toBe(2);
  });
});

describe('a main lift cut to its top set alone, then swapped or given a max, the first review of round N', () => {
  /** The bench press and the dumbbell bench press, each with two clean straight sessions. */
  const history = () => [
    ...trained(),
    ...[8, 4].map((daysAgo) =>
      record(
        daysAgo,
        DB_BENCH,
        [
          [5, 70, 2],
          [5, 70, 2],
          [5, 70, 2],
        ],
        [4, 6],
        2,
      ),
    ),
  ];
  function topAlone() {
    let state = { workout: plan(history()), constraints: emptyConstraints() };
    const id = bench(state.workout).id;
    while (shape(bench(state.workout)).length > 1) {
      state = run({ type: 'sets', entryId: id, workingDelta: -1 }, state.workout, {
        constraints: state.constraints,
        history: history(),
      });
    }
    return state;
  }

  it('a swap keeps the set a top set, with the drop', () => {
    const state = topAlone();
    const swapped = run(
      { type: 'replace', entryId: bench(state.workout).id, exerciseId: DB_BENCH },
      state.workout,
      { constraints: state.constraints, history: history() },
    );
    const stand = entryOf(swapped.workout, DB_BENCH);
    expect(shape(stand).map((set) => [set[1], set[2]])).toEqual([[1, 'top']]);
    expect(stand.backOffDrop).toBe(0.05);
  });

  it('a max entered keeps the set a top set, with the drop', () => {
    const state = topAlone();
    const entered = run({ type: 'max', exerciseId: BENCH }, state.workout, {
      constraints: state.constraints,
      history: history(),
    });
    expect(shape(bench(entered.workout)).map((set) => [set[1], set[2]])).toEqual([[1, 'top']]);
    expect(bench(entered.workout).backOffDrop).toBe(0.05);
  });
});
