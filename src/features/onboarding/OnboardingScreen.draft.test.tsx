import { IDBFactory } from 'fake-indexeddb';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { openDatabase } from '../../core/storage/indexedDb';
import { ONBOARDING_DRAFT_KEY } from '../../core/storage/localSettings';
import { GYM_LOCATION_ID, createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { GYM_DEFAULT_EQUIPMENT, normalizeEquipment } from '../../catalog/equipment/equipment';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { draftBase } from '../profile/draft';

/**
 * Maintenance 25, the tenth review's fifth re-check: a setup run left part-way is resumed only
 * from where it began. A first run's draft, once a profile has come (the cloud copy brought it
 * back), and a draft the profile or places have moved on from, start again from the answers now.
 */

/** A clock a minute further on at each call: an edit made later is later. */
function ticking(): () => string {
  let at = Date.parse(TEST_NOW);
  return () => new Date((at += 60_000)).toISOString();
}

async function withProfile() {
  const handle = createTestStore({ now: ticking() });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'kg' },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

function saveDraft(step: number, basedOn: string | null) {
  window.localStorage.setItem(
    ONBOARDING_DRAFT_KEY,
    JSON.stringify({
      step,
      profile: { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'lb' },
      locations: createDefaultLocations({ gymAccess: true }, TEST_NOW),
      basedOn,
    }),
  );
}

async function openSetup(store: ReturnType<typeof createTestStore>['store']) {
  act(() => {
    window.location.hash = '#/onboarding';
  });
  const hydrate = vi.spyOn(store, 'hydrate');
  render(
    <Providers store={store}>
      <App />
    </Providers>,
  );
  await act(async () => {
    await hydrate.mock.results[0]?.value;
  });
  return screen.findByTestId('onboarding');
}

afterEach(() => {
  window.localStorage.removeItem(ONBOARDING_DRAFT_KEY);
});

describe('a setup run left part-way', () => {
  it('is not resumed once a profile has come: Run setup again starts from the answers now', async () => {
    const { store } = await withProfile();
    saveDraft(6, null);
    const setup = await openSetup(store);
    expect(setup).toHaveTextContent('Step 1 of 7');
  });

  it('is resumed while the profile and places stand as it began from', async () => {
    const { store } = await withProfile();
    const state = store.getSnapshot();
    saveDraft(3, draftBase(state.profile, state.locations));
    const setup = await openSetup(store);
    expect(setup).toHaveTextContent('Step 4 of 7');
  });

  it('is resumed where it was left, from what the screen saved as it went', async () => {
    const { store } = await withProfile();
    const user = userEvent.setup();
    let setup = await openSetup(store);
    expect(setup).toHaveTextContent('Step 1 of 7');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(setup).toHaveTextContent('Step 2 of 7');
    cleanup();
    setup = await openSetup(store);
    expect(setup).toHaveTextContent('Step 2 of 7');
  });

  it('changes nothing at Finish when the profile changed while it was open, and says so (sixth re-check)', async () => {
    const handle = await withProfile();
    const { store } = handle;
    const user = userEvent.setup();
    const setup = await openSetup(store);
    expect(setup).toHaveTextContent('Step 1 of 7');
    // While setup is open the profile changes (the cloud copy's walk, or another window), and
    // this window shows the change.
    const other = createTestStore({
      factory: handle.factory,
      storage: handle.storage,
      now: () => '2026-09-09T12:00:00.000Z',
    });
    await other.store.hydrate();
    await other.store.saveProfile({ ...other.store.getSnapshot().profile!, bodyweight: 201 });
    await act(async () => {
      await store.hydrate();
    });
    for (let step = 1; step < 7; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByText(/Your data changed while setup was open/)).toBeInTheDocument();
    const [stored] = await (
      await store.getDatabase()
    ).getAll<UserProfile & { id: string }>('profile');
    expect(stored).toMatchObject({ units: 'kg', bodyweight: 201 });
  });

  it('starts again from what is there when it stays on screen after a change, so the next Finish saves (seventh re-check)', async () => {
    const { store } = await withProfile();
    // The owner's Home, with its own equipment.
    const equipment = normalizeEquipment(GYM_DEFAULT_EQUIPMENT.slice(0, 2));
    await store.saveLocation({
      ...store.getSnapshot().locations.find((place) => place.id === 'home')!,
      equipment,
    });
    const user = userEvent.setup();
    await openSetup(store);
    // While setup is open the stored profile is replaced by one this build cannot read.
    const db = await store.getDatabase();
    await db.put('profile', { id: 'current', units: 'stone' });
    await act(async () => {
      await store.hydrate();
    });
    expect(store.getSnapshot().profile).toBeNull();
    for (let step = 1; step < 7; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByText(/Your data changed while setup was open/)).toBeInTheDocument();
    // Setup is still needed, and starts again from what is there now: this Finish saves.
    expect(screen.getByTestId('onboarding')).toHaveTextContent('Step 1 of 7');
    for (let step = 1; step < 7; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    await vi.waitFor(() => expect(store.getSnapshot().profile).not.toBeNull());
    // The places stored stay as they were: setup started from them, not from defaults (eighth
    // re-check).
    expect(await db.get('locations', 'home')).toMatchObject({ equipment });
  });

  it('keeps the stored places when Use defaults is tapped after a change, and on a first setup with no readable profile (ninth re-check)', async () => {
    const { store } = await withProfile();
    const equipment = normalizeEquipment(GYM_DEFAULT_EQUIPMENT.slice(0, 2));
    await store.saveLocation({
      ...store.getSnapshot().locations.find((place) => place.id === 'home')!,
      equipment,
    });
    const user = userEvent.setup();
    await openSetup(store);
    const db = await store.getDatabase();
    await db.put('profile', { id: 'current', units: 'stone' });
    await act(async () => {
      await store.hydrate();
    });
    for (let step = 1; step < 7; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByText(/Your data changed while setup was open/)).toBeInTheDocument();
    // Setup is still needed: Use defaults keeps the places stored.
    await user.click(screen.getByRole('button', { name: 'Use defaults and skip setup' }));
    await vi.waitFor(() => expect(store.getSnapshot().profile).not.toBeNull());
    expect(await db.get('locations', 'home')).toMatchObject({ equipment });

    // A first setup on a phone whose profile cannot be read starts from the places stored.
    cleanup();
    await db.put('profile', { id: 'current', units: 'stone' });
    await act(async () => {
      await store.hydrate();
    });
    expect(store.getSnapshot().profile).toBeNull();
    await openSetup(store);
    await user.click(screen.getByRole('button', { name: 'Use defaults and skip setup' }));
    await vi.waitFor(() => expect(store.getSnapshot().profile).not.toBeNull());
    expect(await db.get('locations', 'home')).toMatchObject({ equipment });
  });

  it('starts a first setup with no readable profile from the places stored, and Finish keeps them (ninth re-check)', async () => {
    const { store } = await withProfile();
    const equipment = normalizeEquipment(GYM_DEFAULT_EQUIPMENT.slice(0, 2));
    await store.saveLocation({
      ...store.getSnapshot().locations.find((place) => place.id === 'home')!,
      equipment,
    });
    const db = await store.getDatabase();
    await db.put('profile', { id: 'current', units: 'stone' });
    // The phone opens with that profile on disk: setup is a first one from the start.
    await store.hydrate();
    expect(store.getSnapshot().profile).toBeNull();
    const user = userEvent.setup();
    await openSetup(store);
    for (let step = 1; step < 7; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    await vi.waitFor(() => expect(store.getSnapshot().profile).not.toBeNull());
    expect(await db.get('locations', 'home')).toMatchObject({ equipment });
  });

  it('finishes on a second tap after a save cut off part-way, its answers kept (eleventh re-check)', async () => {
    const handle = createTestStore({ now: ticking() });
    const { store } = handle;
    await store.hydrate();
    const saveProfile = store.saveProfile.bind(store);
    vi.spyOn(store, 'saveProfile')
      .mockRejectedValueOnce(new Error('The phone is out of space.'))
      .mockImplementation(saveProfile);
    const user = userEvent.setup();
    await openSetup(store);
    for (let step = 1; step < 7; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByText('The phone is out of space.')).toBeInTheDocument();
    expect(store.getSnapshot().profile).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    await vi.waitFor(() => expect(store.getSnapshot().profile).not.toBeNull());
    expect(screen.queryByText(/Your data changed while setup was open/)).toBeNull();
  });

  it('resumes a setup cut off part-way when it is opened again, with no reload (twelfth re-check)', async () => {
    const factory = new IDBFactory();
    const clock = ticking();
    let failHome = false;
    const handle = createTestStore({
      factory,
      now: clock,
      openDb: async () => {
        const db = await openDatabase({ factory, name: 'wc-cut-off', now: clock });
        const put = db.put.bind(db);
        db.put = (async (store: Parameters<typeof put>[0], value: Parameters<typeof put>[1]) => {
          if (failHome && store === 'locations' && (value as { id?: string }).id === 'home') {
            failHome = false;
            throw new Error('The phone is out of space.');
          }
          return put(store, value);
        }) as typeof db.put;
        return db;
      },
    });
    const { store } = handle;
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, GYM_LOCATION_ID), units: 'kg' },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const user = userEvent.setup();
    await openSetup(store);
    // Run setup again with gym access off: the Gym goes, then Home's write fails.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('switch', { name: /I have gym access/ }));
    for (let step = 3; step < 7; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    failHome = true;
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByText('The phone is out of space.')).toBeInTheDocument();
    expect(await (await store.getDatabase()).get('locations', GYM_LOCATION_ID)).toBeUndefined();
    // Opened again without a reload, it resumes where it was cut off.
    cleanup();
    const setup = await openSetup(store);
    expect(setup).toHaveTextContent('Step 7 of 7');
  });

  it('makes every default place when Use defaults is tapped again after a cut-off (thirteenth re-check)', async () => {
    const factory = new IDBFactory();
    const clock = ticking();
    let placesWritten = 0;
    let failSecond = false;
    const handle = createTestStore({
      factory,
      now: clock,
      openDb: async () => {
        const db = await openDatabase({ factory, name: 'wc-use-defaults', now: clock });
        const put = db.put.bind(db);
        db.put = (async (store: Parameters<typeof put>[0], value: Parameters<typeof put>[1]) => {
          if (failSecond && store === 'locations') {
            placesWritten += 1;
            if (placesWritten === 2) {
              failSecond = false;
              throw new Error('The phone is out of space.');
            }
          }
          return put(store, value);
        }) as typeof db.put;
        return db;
      },
    });
    const { store } = handle;
    await store.hydrate();
    const user = userEvent.setup();
    await openSetup(store);
    failSecond = true;
    await user.click(screen.getByRole('button', { name: 'Use defaults and skip setup' }));
    expect(await screen.findByText('The phone is out of space.')).toBeInTheDocument();
    expect(await (await store.getDatabase()).count('locations')).toBe(1);
    // Tapped again: every default place, not only the one the cut-off run wrote.
    await user.click(screen.getByRole('button', { name: 'Use defaults and skip setup' }));
    await vi.waitFor(() => expect(store.getSnapshot().profile).not.toBeNull());
    const db = await store.getDatabase();
    expect(await db.get('locations', 'home')).toBeDefined();
    expect(await db.get('locations', GYM_LOCATION_ID)).toBeDefined();
  });

  it('starts Use defaults after a refusal from the places as they are then (fourteenth re-check)', async () => {
    const handle = createTestStore({ now: ticking() });
    const { store } = handle;
    await store.hydrate();
    // A first setup over a stored Home, the profile unreadable.
    const db = await store.getDatabase();
    const home = createDefaultLocations({ gymAccess: false }, TEST_NOW)[0]!;
    await db.put('locations', home);
    await db.put('profile', { id: 'current', units: 'stone' });
    await store.hydrate();
    const user = userEvent.setup();
    await openSetup(store);
    // Meanwhile another window changes Home.
    const equipment = normalizeEquipment(GYM_DEFAULT_EQUIPMENT.slice(0, 2));
    await db.put('locations', { ...home, equipment, updatedAt: '2026-09-09T12:00:00.000Z' });
    for (let step = 1; step < 7; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByText(/Your data changed while setup was open/)).toBeInTheDocument();
    // Use defaults keeps the other window's Home, not the one setup opened with.
    await user.click(screen.getByRole('button', { name: 'Use defaults and skip setup' }));
    await vi.waitFor(() => expect(store.getSnapshot().profile).not.toBeNull());
    expect(await db.get('locations', 'home')).toMatchObject({ equipment });
  });

  it('keeps a first setup on screen after its profile’s check failed, and the next tap saves (fifteenth re-check)', async () => {
    const factory = new IDBFactory();
    const clock = ticking();
    let armed = false;
    let checkFails = false;
    const handle = createTestStore({
      factory,
      now: clock,
      openDb: async () => {
        const db = await openDatabase({ factory, name: 'wc-profile-check', now: clock });
        const put = db.put.bind(db);
        const get = db.get.bind(db);
        db.put = (async (name: Parameters<typeof put>[0], value: Parameters<typeof put>[1]) => {
          const result = await put(name, value);
          if (armed && name === 'profile') {
            armed = false;
            checkFails = true;
          }
          return result;
        }) as typeof db.put;
        db.get = (async (name: Parameters<typeof get>[0], key: Parameters<typeof get>[1]) => {
          if (checkFails && name === 'profile') {
            checkFails = false;
            throw new Error('The read did not answer.');
          }
          return get(name, key);
        }) as typeof db.get;
        return db;
      },
    });
    const { store } = handle;
    await store.hydrate();
    const user = userEvent.setup();
    await openSetup(store);
    for (let step = 1; step < 7; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    armed = true;
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByText('The read did not answer.')).toBeInTheDocument();
    // Setup stays on screen with no profile shown, and the next tap saves.
    expect(store.getSnapshot().profile).toBeNull();
    expect(screen.getByTestId('onboarding')).toHaveTextContent('Step 7 of 7');
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    await vi.waitFor(() => expect(store.getSnapshot().profile).not.toBeNull());
  });

  it('holds its answers while Finish saves (seventh re-check)', async () => {
    const { store } = await withProfile();
    const user = userEvent.setup();
    await openSetup(store);
    for (let step = 1; step < 7; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const complete = store.completeOnboarding.bind(store);
    const saving = vi.spyOn(store, 'completeOnboarding').mockImplementation(async (...args) => {
      await gate;
      return complete(...args);
    });
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) expect(radio).toBeDisabled();
    await act(async () => {
      release();
      await saving.mock.results[0]?.value;
    });
  });

  it('is not resumed once places have come back, a first setup with no readable profile (tenth re-check)', async () => {
    const handle = createTestStore({ now: ticking() });
    const { store } = handle;
    await store.hydrate();
    // A first run left at step 4, before anything came back.
    saveDraft(3, null);
    // The owner's places come back, with a profile this build cannot read.
    const db = await store.getDatabase();
    for (const place of createDefaultLocations({ gymAccess: true }, TEST_NOW)) {
      await db.put('locations', place);
    }
    await db.put('profile', { id: 'current', units: 'stone' });
    await store.hydrate();
    const setup = await openSetup(store);
    expect(setup).toHaveTextContent('Step 1 of 7');
  });

  it('starts again when a place has changed since it began', async () => {
    const { store } = await withProfile();
    const state = store.getSnapshot();
    saveDraft(3, draftBase(state.profile, state.locations));
    await store.saveLocation({
      ...state.locations.find((place) => place.id === GYM_LOCATION_ID)!,
      name: 'Gym downtown',
    });
    const setup = await openSetup(store);
    expect(setup).toHaveTextContent('Step 1 of 7');
  });
});
