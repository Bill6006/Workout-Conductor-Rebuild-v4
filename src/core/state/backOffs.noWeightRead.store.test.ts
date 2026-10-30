import { describe, expect, it } from 'vitest';
import { startedMain, type Started } from '../../test/startedMain';

/**
 * The sixteenth review of round N. A set can be logged with no weight (the logger's weight field
 * cleared: `SetLogger` commits `weight: null`, and no slip question asks about it). The fifteenth
 * pass made the follow read a top set logged so at the load it asks (`topSetLoad`), "as every replay
 * does", for the base of its back-offs' drop. Its step is still read two ways. The follow and the
 * store's replays (`planAfter`, through `outcomeFor` with no weight) read the set as one with no load
 * (`autoregulate`'s `hasWeight` false): a reps plan, "aim two reps higher", which no rule of the
 * back-offs reads, so no step. The refit, a lift picked up again and a set added read it through
 * `backOffLoadAfter`'s own reading (`afterTopSet`, the generator's pick-up), at the load it asks:
 * 8 reps at 4 in reserve on a 4-6 top set at 1 is clearly easy, a step up. So a top set logged with
 * no weight, clearly easy, leaves its back-offs at 135 ("Barbell Row: back-offs at 135 lb, from the
 * top set at 140 lb."), an Undo of a change to another lift leaves them there, and the plates saved
 * again, home and back or a swap away and back put them at 140 with nothing logged between; a set
 * added comes in at 140 beside them at 135. Which reading is right the rule says (at the load it
 * asks: a step), but the tests ask only that the paths agree. A grind (3 at 0) the same, a step
 * down. A back-off logged with no weight, clearly easy (9 at 4), takes the reps plan itself: the
 * back-offs after it go to 135 × 6-8 ("aim two reps higher on the next 2 sets") under a top set at
 * 4-6, where a pick-up gives them 4-6 back, and a set added comes in at 4-6 beside them.
 * The session records no drop's load for a top set logged so either (`withBackOffAt` reads a weight
 * of null as no top set lifted), so the saved session's back-offs are all read by the drop's
 * correction, those lifted at a step from it too, as in a session saved before the record existed.
 *
 * The rules (docs/reports/maintenance-32.md): the fifteenth pass, "The follow reads a top set logged
 * with no weight at the load it asks"; the thirteenth, `backOffLoadAfter`'s "With no weight logged,
 * the load the top set asks (`topSetLoad`)"; the twelfth, "The back-offs take one rule wherever their
 * load is worked out"; the fourteenth, "A top set's log is read as the workout reads it wherever the
 * back-offs' load is worked out"; item 11, "a step up after one clearly easy and down after a grind",
 * and the owner's settled answer, back-offs at the same reps as the top set; the ninth and eleventh,
 * "A saved session keeps the load the drop gave its back-offs off the top set as lifted
 * (`backOffAt`), and the drop's correction reads only back-offs lifted at it".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 3 × 135. The top set logged
 * with no weight, 8 reps at 4 in reserve (or 3 at 0); then the plates saved again, home and back, or
 * a set added. Or: the top set at 140 × 5 at 1, then back-off 1 logged with no weight, 9 reps at 4.
 *
 * What happens at 604fba7, and at 14d2e62 (the previous head) alike: the back-offs at 135 after the
 * top set, at 140 after the refit or the pick-up (130 for the grind); a set added at 140; the
 * back-offs after the weightless back-off at 135 × 6-8, at 4-6 once picked up again; no `backOffAt`
 * on the entry or the saved session, where the top set logged at 140 records 135. Synthetic data
 * only.
 *
 * The fix (the sixteenth pass): on top set plus back-offs a set logged with no weight is read as
 * lifted at the load it asks, in the store's reading too (`planAfter`), and the drop's load is
 * recorded off it (`backOffAt`). The follow's words read so (adapted above).
 */

async function topWithNoWeight(reps: number, rir: number) {
  const started = await startedMain();
  const { store, main, toCome } = started;
  const top = main().sets.find((set) => set.tier === 'top')!;
  expect([top.targetWeight, top.targetReps]).toEqual([140, [4, 6]]);
  expect(toCome()).toEqual([135, 135, 135]);
  await store.logSet(main().id, top.index, { weight: null, reps, rir });
  return started;
}

const AFTER: [string, (started: Started) => Promise<void>][] = [
  ['the plates saved again', ({ store }) => store.setMissingPlates([])],
  ['home and back', ({ homeAndBack }) => homeAndBack()],
  ['swapped away and back', ({ swapAwayAndBack }) => swapAwayAndBack()],
];

describe('a top set logged with no weight, clearly easy', () => {
  it.each(AFTER)('%s: its back-offs where the follow put them', async (_, then) => {
    const started = await topWithNoWeight(8, 4);
    const shown = started.toCome();
    // Since the sixteenth pass the follow reads it as lifted at the load it asks, as every replay
    // does (`planAfter`): clearly easy, a step up. At 604fba7: "back-offs at 135 lb, from the top
    // set at 140 lb.", read with no weight, and a refit then gave the step.
    expect(started.headline()).toBe(
      'Barbell Row: back-offs at 140 lb, from the top set at 140 lb, a step up after an easy top set.',
    );
    await then(started);
    // At 604fba7: [135, 135, 135] shown, [140, 140, 140] after, nothing logged between.
    expect({ backOffs: started.toCome() }).toEqual({ backOffs: shown });
  });

  it('agrees with a set added', async () => {
    const { store, main, toCome } = await topWithNoWeight(8, 4);
    await store.recalibrate({ type: 'sets', entryId: main().id, workingDelta: 1 });
    // At 604fba7: [135, 135, 135, 140], the set added a step over the back-offs beside it.
    expect(new Set(toCome()).size).toBe(1);
  });
});

describe('a top set logged with no weight, a grind', () => {
  it('leaves nothing for the plates saved again to move', async () => {
    const started = await topWithNoWeight(3, 0);
    const shown = started.toCome();
    await started.store.setMissingPlates([]);
    // At 604fba7: [135, 135, 135] shown, [130, 130, 130] after the refit.
    expect({ backOffs: started.toCome() }).toEqual({ backOffs: shown });
  });
});

describe('a back-off logged with no weight, clearly easy', () => {
  async function backOffWithNoWeight() {
    const started = await startedMain();
    const { store, main } = started;
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    await store.logSet(main().id, first!.index, { weight: null, reps: 9, rir: 4 });
    return started;
  }

  it('leaves the back-offs after it at the top set’s reps', async () => {
    const { repsToCome, headline } = await backOffWithNoWeight();
    // Since the sixteenth pass, read as lifted at the load it asks: a step up, at the top set's
    // reps. At 604fba7: "aim two reps higher on the next 2 sets.", read with no weight.
    expect(headline()).toMatch(/the next 2 sets go up 5 lb\.$/);
    // At 604fba7: [[6, 8], [6, 8]], under a top set at 4-6.
    expect(repsToCome()).toEqual([
      [4, 6],
      [4, 6],
    ]);
  });

  it('agrees with a set added', async () => {
    const { store, main, repsToCome } = await backOffWithNoWeight();
    await store.recalibrate({ type: 'sets', entryId: main().id, workingDelta: 1 });
    // At 604fba7: [[6, 8], [6, 8], [4, 6]].
    expect(new Set(repsToCome().map((reps) => reps.join('-'))).size).toBe(1);
  });

  it('agrees with a pick-up', async () => {
    const started = await backOffWithNoWeight();
    const shown = started.repsToCome();
    await started.homeAndBack();
    // At 604fba7: [[6, 8], [6, 8]] shown, [[4, 6], [4, 6]] after home and back.
    expect(started.repsToCome()).toEqual(shown);
  });
});

describe('a top set logged with no weight, as asked', () => {
  it('records the drop’s load off the load it asks, as one logged at 140 does', async () => {
    const { store, main } = await topWithNoWeight(5, 1);
    // At 604fba7: undefined; with the top set logged at 140 × 5 at 1, 135.
    expect(main().backOffAt).toBe(135);
    for (const set of main().sets.filter((each) => each.tier === 'back-off')) {
      await store.logSet(main().id, set.index, { weight: 135, reps: 5, rir: 2 });
    }
    await store.finishWorkout(null, { endedEarly: true });
    const saved = store
      .getSnapshot()
      .history.flatMap((one) => one.entries)
      .find((entry) => entry.exerciseId === 'barbell-row' && entry.backOffDrop !== undefined)!;
    // At 604fba7: undefined, every back-off read by the drop's correction.
    expect(saved.backOffAt).toBe(135);
  });
});

describe('the sixteenth pass’s own: a set on the structure logged with no weight, then a refit', () => {
  it('a back-off clearly easy: leaves nothing for the plates saved again to move', async () => {
    const started = await startedMain();
    const { store, main, toCome } = started;
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    await store.logSet(main().id, first!.index, { weight: null, reps: 9, rir: 4 });
    const shown = toCome();
    expect(shown).toEqual([140, 140]);
    await store.setMissingPlates([]);
    expect({ backOffs: toCome() }).toEqual({ backOffs: shown });
  });

  it('a top set standing in, then a back-off over the top of its range: both read as cleared', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const ramp = main().sets.find((set) => set.kind === 'warmup')!;
    await store.logSet(main().id, ramp.index, { weight: ramp.targetWeight, reps: 5, rir: 5 });
    await store.setMissingPlates([2.5]);
    const top = main().sets.find((set) => set.tier === 'top')!;
    // The weights here make no 140: the top set stands in at 135 × 5-7.
    expect([top.targetWeight, top.targetReps, top.asked]).toEqual([
      135,
      [5, 7],
      { weight: 140, reps: [4, 6] },
    ]);
    await store.logSet(main().id, top.index, { weight: null, reps: 6, rir: 1 });
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, first!.index, { weight: first!.targetWeight, reps: 6, rir: 2 });
    // Read at the load it asks, the top set cleared the top of the range it asks, and the back-off
    // its own: a step, held at the top set's load. Read with no weight, 6 of 5-7: no step at all.
    expect(headline()).toBe('Barbell Row: back-offs stay at 135 lb, no heavier than the top set.');
    expect(toCome()).toEqual([135, 135]);
  });
});
