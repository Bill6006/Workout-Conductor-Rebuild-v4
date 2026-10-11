import { exercisesByPattern } from '../../catalog/exercises/catalog';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { checkExerciseFit, isBlocked, type ConflictContext } from '../conflicts/conflictEngine';
import type { LastingSwap } from '../planning/lastingSwaps';
import { maxFromSet } from '../progression/maxes';
import { RETURN_AFTER_DAYS } from '../progression/progression';

/**
 * Variety for accessories where it helps (Maintenance 27, the owner's item 49,
 * docs/research/accessory-variety.md). No rotation on a timer: varying accessories neither helps
 * nor hurts size or strength over 8 to 12 weeks (Kassiano et al. 2022; Kassiano et al. 2025), and
 * frequent, random change may blunt them (Baz-Valle et al. 2019). An accessory that is progressing
 * stays. A change is offered, never made, at the stall monitor's variation step and when an
 * accessory has gone flat for weeks; adherence and the lifter's own choice keep their existing
 * routes. Never a main lift: strength is specific to the lift practised (Saeterbakken et al. 2025).
 */
export const VARIETY = {
  /** An exercise left in the last twelve weeks is not offered back: no ping-pong. */
  LEFT_DAYS: 84,
  /** No offer within four weeks of a change: the lasting swap's own length. */
  SETTLE_DAYS: 28,
  /** Flat: in the plan twelve weeks or more, and no higher than eight weeks before. */
  STALE_TENURE_DAYS: 84,
  STALE_BACK_DAYS: 56,
  /** Readings around eight weeks back, a week either side. */
  STALE_WINDOW_DAYS: 7,
  /**
   * Readings now: the best of the last two weeks, so a deload week's lighter loads (one week at a
   * time) never read as the lift gone flat (the review of item 49).
   */
  STALE_LATEST_DAYS: 14,
  /** Sessions with it in the last twelve weeks for a trend to mean anything. */
  STALE_SESSIONS: 4,
} as const;

const DAY_MS = 86_400_000;
const whenOf = (record: WorkoutRecord) => record.completedAt ?? record.startedAt;

/** An accessory: a single-joint lift. Main lifts are never varied. */
export function isAccessory(exercise: CatalogExercise): boolean {
  return !exercise.compound;
}

/** Exercises the lifter left in the last twelve weeks: swapped out, or kept swapped out. */
function leftRecently(
  history: readonly WorkoutRecord[],
  swaps: readonly LastingSwap[],
  now: string,
): Set<string> {
  const from = Date.parse(now) - VARIETY.LEFT_DAYS * DAY_MS;
  const left = new Set<string>();
  for (const record of history) {
    if (Date.parse(whenOf(record)) < from) continue;
    for (const entry of record.entries) if (entry.replacedFrom) left.add(entry.replacedFrom);
  }
  for (const swap of swaps) if (Date.parse(swap.setAt) >= from) left.add(swap.from);
  return left;
}

const RANK = { low: 0, moderate: 1, high: 2 } as const;
const rankOn = (exercise: CatalogExercise, joint: string) => {
  const level = (exercise.jointStress as Partial<Record<string, keyof typeof RANK>>)[joint];
  return level ? RANK[level] : 0;
};

const stress = (exercise: CatalogExercise) =>
  Object.values(exercise.jointStress).reduce(
    (sum, level) => sum + (level === 'high' ? 2 : level === 'moderate' ? 1 : 0),
    0,
  );

/**
 * The alternative a variety offer names: the same movement, a single-joint lift that fits the
 * place and the lifter's limits, not disliked, not one they left in the last twelve weeks, not
 * already in today's plan, and at least as good for growth (exercises differ in where and how
 * much they grow a muscle: Maeo et al. 2021, 2023; Kinoshita et al. 2023). Other equipment first,
 * so the change complements rather than repeats (Kassiano 2022).
 */
export function varietyFor(input: {
  exercise: CatalogExercise;
  history: readonly WorkoutRecord[];
  now: string;
  context: ConflictContext;
  swaps?: readonly LastingSwap[];
  /** Exercises already in today's plan. */
  today?: readonly string[];
}): CatalogExercise | null {
  const { exercise } = input;
  if (!isAccessory(exercise)) return null;
  const left = leftRecently(input.history, input.swaps ?? [], input.now);
  const today = new Set(input.today ?? []);
  // Never more stress on a joint the lifter flagged, or protects today, than the lift it stands in
  // for: the coach would flag it at once (the re-check of item 49).
  const flagged = input.context.limitations.painAreas;
  const noMoreOnFlagged = (candidate: CatalogExercise) =>
    flagged.every((joint) => rankOn(candidate, joint) <= rankOn(exercise, joint));
  const candidates = exercisesByPattern(exercise.movementPattern).filter(
    (candidate) =>
      candidate.id !== exercise.id &&
      isAccessory(candidate) &&
      candidate.measure === exercise.measure &&
      !left.has(candidate.id) &&
      !today.has(candidate.id) &&
      candidate.hypertrophySuitability >= exercise.hypertrophySuitability &&
      noMoreOnFlagged(candidate) &&
      !isBlocked(checkExerciseFit(candidate, input.context)),
  );
  const other = (candidate: CatalogExercise) =>
    candidate.station !== exercise.station || candidate.load !== exercise.load ? 1 : 0;
  candidates.sort(
    (a, b) =>
      other(b) - other(a) ||
      b.hypertrophySuitability - a.hypertrophySuitability ||
      stress(a) - stress(b) ||
      a.name.localeCompare(b.name),
  );
  return candidates[0] ?? null;
}

/**
 * The sessions with a completed working set of the exercise, oldest first, since its last break of
 * three weeks or more (the app's own break rule): a lift back from a break is new again, and its
 * return loads are no reading of it gone flat (the review of item 49).
 */
function sessionsOf(history: readonly WorkoutRecord[], exerciseId: string): WorkoutRecord[] {
  const sessions = history
    .filter((record) =>
      record.entries.some(
        (entry) =>
          entry.exerciseId === exerciseId &&
          entry.sets.some((set) => set.kind === 'working' && set.completed),
      ),
    )
    .sort((a, b) => whenOf(a).localeCompare(whenOf(b)));
  let start = 0;
  sessions.forEach((record, index) => {
    const previous = sessions[index - 1];
    if (
      previous &&
      Date.parse(whenOf(record)) - Date.parse(whenOf(previous)) >= RETURN_AFTER_DAYS * DAY_MS
    ) {
      start = index;
    }
  });
  return sessions.slice(start);
}

/** A session's best set read as a max (as Progress reads it), or null with no weight. */
function sessionMax(record: WorkoutRecord, exerciseId: string): number | null {
  let best: number | null = null;
  for (const entry of record.entries) {
    if (entry.exerciseId !== exerciseId) continue;
    for (const set of entry.sets) {
      if (set.kind !== 'working' || !set.completed || set.weight === null || set.weight <= 0) {
        continue;
      }
      const max = maxFromSet(set.weight, set.reps);
      if (best === null || max > best) best = max;
    }
  }
  return best;
}

/** The exercise came into the plan, or was swapped in, within the last four weeks. */
export function changedRecently(
  history: readonly WorkoutRecord[],
  exerciseId: string,
  swaps: readonly LastingSwap[],
  now: string,
): boolean {
  const settle = Date.parse(now) - VARIETY.SETTLE_DAYS * DAY_MS;
  const first = sessionsOf(history, exerciseId)[0];
  if (!first || Date.parse(whenOf(first)) >= settle) return true;
  return swaps.some(
    (swap) =>
      (swap.to === exerciseId || swap.from === exerciseId) && Date.parse(swap.setAt) >= settle,
  );
}

/**
 * Gone flat: in the plan twelve weeks or more since its last break, done at least four times in
 * them, and its best estimated max in the last two weeks no higher than its best seven to nine
 * weeks before. No study defines an accessory's staleness; progress, not tenure, is what keeps an
 * exercise (the evidence), and this reads it over the eight weeks the stall routes would take.
 */
export function goneFlat(
  history: readonly WorkoutRecord[],
  exerciseId: string,
  now: string,
): { now: number; before: number } | null {
  const at = Date.parse(now);
  const sessions = sessionsOf(history, exerciseId).filter(
    (record) => Date.parse(whenOf(record)) <= at,
  );
  const first = sessions[0];
  if (!first || at - Date.parse(whenOf(first)) < VARIETY.STALE_TENURE_DAYS * DAY_MS) return null;
  const recent = sessions.filter(
    (record) => at - Date.parse(whenOf(record)) <= VARIETY.STALE_TENURE_DAYS * DAY_MS,
  );
  if (recent.length < VARIETY.STALE_SESSIONS) return null;
  const best = (fromDays: number, toDays: number) =>
    sessions
      .filter((record) => {
        const days = (at - Date.parse(whenOf(record))) / DAY_MS;
        return days >= fromDays && days <= toDays;
      })
      .map((record) => sessionMax(record, exerciseId))
      .filter((max): max is number => max !== null)
      .reduce<number | null>((top, max) => (top === null || max > top ? max : top), null);
  const latest = best(0, VARIETY.STALE_LATEST_DAYS);
  const earlier = best(
    VARIETY.STALE_BACK_DAYS - VARIETY.STALE_WINDOW_DAYS,
    VARIETY.STALE_BACK_DAYS + VARIETY.STALE_WINDOW_DAYS,
  );
  if (latest === null || earlier === null || latest > earlier) return null;
  return { now: latest, before: earlier };
}
