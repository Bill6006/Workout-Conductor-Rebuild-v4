import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentPosition } from '../engine/workout/sequence';
import { allEntries } from '../engine/workout/types';
import type { AppStore } from '../core/state/appStore';
import { doneKeys } from '../core/state/session';
import { createDefaultLocations } from '../core/validation/location';
import { createDefaultProfile } from '../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../test/testStore';
import { App } from './App';

vi.mock('../features/library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * Maintenance 29, the owner's item 8: "Screen wake lock during a workout". The screen stays on
 * while a workout runs, on any tab, and may sleep again once it is paused, finished, or left half
 * an hour with nothing logged.
 */
describe('the screen during a workout', () => {
  const request = vi.fn();
  const release = vi.fn(() => Promise.resolve());
  const MINUTE = 60_000;
  let clock = TEST_NOW;

  beforeEach(() => {
    // The page's clock and the store's agree: the workout's own times are the page's.
    vi.useFakeTimers({ now: Date.parse(TEST_NOW), shouldAdvanceTime: true });
    clock = TEST_NOW;
    request.mockReset();
    release.mockClear();
    request.mockImplementation(() => Promise.resolve({ release }));
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  async function started(): Promise<AppStore> {
    const { store } = createTestStore({ now: () => clock });
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    act(() => {
      window.location.hash = '#/today';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    await screen.findByTestId('start-workout');
    // Only a plan on the screen: nothing held.
    expect(request).not.toHaveBeenCalled();
    act(() => store.startWorkout());
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    return store;
  }

  it('stays on while the workout runs, and may sleep paused or finished', async () => {
    const store = await started();

    act(() => store.pauseWorkout());
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));

    request.mockClear();
    await act(() => store.resumeWorkout());
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));

    await act(async () => {
      await store.finishWorkout(null, { endedEarly: true });
    });
    await waitFor(() => expect(release).toHaveBeenCalledTimes(2));
  });

  it('takes the screen again on coming back to the app', async () => {
    await started();
    request.mockClear();
    // The browser lets the lock go while the app is away, and the app takes it on its return.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  });

  it('lets the screen sleep once the workout is left half an hour, and the next set wakes it', async () => {
    const store = await started();
    act(() => {
      vi.advanceTimersByTime(29 * MINUTE);
    });
    expect(release).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2 * MINUTE);
    });
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));

    // A set logged after it: the workout is under way again.
    request.mockClear();
    clock = new Date(Date.parse(TEST_NOW) + 31 * MINUTE).toISOString();
    const session = store.getSnapshot().session!;
    const keys = doneKeys(session.completed);
    const position = currentPosition(session.workout, (entry, index) =>
      keys.has(`${entry}:${index}`),
    )!;
    const entry = allEntries(session.workout.blocks).find((one) => one.id === position.entryId)!;
    const set = entry.sets.find((one) => one.index === position.setIndex)!;
    await act(() =>
      store.logSet(entry.id, set.index, {
        weight: set.targetWeight,
        reps: set.targetReps[0],
        rir: set.targetRir,
      }),
    );
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  });
});
