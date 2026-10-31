import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import * as weekly from '../../engine/planning/weeklyPlan';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse(TEST_NOW) + 60_000,
  useMomentReached: () => false,
}));
vi.mock('../../engine/planning/weeklyPlan', async (original) => {
  const actual = await original<typeof import('../../engine/planning/weeklyPlan')>();
  return { ...actual, planWeek: vi.fn(actual.planWeek) };
});

/**
 * Maintenance 34, the review: the week ahead, on the Plan tab and for the coach, plans today at the
 * length today's plan has, the lifter's choice standing over the forecast. Synthetic data only.
 */
describe('the week ahead plans today at its own length', () => {
  it('on the Plan tab and on Today', async () => {
    const { store } = createTestStore({ now: () => TEST_NOW, minOverlayMs: 0 });
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    expect((await store.setDurationChoice(15))?.ok).toBe(true);
    const planWeek = vi.mocked(weekly.planWeek);
    const readsToday = () => {
      expect(planWeek.mock.calls.length).toBeGreaterThan(0);
      for (const call of planWeek.mock.calls) expect(call[5]).toBe(15);
    };

    planWeek.mockClear();
    act(() => {
      window.location.hash = '#/plan';
    });
    const plan = render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    await screen.findByTestId('week-plan');
    readsToday();
    plan.unmount();

    planWeek.mockClear();
    act(() => {
      window.location.hash = '#/';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    await waitFor(() => expect(planWeek).toHaveBeenCalled());
    readsToday();
  });
});
