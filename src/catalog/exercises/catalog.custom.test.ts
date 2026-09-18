import { afterEach, describe, expect, it } from 'vitest';
import {
  CustomExerciseSchema,
  customToCatalogExercise,
} from '../../core/validation/customExercise';
import {
  exercisesByMuscle,
  exercisesByPattern,
  findExerciseByName,
  registerCustomExercises,
  requireExercise,
  resolveExerciseIds,
} from './catalog';

const NOW = '2026-09-18T12:00:00.000Z';

/** The owner's squat machine, added through the creator: a stack, squat pattern. */
function freemotionSquat() {
  const hack = requireExercise('hack-squat');
  return customToCatalogExercise(
    CustomExerciseSchema.parse({
      id: 'custom-freemotion-squat',
      custom: true,
      name: 'Freemotion Squat',
      aliases: ['Freemotion Plate Squat'],
      primaryMuscles: [...hack.primaryMuscles],
      movementPattern: hack.movementPattern,
      equipment: [['hack-squat']],
      load: 'stack',
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
}

afterEach(() => registerCustomExercises([]));

describe('custom exercises in the catalog lookups', () => {
  it('take part in the pattern and muscle lookups the generator picks from', () => {
    const machine = freemotionSquat();
    expect(exercisesByPattern(machine.movementPattern).map((e) => e.id)).not.toContain(machine.id);
    registerCustomExercises([machine]);
    expect(exercisesByPattern(machine.movementPattern).map((e) => e.id)).toContain(machine.id);
    const muscle = machine.primaryMuscles[0];
    if (!muscle) throw new Error('expected a primary muscle');
    expect(exercisesByMuscle(muscle).map((e) => e.id)).toContain(machine.id);
  });

  it('resolve by name and alias, so a Preferred custom exercise counts as preferred', () => {
    registerCustomExercises([freemotionSquat()]);
    expect(findExerciseByName('freemotion squat')?.id).toBe('custom-freemotion-squat');
    expect(findExerciseByName('Freemotion Plate Squat')?.id).toBe('custom-freemotion-squat');
    expect(resolveExerciseIds(['Freemotion Squat', 'Back Squat'])).toEqual(
      new Set(['custom-freemotion-squat', 'back-squat']),
    );
    registerCustomExercises([]);
    expect(findExerciseByName('Freemotion Squat')).toBeUndefined();
  });
});
