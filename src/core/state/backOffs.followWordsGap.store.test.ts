import { describe, expect, it } from 'vitest';
import { startedMain } from '../../test/startedMain';

/**
 * The fourteenth review of round N. The thirteenth pass names the back-offs' step in the follow's
 * words by the step of the last back-off logged (`stepped`: every back-off done, in set order, the
 * last with a step), and says so wherever the back-offs to come stand off the drop's load. Each
 * back-off logged moves only the ones after it (`backOffsReplayed`), so where a back-off's log was
 * taken back after a later one was logged, the one now in front stands where an earlier back-off
 * put it, and the last one logged, after it, moved nothing still to come. Back-off 2's log deleted,
 * back-off 2 stands a step up after back-off 1, clearly easy; back-off 3, the last set, was a grind;
 * the top set corrected then says "a step down after a hard back-off" over back-offs that went up.
 * At 270f40e the words read the step against the drop's load, and said "a step up".
 *
 * The rules (docs/reports/maintenance-32.md): the first review, the follow says what it did in its
 * own words ("the follow's headline said the sets come down when a heavier top set took them up");
 * the thirteenth, "The follow ... names the back-offs' step by its own direction"; the thirteenth
 * review's own finding, "the follow called a clearly easy back-off's step up 'a step down after a
 * hard back-off'".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The top set lifted at
 * 140 × 5 at 1; back-off 1 at 135 × 8 at 4, clearly easy (back-offs 2 and 3 at 140); back-off 2 at
 * 140 × 5 at 2; back-off 3 at 140 × 3 at 0, a grind; back-off 2's log deleted (it is at 140); the top
 * set corrected to 140 × 5 at 2.
 *
 * What happens at d06edb5: "Barbell Row: back-offs at 140 lb, from the top set at 140 lb, a step down
 * after a hard back-off." At 270f40e: "... a step up after an easy back-off."
 *
 * The fix (the fourteenth pass): the follow names the step that put the back-off in front where it
 * stands, the last of the back-offs logged before it. Synthetic data only.
 */

describe('the follow’s words, a back-off’s log taken back after a later one', () => {
  it('names the step that put the back-off in front where it stands', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first, second, third] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    await store.logSet(main().id, first!.index, { weight: 135, reps: 8, rir: 4 });
    expect(toCome()).toEqual([140, 140]);
    await store.logSet(main().id, second!.index, { weight: 140, reps: 5, rir: 2 });
    await store.logSet(main().id, third!.index, { weight: 140, reps: 3, rir: 0 });
    store.deleteLoggedSet(main().id, second!.index);
    expect(toCome()).toEqual([140]);
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 2 });
    // Back-off 2 a step over the drop's 135, after back-off 1's easy log.
    expect(toCome()).toEqual([140]);
    expect(headline()).toMatch(/^Barbell Row: back-offs at 140 lb, from the top set at 140 lb/);
    // At d06edb5: "..., a step down after a hard back-off."
    expect(headline()).not.toMatch(/a step down/);
  });
});
