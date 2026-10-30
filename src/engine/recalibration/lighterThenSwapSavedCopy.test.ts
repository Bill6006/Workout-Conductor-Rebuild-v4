import { describe, expect, it } from 'vitest';
import { planUnderTheEase } from './recalibrate';
import type { CompletedWork, RecalibrationSuccess } from './types';
import type { GeneratedWorkout } from '../workout/types';
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
 * The fifth adversarial review of Maintenance 33: a workout saved after "Lighter" eased the lift under
 * way, which was then swapped out (or stopped at a place), keeps the set "Lighter" took.
 *
 * Steps: a hybrid lifter's push day, the bench press on a top set (190 × 4-6 at 1 in reserve) and
 * three back-offs (180 × 4-6 at 2). They lift the top set (5 reps at 190) and take "Lighter for the
 * chest": two back-offs to come, 3-5 at 3. They swap the bench press for the dumbbell bench press (or
 * move to the home place, which has no barbell, where the dumbbell bench press stands in), and save
 * the workout ("Save today's workout"). The same steps without "Lighter", for the plan.
 *
 * The rule: `planUnderTheEase`: "A saved workout is a plan for another day, and the ease was
 * today's"; the fourth pass's own test of a lift home and back ("gives a saved copy the plan back, as
 * the same steps without 'Lighter' do"); the third review's finding of the same with a swap back ("a
 * workout saved after 'Lighter', a swap and a swap back kept the bench press with its top set alone
 * ..., where the same steps without 'Lighter' kept its back-offs").
 *
 * What happens: the stand-in comes in with the two sets the eased bench press owed, and its own
 * record (`eased`, laid when "Lighter" reached it) holds those two, so the copy gives it back two;
 * the bench press's own record of the plan (`stopped.record`, kept for a swap back alone) is never
 * read, and the copy, laying the stopped lift's sets onto what stood in for it (`withoutStops`),
 * holds the dumbbell bench press at 3 × 60 × 4-6 at 2 where the same steps without "Lighter" give 4:
 * a set of the chest's main lift lost for every later day the copy is used.
 *
 * In the build since the third pass (older than the fourth pass, whose fix of a copy saved after a
 * lift went home and came back it sits beside). On the previous head (3d24e37) both tests fail the
 * same way.
 *
 * Synthetic data only.
 *
 * The fix (the fifth pass): a copy gives what stood in for a lift "Lighter" eased under way the sets
 * the ease took (`withLighterTaken`), as the lift's record of the plan, marked the lighter option's,
 * holds them.
 */

const profile = profileOf('hybrid');
const history = trained();

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
  return { done, options, entry };
}

const copied = (workout: GeneratedWorkout) => shape(entryOf(planUnderTheEase(workout), DB_BENCH));

describe('a workout saved after "Lighter" and a swap of the lift under way', () => {
  for (const [label, away] of [
    [
      'swapped',
      (from: RecalibrationSuccess, options: object, entryId: string) =>
        run({ type: 'replace', entryId, exerciseId: DB_BENCH }, from.workout, {
          ...options,
          constraints: from.constraints,
        }),
    ],
    [
      'stopped at another place',
      (from: RecalibrationSuccess, options: object) =>
        run({ type: 'location' }, from.workout, {
          ...options,
          location: home,
          constraints: from.constraints,
        }),
    ],
  ] as const) {
    it(`gives the copy the plan back, the lift ${label}`, () => {
      const { done, options, entry } = afterTopSet();
      const control = copied(away(done, options, entry.id).workout);
      expect(control.length).toBe(4);
      const lighter = run({ type: 'lighter', muscle: 'chest' }, done.workout, {
        ...options,
        constraints: done.constraints,
      });
      const after = away(lighter, options, entry.id);
      expect(after.constraints.lighter).toEqual(['chest']);
      expect(copied(after.workout)).toEqual(control);
    });
  }
});
