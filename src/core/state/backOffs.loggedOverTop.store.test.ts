import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The twelfth review of round N. `backOffStepped` raises the cap to the weight a back-off was
 * lifted at (`Math.max(cap, from)`), whether or not the back-offs stand there at a weight set by
 * hand. A back-off logged heavier than the top set as lifted, with no weight set by hand, and
 * clearly easy, takes the ones after it to its own load, over the top set as lifted.
 *
 * The rules (docs/reports/maintenance-32.md): item 11, "The back-offs are never heavier than the
 * top set as lifted"; the third review's LOW, "a back-off logged clearly easy took the back-offs
 * after it over the top set as lifted" (fixed: "the back-offs are never over the top set as
 * lifted"). `backOffStepped`'s own doc: "never over the cap (`backOffCap`), nor, where the back-offs
 * stand over it at a weight set by hand, over where they stand". Here nothing was set by hand: the
 * back-offs stand under the top set.
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The top set taken
 * lighter, 130 × 5 at 1: the back-offs follow it, 125. Back-off 1 lifted at the plan's 135, 8 reps
 * at 4 (clearly easy). The same with the top set as planned (140 × 5 at 1) and back-off 1 lifted at
 * 145 × 8 at 4. Then the same logs replayed: back-off 2 logged as asked and undone. Last, the cap of
 * a top set still to come: the top set lifted heavier and clearly easy (145 × 6 at 3, the back-offs a
 * step up to 145), back-off 1 lifted there clearly easy (145 × 6 at 4), then the top set's log
 * deleted; `backOffCap` caps the back-offs at its plan, 140, and the replay raises that to 145.
 * Last, the other side of the same reading: the top set skipped, the coach's "Take 145 lb today"
 * taken (the back-offs' own), the skip corrected to 140 × 5 at 1; back-off 1 lifted a step lighter
 * than the weight set, 140 × 6 at 4 (clearly easy): the step from 140 is 145, where they stand, and
 * the cap read off the weight lifted (140) takes them down to 140.
 *
 * What happens on f858500: back-offs 2 and 3 at 135 over a top set lifted at 130 (and 145 over 140),
 * the headline "the next 2 sets go up 5 lb"; the undo's replay puts them at 145 again; after the
 * top set's log is deleted, 145 over its planned 140. On d119260 (before the eleventh pass) the
 * follow and the replays held them at the top set as lifted (130, 140), or as planned (140); the
 * last case fails there too (the eleventh review's finding, in a case its fix does not reach).
 * Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function startedMain() {
  const { store } = createTestStore({ now: () => TEST_NOW });
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  for (const daysAgo of [7, 3]) {
    for (const exerciseId of ['barbell-bench-press', 'back-squat', 'barbell-row']) {
      const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
      await db.put('workouts', {
        ...record(0, exerciseId, [
          [5, 135, 2],
          [5, 135, 2],
          [5, 135, 2],
        ]),
        id: `w-${exerciseId}-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
  }
  await store.hydrate();
  const main = (): WorkoutEntry =>
    allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.backOffDrop !== undefined,
    )!;
  expect(main()).toBeDefined();
  store.startWorkout();
  const toCome = () => {
    const done = store.getSnapshot().session!.completed.sets;
    return main()
      .sets.filter(
        (set) =>
          set.tier === 'back-off' &&
          !done.some((log) => log.entryId === main().id && log.setIndex === set.index),
      )
      .map((set) => set.targetWeight as number);
  };
  const headline = () => store.getSnapshot().session!.lastSummary?.headline ?? '';
  return { store, main, toCome, headline };
}

describe('a back-off logged heavier than the top set as lifted, clearly easy', () => {
  it('takes the ones after it no heavier than a top set taken lighter', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    expect(top.targetWeight).toBe(140);
    expect(main().manual?.weight).toBeFalsy();
    await store.logSet(main().id, top.index, { weight: 130, reps: 5, rir: 1 });
    expect(toCome()).toEqual([125, 125, 125]);
    // The plan's 135, clearly easy: 8 reps at 4 against 4-6 at 2.
    await store.logSet(main().id, first!.index, { weight: 135, reps: 8, rir: 4 });
    // On f858500: [135, 135], over the top set lifted at 130.
    expect({ loads: toCome(), overTop: toCome().some((load) => load > 130) }, headline()).toEqual({
      loads: [130, 130],
      overTop: false,
    });
  });

  it('takes the ones after it no heavier than the top set lifted as planned, replays too', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first, second] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    expect(toCome()).toEqual([135, 135, 135]);
    await store.logSet(main().id, first!.index, { weight: 145, reps: 8, rir: 4 });
    // On f858500: [145, 145], over the top set lifted at 140.
    expect({ loads: toCome() }, headline()).toEqual({ loads: [140, 140] });
    // The same logs replayed: back-off 2 logged as asked, then undone.
    await store.logSet(main().id, second!.index, { weight: 140, reps: 5, rir: 2 });
    store.undoLastSet();
    expect({ replayed: toCome() }).toEqual({ replayed: [140, 140] });
  });

  it('a top set’s log taken back: back-offs lifted at the follow’s load no heavier than its plan', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    // The top set heavier and clearly easy: the back-offs follow it a step up, to 145.
    await store.logSet(main().id, top.index, { weight: 145, reps: 6, rir: 3 });
    expect(toCome()).toEqual([145, 145, 145]);
    // Back-off 1 lifted where the follow put it, clearly easy: held at the top set as lifted.
    await store.logSet(main().id, first!.index, { weight: 145, reps: 6, rir: 4 });
    expect(toCome()).toEqual([145, 145]);
    const held = headline();
    // The top set's log taken back: the back-offs capped as planned, at 140.
    store.deleteLoggedSet(main().id, top.index);
    // On f858500: [145, 145], over the top set's planned 140 (held at 145 before: "Barbell Row:
    // back-offs stay at 145 lb, no heavier than the top set.").
    expect({ takenBack: toCome() }, held).toEqual({ takenBack: [140, 140] });
  });

  it('back-offs at a weight set by hand over the top set: one lifted lighter and clearly easy never takes them down', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    // The app's path (the coach offers a weight while no set is lifted): the top set skipped, the
    // coach's "Take 145 lb today" taken (the back-offs' own), the skip corrected to 140 × 5 at 1.
    store.skipSet(main().id, top.index);
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 145 });
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    expect(toCome()).toEqual([145, 145, 145]);
    // Lifted a step lighter than the weight set, clearly easy: the step from it is where they stand.
    await store.logSet(main().id, first!.index, { weight: 140, reps: 6, rir: 4 });
    // On f858500 (and on d119260): [140, 140] under "the next 2 sets go up 5 lb".
    expect({ loads: toCome() }, headline()).toEqual({ loads: [145, 145] });
  });
});
