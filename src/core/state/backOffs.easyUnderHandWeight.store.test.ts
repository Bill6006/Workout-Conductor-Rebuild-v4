import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The eleventh review of round N. Back-offs at a weight the lifter took over the top set as lifted
 * (`manual.backOffs`: kept through a correction of the top set, "back-offs kept at 145 lb, the
 * weight you set") are stepped from the back-off's load and then capped at the top set as lifted
 * (`performance`, its `topLifted` cap, the third review's; since the tenth pass the store's replays
 * cap the same way). A back-off logged clearly easy takes the ones after it down to the top set's
 * load, and the words say the opposite: "the next 2 sets go up 5 lb".
 *
 * The rules (docs/reports/maintenance-32.md): item 11, the back-offs move "a step up after one
 * clearly easy and down after a grind"; the ninth pass, the weight set by hand stays "a correction of
 * the top set included ('back-offs kept at 115 lb, the weight you set')"; the first review's LOW:
 * "the follow's headline said the sets come down when a heavier top set took them up" (fixed: the
 * follow says what it did, "in its own words").
 *
 * Steps (the app's path: the coach offers a weight only on a lift with no set lifted): the main
 * lift planned at 140 × 4-6 at 1, back-offs 135. The top set skipped; the coach's "Take 145 lb
 * today" taken (the top set done, so the back-offs take it: 145); the skip corrected to what was
 * lifted, 140 × 5 at 1 ("back-offs kept at 145 lb, the weight you set"). Back-off 1 logged clearly
 * easy, 145 × 8 at 4.
 *
 * What happens on 905ce7f (and on 480d5a1): back-offs 2 and 3 go from 145 to 140, and the headline
 * reads "Barbell Row: Set 2: 8 reps with 4 in reserve against a target of 2: the next 2 sets go up
 * 5 lb." Synthetic data only.
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
  const headline = () => store.getSnapshot().session!.lastSummary?.headline ?? '';
  return { store, main, toCome, headline };
}

describe('back-offs kept at the coach’s weight over the top set as lifted, one logged clearly easy', () => {
  it('takes the ones after it no lighter, and says what it did', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    expect(top.targetWeight).toBe(140);
    store.skipSet(main().id, top.index);
    // The coach's "Take 145 lb today": the top set done (skipped), the weight is the back-offs'.
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 145 });
    // The skip corrected to what was lifted: the back-offs keep the weight taken.
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    expect(headline()).toContain('back-offs kept at 145 lb, the weight you set');
    expect(toCome()).toEqual([145, 145, 145]);
    // Clearly easy: 8 reps at 4 against 4-6 at 2.
    await store.logSet(main().id, first!.index, { weight: 145, reps: 8, rir: 4 });
    const loads = toCome();
    const saysUp = /go up/.test(headline());
    // On 905ce7f: [140, 140], under the 145 just lifted easily, beside "the next 2 sets go up 5 lb".
    expect(
      { noLighter: Math.min(...loads) >= 145, wordsMatch: !(saysUp && Math.min(...loads) < 145) },
      `${loads.join(', ')}: ${headline()}`,
    ).toEqual({ noLighter: true, wordsMatch: true });
    // Held where the lifter set them, in its own words.
    expect(loads).toEqual([145, 145]);
    expect(headline()).toBe('Barbell Row: back-offs stay at 145 lb, the weight you set.');
  });

  it('back-offs at the top set’s load stay there after one clearly easy, and say why', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    // The top set lifted as planned; the back-offs set by hand to its load.
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 140 });
    expect(toCome()).toEqual([140, 140, 140]);
    await store.logSet(main().id, first!.index, { weight: 140, reps: 8, rir: 4 });
    expect(toCome()).toEqual([140, 140]);
    expect(headline()).toBe('Barbell Row: back-offs stay at 140 lb, no heavier than the top set.');
  });
});
