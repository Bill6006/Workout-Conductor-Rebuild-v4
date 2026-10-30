import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The thirteenth review of round N. A main lift under way before its top set (a ramp logged) is
 * fitted in place when a plate goes missing: the top set (140, which needs a 2.5) stands in at 135 ×
 * 5-7 for 140 × 4-6, and the back-offs, at 135 (the drop off 140, a weight the place still makes),
 * stay. The top set lifted as shown, at 135, on target, runs no follow: the store moves the
 * back-offs only for a top set lifted at another load than its target (`movesBackOffs` compares the
 * load shown, the stand-in's), or a step. So the back-offs are at the top set's own load as lifted,
 * with the drop in force, until something else replays them: the twelfth pass's refit puts them at
 * the drop off 135, 125 (a rep range set, another plate, a change of place), and the saved session
 * records the drop's load as 125 (`backOffAt`), so back-offs lifted at 135 are no back-offs at the
 * drop for its correction.
 *
 * The rules (docs/reports/maintenance-32.md, item 11): "In the workout, the top set lifted at another
 * load moves its back-offs with it, 5% under it as lifted"; `backOffLoad`: "never the top set's own
 * while a drop is in force"; the twelfth pass: "The back-offs take one rule wherever their load is
 * worked out ... the drop off the top set as lifted, to the nearest weight the place has".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. A ramp logged; the
 * 2.5 lb plates marked missing; the top set lifted as shown, 135 × 6 at 1.
 *
 * What happens at 85ee7b6 (and at 5762c00): the back-offs still to come at 135, the top set's load
 * as lifted; at 85ee7b6 a rep range set to 4-6 then takes them to 125. Synthetic data only.
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

describe('a top set standing in for its load, lifted as shown', () => {
  it('takes its back-offs under it as lifted', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const warmup = main().sets.find((set) => set.kind === 'warmup')!;
    expect(top.targetWeight).toBe(140);
    await store.logSet(main().id, warmup.index, {
      weight: warmup.targetWeight,
      reps: 5,
      rir: null,
    });
    await store.setMissingPlates([2.5]);
    const shown = main().sets.find((set) => set.index === top.index)!;
    expect({ weight: shown.targetWeight, asked: shown.asked?.weight }).toEqual({
      weight: 135,
      asked: 140,
    });
    expect(toCome()).toEqual([135, 135, 135]);
    await store.logSet(main().id, top.index, { weight: 135, reps: 6, rir: 1 });
    // At 85ee7b6: [135, 135, 135], the top set's own load as lifted.
    expect({ atTheTopSet: toCome().filter((load) => load >= 135) }).toEqual({ atTheTopSet: [] });
  });

  it('takes them back to the drop off the load it asks once its log is taken back', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const warmup = main().sets.find((set) => set.kind === 'warmup')!;
    await store.logSet(main().id, warmup.index, {
      weight: warmup.targetWeight,
      reps: 5,
      rir: null,
    });
    await store.setMissingPlates([2.5]);
    await store.logSet(main().id, top.index, { weight: 135, reps: 6, rir: 1 });
    expect(toCome()).toEqual([125, 125, 125]);
    store.deleteLoggedSet(main().id, top.index);
    // The top set still to come asks 140: the drop off it, 135, as before it was lifted (the
    // thirteenth pass's fix: off the stand-in's 135, 125).
    expect(toCome()).toEqual([135, 135, 135]);
  });
});
