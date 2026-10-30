import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The twelfth review of round N. The back-offs' step after a clearly easy top set is clamped at the
 * top set as lifted (`backOffLoadAfter`, as every later step is in `backOffStepped`) with no look at
 * the weights the place has: where the place can no longer make the top set's load (a plate marked
 * missing after it was lifted), every replay of the back-offs (an undo, a delete, a correction, the
 * lift picked up again) puts them at that load, which the place cannot make. The refit for the
 * missing plate had fitted them under it.
 *
 * The rules (docs/reports/maintenance-32.md): item 11, the back-offs "5% lighter than the top set
 * ... to the nearest weight the place has", "a step up after one clearly easy"; the fifth review,
 * "the back-offs' load is the nearest weight the place has"; the 'loading' trigger, "every entry's
 * sets still to come take loads that exist here, a started one included".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The top set taken
 * lighter and clearly easy, 130 × 6 at 3: back-offs 130 (the drop off 130, a step up, held at the
 * top set). The 2.5 lb plates marked missing: back-offs refitted to 125 (130 is 42.5 lb a side).
 * Back-off 1 logged as asked at 125, then undone.
 *
 * The same refit and replay disagree where nothing is clamped: the refit fits a back-off as any set
 * (its own load fitted down, its reps pushed), the replay takes the drop off the top set onto the
 * weights left; the top set lifted at 160 (back-offs 150), the plate marked missing, the refit puts
 * them at 145 and an undo of a back-off logged as asked at 155.
 *
 * What happens on f858500 (and on d119260): the undo's replay puts all three back-offs at 130, a
 * load the place cannot make without a 2.5; in the second case at 155, where the refit put 145.
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
  return { store, main, toCome };
}

describe('the top set’s load no longer made by the place, back-offs stepped up to it', () => {
  it('keeps them on weights the place has through a replay', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    expect(top.targetWeight).toBe(140);
    await store.logSet(main().id, top.index, { weight: 130, reps: 6, rir: 3 });
    expect(toCome()).toEqual([130, 130, 130]);
    await store.setMissingPlates([2.5]);
    const refitted = toCome();
    expect(refitted).toEqual([125, 125, 125]);
    const asked = main().sets.find((set) => set.index === first!.index)!;
    await store.logSet(main().id, first!.index, {
      weight: asked.targetWeight,
      reps: asked.targetReps[0] + 1,
      rir: asked.targetRir,
    });
    store.undoLastSet();
    // On f858500: [130, 130, 130], 42.5 lb a side with no 2.5 lb plate.
    expect({ replayed: toCome() }).toEqual({ replayed: refitted });
  });

  it('a replay with no new log leaves them where the refit put them', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    // The top set heavier, as asked otherwise: the drop off 160 is 152, the back-offs 150.
    await store.logSet(main().id, top.index, { weight: 160, reps: 5, rir: 1 });
    expect(toCome()).toEqual([150, 150, 150]);
    await store.setMissingPlates([2.5]);
    const refitted = toCome();
    const asked = main().sets.find((set) => set.index === first!.index)!;
    await store.logSet(main().id, first!.index, {
      weight: asked.targetWeight,
      reps: asked.targetReps[0] + 1,
      rir: asked.targetRir,
    });
    store.undoLastSet();
    // On f858500: refitted [145, 145, 145] (150 fitted down, its reps pushed), then [155, 155, 155]
    // (152 onto the plates left) after the undo of a back-off logged as asked.
    expect({ replayed: toCome() }, `refitted ${refitted.join(', ')}`).toEqual({
      replayed: refitted,
    });
  });
});
