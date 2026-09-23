import { getExercise } from '../../catalog/exercises/catalog';
import { isHold, type CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { muscleGroupOf } from '../../catalog/muscles/muscles';
import type { UnitSystem } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { enteredMaxFor, type StrengthMaxes } from './maxes';
import { loadClass, startRatio } from './startingLoad';

/**
 * A starting estimate for a lift never done, from the lifts that have been:
 * each known lift's estimated max, divided by its reference ratio, says how
 * strong the lifter is against the reference table; the new lift's ratio
 * turns that back into a max. Lifts on the same muscles weigh most, recent
 * ones more than old ones. Bodyweight is not needed: the ratios cancel it.
 */

const DAY_MS = 86_400_000;
const MAX_AGE_DAYS = 180;

export interface CrossEstimate {
  e1rm: number;
  confidence: 'low' | 'medium';
  evidence: string;
  /** The lift that weighed most. */
  fromExerciseId: string;
}

interface KnownLift {
  exercise: CatalogExercise;
  e1rm: number;
  daysAgo: number;
}

function epley(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** The best recent estimated max of every exercise with a logged, weighted working set. */
function knownLifts(history: readonly WorkoutRecord[], now: string): KnownLift[] {
  const best = new Map<string, KnownLift>();
  for (const record of history) {
    const when = record.completedAt ?? record.startedAt;
    const daysAgo = (Date.parse(now) - Date.parse(when)) / DAY_MS;
    if (!Number.isFinite(daysAgo) || daysAgo > MAX_AGE_DAYS || daysAgo < 0) continue;
    for (const entry of record.entries) {
      const exercise = getExercise(entry.exerciseId);
      // A hold's seconds are not reps: a long carry says nothing about a max.
      if (!exercise || isHold(exercise)) continue;
      for (const set of entry.sets) {
        if (set.kind !== 'working' || !set.completed || set.weight === null || set.reps <= 0)
          continue;
        const e1rm = epley(set.weight, set.reps);
        const current = best.get(exercise.id);
        // The newest session speaks for the lift; within it, the strongest set.
        if (
          !current ||
          daysAgo < current.daysAgo - 0.5 ||
          (Math.abs(daysAgo - current.daysAgo) <= 0.5 && e1rm > current.e1rm)
        ) {
          best.set(exercise.id, { exercise, e1rm, daysAgo });
        }
      }
    }
  }
  return [...best.values()];
}

function proximity(target: CatalogExercise, known: CatalogExercise): number {
  if (known.primaryMuscles.some((muscle) => target.primaryMuscles.includes(muscle))) return 3;
  const groups = new Set(target.primaryMuscles.map(muscleGroupOf));
  if (known.primaryMuscles.some((muscle) => groups.has(muscleGroupOf(muscle)))) return 2;
  return 1;
}

function recency(daysAgo: number): number {
  if (daysAgo <= 30) return 1;
  if (daysAgo <= 90) return 0.7;
  return 0.4;
}

export function estimateFromOtherLifts(
  exercise: CatalogExercise,
  history: readonly WorkoutRecord[],
  now: string,
  units: UnitSystem,
  /** Maxes the lifter entered by hand count as lifts done today. */
  maxes: StrengthMaxes | null = null,
): CrossEstimate | null {
  const ratio = startRatio(exercise);
  if (ratio === null) return null;
  const known = new Map(knownLifts(history, now).map((lift) => [lift.exercise.id, lift]));
  for (const id of Object.keys(maxes?.maxes ?? {})) {
    const entered = maxes ? enteredMaxFor(maxes, id, units) : null;
    const source = getExercise(id);
    if (entered === null || entered <= 0 || !source) continue;
    known.set(id, { exercise: source, e1rm: entered, daysAgo: 0 });
  }
  const contributions: { lift: KnownLift; scale: number; weight: number; near: number }[] = [];
  for (const lift of known.values()) {
    if (lift.exercise.id === exercise.id) continue;
    const knownRatio = startRatio(lift.exercise);
    if (knownRatio === null || knownRatio <= 0) continue;
    const near = proximity(exercise, lift.exercise);
    contributions.push({
      lift,
      scale: lift.e1rm / knownRatio,
      weight: near * recency(lift.daysAgo),
      near,
    });
  }
  if (contributions.length === 0) return null;
  const total = contributions.reduce((sum, item) => sum + item.weight, 0);
  const scale = contributions.reduce((sum, item) => sum + item.scale * item.weight, 0) / total;
  const e1rm = round(scale * ratio, 1);
  if (!(e1rm > 0)) return null;
  const top = [...contributions].sort((a, b) => b.weight - a.weight)[0];
  if (!top) return null;
  const confidence: CrossEstimate['confidence'] =
    top.near >= 2 && contributions.length >= 2 ? 'medium' : 'low';
  const perHand = loadClass(exercise.load) === 'each' ? ' per hand' : '';
  const others = contributions.length - 1;
  return {
    e1rm,
    confidence,
    fromExerciseId: top.lift.exercise.id,
    evidence: `From your ${top.lift.exercise.name} (about ${Math.round(top.lift.e1rm)} ${units} max)${
      others > 0 ? ` and ${others} other lift${others === 1 ? '' : 's'}` : ''
    }: about ${Math.round(e1rm)} ${units} max${perHand} here; the first target sits under it. Log a set and the target follows.`,
  };
}
