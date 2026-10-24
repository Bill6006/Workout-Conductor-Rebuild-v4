import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { resetInstallOfferForTests, watchInstallOffer } from '../../app/pwa/installOffer';
import { type AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * "Install the app" in Settings (2026-10-24, Life Mirror's fix of 2026-10-03): shown at the top
 * only while the browser offers to install the app; a tap opens the browser's own dialog once,
 * and the card goes once the offer is used or the app is installed.
 */

async function onboarded(): Promise<AppStore> {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle.store;
}

async function renderSettings(store: AppStore): Promise<void> {
  act(() => {
    window.location.hash = '#/settings';
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
  await screen.findByRole('heading', { level: 1, name: 'Settings' });
}

function browserOffer(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(async () => undefined);
  Object.defineProperty(event, 'prompt', { value: prompt });
  Object.defineProperty(event, 'userChoice', {
    value: Promise.resolve({ outcome, platform: 'web' }),
  });
  return { event, prompt };
}

let stop: () => void = () => undefined;

afterEach(() => {
  stop();
  resetInstallOfferForTests();
});

describe('Install the app, in Settings', () => {
  it('is not there while the browser makes no offer', async () => {
    stop = watchInstallOffer(window);
    await renderSettings(await onboarded());
    expect(screen.queryByTestId('install-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install the app' })).not.toBeInTheDocument();
  });

  it('shows at the top of Settings while the offer stands, and a tap asks once and clears it', async () => {
    stop = watchInstallOffer(window);
    const user = userEvent.setup();
    await renderSettings(await onboarded());
    const { event, prompt } = browserOffer('accepted');
    act(() => {
      window.dispatchEvent(event);
    });
    const card = await screen.findByTestId('install-card');
    // At the top: before the save line and every group of rows.
    const first = screen.getByTestId('settings-training');
    expect(card.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card).toHaveTextContent('without Chrome’s address bar');
    await user.click(screen.getByRole('button', { name: 'Install the app' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(screen.queryByTestId('install-card')).not.toBeInTheDocument());
  });

  it('is held off while the browser’s dialog is open, so a second tap asks nothing', async () => {
    stop = watchInstallOffer(window);
    const user = userEvent.setup();
    await renderSettings(await onboarded());
    const event = new Event('beforeinstallprompt', { cancelable: true });
    const prompt = vi.fn(async () => undefined);
    Object.defineProperty(event, 'prompt', { value: prompt });
    // The dialog stays open: no answer yet.
    Object.defineProperty(event, 'userChoice', { value: new Promise(() => undefined) });
    act(() => {
      window.dispatchEvent(event);
    });
    const button = await screen.findByRole('button', { name: 'Install the app' });
    await user.click(button);
    expect(button).toBeDisabled();
    await user.click(button);
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('a prompt the browser refuses clears the card and leaves no error unhandled', async () => {
    stop = watchInstallOffer(window);
    const user = userEvent.setup();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await renderSettings(await onboarded());
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.defineProperty(event, 'prompt', {
        value: vi.fn(async () => {
          throw new DOMException('already used', 'InvalidStateError');
        }),
      });
      Object.defineProperty(event, 'userChoice', { value: new Promise(() => undefined) });
      act(() => {
        window.dispatchEvent(event);
      });
      await user.click(await screen.findByRole('button', { name: 'Install the app' }));
      await vi.waitFor(() => expect(screen.queryByTestId('install-card')).not.toBeInTheDocument());
      // A rejection nobody handles is reported a turn or two later.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('comes back when the browser offers again, and goes once the app is installed', async () => {
    stop = watchInstallOffer(window);
    const user = userEvent.setup();
    await renderSettings(await onboarded());
    act(() => {
      window.dispatchEvent(browserOffer('dismissed').event);
    });
    await user.click(await screen.findByRole('button', { name: 'Install the app' }));
    await vi.waitFor(() => expect(screen.queryByTestId('install-card')).not.toBeInTheDocument());
    act(() => {
      window.dispatchEvent(browserOffer().event);
    });
    expect(await screen.findByTestId('install-card')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByTestId('install-card')).not.toBeInTheDocument();
  });
});
