import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { PLATES_KEY, fitWeight, loadingFor } from '../loading/loading';
import { barWeightFor } from '../progression/startingLoad';
import { emptyCompleted, planUnderTheEase } from './recalibrate';
import type { CompletedWork } from './types';
import { allEntries, type WorkoutEntry } from '../workout/types';
import { BENCH, bench, gym, plan, run } from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * The fourteenth review of round N, where it meets item 42 (Maintenance 26). A lift that keeps a
 * hard start's ease keeps its record, the plan before the ease, for a saved copy, which gives the
 * plan back; a change of weights fits that record to the weights here too (`refitEntry`: "Its record
 * is fitted to the weights here too, so a copy saved after gives the plan back at this place (the
 * tenth pass: it gave back the last place's weights)"). That fit is in the branch for a lift fitted
 * in place. The thirteenth pass of round N sends a main lift on top set plus back-offs that is under
 * way before its top set (or keeps the ease) through the back-offs' branch instead, which returns
 * before the record is fitted: the copy gives back a top set the place cannot make.
 *
 * The rules: the tenth pass of item 42, above; the thirteenth review of round N, "A lift fitted in
 * place fits its back-offs so, never as stand-ins" (the lift fitted in place, its record with it).
 *
 * Steps: the main lift (bench press) planned at 190 × 4-6 at 1, back-offs 3 × 180. The next two lifts
 * fall well short (a hard start): the bench, not begun, is eased (185 at 2, back-offs 175 at 3), its
 * record the plan. A ramp of it logged and a change made (a pin): it keeps the ease. The gym's rack
 * then has no 2.5 lb plates (190 cannot be made; 185 can); a saved copy is made.
 *
 * What happens at d06edb5: the copy's bench at 190 × 4-6 and 3 × 180, as before the change of
 * weights. At 270f40e its record was fitted (185 standing in for 190).
 *
 * The fix (the fourteenth pass): the record is fitted as the lift is on both of `refitEntry`'s
 * branches (`refitRecord`), its back-offs at the drop. Synthetic data only.
 */

/** A gym whose rack has no 2.5 lb plates. */
const noSmallPlates = {
  ...gym,
  loading: {
    ...gym.loading,
    [PLATES_KEY]: { kind: 'plates' as const, perSide: [45, 35, 25, 10, 5] },
  },
};

function logOf(entry: WorkoutEntry, kind: 'working' | 'warmup', reps: number, rir: number) {
  const set = entry.sets.find((each) => each.kind === kind)!;
  return {
    entryId: entry.id,
    exerciseId: entry.exerciseId,
    setIndex: set.index,
    kind,
    reps,
    weight: set.targetWeight,
    rir,
    completedAt: RECORD_NOW,
  };
}

describe('a main lift keeping a hard start’s ease, under way before its top set, new weights', () => {
  it('gives a copy its plan on weights the place makes', () => {
    const workout = plan();
    const others = allEntries(workout.blocks)
      .filter((entry) => entry.exerciseId !== BENCH)
      .slice(0, 2);
    const short: CompletedWork = {
      ...emptyCompleted(),
      startedAt: RECORD_NOW,
      currentEntryId: others[0]!.id,
      sets: others.map((entry) => logOf(entry, 'working', 2, 0)),
    };
    const hard = run(
      { type: 'bad-start', low: true, lifts: others.map((entry) => entry.exerciseId) },
      workout,
      { completed: short },
    );
    const eased = bench(hard.workout);
    expect(eased.eased?.sets?.find((set) => set.tier === 'top')?.targetWeight).toBe(190);
    const begun: CompletedWork = { ...short, sets: [...short.sets, logOf(eased, 'warmup', 5, 5)] };
    const pinned = run({ type: 'pin', entryId: eased.id, pinned: true }, hard.workout, {
      completed: begun,
      constraints: hard.constraints,
    });
    expect(bench(pinned.workout).eased?.kept).toBe(true);
    const moved = run({ type: 'loading' }, pinned.workout, {
      completed: begun,
      constraints: pinned.constraints,
      location: noSmallPlates,
    });
    const loading = loadingFor(
      noSmallPlates.loading,
      { missingPlates: [] },
      requireExercise(BENCH),
      'lb',
    );
    const floor = barWeightFor(requireExercise(BENCH), 'lb');
    expect(fitWeight(190, loading, floor)).toBe(185);
    const copy = bench(planUnderTheEase(moved.workout));
    const loads = copy.sets
      .filter((set) => set.kind === 'working')
      .map((set) => set.targetWeight as number);
    // At d06edb5: [190, 180, 180, 180], the plan at the gym's old rack.
    expect({ unmade: loads.filter((load) => fitWeight(load, loading, floor) !== load) }).toEqual({
      unmade: [],
    });
  });
});
