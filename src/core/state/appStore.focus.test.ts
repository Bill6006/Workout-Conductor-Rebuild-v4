import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { COACH_FOCUS_ID } from '../../engine/planning/focus';
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
