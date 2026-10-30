import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { REST_TODAY } from '../../engine/readiness/checkIn';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 33, the illness gate (docs/research/readiness-and-soreness.md): a fever or aches all
 * over make the day a rest day. Today says so, offers the check-in again, and has nothing to start.
 * Synthetic data only.
 */
describe('a fever or aches all over, on Today', () => {
  it('says to rest today and hides Start', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const done = await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 3,
        sleep: 3,
        soreness: 2,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
        illness: 'body',
      },
    });
    expect(done?.ok).toBe(true);
    act(() => {
      window.location.hash = '#/today';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    expect(await screen.findByTestId('day-note-text')).toHaveTextContent(REST_TODAY);
    expect(screen.queryByTestId('start-workout')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Update check-in' }).length).toBeGreaterThan(0);
  });
});
