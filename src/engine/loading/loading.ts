import { z } from 'zod';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { UnitSystem } from '../../core/validation/profile';
import { PLATE_INVENTORY, weightStep } from '../plateMath/plateMath';

/**
 * What a place can actually load. A machine has a stack with fixed steps, a
 * home has one set of dumbbells, a bar has the plates on the rack. Targets,
 * ramps, drop sets and the dial's nudges all land on weights that exist here,
 * and a target above the heaviest weight is capped so the engine can push the
 * reps instead. A missing plate for one session narrows the step for the day
 * without touching what the place normally offers.
 */

export const LoadingRangeSchema = z.object({
  from: z.number().min(0),
  to: z.number().min(0),
  step: z.number().positive(),
});
export type LoadingRange = z.infer<typeof LoadingRangeSchema>;

export const LoadingSpecSchema = z.discriminatedUnion('kind', [
  /** A machine's stack, as totals. */
  z.object({ kind: z.literal('stack'), ranges: z.array(LoadingRangeSchema).min(1).max(4) }),
  /** The dumbbells at a place, as the weight of one. */
  z.object({ kind: z.literal('dumbbells'), ranges: z.array(LoadingRangeSchema).min(1).max(4) }),
  /** The plates on the rack, one side's sizes. */
  z.object({ kind: z.literal('plates'), perSide: z.array(z.number().positive()).min(1).max(12) }),
]);
export type LoadingSpec = z.infer<typeof LoadingSpecSchema>;

/** The loading map a place keeps: exercise ids for stacks, and two shared keys. */
export const DUMBBELLS_KEY = 'dumbbells';
export const PLATES_KEY = 'plates';
export type LoadingMap = Record<string, LoadingSpec>;

/** Session-only exceptions: plates that are not around today. */
export interface SessionLoading {
  missingPlates: number[];
}

export interface Loading {
  /** Every weight this exercise can be loaded to here, ascending; null when any step works. */
  available: number[] | null;
  /** What the dial moves by, and what targets round to when `available` is null. */
  step: number;
  /** The heaviest weight available here; null when unlimited. */
  cap: number | null;
  /** One side's plates, for the plate line; null for anything that is not a bar. */
  perSide: number[] | null;
}

const EPSILON = 1e-6;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Every value the ranges cover, ascending and unique. A range is capped at 400 entries. */
export function expandRanges(ranges: readonly LoadingRange[]): number[] {
  const values = new Set<number>();
  for (const range of ranges) {
    if (range.step <= 0) continue;
    const from = Math.min(range.from, range.to);
    const to = Math.max(range.from, range.to);
    let count = 0;
    for (
      let value = from;
      value <= to + EPSILON && count < 400;
      value = round(value + range.step)
    ) {
      values.add(round(value));
      count += 1;
    }
  }
  return [...values].sort((a, b) => a - b);
}

/** The largest available weight at or under `weight`, else the smallest there is. */
export function snapDown(weight: number, available: readonly number[]): number {
  if (available.length === 0) return weight;
  let best: number | null = null;
  for (const candidate of available) {
    if (candidate <= weight + EPSILON) best = candidate;
    else break;
  }
  return best ?? (available[0] as number);
}

/** The next available weight in a direction; past either end it stays put. */
export function nudge(
  weight: number,
  direction: 1 | -1,
  available: readonly number[] | null,
  step: number,
): number {
  if (available === null || available.length === 0) {
    return Math.max(0, round(weight + direction * step));
  }
  if (direction > 0) {
    const next = available.find((candidate) => candidate > weight + EPSILON);
    return next ?? (available[available.length - 1] as number);
  }
  let previous: number | null = null;
  for (const candidate of available) {
    if (candidate < weight - EPSILON) previous = candidate;
    else break;
  }
  return previous ?? (available[0] as number);
}

function isBarLoad(load: CatalogExercise['load']): boolean {
  return load === 'barbell' || load === 'ez-bar' || load === 'trap-bar' || load === 'smith';
}

function isHandLoad(load: CatalogExercise['load']): boolean {
  return load === 'dumbbell-each' || load === 'kettlebell';
}

/** The spec that applies to this exercise here: its own stack, or the place's dumbbells or plates. */
export function specFor(
  loading: LoadingMap | undefined,
  exercise: Pick<CatalogExercise, 'id' | 'load'>,
): LoadingSpec | null {
  if (!loading) return null;
  const own = loading[exercise.id];
  if (own) return own;
  if (isHandLoad(exercise.load)) return loading[DUMBBELLS_KEY] ?? null;
  if (isBarLoad(exercise.load)) return loading[PLATES_KEY] ?? null;
  return null;
}

/** The loading key a spec for this exercise saves under. */
export function loadingKeyFor(exercise: Pick<CatalogExercise, 'id' | 'load'>): string {
  if (isHandLoad(exercise.load)) return DUMBBELLS_KEY;
  if (isBarLoad(exercise.load)) return PLATES_KEY;
  return exercise.id;
}

/**
 * What this exercise can be loaded to at this place today. Without a spec a
 * bar takes the standard plates and everything else moves by its usual step.
 */
export function loadingFor(
  loading: LoadingMap | undefined,
  session: SessionLoading | undefined,
  exercise: Pick<CatalogExercise, 'id' | 'load' | 'barWeight'>,
  units: UnitSystem,
): Loading {
  const usual = weightStep(exercise, units);
  const spec = specFor(loading, exercise);
  const missing = new Set(session?.missingPlates ?? []);
  if (isBarLoad(exercise.load)) {
    const rack = spec?.kind === 'plates' ? spec.perSide : PLATE_INVENTORY[units];
    const perSide = [...rack].filter((plate) => !missing.has(plate)).sort((a, b) => b - a);
    const smallest = perSide[perSide.length - 1];
    // Two of the smallest plate is the finest total step the rack allows.
    const step = smallest === undefined ? usual : Math.max(usual, round(smallest * 2));
    return { available: null, step, cap: null, perSide };
  }
  if (spec && spec.kind !== 'plates') {
    const available = expandRanges(spec.ranges);
    if (available.length > 0) {
      return {
        available,
        step: usual,
        cap: available[available.length - 1] as number,
        perSide: null,
      };
    }
  }
  return { available: null, step: usual, cap: null, perSide: null };
}

/**
 * A weight the place can load, never above the one asked for: snapped down onto
 * the list when there is one, else down onto the step's grid, which for a bar
 * starts at the bar itself (a 45 bar with 10 lb steps loads 115, not 120).
 */
export function fitWeight(weight: number, loading: Loading, floor: number | null = null): number {
  if (loading.available !== null) {
    return Math.max(floor ?? 0, snapDown(weight, loading.available));
  }
  const base = floor ?? 0;
  const steps = Math.floor((weight - base + EPSILON) / loading.step);
  const fitted = round(base + Math.max(0, steps) * loading.step);
  return floor === null ? Math.max(loading.step, fitted) : Math.max(floor, fitted);
}

/** A readable line for a spec, for example "10 to 100 by 10, then 120 to 280 by 20". */
export function describeSpec(spec: LoadingSpec, units: UnitSystem): string {
  if (spec.kind === 'plates') {
    return `Plates per side: ${[...spec.perSide].sort((a, b) => b - a).join(', ')}`;
  }
  const parts = spec.ranges.map((range) => `${range.from} to ${range.to} by ${range.step}`);
  const what = spec.kind === 'stack' ? 'Stack' : 'Dumbbells';
  return `${what}: ${parts.join(', then ')} ${units}`;
}
