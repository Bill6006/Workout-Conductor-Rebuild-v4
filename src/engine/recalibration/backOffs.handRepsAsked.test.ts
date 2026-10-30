import { describe, expect, it } from 'vitest';
import { backOffsReplayed } from '../progression/backOffs';
import type { SetPrescription, WorkoutEntry } from '../workout/types';
import { BENCH, bench, entryOf, plan, profileOf, run, topDone } from '../../test/backOffs';

/**
 * The thirteenth review of round N: reps set by hand are the lifter's (Maintenance 23, "Reps set by
 * hand are the lifter's: they stay, and only the load is fitted"), on a back-off that stood in for a
 * load too (`asked`, the twelfth pass's record of what the plan asked of a stand-in). A refit of the
 * back-offs, and every replay of them, gives a stand-in the reps of the load it stood in for, and
 * the lifter's reps where they were set by hand (`ownRepsOf`).
 *
 * Steps: a hybrid lifter's push day, the bench press's top set logged at 190; its back-offs still to
 * come standing in for 180 × 4-6 at 5-7 (the reps a stand-in adds). The rep range set to 8-10 by
 * hand (`rep-range`, which fits the lift again through `refitEntry`); or the back-offs replayed
 * (`backOffsReplayed`) with the reps set by hand or not. Synthetic data only.
 */

const profile = profileOf('hybrid');

/** The bench's back-offs still to come as stand-ins for 180 × 4-6, at 5-7, reps by hand or not. */
function standIns(handReps: boolean) {
  const workout = plan(undefined, profile);
  const entry = bench(workout);
  const completed = topDone(entry, 190);
  entry.sets = entry.sets.map((set): SetPrescription =>
    set.tier === 'back-off'
      ? {
          ...set,
          targetReps: handReps ? [8, 10] : [5, 7],
          asked: { weight: 180, reps: [4, 6] },
        }
      : set,
  );
  if (handReps) entry.manual = { ...entry.manual, reps: true };
  return { workout, entry, completed };
}

const backOffReps = (entry: WorkoutEntry) =>
  entry.sets
    .filter((set) => set.tier === 'back-off')
    .map((set) => `${set.targetReps.join('-')}${set.asked ? ' asked' : ''}`);

describe('reps set by hand on back-offs that stood in for a load', () => {
  it('stay through the refit a rep range set by hand runs', () => {
    const { workout, entry, completed } = standIns(false);
    const set = run({ type: 'rep-range', entryId: entry.id, reps: [8, 10] }, workout, {
      completed,
      profile,
    });
    expect(backOffReps(entryOf(set.workout, BENCH))).toEqual(['8-10', '8-10', '8-10']);
  });

  it('stay through a replay of the back-offs', () => {
    for (const handReps of [true, false]) {
      const { entry } = standIns(handReps);
      const replayed = backOffsReplayed(entry.sets, 180, () => null, {
        step: 5,
        floor: 45,
        loading: null,
        top: 190,
        handReps,
      });
      expect({ handReps, reps: backOffReps({ ...entry, sets: replayed }) }).toEqual({
        handReps,
        reps: Array(3).fill(handReps ? '8-10' : '4-6'),
      });
    }
  });
});
