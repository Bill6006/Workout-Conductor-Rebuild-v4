import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { GYM_DEFAULT_EQUIPMENT } from '../../catalog/equipment/equipment';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { DUMBBELLS_KEY } from '../../engine/loading/loading';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * Custom equipment presets on screen (the owner, 2026-10-31): Settings, Places, Equipment presets,
 * where the lifter's own are made, renamed and deleted beside the built-in Home and Full gym; and a
 * place's equipment, where each fills the place in one tap and the place keeps its weights.
 * Synthetic data only.
 */

async function lifter(): Promise<AppStore> {
  const { store } = createTestStore({ now: () => TEST_NOW, minOverlayMs: 0 });
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return store;
}

function show(store: AppStore, hash: string): void {
  act(() => {
    window.location.hash = hash;
  });
  render(
    <Providers store={store}>
      <App />
    </Providers>,
  );
}

const sheet = () => screen.getByRole('dialog');

describe('Settings, Equipment presets', () => {
  it('shows Home and Full gym built in, with nothing on them to change', async () => {
    show(await lifter(), '#/settings/presets');
    const builtIn = await screen.findAllByTestId('built-in-preset');
    expect(builtIn.map((row) => row.querySelector('strong')?.textContent)).toEqual([
      'Full gym',
      'Home',
    ]);
    for (const row of builtIn) {
      expect(row).toHaveTextContent('Built in');
      expect(within(row).queryByRole('button')).toBeNull();
    }
  });

  it('makes one: named, its equipment Full gym’s less one, then lists it', async () => {
    const store = await lifter();
    show(store, '#/settings/presets');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('new-preset'));
    await user.type(within(sheet()).getByLabelText('Name'), 'Hotel gym');
    await user.click(within(sheet()).getByRole('button', { name: 'Full gym preset' }));
    await user.click(within(sheet()).getByRole('button', { name: 'Barbell + plates', pressed: true }));
    await user.click(within(sheet()).getByTestId('preset-save'));
    const row = await screen.findByTestId('own-preset');
    expect(row).toHaveTextContent('Hotel gym');
    expect(row).toHaveTextContent(`${GYM_DEFAULT_EQUIPMENT.length - 1} items`);
    expect(store.getSnapshot().equipmentPresets[0]?.equipment).not.toContain('barbell');
  });

  it('refuses a built-in’s name, saying so, and keeps nothing', async () => {
    const store = await lifter();
    show(store, '#/settings/presets');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('new-preset'));
    await user.type(within(sheet()).getByLabelText('Name'), 'Home');
    await user.click(within(sheet()).getByTestId('preset-save'));
    expect(
      await within(sheet()).findByText('Home is built in; choose another name.'),
    ).toBeInTheDocument();
    expect(store.getSnapshot().equipmentPresets).toEqual([]);
  });

  it('renames one, and deletes it', async () => {
    const store = await lifter();
    await store.saveEquipmentPreset({ name: 'Hotel gym', equipment: ['adjustable-dumbbells'] });
    show(store, '#/settings/presets');
    const user = userEvent.setup();
    const row = await screen.findByTestId('own-preset');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    const name = within(sheet()).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Work gym');
    await user.click(within(sheet()).getByTestId('preset-save'));
    await waitFor(() => expect(screen.getByTestId('own-preset')).toHaveTextContent('Work gym'));
    await user.click(
      within(screen.getByTestId('own-preset')).getByRole('button', { name: 'Edit' }),
    );
    await user.click(within(sheet()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByTestId('own-preset')).toBeNull());
    expect(store.getSnapshot().equipmentPresets).toEqual([]);
  });
});

describe('a place’s equipment', () => {
  it('offers the lifter’s presets beside Full gym and Home; a tap copies one in, the weights kept', async () => {
    const store = await lifter();
    const preset = await store.saveEquipmentPreset({
      name: 'Hotel gym',
      equipment: ['adjustable-dumbbells', 'adjustable-bench'],
    });
    const dumbbells = { kind: 'dumbbells' as const, ranges: [{ from: 5, to: 50, step: 5 }] };
    await store.saveLoading('gym', DUMBBELLS_KEY, dumbbells);
    show(store, '#/plan/places');
    const user = userEvent.setup();
    const places = await screen.findByRole('list', { name: 'Saved locations' });
    const gym = within(places)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.includes('Gym'))!;
    await user.click(within(gym).getByRole('button', { name: 'Edit' }));
    const presets = within(sheet()).getAllByTestId('custom-preset');
    expect(presets.map((button) => button.textContent)).toEqual(['Hotel gym preset']);
    await user.click(presets[0]!);
    expect(within(sheet()).getByText('2 selected')).toBeInTheDocument();
    await user.click(within(sheet()).getByRole('button', { name: 'Save place' }));
    await waitFor(() =>
      expect(store.getSnapshot().locations.find((place) => place.id === 'gym')?.equipment).toEqual(
        preset.equipment,
      ),
    );
    expect(
      store.getSnapshot().locations.find((place) => place.id === 'gym')?.loading[DUMBBELLS_KEY],
    ).toEqual(dumbbells);
  });
});
