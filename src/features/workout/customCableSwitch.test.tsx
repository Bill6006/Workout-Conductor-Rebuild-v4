import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCustomExercises, requireExercise } from '../../catalog/exercises/catalog';
import {
  CustomExerciseSchema,
  customToCatalogExercise,
} from '../../core/validation/customExercise';
import { comesBothWays, loadingFor } from '../../engine/loading/loading';
import { LoadingEditor } from './LoadingEditor';

/**
 * Maintenance 30, the third re-check of round L: a lifter's own move takes the Pin stack / Plates
 * switch only on a machine that comes both ways (the review of the catalog's machines, item 30). On
 * the cable station or the pec deck, which come with a stack only, it has none, as the catalog's own
 * cable and pec deck moves have none.
 */
const NOW = '2026-09-18T12:00:00.000Z';
afterEach(() => registerCustomExercises([]));

function own(id: string, name: string, equipment: string[][]) {
  return customToCatalogExercise(
    CustomExerciseSchema.parse({
      id,
      custom: true,
      name,
      aliases: [],
      primaryMuscles: ['glutes'],
      movementPattern: 'hip-extension',
      equipment,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
}

function editor(exercise: ReturnType<typeof own>) {
  registerCustomExercises([exercise]);
  render(
    <LoadingEditor
      exercise={exercise}
      units="lb"
      loading={loadingFor({}, { missingPlates: [] }, exercise, 'lb')}
      spec={null}
      placeName="Gym"
      missingPlates={[]}
      onSave={vi.fn(() => Promise.resolve())}
      onSetMissingPlates={vi.fn(() => Promise.resolve())}
    />,
  );
}

describe('a lifter’s own machine move and the Pin stack / Plates switch', () => {
  it('as the catalog’s: none on a cable station or a pec deck', () => {
    expect(comesBothWays(requireExercise('cable-fly'))).toBe(false);
    expect(comesBothWays(requireExercise('pec-deck'))).toBe(false);
  });

  it('has none on the cable station', () => {
    const kickback = own('custom-cable-kickback', 'Cable Kickback', [['cable-station']]);
    // The load decided from the equipment, as the sheet offers by default.
    expect(kickback.load).toBe('stack');
    editor(kickback);
    expect(screen.queryByTestId('machine-load')).toBeNull();
  });

  it('has one on a machine that comes both ways', () => {
    editor(own('custom-plate-hip-thrust', 'Plate Hip Thrust', [['leg-press']]));
    expect(screen.getByTestId('machine-load')).toBeInTheDocument();
  });
});
