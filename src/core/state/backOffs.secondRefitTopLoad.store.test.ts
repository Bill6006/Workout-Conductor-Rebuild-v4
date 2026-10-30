import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The thirteenth review of round N. A main lift under way before its top set (a ramp logged) is
 * fitted in place when the weights change (`refitStarted`). The 2.5 lb plates marked missing: the
 * top set (140) can't be made and stands in at 135 × 5-7 for 140 × 4-6, the place's note saying so
 * (`progression.rack`: loaded 135, asked 140, one extra rep); the back-offs (135, the drop off 140)
 * stay. At the next refit (another plate marked missing, the same plates saved again, a change of
 * place) the back-offs at 135 are read as sets that note moved down from 140 (`changedBefore`: no
 * `asked`, at the rack's loaded weight), and become stand-ins for 140 × 3-5. With the plates back,
 * the back-offs are at 140 × 3-5: the top set's own load, two reps under its range. Lifted after
 * that refit, the top set's follow gives them the reps of the load they "stood in for", 3-5 (the
 * twelfth pass's `backOffsReplayed`).
 *
 * The rules (docs/reports/maintenance-32.md, item 11): "The rest are back-offs at the same reps, 5%
 * lighter"; `backOffLoad`: "never the top set's own while a drop is in force"; the twelfth pass:
 * "The back-offs take one rule wherever their load is worked out, the refit for the place's weights
 * included: the drop off the top set as lifted, to the nearest weight the place has, at their own
 * reps, never a stand-in's".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. A ramp logged; the
 * 2.5 lb plates marked missing; then the 10 lb plates too; then every plate back. Or, after the
 * second change, the top set lifted at 130 × 5 at 1.
 *
 * What happens at 85ee7b6: the back-offs at 140 × 3-5 once the plates are back (5762c00 the same);
 * the top set lifted at 130 after the second change, the back-offs at 125 × 3-5 (5762c00: at 4-6).
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
  return { store, main, shown };
}

/** A ramp logged, the 2.5 lb plates marked missing, then the 10 lb plates too. */
async function twoChanges() {
  const started = await startedMain();
  const { store, main, shown } = started;
  const top = main().sets.find((set) => set.tier === 'top')!;
  const warmup = main().sets.find((set) => set.kind === 'warmup')!;
  expect(top.targetWeight).toBe(140);
  expect(shown()).toEqual(['135 × 4-6', '135 × 4-6', '135 × 4-6']);
  await store.logSet(main().id, warmup.index, {
    weight: warmup.targetWeight,
    reps: 5,
    rir: null,
  });
  await store.setMissingPlates([2.5]);
  // The top set stands in at 135 for 140; the back-offs, at 135 already, stay.
  expect(main().sets.find((set) => set.index === top.index)?.asked?.weight).toBe(140);
  expect(shown()).toEqual(['135 × 4-6', '135 × 4-6', '135 × 4-6']);
  await store.setMissingPlates([2.5, 10]);
  return { ...started, top };
}

describe('the back-offs at the load a top set standing in for its own sits at', () => {
  it('come back at the drop off the top set, at its reps, once the plates are back', async () => {
    const { store, shown } = await twoChanges();
    await store.setMissingPlates([]);
    // At 85ee7b6 (and 5762c00): ["140 × 3-5", "140 × 3-5", "140 × 3-5"].
    expect({ backOffs: shown() }).toEqual({ backOffs: ['135 × 4-6', '135 × 4-6', '135 × 4-6'] });
  });

  it('keep their own reps when the top set is lifted after the second change', async () => {
    const { store, main, shown, top } = await twoChanges();
    await store.logSet(main().id, top.index, { weight: 130, reps: 5, rir: 1 });
    // At 85ee7b6: ["125 × 3-5", "125 × 3-5", "125 × 3-5"], the reps of a load they never stood
    // in for.
    expect({ reps: shown().map((line) => line.split(' × ')[1]) }).toEqual({
      reps: ['4-6', '4-6', '4-6'],
    });
  });
});
