import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCustomExercises } from '../../catalog/exercises/catalog';
import {
  CustomExerciseSchema,
  customToCatalogExercise,
  loadFromEquipment,
} from '../../core/validation/customExercise';
import { comesBothWays, loadingFor } from '../../engine/loading/loading';
import { LoadingEditor } from './LoadingEditor';

/**
 * Maintenance 30, the fourth re-check of round L: the custom-exercise sheet saves one equipment group
 * in the order the chips were tapped, and decides the load from any item in it (`loadFromEquipment`).
 * A plate-loaded belt squat made with "Barbell + plates" and "Hack squat" is a machine either way, so
 * it has the Pin stack / Plates switch either way. It had it only with Hack squat tapped first, and
 * was otherwise stuck on a pin stack it does not have.
 */
const NOW = '2026-09-18T12:00:00.000Z';
afterEach(() => registerCustomExercises([]));

function beltSquat(group: string[]) {
  return customToCatalogExercise(
    CustomExerciseSchema.parse({
      id: 'custom-belt-squat',
      custom: true,
      name: 'Belt Squat',
      aliases: [],
      primaryMuscles: ['quads'],
      movementPattern: 'squat',
      // As the sheet saves it: `equipment: [equipment]`, the chips in the order tapped.
      equipment: [group],
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
}

describe('a lifter’s own move on a machine that comes both ways, chips tapped in either order', () => {
  it('is the same load either way, with the switch when the machine is tapped first', () => {
    expect(loadFromEquipment([['hack-squat', 'barbell']])).toBe('stack');
    expect(loadFromEquipment([['barbell', 'hack-squat']])).toBe('stack');
    expect(comesBothWays(beltSquat(['hack-squat', 'barbell']))).toBe(true);
  });

  it('has the switch with the barbell chip tapped first too', () => {
    const exercise = beltSquat(['barbell', 'hack-squat']);
    expect(exercise.load).toBe('stack');
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
    // The switch, not only a pin stack editor for a plate-loaded machine.
    expect(screen.queryByTestId('machine-load')).toBeInTheDocument();
  });
});
