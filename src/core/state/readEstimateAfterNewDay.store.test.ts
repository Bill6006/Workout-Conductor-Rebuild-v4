import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The third adversarial review of Maintenance 33: on the day the reserve-check estimate lapses, the
 * estimate the store keeps for today's sets stays on while the log is read as logged again.
 *
 * Steps: a lifter who opted in to reserve checks has four checks on the cable curl, each judged 1 in
 * reserve at 12 reps with 15 in all: an error of 2, so the log the rules read has every covered
 * reserve 2 higher, and the store keeps that estimate beside it (`readEstimate`, which the coach
 * reads today's first sets through). The app stays open. Six weeks pass with no check (the last one
 * 43 days ago): at the new day the Today screen asks the store to check the session again
 * (`useTodayWorkout` calls `refreshSession` at each local day).
 *
 * The rule: `readEstimate` is "The reserve-check estimate the log is read through (`readHistory`),
 * or none: today's sets are read through it too" (appStore.ts); the second review's fix: "Today's
 * sets are read as the rules read the log (`readLoggedReserve`; the estimate kept beside the read
 * log)"; item 43: "Six weeks with no reading start the learning again" (`RESTART_DAYS`), when nothing
 * is read through an estimate.
 *
 * What happens: `refreshSession` reads the log again (`readHistoryOf`, now as logged: the estimate
 * has lapsed) and sets `readHistory` alone; `setState` recomputes `readEstimate` only for a change
 * of the history, the profile or the resets. So the log reads every cable curl as logged while
 * `readEstimate` still corrects by 2: the coach's "too soon" check reads today's first cable curl 2
 * reps further from failure than the rested sessions it sets it against, the mismatch the second
 * review's fix was made to end. (Before that fix, 80893d4, there was no kept estimate.)
 *
 * Synthetic data only.
 */

const DAY = 86_400_000;

/** A cable curl session: an ordinary set and a check, each 12 reps judged 1 in reserve, 15 in all. */
function checkRecord(daysAgo: number): WorkoutRecord {
  const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
  const set = {
    kind: 'working' as const,
    reps: 12,
    weight: 40,
    rir: 1,
    completed: true,
    targetReps: [10, 15] as [number, number],
    targetRir: 1,
    loggedAt: when,
  };
  return {
    id: `w-check-${daysAgo}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'pull-arms',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: 'cable-curl',
        plannedSets: 2,
        sets: [
          { ...set, setIndex: 0 },
          { ...set, setIndex: 1, reserveCheck: { total: 15, style: 'hybrid' } },
        ],
      },
    ],
  };
}

describe('the estimate kept beside the read log', () => {
  it('lapses with the log’s reading of it at a new day', async () => {
    const clock = { now: TEST_NOW };
    const { store } = createTestStore({ now: () => clock.now });
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), reserveCheck: true },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await store.getDatabase();
    for (const daysAgo of [5, 12, 19, 26]) await db.put('workouts', checkRecord(daysAgo));
    await store.hydrate();

    const ordinary = () =>
      store
        .getSnapshot()
        .readHistory.flatMap((record) => record.entries)
        .flatMap((entry) => entry.sets)
        .filter((set) => !set.reserveCheck)
        .map((set) => set.rir);
    // Read through the estimate: 1 judged, 2 more.
    expect(ordinary()).toEqual([3, 3, 3, 3]);
    expect(store.getSnapshot().readEstimate?.correction).toBe(2);

    // Six weeks later, the app still open: the new day's check of the session.
    clock.now = new Date(Date.parse(TEST_NOW) + 38 * DAY).toISOString();
    store.refreshSession();
    // The log is read as logged again: the estimate has lapsed (43 days since the last check) ...
    expect(ordinary()).toEqual([1, 1, 1, 1]);
    // ... and so must the estimate today's sets are read through.
    expect(store.getSnapshot().readEstimate ?? null).toBeNull();
  });
});
