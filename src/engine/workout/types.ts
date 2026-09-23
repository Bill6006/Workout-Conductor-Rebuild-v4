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
  progression?: EntryProgression;
  manual?: ManualEdits;
  /**
   * Stopped at its logged sets because a place could not equip it: the working sets it still
   * owed then, which a stand-in in its slot carries through every later rebuild.
   */
  stopped?: StoppedWork;
}

export interface StoppedWork {
  owed: number;
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
