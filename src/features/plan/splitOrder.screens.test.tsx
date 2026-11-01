import { act, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import * as weekly from '../../engine/planning/weeklyPlan';
import { at } from '../../test/clockDays';
import { Providers, createTestStore } from '../../test/testStore';

const MONDAY = at(7, 9);

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse(MONDAY) + 60_000,
  useMomentReached: () => false,
}));
vi.mock('../../engine/planning/weeklyPlan', async (original) => {
  const actual = await original<typeof import('../../engine/planning/weeklyPlan')>();
  return { ...actual, planWeek: vi.fn(actual.planWeek) };
});

/**
 * Maintenance 38: Plan shows the week in the split's order kept with today's plan, and says what the
 * order spares; the coach reads the same week. Monday, Tuesday and Thursday: lower, upper, full
 * body, where the rotation ran upper, lower, full body. Synthetic data only.
 */
describe('the split’s order on Plan', () => {
  it('lists the week in the order, says why, and gives the coach the same week', async () => {
    const { store } = createTestStore({ now: () => MONDAY, minOverlayMs: 0 });
    await store.hydrate();
    const profile = createDefaultProfile(MONDAY);
    await store.completeOnboarding(
      {
        ...profile,
        bodyweight: 185,
        schedule: { ...profile.schedule, availableDays: ['mon', 'tue', 'thu'], weeklyFrequency: 3 },
      },
      createDefaultLocations({ gymAccess: true }, MONDAY),
    );
    const order = store.getSnapshot().session!.constraints.splitOrder;
    expect(order).toBeDefined();
    const planWeek = vi.mocked(weekly.planWeek);
    const readsTheOrder = () => {
      expect(planWeek.mock.calls.length).toBeGreaterThan(0);
      for (const call of planWeek.mock.calls) expect(call[6]?.order).toEqual(order);
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
    const week = await screen.findByTestId('week-plan');
    expect(
      within(week)
        .getAllByRole('listitem')
        .map((row) => row.textContent ?? ''),
    ).toEqual([
      expect.stringContaining('Lower body'),
      expect.stringContaining('Upper body'),
      expect.stringContaining('Full body'),
    ]);
    expect(screen.getByTestId('split-order')).toHaveTextContent(
      'In this order the quads, hamstrings and glutes are not worked hard again inside their recovery windows.',
    );
    // Plan and the coach both read the week in the order kept with today's plan.
    readsTheOrder();
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
    readsTheOrder();
  });
});
