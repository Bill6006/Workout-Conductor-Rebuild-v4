import type { Joint } from '../../catalog/exercises/exerciseSchema';
import type { LocationProfile } from '../../core/validation/location';
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
  | { type: 'equipment' }
  | { type: 'equipment-busy'; entryId: string }
  | { type: 'replace'; entryId: string; exerciseId: string }
  | { type: 'skip'; entryId: string }
  | { type: 'pain'; entryId: string; joint: Joint }
  | { type: 'uncomfortable'; entryId: string }
  | { type: 'pin'; entryId: string; pinned: boolean }
  | { type: 'performance'; entryId: string; setIndex: number; actualReps: number }
  | { type: 'target-weight'; entryId: string; weight: number | null }
  | { type: 'sets'; entryId: string; workingDelta: -1 | 1 }
  | { type: 'add-warmup'; entryId: string }
  | { type: 'rep-range'; entryId: string; reps: [number, number] }
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

/** Session-only constraints. None of these touch the saved profile or place. */
export interface SessionConstraints {
  /** Equipment ids reported busy this session. */
  busyEquipment: string[];
  /** Catalog ids skipped, reported painful, or marked uncomfortable this session. */
  avoidExerciseIds: string[];
  /** Joints reported painful this session, on top of the profile's pain areas. */
  painJoints: Joint[];
  /** ISO time the session must end by, when the exact-end mode is on. */
  endBy: string | null;
  readiness: Readiness | null;
  /** -2 (much easier) to 2 (much harder) for the remaining work. */
  intensity: number;
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
  history: readonly WorkoutRecord[];
  constraints: SessionConstraints;
  reason: string;
  timestamp: string;
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
