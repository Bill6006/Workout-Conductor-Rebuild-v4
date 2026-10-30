import { describe, expect, it } from 'vitest';
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
  trained,
} from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * The fifth adversarial review of Maintenance 33: "Lighter" taken before the top set, the lift
 * stopped at a place and picked up again back at the gym, comes back eased twice.
 *
 * Steps: a hybrid lifter's push day, the bench press on a top set (190 × 4-6 at 1 in reserve) and
 * three back-offs (180 × 4-6 at 2). Before the start the "too soon" card offers "Lighter for the
 * chest" and they take it: the bench press keeps its loads, a set fewer and a rep more in reserve,
 * its top set 3-5 at 2, its two back-offs 180 × 3-5 at 3. They lift the top set (4 reps at 2) and
 * move to the home place, which has no barbell: the bench press stops at its top set and the
 * dumbbell bench press stands in (3-5 at 3, as eased). Back at the gym, before a set of it, the
 * bench press picks up again.
 *
 * The rule: the report: "a set fewer and a rep more in reserve on that muscle's lifts still to
 * come, at the same loads, a rep fewer"; the fourth pass's own fix of the same steps by a swap and a
 * swap back ("a swap back works out what the lift owes from the plan's own top set where the ease
 * changed the one it shows, and eases it once"), and `lighterPickedUp`'s comment: "what it owes comes
 * back eased as it went".
 *
 * What happens: the generator's pick-up builds the back-offs from the top set as it shows (`reopened`
 * in generate.ts), and that top set carries "Lighter" already, so they come back 3-5 at 3, the ease;
 * the fourth pass's `lighterPickedUp` then eases them again: 180 × 2-4 at 4, two reps under the plan's
 * and two more in reserve, where they went 3-5 at 3. It is the fourth review's "came back twice
 * after a swap back", fixed for the swap back (`planTop`) and brought to the place by the fix for
 * the pick-up.
 *
 * On the previous head (3d24e37) this test passes: the pick-up, with no ease laid on it, read the
 * eased top set and gave 3-5 at 3 (it lost the record, the fourth review's other finding). A
 * regression of the fourth pass.
 *
 * Synthetic data only.
 *
 * The fix (the fifth pass): "Lighter" laid on a lift picked up again gives its back-offs the reps
 * and reserve of the plan's own top set first, as a swap back does, so the ease is laid once.
 */

const profile = profileOf('hybrid');
const history = trained();

const backOffs = (entry: WorkoutEntry) =>
  entry.sets
    .filter((set) => set.tier === 'back-off')
    .map((set) => [set.targetWeight, set.targetReps, set.targetRir]);

describe('"Lighter" taken before the top set, home and back to the gym', () => {
  it('picks the bench press up again eased once, as it went', () => {
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
    const options = { profile, history, completed, currentEntryId: eased.id };
    const away = run({ type: 'location' }, lighter.workout, {
      ...options,
      location: home,
      constraints: lighter.constraints,
    });
    // At home the dumbbell bench press stands in, eased as "Lighter" eases it.
    expect(
      entryOf(away.workout, DB_BENCH)
        .sets.filter((set) => set.kind === 'working')
        .map((set) => [set.targetReps, set.targetRir]),
    ).toEqual([
      [[3, 5], 3],
      [[3, 5], 3],
    ]);
    const back = run({ type: 'location' }, away.workout, {
      ...options,
      constraints: away.constraints,
    });
    expect(back.constraints.lighter).toEqual(['chest']);
    expect(backOffs(entryOf(back.workout, BENCH))).toEqual(backOffs(eased));
  });
});
