import { describe, expect, it } from 'vitest';
import { allEntries } from '../../engine/workout/types';
import { startedMain } from '../../test/startedMain';

/**
 * The fifteenth review of round N. A set can be logged with no weight (the logger's weight field
 * cleared: `SetLogger` commits `weight: null`). Every replay of the back-offs reads a top set's log
 * with no weight as lifted at the load it asks, never a stand-in's (`backOffLoadAfter`: "With no
 * weight logged, the load the top set asks (`topSetLoad`), never a stand-in's", the thirteenth
 * pass). The follow of the top set's log does not: the `performance` trigger takes the load lifted
 * as `trigger.actualWeight ?? logged.targetWeight`, the stand-in's load shown, so a top set standing
 * in for the plates (135 × 5-7 for 140 × 4-6), logged clearly easy with no weight, takes its back-offs
 * to the drop off 135, 125 ("back-offs at 125 lb, from the top set at 135 lb"), where an Undo of a
 * change to another lift or the plates saved again put them at 135.
 *
 * The rules (docs/reports/maintenance-32.md): the thirteenth pass, "a top set still to come gives
 * its back-offs the drop off the load it asks, the one it stands in for where the weights here make
 * less (`topSetLoad`) ... never the stand-in's"; the twelfth, "The back-offs take one rule wherever
 * their load is worked out"; the fourteenth, "A top set's log is read as the workout reads it
 * wherever the back-offs' load is worked out".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. A ramp logged; the 2.5
 * lb plates marked missing (the top set stands in at 135 × 5-7 for 140 × 4-6, back-offs 135); the top
 * set logged with no weight, 8 reps at 4 in reserve.
 *
 * What happens at 1fcd67a (and at 9e9078e): back-offs at 125, "Barbell Row: back-offs at 125 lb, from
 * the top set at 135 lb."; an Undo of a pin on another lift, or the plates saved again, then puts
 * them at 135. Synthetic data only.
 *
 * The fix (the fifteenth pass): the follow reads a top set logged with no weight at the load it
 * asks (`topSetLoad`), as every replay does: the drop off 140, 135.
 */

async function standInLoggedWithNoWeight() {
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
  await store.logSet(main().id, top.index, { weight: null, reps: 8, rir: 4 });
  return started;
}

describe('a top set standing in, logged with no weight', () => {
  it('gives its back-offs the drop off the load it asks, as every replay does', async () => {
    const { store, main, toCome, headline } = await standInLoggedWithNoWeight();
    const shown = { backOffs: toCome(), headline: headline() };
    const other = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.id !== main().id && !entry.stopped,
    )!;
    await store.recalibrate({ type: 'pin', entryId: other.id, pinned: true });
    await store.undoRecalibration();
    // The Undo's replay: [135, 135, 135].
    expect(toCome()).toEqual([135, 135, 135]);
    // At 1fcd67a: [125, 125, 125], "back-offs at 125 lb, from the top set at 135 lb".
    expect(shown.backOffs).toEqual(toCome());
    expect(shown.headline).not.toMatch(/from the top set at 135 lb/);
  });

  it('leaves nothing for the plates saved again to move', async () => {
    const { store, toCome } = await standInLoggedWithNoWeight();
    const shown = toCome();
    await store.setMissingPlates([2.5]);
    // At 1fcd67a: [125, 125, 125] shown, [135, 135, 135] after the refit.
    expect({ backOffs: shown }).toEqual({ backOffs: toCome() });
  });
});
