import { describe, expect, it } from 'vitest';
import {
  BENCH,
  DB_BENCH,
  bench,
  entryOf,
  home,
  loggedOne,
  plan,
  run,
  shape,
} from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the first review of round N): a main lift stopped before its
 * top set was done and picked up again, back at the gym or swapped back to, takes its top set and
 * back-offs, as the same lift fresh on the same day does. Synthetic data only.
 */

const structure = [
  [190, 1, 'top'],
  [180, 2, 'back-off'],
  [180, 2, 'back-off'],
  [180, 2, 'back-off'],
];

function rampDone() {
  const workout = plan();
  const entry = bench(workout);
  expect(shape(entry)).toEqual(structure);
  const ramp = entry.sets.find((set) => set.kind === 'warmup');
  if (!ramp) throw new Error('no ramp');
  return { workout, entry, done: loggedOne(entry, ramp.index, ramp.targetWeight, 'warmup') };
}

describe('a main lift picked up again before its top set, the first review of round N', () => {
  it('back at the gym, takes its top set and back-offs', () => {
    const { workout, entry, done } = rampDone();
    const away = run({ type: 'location' }, workout, {
      location: home,
      completed: done,
      currentEntryId: entry.id,
    });
    expect(
      away.workout.blocks.flatMap((block) => block.entries).find((e) => e.id === entry.id)?.stopped,
    ).toBeDefined();
    const back = run({ type: 'location' }, away.workout, {
      completed: done,
      constraints: away.constraints,
    });
    expect(shape(bench(back.workout))).toEqual(structure);
  });

  it('swapped back to, takes its top set and back-offs', () => {
    const { workout, entry, done } = rampDone();
    const swapped = run({ type: 'replace', entryId: entry.id, exerciseId: DB_BENCH }, workout, {
      completed: done,
      currentEntryId: entry.id,
    });
    const stand = entryOf(swapped.workout, DB_BENCH);
    const back = run({ type: 'replace', entryId: stand.id, exerciseId: BENCH }, swapped.workout, {
      completed: done,
      constraints: swapped.constraints,
    });
    expect(shape(bench(back.workout))).toEqual(structure);
  });
});
