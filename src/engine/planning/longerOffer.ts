import { getExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import { localWeekKey } from '../../core/time/localDate';
import type { UserProfile } from '../../core/validation/profile';
import { RULES } from '../rules/ruleTable';
import { INDIRECT_SET_WEIGHT, goalWeights } from '../volume/weeklyVolume';
import { allEntries, type DurationChoice, type GeneratedWorkout } from '../workout/types';
import { choiceMinutes } from './expectedLengths';
import type { WeekModel } from './weekModel';

/**
 * "Longer would help" (Maintenance 34, the approved proposal part 2): "an inline suggestion, never a
 * question. It sits next to the length control: '45 min would close most of this week's chest gap ·
 * Use 45 min'. When it appears: only if a priority muscle is projected below your goal's range,
 * today's split trains it, recovery allows, and fatigue isn't high."
 *
 * The next length is worked out by the rebuild a tap on it runs (the caller's trial plan), so what
 * the words promise is what the tap gives (an estimate runs the rule it estimates).
 */

/** The lengths a lifter can pick, the Default at its own minutes. */
const LENGTHS: readonly DurationChoice[] = [15, 30, 45, 'default'];

/** The next length up from today's, by minutes; null at the longest. */
export function nextLonger(current: DurationChoice, defaultMinutes: number): DurationChoice | null {
  const minutes = choiceMinutes(current, defaultMinutes);
  const longer = LENGTHS.filter((one) => choiceMinutes(one, defaultMinutes) > minutes).sort(
    (a, b) => choiceMinutes(a, defaultMinutes) - choiceMinutes(b, defaultMinutes),
  );
  return longer[0] ?? null;
}

/** The muscles the lifter's goals weight up: a goal's own muscles, never the small ones. */
export function priorityMuscles(profile: UserProfile): MuscleId[] {
  const weights = goalWeights(profile);
  return MUSCLE_IDS.filter((muscle) => weights[muscle] > 1 + 1e-6);
}

/** A muscle's working sets in a plan, a synergist's at half, as the week counts them. */
export function setsIn(workout: Pick<GeneratedWorkout, 'blocks'>, muscle: MuscleId): number {
  return allEntries(workout.blocks).reduce((sum, entry) => {
    const exercise = getExercise(entry.exerciseId);
    if (!exercise) return sum;
    const working = entry.sets.filter((set) => set.kind === 'working').length;
    if (exercise.primaryMuscles.includes(muscle)) return sum + working;
    if (exercise.secondaryMuscles.includes(muscle)) return sum + working * INDIRECT_SET_WEIGHT;
    return sum;
  }, 0);
}

export interface LongerOffer {
  /** The length offered: the next one up. */
  choice: DurationChoice;
  minutes: number;
  /** The priority muscles it closes at least half the week's gap of, the furthest behind first. */
  muscles: MuscleId[];
  /** It closes every one of their gaps whole. */
  closesAll: boolean;
  /** The local Monday of this week: "Not now" skips its muscles until it ends. */
  week: string;
}

export function longerOffer(input: {
  profile: UserProfile;
  /** The week with today at its own length (`weekModel`'s `todayLength`). */
  week: WeekModel;
  now: string;
  /** Today's plan as it stands. */
  plan: Pick<GeneratedWorkout, 'blocks'>;
  /** The next length up, and today's plan rebuilt at it, as the tap would rebuild it. */
  next: DurationChoice | null;
  trial: Pick<GeneratedWorkout, 'blocks'> | null;
  /** A muscle still inside its recovery window: no gap of it is a reason for longer. */
  recovering: (muscle: MuscleId) => boolean;
  /** Muscles the lifter said "Not now" to this week. */
  skipped: ReadonlySet<MuscleId>;
}): LongerOffer | null {
  const { profile, week, plan, next, trial } = input;
  if (next === null || trial === null) return null;
  const found: { muscle: MuscleId; now: number; then: number }[] = [];
  for (const muscle of priorityMuscles(profile)) {
    if (input.recovering(muscle) || input.skipped.has(muscle)) continue;
    const it = week.muscles[muscle];
    // What the week holds without today's plan: done, and the sessions after today.
    const without = it.done + (it.planned - it.plannedToday);
    const now = it.target - without - setsIn(plan, muscle);
    if (now < 1) continue;
    const then = Math.max(0, it.target - without - setsIn(trial, muscle));
    if (now - then >= RULES.longerShare.value * now) found.push({ muscle, now, then });
  }
  if (found.length === 0) return null;
  found.sort((a, b) => b.now - a.now);
  return {
    choice: next,
    minutes: choiceMinutes(next, profile.schedule.typicalDurationMinutes),
    muscles: found.map((item) => item.muscle),
    closesAll: found.every((item) => item.then < 1),
    week: localWeekKey(input.now),
  };
}
