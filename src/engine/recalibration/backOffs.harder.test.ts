import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import type { GeneratedWorkout } from '../../engine/workout/types';
import { RECORD_NOW, record } from '../../test/records';
import {
  BENCH,
  DB_BENCH,
  bench,
  entryOf,
  plan,
  run,
  shape,
  topDone,
  trained,
} from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11, under "Make it harder" (the first review of round N): a main
 * lift's back-offs go to 1 in reserve, its top set staying at 1, never failure: a back-off's
 * reserve is its top set's plus the gap the day leaves between them. Synthetic data only.
 */

describe('"Make it harder" on a main lift on top set plus back-offs, the first review of round N', () => {
  it('takes the back-offs to 1 in reserve, the top set staying at 1', () => {
    const plain = plan();
    expect(shape(bench(plain)).map((set) => set[1])).toEqual([1, 2, 2, 2]);
    const harder = run({ type: 'intensity', direction: 'harder' }, plain);
    const sets = shape(bench(harder.workout));
    // The top set stays at 1: never failure.
    expect(sets[0]).toEqual([expect.any(Number), 1, 'top']);
    // The back-offs take the day's reserve, one rep less than the plain day's 2.
    expect(sets.slice(1).map((set) => [set[1], set[2]])).toEqual(
      sets.slice(1).map(() => [1, 'back-off']),
    );
  });
});

describe('"Make it harder" through every change to the plan, the first review of round N', () => {
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
  const harderDay = () =>
    run({ type: 'intensity', direction: 'harder' }, plan(history()), {
      history: history(),
    });
  /** Each working set's reserve and tier. */
  const reserves = (workout: GeneratedWorkout, exerciseId = BENCH) =>
    shape(entryOf(workout, exerciseId)).map((set) => [set[1], set[2]]);
  /** The top set at 1, the back-offs at 1: "Make it harder" (which adds a set here). */
  const isHarder = (workout: GeneratedWorkout, exerciseId = BENCH) => {
    const sets = reserves(workout, exerciseId);
    expect(sets.length).toBeGreaterThan(1);
    expect(sets).toEqual([[1, 'top'], ...sets.slice(1).map(() => [1, 'back-off'])]);
  };

  it('a refit (a plate missing today)', () => {
    const harder = harderDay();
    isHarder(harder.workout);
    const refit = run({ type: 'loading' }, harder.workout, {
      constraints: harder.constraints,
      history: history(),
      loading: { missingPlates: [35] },
    });
    isHarder(refit.workout);
  });

  it('a max entered', () => {
    const harder = harderDay();
    const entered = run({ type: 'max', exerciseId: BENCH }, harder.workout, {
      constraints: harder.constraints,
      history: history(),
    });
    isHarder(entered.workout);
  });

  it('a swap before a set', () => {
    const harder = harderDay();
    const swapped = run(
      { type: 'replace', entryId: bench(harder.workout).id, exerciseId: DB_BENCH },
      harder.workout,
      { constraints: harder.constraints, history: history() },
    );
    isHarder(swapped.workout, DB_BENCH);
  });

  it('a set added after a top set alone, the top set done', () => {
    let state = harderDay();
    const id = bench(state.workout).id;
    while (shape(bench(state.workout)).length > 1) {
      state = run({ type: 'sets', entryId: id, workingDelta: -1 }, state.workout, {
        constraints: state.constraints,
        history: history(),
      });
    }
    const done = topDone(bench(state.workout), 190);
    const added = run({ type: 'sets', entryId: id, workingDelta: 1 }, state.workout, {
      constraints: state.constraints,
      history: history(),
      completed: done,
    });
    expect(reserves(added.workout)).toEqual([
      [1, 'top'],
      [1, 'back-off'],
    ]);
  });

  it('picked up again after its top set, back at the gym', () => {
    const [bare] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['pull-up-bar'] },
      RECORD_NOW,
    );
    const harder = harderDay();
    const done = topDone(bench(harder.workout), 190);
    const away = run({ type: 'location' }, harder.workout, {
      location: bare,
      completed: done,
      currentEntryId: bench(harder.workout).id,
      constraints: harder.constraints,
      history: history(),
    });
    const back = run({ type: 'location' }, away.workout, {
      completed: done,
      constraints: away.constraints,
      history: history(),
    });
    const owed = shape(bench(back.workout)).filter((set) => set[2] !== 'top');
    expect(owed.length).toBeGreaterThan(0);
    expect(owed.map((set) => [set[1], set[2]])).toEqual(owed.map(() => [1, 'back-off']));
  });
});
