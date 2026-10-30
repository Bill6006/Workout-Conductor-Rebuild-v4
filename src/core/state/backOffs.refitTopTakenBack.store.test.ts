import { describe, expect, it } from 'vitest';
import { startedMain } from '../../test/startedMain';

/**
 * The fourteenth review of round N. The thirteenth pass sends a lift under way before its top set
 * through the back-offs' refit (`refitEntry`: `touched`), where `refitBackOffs`, its top set not
 * done, puts every back-off still to come at one load, the drop off the load the top set asks
 * (`planned`), and reads no back-off logged. The store's every replay of them reads those logs while
 * the top set is still to come (`backOffsAsLogged`: "Each back-off still logged moves the ones after
 * it as its log did"). A top set's log taken back after a back-off was logged clearly easy leaves
 * the step that back-off gave the ones after it standing (the store's replay keeps it, 140); the next
 * refit (the plates saved again, or a rep range set) takes it away, 135. At 270f40e such a lift was
 * fitted in place set by set (`refitStarted`), and the step stood.
 *
 * The rules (docs/reports/maintenance-32.md): the fourth review, "a back-off's log taken back puts
 * every back-off still to come where the top set as it stands puts them, each back-off still logged
 * moving the ones after it as its log did"; the twelfth, "The back-offs take one rule wherever their
 * load is worked out, the refit for the place's weights included"; the thirteenth review's own
 * finding, "a refit gave every back-off still to come the load after the last back-off logged, where
 * each moves only the ones after it".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The top set lifted at
 * 140 × 5 at 1; back-off 1 at 135 × 8 at 4, clearly easy (back-offs 2 and 3 at 140); the top set's
 * log deleted (the store keeps them at 140); then the plates saved again unchanged, or the rep range
 * set to 5-7.
 *
 * What happens at d06edb5: back-offs 2 and 3 at 135. At 270f40e they stay at 140.
 *
 * The fix (the fourteenth pass): with the top set still to come, the refit puts the back-offs at the
 * drop off the load it asks, each back-off still logged moving the ones after it as its log did,
 * capped at the top set as planned, as every replay of them does (`owedBackOffLoads`). Synthetic
 * data only.
 */

async function topTakenBackAfterAnEasyBackOff() {
  const started = await startedMain();
  const { store, main, toCome } = started;
  const top = main().sets.find((set) => set.tier === 'top')!;
  const [first] = main().sets.filter((set) => set.tier === 'back-off');
  await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
  await store.logSet(main().id, first!.index, { weight: 135, reps: 8, rir: 4 });
  expect(toCome()).toEqual([140, 140]);
  store.deleteLoggedSet(main().id, top.index);
  // Every replay of the store keeps the step back-off 1's log gave the ones after it.
  expect(toCome()).toEqual([140, 140]);
  return started;
}

describe('the refit of a lift whose top set’s log was taken back after an easy back-off', () => {
  it('keeps the step the back-off gave the ones after it through the plates saved again', async () => {
    const { store, toCome } = await topTakenBackAfterAnEasyBackOff();
    await store.setMissingPlates([]);
    // At d06edb5: [135, 135].
    expect({ backOffs: toCome() }).toEqual({ backOffs: [140, 140] });
  });

  it('caps the step at the top set as planned, as every replay does', async () => {
    const started = await startedMain();
    const { store, main, toCome } = started;
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    // Back-off 1 lifted at the top set's load, clearly easy: the ones after it stay at that load.
    await store.logSet(main().id, first!.index, { weight: 140, reps: 8, rir: 4 });
    expect(toCome()).toEqual([140, 140]);
    store.deleteLoggedSet(main().id, top.index);
    expect(toCome()).toEqual([140, 140]);
    await store.setMissingPlates([]);
    // Never over the top set still to come (`backOffCap`).
    expect({ backOffs: toCome() }).toEqual({ backOffs: [140, 140] });
  });

  it('keeps it through a rep range set', async () => {
    const { store, main, toCome } = await topTakenBackAfterAnEasyBackOff();
    await store.recalibrate({ type: 'rep-range', entryId: main().id, reps: [5, 7] });
    // At d06edb5: [135, 135].
    expect({ backOffs: toCome() }).toEqual({ backOffs: [140, 140] });
  });
});
