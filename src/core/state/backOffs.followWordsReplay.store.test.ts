import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The twelfth review of round N. The follow of a top set logged with back-offs already logged (a
 * correction, or, since the eleventh pass, a top set logged afresh after its log was taken back)
 * replays each logged back-off's step onto the ones after it (`backOffLogs`), but its headline names
 * the load before that replay: "back-offs at 140 lb, from the top set at 145 lb" over back-offs at
 * 130, and "back-offs kept at 145 lb, the weight you set" over back-offs a grind took to 140.
 *
 * The rules (docs/reports/maintenance-32.md): the first review's LOW, "the follow's headline said
 * the sets come down when a heavier top set took them up" (fixed: the follow says what it did, "in
 * its own words"); the eleventh pass, "the follow says when a step is held". The recalibrate.ts
 * comment on the headline: "What the follow did, in its own words".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The top set lifted as
 * planned (140 × 5 at 1); back-off 1 a grind (135 × 3 at 0): back-offs 2 and 3 at 130. The top
 * set's log deleted and logged afresh at 145 × 5 at 1 (the eleventh pass's path), or corrected to
 * it. Then: the top set skipped, the coach's 145 taken by the back-offs, the skip corrected to 140 ×
 * 5 at 1; back-off 1 a grind at 145 (145 × 3 at 0); the top set corrected again, 140 × 6 at 1.
 *
 * What happens on f858500: back-offs at 130 under "back-offs at 140 lb, from the top set at 145
 * lb."; back-offs at 140 under "back-offs kept at 145 lb, the weight you set." On d119260 the same
 * for a correction (the sixth pass's replay); the top set logged afresh there lost the grind's step
 * (the eleventh review's finding), so the eleventh pass carried the words into that path. Synthetic
 * data only.
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

/** The loads a headline names for the back-offs ("back-offs at 140 lb", "kept at 145 lb"). */
const said = (text: string) => [...text.matchAll(/back-offs (?:at|kept at) (\d+) lb/g)];

describe('the follow of a top set logged with a back-off already logged', () => {
  it('names the load the back-offs stand at, corrected or logged afresh', async () => {
    for (const how of ['corrected', 'afresh'] as const) {
      const { store, main, toCome, headline } = await startedMain();
      const top = main().sets.find((set) => set.tier === 'top')!;
      const [first] = main().sets.filter((set) => set.tier === 'back-off');
      expect(top.targetWeight).toBe(140);
      await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
      await store.logSet(main().id, first!.index, { weight: 135, reps: 3, rir: 0 });
      expect(toCome()).toEqual([130, 130]);
      if (how === 'afresh') store.deleteLoggedSet(main().id, top.index);
      await store.logSet(main().id, top.index, { weight: 145, reps: 5, rir: 1 });
      const loads = toCome();
      const names = said(headline()).map((match) => Number(match[1]));
      expect(loads).toEqual([130, 130]);
      // On f858500: "Barbell Row: back-offs at 140 lb, from the top set at 145 lb." over 130.
      expect({ how, names }, headline()).toEqual({ how, names: [loads[0]] });
    }
  });

  it('says a weight set by hand is kept only where the back-offs stand at it', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    store.skipSet(main().id, top.index);
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 145 });
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    expect(toCome()).toEqual([145, 145, 145]);
    // A grind at the weight set: the ones after it a step down.
    await store.logSet(main().id, first!.index, { weight: 145, reps: 3, rir: 0 });
    expect(toCome()).toEqual([140, 140]);
    // The top set corrected: the grind's step stays on them.
    await store.logSet(main().id, top.index, { weight: 140, reps: 6, rir: 1 });
    const loads = toCome();
    const names = said(headline()).map((match) => Number(match[1]));
    expect(loads).toEqual([140, 140]);
    // On f858500: "Barbell Row: back-offs kept at 145 lb, the weight you set." over 140.
    expect({ names }, headline()).toEqual({ names: [140] });
  });
});
