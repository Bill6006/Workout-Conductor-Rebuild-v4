import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { allEntries } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { GYM_LOCATION_ID, HOME_LOCATION_ID, createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

describe('moving place mid-workout, in the store', () => {
  it('keeps the logged set, fills the rest from Home, and the rest timer names the new next set', async () => {
    const { store } = createTestStore({ minOverlayMs: 0 });
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    store.startWorkout();
    const session = store.getSnapshot().session;
    const lift = session ? allEntries(session.workout.blocks)[0] : undefined;
    if (!lift) throw new Error('no session');
    expect(requireExercise(lift.exerciseId).name).toBe('Barbell Bench Press');
    const firstWorking = lift.sets.findIndex((set) => set.kind === 'working');
    for (const set of lift.sets.slice(0, firstWorking + 1)) {
      await store.logSet(lift.id, set.index, { weight: set.targetWeight, reps: 5, rir: 2 });
    }
    expect(store.getSnapshot().session?.rest?.nextLabel).toMatch(/^Next: Barbell Bench Press/);

    await store.setCurrentLocation(HOME_LOCATION_ID);
    const after = store.getSnapshot().session;
    if (!after) throw new Error('no session');
    const entries = allEntries(after.workout.blocks);
    // The bench press keeps exactly what was logged; a Home move takes the sets it owed.
    const closed = entries.find((entry) => entry.id === lift.id);
    expect(closed?.sets).toHaveLength(firstWorking + 1);
    const current = entries.find((entry) => entry.id === after.completed.currentEntryId);
    expect(current && requireExercise(current.exerciseId).name).not.toBe('Barbell Bench Press');
    expect(after.completed.sets.filter((set) => set.entryId === lift.id)).toHaveLength(
      firstWorking + 1,
    );
    // The rest still running from the gym names what is next here.
    expect(after.rest?.nextLabel).not.toContain('Barbell Bench Press');
    expect(after.rest?.nextLabel).toContain(requireExercise(current?.exerciseId ?? '').name);
  });
});
