import type { Illness } from '../readiness/checkIn';
import type { MuscleId } from '../../catalog/muscles/muscles';
import type { StrengthMaxes } from '../progression/maxes';
import type { DeloadWindow } from '../planning/deload';
import type { LastingSwap } from '../planning/lastingSwaps';
import type { CatchUpSpec } from '../planning/catchUp';
import type { LearnedResets } from '../learned/resets';
import type { AutoregulationPlan } from './autoregulate';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import type { LocationProfile } from '../../core/validation/location';
import type { SessionLoading } from '../loading/loading';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { DurationChoice, EmptiedPlan, GeneratedWorkout, SetKind } from '../workout/types';

/**
 * Types for the central Recalibration Engine. A typed request carries the
 * trigger, the current workout, everything already logged, what is locked,
 * the requested length, the place and its equipment, the profile, session-only
 * constraints, and a timestamp. The result is either a new valid workout with
 * a change summary, or a failure that leaves the previous workout untouched.
 */

export type RecalibrationScope = 'local' | 'partial' | 'full';

/**
 * A fast pre-workout check-in: energy, sleep and motivation 1 (worst) to 5 (best), soreness 1 (none)
 * to 5 (wrecked); and, since Maintenance 33, any illness (the gate: `ILLNESSES`).
 */
export interface Readiness {
  energy: number;
  soreness: number;
  sleep: number;
  motivation: number;
  jointDiscomfort: Joint[];
  timePressure: boolean;
  illness?: Illness;
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
      /**
       * A top set corrected after back-offs were logged (Maintenance 32, the sixth review of round
       * N): each back-off still logged, the weight it was lifted at and the step its log gave the
       * ones after it, which the correction keeps.
       */
      backOffLogs?: { setIndex: number; weight: number | null; plan: AutoregulationPlan }[];
    }
  | {
      type: 'target-weight';
      entryId: string;
      weight: number | null;
      /** A deload the coach offered: a main lift runs it on straight sets (Maintenance 32). */
      deload?: true;
    }
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
  /**
   * The first two lifts that can be judged both fell well short, or no longer do after an undo or
   * a correction (Maintenance 26, item 42): the rest of the workout takes the low check-in's
   * treatment, or loses it. `lifts` names the two that fell short.
   */
  | { type: 'bad-start'; low: boolean; lifts: string[] }
  /**
   * Lighter today on a muscle the "too soon" card names (Maintenance 33, the owner's decision 2):
   * its lifts take a set fewer above the floor and a rep more in reserve.
   */
  | { type: 'lighter'; muscle: MuscleId }
  | { type: 'end-by'; time: string | null }
  /** The full session on a day that offers a catch-up, or the catch-up again (Maintenance 31). */
  | { type: 'session-kind'; full: boolean; kind?: 'catch-up' | 'second' };

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
  /**
   * Its target was set by hand when it was logged (Maintenance 26, the review of item 42): the
   * lifter's own choice, so a hard start does not read it. Absent otherwise.
   */
  byHand?: boolean;
  /**
   * The reserve the plan asked for the lift's role when the set was logged (Maintenance 26, the
   * third pass of item 42): a hard start reads the set against it. Absent on a set logged before.
   */
  planRir?: number;
  /**
   * A reserve check (Maintenance 27, item 43): the set went on past the lifter's usual stop to a
   * rep that stalled. `reps` and `rir` stay as at the stop, so every rule reads the set as a
   * normal one; this keeps the reps in all. Absent on any other set.
   */
  reserveCheck?: ReserveCheckLog;
}

/** A reserve check's own numbers (Maintenance 27, item 43). */
export interface ReserveCheckLog {
  /** Reps in all, to the rep that stalled. */
  total: number;
  /** It stalled before the lifter's usual stop: reps to failure, no judgement to check. */
  failedEarly?: boolean;
  /** Stopped for pain or form: not a set to failure. */
  stopped?: boolean;
  /** The plan's style when it was taken: a change of style starts the learning again. */
  style?: string;
}

export interface CompletedWork {
  startedAt: string | null;
  /** Active seconds since the workout started, excluding pauses and long interruptions. */
  elapsedSeconds: number;
  currentEntryId: string | null;
  sets: CompletedSet[];
  /**
   * The general warm-up the workout started with (Maintenance 28, the review of item 4): its sets
   * are timed against it, whatever a rebuild under way leaves of it. Absent before the start, and
   * on a workout started before Maintenance 28.
   */
  warmupMinutes?: number;
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
/** A pain report made on an exercise during a workout (Maintenance 27, item 45). */
export interface PainReportLog {
  exerciseId: string;
  joint: Joint;
}

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
  /**
   * Each pain report this session and the exercise it was made on (Maintenance 27, item 45), which
   * the saved workout keeps. Absent on a session saved before.
   */
  painReports?: PainReportLog[];
  /** ISO time the session must end by, when the exact-end mode is on. */
  endBy: string | null;
  readiness: Readiness | null;
  /**
   * The day's check-in was told with a hard start in force (the second review of Maintenance 33):
   * the start's reading reads none of it, so it never takes the hard start back. Absent on a
   * session saved before, and for a check-in told before a hard start.
   */
  checkInAfterStart?: true;
  /**
   * When the day's check-in was told (the fourth review of Maintenance 33): it is the check-in of
   * that day, wherever the session was made (`checkInDayOf`). Absent on a session saved before, and
   * with no check-in, which reads the day its session was made on.
   */
  checkInAt?: string;
  /** -2 (much easier) to 2 (much harder) for the remaining work. */
  intensity: number;
  /**
   * The first two lifts today fell well short (Maintenance 26, item 42): the rest takes a low
   * check-in's treatment, never on top of one. Absent on a session saved before.
   */
  badStart?: boolean;
  /**
   * The muscles the lifter chose to go lighter on today, from the "too soon" card (Maintenance 33,
   * the owner's decision 2): their lifts take a hard start's ease, never on top of one. Absent on a
   * session saved before.
   */
  lighter?: MuscleId[];
  /** A planned deload week that covers this session, if any. */
  deload: DeloadWindow | null;
  /** A coach focus: the session leads with this muscle. */
  focus: MuscleId | null;
  /**
   * A catch-up on a day not ticked, or a second workout on a day trained (Maintenance 31, items 12
   * and 32): what the day offers, with no muscles when nothing calls for one. Absent on a session
   * saved before, and on a day that offers neither.
   */
  catchUp?: CatchUpSpec | null;
  /** The lifter took the full session on a day that offers a catch-up (Maintenance 31). */
  fullSession?: boolean;
  /**
   * The plans the lifter's own hand emptied today, each its last lift skipped or left out (the
   * seventeenth to twentieth reviews of round M): the offer it was for and its layout, the offer's
   * own or the split's own day a place with no lift for the offer put in its place. Every later plan
   * of that offer laid out the same way takes no lift: a rebuild, the way back from the full
   * session, a later plan the same day. Another offer or another layout is another plan, and leaves
   * each mark as it is; lifts back in a plan the lifter emptied end its own. Absent on a session
   * saved before, and with none; a place that empties a plan marks nothing.
   */
  emptied?: EmptiedPlan[];
  /**
   * The slots of today's catch-up or second workout whose lift the lifter's change left out with
   * nothing to come in (the seventeenth and eighteenth reviews of round M): no rebuild that keeps
   * the plan's layout puts a lift in them; a layout made again (the full session and back, a changed
   * offer, the preview made again) drops them. Absent on a session saved before.
   */
  closedSlots?: number[];
  /**
   * The lifts the lifter swapped away today (the eighteenth review of round M): no change brings
   * one back by itself, though the lifter may put one back. Absent on a session saved before.
   */
  swappedAway?: string[];
  /**
   * The day's own choices while a saved workout loaded stands in for its plan (the twenty-third
   * review of round M): its offer, the full session taken, the plans the lifter emptied. The loaded
   * plan is read as itself (its own `catchUp`, the one it was saved with, or none); every later plan
   * the same day reads these, with what the lifter chose on the loaded plan (`dayChoicesOf`).
   * Absent on any other session.
   */
  dayChoices?: {
    catchUp?: CatchUpSpec | null;
    fullSession?: boolean;
    emptied?: EmptiedPlan[];
  };
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
  /** What the lifter reset of what the app learned (Maintenance 27, item 47). */
  resets?: LearnedResets | null;
  /**
   * A save changed what the day offers (Maintenance 31): a catch-up where the split's session was,
   * or the other way. A plan not begun is built whole, as the full session taken is.
   */
  offerChanged?: boolean;
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
