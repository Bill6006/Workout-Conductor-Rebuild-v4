import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The eighth review of round N. The back-offs' replays read each logged back-off's step against the
 * log as it was before the change that called for them: a top set corrected after a back-off was
 * logged, a back-off's log deleted before one logged after it.
 *
 * The spec: "A correction to the top set moves its back-offs as the set logged right would have"
 * (docs/reports/maintenance-32.md), each back-off still logged moving the ones after it as its log
 * did (the sixth review). A back-off's step can read the top set: a back-off at the top of its
 * range after a top set at the top of its range is "two over" (`autoregulate`), a step up.
 *
 * What happens on abb5566: `logSet`'s top-set correction builds the back-offs' logs with
 * `backOffLogOf(session, …)` on the session from before the correction, so each back-off's plan
 * (`planAfter`) reads the top set's old log; `deleteLoggedSet` (and `undoLastSet`) pass the session
 * from before the delete to `backOffsAsPlanned`, so a back-off still logged reads the deleted one as
 * the set before it.
 *
 * Steps: the main lift's top set logged at 140 × 6 at 1 in reserve (asked 4-6 at 1), back-offs
 * 135; back-off 1 logged 135 × 6 at 2: two sets at the top of the range, back-offs 2 and 3 go to
 * 140. The top set's reps corrected to 5, what was lifted. Logged so from the start, back-off 1
 * moves nothing (the top set is not at the top of its range) and back-offs 2 and 3 stay at 135; after
 * the correction they stay at 140, a step over. The other way round (top set 5 corrected to 6) they
 * stay at 135 where the set logged right puts them at 140. A back-off corrected (the seventh
 * review's replay, from the session as corrected) reads it right, so the result hangs on which set
 * was fixed last. And: the top set 140 × 5 at 1, back-off 1 135 × 6 at 2 (nothing moves), back-off
 * 2 135 × 6 at 2 (two at the top of the range: back-off 3 to 140); back-off 1's log deleted (a set
 * logged on the wrong lift): back-off 2 now follows the top set, not at the top of its range, and
 * back-off 3 belongs at 135; it stays at 140.
 *
 * Also fails on 5dc61a7 and e6ed7ed. Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function startedMain() {
  const handle = createTestStore({ now: () => TEST_NOW });
  const { store } = handle;
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
  const workout = () => store.getSnapshot().session!.workout;
  const main = (): WorkoutEntry =>
    allEntries(workout().blocks).find((entry) => entry.backOffDrop !== undefined)!;
  expect(main()).toBeDefined();
  const top = main().sets.find((set) => set.tier === 'top')!;
  const [first] = main().sets.filter((set) => set.tier === 'back-off');
  const planned = main()
    .sets.filter((set) => set.tier === 'back-off')
    .map((set) => set.targetWeight);
  store.startWorkout();
  const backOffs = () =>
    main()
      .sets.filter((set) => set.tier === 'back-off')
      .map((set) => set.targetWeight);
  return { store, main, top, first: first!, planned, backOffs };
}

describe('a top set’s reps corrected after back-off 1 was logged', () => {
  it('6 corrected to 5: the back-offs after it where the set logged right puts them', async () => {
    const right = await startedMain();
    await right.store.logSet(right.main().id, right.top.index, {
      weight: right.top.targetWeight,
      reps: 5,
      rir: 1,
    });
    await right.store.logSet(right.main().id, right.first.index, {
      weight: right.planned[0]!,
      reps: 6,
      rir: 2,
    });
    // Logged right from the start: nothing moves.
    expect(right.backOffs()).toEqual(right.planned);

    const { store, main, top, first, planned, backOffs } = await startedMain();
    expect(top.targetReps).toEqual([4, 6]);
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 6, rir: 1 });
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 6, rir: 2 });
    // Two sets at the top of the range: a step up for back-offs 2 and 3.
    expect(backOffs()[1]!).toBeGreaterThan(planned[1]!);
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    // On abb5566: back-offs 2 and 3 stay a step up.
    expect(backOffs()).toEqual(right.backOffs());
  });

  it('5 corrected to 6: the step the set logged right gives', async () => {
    const right = await startedMain();
    await right.store.logSet(right.main().id, right.top.index, {
      weight: right.top.targetWeight,
      reps: 6,
      rir: 1,
    });
    await right.store.logSet(right.main().id, right.first.index, {
      weight: right.planned[0]!,
      reps: 6,
      rir: 2,
    });
    expect(right.backOffs()[1]!).toBeGreaterThan(right.planned[1]!);

    const { store, main, top, first, planned, backOffs } = await startedMain();
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 6, rir: 2 });
    expect(backOffs()).toEqual(planned);
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 6, rir: 1 });
    // On abb5566: back-offs 2 and 3 stay at the plan's load.
    expect(backOffs()).toEqual(right.backOffs());
  });
});

describe('a back-off’s log deleted before a back-off logged after it', () => {
  it('the ones still to come where the logs left standing put them', async () => {
    const right = await startedMain();
    const [, second] = right.main().sets.filter((set) => set.tier === 'back-off');
    await right.store.logSet(right.main().id, right.top.index, {
      weight: right.top.targetWeight,
      reps: 5,
      rir: 1,
    });
    await right.store.logSet(right.main().id, second!.index, {
      weight: right.planned[1]!,
      reps: 6,
      rir: 2,
    });
    // The top set and back-off 2 alone: nothing moves.
    expect(right.backOffs()).toEqual(right.planned);

    const { store, main, top, first, planned, backOffs } = await startedMain();
    const [, two] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 6, rir: 2 });
    await store.logSet(main().id, two!.index, { weight: planned[1]!, reps: 6, rir: 2 });
    // Back-offs 1 and 2 at the top of the range: back-off 3 a step up.
    expect(backOffs()[2]!).toBeGreaterThan(planned[2]!);
    store.deleteLoggedSet(main().id, first.index);
    // On abb5566: back-off 3 stays a step up.
    expect(backOffs()).toEqual(right.backOffs());
  });
});
