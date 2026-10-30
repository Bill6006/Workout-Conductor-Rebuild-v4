import { expect } from 'vitest';
import { createDefaultLocations } from '../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../core/validation/profile';
import { allEntries, type WorkoutEntry } from '../engine/workout/types';
import { record } from './records';
import { TEST_NOW, createTestStore } from './testStore';

/**
 * The fourteenth review of round N: the store as the thirteenth pass's tests set it up. The main
 * lift (barbell row) on a pull day, Hybrid, five days a week, after two straight sessions at 135:
 * planned at 140 × 4-6 at 1, back-offs 3 × 135 at 2. Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

export async function startedMain() {
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
      (entry) => entry.exerciseId === 'barbell-row' && !entry.stopped,
    )!;
  expect(main().backOffDrop).toBeDefined();
  store.startWorkout();
  const done = (index: number) =>
    store
      .getSnapshot()
      .session!.completed.sets.some((log) => log.entryId === main().id && log.setIndex === index);
  /** The back-offs not logged, in order: their load. */
  const toCome = () =>
    main()
      .sets.filter((set) => set.tier === 'back-off' && !done(set.index))
      .map((set) => set.targetWeight as number);
  /** The back-offs not logged, in order: their reps. */
  const repsToCome = () =>
    main()
      .sets.filter((set) => set.tier === 'back-off' && !done(set.index))
      .map((set) => [set.targetReps[0], set.targetReps[1]]);
  const headline = () => store.getSnapshot().session!.lastSummary?.headline ?? '';
  /** Home and back to the gym: the lift stopped there and picked up again here. */
  const homeAndBack = async () => {
    const gym = store.getSnapshot().profile!.currentLocationId;
    const home = store.getSnapshot().locations.find((place) => place.id !== gym)!;
    await store.setCurrentLocation(home.id);
    await store.setCurrentLocation(gym);
  };
  /** Swapped for the dumbbell row and back. */
  const swapAwayAndBack = async () => {
    await store.recalibrate({ type: 'replace', entryId: main().id, exerciseId: 'dumbbell-row' });
    const stand = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-row' && !entry.stopped,
    )!;
    await store.recalibrate({ type: 'replace', entryId: stand.id, exerciseId: 'barbell-row' });
  };
  return { store, main, done, toCome, repsToCome, headline, homeAndBack, swapAwayAndBack };
}

export type Started = Awaited<ReturnType<typeof startedMain>>;
