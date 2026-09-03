import { describe, expect, it } from 'vitest';
import { allEntries } from '../../engine/workout/types';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { profileTrigger, type AppStoreOptions } from './appStore';
import { readSession } from './session';

type SeedOptions = Partial<AppStoreOptions> & {
  factory?: TestStoreHandle['factory'];
  storage?: TestStoreHandle['storage'];
};

async function seeded(options: SeedOptions = {}): Promise<TestStoreHandle> {
  const handle = createTestStore({ minOverlayMs: 0, ...options });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

function session(handle: TestStoreHandle) {
  const current = handle.store.getSnapshot().session;
  if (!current) throw new Error('no session');
  return current;
}

describe('AppStore session and recalibration', () => {
  it('creates a Default session after onboarding and persists it', async () => {
    const handle = await seeded();
    const current = session(handle);
    expect(current.duration).toBe('default');
    expect(current.workout.title).toBe('Push + arms');
    expect(current.log).toEqual([]);
    expect(readSession(handle.storage)?.id).toBe(current.id);
    expect(handle.store.getSnapshot().calibration.status).toBe('idle');
  });

  it('a duration change shows the calibration state, commits the result, and logs it', async () => {
    const handle = await seeded();
    const seen: string[] = [];
    handle.store.subscribe(() => seen.push(handle.store.getSnapshot().calibration.status));
    const result = await handle.store.setDurationChoice(15);
    expect(result?.ok).toBe(true);
    expect(seen).toContain('running');
    expect(handle.store.getSnapshot().calibration.status).toBe('idle');
    const current = session(handle);
    expect(current.duration).toBe(15);
    expect(current.workout.duration.choice).toBe(15);
    expect(current.lastSummary?.headline).toMatch(/^Recalibrated to 15 min/);
    expect(current.lastChanges.length).toBeGreaterThan(0);
    expect(current.previous?.workout.duration.choice).toBe('default');
    expect(current.log[0]).toMatchObject({
      trigger: 'duration',
      scope: 'full',
      label: 'Workout length',
    });
    expect(readSession(handle.storage)?.duration).toBe(15);
  });

  it('a failing engine keeps the previous workout and reports a readable error', async () => {
    const handle = await seeded({
      recalibrate: () => {
        throw new Error('boom');
      },
    });
    const before = session(handle).workout;
    const result = await handle.store.setDurationChoice(30);
    expect(result?.ok).toBe(false);
    expect(session(handle).workout).toBe(before);
    expect(session(handle).duration).toBe('default');
    expect(handle.store.getSnapshot().calibration).toMatchObject({
      status: 'error',
      error: 'boom',
    });
    handle.store.dismissCalibrationError();
    expect(handle.store.getSnapshot().calibration.status).toBe('idle');
  });

  it('undo restores the previous workout and its constraints', async () => {
    const handle = await seeded();
    const before = session(handle).workout;
    const entryId = allEntries(before.blocks)[3]?.id ?? 'e4';
    await handle.store.recalibrate({ type: 'skip', entryId });
    expect(allEntries(session(handle).workout.blocks).some((entry) => entry.id === entryId)).toBe(
      false,
    );
    expect(session(handle).constraints.avoidExerciseIds).toHaveLength(1);
    handle.store.undoRecalibration();
    const after = session(handle);
    expect(after.workout).toEqual(before);
    expect(after.constraints.avoidExerciseIds).toEqual([]);
    expect(after.previous).toBeNull();
    expect(after.lastSummary?.headline).toBe('Restored the previous workout.');
    handle.store.dismissSummary();
    expect(session(handle).lastSummary).toBeNull();
  });

  it('serializes two triggers fired together', async () => {
    const handle = await seeded();
    const [first, second] = await Promise.all([
      handle.store.setDurationChoice(15),
      handle.store.recalibrate({ type: 'pin', entryId: 'e1', pinned: true }),
    ]);
    expect(first?.ok).toBe(true);
    expect(second?.ok).toBe(true);
    expect(session(handle).duration).toBe(15);
    expect(allEntries(session(handle).workout.blocks)[0]?.pinned).toBe(true);
    expect(session(handle).log).toHaveLength(2);
  });

  it('switching the place and toggling a technique recalibrate through the profile save', async () => {
    const handle = await seeded();
    await handle.store.setCurrentLocation('home');
    expect(session(handle).lastSummary?.headline).toMatch(/^Rebuilt for Home/);
    expect(session(handle).workout.locationId).toBe('home');

    const profile = handle.store.getSnapshot().profile;
    if (!profile) throw new Error('no profile');
    await handle.store.saveProfile({
      ...profile,
      techniques: { ...profile.techniques, supersets: false },
    });
    expect(session(handle).lastSummary?.headline).toMatch(/^Supersets off/);
    expect(session(handle).workout.blocks.some((block) => block.kind === 'superset')).toBe(false);

    // Units and notes never trigger a rebuild, and the session survives the save.
    const version = session(handle).workout.recalibration.version;
    const saved = handle.store.getSnapshot().profile;
    if (!saved) throw new Error('no profile');
    await handle.store.saveProfile({
      ...saved,
      units: 'kg',
      limitations: { ...saved.limitations, notes: 'left elbow is tender' },
    });
    expect(session(handle).workout.recalibration.version).toBe(version);
    expect(session(handle).baseKey).toContain(handle.store.getSnapshot().profile?.updatedAt);
    expect(profileTrigger(profile, { ...profile, units: 'kg' })).toBeNull();
    expect(
      profileTrigger(profile, { ...profile, goals: { ...profile.goals, primary: 'strength' } }),
    ).toEqual({
      type: 'profile',
    });
  });

  it('editing the current place’s equipment recalibrates for it', async () => {
    const handle = await seeded();
    const gym = handle.store.getSnapshot().locations.find((location) => location.id === 'gym');
    if (!gym) throw new Error('no gym');
    await handle.store.saveLocation({
      ...gym,
      equipment: gym.equipment.filter((id) => id !== 'barbell'),
    });
    expect(session(handle).lastSummary?.headline).toMatch(/^Updated for the equipment at Gym/);
    expect(
      allEntries(session(handle).workout.blocks).some(
        (entry) => entry.exerciseId === 'barbell-bench-press',
      ),
    ).toBe(false);
  });

  it('reuses the persisted session for the same inputs and starts fresh on a new day', async () => {
    const first = await seeded();
    await first.store.setDurationChoice(30);
    const again = createTestStore({
      factory: first.factory,
      storage: first.storage,
      minOverlayMs: 0,
    });
    await again.store.hydrate();
    expect(again.store.getSnapshot().session?.duration).toBe(30);
    expect(again.store.getSnapshot().session?.id).toBe(session(first).id);

    const tomorrow = createTestStore({
      factory: first.factory,
      storage: first.storage,
      minOverlayMs: 0,
      now: () => '2026-09-03T12:00:00.000Z',
    });
    await tomorrow.store.hydrate();
    expect(tomorrow.store.getSnapshot().session?.duration).toBe('default');
    expect(tomorrow.store.getSnapshot().session?.id).not.toBe(session(first).id);
  });

  it('End by exact time caps the session strictly and can be switched off', async () => {
    const handle = await seeded();
    await handle.store.setEndBy(true);
    const strict = session(handle);
    expect(strict.constraints.endBy).not.toBeNull();
    expect(strict.workout.duration.estimatedMinutes).toBeLessThanOrEqual(
      strict.workout.duration.targetMinutes,
    );
    expect(strict.lastSummary?.headline).toMatch(/^Ends by /);
    await handle.store.setEndBy(false);
    expect(session(handle).constraints.endBy).toBeNull();
  });
});
