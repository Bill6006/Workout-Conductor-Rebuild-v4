import { describe, expect, it } from 'vitest';
import { currentPosition } from '../../engine/workout/sequence';
import { COACH_ROUTES_ID } from '../../engine/strategy/plateau';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import type { Identified } from '../storage/indexedDb';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { doneKeys } from './session';

const BENCH = 'barbell-bench-press';

/** A store with a profile and four stalled bench exposures already on disk. */
async function seededWithStall(): Promise<TestStoreHandle> {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  for (const daysAgo of [28, 21, 14, 7]) {
    const when = new Date(Date.parse(TEST_NOW) - daysAgo * 86_400_000).toISOString();
    await db.put('workouts', {
      ...record(daysAgo, BENCH, [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ]),
      id: `stall-${daysAgo}`,
      startedAt: when,
      completedAt: when,
    });
  }
  await handle.store.hydrate();
  return handle;
}

async function logAndFinish(handle: TestStoreHandle, weight: number, reps: number): Promise<void> {
  const { store } = handle;
  await store.startWorkout();
  const session = store.getSnapshot().session;
  if (!session) throw new Error('no session');
  const keys = doneKeys(session.completed);
  const at = currentPosition(session.workout, (id, index) => keys.has(`${id}:${index}`));
  if (!at) throw new Error('no position');
  await store.logSet(at.entryId, at.setIndex, { weight, reps, rir: 2 });
  await store.finishWorkout(null);
  await store.flushPendingWork();
}

describe('coach routes in the store', () => {
  it('opens a route after a workout confirms the stall, records the tapped step, and survives a reload', async () => {
    const handle = await seededWithStall();
    expect(handle.store.getSnapshot().coachRoutes.routes[BENCH]).toBeUndefined();

    await logAndFinish(handle, 185, 5);
    const route = handle.store.getSnapshot().coachRoutes.routes[BENCH];
    expect(route).toMatchObject({ exerciseId: BENCH, step: 0, applied: [], exhausted: false });

    await handle.store.noteCoachAction({
      kind: 'recalibrate',
      trigger: { type: 'rep-range', entryId: 'x', reps: [6, 10] },
      label: 'Shift',
      route: { exerciseId: BENCH, step: 0, baselineE1rm: route!.baselineE1rm },
    });
    expect(handle.store.getSnapshot().coachRoutes.routes[BENCH]?.applied).toEqual([
      { step: 0, at: TEST_NOW },
    ]);
    // Actions without a route reference change nothing.
    await handle.store.noteCoachAction({ kind: 'backup', label: 'Export' });

    const db = await handle.store.getDatabase();
    const stored = (await db.get<Identified>('meta', COACH_ROUTES_ID)) as unknown as {
      routes: Record<string, { applied: unknown[] }>;
    };
    expect(stored.routes[BENCH]?.applied).toHaveLength(1);

    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(reopened.store.getSnapshot().coachRoutes.routes[BENCH]?.applied).toHaveLength(1);
  });

  it('closes the route once the lift moves', async () => {
    const handle = await seededWithStall();
    await logAndFinish(handle, 185, 5);
    expect(handle.store.getSnapshot().coachRoutes.routes[BENCH]).toBeDefined();
    handle.store.dismissCompletion();

    // A better bench session lands (any session; the generator need not schedule bench today).
    const db = await handle.store.getDatabase();
    const when = new Date(Date.parse(TEST_NOW) - 3600_000).toISOString();
    await db.put('workouts', {
      ...record(0, BENCH, [
        [5, 205, 2],
        [5, 205, 2],
      ]),
      id: 'moved',
      startedAt: when,
      completedAt: when,
    });
    await handle.store.hydrate();
    await logAndFinish(handle, 100, 8);
    expect(handle.store.getSnapshot().coachRoutes.routes[BENCH]).toBeUndefined();
  });

  it('remembers a declined offer across a reload', async () => {
    const handle = await seededWithStall();
    await handle.store.declineCoachSignal({ source: 'stall: route', exerciseId: BENCH });
    expect(handle.store.getSnapshot().coachDeclines.declines['stall: route|' + BENCH]?.count).toBe(
      1,
    );
    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(
      reopened.store.getSnapshot().coachDeclines.declines['stall: route|' + BENCH]?.count,
    ).toBe(1);
  });
});
