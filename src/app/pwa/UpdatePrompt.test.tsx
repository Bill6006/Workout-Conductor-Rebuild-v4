import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('UpdatePrompt', () => {
  beforeEach(() => {
    state.needRefresh = false;
    state.offlineReady = false;
    vi.clearAllMocks();
  });

  it('renders nothing when there is no update and the shell is not newly cached', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Reload and Later when a new version is waiting, never forcing a refresh', async () => {
    state.needRefresh = true;
    const user = userEvent.setup();
    render(<UpdatePrompt />);

    expect(screen.getByRole('status')).toHaveTextContent('New version available');
    expect(updateServiceWorker).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(setNeedRefresh).toHaveBeenCalledWith(false);
    expect(updateServiceWorker).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('announces offline readiness', () => {
    state.offlineReady = true;
    render(<UpdatePrompt />);
    expect(screen.getByRole('status')).toHaveTextContent('Ready to work offline');
  });
});
