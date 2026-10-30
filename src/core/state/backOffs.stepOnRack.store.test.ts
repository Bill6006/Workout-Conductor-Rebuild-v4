import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { fitWeight, loadingFor } from '../../engine/loading/loading';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The fifteenth review of round N. A back-off's step down lands on the weight below it the place
 * has (`nudge`), then is held at no less than one step and the bar (`backOffStepped`: "never under
 * the bar, nor one step"; `backOffLoadAfter`: `Math.max(options.step, moved)`). A rack whose
 * smallest plates are 25 lb has a step of 50 lb on a 45 lb bar (two of its smallest plate), so the
 * weight below 95, the bar, is held at 50: a load no plate on that rack makes. The twelfth pass made
 * a step held at the top set or its cap land on a weight the place has; the floor of one step was
 * left as it was.
 *
 * The rules (docs/reports/maintenance-32.md): item 11, "The rest are back-offs ... to the nearest
 * weight the place has, never under the bar"; the twelfth pass, "a step held at the top set, or at
 * its cap, lands on a weight the place has"; the code's own words at `backOffLoadAfter`: "on a weight
 * the place has ... so never under the bar either: the bar is the least weight it has, and the floor
 * of its fit".
 *
 * Steps: Hybrid, five days a week; the barbell row's last two sessions straight at 135 × 5 at 2. The
 * gym's rack has 45 and 25 lb plates only (45, 95, 135, 145, 185 ... on the bar): the row planned at
 * 135 × 6-8 at 1 (the step to 140 held: the next weight here is 145), back-offs 3 × 95 × 6-8 at 2.
 * The top set lifted as asked (135 × 7 at 1); back-off 1 a grind, 95 × 4 at 0: back-offs 2 and 3 a
 * step down.
 *
 * What happens at 1fcd67a (and at 9e9078e): back-offs 2 and 3 at 50 lb, which the rack cannot make
 * (the logger names the nearest, 45). Synthetic data only.
 *
 * The fix (the fifteenth pass): a step's floor is the least load it lands on (`stepFloor`): the bar,
 * and one step only where the place's weights are unknown, for a back-off's step, the back-offs'
 * step off the top set and a straight set's alike. The last two tests are the pass's own.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

describe('a back-off’s step down on a rack whose smallest plates are 25 lb', () => {
  it('lands on a weight the rack makes', async () => {
    const { store } = createTestStore({ now: () => TEST_NOW });
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const gym = store.getSnapshot().profile!.currentLocationId;
    await store.saveLoading(gym, 'plates', { kind: 'plates', perSide: [45, 25] });
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
    const working = () => row().sets.filter((set) => set.kind === 'working');
    expect(working().map((set) => [set.tier, set.targetWeight])).toEqual([
      ['top', 135],
      ['back-off', 95],
      ['back-off', 95],
      ['back-off', 95],
    ]);
    store.startWorkout();
    const [top, first, ...rest] = working();
    await store.logSet(row().id, top!.index, { weight: 135, reps: 7, rir: 1 });
    await store.logSet(row().id, first!.index, { weight: 95, reps: 4, rir: 0 });
    const place = store.getSnapshot().locations.find((one) => one.id === gym);
    const loading = loadingFor(
      place?.loading,
      { missingPlates: [] },
      requireExercise('barbell-row'),
      'lb',
    );
    const loads = rest.map(
      (set) => working().find((each) => each.index === set.index)?.targetWeight as number,
    );
    expect(loads).toHaveLength(2);
    // At 1fcd67a: [50, 50], between the bar and 95.
    expect({ unmade: loads.filter((load) => fitWeight(load, loading, 45) !== load) }).toEqual({
      unmade: [],
    });
  });
});

/**
 * The fifteenth pass's own: on the same rack, a step down that reaches the bar lands on it, for the
 * back-offs' step off a top set ground out (the row's sessions at 95: top set 95 × 6-8, back-offs at
 * the bar) and for a straight set's (Hypertrophy focus runs the row straight, 95 × 6-8). At 1fcd67a
 * both were held at one step: 50 lb.
 */
async function rowAt(load: number, programStyle: UserProfile['programStyle']) {
  const { store } = createTestStore({ now: () => TEST_NOW });
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay, programStyle },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const gym = store.getSnapshot().profile!.currentLocationId;
  await store.saveLoading(gym, 'plates', { kind: 'plates', perSide: [45, 25] });
  const db = await store.getDatabase();
  for (const daysAgo of [7, 3]) {
    for (const exerciseId of ['barbell-bench-press', 'back-squat', 'barbell-row']) {
      const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
      await db.put('workouts', {
        ...record(0, exerciseId, [
          [8, load, 2],
          [8, load, 2],
          [8, load, 2],
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
  const working = () => row().sets.filter((set) => set.kind === 'working');
  store.startWorkout();
  return { store, row, working };
}

describe('a step down to the bar on a rack whose smallest plates are 25 lb', () => {
  it('lands the back-offs on the bar after a top set ground out', async () => {
    const { store, row, working } = await rowAt(95, 'hybrid');
    expect(working().map((set) => [set.tier, set.targetWeight])).toEqual([
      ['top', 95],
      ['back-off', 45],
      ['back-off', 45],
      ['back-off', 45],
    ]);
    await store.logSet(row().id, working()[0]!.index, { weight: 95, reps: 3, rir: 0 });
    // At 1fcd67a: [50, 50, 50].
    expect(
      working()
        .slice(1)
        .map((set) => set.targetWeight),
    ).toEqual([45, 45, 45]);
  });

  it('lands a straight set on the bar after one ground out', async () => {
    const { store, row, working } = await rowAt(95, 'hypertrophy-focus');
    expect(working().map((set) => [set.tier ?? 'straight', set.targetWeight])).toEqual([
      ['straight', 95],
      ['straight', 95],
      ['straight', 95],
    ]);
    await store.logSet(row().id, working()[0]!.index, { weight: 95, reps: 3, rir: 0 });
    // At 1fcd67a: [50, 50].
    expect(
      working()
        .slice(1)
        .map((set) => set.targetWeight),
    ).toEqual([45, 45]);
  });
});
