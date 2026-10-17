import { getExercise } from '../../catalog/exercises/catalog';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';

/**
 * Weighted versions of bodyweight moves (Maintenance 30, the owner's item 31; the evidence is in
 * docs/research/loaded-bodyweight-moves.md). A bodyweight move keeps its place while bodyweight
 * still fits its reps: loading it inside its range adds set-up and balance, not muscle. Once the
 * lifter outgrows it, its loaded version takes the place, where the place has one: past its range,
 * bodyweight costs time, discomfort, recovery and a reliable reserve. Outgrown is a set at bodyweight
 * a rep past the top of its range at the reserve the plan asked for, or a weight the lifter added to
 * it. A calf raise on two legs is past it for nearly any adult, so it is loaded wherever a loaded
 * version is. Where none is, the bodyweight move stays, a weight typed on it carried forward as
 * before (Maintenance 21).
 */

/** Each bodyweight move's loaded versions in the catalog: the same movement, loaded. */
export const LOADED_VERSIONS: Readonly<Record<string, readonly string[]>> = {
  'reverse-lunge': ['dumbbell-reverse-lunge'],
  'bulgarian-split-squat': ['dumbbell-bulgarian-split-squat'],
  'standing-calf-raise': ['standing-calf-raise-machine', 'leg-press-calf-raise'],
};

/** A loaded version's bodyweight move. */
export const BODYWEIGHT_VERSION: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LOADED_VERSIONS).flatMap(([bodyweight, loaded]) =>
    loaded.map((id) => [id, bodyweight] as const),
  ),
);

/**
 * The loaded versions that add their load to the lifter's own weight: no help to a lifter short of
 * the bodyweight move's range, where the leg-press calf raise, whose load lifts no bodyweight, can be
 * set lighter.
 */
export const ADDS_TO_BODYWEIGHT: ReadonlySet<string> = new Set([
  'dumbbell-reverse-lunge',
  'dumbbell-bulgarian-split-squat',
  'standing-calf-raise-machine',
]);

/** Too light on two legs for nearly any adult (Monteiro 2017): loaded wherever it can be. */
export const LOADED_BY_DEFAULT: ReadonlySet<string> = new Set(['standing-calf-raise']);

/** Whether a kept swap goes back to a bodyweight move from one of its own loaded versions. */
const goesBack = (swap: { from: string; to: string }): boolean =>
  LOADED_VERSIONS[swap.to]?.includes(swap.from) ?? false;

/**
 * The lifter's kept swaps, each swap back to a bodyweight move from one of its loaded versions
 * standing for every loaded version of the move: a swap back, kept, keeps the bodyweight move,
 * whichever loaded version the plan or the coach would pick (the seventh re-check). A swap the
 * lifter keeps from another of those loaded versions stands as it is. A swap to a bodyweight move
 * from anything else applies where the pick is the exercise swapped out, and the rule moves the move
 * as usual elsewhere.
 */
export function withSwapsBack<T extends { from: string; to: string }>(swaps: readonly T[]): T[] {
  const from = new Set(swaps.map((swap) => swap.from));
  const added: T[] = [];
  for (const swap of swaps.filter(goesBack)) {
    for (const id of LOADED_VERSIONS[swap.to] ?? []) {
      if (from.has(id)) continue;
      from.add(id);
      added.push({ ...swap, from: id });
    }
  }
  return [...swaps, ...added];
}

/** The reserve read for a set saved without the plan's own. */
const PLANNED_RESERVE = 2;

/** How far a pick is moved: past any difference in how well two moves suit a slot. */
export const LOAD_SHIFT = 40;

/** What outgrew a bodyweight move: its reps past the top of its range, or a weight added to it. */
export type OutgrownBy = 'reps' | 'weight';

function rangeOf(exerciseId: string): readonly [number, number] | null {
  return getExercise(exerciseId)?.repRanges.hypertrophy ?? null;
}

/**
 * The bodyweight moves the lifter has outgrown, read through their workouts in order. A workout with
 * a working set at bodyweight a rep past the top of its range at the planned reserve, or one done
 * holding a weight, outgrows the move. Only one where no set at bodyweight reached the bottom of its
 * range at the planned reserve brings it back: sets inside the range say nothing either way, since
 * the plan's own range stops them at its top (a hotel's bodyweight sets done as planned never undo
 * the gym's loaded version).
 */
export function outgrownMoves(history: readonly WorkoutRecord[]): Map<string, OutgrownBy> {
  const outgrown = new Map<string, OutgrownBy>();
  const inOrder = [...history].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const record of inOrder) {
    for (const entry of record.entries) {
      if (!(entry.exerciseId in LOADED_VERSIONS)) continue;
      const working = entry.sets.filter((set) => set.kind === 'working' && set.completed);
      if (working.length === 0) continue;
      const atBodyweight = working.filter((set) => !((set.weight ?? 0) > 0));
      const range = (set: (typeof working)[number]) =>
        set.targetReps ?? rangeOf(entry.exerciseId) ?? null;
      const atReserve = (set: (typeof working)[number]) =>
        set.reps + (set.rir ?? 0) - (set.targetRir ?? PLANNED_RESERVE);
      const past = atBodyweight.some((set) => {
        const reps = range(set);
        return reps !== null && atReserve(set) >= reps[1] + 1;
      });
      const short =
        atBodyweight.length > 0 &&
        atBodyweight.every((set) => {
          const reps = range(set);
          return reps !== null && atReserve(set) < reps[0];
        });
      if (past) outgrown.set(entry.exerciseId, 'reps');
      else if (atBodyweight.length < working.length) outgrown.set(entry.exerciseId, 'weight');
      else if (short) outgrown.delete(entry.exerciseId);
    }
  }
  return outgrown;
}

/**
 * Whether a bodyweight move gives its place to a loaded version here. One the lifter swapped away
 * from, and kept, stays the plan's own pick, so the swap applies to it as before.
 */
export function loadsNow(
  bodyweightId: string,
  outgrown: ReadonlyMap<string, OutgrownBy>,
  swappedAway: ReadonlySet<string> = new Set(),
): boolean {
  if (swappedAway.has(bodyweightId)) return false;
  return outgrown.has(bodyweightId) || LOADED_BY_DEFAULT.has(bodyweightId);
}

/**
 * Whether a loaded version waits: until its bodyweight move loads, wherever that move is (one
 * swapped away, or disliked, never loads the movement it stands for), it is no candidate at all,
 * so a slot with nothing else keeps the plan's own pick, as before the rule. One the lifter chose
 * stands: a favourite, a kept swap's own exercise, the lift to push (the fourth re-check).
 */
export function waitsForBodyweight(
  exercise: Pick<CatalogExercise, 'id'>,
  outgrown: ReadonlyMap<string, OutgrownBy>,
  swappedAway: ReadonlySet<string> = new Set(),
  chosen: ReadonlySet<string> = new Set(),
): boolean {
  const bodyweight = BODYWEIGHT_VERSION[exercise.id];
  if (bodyweight === undefined || chosen.has(exercise.id)) return false;
  return !loadsNow(bodyweight, outgrown, swappedAway);
}

/**
 * What the rule moves a candidate by, among the candidates a slot has here: a bodyweight move down
 * once it loads now, where a loaded version is a candidate. A loaded version is never moved: it
 * waits outright (`waitsForBodyweight`), or competes as itself.
 */
export function loadedVersionShift(
  exercise: Pick<CatalogExercise, 'id'>,
  candidateIds: ReadonlySet<string>,
  outgrown: ReadonlyMap<string, OutgrownBy>,
  swappedAway: ReadonlySet<string> = new Set(),
): number {
  const loaded = LOADED_VERSIONS[exercise.id];
  if (!loaded?.some((id) => candidateIds.has(id))) return 0;
  return loadsNow(exercise.id, outgrown, swappedAway) ? -LOAD_SHIFT : 0;
}

/**
 * Which of a bodyweight move and its loaded versions the lifter did last at this place: the change
 * to a loaded version is new here until one of them is done here.
 */
export function lastDoneHere(
  history: readonly WorkoutRecord[],
  locationId: string | null,
): Map<string, 'bodyweight' | 'loaded'> {
  const last = new Map<string, { at: string; kind: 'bodyweight' | 'loaded' }>();
  if (locationId === null) return new Map();
  for (const record of history) {
    if (record.locationId !== locationId) continue;
    for (const entry of record.entries) {
      const bodyweight =
        entry.exerciseId in LOADED_VERSIONS
          ? entry.exerciseId
          : BODYWEIGHT_VERSION[entry.exerciseId];
      if (bodyweight === undefined) continue;
      if (!entry.sets.some((set) => set.kind === 'working' && set.completed)) continue;
      const kind = bodyweight === entry.exerciseId ? 'bodyweight' : 'loaded';
      const seen = last.get(bodyweight);
      // The later workout; in the same one, the loaded version done counts.
      if (
        !seen ||
        record.startedAt > seen.at ||
        (record.startedAt === seen.at && kind === 'loaded')
      ) {
        last.set(bodyweight, { at: record.startedAt, kind });
      }
    }
  }
  return new Map([...last].map(([id, seen]) => [id, seen.kind]));
}

/**
 * What "Why this workout" says of a loaded version the plan holds in place of its bodyweight move:
 * said at the change at this place, until one of them is done here again. The caller says it only
 * of an entry the rule put in, where the bodyweight move could stand.
 */
export function loadedVersionLine(
  loadedId: string,
  outgrown: ReadonlyMap<string, OutgrownBy>,
  swappedAway: ReadonlySet<string>,
  doneHere: ReadonlyMap<string, 'bodyweight' | 'loaded'>,
): string | null {
  const bodyweightId = BODYWEIGHT_VERSION[loadedId];
  if (!bodyweightId || !loadsNow(bodyweightId, outgrown, swappedAway)) return null;
  if (doneHere.get(bodyweightId) === 'loaded') return null;
  const loaded = getExercise(loadedId)?.name;
  const bodyweight = getExercise(bodyweightId)?.name;
  if (!loaded || !bodyweight) return null;
  const by = outgrown.get(bodyweightId);
  const why =
    by === 'reps'
      ? 'at bodyweight you went past the top of its reps, so it is loaded now.'
      : by === 'weight'
        ? 'you added a weight to it, so it is loaded now.'
        : 'on two legs, bodyweight is too light for its reps.';
  return `${loaded} in place of the ${bodyweight}: ${why}`;
}
