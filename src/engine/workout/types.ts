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
   * The session the target was read from fell short on its first working set: under its floor, or
   * as far short of what it asked as a hard start reads (Maintenance 26, item 42): a hard start
   * does not read the lift today.
   */
  missed?: boolean;
  /** An entered max raised the target over the log's (Maintenance 26): a hard start does not read it. */
  fromMax?: boolean;
  /**
   * Read from a session at another rep range (Maintenance 26, the fourth pass of item 42): a hard
   * start does not read it.
   */
  otherRange?: boolean;
  /**
   * Read on the day a saved workout was saved, and loaded today (Maintenance 26, the third pass of
   * item 42): not today's target, so a hard start does not read it.
   */
  saved?: boolean;
  /**
   * The weight the target moved from, the last one lifted (Maintenance 23): a refit applies the
   * step rule from it, as the plan did.
   */
  from?: number;
  /**
   * Steps the target moved for the work before it today or the lifter's own habit, down when
   * negative (Maintenance 24): the coach reads a step down as a lighter day the plan chose.
   */
  nudged?: number;
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
  /**
   * A hard start's ease on this lift (Maintenance 26, item 42): the lift as the plan had it, its
   * sets and reasons before the ease, given back exactly when the ease comes off (the sixth pass).
   * `kept` once a change is made while the lift is under way (the eighth pass), or on what comes
   * in for such a lift swapped in place (the fourteenth): it keeps the ease for good, never given
   * back in the workout, its sets kept for a saved copy, which gives the plan back; on a lift begun
   * before the ease, with no sets, it is never eased.
   */
  eased?: {
    exerciseId?: string;
    sets?: SetPrescription[];
    progression?: EntryProgression;
    /**
     * The lift's own settings with those sets (the ninth pass): given back with them, so a copy
     * saved after changes on a lift under way is the lift as it was, not its sets under settings
     * made since.
     */
    settings?: EasedSettings;
    kept?: boolean;
  };
}

export interface EasedSettings {
  restSeconds: number;
  warmupSets: number;
  dropSet: boolean;
  manual?: ManualEdits;
  /** The rest between rounds of a block of its own. */
  blockRest?: number;
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
 * The rounds an entry makes in its block: its working sets, a drop set no round of its own
 * (Maintenance 26, the seventh pass of item 42: some paths counted it, and a lift with a drop set
 * showed a set more).
 */
export function roundsOf(entry: WorkoutEntry): number {
  return entry.sets.filter((set) => set.kind === 'working').length;
}

/** The rounds a paired block runs: its longest member's working sets (Maintenance 24). */
export function roundsRun(block: WorkoutBlock): number {
  return Math.max(
    0,
    ...block.entries.map((entry) => entry.sets.filter((set) => set.kind === 'working').length),
  );
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
 * A lift that took a hard start's ease and had a change made while it was under way, or came in for
 * one swapped in place: it keeps the ease for good, and what it has, through new weights, a
 * check-in or a max, its sets undone or not (Maintenance 26, the ninth to fifteenth passes of item
 * 42). A mark with no sets, on a lift under way before the ease
 * or beside one, is no ease kept: such a lift takes those as any lift does.
 */
export function keepsTheEase(entry: WorkoutEntry): boolean {
  return entry.eased?.kept === true && entry.eased.sets !== undefined;
}

/**
 * A workout as it shows, with no hard start's marks on it (Maintenance 26, the sixth pass of item
 * 42): a saved copy is a plain snapshot, and the ease of the day it was saved is no part of it.
 */
export function withoutEase(workout: GeneratedWorkout): GeneratedWorkout {
  if (!allEntries(workout.blocks).some((entry) => entry.eased)) return workout;
  return {
    ...workout,
    blocks: workout.blocks.map((block) => ({
      ...block,
      entries: block.entries.map((entry) => {
        if (!entry.eased) return entry;
        const plain = { ...entry };
        delete plain.eased;
        return plain;
      }),
    })),
  };
}

/**
 * A saved workout's targets, marked as read on the day it was saved (Maintenance 26, the third
 * pass of item 42): a hard start does not read them as today's.
 */
export function asSaved(workout: GeneratedWorkout): GeneratedWorkout {
  const plain = withoutEase(workout);
  return {
    ...plain,
    blocks: plain.blocks.map((block) => ({
      ...block,
      entries: block.entries.map((entry) =>
        entry.progression
          ? { ...entry, progression: { ...entry.progression, saved: true } }
          : entry,
      ),
    })),
  };
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
