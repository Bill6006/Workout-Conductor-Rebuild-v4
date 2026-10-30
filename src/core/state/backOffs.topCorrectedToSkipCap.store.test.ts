import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The twelfth review of round N. A top set's log corrected to a skip replays the back-offs in the
 * store's `backOffsAsPlanned`, its branch for the top set, capped at the top set's plan (`top:
 * top.targetWeight`), where `backOffCap` caps none for a top set skipped. Every other reader of the
 * same logs caps none: the live follow, a set added (`asBackOffs`), the lift picked up again. So the
 * back-offs still to come stand a step under where a top set skipped from the start puts them, and a
 * set added at once comes in a step over them.
 *
 * The rules (docs/reports/maintenance-32.md): the eleventh pass, "one rule caps the back-offs
 * everywhere (`backOffCap`): the top set as lifted, one still to come as planned, none for a top set
 * skipped"; its first LOW, "the code disagreed on what caps the back-offs with no top set lifted";
 * item 11, "its log taken back (an undo, a delete, a correction to a skip) puts them back where the
 * plan has them", each back-off still logged moving the ones after it as its log did (the fourth).
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. (A) The top set
 * skipped; back-off 1 lifted clearly easy (135 × 8 at 4), back-off 2 too (140 × 8 at 4). (B) The top
 * set lifted as planned (140 × 5 at 1); the same two back-offs; the top set's log corrected to a skip
 * (0 reps); then a set added.
 *
 * What happens on f858500: back-off 3 at 145 in (A), 140 in (B); the set added in (B) at 145 beside
 * back-off 3 at 140. On d119260 (A) and (B) differ the same way; the set added took back-off 3's 140.
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

describe('a top set’s log corrected to a skip, back-offs logged clearly easy', () => {
  it('leaves the back-offs where a top set skipped from the start puts them', async () => {
    // (A) The top set skipped from the start.
    const a = await startedMain();
    const topA = a.main().sets.find((set) => set.tier === 'top')!;
    const [firstA, secondA] = a.main().sets.filter((set) => set.tier === 'back-off');
    expect(topA.targetWeight).toBe(140);
    a.store.skipSet(a.main().id, topA.index);
    await a.store.logSet(a.main().id, firstA!.index, { weight: 135, reps: 8, rir: 4 });
    await a.store.logSet(a.main().id, secondA!.index, { weight: 140, reps: 8, rir: 4 });
    const skippedFirst = a.toCome();
    expect(skippedFirst).toEqual([145]);

    // (B) The top set lifted, then its log corrected to a skip.
    const b = await startedMain();
    const topB = b.main().sets.find((set) => set.tier === 'top')!;
    const [firstB, secondB] = b.main().sets.filter((set) => set.tier === 'back-off');
    await b.store.logSet(b.main().id, topB.index, { weight: 140, reps: 5, rir: 1 });
    await b.store.logSet(b.main().id, firstB!.index, { weight: 135, reps: 8, rir: 4 });
    await b.store.logSet(b.main().id, secondB!.index, { weight: 140, reps: 8, rir: 4 });
    expect(b.toCome()).toEqual([140]);
    await b.store.logSet(b.main().id, topB.index, { weight: 140, reps: 0, rir: null });
    const corrected = b.toCome();
    await b.store.recalibrate({ type: 'sets', entryId: b.main().id, workingDelta: 1 });
    const added = b.toCome();
    // On f858500: corrected [140] against [145]; then [140, 145] with the set added.
    expect({ corrected, added }).toEqual({
      corrected: skippedFirst,
      added: [...skippedFirst, ...skippedFirst],
    });
  });
});
