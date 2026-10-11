import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { useTodayWorkout } from './useTodayWorkout';

const clock = vi.hoisted(() => ({ now: 0 }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => clock.now,
}));

/**
 * Maintenance 28, the owner's item 1, on Today: the screen asks for the day's plan at midnight on
 * the device, not at midnight UTC (8 pm in New York).
 */

function Today() {
  useTodayWorkout();
  return null;
}

describe("today's plan (Maintenance 28, item 1)", () => {
  it('is asked for again at midnight on the device, and not before', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const refresh = vi.spyOn(store, 'refreshSession');
    const at = (day: number, hour: number, minute: number) =>
      Date.parse(new Date(2026, 8, day, hour, minute).toISOString());
    clock.now = at(10, 23, 58);
    const view = render(
      <Providers store={store}>
        <Today />
      </Providers>,
    );
    const asked = refresh.mock.calls.length;
    clock.now = at(10, 23, 59);
    view.rerender(
      <Providers store={store}>
        <Today />
      </Providers>,
    );
    expect(refresh.mock.calls.length).toBe(asked);
    clock.now = at(11, 0, 1);
    view.rerender(
      <Providers store={store}>
        <Today />
      </Providers>,
    );
    expect(refresh.mock.calls.length).toBe(asked + 1);
  });
});
