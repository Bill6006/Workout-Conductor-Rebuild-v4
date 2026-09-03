import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { DurationChoice, TimeBreakdown, WorkoutBlock, WorkoutEntry } from '../workout/types';

/**
 * The one workout-length system: 15 min, 30 min, 45 min, or Default time.
 * Default time is the complete session the plan generates for the user's
 * typical duration. Time estimation lives here too so fitting and display
 * always agree. Sets already logged can be excluded from an estimate, which
 * is how the recalibration engine measures only the remaining work.
 */

export const DURATION_CHOICES: readonly DurationChoice[] = [15, 30, 45, 'default'];

export function isDurationChoice(value: unknown): value is DurationChoice {
  return value === 'default' || value === 15 || value === 30 || value === 45;
}

export function resolveTargetMinutes(choice: DurationChoice, defaultMinutes: number): number {
  return choice === 'default' ? defaultMinutes : choice;
}

export function durationLabel(choice: DurationChoice, defaultMinutes: number): string {
  return choice === 'default' ? `Default: ${defaultMinutes} min` : `${choice} min`;
}

/** General warm-up budget per length; no long optional block on short sessions. */
export function generalWarmupMinutes(targetMinutes: number): number {
  if (targetMinutes <= 15) return 1.5;
  if (targetMinutes <= 30) return 2.5;
  if (targetMinutes <= 45) return 3.5;
  return 5;
}

export const WORK_SECONDS = {
  warmup: 25,
  strength: 45,
  hypertrophy: 40,
  isolation: 35,
} as const;

const SUPERSET_SWITCH_SECONDS = 15;
const CIRCUIT_SWITCH_SECONDS = 12;
const WARMUP_SET_REST_SECONDS = 45;

/** Answers whether a set has already been logged; logged sets cost no more time. */
export type SetDonePredicate = (entryId: string, setIndex: number) => boolean;

const NOTHING_DONE: SetDonePredicate = () => false;

export function workSecondsFor(entry: WorkoutEntry, kind: 'warmup' | 'working' | 'drop'): number {
  if (kind === 'warmup') return WORK_SECONDS.warmup;
  if (kind === 'drop') return 20;
  if (entry.role === 'primary-strength' || entry.role === 'secondary-strength')
    return WORK_SECONDS.strength;
  if (entry.role === 'isolation' || entry.role === 'finisher' || entry.role === 'corrective') {
    return WORK_SECONDS.isolation;
  }
  return WORK_SECONDS.hypertrophy;
}

function setupSeconds(exercise: CatalogExercise): number {
  return exercise.setupSeconds + exercise.transitionCost * 10;
}

interface BlockSeconds {
  work: number;
  rest: number;
  setup: number;
}

export function estimateBlockSeconds(
  block: WorkoutBlock,
  exerciseOf: (id: string) => CatalogExercise,
  isDone: SetDonePredicate = NOTHING_DONE,
): BlockSeconds {
  const started = block.entries.some((entry) =>
    entry.sets.some((set) => isDone(entry.id, set.index)),
  );
  // Once any set of a block is logged the user is already at the station.
  const setup = started
    ? 0
    : block.entries.reduce((sum, entry) => sum + setupSeconds(exerciseOf(entry.exerciseId)), 0);

  if (block.kind === 'straight') {
    const entry = block.entries[0];
    if (!entry) return { work: 0, rest: 0, setup };
    let work = 0;
    let rest = 0;
    const remaining = entry.sets.filter((set) => !isDone(entry.id, set.index));
    remaining.forEach((set, index) => {
      work += workSecondsFor(entry, set.kind);
      const last = index === remaining.length - 1;
      if (!last) rest += set.kind === 'warmup' ? WARMUP_SET_REST_SECONDS : set.restSeconds;
    });
    return { work, rest, setup };
  }

  // Superset and circuit: rounds of every entry's working set, one rest per round.
  const roundsDone = Math.min(
    ...block.entries.map(
      (entry) =>
        entry.sets.filter((set) => set.kind === 'working' && isDone(entry.id, set.index)).length,
    ),
  );
  const rounds = Math.max(0, block.rounds - roundsDone);
  const switchSeconds =
    block.kind === 'superset' ? SUPERSET_SWITCH_SECONDS : CIRCUIT_SWITCH_SECONDS;
  let work = 0;
  for (const entry of block.entries) {
    for (const set of entry.sets) {
      if (set.kind === 'warmup' && !isDone(entry.id, set.index))
        work += WORK_SECONDS.warmup + WARMUP_SET_REST_SECONDS;
    }
    work += rounds * workSecondsFor(entry, 'working');
    const drop = entry.sets.find((set) => set.kind === 'drop');
    if (entry.dropSet && drop && !isDone(entry.id, drop.index))
      work += workSecondsFor(entry, 'drop');
  }
  const transitions = rounds * (block.entries.length - 1) * switchSeconds;
  const rest = Math.max(0, rounds - 1) * block.restBetweenRoundsSeconds;
  return { work: work + transitions, rest, setup };
}

export function estimateWorkout(
  blocks: readonly WorkoutBlock[],
  generalWarmupMin: number,
  exerciseOf: (id: string) => CatalogExercise,
  isDone: SetDonePredicate = NOTHING_DONE,
): TimeBreakdown {
  let work = 0;
  let rest = 0;
  let setup = 0;
  for (const block of blocks) {
    const seconds = estimateBlockSeconds(block, exerciseOf, isDone);
    work += seconds.work;
    rest += seconds.rest;
    setup += seconds.setup;
  }
  const round = (value: number) => Math.round(value * 10) / 10;
  const workMinutes = round(work / 60);
  const restMinutes = round(rest / 60);
  const transitionMinutes = round(setup / 60);
  const totalMinutes = round(generalWarmupMin + workMinutes + restMinutes + transitionMinutes);
  return {
    warmupMinutes: generalWarmupMin,
    workMinutes,
    restMinutes,
    transitionMinutes,
    totalMinutes,
  };
}
