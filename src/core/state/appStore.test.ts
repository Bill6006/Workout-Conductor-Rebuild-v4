import { describe, expect, it } from 'vitest';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { ONBOARDING_DRAFT_KEY } from '../storage/localSettings';
import { createDefaultLocations, createLocation } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

describe('AppStore', () => {
  it('hydrates to an empty, ready state on first run', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      profile: null,
      locations: [],
      workoutCount: 0,
    });
  });

  it('completes onboarding with verified saves and survives a reload', async () => {
    const { store, factory, storage } = createTestStore();
    storage.setItem(ONBOARDING_DRAFT_KEY, '{"step":3}');
    await store.hydrate();
    const profile = createDefaultProfile(TEST_NOW);
    await store.completeOnboarding(profile, createDefaultLocations({ gymAccess: true }, TEST_NOW));

    const state = store.getSnapshot();
    expect(state.profile?.goals.primary).toBe('build-muscle');
    expect(state.locations.map((location) => location.id)).toEqual(['home', 'gym']);
    expect(state.localSettings.onboardingCompletedAt).toBe(TEST_NOW);
    expect(state.lastReceipt).toMatchObject({
      store: 'profile',
      id: 'current',
      verifiedAt: TEST_NOW,
    });
    expect(storage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();

    const reloaded = createTestStore({ factory, storage }).store;
    await reloaded.hydrate();
    expect(reloaded.getSnapshot().profile).toEqual(state.profile);
    expect(reloaded.getSnapshot().locations).toEqual(state.locations);
  });

  it('manages locations and keeps the current location valid', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );

    const hotel = createLocation(
      { name: 'Hotel', kind: 'travel', equipment: ['dumbbells'] },
      TEST_NOW,
    );
    await store.saveLocation(hotel);
    expect(store.getSnapshot().locations.map((location) => location.name)).toEqual([
      'Home',
      'Gym',
      'Hotel',
    ]);

    await store.setCurrentLocation(hotel.id);
    expect(store.getSnapshot().profile?.currentLocationId).toBe(hotel.id);

    await store.deleteLocation(hotel.id);
    expect(store.getSnapshot().locations.map((location) => location.id)).toEqual(['home', 'gym']);
    expect(store.getSnapshot().profile?.currentLocationId).toBe('home');

    await expect(store.deleteLocation('home')).rejects.toThrow(/cannot be deleted/);
    await expect(store.setCurrentLocation('nowhere')).rejects.toThrow(/Unknown location/);
  });

  it('exports and restores a backup through verified writes', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: false }, TEST_NOW),
    );
    const backup = await store.createBackup({ version: '0.0.1' });
    expect(backup.data.locations.map((location) => location.id)).toEqual(['home']);
    expect(store.getSnapshot().localSettings.lastExportAt).toBe(TEST_NOW);

    const modified = structuredClone(backup);
    if (modified.data.profile) modified.data.profile.units = 'kg';
    modified.data.locations.push(
      createLocation({ id: 'gym', name: 'Gym', kind: 'gym', equipment: ['barbell'] }, TEST_NOW),
    );

    await store.applyBackup(modified);
    const state = store.getSnapshot();
    expect(state.profile?.units).toBe('kg');
    expect(state.locations.map((location) => location.id)).toEqual(['home', 'gym']);
    expect(state.localSettings.lastImportAt).toBe(TEST_NOW);
  });

  it('reports a storage error without crashing', async () => {
    const { store } = createTestStore({
      openDb: () => Promise.reject(new Error('IndexedDB is not available in this browser.')),
    });
    await store.hydrate();
    expect(store.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'IndexedDB is not available in this browser.',
    });
  });
});
