import { describe, expect, it } from 'vitest';
import { startedMain } from '../../test/startedMain';

/**
 * The fourteenth review of round N. The thirteenth pass gave a lift picked up again its top set's
 * own reps (`ownRepsOf(top, manual.reps)`: those it asks where a stand-in for the weights here added
 * reps, "reps set by hand the lifter's"). The mark of reps set by hand is the lift's, not the top
 * set's: a rep range set after the top set was lifted reaches only the back-offs still to come, and
 * the top set keeps the stand-in's reps. With the mark on, `ownRepsOf` takes the top set's shown
 * reps as the lifter's, so a lift picked up again (home and back, or swapped away and back: the
 * generator's pick-up and `swapBack`'s `asBackOffs`, both before `withoutHandTargets` drops the mark)
 * gives its back-offs the reps the stand-in added, 5-7: neither the lifter's 6-8, nor the 4-6 the
 * top set asks, which the pick-up's own rule leaves them ("a lift picked up again drops both", the
 * twelfth review; the reps set by hand go, `withoutHandTargets`).
 *
 * The rules (docs/reports/maintenance-32.md): the twelfth pass, "at their own reps, never a
 * stand-in's (item 11; ... the owner's "same reps")"; the thirteenth, "They take the top set's own
 * reps, and reps set by hand are the lifter's (`ownRepsOf`)"; the thirteenth review's own finding,
 * "a set added, and back-offs picked up again, took the reps a top set standing in added".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. A ramp logged; the
 * 2.5 lb plates marked missing (the top set stands in at 135 × 5-7 for 140 × 4-6); the top set lifted
 * as shown, 135 × 6 at 1 (back-offs 125 × 4-6); the rep range set to 6-8 for the sets still to come
 * (back-offs 125 × 6-8); then home and back to the gym, or the lift swapped for the dumbbell row and
 * back.
 *
 * What happens at d06edb5 (and at 270f40e, where every pick-up took the top set's shown reps): the
 * back-offs picked up again at 125 × 5-7.
 *
 * The fix (the fourteenth pass): picked up again, the lift drops the reps set by hand, so its
 * back-offs take the top set's reps as the plan has them (`ownRepsOf(top, false)`), in both pick-up
 * paths. Synthetic data only.
 */

async function repsSetAfterAStandInTopSet() {
  const started = await startedMain();
  const { store, main, toCome, repsToCome } = started;
  const ramp = main().sets.find((set) => set.kind === 'warmup')!;
  await store.logSet(main().id, ramp.index, { weight: ramp.targetWeight, reps: 5, rir: 5 });
  await store.setMissingPlates([2.5]);
  const top = main().sets.find((set) => set.tier === 'top')!;
  expect([top.targetWeight, top.targetReps, top.asked?.reps]).toEqual([135, [5, 7], [4, 6]]);
  await store.logSet(main().id, top.index, { weight: 135, reps: 6, rir: 1 });
  await store.recalibrate({ type: 'rep-range', entryId: main().id, reps: [6, 8] });
  expect(toCome()).toEqual([125, 125, 125]);
  expect(repsToCome()).toEqual([
    [6, 8],
    [6, 8],
    [6, 8],
  ]);
  // The top set, lifted before the reps were set, keeps the stand-in's.
  expect(main().sets.find((set) => set.tier === 'top')?.targetReps).toEqual([5, 7]);
  return started;
}

/** The plan's reps, or the lifter's: never the rep a stand-in for the weights here added. */
const OWN: number[][] = [
  [4, 6],
  [6, 8],
];

describe('back-offs picked up again after reps set by hand under a top set standing in', () => {
  it('home and back: never at the reps the stand-in added', async () => {
    const { repsToCome, toCome, homeAndBack } = await repsSetAfterAStandInTopSet();
    await homeAndBack();
    expect(toCome().length).toBeGreaterThan(0);
    // At d06edb5: [5, 7] on each.
    for (const reps of repsToCome()) expect(OWN).toContainEqual(reps);
  });

  it('swapped away and back: never at the reps the stand-in added', async () => {
    const { repsToCome, toCome, swapAwayAndBack } = await repsSetAfterAStandInTopSet();
    await swapAwayAndBack();
    expect(toCome().length).toBeGreaterThan(0);
    // At d06edb5: [5, 7] on each.
    for (const reps of repsToCome()) expect(OWN).toContainEqual(reps);
  });
});
