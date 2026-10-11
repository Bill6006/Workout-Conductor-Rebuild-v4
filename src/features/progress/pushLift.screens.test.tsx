import { act, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 27, item 44, on screen: the plan badges the lift to push and leads with it, and
 * Progress shows its card.
 */

async function pushing(): Promise<AppStore> {
  const { store } = createTestStore();
  await store.hydrate();
  await store.completeOnboarding(
    {
      ...createDefaultProfile(TEST_NOW),
      pushLift: {
        exerciseId: 'barbell-bench-press',
        target: 225,
        units: 'lb',
        since: '2026-08-20T12:00:00.000Z',
      },
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return store;
}

async function renderAt(store: AppStore, hash: string) {
  act(() => {
    window.location.hash = hash;
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
}

describe('a lift to push on screen', () => {
  it("leads Today's plan with its badge", async () => {
    const store = await pushing();
    await renderAt(store, '#/today');
    const rows = await waitFor(() => {
      const found = screen.getAllByTestId('workout-entry');
      if (found.length === 0) throw new Error('no plan yet');
      return found;
    });
    expect(rows[0]?.getAttribute('data-exercise-id')).toBe('barbell-bench-press');
    expect(within(rows[0]!).getByText('Lift to push')).toBeInTheDocument();
  });

  it('has its card on Progress', async () => {
    const store = await pushing();
    await renderAt(store, '#/progress');
    const pace = await screen.findByTestId('push-pace');
    expect(pace).toHaveTextContent('No reading yet');
    expect(screen.getByText('Barbell Bench Press to 225 lb')).toBeInTheDocument();
  });
});
