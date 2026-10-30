import { describe, expect, it } from 'vitest';
import { startedMain } from '../../test/startedMain';

/**
 * The fourteenth review of round N. A top set standing in for the weights here (the 2.5 lb plates
 * missing: 135 × 5-7 for 140 × 4-6) lifted at the load it asks, 140, answers to the range it asks
 * (Maintenance 23's `outcomeFor`: "A set the weights at a place pushed, lifted at the load it stood
 * in for or heavier, answers to the range asked, as the history reads it: nothing was pushed"). The
 * store's follow reads it so (`planAfter`): 140 × 4 at 0 is on the floor of 4-6, no step, and the
 * back-offs stay at 135, the drop off 140. Every replay of the engine reads it against the
 * stand-in's 5-7 instead: `backOffLoadAfter`, given no reading (`afterTopSet`: a refit, a set added,
 * a rep range set; the generator's pick-up), builds its own from `top.targetReps`, so 4 reps is a
 * grind under a floor of 5 and the back-offs come down a step, to 125, 11% under the top set as
 * lifted, a load the saved session's drop load (`backOffAt`, 135) then passes over.
 *
 * The rules (docs/reports/maintenance-32.md): the twelfth pass, "The back-offs take one rule
 * wherever their load is worked out, the refit for the place's weights included: the drop off the
 * top set as lifted ... never a stand-in's"; the thirteenth, "a top set still to come gives its
 * back-offs the drop off the load it asks ... never the stand-in's"; item 11, "a step up after one
 * clearly easy and down after a grind" (the grind as the workout read it).
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. A ramp logged; the
 * 2.5 lb plates marked missing (the top set stands in at 135 × 5-7 for 140 × 4-6); the top set lifted
 * at 140 × 4 at 0 (the follow leaves the back-offs at 135); then the plates saved again unchanged, a
 * set added, a rep range set, or home and back to the gym (the 2.5s still missing).
 *
 * What happens at d06edb5 (and at 270f40e): the back-offs still to come at 125.
 *
 * The fix (the fourteenth pass): wherever the back-offs' load is worked out, the top set's log is
 * read as the workout reads it (`backOffLoadAfter` through `outcomeFor`: lifted at the load it stood
 * in for, against the range asked). Synthetic data only.
 */

async function liftedAtTheLoadAsked() {
  const started = await startedMain();
  const { store, main, toCome } = started;
  const ramp = main().sets.find((set) => set.kind === 'warmup')!;
  await store.logSet(main().id, ramp.index, { weight: ramp.targetWeight, reps: 5, rir: 5 });
  await store.setMissingPlates([2.5]);
  const top = main().sets.find((set) => set.tier === 'top')!;
  expect([top.targetWeight, top.targetReps, top.asked]).toEqual([
    135,
    [5, 7],
    { weight: 140, reps: [4, 6] },
  ]);
  expect(toCome()).toEqual([135, 135, 135]);
  // On the floor of the range it asks, a rep short of its reserve: no step in the workout.
  await store.logSet(main().id, top.index, { weight: 140, reps: 4, rir: 0 });
  expect(toCome()).toEqual([135, 135, 135]);
  return started;
}

describe('a top set standing in, lifted at the load it asks, read as the workout read it', () => {
  it('keeps its back-offs at the drop off it through a refit for the same weights', async () => {
    const { store, toCome } = await liftedAtTheLoadAsked();
    await store.setMissingPlates([2.5]);
    // At d06edb5: [125, 125, 125], read against the stand-in's 5-7 as a grind.
    expect({ backOffs: toCome() }).toEqual({ backOffs: [135, 135, 135] });
  });

  it('gives a set added the load its back-offs have', async () => {
    const { store, main, toCome } = await liftedAtTheLoadAsked();
    await store.recalibrate({ type: 'sets', entryId: main().id, workingDelta: 1 });
    // At d06edb5: [135, 135, 135, 125].
    expect({ backOffs: toCome() }).toEqual({ backOffs: [135, 135, 135, 135] });
  });

  it('keeps their load through a rep range set for them', async () => {
    const { store, main, toCome } = await liftedAtTheLoadAsked();
    await store.recalibrate({ type: 'rep-range', entryId: main().id, reps: [4, 6] });
    // At d06edb5: [125, 125, 125].
    expect({ backOffs: toCome() }).toEqual({ backOffs: [135, 135, 135] });
  });

  it('picks them up again at that load, home and back', async () => {
    const { toCome, homeAndBack } = await liftedAtTheLoadAsked();
    await homeAndBack();
    expect(toCome().length).toBeGreaterThan(0);
    // At d06edb5: 125 on each (the generator's pick-up, `backOffLoadAfter` with no reading).
    expect({ backOffs: toCome().filter((load) => load !== 135) }).toEqual({ backOffs: [] });
  });
});
