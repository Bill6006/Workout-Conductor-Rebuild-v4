import { describe, expect, it } from 'vitest';
import type { AppStore } from './appStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { Readiness } from '../../engine/recalibration/types';
import { allEntries, type SetPrescription } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The fifth adversarial review of Maintenance 33: a set logged before a head cold was told, taken
 * back, comes back to do under the day's floor.
 *
 * Steps: a hybrid lifter with drop sets on starts today's workout and logs the bench press's two ramp
 * sets and its top set (140 × 4 at 1 in reserve, as planned). Then they check in with a head cold:
 * "Adjusted for today (every set 2 or more short of failure for the head cold)". The top set was
 * logged a rep wrong, so they take it back ("Undo last set"; the same with the set's inline
 * correction, Delete). Or: they lift the cable triceps pushdown first, its three sets at 1 in
 * reserve and its drop set, check in with the head cold, and take the drop set back.
 *
 * The rule: the report: "Illness: above the neck, every set keeps two or more reps in reserve, no top
 * set to failure and no drop set"; the second pass's fix: "any illness holds every set still to come
 * at its floor, a lift under way's too"; `heldToTheDay`: "every set still to come keeps the day's
 * reserve at least ... One done stays as logged". Taken back, the set is one still to come.
 *
 * What happens: the floor is laid by the engine after every change it makes, and never on a set done
 * (it keeps what it was logged at); "Undo last set" and Delete take the set back in the store,
 * outside the engine (`undoLastSet`, `deleteLoggedSet`, with only the back-offs' loads replayed), so
 * the top set comes back to do as it was planned before the head cold: 140 × 4-6 at 1 in reserve,
 * shown as the next set, until some later change lays the floor again. The pushdown's drop set taken
 * back comes back to do the same, a drop set at 0 in reserve, under "no drop set". (A hard start's
 * ease is kept off a lift begun on purpose, item 42's eighth pass; the illness gate holds every set
 * to come.)
 *
 * In the build since the second pass's floor on a lift under way (older than the fourth pass; a
 * gate of the round's own, found by a randomized run of the store). On the previous head (3d24e37)
 * both tests fail the same way.
 *
 * Synthetic data only.
 *
 * The fix (the fifth pass): a log taken back in the store lays the day's floor again over the sets
 * still to come (`floorLaidAgain`).
 */

const DAY = 86_400_000;
const LIFTS = ['barbell-bench-press', 'back-squat', 'barbell-row'];
const at = (daysAgo: number) => new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();

const headCold: Readiness = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  illness: 'head',
};

/** The working and drop sets still to come, with their reserve. */
function toCome(store: AppStore): [string, SetPrescription['kind'], number][] {
  const session = store.getSnapshot().session!;
  const done = new Set(session.completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
  return allEntries(session.workout.blocks).flatMap((entry) =>
    entry.sets
      .filter((set) => set.kind !== 'warmup' && !done.has(`${entry.id}:${set.index}`))
      .map((set): [string, SetPrescription['kind'], number] => [
        entry.exerciseId,
        set.kind,
        set.targetRir,
      ]),
  );
}

/** A hybrid lifter, drop sets on, today's workout started. */
async function startedToday(): Promise<AppStore> {
  const { store } = createTestStore();
  await store.hydrate();
  const base = createDefaultProfile(TEST_NOW);
  await store.completeOnboarding(
    {
      ...base,
      bodyweight: 185,
      programStyle: 'hybrid',
      techniques: { ...base.techniques, dropSets: true },
      // Every weekday ticked: today is a day of the plan.
      schedule: {
        ...base.schedule,
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        weeklyFrequency: 5,
      },
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  for (const daysAgo of [12, 9]) {
    for (const exerciseId of LIFTS) {
      await db.put('workouts', {
        ...record(
          0,
          exerciseId,
          [
            [5, 135, 2],
            [5, 135, 2],
            [5, 135, 2],
          ],
          [4, 6],
          2,
        ),
        id: `w-${exerciseId}-${daysAgo}`,
        startedAt: at(daysAgo),
        completedAt: at(daysAgo),
      });
    }
  }
  await store.hydrate();
  store.startWorkout();
  return store;
}

/** Each set of a lift logged as planned, in order. */
async function logAll(store: AppStore, entryId: string, sets: readonly SetPrescription[]) {
  for (const set of sets) {
    await store.logSet(entryId, set.index, {
      weight: set.targetWeight ?? 20,
      reps: set.targetReps[0],
      rir: set.kind === 'warmup' ? 5 : set.targetRir,
    });
  }
}

async function headColdTold(store: AppStore) {
  await store.recalibrate({ type: 'readiness', readiness: headCold });
  expect(store.getSnapshot().session!.lastSummary?.headline).toMatch(
    /^Adjusted for today \(every set 2 or more short of failure for the head cold\)/,
  );
  expect(toCome(store).every(([, kind, rir]) => kind === 'working' && rir >= 2)).toBe(true);
}

describe('a set logged before a head cold, taken back', () => {
  it('comes back to do at the floor', async () => {
    const store = await startedToday();
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    expect(first.exerciseId).toBe('barbell-bench-press');
    const top = first.sets.find((set) => set.tier === 'top')!;
    expect(top.targetRir).toBe(1);
    await logAll(store, first.id, [...first.sets.filter((set) => set.kind === 'warmup'), top]);
    await headColdTold(store);

    store.undoLastSet();
    const next = toCome(store);
    // The top set is to do again.
    expect(next.length).toBeGreaterThan(0);
    expect(next.filter(([, kind, rir]) => kind !== 'working' || rir < 2)).toEqual([]);
  });

  it('comes back to do at the floor, deleted in its correction', async () => {
    // The fifth pass's own: Delete takes the set back in the store as "Undo last set" does.
    const store = await startedToday();
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    const top = first.sets.find((set) => set.tier === 'top')!;
    await logAll(store, first.id, [...first.sets.filter((set) => set.kind === 'warmup'), top]);
    await headColdTold(store);

    store.deleteLoggedSet(first.id, top.index);
    const next = toCome(store);
    expect(next.length).toBeGreaterThan(0);
    expect(next.filter(([, kind, rir]) => kind !== 'working' || rir < 2)).toEqual([]);
  });

  it('brings no drop set back', async () => {
    const store = await startedToday();
    const lift = allEntries(store.getSnapshot().session!.workout.blocks).find((entry) =>
      entry.sets.some((set) => set.kind === 'drop'),
    )!;
    expect(lift.exerciseId).toBe('cable-triceps-pushdown');
    await logAll(store, lift.id, lift.sets);
    await headColdTold(store);

    // The drop set, the last set logged, taken back.
    store.undoLastSet();
    expect(toCome(store).filter(([, kind, rir]) => kind !== 'working' || rir < 2)).toEqual([]);
  });
});
