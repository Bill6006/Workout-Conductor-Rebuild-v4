import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCustomExercises } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { PlaceWeights } from './PlaceWeights';

/**
 * Maintenance 30, the fifth re-check of round L: the custom sheet saves its one equipment group in
 * the order the chips were tapped, and a lifter's own move is done the one way it was saved. In
 * Settings' "Weights at your places" a machine of the lifter's own is listed among a place's machines
 * with its chips in any order, as its workout tab takes the Pin stack / Plates switch. It was listed
 * only with its machine chip tapped first. Synthetic data only.
 */
afterEach(() => registerCustomExercises([]));

/** The gym's machines in Settings, with the lifter's own belt squat saved from these chips. */
async function machinesListed(chips: string[]): Promise<(string | null)[]> {
  const { store } = createTestStore();
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  await store.setCurrentLocation('gym');
  // As the custom sheet saves it: one group, the chips in the order tapped, the load decided
  // from the equipment (a machine stack either way).
  await store.addCustomExercise({
    name: 'Belt Squat',
    primaryMuscles: ['quads'],
    movementPattern: 'squat',
    equipment: [chips],
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
  const select = screen.getByTestId('place-weights-machine') as HTMLSelectElement;
  return [...select.options].map((option) => option.textContent);
}

describe('a lifter’s own machine in Settings, chips tapped in either order', () => {
  it('is listed among the gym’s machines with the machine chip tapped first (baseline)', async () => {
    expect(await machinesListed(['hack-squat', 'barbell'])).toContain('Belt Squat');
  });

  it('is listed among the gym’s machines with the barbell chip tapped first too', async () => {
    // The same exercise (load "stack", the switch on its workout tab since the fourth pass), so
    // the same place in Settings.
    expect(await machinesListed(['barbell', 'hack-squat'])).toContain('Belt Squat');
  });
});
