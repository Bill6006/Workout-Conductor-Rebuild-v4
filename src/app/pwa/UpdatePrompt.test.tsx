import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { UpdatePrompt } from './UpdatePrompt';

const setNeedRefresh = vi.fn();
const setOfflineReady = vi.fn();
const updateServiceWorker = vi.fn(() => Promise.resolve());

const state = {
  needRefresh: false,
  offlineReady: false,
};

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [state.needRefresh, setNeedRefresh],
    offlineReady: [state.offlineReady, setOfflineReady],
    updateServiceWorker,
  }),
}));

async function seeded() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

describe('UpdatePrompt', () => {
  beforeEach(() => {
    state.needRefresh = false;
    state.offlineReady = false;
    vi.clearAllMocks();
  });

  it('renders nothing when there is no update and the shell is not newly cached', async () => {
    const { store } = await seeded();
    render(
      <Providers store={store}>
        <UpdatePrompt />
      </Providers>,
    );
    expect(screen.queryByTestId('update-prompt')).toBeNull();
  });

  it('offers Reload and Later when a new version is waiting, never forcing a refresh', async () => {
    state.needRefresh = true;
    const { store } = await seeded();
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <UpdatePrompt />
      </Providers>,
    );

    expect(screen.getByTestId('update-prompt')).toHaveTextContent('New version available');
    expect(updateServiceWorker).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(setNeedRefresh).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('withholds Reload during an active workout and says the offer comes after it', async () => {
    state.needRefresh = true;
    const { store } = await seeded();
    await store.startWorkout();
    render(
      <Providers store={store}>
        <UpdatePrompt />
      </Providers>,
    );
    expect(screen.getByTestId('update-prompt')).toHaveTextContent('New version ready');
    expect(screen.getByTestId('update-prompt')).toHaveTextContent('after this workout');
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('announces the offline-ready shell briefly', async () => {
    state.offlineReady = true;
    const { store } = await seeded();
    render(
      <Providers store={store}>
        <UpdatePrompt />
      </Providers>,
    );
    expect(screen.getByTestId('update-prompt')).toHaveTextContent('Ready to work offline');
  });
});
