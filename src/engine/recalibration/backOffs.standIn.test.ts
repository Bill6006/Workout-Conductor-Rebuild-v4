import { describe, expect, it } from 'vitest';
import { record } from '../../test/records';
import {
  BENCH,
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
 * Maintenance 32, the owner's item 11 (the first review of round N): a lift standing in for a main
 * lift carries straight sets, having no top set of its own (a judgement the round made), whether a
 * swap or a change of place brings it in. Synthetic data only.
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

describe('a stand-in after the top set, the first review of round N', () => {
  it('carries straight sets when a swap brings it in (as agreed)', () => {
    const workout = plan(history());
    const entry = bench(workout);
    const swap = run({ type: 'replace', entryId: entry.id, exerciseId: DB_BENCH }, workout, {
      history: history(),
      completed: topDone(entry, 190),
      currentEntryId: entry.id,
    });
    const stand = entryOf(swap.workout, DB_BENCH);
    expect(shape(stand).every((set) => set[2] === 'straight')).toBe(true);
    expect(stand.backOffDrop).toBeUndefined();
  });

  it('carries straight sets when a change of place brings it in', () => {
    const workout = plan(history());
    const entry = bench(workout);
    const away = run({ type: 'location' }, workout, {
      location: home,
      history: history(),
      completed: topDone(entry, 190),
      currentEntryId: entry.id,
    });
    // The barbell bench press stopped at its top set; the dumbbell bench press stands in at home.
    expect(
      away.workout.blocks
        .flatMap((block) => block.entries)
        .some((e) => e.exerciseId === BENCH && e.stopped),
    ).toBe(true);
    const stand = entryOf(away.workout, DB_BENCH);
    expect(shape(stand)).toEqual(shape(stand).map(() => [expect.any(Number), 2, 'straight']));
    expect(stand.backOffDrop).toBeUndefined();
  });
});
