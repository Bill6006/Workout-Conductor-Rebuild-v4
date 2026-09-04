import { describe, expect, it } from 'vitest';
import { allEntries } from '../../engine/workout/types';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

async function seeded(
  options: Parameters<typeof createTestStore>[0] = {},
): Promise<TestStoreHandle> {
  const handle = createTestStore({ minOverlayMs: 0, now: advancingClock(), ...options });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

/** A minute per call, so records saved in one test get distinct timestamps and ids. */
function advancingClock(): () => string {
  let tick = 0;
  return () => new Date(Date.parse(TEST_NOW) + tick++ * 60_000).toISOString();
}

function session(handle: TestStoreHandle) {
  const current = handle.store.getSnapshot().session;
  if (!current) throw new Error('no session');
  return current;
}

/** Starts the session and logs every working set of the main lift at one weight. */
async function trainMainLift(handle: TestStoreHandle, weight: number, reps = 5) {
  const { store } = handle;
  store.startWorkout();
  const entry = allEntries(session(handle).workout.blocks)[0];
  if (!entry) throw new Error('no entry');
  for (const set of entry.sets) {
    if (set.kind === 'working') await store.logSet(entry.id, set.index, { reps, weight, rir: 2 });
  }
  return store.finishWorkout(
    { effort: 'right', pain: false, energyAfter: 4, note: '' },
    {
      endedEarly: true,
    },
  );
}

describe('AppStore saved workouts, records, and the session summary', () => {
  it('saves, persists, loads, and deletes a workout', async () => {
    const first = await seeded();
    const title = session(first).workout.title;
    const saved = await first.store.saveCurrentWorkout('  Push day A  ');
    expect(saved.name).toBe('Push day A');
    expect(first.store.getSnapshot().savedWorkouts).toHaveLength(1);
    await expect(first.store.saveCurrentWorkout('   ')).rejects.toThrow('Give the workout a name.');

    const again = createTestStore({
      factory: first.factory,
      storage: first.storage,
      minOverlayMs: 0,
    });
    await again.store.hydrate();
    expect(again.store.getSnapshot().savedWorkouts.map((item) => item.name)).toEqual([
      'Push day A',
    ]);

    again.store.loadSavedWorkout(saved.id);
    const loaded = session(again);
    expect(loaded.workout.title).toBe(title);
    expect(loaded.workout.id).not.toBe(saved.workout.id);
    expect(loaded.lastSummary?.headline).toBe('Loaded "Push day A".');
    expect(loaded.log[0]).toMatchObject({ trigger: 'saved-workout', scope: 'full' });
    expect(loaded.status).toBe('preview');

    await again.store.deleteSavedWorkout(saved.id);
    expect(again.store.getSnapshot().savedWorkouts).toEqual([]);
  });

  it('carries saved workouts through backup and restore', async () => {
    const source = await seeded();
    await source.store.saveCurrentWorkout('Keeper');
    const backup = await source.store.createBackup({ version: 'test' });
    expect(backup.data.savedWorkouts).toHaveLength(1);

    const target = await seeded();
    await target.store.applyBackup(backup);
    expect(target.store.getSnapshot().savedWorkouts.map((item) => item.name)).toEqual(['Keeper']);
  });

  it('detects personal records on the second session and fills the session summary', async () => {
    const handle = await seeded();
    const first = await trainMainLift(handle, 185);
    expect(first.prs).toEqual([]);
    expect(first.nextTargets[0]).toMatch(/^Barbell Bench Press: 190 lb × 4-6 \(load up\)$/);
    expect(first.nextFocus).toMatch(/^Next focus: /);
    expect(first.recoveryNote).toMatch(/about 48 h before loading them again\./);
    // Save the completed session before leaving it, then repeat it: the next generated
    // session may rotate to another template.
    const saved = await handle.store.saveCurrentWorkout('Repeat');
    handle.store.dismissCompletion();
    handle.store.loadSavedWorkout(saved.id);
    const mainLift = allEntries(session(handle).workout.blocks)[0];
    expect(mainLift?.exerciseId).toBe(allEntries(saved.workout.blocks)[0]?.exerciseId);
    const second = await trainMainLift(handle, 190);
    expect(second.prs.map((pr) => pr.kind)).toEqual(['weight', 'volume']);
    expect(second.prs[0]?.detail).toContain('190 lb (was 185)');
    const record = handle.store.getSnapshot().history.find((item) => item.id === second.recordId);
    expect(record?.prs).toHaveLength(2);
  });
});
