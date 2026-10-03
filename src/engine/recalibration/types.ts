import type { MuscleId } from '../../catalog/muscles/muscles';
import type { StrengthMaxes } from '../progression/maxes';
import type { DeloadWindow } from '../planning/deload';
import type { LastingSwap } from '../planning/lastingSwaps';
import type { AutoregulationPlan } from './autoregulate';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import type { LocationProfile } from '../../core/validation/location';
import type { SessionLoading } from '../loading/loading';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { DurationChoice, GeneratedWorkout, SetKind } from '../workout/types';

/**
 * Types for the central Recalibration Engine. A typed request carries the
 * trigger, the current workout, everything already logged, what is locked,
 * the requested length, the place and its equipment, the profile, session-only
 * constraints, and a timestamp. The result is either a new valid workout with
 * a change summary, or a failure that leaves the previous workout untouched.
 */

export type RecalibrationScope = 'local' | 'partial' | 'full';

/** A fast pre-workout check-in; every value is 1 (worst) to 5 (best). */
export interface Readiness {
  energy: number;
  soreness: number;
  sleep: number;
  motivation: number;
  jointDiscomfort: Joint[];
  timePressure: boolean;
}

export type RecalibrationTrigger =
  | { type: 'duration'; choice: DurationChoice }
  | { type: 'location' }
  /** The place's available weights changed, or a plate is missing today: loads re-fit, nothing else moves. */
  | { type: 'loading' }
  | { type: 'equipment' }
  | { type: 'equipment-busy'; entryId: string }
  | { type: 'replace'; entryId: string; exerciseId: string }
  | { type: 'skip'; entryId: string }
  | { type: 'pain'; entryId: string; joint: Joint }
  | { type: 'uncomfortable'; entryId: string }
  | { type: 'pin'; entryId: string; pinned: boolean }
  | {
      type: 'performance';
      entryId: string;
      setIndex: number;
      actualReps: number;
      actualWeight?: number | null;
      /** In-session autoregulation decision; without it only reps far from target move the rep targets. */
      plan?: AutoregulationPlan;
    }
  | { type: 'target-weight'; entryId: string; weight: number | null }
  /** A max was entered for a lift: its unlogged sets take their first target from it. */
  | { type: 'max'; exerciseId: string }
  /** The coach's coverage action: a few sets of an accessory for a muscle with nothing today. */
  | { type: 'add-exercise'; exerciseId: string; muscle: MuscleId; sets: number }
  | { type: 'sets'; entryId: string; workingDelta: -1 | 1 }
  | { type: 'add-warmup'; entryId: string }
  | {
      type: 'rep-range';
      entryId: string;
      reps: [number, number];
      /** Fewer reps over more sets: one more working set at the new range (Maintenance 21). */
      workingDelta?: 1;
    }
  | { type: 'reorder'; entryId: string; direction: 'up' | 'down' }
  | { type: 'split-superset'; blockId: string }
  | { type: 'drop-set'; entryId: string; on: boolean }
  | { type: 'rest-adjust'; entryId: string; deltaSeconds: number }
  | { type: 'technique'; technique: 'supersets' | 'dropSets' | 'circuits' }
  | { type: 'profile' }
  | { type: 'readiness'; readiness: Readiness }
  | { type: 'resume'; awaySeconds: number }
  | { type: 'finish-early' }
  | { type: 'intensity'; direction: 'harder' | 'easier' }
  | { type: 'end-by'; time: string | null };

export type TriggerType = RecalibrationTrigger['type'];

/** One logged set. Logged work is never changed by any recalibration. */
export interface CompletedSet {
  entryId: string;
  exerciseId: string;
  setIndex: number;
  kind: SetKind;
  reps: number;
  weight: number | null;
  rir: number | null;
  completedAt: string;
  /** A skipped set is done for planning but carries no work. */
  skipped?: boolean;
}

export interface CompletedWork {
  startedAt: string | null;
  /** Active seconds since the workout started, excluding pauses and long interruptions. */
  elapsedSeconds: number;
  currentEntryId: string | null;
  sets: CompletedSet[];
}

/**
 * A lift moved later because its equipment was busy (Maintenance 25): it stays behind the lifts
 * it gave way to through any rebuild today. Catalog ids, since a rebuild can give a row a new id.
 */
export interface Postponed {
  exerciseId: string;
  /** The lifts of the row it moved behind, with any each was swapped from or to today. */
  after: string[];
  /** What the moved lift was before a swap today: a rebuild may bring it back (Maintenance 25). */
  was?: string[];
}

/** Session-only constraints. None of these touch the saved profile or place. */
export interface SessionConstraints {
  /**
   * Equipment marked busy by the app before Maintenance 25, which took every lift needing it out
   * of the plan. Nothing sets or reads it now: Equipment busy moves the lift later instead. It
   * stays so a session saved before still reads, and so older copies of the app read this one.
   */
  busyEquipment: string[];
  /** Lifts moved later today for busy equipment, in the order they moved (Maintenance 25). */
  postponed: Postponed[];
  /** Catalog ids skipped, reported painful, or marked uncomfortable this session. */
  avoidExerciseIds: string[];
  /** Joints reported painful this session, on top of the profile's pain areas. */
  painJoints: Joint[];
  /** ISO time the session must end by, when the exact-end mode is on. */
  endBy: string | null;
  readiness: Readiness | null;
  /** -2 (much easier) to 2 (much harder) for the remaining work. */
  intensity: number;
  /** A planned deload week that covers this session, if any. */
  deload: DeloadWindow | null;
  /** A coach focus: the session leads with this muscle. */
  focus: MuscleId | null;
}

export interface RecalibrationRequest {
  trigger: RecalibrationTrigger;
  workout: GeneratedWorkout;
  completed: CompletedWork;
  /** Entries the caller locks on top of pinned ones and logged work. */
  lockedEntryIds: readonly string[];
  currentEntryId: string | null;
  duration: DurationChoice;
  profile: UserProfile;
  location: LocationProfile | undefined;
  /** Session-only loading exceptions, for example a plate missing today. */
  loading?: SessionLoading;
  history: readonly WorkoutRecord[];
  constraints: SessionConstraints;
  reason: string;
  timestamp: string;
  /** Maxes the lifter entered by hand, for lifts without their own history. */
  maxes?: StrengthMaxes | null;
  /** The lifter's lasting swaps, which a rebuild honours wherever the exercise swapped in fits. */
  swaps?: readonly LastingSwap[];
}

export type ChangeKind = 'added' | 'removed' | 'replaced' | 'adjusted';

export interface EntryChange {
  entryId: string;
  kind: ChangeKind;
  exerciseId: string;
  previousExerciseId?: string;
  detail: string;
}

export interface ChangeCounts {
  added: number;
  removed: number;
  replaced: number;
  adjusted: number;
  supersetsAdded: number;
  supersetsRemoved: number;
  setsTrimmed: number;
}

export interface ChangeSummary {
  /** One compact line, for example "Recalibrated to 30 min: 2 exercises removed, 1 superset added." */
  headline: string;
  details: string[];
  counts: ChangeCounts;
}

/** What held a target a max moved (Maintenance 25): the weights here, reps set by hand, or a deload week. */
export type MaxHeldBy = 'weights' | 'hand' | 'deload';

/**
 * What a max entered for a lift did to today's plan (Maintenance 25), so the max sheet's preview
 * and the summary after the save say the same: a first target set from it; the target moved, its
 * weight, reps or reserve; the target held where it was (by the weights here, reps set by hand, or
 * a deload week's lighter loads), though the max asks for more; the target lighter today to win
 * back missed reps, which a max does not change; the target kept as it was, the logged sets already
 * saying as much; or nothing moved today, the lift's weight being set by hand, a set of it logged,
 * or the lift under way.
 */
export type MaxOutcome =
  'first' | 'moved' | 'held' | 'eased' | 'kept' | 'by-hand' | 'logged' | 'under-way';

export interface RecalibrationSuccess {
  ok: true;
  scope: RecalibrationScope;
  workout: GeneratedWorkout;
  /** The length in force after this recalibration. */
  duration: DurationChoice;
  constraints: SessionConstraints;
  changes: EntryChange[];
  summary: ChangeSummary;
  /** What the engine evaluated, for the calibration overlay. */
  evaluated: string[];
  durationMs: number;
  /** A max entered: what it did to the lift today (Maintenance 25). */
  max?: MaxOutcome;
  /** With `max` 'held': what held the target. */
  maxHeldBy?: MaxHeldBy;
}

export interface RecalibrationFailure {
  ok: false;
  scope: RecalibrationScope;
  error: string;
  /** The previous, still valid workout. */
  workout: GeneratedWorkout;
  durationMs: number;
}

export type RecalibrationResult = RecalibrationSuccess | RecalibrationFailure;
