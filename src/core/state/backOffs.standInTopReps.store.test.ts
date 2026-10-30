import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The thirteenth review of round N. Since the twelfth pass, the follow, every replay and the refit
 * give the back-offs "their own reps, never a stand-in's": after a top set that stood in for its
 * load (a plate missing, 155 × 5-7 for 160 × 4-6), the back-offs at 4-6. But a set added
 * (`asBackOffs`, `top.targetReps`) and a lift picked up again (the generator's pick-up, `backOff`'s
 * `targetReps: top.targetReps`) take the top set's reps as shown, the stand-in's 5-7: the back-offs
 * of one lift at two ranges, and the reps the twelfth pass took off them back on.
 *
 * The rules (docs/reports/maintenance-32.md): the twelfth pass, "The back-offs take one rule wherever
 * their load is worked out ... the drop off the top set as lifted, to the nearest weight the place
 * has, at their own reps, never a stand-in's"; item 11, "A set added is a back-off"; "A lift picked
 * up again ... carries on its back-offs after its top set, as it was lifted".
 *
 * Steps: the main lift (barbell row) planned at 160 × 4-6 at 1, back-offs 150. A ramp logged; the
 * 2.5 lb plates marked missing (the top set 155 × 5-7 for 160 × 4-6). The top set lifted at 145 × 6
 * at 1: the back-offs follow it, 135 × 4-6. Then a set added; or home and back to the gym.
 *
 * What happens at 85ee7b6: the set added at 135 × 5-7 beside back-offs at 135 × 4-6; picked up
 * again, the back-offs at 135 × 5-7. (On 5762c00 every path kept the stand-in's 5-7.) Synthetic
 * data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function followedStandIn() {
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
          [5, 155, 2],
          [5, 155, 2],
          [5, 155, 2],
        ]),
        id: `w-${exerciseId}-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
  }
  await store.hydrate();
  const entries = () => allEntries(store.getSnapshot().session!.workout.blocks);
  const exerciseId = entries().find((entry) => entry.backOffDrop !== undefined)!.exerciseId;
  const main = (): WorkoutEntry =>
    entries().find((entry) => entry.exerciseId === exerciseId && !entry.stopped)!;
  store.startWorkout();
  const shown = () => {
    const done = store.getSnapshot().session!.completed.sets;
    return main()
      .sets.filter(
        (set) =>
          set.tier === 'back-off' &&
          !done.some((log) => log.entryId === main().id && log.setIndex === set.index),
      )
      .map((set) => `${set.targetWeight} × ${set.targetReps.join('-')}`);
  };
  const top = main().sets.find((set) => set.tier === 'top')!;
  const warmup = main().sets.find((set) => set.kind === 'warmup')!;
  expect(top.targetWeight).toBe(160);
  await store.logSet(main().id, warmup.index, {
    weight: warmup.targetWeight,
    reps: 5,
    rir: null,
  });
  await store.setMissingPlates([2.5]);
  expect(main().sets.find((set) => set.index === top.index)?.targetReps).toEqual([5, 7]);
  await store.logSet(main().id, top.index, { weight: 145, reps: 6, rir: 1 });
  // The follow: at the drop off 145, their own reps.
  expect(shown()).toEqual(['135 × 4-6', '135 × 4-6', '135 × 4-6']);
  return { store, main, shown };
}

describe('the back-offs after a top set that stood in for its load', () => {
  it('a set added takes their reps', async () => {
    const { store, main, shown } = await followedStandIn();
    await store.recalibrate({ type: 'sets', entryId: main().id, workingDelta: 1 });
    // At 85ee7b6: [..., "135 × 5-7"], the top set's stand-in reps on the set added.
    expect({ backOffs: shown() }).toEqual({
      backOffs: ['135 × 4-6', '135 × 4-6', '135 × 4-6', '135 × 4-6'],
    });
  });

  it('picked up again, they keep their reps', async () => {
    const { store, shown } = await followedStandIn();
    await store.setCurrentLocation('home');
    await store.setCurrentLocation('gym');
    // At 85ee7b6: ["135 × 5-7", "135 × 5-7", "135 × 5-7"].
    expect({ backOffs: shown() }).toEqual({ backOffs: ['135 × 4-6', '135 × 4-6', '135 × 4-6'] });
  });
});
