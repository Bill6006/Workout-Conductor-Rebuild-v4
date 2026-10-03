import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GYM_DEFAULT_EQUIPMENT, normalizeEquipment } from '../../catalog/equipment/equipment';
import { ToastContext } from '../../components/Toast/toastContext';
import { AppStoreProvider } from '../../core/state/AppStoreProvider';
import { GYM_LOCATION_ID, createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { setGymAccess, setLocationEquipment, updateProfile } from './draft';
import { useProfileEditor } from './useProfileEditor';

/**
 * Maintenance 25, the tenth review's sixth re-check: while a cleared phone's first walk of the
 * cloud copy is pending, a place cannot be deleted. In Settings, a refused deletion used to block
 * every edit after it: the profile was saved after the deletion, and the screen went on showing
 * the place gone, so each later save tried it again. The seventh re-check: saving the profile
 * first moved the current place off a place still kept, and showed the store half-way through a
 * save, so an edit made then could bring a deleted place back.
 */

const REFUSED =
  'Your places are still coming back from the cloud copy: remove a place once that is done.';

/** A clock a second further on at each call: a later save is later. */
function ticking(): () => string {
  let at = Date.parse(TEST_NOW);
  return () => new Date((at += 1000)).toISOString();
}

async function settings(currentPlace: string, show?: (message: string) => void) {
  const handle = createTestStore({ now: ticking() });
  const { store } = handle;
  await store.hydrate();
  await store.completeOnboarding(
    createDefaultProfile(TEST_NOW, currentPlace),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const wrapper = ({ children }: { children: ReactNode }) =>
    show ? (
      <AppStoreProvider store={store}>
        <ToastContext.Provider value={{ show }}>{children}</ToastContext.Provider>
      </AppStoreProvider>
    ) : (
      <Providers store={store}>{children}</Providers>
    );
  const hydrate = vi.spyOn(store, 'hydrate');
  const editor = renderHook(() => useProfileEditor(), { wrapper });
  // The provider reloads as it mounts; the edits come after, as on a phone.
  await act(async () => {
    await hydrate.mock.results[0]?.value;
  });
  return { store, editor };
}

function placesOf(draft: ReturnType<typeof useProfileEditor>['draft']) {
  return draft?.locations.map((place) => place.id) ?? [];
}

describe('Settings around a deletion it is refused (sixth re-check)', () => {
  it('saves nothing of an edit whose deletion is refused: the Gym stays the current place (seventh re-check)', async () => {
    const { store, editor } = await settings(GYM_LOCATION_ID);
    const refuse = vi.spyOn(store, 'deleteLocation').mockRejectedValue(new Error(REFUSED));
    act(() => {
      const draft = editor.result.current.draft!;
      editor.result.current.update(
        updateProfile(setGymAccess(draft, false, TEST_NOW), (profile) => ({
          ...profile,
          bodyweight: 201,
        })),
      );
    });
    await act(async () => {
      await editor.result.current.flush();
    });
    expect(refuse).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().profile?.currentLocationId).toBe(GYM_LOCATION_ID);
    expect(store.getSnapshot().profile?.bodyweight).toBeUndefined();
    expect(editor.result.current).toMatchObject({ status: 'error', error: REFUSED });
    expect(placesOf(editor.result.current.draft)).toContain(GYM_LOCATION_ID);
    expect(editor.result.current.draft?.profile.currentLocationId).toBe(GYM_LOCATION_ID);
  });

  it('shows the place again, so the next edit saves without trying the deletion again', async () => {
    const { store, editor } = await settings('home');
    const refuse = vi.spyOn(store, 'deleteLocation').mockRejectedValue(new Error(REFUSED));
    act(() => {
      editor.result.current.update(setGymAccess(editor.result.current.draft!, false, TEST_NOW));
    });
    await act(async () => {
      await editor.result.current.flush();
    });
    expect(editor.result.current.status).toBe('error');
    expect(placesOf(editor.result.current.draft)).toContain(GYM_LOCATION_ID);
    act(() => {
      editor.result.current.update(
        updateProfile(editor.result.current.draft!, (profile) => ({ ...profile, bodyweight: 202 })),
      );
    });
    await act(async () => {
      await editor.result.current.flush();
    });
    expect(store.getSnapshot().profile?.bodyweight).toBe(202);
    expect(editor.result.current).toMatchObject({ status: 'saved', error: null });
    expect(refuse).toHaveBeenCalledTimes(1);
  });

  it('keeps an edit on screen when its save fails for another reason', async () => {
    const { store, editor } = await settings('home');
    vi.spyOn(store, 'saveProfile').mockRejectedValue(new Error('The phone is out of space.'));
    act(() => {
      editor.result.current.update(
        updateProfile(editor.result.current.draft!, (profile) => ({ ...profile, bodyweight: 203 })),
      );
    });
    await act(async () => {
      await editor.result.current.flush();
    });
    expect(editor.result.current).toMatchObject({
      status: 'error',
      error: 'The phone is out of space.',
    });
    expect(editor.result.current.draft?.profile.bodyweight).toBe(203);
  });

  it('keeps showing an edit made while the refused save ran', async () => {
    const { store, editor } = await settings('home');
    let refuseNow!: () => void;
    vi.spyOn(store, 'deleteLocation').mockImplementation(
      () =>
        new Promise<never>((_, reject) => {
          refuseNow = () => reject(new Error(REFUSED));
        }),
    );
    act(() => {
      editor.result.current.update(setGymAccess(editor.result.current.draft!, false, TEST_NOW));
    });
    let flushing!: Promise<void>;
    act(() => {
      flushing = editor.result.current.flush();
    });
    await vi.waitFor(() => expect(refuseNow).toBeDefined());
    // A newer edit, on its way to its own save.
    act(() => {
      editor.result.current.update(
        updateProfile(editor.result.current.draft!, (profile) => ({ ...profile, bodyweight: 205 })),
      );
    });
    await act(async () => {
      refuseNow();
      await flushing;
    });
    expect(editor.result.current.status).toBe('error');
    expect(editor.result.current.draft?.profile.bodyweight).toBe(205);
  });

  it('shows the edit being saved until it is done, so an edit made meanwhile builds on it (seventh re-check)', async () => {
    const { store, editor } = await settings(GYM_LOCATION_ID);
    // The Home place's save waits: meanwhile the store is half-way through the edit.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const saveLocation = store.saveLocation.bind(store);
    vi.spyOn(store, 'saveLocation').mockImplementation(async (location) => {
      await gate;
      return saveLocation(location);
    });
    const equipment = normalizeEquipment(GYM_DEFAULT_EQUIPMENT.slice(0, 2));
    act(() => {
      const draft = editor.result.current.draft!;
      editor.result.current.update(
        setLocationEquipment(setGymAccess(draft, false, TEST_NOW), 'home', equipment, TEST_NOW),
      );
    });
    let flushing!: Promise<void>;
    act(() => {
      flushing = editor.result.current.flush();
    });
    // The Gym is deleted and the current place moved; the Home place is not saved yet.
    await vi.waitFor(() =>
      expect(store.getSnapshot().locations.map((place) => place.id)).not.toContain(GYM_LOCATION_ID),
    );
    await act(async () => undefined);
    const shown = editor.result.current.draft!;
    expect(placesOf(shown)).toEqual(['home']);
    expect(shown.locations[0]?.equipment).toEqual(equipment);
    expect(shown.profile.currentLocationId).toBe('home');
    await act(async () => {
      release();
      await flushing;
    });
    expect(editor.result.current.status).toBe('saved');
    expect(store.getSnapshot().locations[0]?.equipment).toEqual(equipment);
  });

  it('says what was not saved when Settings was left while the edit waited (seventh re-check)', async () => {
    const show = vi.fn();
    const { store, editor } = await settings('home', show);
    vi.spyOn(store, 'deleteLocation').mockRejectedValue(new Error(REFUSED));
    act(() => {
      editor.result.current.update(setGymAccess(editor.result.current.draft!, false, TEST_NOW));
    });
    // Left before the edit's wait is over: the save runs as the screen goes.
    editor.unmount();
    await vi.waitFor(() =>
      expect(show).toHaveBeenCalledWith(`Your Settings change was not saved. ${REFUSED}`, 'error'),
    );
  });

  it('saves one edit at a time, so a save never reads what another is still writing (eighth re-check)', async () => {
    const { store, editor } = await settings('home');
    const saveProfile = store.saveProfile.bind(store);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const saved: string[] = [];
    vi.spyOn(store, 'saveProfile').mockImplementation(async (profile) => {
      saved.push(`${profile.bodyweight ?? '-'}/${profile.units}`);
      if (saved.length === 1) await gate;
      return saveProfile(profile);
    });
    act(() => {
      editor.result.current.update(
        updateProfile(editor.result.current.draft!, (profile) => ({ ...profile, bodyweight: 201 })),
      );
    });
    let first!: Promise<void>;
    act(() => {
      first = editor.result.current.flush();
    });
    await vi.waitFor(() => expect(saved).toEqual(['201/lb']));
    // A second edit while the first is still being written.
    act(() => {
      editor.result.current.update(
        updateProfile(editor.result.current.draft!, (profile) => ({ ...profile, units: 'kg' })),
      );
    });
    let second!: Promise<void>;
    act(() => {
      second = editor.result.current.flush();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(saved).toEqual(['201/lb']);
    await act(async () => {
      release();
      await first;
      await second;
    });
    expect(saved).toEqual(['201/lb', '201/kg']);
    expect(store.getSnapshot().profile).toMatchObject({ bodyweight: 201, units: 'kg' });
    const [stored] = await (await store.getDatabase()).getAll<{ id: string }>('profile');
    expect(stored).toMatchObject({ bodyweight: 201, units: 'kg' });
  });
});
