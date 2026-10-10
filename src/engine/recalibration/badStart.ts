import { getExercise } from '../../catalog/exercises/catalog';
import { isHold } from '../../catalog/exercises/exerciseSchema';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { prescribeFor } from '../progression/roles';
import { SHORT_BY_REPS, shortBy } from '../progression/shortfall';
import { allEntries, type WorkoutBlock, type WorkoutEntry } from '../workout/types';
import { ESTIMATED_MODES } from './recalibrate';
import type { CompletedSet } from './types';

/**
 * A bad start carries over to the rest of the workout (Maintenance 26, the owner's item 42,
 * docs/research/bad-start.md). The first working set of each of the first two lifts that can be
 * judged is read against what its target asked; both well short, and the lifts still to come get
 * the low check-in's treatment (a set fewer, a rep more in reserve).
 */

export { SHORT_BY_REPS };

/**
 * Sets asked for more reps to failure than this (the bottom of the range plus its reserve) are not
 * judged: reserve is read well only near failure and in sets of up to about twelve reps to failure,
 * and worse with every rep past them (Halperin 2022), so three reps there is within what a lifter
 * misjudges (the review of item 42 and its re-check).
 */
export const JUDGED_REPS = 12;

export interface StartReading {
  /** The first two lifts that can be judged both fell well short. */
  low: boolean;
  /** Those two lifts' catalog ids, in the order begun; empty unless the start is low. */
  lifts: string[];
}

/**
 * The reading as one word for a comparison: the lifter taking a change back holds it for as long
 * as the reading stays this (the review of item 42: an undone change came straight back). The
 * lifts in any order: a first set deleted and logged again changes their order, not the reading
 * (the third pass).
 */
export function startKey(reading: StartReading): string {
  return reading.low ? `low:${[...reading.lifts].sort().join(',')}` : 'plan';
}

/** What the plan's day-free reading needs: the lifter's profile and history before today. */
export interface StartContext {
  profile: UserProfile;
  history: readonly WorkoutRecord[];
}

/** Whether a lift's first working set fell well short of its target; null when it cannot say. */
function shortOf(entry: WorkoutEntry, first: CompletedSet, context: StartContext): boolean | null {
  const exercise = getExercise(entry.exerciseId);
  if (!exercise || isHold(exercise)) return null;
  // Only a target the lifter's own logged sets set says something about today: not one read from
  // an estimate (a first target, a new range or variation, a return after a break), nor one an
  // entered max raised (the re-check of item 42: a max past the log asks more than the lift has).
  // Nor one a saved workout brought from the day it was saved (the third pass of item 42).
  const progression = entry.progression;
  if (
    !progression ||
    ESTIMATED_MODES.has(progression.mode) ||
    progression.fromMax ||
    progression.saved ||
    // Nor one read from another rep range: a lift at bodyweight new to today's range is read from
    // the last it did (the fourth pass of item 42).
    progression.otherRange
  ) {
    return null;
  }
  // The session the target was read from fell under its floor on its first working set: falling
  // short again says little about today. At bodyweight a target never comes down after misses,
  // so it would read as a bad start every session (the review of item 42 and its re-check: the
  // session read is the target's own, at today's range, and a set tired at the end is no miss).
  if (progression.missed) return null;
  // A target the lifter set by hand when the set was logged is their own choice, not what the app
  // expected of today; one set by hand after it changes nothing about it (the review of item 42).
  if (first.byHand) return null;
  const set = entry.sets.find((candidate) => candidate.index === first.setIndex);
  if (!set || set.kind !== 'working' || first.rir === null) return null;
  // Heavier than asked, a shortfall is no evidence; lighter, it is stronger evidence still.
  if (set.targetWeight === null) {
    if (first.weight !== null && first.weight > 0) return null;
  } else if (first.weight === null || first.weight > set.targetWeight + 1e-6) {
    return null;
  }
  // What the plan asked: no reserve the day's settings added (a check-in, easier, the hard
  // start's own), whenever they were applied, is counted against the set; the load may not have
  // come down with it. A target asking less reserve than the plan is read as it asks. Either way
  // the smaller (the re-check of item 42: a set kept from before a check-in carried its reserve).
  // The plan's reserve as it stood when the set was logged: a style changed since does not
  // re-read it (the third pass).
  const planRir =
    first.planRir ?? prescribeFor(exercise, entry.role, context.profile, context.history).rir;
  const reserve = Math.min(set.targetRir, planRir);
  if (set.targetReps[0] + reserve > JUDGED_REPS) return null;
  return shortBy(set.targetReps[0], reserve, first.reps, first.rir) >= SHORT_BY_REPS;
}

/**
 * How the workout started: the first working set of each of the first two lifts that can be
 * judged, one for each place in the plan (a stand-in swapped in after its lift began shares the
 * reason it was swapped, so it is no second reading: the review of item 42).
 */
export function readStart(
  blocks: readonly WorkoutBlock[],
  sets: readonly CompletedSet[],
  context: StartContext,
): StartReading {
  const entries = allEntries(blocks);
  const firsts: { entry: WorkoutEntry; set: CompletedSet; at: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const working = sets.filter(
      (set) => set.entryId === entry.id && set.kind === 'working' && !set.skipped,
    );
    const first = working.reduce<CompletedSet | null>(
      (earliest, set) =>
        earliest === null || Date.parse(set.completedAt) < Date.parse(earliest.completedAt)
          ? set
          : earliest,
      null,
    );
    if (first) firsts.push({ entry, set: first, at: Date.parse(first.completedAt), order });
  });
  firsts.sort((a, b) => a.at - b.at || a.order - b.order);
  const judged: { exerciseId: string; short: boolean }[] = [];
  const places = new Set<string>();
  const begun = new Set<string>();
  for (const { entry, set } of firsts) {
    const place = entry.slot !== undefined ? `slot:${entry.slot}` : `entry:${entry.id}`;
    const standIn =
      places.has(place) || (entry.replacedFrom !== undefined && begun.has(entry.replacedFrom));
    places.add(place);
    begun.add(entry.exerciseId);
    if (standIn) continue;
    const short = shortOf(entry, set, context);
    if (short === null) continue;
    judged.push({ exerciseId: entry.exerciseId, short });
    if (judged.length === 2) break;
  }
  const low = judged.length === 2 && judged.every((lift) => lift.short);
  return { low, lifts: low ? judged.map((lift) => lift.exerciseId) : [] };
}
