import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * The owner, 2026-11-02: Settings' "Learned from your log" row named the habit, the curves, the
 * reserve, pain and declined offers, and left out Your pace and Your recovery, both on the page it
 * opens. The row names each section the page shows, in its order. Synthetic data only.
 */

describe('Settings’ learned row', () => {
  it('names every section on the page it opens', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    act(() => {
      window.location.hash = '#/settings';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    const row = await screen.findByTestId('row-learned');
    expect(within(row).getByText('Learned from your log')).toBeInTheDocument();
    expect(
      within(row).getByText(
        'Pace, recovery, habit, lift curves, reserve, pain and declined offers',
      ),
    ).toBeInTheDocument();
    await userEvent.click(row);
    const page = await screen.findByTestId('learned-values');
    expect(
      within(page)
        .getAllByRole('listitem')
        .filter((item) => item.dataset.testid?.startsWith('learned-'))
        .map((item) => item.dataset.testid),
    ).toEqual([
      'learned-pace',
      'learned-recovery',
      'learned-habit',
      'learned-curves',
      'learned-reserve',
      'learned-pain',
      'learned-declines',
    ]);
    expect(within(page).getByText('Your pace')).toBeInTheDocument();
    expect(within(page).getByText('Your recovery')).toBeInTheDocument();
  });
});
