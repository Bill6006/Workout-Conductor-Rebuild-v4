import { describe, expect, it } from 'vitest';
import { allEntries } from '../../engine/workout/types';
import { startedMain } from '../../test/startedMain';

/**
 * The fifteenth review of round N. A back-off's step can read the set before it: "Sets 1 and 2 both
 * cleared the top of the range" (`autoregulate`'s `twoOver`), the top set the first of them. Every
 * replay of the back-offs reads each back-off still logged against the logs as they stand
 * (`backOffsAsLogged` through `planAfter`; a refit through `owedBackOffLoads`), so a top set's log
 * taken back takes that step away, and the same top set logged again gives it back. But the store
 * replays nothing when a top set is logged with no follow of its own (`logSet`: the `performance`
 * trigger, with the back-offs' logs, runs only for a step or another load than asked), so a top set
 * logged again as it was, at the load it asks, leaves the back-offs where the replay without it put
 * them, a step down. The next replay of any kind puts them back up with no new log: the plates saved
 * again, or an Undo of a change to another lift. The same holds for a back-off logged again after
 * its log was taken back, before a later back-off whose step reads it: its follow moves the sets after
 * it by its own log alone (`execute`'s `performance`, from the weight it was lifted at), and never
 * replays the later one's.
 *
 * The rules (docs/reports/maintenance-32.md): the second review's MEDIUM, "a top set's log taken
 * back (an undo, a delete, a correction to a skip) and logged again as planned left the back-offs
 * where the slip had put them"; the eleventh pass, "A top set logged again replays the back-offs'
 * logs as a correction does"; the eighth, "Back-offs are replayed from the logs as corrected or left
 * standing"; the thirteenth, "An Undo ... takes back a change and never a log made since".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The top set lifted at
 * 140 × 6 at 1, the top of its range (no step: back-offs 135); back-off 1 at 135 × 6 at 2, the top of
 * its range at its reserve (back-offs 2 and 3 a step up, 140); the top set's row deleted (they come
 * down to 135: back-off 1 alone at the top of its range moves nothing); the top set logged again at
 * 140 × 6 at 1, as it was. Or: the top set at 140 × 5 at 1; back-offs 1 and 2 at 135 × 6 at 2, the
 * second a step up for back-off 3 (140); back-off 1's row deleted (back-off 3 down to 135) and
 * back-off 1 logged again as it was.
 *
 * What happens at 1fcd67a (and at 9e9078e): back-offs 2 and 3 at 135 after the top set is logged
 * again; the plates saved again then put them at 140, and so does an Undo of a pin on another lift;
 * back-off 3 at 135 after back-off 1 is logged again, where the same logs gave 140. Synthetic data
 * only.
 *
 * The fix (the fifteenth pass): a top set logged again under back-offs logged since follows with
 * their logs, a step of its own or none (`logSet`); a back-off logged before one logged since puts
 * the ones after it where the logs now leave them, as a correction does, its own follow taking no
 * step over them. The last test is the pass's own: a grind logged again before an easy back-off.
 */

async function loggedAgainAsItWas() {
  const started = await startedMain();
  const { store, main, toCome } = started;
  const top = main().sets.find((set) => set.tier === 'top')!;
  const [first] = main().sets.filter((set) => set.tier === 'back-off');
  expect([top.targetWeight, top.targetReps]).toEqual([140, [4, 6]]);
  await store.logSet(main().id, top.index, { weight: 140, reps: 6, rir: 1 });
  expect(toCome()).toEqual([135, 135, 135]);
  await store.logSet(main().id, first!.index, { weight: 135, reps: 6, rir: 2 });
  // Sets 1 and 2 both cleared the top of the range: a step up.
  const stepped = toCome();
  expect(stepped).toEqual([140, 140]);
  store.deleteLoggedSet(main().id, top.index);
  expect(toCome()).toEqual([135, 135]);
  await store.logSet(main().id, top.index, { weight: 140, reps: 6, rir: 1 });
  return { ...started, stepped };
}

describe('a top set logged again as it was, after a back-off whose step read it', () => {
  it('puts the back-offs back where the same logs put them before', async () => {
    const { toCome, stepped } = await loggedAgainAsItWas();
    // At 1fcd67a: [135, 135].
    expect({ backOffs: toCome() }).toEqual({ backOffs: stepped });
  });

  it('leaves nothing for the plates saved again to move', async () => {
    const { store, toCome } = await loggedAgainAsItWas();
    const shown = toCome();
    await store.setMissingPlates([]);
    // At 1fcd67a: [135, 135] shown, [140, 140] after the refit, no set logged between.
    expect({ backOffs: shown }).toEqual({ backOffs: toCome() });
  });

  it('the same for a back-off logged again before a later one whose step read it', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first, second] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    await store.logSet(main().id, first!.index, { weight: 135, reps: 6, rir: 2 });
    expect(toCome()).toEqual([135, 135]);
    // Back-offs 1 and 2 both at the top of the range: back-off 3 a step up.
    await store.logSet(main().id, second!.index, { weight: 135, reps: 6, rir: 2 });
    expect(toCome()).toEqual([140]);
    store.deleteLoggedSet(main().id, first!.index);
    expect(toCome()).toEqual([135, 135]);
    await store.logSet(main().id, first!.index, { weight: 135, reps: 6, rir: 2 });
    // At 1fcd67a: [135], where the same logs gave [140] before.
    expect({ backOffs: toCome() }).toEqual({ backOffs: [140] });
  });

  it('leaves nothing for an Undo of a change to another lift to move', async () => {
    const { store, main, toCome } = await loggedAgainAsItWas();
    const shown = toCome();
    const other = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.id !== main().id && !entry.stopped,
    )!;
    await store.recalibrate({ type: 'pin', entryId: other.id, pinned: true });
    await store.undoRecalibration();
    // At 1fcd67a: [135, 135] shown, [140, 140] after the Undo.
    expect({ backOffs: shown }).toEqual({ backOffs: toCome() });
  });
});

describe('a back-off ground out, logged again before an easy one after it', () => {
  it('leaves the ones after it where the logs put them, its own step no more', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first, second] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    // Back-off 1 under its range: the next two come down a step.
    await store.logSet(main().id, first!.index, { weight: 135, reps: 2, rir: 0 });
    expect(toCome()).toEqual([130, 130]);
    // Back-off 2 clearly easy at 130: back-off 3 a step up from it.
    await store.logSet(main().id, second!.index, { weight: 130, reps: 9, rir: 4 });
    expect(toCome()).toEqual([135]);
    store.deleteLoggedSet(main().id, first!.index);
    await store.logSet(main().id, first!.index, { weight: 135, reps: 2, rir: 0 });
    // Back-off 1's step, then back-off 2's from the 130 it was lifted at. Without the replay its
    // own follow put back-off 3 a step under back-off 1's 135, at 130.
    expect(toCome()).toEqual([135]);
  });
});

describe('a back-off logged in turn', () => {
  it('moves the ones after it by its own follow, in its own words', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    await store.logSet(main().id, first!.index, { weight: 135, reps: 9, rir: 4 });
    // The fifteenth pass's own: no back-off logged after it, its follow is its own, said.
    expect(toCome()).toEqual([140, 140]);
    expect(headline()).toMatch(/^Barbell Row: Set 2: .*go up 5 lb\.$/);
  });
});
