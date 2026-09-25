import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { muscleGroupOf } from '../../catalog/muscles/muscles';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';

/**
 * Session context: what has already been done today before an exercise, and
 * how that compares with the day its target came from. Whatever you train
 * later in a session performs worse, by something like five to fifteen
 * percent depending on how much came before it. But a target taken from a
 * logged set already carries the fatigue of that day, so the rule is never
 * "later means lighter"; it is "compare today against the day the number came
 * from", and adjust by the difference. A long break makes what follows a
 * fresher start: the work before it counts half, and the ramps come back.
 */

/** A pause this long makes what follows a fresher start. */
export const LONG_BREAK_MINUTES = 20;

/** Sets before a long break count this much toward the fatigue carried into what follows. */
const BEFORE_BREAK_WEIGHT = 0.5;

export interface EarlierWork {
  exercise: CatalogExercise;
  /** Working sets planned for the entry, done or not. */
  planned: number;
  /** When each completed, unskipped working set was logged, oldest first. */
  doneAt: readonly string[];
  /** Sets recorded as skipped: done for planning, no work carried. */
  skipped: number;
}

export interface PrecedingWork {
  /** Overlap-weighted working sets that come before the exercise today. */
  sets: number;
  /** A long break separates the last logged set from now. */
  afterBreak: boolean;
  lastSetAt: string | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** How much one exercise's work loads another: shared primary muscles fully, the same group by half. */
export function overlapWeight(
  a: Pick<CatalogExercise, 'id' | 'primaryMuscles'>,
  b: Pick<CatalogExercise, 'id' | 'primaryMuscles'>,
): number {
  if (a.id === b.id) return 1;
  if (a.primaryMuscles.some((muscle) => b.primaryMuscles.includes(muscle))) return 1;
  const groups = new Set(a.primaryMuscles.map(muscleGroupOf));
  if (b.primaryMuscles.some((muscle) => groups.has(muscleGroupOf(muscle)))) return 0.5;
  return 0;
}

export function isLongBreak(fromIso: string, toIso: string): boolean {
  const minutes = (Date.parse(toIso) - Date.parse(fromIso)) / 60_000;
  return Number.isFinite(minutes) && minutes >= LONG_BREAK_MINUTES;
}

/** The last set logged before a long break, given every set time in order; null without a break. */
function lastBreakAt(stamps: readonly string[], now: string): string | null {
  let breakAt: string | null = null;
  stamps.forEach((stamp, index) => {
    const next = stamps[index + 1] ?? now;
    if (isLongBreak(stamp, next)) breakAt = stamp;
  });
  return breakAt;
}

/**
 * Work before this exercise today: sets already done count by their time,
 * sets still planned count as coming, and anything before a long break counts
 * half. Skipped sets carry nothing and are not coming either.
 */
export function precedingWorkToday(
  exercise: Pick<CatalogExercise, 'id' | 'primaryMuscles'>,
  earlier: readonly EarlierWork[],
  now: string,
): PrecedingWork {
  const stamps = earlier.flatMap((item) => item.doneAt).sort();
  const lastSetAt = stamps.at(-1) ?? null;
  const afterBreak = lastSetAt !== null && isLongBreak(lastSetAt, now);
  const breakAt = lastBreakAt(stamps, now);
  let sets = 0;
  for (const item of earlier) {
    const weight = overlapWeight(exercise, item.exercise);
    if (weight === 0) continue;
    const done = item.doneAt.length;
    const beforeBreak =
      breakAt === null ? 0 : item.doneAt.filter((at) => at <= (breakAt as string)).length;
    const coming = Math.max(0, item.planned - done - item.skipped);
    sets += weight * (done - beforeBreak * (1 - BEFORE_BREAK_WEIGHT) + coming);
  }
  return { sets: round1(sets), afterBreak, lastSetAt };
}

/**
 * The same measure on the day a target came from: the completed working sets
 * of the entries before the exercise in the saved record, with a long break
 * in that session counting the earlier work half as well.
 */
export function precedingWorkInRecord(
  record: WorkoutRecord,
  exerciseId: string,
  exerciseOf: (id: string) => Pick<CatalogExercise, 'id' | 'primaryMuscles'> | undefined,
): number | null {
  const index = record.entries.findIndex((entry) => entry.exerciseId === exerciseId);
  if (index < 0) return null;
  const target = exerciseOf(exerciseId);
  if (!target) return null;
  const before = record.entries.slice(0, index);
  const own = record.entries[index];
  const firstOwn = own?.sets.find((set) => set.completed && set.loggedAt)?.loggedAt;
  const stamps = before
    .flatMap((entry) =>
      entry.sets
        .filter((set) => set.kind === 'working' && set.completed && set.reps > 0 && set.loggedAt)
        .map((set) => set.loggedAt as string),
    )
    .sort();
  const breakAt = lastBreakAt(stamps, firstOwn ?? record.completedAt ?? record.startedAt);
  let sets = 0;
  for (const entry of before) {
    const exercise = exerciseOf(entry.exerciseId);
    if (!exercise) continue;
    const weight = overlapWeight(target, exercise);
    if (weight === 0) continue;
    const done = entry.sets.filter(
      (set) => set.kind === 'working' && set.completed && set.reps > 0,
    );
    const beforeBreak =
      breakAt === null
        ? 0
        : done.filter((set) => set.loggedAt && set.loggedAt <= (breakAt as string)).length;
    sets += weight * (done.length - beforeBreak * (1 - BEFORE_BREAK_WEIGHT));
  }
  return round1(sets);
}

export interface FatigueSteps {
  steps: -2 | -1 | 0 | 1;
  line: string | null;
}

const SESSION_LINE = 'Before this today: ';
const DOWN_TWO = ': down two steps.';
const DOWN_ONE = ': down a step.';
const UP_ONE = ', and that day was clean: fresher, so up a step.';

function fmt(sets: number): string {
  return Number.isInteger(sets) ? String(sets) : sets.toFixed(1);
}

/**
 * How many load steps the difference in preceding work is worth. Three more
 * overlapping sets than the reference day is a step down, six is two; three
 * fewer is a step up only when the reference day was clean. Anything closer
 * changes nothing, so a normal day in the usual order never drifts.
 */
export function fatigueSteps(
  today: number,
  reference: number,
  referenceClean: boolean,
): FatigueSteps {
  const diff = today - reference;
  const stem = `${SESSION_LINE}about ${fmt(today)} sets on these muscles, against ${fmt(
    reference,
  )} on the day the target was set`;
  if (diff >= 6) return { steps: -2, line: `${stem}${DOWN_TWO}` };
  if (diff >= 3) return { steps: -1, line: `${stem}${DOWN_ONE}` };
  if (diff <= -3 && referenceClean) return { steps: 1, line: `${stem}${UP_ONE}` };
  return { steps: 0, line: null };
}

/**
 * The steps a line of `fatigueSteps` stands for (Maintenance 24): a plan saved before targets
 * recorded their steps (`nudged`) is read by its own lines.
 */
export function stepsOfSessionLine(line: string): number {
  if (!line.startsWith(SESSION_LINE)) return 0;
  return line.endsWith(DOWN_TWO)
    ? -2
    : line.endsWith(DOWN_ONE)
      ? -1
      : line.endsWith(UP_ONE)
        ? 1
        : 0;
}
