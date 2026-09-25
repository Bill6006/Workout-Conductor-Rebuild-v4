import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { COACH_FOCUS_ID } from '../../engine/planning/focus';
import { recalibrate as recalibrateEngine } from '../../engine/recalibration/recalibrate';
import { allEntries } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import type { Identified } from '../storage/indexedDb';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

async function seeded() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

describe('coach focus in the store', () => {
  it('sets a focus, rebuilds the preview around it, survives a reload, and clears once a session trains it', async () => {
    const handle = await seeded();
    await handle.store.setCoachFocus('lats');
    const state = handle.store.getSnapshot();
    expect(state.coachFocus?.muscle).toBe('lats');
    expect(state.coachFocus?.until).toBe('2026-09-09T12:00:00.000Z');
    expect(state.session?.constraints.focus).toBe('lats');
    expect(state.session?.workout.explanation.reasons.join(' ')).toMatch(
      /Lats lead today: your coach focus/,
    );
    const db = await handle.store.getDatabase();
    expect(await db.get<Identified>('meta', COACH_FOCUS_ID)).toMatchObject({ muscle: 'lats' });

    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(reopened.store.getSnapshot().coachFocus?.muscle).toBe('lats');

    // A saved session that trains lats clears the focus.
    const session = handle.store.getSnapshot().session!;
    const latsEntry = allEntries(session.workout.blocks).find((entry) =>
      requireExercise(entry.exerciseId).primaryMuscles.includes('lats'),
    )!;
    const firstWorking = latsEntry.sets.find((set) => set.kind === 'working')!;
    handle.store.startWorkout();
    handle.store.skipWarmup(latsEntry.id);
    await handle.store.logSet(latsEntry.id, firstWorking.index, { weight: 100, reps: 8, rir: 2 });
    await handle.store.finishWorkout(null, { endedEarly: true });
    expect(handle.store.getSnapshot().coachFocus).toBeNull();
    expect(await db.get<Identified>('meta', COACH_FOCUS_ID)).toBeUndefined();
  });

  it("keeps today's length, check-in, skips and missing plates when the focus rebuilds the preview", async () => {
    // Maintenance 24: the plan rebuilt for the focus keeps what the lifter chose for today.
    const low = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    const chosen = await seeded();
    const plain = await seeded();
    for (const handle of [chosen, plain]) {
      await handle.store.recalibrate({ type: 'duration', choice: 45 });
    }
    const store = chosen.store;
    await store.recalibrate({ type: 'readiness', readiness: low });
    const skipped = allEntries(store.getSnapshot().session!.workout.blocks).at(-1)!;
    await store.recalibrate({ type: 'skip', entryId: skipped.id });
    await store.setMissingPlates([2.5]);
    await store.setCoachFocus('lats');
    await plain.store.setCoachFocus('lats');
    const after = store.getSnapshot().session!;
    const reference = plain.store.getSnapshot().session!;
    expect(after.duration).toBe(45);
    expect(reference.duration).toBe(45);
    expect(after.constraints.focus).toBe('lats');
    expect(after.constraints.readiness).toMatchObject({ energy: 2, sleep: 2 });
    expect(after.constraints.avoidExerciseIds).toContain(skipped.exerciseId);
    expect(after.loading.missingPlates).toEqual([2.5]);
    expect(allEntries(after.workout.blocks).map((entry) => entry.exerciseId)).not.toContain(
      skipped.exerciseId,
    );
    // The check-in's extra rep in reserve, on the main lift both plans open with.
    const main = (session: typeof after) => allEntries(session.workout.blocks)[0]!;
    const rir = (session: typeof after) =>
      main(session).sets.find((set) => set.kind === 'working')!.targetRir;
    expect(main(after).exerciseId).toBe(main(reference).exerciseId);
    expect(rir(after)).toBe(Math.min(4, rir(reference) + 1));
  });

  it('drops an end time already past when the focus rebuilds the preview', async () => {
    const handle = await seeded();
    // An end time set earlier in the day, now gone by (the store's clock is TEST_NOW, noon).
    await handle.store.recalibrate({ type: 'end-by', time: '2026-09-02T11:00:00.000Z' });
    expect(handle.store.getSnapshot().session?.constraints.endBy).toBe('2026-09-02T11:00:00.000Z');
    await handle.store.setCoachFocus('lats');
    const session = handle.store.getSnapshot().session!;
    expect(session.constraints.endBy).toBeNull();
    expect(allEntries(session.workout.blocks).length).toBeGreaterThan(2);
  });

  it('keeps the previous plan, and says so, when it cannot be built again with today’s choices', async () => {
    const low = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
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
    await handle.store.setMissingPlates([2.5]);
    const before = handle.store.getSnapshot().session!;
    await handle.store.setCoachFocus('lats');
    const state = handle.store.getSnapshot();
    expect(state.session?.workout).toEqual(before.workout);
    expect(state.session?.constraints.readiness).toMatchObject({ energy: 2 });
    expect(state.session?.loading.missingPlates).toEqual([2.5]);
    expect(state.calibration).toMatchObject({
      status: 'error',
      error: 'No plan fits. The setting itself is saved.',
    });
    // The saved focus goes with the plan, so the setting and the plan never disagree.
    expect(state.coachFocus?.muscle).toBe('lats');
    expect(state.session?.constraints.focus).toBe('lats');
  });

  it('holds nothing chosen on an earlier day when a plan still open is rebuilt the next day', async () => {
    const low = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: ['knee' as const],
      timePressure: false,
    };
    let clock = TEST_NOW;
    const handle = createTestStore({ now: () => clock });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const store = handle.store;
    await store.recalibrate({ type: 'readiness', readiness: low });
    const skipped = allEntries(store.getSnapshot().session!.workout.blocks).at(-1)!;
    await store.recalibrate({ type: 'skip', entryId: skipped.id });
    await store.setMissingPlates([2.5]);
    // The next morning, the plan from the day before is still on the screen.
    clock = '2026-09-03T12:00:00.000Z';
    await store.setCoachFocus('lats');
    const session = store.getSnapshot().session!;
    expect(session.baseKey.startsWith('2026-09-03|')).toBe(true);
    expect(session.constraints.readiness).toBeNull();
    expect(session.constraints.painJoints).toEqual([]);
    expect(session.constraints.avoidExerciseIds).toEqual([]);
    expect(session.loading.missingPlates).toEqual([]);
    expect(session.constraints.focus).toBe('lats');
  });

  it("applies a change on a plan still open from an earlier day to today's plan", async () => {
    const low = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    let clock = TEST_NOW;
    const handle = createTestStore({ now: () => clock });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const store = handle.store;
    await store.recalibrate({ type: 'readiness', readiness: low });
    const yesterday = allEntries(store.getSnapshot().session!.workout.blocks).at(-1)!;
    clock = '2026-09-03T12:00:00.000Z';
    // A change to one of the day before's exercises has nothing left to change.
    expect(await store.recalibrate({ type: 'skip', entryId: yesterday.id })).toBeNull();
    let session = store.getSnapshot().session!;
    expect(session.baseKey.startsWith('2026-09-03|')).toBe(true);
    expect(session.constraints.readiness).toBeNull();
    expect(session.constraints.avoidExerciseIds).toEqual([]);
    // A change of length applies to today's plan, not the day before's.
    clock = '2026-09-04T12:00:00.000Z';
    await store.recalibrate({ type: 'readiness', readiness: low });
    clock = '2026-09-05T12:00:00.000Z';
    await store.recalibrate({ type: 'duration', choice: 45 });
    session = store.getSnapshot().session!;
    expect(session.baseKey.startsWith('2026-09-05|')).toBe(true);
    expect(session.duration).toBe(45);
    expect(session.constraints.readiness).toBeNull();
  });

  it('builds the plan for the focus after a change still in flight, not under it', async () => {
    // The overlay holds each change for a moment: a length change is still running when the
    // focus is set.
    const handle = createTestStore({ minOverlayMs: 40 });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const length = handle.store.recalibrate({ type: 'duration', choice: 45 });
    await handle.store.setCoachFocus('lats');
    await length;
    const session = handle.store.getSnapshot().session!;
    expect(session.duration).toBe(45);
    expect(session.constraints.focus).toBe('lats');
  });

  it('drops an expired focus on load and clears on request', async () => {
    const handle = await seeded();
    const db = await handle.store.getDatabase();
    await db.put('meta', {
      id: COACH_FOCUS_ID,
      muscle: 'lats',
      setAt: '2026-08-01T00:00:00.000Z',
      until: '2026-08-08T00:00:00.000Z',
    });
    await handle.store.hydrate();
    expect(handle.store.getSnapshot().coachFocus).toBeNull();

    await handle.store.setCoachFocus('rear-delts');
    expect(handle.store.getSnapshot().coachFocus?.muscle).toBe('rear-delts');
    await handle.store.clearCoachFocus();
    expect(handle.store.getSnapshot().coachFocus).toBeNull();
    expect(handle.store.getSnapshot().session?.constraints.focus).toBeNull();
    expect(await db.get<Identified>('meta', COACH_FOCUS_ID)).toBeUndefined();
  });
});
