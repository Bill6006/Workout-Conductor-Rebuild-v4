import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../core/validation/location';
import { createDefaultProfile } from '../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../test/testStore';
import { App } from './App';
import type { AppStore } from '../core/state/appStore';

function renderApp(store: AppStore) {
  return render(
    <Providers store={store}>
      <App />
    </Providers>,
  );
}

function setHash(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
  });
}

async function seededStore() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

describe('App', () => {
  it('shows the shell brand, phase chip, and build marker while loading and after', async () => {
    const { store } = createTestStore();
    renderApp(store);
    expect(screen.getByText('Workout Conductor')).toBeInTheDocument();
    expect(screen.getByTestId('phase-chip')).toHaveTextContent('Phase 2');
    expect(screen.getByTestId('build-marker')).toHaveTextContent(/^Build \S+ · .+ · Phase 2$/);
    await screen.findByRole('heading', { level: 1, name: 'What are you training for?' });
  });

  it('starts with onboarding on first run and hides the tab bar', async () => {
    const { store } = createTestStore();
    renderApp(store);
    await screen.findByRole('heading', { level: 1, name: 'What are you training for?' });
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
    const primary = screen.getByRole('radiogroup', { name: 'Primary goal' });
    expect(within(primary).getByRole('radio', { name: /Build muscle/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('skipping with defaults saves a verified profile and shows the demo workout', async () => {
    const { store } = createTestStore();
    const user = userEvent.setup();
    renderApp(store);
    await user.click(await screen.findByRole('button', { name: 'Use defaults and skip setup' }));

    await screen.findByRole('heading', { level: 1, name: 'Today' });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Chest + Arms focus (demo)' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Default: \d+ min/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Workout' })).toBeDisabled();
    expect(store.getSnapshot().profile?.goals.primary).toBe('build-muscle');
    expect(store.getSnapshot().lastReceipt?.store).toBe('profile');
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('walks through every onboarding step and finishes', async () => {
    const { store } = createTestStore();
    const user = userEvent.setup();
    renderApp(store);
    await screen.findByRole('heading', { level: 1, name: 'What are you training for?' });

    const primary = screen.getByRole('radiogroup', { name: 'Primary goal' });
    await user.click(within(primary).getByRole('radio', { name: /Strength progress/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { level: 1, name: 'How often, and how long?' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { level: 1, name: 'Where do you train?' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { level: 1, name: 'Exercises you love or avoid' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { level: 1, name: 'Anything to work around?' });
    await user.click(screen.getByRole('switch', { name: /Avoid barbell squats/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { level: 1, name: 'Style and techniques' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { level: 1, name: 'Units and bodyweight' });
    await user.click(screen.getByRole('radio', { name: /Kilograms/ }));
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));

    await screen.findByRole('heading', { level: 1, name: 'Today' });
    const profile = store.getSnapshot().profile;
    expect(profile?.goals.primary).toBe('strength');
    expect(profile?.limitations.avoidBarbellSquats).toBe(true);
    expect(profile?.units).toBe('kg');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Full-body strength (demo)' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Back Squat')).not.toBeInTheDocument();
  });

  it('blocks a step whose answers conflict', async () => {
    const { store } = createTestStore();
    const user = userEvent.setup();
    renderApp(store);
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { level: 1, name: 'How often, and how long?' });
    await user.click(screen.getByRole('radio', { name: '6' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You chose 6 sessions but only 4 available days.',
    );
  });

  it('navigates between the five tabs once a profile exists', async () => {
    const { store } = await seededStore();
    renderApp(store);
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Today', 'Workout', 'Progress', 'Plan', 'Settings']);
    setHash('#/plan');
    expect(await screen.findByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Saved locations' })).toHaveTextContent('Home');
    setHash('#/settings');
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    setHash('#/nowhere');
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  });

  it('autosaves a settings change with verification', async () => {
    const { store } = await seededStore();
    const user = userEvent.setup();
    window.location.hash = '#/settings';
    renderApp(store);
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await user.click(screen.getByRole('switch', { name: /Allow drop sets/ }));
    await waitFor(() => expect(store.getSnapshot().profile?.techniques.dropSets).toBe(false), {
      timeout: 3000,
    });
    expect(screen.getByTestId('settings-save-status')).toHaveTextContent('Saved and verified');
  });

  it('lets the user switch the current location from Plan', async () => {
    const { store } = await seededStore();
    const user = userEvent.setup();
    window.location.hash = '#/plan';
    renderApp(store);
    await screen.findByRole('heading', { level: 1, name: 'Plan' });
    await user.click(screen.getByRole('button', { name: 'Use' }));
    await waitFor(() => expect(store.getSnapshot().profile?.currentLocationId).toBe('home'));
  });
});
