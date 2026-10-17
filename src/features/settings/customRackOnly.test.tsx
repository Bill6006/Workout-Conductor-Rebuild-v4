import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCustomExercises } from '../../catalog/exercises/catalog';
import { createDefaultLocations, createLocation } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { PlaceWeights } from './PlaceWeights';

/**
 * Maintenance 30, the seventh re-check of round L: in Settings' "Weights at your places" a lifter's own
 * move takes a bar's plates only through a bar chip. The squat rack holds a bar and gives none, so a
 * move saved with the rack chip alone, its load decided from the equipment (a bar), puts no Plates
 * section at a place with a squat rack and no barbell, a section the place does not have. It did, as
 * the catalog never does: its rack lifts need the barbell chip too. Synthetic data only.
 */
afterEach(() => registerCustomExercises([]));

/** Settings at the Garage: a squat rack and dumbbells, and the barbell only when asked. */
async function garage(withBarbell: boolean) {
  const user = userEvent.setup();
  const { store } = createTestStore();
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  await store.saveLocation(
    createLocation(
      {
        id: 'garage',
        name: 'Garage',
        kind: 'custom',
        equipment: ['squat-rack', 'dumbbells', ...(withBarbell ? ['barbell'] : [])],
      },
      TEST_NOW,
    ),
  );
  // As the custom sheet saves it: the one chip, the load decided from the equipment.
  await store.addCustomExercise({
    name: 'Rack Calf Raise',
    primaryMuscles: ['calves'],
    movementPattern: 'calf-raise',
    equipment: [['squat-rack']],
  });
  const hydrate = vi.spyOn(store, 'hydrate');
  render(
    <Providers store={store}>
      <PlaceWeights />
    </Providers>,
  );
  await act(async () => {
    await hydrate.mock.results[0]?.value;
  });
  await user.click(screen.getByRole('radio', { name: 'Garage' }));
  return screen.getByTestId('place-weights');
}

describe('a lifter’s own move saved with the squat rack chip alone', () => {
  it('leaves the Garage its dumbbells and its plates when it has a barbell (baseline)', async () => {
    const weights = await garage(true);
    expect(within(weights).getByTestId('place-weights-dumbbells')).toBeInTheDocument();
    expect(within(weights).getByTestId('place-weights-plates')).toBeInTheDocument();
  });

  it('puts no Plates section at a Garage with a squat rack and no barbell', async () => {
    const weights = await garage(false);
    expect(within(weights).getByTestId('place-weights-dumbbells')).toBeInTheDocument();
    expect(within(weights).queryByTestId('place-weights-plates')).toBeNull();
  });
});
