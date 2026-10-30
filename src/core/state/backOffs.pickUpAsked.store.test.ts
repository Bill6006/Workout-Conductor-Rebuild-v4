import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The twelfth review of round N. A main lift picked up again after its top set (home and back) has
 * its back-offs built from a fresh straight target, each set then given the back-offs' tier, reps,
 * reserve and load (the generator's pick-up, its `backOff` fields), but the fresh target's `asked`
 * stays on them: where the place pushed that target (a plate missing today), they carry the load the
 * top set was planned at as the load they stand in for. When the plate is found again, the refit
 * gives a pushed set the load it stands in for, so the back-offs go to the top set's planned load:
 * over the top set as lifted, the drop gone. `asBackOffs` and `withBackOffs` take `asked` off a
 * back-off; the pick-up does not.
 *
 * The rules (docs/reports/maintenance-32.md): item 11, "The back-offs are never heavier than the top
 * set as lifted"; "A lift picked up again, back at the gym or swapped back to, carries on its
 * back-offs after its top set, as it was lifted"; `backOffLoad`'s doc: "never over the top set, and,
 * while a drop is in force, under the top set where the place has a weight under it".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The top set taken
 * lighter, 135 × 5 at 1: back-offs 130. The 2.5 and 5 lb plates marked missing (back-offs 125, for
 * 130). Home and back to the gym (the lift picked up again). The plates found again.
 *
 * What happens on f858500 (and on d119260): after the pick-up the back-offs carry `asked` 140; with
 * the plates back they go to 140, over the top set lifted at 135. Synthetic data only.
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
  const entries = () => allEntries(store.getSnapshot().session!.workout.blocks);
  const exerciseId = entries().find((entry) => entry.backOffDrop !== undefined)!.exerciseId;
  const main = (): WorkoutEntry =>
    entries().find((entry) => entry.exerciseId === exerciseId && !entry.stopped)!;
  store.startWorkout();
  const toCome = () => {
    const done = store.getSnapshot().session!.completed.sets;
    return main().sets.filter(
      (set) =>
        set.tier === 'back-off' &&
        !done.some((log) => log.entryId === main().id && log.setIndex === set.index),
    );
  };
  return { store, main, toCome };
}

describe('a main lift picked up again after its top set, a plate missing, then found again', () => {
  it('keeps its back-offs at the drop off the top set as lifted', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    expect(top.targetWeight).toBe(140);
    await store.logSet(main().id, top.index, { weight: 135, reps: 5, rir: 1 });
    expect(toCome().map((set) => set.targetWeight)).toEqual([130, 130, 130]);
    await store.setMissingPlates([2.5, 5]);
    await store.setCurrentLocation('home');
    await store.setCurrentLocation('gym');
    const asked = toCome().map((set) => set.asked?.weight ?? null);
    // Picked up again, the back-offs stand at the drop off the top set, no load asked beside it.
    expect({ asked }).toEqual({ asked: [null, null, null] });
    await store.setMissingPlates([]);
    // On f858500: asked [140, 140, 140] after the pick-up; [140, 140, 140] with the plates back.
    expect({ loads: toCome().map((set) => set.targetWeight) }, `asked ${asked.join(', ')}`).toEqual(
      { loads: [130, 130, 130] },
    );
  });
});
