import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { at } from '../test/clockDays';
import { Providers, createTestStore } from '../test/testStore';
import { localDayKey } from '../core/time/localDate';
import { createDefaultLocations, HOME_LOCATION_ID } from '../core/validation/location';
import { createDefaultProfile } from '../core/validation/profile';

vi.mock('../features/library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * The owner's report of 2026-11-01: a Home edit seemed to change the Gym's plan. The plan was the
 * day before's, still on screen after the app came back to the front, and the save put the new
 * day's in its place. Back in front on a new day, today's plan takes its place at once, on any tab;
 * a Home edit after it leaves it as it is. Synthetic data only.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe('a plan from the day before, the app back in front', () => {
  it('puts today’s plan in its place at once, and a Home edit then leaves it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const evening = at(8, 20);
    vi.setSystemTime(new Date(evening));
    const clock = { now: evening };
    const { store } = createTestStore({ now: () => clock.now, minOverlayMs: 0 });
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(evening), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, evening),
    );
    const session = () => store.getSnapshot().session!;
    const yesterday = session().id;
    expect(session().baseKey.startsWith(`${localDayKey(evening)}|`)).toBe(true);
    // On Plan, where no screen of today's plan looks at the day.
    act(() => {
      window.location.hash = '#/plan';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Plan' });
    expect(session().id).toBe(yesterday);

    // The next morning, the app comes back to the front.
    const morning = at(9, 8);
    clock.now = morning;
    vi.setSystemTime(new Date(morning));
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(session().id).not.toBe(yesterday);
    expect(session().baseKey.startsWith(`${localDayKey(morning)}|`)).toBe(true);

    // Home's equipment edited then: today's plan stays as it is.
    const today = structuredClone(session());
    const home = store.getSnapshot().locations.find((place) => place.id === HOME_LOCATION_ID)!;
    await act(async () => {
      await store.saveLocation({
        ...home,
        equipment: ['adjustable-dumbbells', 'adjustable-bench', 'pull-up-bar', 'resistance-bands'],
      });
    });
    expect(session().id).toBe(today.id);
    expect(session().workout).toEqual(today.workout);
  }, 120_000);
});
