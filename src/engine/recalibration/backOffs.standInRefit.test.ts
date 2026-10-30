import { describe, expect, it } from 'vitest';
import { record } from '../../test/records';
import {
  DB_BENCH,
  bench,
  entryOf,
  home,
  plan,
  run,
  shape,
  topDone,
  trained,
} from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the second review of round N): a lift standing in for a main
 * lift stopped after its top set carries straight sets through every later change, a refit and a
 * max entered included, having no top set of its own. Synthetic data only.
 */

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

/** The bench press's top set done at the gym, then home: the dumbbell bench press stands in. */
function standingIn() {
  const workout = plan(history());
  const entry = bench(workout);
  const done = topDone(entry, 190);
  const away = run({ type: 'location' }, workout, {
    location: home,
    history: history(),
    completed: done,
    currentEntryId: entry.id,
  });
  const stand = entryOf(away.workout, DB_BENCH);
  // Straight, as the first review left it.
  expect(shape(stand).every((set) => set[2] === 'straight')).toBe(true);
  return { away, done };
}

describe('a lift standing in for a main lift stopped after its top set, the second review of round N', () => {
  it('stays on straight sets through a refit (a plate marked missing)', () => {
    const { away, done } = standingIn();
    const refit = run({ type: 'loading' }, away.workout, {
      location: home,
      history: history(),
      completed: done,
      constraints: away.constraints,
      loading: { missingPlates: [2.5] },
    });
    const stand = entryOf(refit.workout, DB_BENCH);
    expect(shape(stand).every((set) => set[2] === 'straight')).toBe(true);
    expect(stand.backOffDrop).toBeUndefined();
  });

  it('stays on straight sets when a max is entered for it', () => {
    const { away, done } = standingIn();
    const maxed = run({ type: 'max', exerciseId: DB_BENCH }, away.workout, {
      location: home,
      history: history(),
      completed: done,
      constraints: away.constraints,
    });
    const stand = entryOf(maxed.workout, DB_BENCH);
    expect(shape(stand).every((set) => set[2] === 'straight')).toBe(true);
    expect(stand.backOffDrop).toBeUndefined();
  });
});
