import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import * as weekly from '../../engine/planning/weeklyPlan';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../engine/planning/weeklyPlan', async (original) => {
  const actual = await original<typeof import('../../engine/planning/weeklyPlan')>();
  return { ...actual, planWeek: vi.fn(actual.planWeek) };
});

/**
 * Maintenance 28, the review of item 4: the week ahead, on the Plan tab and for the coach, is
 * planned with what the lifter reset, as today's plan is.
 */
describe('the week ahead reads what was reset', () => {
  it('on the Plan tab and on Today', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await store.resetLearned('pace');
    const planWeek = vi.mocked(weekly.planWeek);
    const readsTheReset = () => {
      expect(planWeek.mock.calls.length).toBeGreaterThan(0);
      for (const call of planWeek.mock.calls) expect(call[4]?.pace).toBe(TEST_NOW);
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
    readsTheReset();
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
    readsTheReset();
  });
});
