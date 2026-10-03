import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CLOUD_REQUEST_TIMEOUT_MS } from '../core/cloud/cloudSync';
import { TOKEN_MIRROR_KEY } from '../core/cloud/tokenVault';
import { GYM_LOCATION_ID, createDefaultLocations } from '../core/validation/location';
import { createDefaultProfile } from '../core/validation/profile';
import { createFakeCloud } from '../test/fakeCloud';
import { Providers, TEST_NOW, createTestStore } from '../test/testStore';
import { RESTORING_PATIENCE_MS } from '../features/onboarding/RestoringScreen';
import { CLOUD_OFFLINE } from '../core/state/appStore';
import { App } from './App';

/**
 * Maintenance 25, the tenth review: a phone with a cloud copy and an empty database (Chrome had
 * cleared it) shows that its data is on its way back, not setup, until the copy has been walked;
 * offline, the lifter may set up anyway. The token here is made up.
 */

describe('a phone whose data is on its way back from the cloud copy', () => {
  it('waits for the cloud copy in place of setup, and offers setup anyway while offline', async () => {
    const handle = createTestStore({
      cloudClient: async () => createFakeCloud().client,
      isOnline: () => false,
    });
    handle.storage.setItem(TOKEN_MIRROR_KEY, 'restoring-token-never-real');
    const { store } = handle;
    const hydrate = vi.spyOn(store, 'hydrate');
    act(() => {
      window.location.hash = '#/today';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    await act(async () => {
      await hydrate.mock.results[0]?.value;
    });
    expect(await screen.findByTestId('restoring-screen')).toHaveTextContent(
      'This phone is offline',
    );
    expect(screen.queryByRole('button', { name: 'Use defaults and skip setup' })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('restoring-skip'));
    expect(
      await screen.findByRole('button', { name: 'Use defaults and skip setup' }),
    ).toBeInTheDocument();
    store.stopCloud();
  });

  it('offers setup anyway when the walk runs long, and not before', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // A copy that never answers.
      const silent = {
        execute: () => new Promise<never>(() => undefined),
        batch: () => new Promise<never>(() => undefined),
        close: () => undefined,
      };
      const handle = createTestStore({ cloudClient: async () => silent, isOnline: () => true });
      handle.storage.setItem(TOKEN_MIRROR_KEY, 'restoring-token-never-real');
      const { store } = handle;
      const hydrate = vi.spyOn(store, 'hydrate');
      render(
        <Providers store={store}>
          <App />
        </Providers>,
      );
      await act(async () => {
        await hydrate.mock.results[0]?.value;
      });
      expect(await screen.findByTestId('restoring-screen')).toHaveTextContent('coming back');
      expect(screen.queryByTestId('restoring-skip')).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(RESTORING_PATIENCE_MS);
      });
      expect(screen.getByTestId('restoring-skip')).toBeInTheDocument();
      store.stopCloud();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets setup finished while the copy never answers wait only one request’s bound (fifth re-check)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const silent = {
        execute: () => new Promise<never>(() => undefined),
        batch: () => new Promise<never>(() => undefined),
        close: () => undefined,
      };
      const handle = createTestStore({ cloudClient: async () => silent, isOnline: () => true });
      handle.storage.setItem(TOKEN_MIRROR_KEY, 'restoring-token-never-real');
      const { store } = handle;
      await store.hydrate();
      const sync = store.syncNow({ pull: true, force: true });
      store.skipRestoring();
      let done = false;
      const setup = store
        .completeOnboarding(
          createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
          createDefaultLocations({ gymAccess: true }, TEST_NOW),
        )
        .then((outcome) => {
          done = true;
          return outcome;
        });
      // Setup waits its turn behind the sync.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(done).toBe(false);
      // The copy's request gives up, the sync fails, and setup saves.
      await vi.advanceTimersByTimeAsync(CLOUD_REQUEST_TIMEOUT_MS);
      expect(await setup).toBe('saved');
      await sync;
      store.stopCloud();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets requests made while a sync waits its turn join it, so setup waits through two at most (seventh re-check)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let reached = 0;
      const silent = {
        execute: () => {
          reached += 1;
          return new Promise<never>(() => undefined);
        },
        batch: () => new Promise<never>(() => undefined),
        close: () => undefined,
      };
      const handle = createTestStore({ cloudClient: async () => silent, isOnline: () => true });
      handle.storage.setItem(TOKEN_MIRROR_KEY, 'restoring-token-never-real');
      const { store } = handle;
      await store.hydrate();
      const running = store.syncNow({ pull: true, force: true });
      await vi.waitFor(() => expect(reached).toBe(1));
      // Three taps on Try again while that one runs: one more sync, which the others join.
      const second = store.syncNow({ pull: true, force: true });
      const third = store.syncNow({ pull: true, force: true });
      const fourth = store.syncNow({ pull: false });
      expect(second).not.toBe(running);
      expect(third).toBe(second);
      expect(fourth).toBe(second);
      store.skipRestoring();
      let done = false;
      const setup = store
        .completeOnboarding(
          createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
          createDefaultLocations({ gymAccess: true }, TEST_NOW),
        )
        .then((outcome) => {
          done = true;
          return outcome;
        });
      await vi.advanceTimersByTimeAsync(CLOUD_REQUEST_TIMEOUT_MS);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(CLOUD_REQUEST_TIMEOUT_MS);
      expect(await setup).toBe('saved');
      expect(reached).toBe(2);
      await Promise.all([running, second]);
      store.stopCloud();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails a sync whose cloud driver never arrives, so setup waiting its turn goes on (seventh re-check)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const handle = createTestStore({
        cloudClient: () => new Promise<never>(() => undefined),
        isOnline: () => true,
      });
      handle.storage.setItem(TOKEN_MIRROR_KEY, 'restoring-token-never-real');
      const { store } = handle;
      await store.hydrate();
      const sync = store.syncNow({ pull: true, force: true });
      store.skipRestoring();
      const setup = store.completeOnboarding(
        createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
        createDefaultLocations({ gymAccess: true }, TEST_NOW),
      );
      await vi.advanceTimersByTimeAsync(CLOUD_REQUEST_TIMEOUT_MS);
      expect(await sync).toMatchObject({ ran: true, error: 'no answer within 30 seconds' });
      expect(await setup).toBe('saved');
      expect(store.getSnapshot().cloud.lastError).toBe('no answer within 30 seconds');
      store.stopCloud();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads as offline when the cloud driver cannot come while offline (eighth re-check)', async () => {
    const handle = createTestStore({
      cloudClient: () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
      isOnline: () => false,
    });
    handle.storage.setItem(TOKEN_MIRROR_KEY, 'restoring-token-never-real');
    const { store } = handle;
    await store.hydrate();
    // What Sync now says too: offline, not the driver's error (ninth re-check).
    expect(await store.syncNow({ pull: true, force: true })).toMatchObject({
      ran: false,
      reason: 'offline',
      error: null,
    });
    expect(store.getSnapshot().cloud.lastError).toBe(CLOUD_OFFLINE);
    store.stopCloud();
  });
});
