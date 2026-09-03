import { z } from 'zod';
import { getExercise } from '../../catalog/exercises/catalog';
import { JOINTS } from '../../catalog/exercises/exerciseSchema';
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

/**
 * The workout session: today's generated workout plus everything that is true
 * only for this session (length choice, busy stations, reported pain, skips,
 * pins, accepted alternatives, logged work) and the recalibration trail.
 * It lives in localStorage so a reload mid-session changes nothing; a new day,
 * an edited profile, or new history starts a fresh one.
 */

export const SESSION_KEY = 'wc.v1.session';
export const CALIBRATION_LOG_LIMIT = 8;

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

export interface WorkoutSession {
  id: string;
  /** Fingerprint of the inputs the workout was generated from. */
  baseKey: string;
  createdAt: string;
  duration: DurationChoice;
  workout: GeneratedWorkout;
  /** Length of the complete Default session, shown in the dropdown's Default option. */
  defaultEstimatedMinutes: number;
  constraints: SessionConstraints;
  completed: CompletedWork;
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

const SessionSchema = z.looseObject({
  id: z.string().min(1),
  baseKey: z.string().min(1),
  createdAt: z.iso.datetime(),
  duration: DurationChoiceSchema,
  workout: GeneratedWorkoutSchema,
  defaultEstimatedMinutes: z.number().min(0),
  constraints: ConstraintsSchema,
  completed: CompletedSchema,
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
    duration: workout.duration.choice,
    workout,
    defaultEstimatedMinutes: workout.duration.estimatedMinutes,
    constraints: emptyConstraints(),
    completed: emptyCompleted(),
    lastSummary: null,
    lastChanges: [],
    previous: null,
    log: [],
  };
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
