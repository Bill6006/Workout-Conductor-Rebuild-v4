import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The fifteenth review of round N. At a place whose plates cannot make the load step (no 2.5 lb
 * plates: 135, then 145), the plan holds the load and pushes the reps instead ("The next weight here
 * after 135 lb is 145: the reps go up first, and the load follows once they are earned"): a held
 * step, the lift's own target at this place, with no load it stands in for (`fitToPlace`, no
 * `asked`). On top set plus back-offs the plan gives the back-offs the top set's reps
 * (`withBackOffs`): top set 135 × 6-8, back-offs 125 × 6-8. The refit of a lift under way before its
 * top set fits the top set again and leaves the back-offs' reps as they are (`refitBackOffs` moves
 * the reps only of a back-off that stood in for a load, `set.asked`). So once the place makes the
 * step (2.5 lb plates added to its rack), the top set comes back to 140 × 4-6 and the back-offs stay
 * at 6-8, at 135: more reps than the top set at 96% of its load, at more reserve. The other way, a
 * rack that loses its 2.5s under a lift under way, the top set goes to 135 × 6-8 and its back-offs
 * stay at 4-6, where the plan at that rack gives them 6-8.
 *
 * The rules: the owner's settled answer, "back-offs 5% lighter than the top set as lifted, same
 * reps, 2 in reserve"; docs/reports/maintenance-32.md, item 11, "The rest are back-offs at the same
 * reps, 5% lighter"; the twelfth pass, "The back-offs take one rule wherever their load is worked
 * out, the refit for the place's weights included ... at their own reps ... (the owner's "same
 * reps")"; the thirteenth, "They take the top set's own reps (`ownRepsOf`)".
 *
 * Steps: Hybrid, five days a week; the barbell row's last two sessions straight at 135 × 5 at 2.
 * (1) The gym's rack has no 2.5 lb plates: the row planned at 135 × 6-8 at 1 (the step held), back-
 * offs 3 × 125 × 6-8 at 2. A ramp logged; the gym's 2.5s added to its rack. (2) The gym's rack is
 * full: the row planned at 140 × 4-6 at 1, back-offs 3 × 135 × 4-6. A ramp logged; the 2.5s taken
 * off the rack.
 *
 * What happens at 1fcd67a (and at 9e9078e): (1) top set 140 × 4-6, back-offs 135 × 6-8; (2) top set
 * 135 × 6-8, back-offs 125 × 4-6. Synthetic data only.
 *
 * The fix (the fifteenth pass): a refit under a top set still to come gives its back-offs the top
 * set's own reps as it now stands (`refitBackOffs`), as the plan does.
 */

const DAY = 86_400_000;
const NO_SMALL = [45, 35, 25, 10, 5];
const FULL = [45, 35, 25, 10, 5, 2.5];
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function rowBegunAt(perSide: number[]) {
  const { store } = createTestStore({ now: () => TEST_NOW });
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const gym = store.getSnapshot().profile!.currentLocationId;
  await store.saveLoading(gym, 'plates', { kind: 'plates', perSide });
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
  const row = (): WorkoutEntry =>
    allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-row' && !entry.stopped,
    )!;
  /** Each working set: its tier, load and reps. */
  const working = () =>
    row()
      .sets.filter((set) => set.kind === 'working')
      .map((set) => [set.tier, set.targetWeight, set.targetReps.join('-')]);
  const planned = working();
  store.startWorkout();
  const ramp = row().sets.find((set) => set.kind === 'warmup')!;
  await store.logSet(row().id, ramp.index, { weight: ramp.targetWeight, reps: 5, rir: 5 });
  return { store, gym, working, planned };
}

describe('a held step fitted away, or into, under a main lift begun before its top set', () => {
  it('the 2.5s added: the back-offs take the top set’s reps again', async () => {
    const { store, gym, working, planned } = await rowBegunAt(NO_SMALL);
    expect(planned).toEqual([
      ['top', 135, '6-8'],
      ['back-off', 125, '6-8'],
      ['back-off', 125, '6-8'],
      ['back-off', 125, '6-8'],
    ]);
    await store.saveLoading(gym, 'plates', { kind: 'plates', perSide: FULL });
    expect(working()[0]).toEqual(['top', 140, '4-6']);
    // At 1fcd67a: ['back-off', 135, '6-8'] on each, more reps than the top set at 96% of its load.
    expect(working().slice(1)).toEqual([
      ['back-off', 135, '4-6'],
      ['back-off', 135, '4-6'],
      ['back-off', 135, '4-6'],
    ]);
  });

  it('the 2.5s taken off: the back-offs take the held step’s reps, as the plan there does', async () => {
    const { store, gym, working, planned } = await rowBegunAt(FULL);
    expect(planned).toEqual([
      ['top', 140, '4-6'],
      ['back-off', 135, '4-6'],
      ['back-off', 135, '4-6'],
      ['back-off', 135, '4-6'],
    ]);
    await store.saveLoading(gym, 'plates', { kind: 'plates', perSide: NO_SMALL });
    expect(working()[0]).toEqual(['top', 135, '6-8']);
    // At 1fcd67a: ['back-off', 125, '4-6'] on each.
    expect(working().slice(1)).toEqual([
      ['back-off', 125, '6-8'],
      ['back-off', 125, '6-8'],
      ['back-off', 125, '6-8'],
    ]);
  });
});
