import { describe, expect, it } from 'vitest';
import { allEntries } from '../../engine/workout/types';
import { startedMain } from '../../test/startedMain';

/**
 * The fourteenth review of round N. The thirteenth pass's Undo puts each lift's back-offs where its
 * logs as they stand put them (`backOffsAsLogged`), "an Undo takes back a change, never a log made
 * since", but only for a lift that still has a log or a recorded drop load (`undoRecalibration`'s
 * test: `completed.sets.some(...) || entry.backOffAt !== undefined`). A lift whose logs were all
 * taken back since the change has neither, and the plan put back keeps back-offs worked out for the
 * logs as they stood then. The coach's weight, taken while a back-off was skipped (the coach offers
 * one while nothing is lifted, a skip included), moves the back-offs still to come and leaves the
 * skipped one where it was (`takes`: a set done or skipped stays); the skip taken back puts it at the
 * drop off the top set as it stands, 140; an Undo of any change made between (another lift's rep
 * range, a pin, the plates saved again) puts it back at 135, 10 lb under the others, the drop off the
 * top set's plan from before the coach's weight.
 *
 * The rules (docs/reports/maintenance-32.md): the fourth review, "a back-off's log taken back puts
 * every back-off still to come where the top set as it stands puts them"; the thirteenth, the
 * back-offs' load worked out "wherever ... an Undo, which takes back a change and never a log made
 * since (`backOffsAsLogged`)"; the code's own: "Each lift's back-offs where its logs as they stand
 * put them".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. Back-off 1 skipped;
 * the coach's 145 taken (the top set at 145, back-offs 2 and 3 at 140, back-off 1 skipped at 135);
 * the rep range of the next lift set to 10-12 (or that lift pinned); back-off 1's skip deleted (it is
 * at 140); Undo.
 *
 * What happens at d06edb5 (and at 270f40e, whose Undo replayed nothing): back-off 1 at 135 under a
 * top set at 145, back-offs 2 and 3 at 140.
 *
 * The fix (the fourteenth pass): an Undo puts every lift's back-offs where its logs as they stand put
 * them, a lift with no log left included. Synthetic data only.
 */

async function skipTakenBackAfterAChange(change: 'rep-range' | 'pin') {
  const started = await startedMain();
  const { store, main, toCome } = started;
  const top = main().sets.find((set) => set.tier === 'top')!;
  const [first] = main().sets.filter((set) => set.tier === 'back-off');
  store.skipSet(main().id, first!.index);
  await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 145 });
  expect(main().sets.find((set) => set.index === top.index)?.targetWeight).toBe(145);
  expect(toCome()).toEqual([140, 140]);
  const other = allEntries(store.getSnapshot().session!.workout.blocks).find(
    (entry) => entry.id !== main().id && !entry.stopped,
  )!;
  if (change === 'rep-range') {
    await store.recalibrate({ type: 'rep-range', entryId: other.id, reps: [10, 12] });
  } else {
    await store.recalibrate({ type: 'pin', entryId: other.id, pinned: true });
  }
  store.deleteLoggedSet(main().id, first!.index);
  // The skip taken back: back-off 1 where the top set as it stands puts it.
  expect(toCome()).toEqual([140, 140, 140]);
  return started;
}

describe('Undo of a change made while a back-off was skipped, the skip taken back since', () => {
  it('keeps the back-off where the top set as it stands puts it (another lift’s rep range)', async () => {
    const { store, toCome } = await skipTakenBackAfterAChange('rep-range');
    await store.undoRecalibration();
    // At d06edb5: [135, 140, 140].
    expect({ backOffs: toCome() }).toEqual({ backOffs: [140, 140, 140] });
  });

  it('keeps it there through the Undo of a pin', async () => {
    const { store, toCome } = await skipTakenBackAfterAChange('pin');
    await store.undoRecalibration();
    // At d06edb5: [135, 140, 140].
    expect({ backOffs: toCome() }).toEqual({ backOffs: [140, 140, 140] });
  });
});
