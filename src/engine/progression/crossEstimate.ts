import { getExercise } from '../../catalog/exercises/catalog';
import { isHold, type CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { muscleGroupOf } from '../../catalog/muscles/muscles';
import type { UnitSystem } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { EFFORT_REPS_CEILING } from './effortCeiling';
import { enteredBy, enteredMaxFor, maxFromSet, type StrengthMaxes } from './maxes';
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
  /** Days since the lift began in its newest session: its first set logged, else the workout's end. */
  began: number;
  /** Days since its newest session ended, the one `began` is of. */
  newest: number;
}

function epley(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * The recent estimated max of every exercise with a logged, weighted working set: its newest
 * session's strongest set, or, as a ceiling (`best`), its strongest set of them all, so a light day
 * does not lower it (Maintenance 26, the eighth pass of item 40).
 */
function knownLifts(history: readonly WorkoutRecord[], now: string, best: boolean): KnownLift[] {
  const known = new Map<string, KnownLift>();
  for (const record of history) {
    const when = record.completedAt ?? record.startedAt;
    const daysAgo = (Date.parse(now) - Date.parse(when)) / DAY_MS;
    if (!Number.isFinite(daysAgo) || daysAgo > MAX_AGE_DAYS || daysAgo < 0) continue;
    // When each lift began that day, its first set logged of any kind, else the workout's end: a max
    // entered after it is newer, as `withEnteredMax` reads one (the ninth pass of item 40: a max
    // entered mid-workout counted for the lift's own target, not for others' first targets).
    const firstSet = new Map<string, number>();
    for (const entry of record.entries) {
      for (const set of entry.sets) {
        const at = Date.parse(set.loggedAt ?? '');
        const first = firstSet.get(entry.exerciseId);
        if (Number.isFinite(at) && (first === undefined || at < first)) {
          firstSet.set(entry.exerciseId, at);
        }
      }
    }
    for (const entry of record.entries) {
      const exercise = getExercise(entry.exerciseId);
      // A hold's seconds are not reps: a long carry says nothing about a max.
      if (!exercise || isHold(exercise)) continue;
      const first = firstSet.get(entry.exerciseId);
      const began = first === undefined ? daysAgo : (Date.parse(now) - first) / DAY_MS;
      for (const set of entry.sets) {
        // A load of nothing says nothing of a max, as the check reads none (the tenth pass: a set
        // logged at 0 halved the ceiling).
        if (
          set.kind !== 'working' ||
          !set.completed ||
          set.weight === null ||
          set.weight <= 0 ||
          set.reps <= 0
        ) {
          continue;
        }
        // Every rep up to thirty, as the slip check reads a set: one long set must not hold a
        // ceiling up for months (the ninth pass of item 40), nor a first target (the tenth). A
        // single is as lifted for a first target, as before.
        const e1rm = best
          ? maxFromSet(set.weight, set.reps)
          : epley(set.weight, Math.min(set.reps, EFFORT_REPS_CEILING));
        const current = known.get(exercise.id);
        // When the newest workout of the lift began, whichever set speaks for it: an older one's
        // set times never move it (the tenth pass: one logged late on another phone did).
        const fresh = !current || daysAgo < current.newest;
        const newest = fresh ? daysAgo : current.newest;
        const latest = fresh ? began : current.began;
        // The newest session speaks for the lift; within it, the strongest set. As a ceiling, the
        // strongest set of all; its age is the newest session's, as recency weighs it.
        if (best) {
          if (!current || e1rm > current.e1rm) {
            known.set(exercise.id, {
              exercise,
              e1rm,
              daysAgo: current ? Math.min(current.daysAgo, daysAgo) : daysAgo,
              began: latest,
              newest,
            });
          } else if (fresh) {
            known.set(exercise.id, { ...current, daysAgo, began: latest, newest });
          }
        } else if (
          !current ||
          daysAgo < current.daysAgo - 0.5 ||
          (Math.abs(daysAgo - current.daysAgo) <= 0.5 && e1rm > current.e1rm)
        ) {
          known.set(exercise.id, { exercise, e1rm, daysAgo, began: latest, newest });
        } else if (fresh) {
          known.set(exercise.id, { ...current, began: latest, newest });
        }
      }
    }
  }
  return [...known.values()];
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
  /**
   * Maxes the lifter entered by hand count as lifts done when entered, within the same 180 days:
   * for a first target, only where entered after that lift last began, its logs being the better
   * evidence (as `withEnteredMax` reads a max; the eighth pass of item 40: a max entered months
   * before overrode them); as a ceiling, whichever of the two is higher.
   */
  maxes: StrengthMaxes | null = null,
  /** A ceiling for questions (the slip check): each lift at its best, erring heavy. */
  ceiling = false,
): CrossEstimate | null {
  const ratio = startRatio(exercise);
  if (ratio === null) return null;
  const known = new Map(knownLifts(history, now, ceiling).map((lift) => [lift.exercise.id, lift]));
  for (const [id, entry] of Object.entries(maxes?.maxes ?? {})) {
    const entered = maxes ? enteredMaxFor(maxes, id, units) : null;
    const source = getExercise(id);
    if (entered === null || entered <= 0 || !source) continue;
    const logged = known.get(id);
    const enteredDaysAgo = (Date.parse(now) - Date.parse(entry.enteredAt)) / DAY_MS;
    // A max as old as the logs the window drops, dated ahead, or of no readable date, says nothing
    // now (the ninth and tenth passes: a year-old max counted as today's once the logs after it had
    // aged out, and one of no date, or dated ahead, as the newest).
    if (!(enteredDaysAgo <= MAX_AGE_DAYS) || !enteredBy(entry.enteredAt, now)) continue;
    const newer = !logged || enteredDaysAgo < logged.began;
    if (ceiling ? !logged || entered > logged.e1rm : newer) {
      // A max weighs by its own age; as a ceiling, never as older than the logs it stands over, so
      // it never weighs a lift trained lately as long ago (the tenth pass: an old max lowered it).
      const daysAgo = ceiling && logged ? Math.min(enteredDaysAgo, logged.daysAgo) : enteredDaysAgo;
      known.set(id, {
        exercise: source,
        e1rm: entered,
        daysAgo,
        began: enteredDaysAgo,
        newest: enteredDaysAgo,
      });
    }
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
