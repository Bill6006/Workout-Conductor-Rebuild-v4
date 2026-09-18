import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { AlertsCard } from './AlertsCard';

const permission = vi.fn<() => string>();
const request = vi.fn<() => Promise<string>>();

vi.mock('../../core/alerts/notify', async () => {
  const actual = await vi.importActual<typeof import('../../core/alerts/notify')>(
    '../../core/alerts/notify',
  );
  return {
    ...actual,
    notifyPermission: () => permission(),
    requestNotifyPermission: () => request(),
  };
});

async function seeded() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

describe('AlertsCard', () => {
  beforeEach(() => {
    permission.mockReset();
    request.mockReset();
  });

  it('keeps the rest timer sounds on by default and turns them off on this device', async () => {
    permission.mockReturnValue('default');
    const { store } = await seeded();
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <AlertsCard />
      </Providers>,
    );
    const sounds = screen.getByRole('switch', { name: /Rest timer sounds/ });
    expect(sounds).toHaveAttribute('aria-checked', 'true');
    await user.click(sounds);
    expect(store.getSnapshot().localSettings.restSounds).toBe(false);
  });

  it('asks for permission only when notifications are turned on, and stays off when refused', async () => {
    permission.mockReturnValue('default');
    request.mockResolvedValue('denied');
    const { store } = await seeded();
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <AlertsCard />
      </Providers>,
    );
    expect(request).not.toHaveBeenCalled();
    const toggle = screen.getByRole('switch', { name: /Notifications/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(store.getSnapshot().localSettings.notifications).toBe(false);
    expect(await screen.findByText(/blocked for this site/)).toBeInTheDocument();
  });

  it('turns notifications on once the browser allows them, and says what they cannot do', async () => {
    permission.mockReturnValue('default');
    request.mockResolvedValue('granted');
    const { store } = await seeded();
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <AlertsCard />
      </Providers>,
    );
    await user.click(screen.getByRole('switch', { name: /Notifications/ }));
    await waitFor(() => expect(store.getSnapshot().localSettings.notifications).toBe(true));
    expect(screen.getByTestId('alerts-note')).toHaveTextContent(/may come late or not at all/);
  });

  it('hides the switch where the browser has no notifications', async () => {
    permission.mockReturnValue('unsupported');
    const { store } = await seeded();
    render(
      <Providers store={store}>
        <AlertsCard />
      </Providers>,
    );
    expect(screen.queryByRole('switch', { name: /Notifications/ })).toBeNull();
    expect(screen.getByTestId('alerts-note')).toHaveTextContent(
      'This browser has no notifications.',
    );
  });
});
