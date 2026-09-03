import { z } from 'zod';
import { getExercise } from '../../catalog/exercises/catalog';
import { JOINTS } from '../../catalog/exercises/exerciseSchema';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';
import { emptyCompleted, emptyConstraints } from '../../engine/recalibration/recalibrate';
import type {
  ChangeSummary,
  CompletedWork,
  EntryChange,
  RecalibrationScope,
  SessionConstraints,
} from '../../engine/recalibration/types';
import { allEntries, type DurationChoice, type GeneratedWorkout } from '../../engine/workout/types';
import { GeneratedWorkoutSchema } from '../../engine/workout/workoutSchema';
import { readJson, removeKey, writeJson, type KeyValueStorage } from '../storage/localSettings';
import type { LocationProfile } from '../validation/location';
import type { UserProfile } from '../validation/profile';
import { SessionRatingSchema, type SessionRating } from '../validation/workoutRecord';

/**
 * The workout session: today's generated workout plus everything that is true
 * only for this session (length choice, busy stations, reported pain, skips,
 * pins, accepted alternatives, logged work, rest timer, pause state) and the
 * recalibration trail. It lives in localStorage so a reload mid-workout
 * changes nothing; a new day, an edited profile, or new history starts fresh,
 * except that an active or completed workout is never replaced underneath the
 * user.
 */

export const SESSION_KEY = 'wc.v1.session';
export const CALIBRATION_LOG_LIMIT = 8;

export type SessionStatus = 'preview' | 'active' | 'paused' | 'completed';

export interface CalibrationLogEntry {
  at: string;
  trigger: string;
  label: string;
  scope: RecalibrationScope;
  headline: string;
  durationMs: number;
}

/** What "Undo" restores: the workout and the session constraints as they were. */
export interface SessionSnapshot {
  workout: GeneratedWorkout;
  constraints: SessionConstraints;
  duration: DurationChoice;
}

export interface RestState {
  entryId: string;
  setIndex: number;
  /** Programmed rest, including quick adjustments. */
  seconds: number;
  startedAt: string;
  endsAt: string;
  /** Remaining seconds frozen while the workout is paused. */
  pausedRemaining: number | null;
  nextLabel: string;
}

export interface SetDraft {
  weight: number | null;
  reps: number | null;
  rir: number | null;
}

export interface CompletionSummary {
  recordId: string;
  completedAt: string;
  elapsedSeconds: number;
  plannedMinutes: number;
  exercisesCompleted: number;
  exercisesPlanned: number;
  setsCompleted: number;
  setsPlanned: number;
  warmupSets: number;
  /** Working-set volume in the profile's units. */
  volume: number;
  muscles: string[];
  skipped: string[];
  substitutions: string[];
  highlights: string[];
  endedEarly: boolean;
  nextImplication: string;
}

export interface WorkoutSession {
  id: string;
  /** Fingerprint of the inputs the workout was generated from. */
  baseKey: string;
  createdAt: string;
  status: SessionStatus;
  duration: DurationChoice;
  workout: GeneratedWorkout;
  /** Length of the complete Default session, shown in the dropdown's Default option. */
  defaultEstimatedMinutes: number;
  constraints: SessionConstraints;
  completed: CompletedWork;
  /** When the current active stretch began; null while paused or before start. */
  activeSince: string | null;
  pausedAt: string | null;
  rest: RestState | null;
  /** Per-exercise entry values the logger remembers between sets. */
  drafts: Record<string, SetDraft>;
  rating: SessionRating | null;
  completion: CompletionSummary | null;
  lastSummary: ChangeSummary | null;
  lastChanges: EntryChange[];
  previous: SessionSnapshot | null;
  log: CalibrationLogEntry[];
}

export type CalibrationStatus = 'idle' | 'running' | 'error';

export interface CalibrationState {
  status: CalibrationStatus;
  title: string;
  label: string;
  evaluating: string[];
  error: string | null;
}

export const IDLE_CALIBRATION: CalibrationState = {
  status: 'idle',
  title: '',
  label: '',
  evaluating: [],
  error: null,
};

const DurationChoiceSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal('default'),
]);

const ReadinessSchema = z.looseObject({
  energy: z.number().min(1).max(5),
  soreness: z.number().min(1).max(5),
  sleep: z.number().min(1).max(5),
  motivation: z.number().min(1).max(5),
  jointDiscomfort: z.array(z.enum(JOINTS)),
  timePressure: z.boolean(),
});

const ConstraintsSchema = z.looseObject({
  busyEquipment: z.array(z.string()),
  avoidExerciseIds: z.array(z.string()),
  painJoints: z.array(z.enum(JOINTS)),
  endBy: z.iso.datetime().nullable(),
  readiness: ReadinessSchema.nullable(),
  intensity: z.number().int().min(-2).max(2),
});

const CompletedSchema = z.looseObject({
  startedAt: z.iso.datetime().nullable(),
  elapsedSeconds: z.number().min(0),
  currentEntryId: z.string().nullable(),
  sets: z.array(
    z.looseObject({
      entryId: z.string().min(1),
      exerciseId: z.string().min(1),
      setIndex: z.number().int().min(0),
      kind: z.enum(['warmup', 'working', 'drop']),
      reps: z.number().int().min(0),
      weight: z.number().min(0).nullable(),
      rir: z.number().min(0).max(10).nullable(),
      completedAt: z.iso.datetime(),
      skipped: z.boolean().optional(),
    }),
  ),
});

const SummarySchema = z.looseObject({
  headline: z.string(),
  details: z.array(z.string()),
  counts: z.looseObject({
    added: z.number(),
    removed: z.number(),
    replaced: z.number(),
    adjusted: z.number(),
    supersetsAdded: z.number(),
    supersetsRemoved: z.number(),
    setsTrimmed: z.number(),
  }),
});

const ChangeSchema = z.looseObject({
  entryId: z.string(),
  kind: z.enum(['added', 'removed', 'replaced', 'adjusted']),
  exerciseId: z.string(),
  previousExerciseId: z.string().optional(),
  detail: z.string(),
});

const RestSchema = z.looseObject({
  entryId: z.string(),
  setIndex: z.number().int().min(0),
  seconds: z.number().min(0),
  startedAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  pausedRemaining: z.number().nullable(),
  nextLabel: z.string(),
});

const DraftSchema = z.looseObject({
  weight: z.number().min(0).nullable(),
  reps: z.number().int().min(0).nullable(),
  rir: z.number().min(0).max(10).nullable(),
});

const CompletionSchema = z.looseObject({
  recordId: z.string(),
  completedAt: z.iso.datetime(),
  elapsedSeconds: z.number().min(0),
  plannedMinutes: z.number().min(0),
  exercisesCompleted: z.number().int().min(0),
  exercisesPlanned: z.number().int().min(0),
  setsCompleted: z.number().int().min(0),
  setsPlanned: z.number().int().min(0),
  warmupSets: z.number().int().min(0),
  volume: z.number().min(0),
  muscles: z.array(z.enum(MUSCLE_IDS)),
  skipped: z.array(z.string()),
  substitutions: z.array(z.string()),
  highlights: z.array(z.string()),
  endedEarly: z.boolean(),
  nextImplication: z.string(),
});

const SessionSchema = z.looseObject({
  id: z.string().min(1),
  baseKey: z.string().min(1),
  createdAt: z.iso.datetime(),
  status: z.enum(['preview', 'active', 'paused', 'completed']).default('preview'),
  duration: DurationChoiceSchema,
  workout: GeneratedWorkoutSchema,
  defaultEstimatedMinutes: z.number().min(0),
  constraints: ConstraintsSchema,
  completed: CompletedSchema,
  activeSince: z.iso.datetime().nullable().default(null),
  pausedAt: z.iso.datetime().nullable().default(null),
  rest: RestSchema.nullable().default(null),
  drafts: z.record(z.string(), DraftSchema).default({}),
  rating: SessionRatingSchema.nullable().default(null),
  completion: CompletionSchema.nullable().default(null),
  lastSummary: SummarySchema.nullable(),
  lastChanges: z.array(ChangeSchema),
  previous: z
    .looseObject({
      workout: GeneratedWorkoutSchema,
      constraints: ConstraintsSchema,
      duration: DurationChoiceSchema,
    })
    .nullable(),
  log: z.array(
    z.looseObject({
      at: z.iso.datetime(),
      trigger: z.string(),
      label: z.string(),
      scope: z.enum(['local', 'partial', 'full']),
      headline: z.string(),
      durationMs: z.number(),
    }),
  ),
});

export function computeBaseKey(
  day: string,
  profile: UserProfile,
  location: LocationProfile | undefined,
  historyLength: number,
): string {
  return `${day}|${profile.updatedAt}|${location?.id ?? ''}:${location?.updatedAt ?? ''}|${historyLength}`;
}

export function createSession(
  baseKey: string,
  workout: GeneratedWorkout,
  now: string,
): WorkoutSession {
  return {
    id: `session-${now.replace(/\D/g, '').slice(0, 14)}`,
    baseKey,
    createdAt: now,
    status: 'preview',
    duration: workout.duration.choice,
    workout,
    defaultEstimatedMinutes: workout.duration.estimatedMinutes,
    constraints: emptyConstraints(),
    completed: emptyCompleted(),
    activeSince: null,
    pausedAt: null,
    rest: null,
    drafts: {},
    rating: null,
    completion: null,
    lastSummary: null,
    lastChanges: [],
    previous: null,
    log: [],
  };
}

/** Active seconds so far, counting the current active stretch up to `nowMs`. */
export function elapsedSeconds(session: WorkoutSession, nowMs: number): number {
  const running =
    session.status === 'active' && session.activeSince
      ? Math.max(0, (nowMs - Date.parse(session.activeSince)) / 1000)
      : 0;
  return Math.round(session.completed.elapsedSeconds + running);
}

export function doneKeys(completed: CompletedWork): Set<string> {
  return new Set(completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
}

function everyExerciseKnown(workout: GeneratedWorkout): boolean {
  return allEntries(workout.blocks).every((entry) => getExercise(entry.exerciseId) !== undefined);
}

/** The persisted session, or null when there is none or it cannot be trusted. */
export function readSession(storage: KeyValueStorage): WorkoutSession | null {
  const parsed = readJson(SESSION_KEY, SessionSchema, storage);
  if (!parsed) return null;
  const session = parsed as unknown as WorkoutSession;
  if (!everyExerciseKnown(session.workout)) return null;
  if (session.previous && !everyExerciseKnown(session.previous.workout)) return null;
  return session;
}

export function writeSession(session: WorkoutSession, storage: KeyValueStorage): void {
  writeJson(SESSION_KEY, session, storage);
}

export function clearSession(storage: KeyValueStorage): void {
  removeKey(SESSION_KEY, storage);
}
