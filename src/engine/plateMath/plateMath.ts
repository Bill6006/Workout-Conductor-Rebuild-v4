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
  /** How far a weight these plates cannot make sits above the nearest one they can. */
  remainder: number;
  /** One readable line, for example "Bar 45 + 45, 25 each side · 185 lb". */
  line: string;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Plate arithmetic runs in hundredths, so sizes like 2.5 and 1.25 add without drift. */
const SCALE = 100;

function toHundredths(value: number): number {
  return Math.round(value * SCALE);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** The plate sizes in whole multiples of their largest common measure, heaviest first. */
function measured(plates: readonly number[]): { sizes: number[]; unit: number } | null {
  const hundredths = [...new Set(plates.map(toHundredths))].filter((size) => size > 0);
  if (hundredths.length === 0) return null;
  const unit = hundredths.reduce(gcd);
  return { sizes: hundredths.map((size) => size / unit).sort((a, b) => b - a), unit };
}

/**
 * The fewest plates that make one side exactly, heaviest first, taking as many of each size as
 * it needs; null when these sizes cannot make it. For the standard plates that is the greedy
 * answer; for a rack missing some it finds what greedy misses (50 a side from 45s and 25s is
 * two 25s).
 */
export function platesFor(side: number, plates: readonly number[]): number[] | null {
  const goal = toHundredths(side);
  if (goal < 0) return null;
  if (goal === 0) return [];
  const scale = measured(plates);
  if (!scale || goal % scale.unit !== 0) return null;
  const count = goal / scale.unit;
  const fewest = new Array<number>(count + 1).fill(Number.POSITIVE_INFINITY);
  const last = new Array<number>(count + 1).fill(0);
  fewest[0] = 0;
  for (let value = 1; value <= count; value += 1) {
    for (const size of scale.sizes) {
      const before = size <= value ? (fewest[value - size] as number) : Number.POSITIVE_INFINITY;
      if (before + 1 < (fewest[value] as number)) {
        fewest[value] = before + 1;
        last[value] = size;
      }
    }
  }
  if (!Number.isFinite(fewest[count])) return null;
  const perSide: number[] = [];
  for (let value = count; value > 0; value -= last[value] as number) {
    perSide.push(((last[value] as number) * scale.unit) / SCALE);
  }
  return perSide.sort((a, b) => b - a);
}

/** Every weight one side can take from these plates, up to `maxSide`, ascending from nothing. */
export function sideWeights(plates: readonly number[], maxSide: number): number[] {
  const scale = measured(plates);
  if (!scale) return [0];
  const count = Math.floor(toHundredths(maxSide) / scale.unit);
  const reachable = new Array<boolean>(count + 1).fill(false);
  reachable[0] = true;
  for (let value = 1; value <= count; value += 1) {
    reachable[value] = scale.sizes.some((size) => size <= value && reachable[value - size]);
  }
  const weights: number[] = [];
  for (let value = 0; value <= count; value += 1) {
    if (reachable[value]) weights.push((value * scale.unit) / SCALE);
  }
  return weights;
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
              ? `Empty bar · ${barWeight} ${units}`
              : `Below the empty bar (${barWeight} ${units}); use a lighter bar`,
        };
      }
      const side = round((target - barWeight) / 2);
      const perSide = platesFor(side, inventory);
      if (perSide !== null) {
        return {
          ...base,
          kind: 'bar',
          barWeight,
          perSide,
          line: `Bar ${barWeight} + ${perSide.join(', ')} each side · ${target} ${units}`,
        };
      }
      // A weight these plates cannot make: the ones they make either side of it, never a shortfall.
      const heaviest = Math.max(...inventory, 0);
      const totals = sideWeights(inventory, side + heaviest).map((weight) =>
        round(barWeight + weight * 2),
      );
      const below = [...totals].reverse().find((total) => total < target) ?? barWeight;
      const above = totals.find((total) => total > target);
      return {
        ...base,
        kind: 'bar',
        barWeight,
        remainder: round(target - below),
        line:
          above === undefined
            ? `The plates here make ${below}, not ${target} ${units}`
            : `The plates here make ${below} or ${above}, not ${target} ${units}`,
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
