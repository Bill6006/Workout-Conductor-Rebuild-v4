import { getExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import { addLocalDays, localWeekKey } from '../../core/time/localDate';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RULES } from '../rules/ruleTable';
import { INDIRECT_SET_WEIGHT, weeklyTargets } from '../volume/weeklyVolume';
import { trainedIn } from './catchUp';
import { priorityMuscles } from './longerOffer';

/**
 * The honest goals-versus-time check (Maintenance 34; the approved proposal's table: "Honest 'too
 * little time' message: Only after 3+ consecutive weeks below your goal's floor. Strength holds about
 * 3 weeks (McMaster 2013)"; settled: "shown once after 3+ weeks below the floor, again only on a
 * material change").
 *
 * - **The floor:** about 4 hard sets a week for a muscle (Schoenfeld 2017; Iversen 2021): a muscle is
 *   below it in a week with fewer than 4 sets done, a synergist's at half, as the week counts them.
 * - **Whole weeks:** the last three completed, Monday to Sunday on this device, each with a session
 *   in it: a week away is a break, not a short week (Coleman 2024; Hwang 2017).
 * - **The muscles:** those the goals weight up, or the major muscles where none is.
 * - **About time:** only where the weeks' sessions were planned shorter than the Default (judgement):
 *   at the full length, time is not what held the muscles back, and the card would mislead.
 */
export interface GoalsTimeReading {
  /** The muscles under the floor in every one of the weeks. */
  muscles: MuscleId[];
  /** About how many sessions a week the weeks held. */
  sessions: number;
  /** The minutes their sessions were planned at, the median. */
  minutes: number;
}

/** A muscle's sets done in some workouts, a synergist's at half. */
function setsDone(records: readonly WorkoutRecord[], muscle: MuscleId): number {
  let sets = 0;
  for (const record of records) {
    for (const entry of record.entries) {
      const exercise = getExercise(entry.exerciseId);
      if (!exercise) continue;
      const done = entry.sets.filter((set) => set.completed && set.kind !== 'warmup').length;
      if (exercise.primaryMuscles.includes(muscle)) sets += done;
      else if (exercise.secondaryMuscles.includes(muscle)) sets += done * INDIRECT_SET_WEIGHT;
    }
  }
  return sets;
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};

export function goalsTimeReading(
  profile: UserProfile,
  history: readonly WorkoutRecord[],
  now: string,
): GoalsTimeReading | null {
  const weeks = RULES.shortWeeks.value;
  const keys = Array.from({ length: weeks }, (_, back) =>
    localWeekKey(addLocalDays(now, -7 * (back + 1))),
  );
  const trained = history.filter((record) => record.startedAt <= now && trainedIn(record));
  const byWeek = keys.map((key) =>
    trained.filter((record) => localWeekKey(record.startedAt) === key),
  );
  if (byWeek.some((records) => records.length === 0)) return null;
  const priority = priorityMuscles(profile);
  const targets = weeklyTargets(profile);
  const muscles =
    priority.length > 0 ? priority : MUSCLE_IDS.filter((muscle) => targets[muscle] >= 10);
  const under = muscles.filter((muscle) =>
    byWeek.every((records) => setsDone(records, muscle) < RULES.floorSets.value),
  );
  if (under.length === 0) return null;
  const all = byWeek.flat();
  const defaultMinutes = profile.schedule.typicalDurationMinutes;
  const minutes = median(all.map((record) => record.plannedMinutes ?? defaultMinutes));
  if (minutes >= defaultMinutes) return null;
  return {
    muscles: under,
    sessions: Math.max(1, Math.round(all.length / weeks)),
    minutes: Math.round(minutes),
  };
}

/**
 * Whether a reading changed materially from the one put away (Nahum-Shani 2018): other muscles, or
 * the weeks' minutes moved by a quarter or more. Time alone never brings the card back.
 */
export function goalsTimeChanged(
  reading: Pick<GoalsTimeReading, 'muscles' | 'minutes'>,
  kept: { muscles: readonly MuscleId[]; minutes: number } | null | undefined,
): boolean {
  if (!kept) return true;
  const same = (a: readonly MuscleId[]) => [...a].sort().join(',');
  if (same(reading.muscles) !== same(kept.muscles)) return true;
  return Math.abs(reading.minutes - kept.minutes) >= RULES.materialShare.value * kept.minutes;
}
