import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCustomExercises } from '../../catalog/exercises/catalog';
import { createDefaultLocations, createLocation } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { NewCustomExercise } from '../../core/state/appStore';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { PlaceWeights } from './PlaceWeights';

/**
 * Maintenance 30, the sixth re-check of round L: in Settings' "Weights at your places" a lifter's own
 * move is listed at a place only through a chip there that gives the load it was saved with, so a
 * place's sections stay its own equipment's ("Home's dumbbells, bench, pull-up bar and bands show its
 * dumbbells only"). A machine saved with no chips (the equipment list has no pendulum squat) put a
 * Machines section at Home, and a move saved with the bench chip alone, its load decided from the
 * equipment (dumbbells, the sheet's fallback), put a Dumbbells section at a place with no dumbbells.
 * Synthetic data only.
 */
afterEach(() => registerCustomExercises([]));

async function settingsAt(
  placeName: string,
  own: Omit<NewCustomExercise, 'primaryMuscles' | 'movementPattern'>,
) {
  const user = userEvent.setup();
  const { store } = createTestStore();
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  // A place with a bench and a pull-up bar, and no weights at all.
  await store.saveLocation(
    createLocation(
      { id: 'park', name: 'Park', kind: 'custom', equipment: ['flat-bench', 'pull-up-bar'] },
      TEST_NOW,
    ),
  );
  await store.addCustomExercise({ ...own, primaryMuscles: ['quads'], movementPattern: 'squat' });
  const hydrate = vi.spyOn(store, 'hydrate');
  render(
    <Providers store={store}>
      <PlaceWeights />
    </Providers>,
  );
  await act(async () => {
    await hydrate.mock.results[0]?.value;
  });
  await user.click(screen.getByRole('radio', { name: placeName }));
  return screen.getByTestId('place-weights');
}

describe('a lifter’s own move in Settings, at a place without the weights it names', () => {
  it('a plate-loaded belt squat, chips in either order, is among the Gym’s machines (baseline)', async () => {
    const weights = await settingsAt('Gym', {
      name: 'Belt Squat',
      equipment: [['barbell', 'hack-squat']],
    });
    const select = within(weights).getByTestId('place-weights-machine') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toContain('Belt Squat');
  });

  it('a machine saved with no chips puts no Machines section at Home', async () => {
    const weights = await settingsAt('Home', {
      name: 'Pendulum Squat',
      equipment: [],
      load: 'stack',
    });
    expect(within(weights).getByTestId('place-weights-dumbbells')).toHaveTextContent(
      'Dumbbells at Home',
    );
    // Home's dumbbells, bench, pull-up bar and bands show its dumbbells only.
    expect(within(weights).queryByTestId('place-weights-machines')).toBeNull();
  });

  it('a move saved with the bench chip alone puts no Dumbbells section at a place with none', async () => {
    const weights = await settingsAt('Park', {
      name: 'Box Step Squat',
      equipment: [['flat-bench']],
    });
    expect(within(weights).queryByTestId('place-weights-dumbbells')).toBeNull();
    expect(weights).toHaveTextContent('Nothing at Park takes a weight to set.');
  });
});
