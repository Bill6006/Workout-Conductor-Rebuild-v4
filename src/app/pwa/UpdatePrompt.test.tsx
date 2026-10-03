import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { page } from './pageReload';
import { UPDATE_CHECK_MS, UpdatePrompt } from './UpdatePrompt';

const setNeedRefresh = vi.fn();
const setOfflineReady = vi.fn();
const updateServiceWorker = vi.fn(() => Promise.resolve());

const state = {
  needRefresh: false,
  offlineReady: false,
};

/** What the app passed to the registration hook: its callbacks, as the plugin calls them. */
const registered: {
  options?: {
    onNeedRefresh?: () => void;
    onRegisteredSW?: (url: string, registration?: ServiceWorkerRegistration) => void;
  };
} = {};

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: (typeof registered)['options']) => {
    registered.options = options;
    return {
      needRefresh: [state.needRefresh, setNeedRefresh],
      offlineReady: [state.offlineReady, setOfflineReady],
      updateServiceWorker,
    };
  },
}));

/** A registration as the browser gives it: `update` looks for a new worker. */
function fakeRegistration(waiting = false) {
  return Object.assign(new EventTarget(), {
    update: vi.fn(() => Promise.resolve()),
    waiting: waiting
      ? (Object.assign(new EventTarget(), { state: 'installed' }) as unknown as ServiceWorker)
      : null,
    installing: null as ServiceWorker | null,
  }) as unknown as ServiceWorkerRegistration & {
    update: ReturnType<typeof vi.fn>;
    waiting: ServiceWorker | null;
    installing: ServiceWorker | null;
  };
}

/** The page's service worker container: the worker in control, and its change. */
function controlledBy(controller: object | null) {
  const container = Object.assign(new EventTarget(), { controller });
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  return container;
}

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

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
    vi.spyOn(page, 'reload').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  /** The prompt, with the plugin's registration handed over as it hands it. */
  async function renderedWith(registration?: ServiceWorkerRegistration) {
    const { store } = await seeded();
    render(
      <Providers store={store}>
        <UpdatePrompt />
      </Providers>,
    );
    if (registration) act(() => registered.options?.onRegisteredSW?.('sw.js', registration));
    return store;
  }

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
    // Nothing waiting: the page loads again, onto whatever runs the service worker now.
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('hands over to the release waiting, and loads the page again once it has taken over', async () => {
    state.needRefresh = true;
    const container = controlledBy({});
    await renderedWith(fakeRegistration(true));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    // Whether or not the plugin still listens, the page loads again when the new worker is in.
    expect(page.reload).not.toHaveBeenCalled();
    act(() => {
      container.dispatchEvent(new Event('controllerchange'));
    });
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('offers a release the moment it waits, found whenever the app looked (Maintenance 25)', async () => {
    controlledBy({});
    const registration = fakeRegistration();
    await renderedWith(registration);
    const worker = Object.assign(new EventTarget(), {
      state: 'installing',
    }) as unknown as ServiceWorker & {
      state: string;
    };
    registration.installing = worker;
    act(() => {
      registration.dispatchEvent(new Event('updatefound'));
    });
    worker.state = 'installed';
    registration.waiting = worker;
    act(() => {
      worker.dispatchEvent(new Event('statechange'));
    });
    expect(setNeedRefresh).toHaveBeenCalledWith(true);
  });

  it('offers the reload to a page left behind when another page let the release in (the second review)', async () => {
    const container = controlledBy({});
    await renderedWith(fakeRegistration());
    act(() => {
      container.dispatchEvent(new Event('controllerchange'));
    });
    expect(setNeedRefresh).toHaveBeenCalledWith(true);
  });

  it('loads a page no worker runs yet once the release it let in is active (the second review)', async () => {
    state.needRefresh = true;
    const container = controlledBy(null);
    const registration = fakeRegistration(true);
    const waiting = Object.assign(new EventTarget(), {
      state: 'installed',
    }) as unknown as ServiceWorker & {
      state: string;
    };
    registration.waiting = waiting;
    await renderedWith(registration);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(page.reload).not.toHaveBeenCalled();
    // No page of its own changes worker: the release being active is the sign.
    waiting.state = 'activated';
    act(() => {
      waiting.dispatchEvent(new Event('statechange'));
    });
    expect(page.reload).toHaveBeenCalledTimes(1);
    // A change of worker after that loads nothing twice.
    act(() => {
      container.dispatchEvent(new Event('controllerchange'));
    });
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('offers nothing for the first worker of a page no worker runs yet', async () => {
    controlledBy(null);
    const registration = fakeRegistration();
    await renderedWith(registration);
    const worker = Object.assign(new EventTarget(), {
      state: 'installing',
    }) as unknown as ServiceWorker & {
      state: string;
    };
    registration.installing = worker;
    act(() => {
      registration.dispatchEvent(new Event('updatefound'));
    });
    worker.state = 'installed';
    registration.waiting = worker;
    act(() => {
      worker.dispatchEvent(new Event('statechange'));
    });
    expect(setNeedRefresh).not.toHaveBeenCalledWith(true);
  });

  it('keeps the Reload offer during a workout and says the session carries on after it', async () => {
    state.needRefresh = true;
    const { store } = await seeded();
    await store.startWorkout();
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <UpdatePrompt />
      </Providers>,
    );
    expect(screen.getByTestId('update-prompt')).toHaveTextContent('New version available');
    // What a reload keeps, and nothing more: a value on a dial not yet logged is not promised.
    expect(screen.getByTestId('update-prompt')).toHaveTextContent(
      'Logged sets and timers are kept on this device and carry on after the reload.',
    );
    // Still never silent: nothing happens until the tap.
    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(page.reload).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(page.reload).toHaveBeenCalledTimes(1);
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

  describe('looking for a new release (Maintenance 25)', () => {
    afterEach(() => {
      vi.useRealTimers();
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    async function registeredWith(registration: ServiceWorkerRegistration) {
      const { store } = await seeded();
      render(
        <Providers store={store}>
          <UpdatePrompt />
        </Providers>,
      );
      act(() => registered.options?.onRegisteredSW?.('sw.js', registration));
    }

    it('looks when the app comes back to the front, not while it is away', async () => {
      const registration = fakeRegistration();
      await registeredWith(registration);
      act(() => setVisibility('hidden'));
      expect(registration.update).not.toHaveBeenCalled();
      act(() => setVisibility('visible'));
      expect(registration.update).toHaveBeenCalledTimes(1);
      // Nothing offered and nothing waiting: nothing to offer.
      expect(setNeedRefresh).not.toHaveBeenCalledWith(true);
    });

    it('offers again on return a release put off after another page let it in, though nothing waits (the third review)', async () => {
      const container = controlledBy({});
      const registration = fakeRegistration();
      await registeredWith(registration);
      act(() => {
        container.dispatchEvent(new Event('controllerchange'));
      });
      expect(setNeedRefresh).toHaveBeenCalledWith(true);
      setNeedRefresh.mockClear();
      act(() => setVisibility('hidden'));
      act(() => setVisibility('visible'));
      expect(setNeedRefresh).toHaveBeenCalledWith(true);
    });

    it('offers a release on a page no worker runs once it installs beside the active one, and again on return (the fourth review)', async () => {
      controlledBy(null);
      const registration = fakeRegistration();
      await registeredWith(registration);
      // A first visit: its own first worker installs and runs, though not this page.
      Object.assign(registration, { active: new EventTarget() });
      const worker = Object.assign(new EventTarget(), {
        state: 'installing',
      }) as unknown as ServiceWorker & {
        state: string;
      };
      registration.installing = worker;
      act(() => {
        registration.dispatchEvent(new Event('updatefound'));
      });
      worker.state = 'installed';
      registration.waiting = worker;
      act(() => {
        worker.dispatchEvent(new Event('statechange'));
      });
      expect(setNeedRefresh).toHaveBeenCalledWith(true);
      // It takes over at once: nothing waits, and put off, it is offered again on return.
      registration.waiting = null;
      setNeedRefresh.mockClear();
      act(() => setVisibility('hidden'));
      act(() => setVisibility('visible'));
      expect(setNeedRefresh).toHaveBeenCalledWith(true);
    });

    it('leaves a page loaded past a running worker to the plugin, as before (the fifth review)', async () => {
      // A hard reload: the page came from the network, its worker already running.
      controlledBy(null);
      const registration = fakeRegistration();
      Object.assign(registration, { active: new EventTarget() });
      await registeredWith(registration);
      const worker = Object.assign(new EventTarget(), {
        state: 'installing',
      }) as unknown as ServiceWorker & {
        state: string;
      };
      registration.installing = worker;
      act(() => {
        registration.dispatchEvent(new Event('updatefound'));
      });
      worker.state = 'installed';
      registration.waiting = worker;
      act(() => {
        worker.dispatchEvent(new Event('statechange'));
      });
      expect(setNeedRefresh).not.toHaveBeenCalledWith(true);
    });

    it('offers again on return a release the plugin offered that took over with no page under it (the third review)', async () => {
      controlledBy(null);
      const registration = fakeRegistration();
      await registeredWith(registration);
      // A page no worker runs yet: the release took over at once, and the plugin offered it.
      act(() => registered.options?.onNeedRefresh?.());
      act(() => setVisibility('hidden'));
      act(() => setVisibility('visible'));
      expect(setNeedRefresh).toHaveBeenCalledWith(true);
    });

    it('offers a release put off with Later again when the app comes back', async () => {
      const registration = fakeRegistration(true);
      await registeredWith(registration);
      act(() => setVisibility('hidden'));
      act(() => setVisibility('visible'));
      expect(setNeedRefresh).toHaveBeenCalledWith(true);
    });

    it('looks when the network comes back, and not while it is gone', async () => {
      const registration = fakeRegistration(true);
      await registeredWith(registration);
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      act(() => setVisibility('visible'));
      // Offline, the one already waiting is still offered; nothing is fetched.
      expect(setNeedRefresh).toHaveBeenCalledWith(true);
      expect(registration.update).not.toHaveBeenCalled();
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      setNeedRefresh.mockClear();
      act(() => window.dispatchEvent(new Event('online')));
      expect(registration.update).toHaveBeenCalledTimes(1);
      // Back online it looks, and a release put off waits for the app to come back (the second
      // review): a flaky signal at the gym brings back no offer.
      expect(setNeedRefresh).not.toHaveBeenCalledWith(true);
    });

    it('looks hourly while the app stays open, without offering a put-off release again', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const registration = fakeRegistration(true);
      await registeredWith(registration);
      act(() => {
        vi.advanceTimersByTime(UPDATE_CHECK_MS);
      });
      expect(registration.update).toHaveBeenCalledTimes(1);
      expect(setNeedRefresh).not.toHaveBeenCalledWith(true);
    });
  });
});
