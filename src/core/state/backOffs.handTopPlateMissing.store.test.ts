import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The twelfth review of round N. A weight set by hand on the top set before it is done
 * (`manual.weight`, the back-offs following it at the drop, `manual.backOffs` unset) keeps the
 * whole lift out of the refit to the place's weights (`refitEntry` returns at `manual.weight`), its
 * back-offs too, which were never set by hand. After a plate is marked missing they stay at a load
 * the place cannot make; the next replay of them (an undo of a back-off logged as asked) fits them,
 * so they move with no new log.
 *
 * The rules (docs/reports/maintenance-32.md): item 11, "A weight set by hand before the top set is
 * done is the top set's, the back-offs following at the drop"; the back-offs are "5% lighter, to the
 * nearest weight the place has" (the fifth review: "the back-offs' load is the nearest weight the
 * place has"); the 'loading' trigger's own words: "every entry's sets still to come take loads that
 * exist here, a started one included. Logged sets and weights set by hand stay as they are."
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The coach's "Take
 * 145 lb today" taken before the top set (offered while no set is lifted; the top set's weight, the
 * back-offs following at 140). The top set lifted at 145 × 5 at 1: back-offs 140. The 2.5 lb plates
 * marked missing. Then back-off 1 logged as asked at the load shown and undone.
 *
 * What happens on f858500 (and on d119260): the back-offs stay at 140 (47.5 lb a side, which needs a
 * 2.5) after the plate is marked missing; the undo's replay moves them to 135. Synthetic data only.
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
  return { store, main, toCome };
}

describe('the top set’s weight set by hand, then a plate marked missing', () => {
  it('fits its back-offs to the weights left, and a replay leaves them there', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    expect(top.targetWeight).toBe(140);
    // Before the top set (no set lifted, so the coach offers it): "Take 145 lb today", the top set's
    // weight, the back-offs following at the drop.
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 145 });
    expect(main().manual?.backOffs).toBeUndefined();
    await store.logSet(main().id, top.index, { weight: 145, reps: 5, rir: 1 });
    expect(toCome()).toEqual([140, 140, 140]);
    await store.setMissingPlates([2.5]);
    const refitted = toCome();
    await store.logSet(main().id, first!.index, {
      weight: refitted[0] ?? null,
      reps: 5,
      rir: first!.targetRir,
    });
    store.undoLastSet();
    // On f858500: [140, 140, 140] with no 2.5 lb plate, then [135, 135, 135] after the undo.
    expect({ refitted, replayed: toCome() }).toEqual({
      refitted: [135, 135, 135],
      replayed: [135, 135, 135],
    });
  });
});
