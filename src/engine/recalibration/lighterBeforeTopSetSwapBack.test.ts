import { describe, expect, it } from 'vitest';
import type { CompletedWork } from './types';
import type { WorkoutEntry } from '../workout/types';
import {
  BENCH,
  DB_BENCH,
  bench,
  entryOf,
  plan,
  profileOf,
  run,
  trained,
} from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * The fourth adversarial review of Maintenance 33: a lift "Lighter" eased before its top set,
 * swapped out and back, comes back eased twice.
 *
 * Steps: a hybrid lifter's push day, the bench press on a top set (190 × 4-6 at 1 in reserve) and
 * three back-offs (180 × 4-6 at 2). Before the start the "too soon" card offers "Lighter for the
 * chest" and they take it: the bench press keeps its loads, a set fewer and a rep more in reserve,
 * its top set 3-5 at 2, its two back-offs 3-5 at 3. They lift the top set (4 reps at 2), swap the
 * bench press for the dumbbell bench press, and swap back.
 *
 * The rule: the card's own words, "Lighter keeps the loads: a set fewer and a rep more in reserve on
 * its lifts today" (the report: "a set fewer and a rep more in reserve on that muscle's lifts still
 * to come, at the same loads, a rep fewer"); the second review's fix, `swapBack`: "what it owes comes
 * back eased as it went, its loads kept".
 *
 * What happens: what the bench press owes is worked out from its top set as it shows (`asBackOffs`:
 * the top set's own reps, `ownRepsOf`, and a reserve from its reserve, `backOffRir`), and that top
 * set carries "Lighter" already: 3-5 at 3 is the ease. `swapBack` then eases them again, so the
 * back-offs come back 2-4 at 4, two reps under the plan's and two more in reserve, where they went
 * 3-5 at 3. (Taken after the top set, "Lighter" comes back once: the top set then carries none.) In
 * the build before the third review too (9580f26).
 *
 * The fix (the fourth pass): a swap back works out what the lift owes from the plan's own top set
 * where the ease changed the one it shows (`asBackOffs`'s `planTop`), and eases it once.
 *
 * Synthetic data only.
 */

const profile = profileOf('hybrid');
const history = trained();

const backOffs = (entry: WorkoutEntry) =>
  entry.sets
    .filter((set) => set.tier === 'back-off')
    .map((set) => [set.targetWeight, set.targetReps, set.targetRir]);

describe('"Lighter" taken before the top set, the lift swapped out and back', () => {
  it('comes back eased once, as it went', () => {
    const lighter = run({ type: 'lighter', muscle: 'chest' }, plan(history, profile), {
      profile,
      history,
    });
    const eased = bench(lighter.workout);
    expect(backOffs(eased)).toEqual([
      [180, [3, 5], 3],
      [180, [3, 5], 3],
    ]);
    const top = eased.sets.find((set) => set.tier === 'top')!;
    expect([top.targetReps, top.targetRir]).toEqual([[3, 5], 2]);
    const completed: CompletedWork = {
      startedAt: RECORD_NOW,
      elapsedSeconds: 0,
      currentEntryId: eased.id,
      sets: [
        {
          entryId: eased.id,
          exerciseId: BENCH,
          setIndex: top.index,
          kind: 'working',
          reps: 4,
          weight: top.targetWeight,
          rir: 2,
          completedAt: RECORD_NOW,
        },
      ],
    };
    const options = { profile, history, completed, constraints: lighter.constraints };
    const away = run(
      { type: 'replace', entryId: eased.id, exerciseId: DB_BENCH },
      lighter.workout,
      options,
    );
    const stand = entryOf(away.workout, DB_BENCH);
    const back = run({ type: 'replace', entryId: stand.id, exerciseId: BENCH }, away.workout, {
      ...options,
      constraints: away.constraints,
    });
    expect(backOffs(entryOf(back.workout, BENCH))).toEqual(backOffs(eased));
  });
});
