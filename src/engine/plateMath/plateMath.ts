import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { UnitSystem } from '../../core/validation/profile';

/**
 * Plate Math: what to load for a target weight. Bar exercises get plates per
 * side from the bar weight and a standard plate inventory; dumbbell and
 * kettlebell moves are clarified as per hand; stacks and bodyweight need no
 * plates. Pure and unit-aware.
 */

export const PLATE_INVENTORY: Record<UnitSystem, readonly number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export type PlateMathKind = 'bar' | 'each-hand' | 'stack' | 'bodyweight' | 'band';

export interface PlateMathResult {
  kind: PlateMathKind;
  units: UnitSystem;
  target: number;
  barWeight: number | null;
  /** Plates on one side, heaviest first. */
  perSide: number[];
  /** Weight that could not be made with the inventory. */
  remainder: number;
  /** One readable line, for example "Bar 45 + per side: 45, 25". */
  line: string;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function plateMath(
  exercise: Pick<CatalogExercise, 'load' | 'barWeight' | 'name'>,
  target: number,
  units: UnitSystem,
  inventory: readonly number[] = PLATE_INVENTORY[units],
): PlateMathResult {
  const base = { units, target, perSide: [] as number[], remainder: 0 };
  switch (exercise.load) {
    case 'barbell':
    case 'ez-bar':
    case 'trap-bar':
    case 'smith': {
      const barWeight = exercise.barWeight?.[units] ?? (units === 'lb' ? 45 : 20);
      if (target <= barWeight) {
        return {
          ...base,
          kind: 'bar',
          barWeight,
          line:
            target === barWeight
              ? `Empty bar (${barWeight} ${units})`
              : `Below the empty bar (${barWeight} ${units}); use a lighter bar`,
        };
      }
      let sideWeight = round((target - barWeight) / 2);
      const perSide: number[] = [];
      for (const plate of [...inventory].sort((a, b) => b - a)) {
        while (sideWeight + 1e-9 >= plate) {
          perSide.push(plate);
          sideWeight = round(sideWeight - plate);
        }
      }
      const remainder = round(sideWeight * 2);
      return {
        ...base,
        kind: 'bar',
        barWeight,
        perSide,
        remainder,
        line:
          perSide.length === 0
            ? `Bar ${barWeight} ${units}, no full plate fits`
            : `Bar ${barWeight} + per side: ${perSide.join(', ')}${remainder > 0 ? ` (${remainder} ${units} short)` : ''}`,
      };
    }
    case 'dumbbell-each':
    case 'kettlebell':
      return {
        ...base,
        kind: 'each-hand',
        barWeight: null,
        line: `${target} ${units} in each hand (2 × ${target})`,
      };
    case 'stack':
      return {
        ...base,
        kind: 'stack',
        barWeight: null,
        line: `Pin the stack at ${target} ${units}`,
      };
    case 'band':
      return { ...base, kind: 'band', barWeight: null, line: 'Band tension; note the band colour' };
    case 'bodyweight':
      return {
        ...base,
        kind: 'bodyweight',
        barWeight: null,
        line: target > 0 ? `Bodyweight plus ${target} ${units}` : 'Bodyweight',
      };
  }
}

/** The weight step the logger nudges by for this exercise. */
export function weightStep(exercise: Pick<CatalogExercise, 'load'>, units: UnitSystem): number {
  switch (exercise.load) {
    case 'dumbbell-each':
    case 'kettlebell':
      return units === 'lb' ? 5 : 2;
    case 'stack':
      return units === 'lb' ? 10 : 5;
    case 'band':
    case 'bodyweight':
      return units === 'lb' ? 5 : 2.5;
    default:
      return units === 'lb' ? 5 : 2.5;
  }
}
