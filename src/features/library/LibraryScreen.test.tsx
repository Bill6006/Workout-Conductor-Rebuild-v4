import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { LibraryScreen } from './LibraryScreen';

async function seeded() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

describe('LibraryScreen', () => {
  it('lists the whole catalog, then filters by text and muscle group', async () => {
    const { store } = await seeded();
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <LibraryScreen />
      </Providers>,
    );
    expect(screen.getByTestId('library-count')).toHaveTextContent(
      `${EXERCISES.length} of ${EXERCISES.length} exercises`,
    );

    await user.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'curl');
    const rows = screen.getAllByTestId('library-row');
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.every((row) => /curl/i.test(row.textContent ?? ''))).toBe(true);

    await user.clear(screen.getByRole('searchbox', { name: 'Search exercises' }));
    await user.click(screen.getByRole('button', { name: 'Legs' }));
    expect(
      screen
        .getAllByTestId('library-row')
        .every((row) => /Quads|Glutes|Hamstrings|Calves/.test(row.textContent ?? '')),
    ).toBe(true);
  });

  it('opens an exercise with its demonstration, instructions, and ranked alternatives', async () => {
    const { store } = await seeded();
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <LibraryScreen />
      </Providers>,
    );
    await user.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'barbell bench');
    await user.click(screen.getAllByTestId('library-row')[0]!);

    const dialog = await screen.findByRole('dialog', { name: 'Barbell Bench Press' });
    expect(within(dialog).getByTestId('exercise-demo')).toHaveAttribute('data-playing', 'true');
    expect(within(dialog).getByRole('heading', { name: 'Setup' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Common mistakes' })).toBeInTheDocument();
    expect(within(dialog).getByText('No drop sets')).toBeInTheDocument();
    expect(within(dialog).getByText('Dumbbell Bench Press')).toBeInTheDocument();
  });

  it('marks an exercise preferred with a verified save', async () => {
    const { store } = await seeded();
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <LibraryScreen />
      </Providers>,
    );
    await user.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'hammer');
    await user.click(screen.getAllByTestId('library-row')[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Hammer Curl' });
    await user.click(within(dialog).getByRole('button', { name: 'Prefer' }));
    await waitFor(() =>
      expect(store.getSnapshot().profile?.exercisePreferences.preferred).toEqual(['Hammer Curl']),
    );
    expect(within(dialog).getByRole('button', { name: 'Preferred ✓' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
