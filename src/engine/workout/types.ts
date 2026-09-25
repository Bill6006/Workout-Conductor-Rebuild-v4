import type { CatalogExercise, TrainingRole } from '../../catalog/exercises/exerciseSchema';
import type { MuscleId } from '../../catalog/muscles/muscles';

/**
 * The generated workout data model. One block per list row: a straight block
 * holds one exercise, a superset block holds exactly two moves, a circuit
 * block holds three or more. Every set carries its own kind so warm-up and
 * drop sets are never confused with working sets.
 */

export type DurationChoice = 15 | 30 | 45 | 'default';

export type SetKind = 'warmup' | 'working' | 'drop';

/**
 * Every way the progression engine arrives at a target, as one list. The
 * stored-session reader validates against this same list, so the two can never
 * drift apart again: when they did, a workout in progress whose targets came
 * from 'return' or 'estimate' could not be read back after the app reopened,
 * and was replaced by a fresh one (Maintenance 17).
 */
export const PROGRESSION_MODES = [
  'start',
  'double',
  'weight',
  'reps',
  'sets',
  'maintain',
  'deload',
  'regress',
  // Back after three weeks or more: a percentage of the estimated max.
  'return',
  // A new variation, or a rep range the lift has not been run at lately: a share of an estimated max.
  'estimate',
] as const;

export type ProgressionMode = (typeof PROGRESSION_MODES)[number];

/** Why an entry's loads and reps are what they are, from the progression engine. */
export interface EntryProgression {
  mode: ProgressionMode;
  evidence: string[];
  sessions: number;
  viaFamily: boolean;
  confidence: 'low' | 'medium' | 'high';
  /** 1 when an extra set is worth offering; never applied automatically. */
  setsAdvice: 0 | 1;
  /** Set when the load is held at the heaviest weight the place has and the reps pushed instead. */
  capped?: { at: number };
  /** Set when the weights here could not make the load asked for: what they make, and the line by the target. */
  rack?: RackNote;
  /** A lift done at bodyweight fell short of its floor this many sessions running (Maintenance 21). */
  short?: ShortRun;
  /**
   * The weight the target moved from, the last one lifted (Maintenance 23): a refit applies the
   * step rule from it, as the plan did.
   */
  from?: number;
}

/** Sessions in a row a lift done at bodyweight ended under the bottom of its range, and that floor. */
export interface ShortRun {
  sessions: number;
  floor: number;
}

/** Weights that changed a target: the load asked for, the one loaded, the reps added, and why. */
export interface RackNote {
  asked: number;
  loaded: number;
  /** Reps added to each end of the range to keep the effort. */
  extra: number;
  /** The line by the target, for example "No 2.5s today: 95 instead of 100, two extra reps." */
  line: string;
}

/** Values the user set by hand this session; the engines never override them. */
export interface ManualEdits {
  weight?: boolean;
  reps?: boolean;
  sets?: boolean;
  rest?: boolean;
}

export interface SetPrescription {
  index: number;
  kind: SetKind;
  targetReps: [number, number];
  targetRir: number;
  /** Load targets arrive with the progression engine (Phase 6). */
  targetWeight: number | null;
  restSeconds: number;
  /**
   * The weights at the place made less than the plan asked, so this set is lighter with more
   * reps: the load and range it stands in for (Maintenance 23). Absent on any other set.
   */
  asked?: { weight: number; reps: [number, number] };
}

export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  role: TrainingRole;
  sets: SetPrescription[];
  restSeconds: number;
  warmupSets: number;
  dropSet: boolean;
  /** Muscle priority this entry was chosen for. */
  chosenFor: MuscleId[];
  locked: boolean;
  pinned: boolean;
  /** Template slot this entry fills; kept entries return to the same slot when the rest is rebuilt. */
  slot?: number;
  /** Catalog id this entry replaced, when the user or the engine swapped it this session. */
  replacedFrom?: string;
  /**
   * The plan's own pick this entry stands in for, when a kept swap put it here: the swap's
   * exercise, or the next best when that one could not join (Maintenance 22). It stays when the
   * lifter swaps the entry today, which `replacedFrom` then says.
   */
  standsFor?: string;
  progression?: EntryProgression;
  manual?: ManualEdits;
  /**
   * Stopped at its logged sets, because a place could not equip it or it was swapped out once
   * started: the working sets it still owed then, which a stand-in carries through every later
   * rebuild.
   */
  stopped?: StoppedWork;
}

export interface StoppedWork {
  owed: number;
  /**
   * Why it stopped: `place`, the place could not equip it (it picks up again where it fits);
   * `swap`, it was swapped out once started (it stays stopped unless swapped back); `skip`, the
   * exercise carrying its sets was skipped, so it owes nothing more. An entry with no reason
   * written stopped at a place.
   */
  why?: 'place' | 'swap' | 'skip';
}

export type BlockKind = 'straight' | 'superset' | 'circuit';

export interface WorkoutBlock {
  id: string;
  kind: BlockKind;
  /** One readable canonical list row, for example "A1 Cable Fly + A2 Lateral Raise". */
  label: string;
  entries: WorkoutEntry[];
  rounds: number;
  restBetweenRoundsSeconds: number;
}

export interface MusclePriority {
  muscle: MuscleId;
  weight: number;
  reason: string;
  weeklySetsDone: number;
  weeklyTarget: number;
  daysSinceTrained: number | null;
}

export interface WarmupPlan {
  generalMinutes: number;
  rampEntryIds: string[];
  note: string;
}

export interface TimeBreakdown {
  warmupMinutes: number;
  workMinutes: number;
  restMinutes: number;
  transitionMinutes: number;
  totalMinutes: number;
}

export interface WorkoutExplanation {
  summary: string;
  reasons: string[];
  fittingSteps: string[];
  time: TimeBreakdown;
}

export interface GeneratedWorkout {
  id: string;
  templateId: string;
  title: string;
  goal: string;
  generatedAt: string;
  locationId: string | null;
  duration: {
    choice: DurationChoice;
    targetMinutes: number;
    defaultMinutes: number;
    estimatedMinutes: number;
    overByMinutes: number;
  };
  musclePriorities: MusclePriority[];
  blocks: WorkoutBlock[];
  warmup: WarmupPlan;
  explanation: WorkoutExplanation;
  confidence: 'high' | 'medium' | 'low';
  compromises: string[];
  recalibration: { version: number; lastTrigger: string | null };
}

export interface ResolvedEntry {
  entry: WorkoutEntry;
  exercise: CatalogExercise;
}

export function allEntries(blocks: readonly WorkoutBlock[]): WorkoutEntry[] {
  return blocks.flatMap((block) => block.entries);
}

export function workingSets(entry: WorkoutEntry): SetPrescription[] {
  return entry.sets.filter((set) => set.kind !== 'warmup');
}

/**
 * An entry ended at its logged sets: its place could not equip it, or it was swapped out once
 * started. One ended by a copy of the app that wrote no count (Maintenance 19 to 21) is known
 * by having no working set left: every other entry keeps at least one.
 */
export function isStopped(entry: WorkoutEntry): boolean {
  return entry.stopped !== undefined || !entry.sets.some((set) => set.kind === 'working');
}

/**
 * The exercise the plan itself picked for this entry's place, before any swap: followed back
 * through the exercise it replaced today or stands in for by a kept swap, and the stopped ones
 * of its slot they took over from.
 */
export function planOwnExercise(blocks: readonly WorkoutBlock[], entry: WorkoutEntry): string {
  const entries = allEntries(blocks);
  const seen = new Set([entry.exerciseId]);
  let own = entry.standsFor ?? entry.replacedFrom ?? entry.exerciseId;
  while (!seen.has(own)) {
    seen.add(own);
    const earlier = entries.find(
      (candidate) =>
        candidate.exerciseId === own &&
        isStopped(candidate) &&
        (entry.slot === undefined || candidate.slot === undefined || candidate.slot === entry.slot),
    );
    const before = earlier?.standsFor ?? earlier?.replacedFrom;
    if (before === undefined) break;
    own = before;
  }
  return own;
}

/**
 * A saved workout made fresh to do again (Maintenance 22): each exercise stopped on the day it
 * was saved leaves, and the exercise that took over its sets in a row of its own does them all
 * again, as the plan had them.
 */
export function withoutStops(workout: GeneratedWorkout): GeneratedWorkout {
  if (!allEntries(workout.blocks).some(isStopped)) return workout;
  const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
  const blocks = workout.blocks.flatMap((block): WorkoutBlock[] => {
    const live = block.entries.filter((entry) => !isStopped(entry));
    if (live.length === 0) return [];
    if (block.kind !== 'straight' || live.length !== 1) return [{ ...block, entries: live }];
    const entry = live[0] as WorkoutEntry;
    const carried = stoppedBefore(workout.blocks, entry).reduce(
      (sum, stopped) => sum + working(stopped).length,
      0,
    );
    const last = working(entry).at(-1);
    if (carried === 0 || !last) return [block];
    let index = Math.max(...entry.sets.map((set) => set.index)) + 1;
    const extra = Array.from({ length: carried }, () => ({ ...last, index: index++ }));
    const at = entry.sets.indexOf(last) + 1;
    const sets = [...entry.sets.slice(0, at), ...extra, ...entry.sets.slice(at)];
    return [{ ...block, entries: [{ ...entry, sets }], rounds: working(entry).length + carried }];
  });
  return { ...workout, blocks };
}

/**
 * The stopped entries a stand-in took over from (Maintenance 22): one in its own slot, or, for
 * an entry with no slot, the exercise it replaced. The swap sheet offers them back, and swapping
 * to one picks it up again. Never one of another slot, whose work would move onto it.
 */
export function stoppedBefore(
  blocks: readonly WorkoutBlock[],
  entry: WorkoutEntry,
): WorkoutEntry[] {
  return allEntries(blocks).filter(
    (candidate) =>
      candidate !== entry &&
      candidate.exerciseId !== entry.exerciseId &&
      isStopped(candidate) &&
      (entry.slot !== undefined && candidate.slot !== undefined
        ? candidate.slot === entry.slot
        : candidate.exerciseId === entry.replacedFrom),
  );
}
