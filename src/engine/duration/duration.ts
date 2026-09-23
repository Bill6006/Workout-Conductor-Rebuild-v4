import { isHold, type CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { restCategory } from '../progression/roles';
import { blockSequence, isPairedSwitch, restBetween } from '../workout/sequence';
import type {
  DurationChoice,
  SetPrescription,
  TimeBreakdown,
  WorkoutBlock,
  WorkoutEntry,
} from '../workout/types';

/**
 * The one workout-length system: 15 min, 30 min, 45 min, or Default time.
 * Default time is the complete session the plan generates for the user's
 * typical duration. Time estimation lives here too so fitting and display
 * always agree. Sets already logged can be excluded from an estimate, which
 * is how the recalibration engine measures only the remaining work.
 *
 * The estimate is the timeline the workout screen itself runs: every set at
 * its reps and the coached tempo, every rest the timer will show, and set-up
 * where it outlasts a rest. A plan that says 45 minutes should take 45 minutes
 * when its own guidance is followed.
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

/**
 * Seconds one rep takes at the tempo the app coaches for the set's job: 2-1-X-0
 * for strength, 3-0-1-0 for hypertrophy, 2-0-2-1 for isolation, 2-0-1-0 for ramp
 * and drop sets, and 3-1-1-0 at the heaviest weight a place has. The tempo bar
 * on the card runs at the same pace (`features/workout/tempo.ts`; a test holds
 * the two together).
 */
export const REP_SECONDS = {
  warmup: 3,
  drop: 3,
  strength: 4,
  hypertrophy: 4,
  isolation: 5,
  capped: 5,
} as const;

/** Getting into position and putting the load down again; stripping the weight before a drop set. */
export const SET_OVERHEAD_SECONDS = { strength: 10, other: 5, drop: 10 } as const;

const SUPERSET_SWITCH_SECONDS = 15;
const CIRCUIT_SWITCH_SECONDS = 12;

/** Answers whether a set has already been logged; logged sets cost no more time. */
export type SetDonePredicate = (entryId: string, setIndex: number) => boolean;

const NOTHING_DONE: SetDonePredicate = () => false;

/**
 * Lifting time for one set: the middle of its rep range at the coached tempo, plus getting set.
 * A hold's range is seconds, and it runs for today's target: the first number.
 */
export function workSecondsFor(
  entry: Pick<WorkoutEntry, 'role' | 'progression'>,
  set: Pick<SetPrescription, 'kind' | 'targetReps'>,
  hold = false,
): number {
  const reps = (set.targetReps[0] + set.targetReps[1]) / 2;
  const category = restCategory(entry.role);
  if (set.kind === 'drop') return reps * REP_SECONDS.drop + SET_OVERHEAD_SECONDS.drop;
  const overhead =
    category === 'strength' ? SET_OVERHEAD_SECONDS.strength : SET_OVERHEAD_SECONDS.other;
  if (hold) return set.targetReps[0] + overhead;
  if (set.kind === 'warmup') return reps * REP_SECONDS.warmup + overhead;
  const perRep = entry.progression?.capped ? REP_SECONDS.capped : REP_SECONDS[category];
  return reps * perRep + overhead;
}

function setupSeconds(exercise: CatalogExercise): number {
  return exercise.setupSeconds + exercise.transitionCost * 10;
}

/**
 * The whole session in seconds, read off the same set order and the same rest
 * rule the workout screen runs (`blockSequence` and `restBetween` in
 * `workout/sequence.ts`), so the two cannot disagree: every set at its reps and
 * tempo, every rest the timer will show, a switch between the members of a
 * paired round, and nothing after the final set of the day. Between two
 * exercises the timer runs the last set's full rest while the lifter walks over
 * and sets up, so that rest counts in full and the next exercise's set-up counts
 * only where it outlasts the rest.
 */
export function estimateSeconds(
  blocks: readonly WorkoutBlock[],
  exerciseOf: (id: string) => CatalogExercise,
  isDone: SetDonePredicate = NOTHING_DONE,
  /** A rest already running: it covers the walk to whatever comes next, like any other rest. */
  restRunningSeconds = 0,
): { work: number; rest: number; setup: number } {
  const blockOf = new Map(blocks.map((block) => [block.id, block]));
  const entryOf = new Map(
    blocks.flatMap((block) => block.entries.map((entry) => [entry.id, entry] as const)),
  );
  const sequence = blocks.flatMap(blockSequence);
  // Once any set of a block is logged the lifter is already at the station.
  const started = new Set(
    sequence.filter((item) => isDone(item.entryId, item.setIndex)).map((item) => item.blockId),
  );
  let work = 0;
  let rest = 0;
  let setup = 0;
  let restBefore = Math.max(0, restRunningSeconds);
  let lastBlockId: string | null = null;
  sequence.forEach((item, index) => {
    if (isDone(item.entryId, item.setIndex)) return;
    const block = blockOf.get(item.blockId);
    const entry = entryOf.get(item.entryId);
    if (!block || !entry) return;
    if (item.blockId !== lastBlockId) {
      const blockSetup = started.has(block.id)
        ? 0
        : block.entries.reduce(
            (sum, member) => sum + setupSeconds(exerciseOf(member.exerciseId)),
            0,
          );
      // The rest that led here already covered this much of the walk and the set-up.
      setup += Math.max(0, blockSetup - restBefore);
      lastBlockId = item.blockId;
    }
    work += workSecondsFor(entry, item.set, isHold(exerciseOf(entry.exerciseId)));
    const next = sequence[index + 1] ?? null;
    const more = sequence.slice(index + 1).some((later) => !isDone(later.entryId, later.setIndex));
    if (!more) return;
    if (isPairedSwitch(item, next, block)) {
      work += block.kind === 'superset' ? SUPERSET_SWITCH_SECONDS : CIRCUIT_SWITCH_SECONDS;
      restBefore = 0;
      return;
    }
    restBefore = restBetween(item, next, block);
    rest += restBefore;
  });
  return { work, rest, setup };
}

export function estimateWorkout(
  blocks: readonly WorkoutBlock[],
  generalWarmupMin: number,
  exerciseOf: (id: string) => CatalogExercise,
  isDone: SetDonePredicate = NOTHING_DONE,
): TimeBreakdown {
  const { work, rest, setup } = estimateSeconds(blocks, exerciseOf, isDone);
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

/**
 * Time still to go, for the workout screen, so that the clock and this number
 * add up to the length the plan promised. Until the first set is logged the
 * general warm-up is still ahead, less whatever the clock has already run; a
 * rest in progress counts for what is left of it, and a hold counting down for
 * what is left of it.
 */
export function remainingMinutes(input: {
  blocks: readonly WorkoutBlock[];
  exerciseOf: (id: string) => CatalogExercise;
  isDone: SetDonePredicate;
  generalWarmupMinutes: number;
  anythingLogged: boolean;
  elapsedSeconds: number;
  restSecondsLeft: number;
  /** Seconds of a hold already counted: that much of its set is behind the lifter. */
  holdSecondsDone?: number;
}): number {
  const running = Math.max(0, input.restSecondsLeft);
  const { work, rest, setup } = estimateSeconds(
    input.blocks,
    input.exerciseOf,
    input.isDone,
    running,
  );
  const warmup = input.anythingLogged
    ? 0
    : Math.max(0, input.generalWarmupMinutes * 60 - input.elapsedSeconds);
  const held = Math.max(0, input.holdSecondsDone ?? 0);
  return (Math.max(0, work - held) + rest + setup + warmup + running) / 60;
}
