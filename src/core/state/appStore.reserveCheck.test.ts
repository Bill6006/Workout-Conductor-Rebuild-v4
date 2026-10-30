import { describe, expect, it } from 'vitest';
import { getExercise } from '../../catalog/exercises/catalog';
import { suitsReserveCheck } from '../../engine/progression/reserveCheck';
import { recalibrate as runRecalibration } from '../../engine/recalibration/recalibrate';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { buildCompletion, buildWorkoutRecord } from './workoutRecordBuilder';

const DAY = 86_400_000;

/** A store set up with the plan's defaults and, unless said, the lifter's yes to reserve checks. */
async function ready(
  overrides: Partial<UserProfile> = {},
  history: WorkoutRecord[] = [],
  options: Parameters<typeof createTestStore>[0] = {},
) {
  const handle = createTestStore(options);
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), reserveCheck: true, ...overrides },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  if (history.length > 0) {
    const db = await handle.store.getDatabase();
    for (const record of history) await db.put('workouts', record);
    await handle.store.hydrate();
  }
  return handle.store;
}

type Store = Awaited<ReturnType<typeof ready>>;

const entries = (store: Store) => allEntries(store.getSnapshot().session!.workout.blocks);

/** The first lift in the plan a check suits. */
function checkable(store: Store): WorkoutEntry {
  const found = entries(store).find((entry) => suitsReserveCheck(getExercise(entry.exerciseId)));
  if (!found) throw new Error('no lift in the plan suits a check');
  return found;
}

const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');

/** Logs every set of an entry as prefilled, the last one with `last` values. */
async function logAll(
  store: Store,
  entry: WorkoutEntry,
  last: Parameters<Store['logSet']>[2] | null = null,
) {
  const sets = entry.sets;
  for (const [position, set] of sets.entries()) {
    const values =
      position === sets.length - 1 && last
        ? last
        : { weight: set.targetWeight, reps: set.targetReps[0], rir: set.targetRir };
    await store.logSet(entry.id, set.index, values);
  }
}

/**
 * A saved workout of cable curls: an ordinary set of `stop` reps at `judged`, then the check, `stop`
 * reps at `judged` and `total` in all.
 */
function checkRecord(daysAgo: number, stop: number, judged: number, total: number): WorkoutRecord {
  const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
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
          {
            kind: 'working',
            reps: stop,
            weight: 40,
            rir: judged,
            completed: true,
            setIndex: 0,
            targetReps: [10, 15],
            targetRir: 1,
            loggedAt: when,
          },
          {
            kind: 'working',
            reps: stop,
            weight: 40,
            rir: judged,
            completed: true,
            setIndex: 1,
            targetReps: [10, 15],
            targetRir: 1,
            loggedAt: when,
            reserveCheck: { total, style: 'hybrid' },
          },
        ],
      },
    ],
  };
}

describe("today's reserve check", () => {
  it('goes on the last working set of the first lift in the plan a check suits', async () => {
    const store = await ready();
    const entry = checkable(store);
    const last = working(entry)[working(entry).length - 1]!;
    expect(store.reserveCheckSetFor()).toEqual({
      entryId: entry.id,
      setIndex: last.index,
      exerciseId: entry.exerciseId,
    });
  });

  it("is none without the lifter's yes, or under a style that takes nothing to failure", async () => {
    expect((await ready({ reserveCheck: false })).reserveCheckSetFor()).toBeNull();
    expect((await ready({ programStyle: 'foundation' })).reserveCheckSetFor()).toBeNull();
    expect((await ready({ programStyle: 'lean-down' })).reserveCheckSetFor()).toBeNull();
  });

  it("keeps the numbers on the check set, with the plan's style, into the saved workout", async () => {
    const store = await ready();
    const entry = checkable(store);
    store.startWorkout();
    const last = working(entry)[working(entry).length - 1]!;
    await logAll(store, entry, {
      weight: last.targetWeight,
      reps: 12,
      rir: 1,
      reserveCheck: { total: 15 },
    });
    const done = store
      .getSnapshot()
      .session!.completed.sets.find(
        (set) => set.entryId === entry.id && set.setIndex === last.index,
      );
    expect(done?.reps).toBe(12);
    expect(done?.rir).toBe(1);
    expect(done?.reserveCheck).toEqual({ total: 15, style: 'hybrid' });
    await store.finishWorkout(null, { endedEarly: true });
    const saved = store.getSnapshot().history.at(-1)!;
    const kept = saved.entries
      .find((logged) => logged.entryId === entry.id)!
      .sets.find((set) => set.setIndex === last.index);
    expect(kept?.reserveCheck).toEqual({ total: 15, style: 'hybrid' });
  });

  it('stays on the set it was logged on: a set added after it is no second check', async () => {
    const store = await ready();
    const entry = checkable(store);
    store.startWorkout();
    const last = working(entry)[working(entry).length - 1]!;
    await logAll(store, entry, {
      weight: last.targetWeight,
      reps: 12,
      rir: 1,
      reserveCheck: { total: 15 },
    });
    await store.recalibrate({ type: 'sets', entryId: entry.id, workingDelta: 1 });
    const grown = entries(store).find((one) => one.id === entry.id)!;
    const added = working(grown)[working(grown).length - 1]!;
    expect(added.index).not.toBe(last.index);
    expect(store.reserveCheckSetFor()).toEqual({
      entryId: entry.id,
      setIndex: last.index,
      exerciseId: entry.exerciseId,
    });
    // Logged with check numbers all the same, the added set keeps none.
    await store.logSet(entry.id, added.index, {
      weight: added.targetWeight,
      reps: 12,
      rir: 1,
      reserveCheck: { total: 15 },
    });
    const checks = store
      .getSnapshot()
      .session!.completed.sets.filter((set) => set.reserveCheck !== undefined);
    expect(checks.map((set) => set.setIndex)).toEqual([last.index]);
  });

  it('keeps no check numbers on any other set, and none on a skip', async () => {
    const store = await ready();
    const entry = checkable(store);
    store.startWorkout();
    const first = working(entry)[0]!;
    await store.logSet(entry.id, first.index, {
      weight: first.targetWeight,
      reps: 12,
      rir: 1,
      reserveCheck: { total: 15 },
    });
    const sets = () => store.getSnapshot().session!.completed.sets;
    expect(sets().find((set) => set.setIndex === first.index)?.reserveCheck).toBeUndefined();
    const last = working(entry)[working(entry).length - 1]!;
    await logAll(
      store,
      { ...entry, sets: entry.sets.filter((set) => set.index !== first.index) },
      {
        weight: last.targetWeight,
        reps: 0,
        rir: 1,
        reserveCheck: { total: 15 },
      },
    );
    expect(sets().find((set) => set.setIndex === last.index)?.reserveCheck).toBeUndefined();
  });

  it('keeps how a check ended: stalled early, or stopped for pain or form', async () => {
    const store = await ready();
    const entry = checkable(store);
    store.startWorkout();
    const last = working(entry)[working(entry).length - 1]!;
    await logAll(store, entry, {
      weight: last.targetWeight,
      reps: 9,
      rir: 0,
      reserveCheck: { total: 9, failedEarly: true, stopped: true },
    });
    const done = store
      .getSnapshot()
      .session!.completed.sets.find(
        (set) => set.setIndex === last.index && set.entryId === entry.id,
      );
    expect(done?.reserveCheck).toEqual({
      total: 9,
      failedEarly: true,
      stopped: true,
      style: 'hybrid',
    });
  });

  it('a correction keeps the check numbers it had unless new ones come with it', async () => {
    const store = await ready();
    const entry = checkable(store);
    store.startWorkout();
    const last = working(entry)[working(entry).length - 1]!;
    await logAll(store, entry, {
      weight: last.targetWeight,
      reps: 12,
      rir: 1,
      reserveCheck: { total: 15 },
    });
    const done = () =>
      store
        .getSnapshot()
        .session!.completed.sets.find(
          (set) => set.setIndex === last.index && set.entryId === entry.id,
        );
    await store.logSet(entry.id, last.index, { weight: last.targetWeight, reps: 13, rir: 1 });
    expect(done()?.reps).toBe(13);
    expect(done()?.reserveCheck?.total).toBe(15);
    await store.logSet(entry.id, last.index, {
      weight: last.targetWeight,
      reps: 13,
      rir: 1,
      reserveCheck: { total: 17 },
    });
    expect(done()?.reserveCheck?.total).toBe(17);
  });

  it('is not due again in the week of a check', async () => {
    const store = await ready({}, [checkRecord(1, 12, 1, 14)]);
    expect(store.reserveCheckSetFor()).toBeNull();
  });
});

describe('the log the rules read', () => {
  const four = [5, 12, 19, 26].map((days) => checkRecord(days, 12, 1, 15));

  /** The reserve each ordinary set and each check set is read with, oldest first. */
  const reads = (store: Store) => {
    const sets = store
      .getSnapshot()
      .readHistory.flatMap((record) => record.entries)
      .flatMap((entry) => entry.sets);
    return {
      ordinary: sets.filter((set) => !set.reserveCheck).map((set) => set.rir),
      checks: sets.filter((set) => set.reserveCheck).map((set) => set.rir),
    };
  };

  it('keeps the estimate it reads the log through beside it, for today’s sets (the second review of Maintenance 33)', async () => {
    const store = await ready({}, four);
    expect(store.getSnapshot().readEstimate).toMatchObject({ correction: 2 });
    const three = await ready({}, four.slice(0, 3));
    expect(three.getSnapshot().readEstimate).toBeNull();
  });

  it("reads a covered reserve through the lifter's error once four checks are in", async () => {
    const store = await ready({}, four);
    // Each check had 3 left at the stop against 1 judged: an error of 2, read in as 2 more; the
    // check sets read the 3 they measured.
    expect(reads(store)).toEqual({ ordinary: [3, 3, 3, 3], checks: [3, 3, 3, 3] });
    const logged = store.getSnapshot().history.flatMap((record) => record.entries);
    expect(logged.flatMap((entry) => entry.sets).map((set) => set.rir)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it("reads other sets as logged with three checks, without the lifter's yes, or under Foundation", async () => {
    // A check set reads what it measured whatever the estimate (the re-check of item 43).
    const three = await ready({}, four.slice(0, 3));
    expect(reads(three)).toEqual({ ordinary: [1, 1, 1], checks: [3, 3, 3] });
    const off = await ready({ reserveCheck: false }, four);
    expect(reads(off)).toEqual({ ordinary: [1, 1, 1, 1], checks: [3, 3, 3, 3] });
    const foundation = await ready({ programStyle: 'foundation' }, four);
    expect(reads(foundation)).toEqual({ ordinary: [1, 1, 1, 1], checks: [3, 3, 3, 3] });
  });

  it('reads other sets as logged again after the lifter resets the reserve (item 47)', async () => {
    const store = await ready({}, four);
    expect(reads(store).ordinary).toEqual([3, 3, 3, 3]);
    await store.resetLearned('reserve');
    // Learning starts again from the checks after the reset: none yet.
    expect(reads(store)).toEqual({ ordinary: [1, 1, 1, 1], checks: [3, 3, 3, 3] });
  });

  it('reads a measured reserve with an estimate that corrects nothing', async () => {
    // Judged 2 at 12 with 15 and 13 in all: an error near 0, no correction; the checks measured 3 and 1.
    const even = [5, 12, 19, 26].map((days, index) =>
      checkRecord(days, 12, 2, index % 2 === 0 ? 15 : 13),
    );
    const store = await ready({}, even);
    expect(reads(store)).toEqual({ ordinary: [2, 2, 2, 2], checks: [1, 3, 1, 3] });
  });

  it('reaches every rebuild of the plan (the review of item 47)', async () => {
    const seen: (readonly WorkoutRecord[])[] = [];
    const store = await ready({}, four, {
      recalibrate: (request) => {
        seen.push(request.history);
        return runRecalibration(request);
      },
    });
    expect(store.getSnapshot().readHistory).not.toBe(store.getSnapshot().history);
    // A length chosen: a rebuild now.
    await store.recalibrate({ type: 'duration', choice: 30 });
    expect(seen.at(-1)).toBe(store.getSnapshot().readHistory);
    // And the preview rebuilt with the length kept, after a reset.
    const before = seen.length;
    await store.resetLearned('habit');
    expect(seen.length).toBeGreaterThan(before);
    expect(seen.at(-1)).toBe(store.getSnapshot().readHistory);
  });

  it("gives the finished workout's next targets the log the rules read, when given", async () => {
    const store = await ready();
    const entry = checkable(store);
    store.startWorkout();
    for (const set of working(entry)) {
      await store.logSet(entry.id, set.index, { weight: 40, reps: 12, rir: 2 });
    }
    const { session, profile } = store.getSnapshot();
    const record = buildWorkoutRecord(session!, {
      now: TEST_NOW,
      elapsedSeconds: 600,
      rating: null,
      endedEarly: true,
    });
    // A read log in which the lift was last lifted at twice the weight: the targets follow it.
    const heavier: WorkoutRecord = {
      ...record,
      entries: record.entries.map((logged) => ({
        ...logged,
        sets: logged.sets.map((set) =>
          set.weight === null ? set : { ...set, weight: set.weight * 2 },
        ),
      })),
    };
    const plain = buildCompletion(session!, record, profile!, [], null);
    const read = buildCompletion(session!, record, profile!, [], null, [heavier]);
    expect(read.nextTargets).not.toEqual(plain.nextTargets);
  });

  it("follows the lifter's yes as Settings saves it, and the plan is built again", async () => {
    const store = await ready({ reserveCheck: false }, four);
    expect(reads(store).ordinary).toEqual([1, 1, 1, 1]);
    const plan = store.getSnapshot().session!.workout;
    await store.saveProfile({ ...store.getSnapshot().profile!, reserveCheck: true });
    expect(reads(store).ordinary).toEqual([3, 3, 3, 3]);
    // Today's plan reads the log the switch now gives (the re-check of item 43).
    expect(store.getSnapshot().session!.workout).not.toBe(plan);
  });
});
