import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The thirteenth review of round N. The twelfth pass's refit (`refitBackOffs`, run for a change of
 * weights or place and for a rep range set by hand) works out one load, the one `asBackOffs` gives
 * the first back-off still to come, and puts it on every back-off still to come. `asBackOffs`
 * replays every back-off logged (`owedBackOffLoad`), so a back-off still to come that sits before
 * one logged (its own log deleted after the next was logged) takes the step the later back-off's
 * log gave the ones after it. Every replay of the store walks the sets in order
 * (`backOffsReplayed`): each back-off logged moves only the ones after it.
 *
 * The rules (docs/reports/maintenance-32.md): the fourth review, "a back-off's log taken back puts
 * every back-off still to come where the top set as it stands puts them, each back-off still logged
 * moving the ones after it as its log did"; the twelfth, "The back-offs take one rule wherever their
 * load is worked out, the refit for the place's weights included".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The top set lifted
 * at 140 × 5 at 1; back-off 1 at 135 × 5 at 2; back-off 2 at 135 × 8 at 4, clearly easy: back-off 3
 * at 140. Back-off 1's log deleted: it is at 135 again, back-off 3 at 140. Then the rep range set
 * to 5-7 for the sets still to come (or the 2.5 lb plates marked missing and found again).
 *
 * What happens at 85ee7b6: back-off 1 at 140, the step back-off 2's log gave the one after it. On
 * 5762c00 it stays at 135. Synthetic data only.
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

/** Back-off 1's log deleted after back-off 2, clearly easy, took back-off 3 a step up. */
async function deletedFirst() {
  const started = await startedMain();
  const { store, main, toCome } = started;
  const top = main().sets.find((set) => set.tier === 'top')!;
  const [first, second] = main().sets.filter((set) => set.tier === 'back-off');
  expect(top.targetWeight).toBe(140);
  await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
  await store.logSet(main().id, first!.index, { weight: 135, reps: 5, rir: 2 });
  await store.logSet(main().id, second!.index, { weight: 135, reps: 8, rir: 4 });
  expect(toCome()).toEqual([140]);
  store.deleteLoggedSet(main().id, first!.index);
  // Every replay of the store: back-off 1 where the top set puts it, back-off 3 a step up.
  expect(toCome()).toEqual([135, 140]);
  return started;
}

describe('the refit of the back-offs still to come, one before a back-off logged', () => {
  it('keeps the load the top set gives it through a rep range set by hand', async () => {
    const { store, main, toCome } = await deletedFirst();
    await store.recalibrate({ type: 'rep-range', entryId: main().id, reps: [5, 7] });
    // At 85ee7b6: [140, 140], back-off 1 at the step back-off 2's log gave the one after it.
    expect({ backOffs: toCome() }).toEqual({ backOffs: [135, 140] });
  });

  it('keeps it through a refit for the place’s weights', async () => {
    const { store, toCome } = await deletedFirst();
    await store.setMissingPlates([]);
    // At 85ee7b6: [140, 140].
    expect({ backOffs: toCome() }).toEqual({ backOffs: [135, 140] });
  });
});
