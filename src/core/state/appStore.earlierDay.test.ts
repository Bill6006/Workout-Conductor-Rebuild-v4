import { describe, expect, it } from 'vitest';
import { recalibrate as recalibrateEngine } from '../../engine/recalibration/recalibrate';
import type { Readiness } from '../../engine/recalibration/types';
import { COACH_ROUTES_ID } from '../../engine/strategy/plateau';
import { allEntries } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import type { Database, Identified, StoreName } from '../storage/indexedDb';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * Maintenance 24, the owner's item 34: a plan still on the screen from an earlier day holds
 * nothing chosen for that day, on every path that reads or changes it; and a change the coach
 * offers records its route step only once it has landed.
 */

const DAY_TWO = '2026-09-03T12:00:00.000Z';
const low: Readiness = {
  energy: 2,
  soreness: 3,
  sleep: 2,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

/** A store whose clock can move, set up with a low check-in on the first day. */
async function checkedInYesterday(options: Parameters<typeof createTestStore>[0] = {}) {
  let clock = TEST_NOW;
  const handle = createTestStore({ now: () => clock, ...options });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  await handle.store.recalibrate({ type: 'duration', choice: 30 });
  await handle.store.recalibrate({ type: 'readiness', readiness: low });
  return {
    ...handle,
    nextDay: () => {
      clock = DAY_TWO;
    },
  };
}

const today = (key: string) => key.startsWith('2026-09-03|');

describe('a plan from an earlier day', () => {
  it('gives way to today’s plan on a save that needs no rebuild, not onto today’s key', async () => {
    const { store, nextDay } = await checkedInYesterday();
    nextDay();
    const place = store
      .getSnapshot()
      .locations.find((each) => each.id === store.getSnapshot().profile?.currentLocationId)!;
    await store.saveLocation({ ...place, name: 'Renamed' });
    const session = store.getSnapshot().session!;
    expect(today(session.baseKey)).toBe(true);
    expect(session.constraints.readiness).toBeNull();
    expect(session.duration).toBe('default');
  });

  it('starts today’s plan, not the day before’s with its check-in', async () => {
    const { store, nextDay } = await checkedInYesterday();
    nextDay();
    store.startWorkout();
    const session = store.getSnapshot().session!;
    expect(session.status).toBe('active');
    expect(today(session.baseKey)).toBe(true);
    expect(session.constraints.readiness).toBeNull();
  });

  it('has nothing to take back with Undo', async () => {
    const { store, nextDay } = await checkedInYesterday();
    expect(store.getSnapshot().session?.previous).toBeTruthy();
    nextDay();
    await store.undoRecalibration();
    const session = store.getSnapshot().session!;
    expect(today(session.baseKey)).toBe(true);
    expect(session.constraints.readiness).toBeNull();
    expect(session.duration).toBe('default');
  });

  it('counts an exact end time from today’s length, not the day before’s', async () => {
    const { store, nextDay } = await checkedInYesterday();
    nextDay();
    await store.setEndBy(true);
    const session = store.getSnapshot().session!;
    // Default here is 60 minutes; the day before's 30 would end at 12:30.
    expect(session.constraints.endBy).toBe('2026-09-03T13:00:00.000Z');
  });

  it('has nothing to change for a pairing split or an exercise added on it', async () => {
    const split = await checkedInYesterday();
    const pair = split.store
      .getSnapshot()
      .session!.workout.blocks.find((block) => block.kind !== 'straight');
    if (!pair) throw new Error('expected a paired block the day before');
    split.nextDay();
    expect(await split.store.recalibrate({ type: 'split-superset', blockId: pair.id })).toBeNull();
    const added = await checkedInYesterday();
    added.nextDay();
    expect(
      await added.store.recalibrate({
        type: 'add-exercise',
        exerciseId: 'lateral-raise',
        muscle: 'side-delts',
        sets: 2,
      }),
    ).toBeNull();
    for (const { store } of [split, added]) {
      const session = store.getSnapshot().session!;
      expect(today(session.baseKey)).toBe(true);
      expect(session.lastSummary).toBeNull();
    }
  });

  it('keeps a saved workout loaded on it through the next change', async () => {
    const { store, nextDay } = await checkedInYesterday();
    const saved = await store.saveCurrentWorkout('Short push');
    nextDay();
    store.loadSavedWorkout(saved.id);
    const loaded = store.getSnapshot().session!;
    expect(today(loaded.baseKey)).toBe(true);
    await store.recalibrate({ type: 'duration', choice: 45 });
    const session = store.getSnapshot().session!;
    expect(session.workout.id).toBe(loaded.workout.id);
    expect(session.duration).toBe(45);
  });
});

describe('a plan that cannot be built again', () => {
  it('keeps the setting in the plan Undo brings back, too', async () => {
    const handle = createTestStore({
      recalibrate: (request) => {
        if (request.reason === "Today's choices kept") throw new Error('No plan fits.');
        return recalibrateEngine(request);
      },
    });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await handle.store.recalibrate({ type: 'readiness', readiness: low });
    await handle.store.setCoachFocus('lats');
    expect(handle.store.getSnapshot().calibration).toMatchObject({
      status: 'error',
      error: 'No plan fits. The setting itself is saved.',
    });
    await handle.store.undoRecalibration();
    expect(handle.store.getSnapshot().session?.constraints.focus).toBe('lats');
  });
});

describe("a coach card's change", () => {
  const offer = (entryId: string) => ({
    kind: 'recalibrate' as const,
    trigger: { type: 'sets' as const, entryId, workingDelta: 1 as const },
    label: 'Add a working set',
    route: { exerciseId: 'barbell-bench-press', step: 3, baselineE1rm: 200 },
  });
  const signal = { source: 'stall: route', exerciseId: 'barbell-bench-press', headline: 'Stalled' };

  it('records its route step once the change has landed, and not when it fails', async () => {
    const failing = createTestStore({
      recalibrate: (request) => ({
        ok: false,
        scope: 'local',
        error: 'No room.',
        workout: request.workout,
        durationMs: 0,
      }),
    });
    const landing = createTestStore();
    for (const handle of [failing, landing]) {
      await handle.store.hydrate();
      await handle.store.completeOnboarding(
        createDefaultProfile(TEST_NOW),
        createDefaultLocations({ gymAccess: true }, TEST_NOW),
      );
    }
    const entryOf = (handle: typeof failing) =>
      allEntries(handle.store.getSnapshot().session!.workout.blocks)[0]!.id;
    // In place while the change runs, so the card never offers it again once the overlay goes;
    // taken back when the change fails.
    const running = failing.store.takeCoachChange(offer(entryOf(failing)), signal);
    expect(failing.store.getSnapshot().coachRoutes.routes['barbell-bench-press']?.applied).toEqual([
      { step: 3, at: TEST_NOW },
    ]);
    await running;
    expect(failing.store.getSnapshot().coachRoutes.routes['barbell-bench-press']).toBeUndefined();
    await landing.store.takeCoachChange(offer(entryOf(landing)), signal);
    expect(landing.store.getSnapshot().coachRoutes.routes['barbell-bench-press']?.applied).toEqual([
      { step: 3, at: TEST_NOW },
    ]);
    // And saved on the device once it landed.
    const db = await landing.store.getDatabase();
    const stored = (await db.get<Identified>('meta', COACH_ROUTES_ID)) as unknown as {
      routes: Record<string, { applied: unknown[] }>;
    };
    expect(stored.routes['barbell-bench-press']?.applied).toHaveLength(1);
  });

  /**
   * A store whose engine fails the changes `fails` picks and runs the rest, each change taking at
   * least `overlayMs`.
   */
  async function storeFailing(fails: (entryId: string) => boolean, overlayMs = 0) {
    const handle = createTestStore({
      minOverlayMs: overlayMs,
      recalibrate: (request) =>
        'entryId' in request.trigger && fails(request.trigger.entryId)
          ? {
              ok: false,
              scope: 'local',
              error: 'No room.',
              workout: request.workout,
              durationMs: 0,
            }
          : recalibrateEngine(request),
    });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    return handle;
  }
  const storedRoutes = async (handle: Awaited<ReturnType<typeof storeFailing>>) => {
    const db = await handle.store.getDatabase();
    const stored = (await db.get<Identified>('meta', COACH_ROUTES_ID)) as unknown as
      { routes: Record<string, { applied: unknown[] }> } | undefined;
    return stored?.routes ?? {};
  };
  /** A route saved on another device, which a sync brings in while a change runs. */
  const squatRoutes = {
    id: COACH_ROUTES_ID,
    routes: {
      'back-squat': {
        exerciseId: 'back-squat',
        step: 1,
        startedAt: TEST_NOW,
        baselineE1rm: 150,
        applied: [{ step: 1, at: TEST_NOW }],
        exhausted: false,
      },
    },
  };
  /** Taps the card's change on the first lift, and reloads the stored routes while it runs. */
  async function tapWithReload(handle: Awaited<ReturnType<typeof storeFailing>>) {
    const entry = allEntries(handle.store.getSnapshot().session!.workout.blocks)[0]!;
    const running = handle.store.takeCoachChange(offer(entry.id), signal);
    const db = await handle.store.getDatabase();
    await db.put('meta', squatRoutes);
    await handle.store.hydrate();
    await running;
  }

  it('takes back its own step alone when it fails, keeping routes a reload brought in', async () => {
    const handle = await storeFailing(() => true, 400);
    await tapWithReload(handle);
    expect(handle.store.getSnapshot().coachRoutes.routes).toEqual(squatRoutes.routes);
  });

  it('saves its step onto the routes as they are when it lands', async () => {
    const handle = await storeFailing(() => false, 400);
    await tapWithReload(handle);
    const lifts = ['back-squat', 'barbell-bench-press'];
    expect(Object.keys(handle.store.getSnapshot().coachRoutes.routes).sort()).toEqual(lifts);
    expect(Object.keys(await storedRoutes(handle)).sort()).toEqual(lifts);
  });

  it('records a step tapped again once its first change failed', async () => {
    let failNext = false;
    const handle = await storeFailing(() => {
      const fail = failNext;
      failNext = false;
      return fail;
    });
    const entry = allEntries(handle.store.getSnapshot().session!.workout.blocks)[0]!;
    failNext = true;
    await Promise.all([
      handle.store.takeCoachChange(offer(entry.id), signal),
      handle.store.takeCoachChange(offer(entry.id), signal),
    ]);
    expect(handle.store.getSnapshot().coachRoutes.routes['barbell-bench-press']?.applied).toEqual([
      { step: 3, at: TEST_NOW },
    ]);
    expect((await storedRoutes(handle))['barbell-bench-press']?.applied).toHaveLength(1);
  });

  it('keeps a step it could not save for now, and says so', async () => {
    const handle = await storeFailing(() => false);
    const db = await handle.store.getDatabase();
    const put = db.put.bind(db);
    db.put = (async (store: StoreName, value: Identified) => {
      if (store === 'meta' && value.id === COACH_ROUTES_ID) throw new Error('Disk full.');
      await put(store, value);
    }) as Database['put'];
    const entry = allEntries(handle.store.getSnapshot().session!.workout.blocks)[0]!;
    const sets = entry.sets.filter((set) => set.kind === 'working').length;
    await expect(handle.store.takeCoachChange(offer(entry.id), signal)).rejects.toThrow(
      'The change is made, but this step could not be saved: the coach may offer it again.',
    );
    const now = handle.store.getSnapshot();
    const changed = allEntries(now.session!.workout.blocks).find((found) => found.id === entry.id)!;
    expect(changed.sets.filter((set) => set.kind === 'working')).toHaveLength(sets + 1);
    expect(now.coachRoutes.routes['barbell-bench-press']?.applied).toEqual([
      { step: 3, at: TEST_NOW },
    ]);
    expect(await storedRoutes(handle)).toEqual({});
  });
});
