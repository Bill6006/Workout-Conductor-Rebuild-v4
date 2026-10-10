import {
  allExercises,
  getExercise,
  registerCustomExercises,
  requireExercise,
} from '../../catalog/exercises/catalog';
import { isHold } from '../../catalog/exercises/exerciseSchema';
import { holdById } from '../../engine/workout/setText';
import type { MuscleId } from '../../catalog/muscles/muscles';
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns';
import { resolveTargetMinutes } from '../../engine/duration/duration';
import { autoregulate, outcomeFor } from '../../engine/recalibration/autoregulate';
import { readStart, startKey, type StartReading } from '../../engine/recalibration/badStart';
import { dropSetWeight, pendingDropSet, withDropWeight } from '../../engine/recalibration/dropSet';
import {
  LoadingSpecSchema,
  fitWeight,
  loadingFor,
  type LoadingSpec,
} from '../../engine/loading/loading';
import {
  clearSyncError,
  inspectCloud,
  noteDatabaseBirth,
  pendingCount,
  readDatabaseBirth,
  readCloudState,
  resetCloudState,
  restartPull,
  saveCloudUrl,
  seedOutbox,
  syncOnce,
  withinBound,
  type SyncOutcome,
} from '../cloud/cloudSync';
import { deviceLabel, ensureDeviceId } from '../cloud/deviceId';
import {
  TOKEN_LOG_KEY,
  TOKEN_MARK_KEY,
  TOKEN_MIRROR_KEY,
  URL_MIRROR_KEY,
  clearToken,
  liveNotice,
  readTokenLog,
  resolveCloudUrl,
  resolveToken,
  saveToken,
  type TokenEvent,
} from '../cloud/tokenVault';
import {
  BARCODE_MIRROR_KEY,
  MIRROR_PICTURE_MAX,
  dropFromMirror,
  keepInMirror,
  mirrorCopyOf,
  readBarcodeMirror,
  type MirrorCopy,
  type MirrorPicture,
} from './barcodeMirror';
import { SetupInterruptedError, setupBase } from './setupBase';
import { createLibsqlCloudClient } from '../cloud/libsqlClient';
import {
  DEFAULT_CLOUD_URL,
  PULL_INTERVAL_MS,
  looksLikeLibsqlUrl,
  type CloudClient,
} from '../cloud/model';
import {
  STRENGTH_MAXES_ID,
  emptyMaxes,
  enteredE1rm,
  parseStrengthMaxes,
  recordMax,
  snoozeMaxPrompt,
  type MaxInput,
  type StrengthMaxes,
} from '../../engine/progression/maxes';
import { loggedLoad } from '../../engine/progression/startingLoad';
import {
  planUnderTheEase,
  recalibrate as runRecalibration,
} from '../../engine/recalibration/recalibrate';
import { describeTrigger, type TriggerContext } from '../../engine/recalibration/triggers';
import type {
  CompletedSet,
  MaxHeldBy,
  MaxOutcome,
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationTrigger,
} from '../../engine/recalibration/types';
import {
  currentPosition,
  restAfter,
  workoutSequence,
  type SetPosition,
} from '../../engine/workout/sequence';
import {
  allEntries,
  asSaved,
  isStopped,
  planOwnExercise,
  withoutStops,
  type DurationChoice,
  type GeneratedWorkout,
  type WorkoutEntry,
} from '../../engine/workout/types';
import { prescribeFor } from '../../engine/progression/roles';
import { generateWorkout, withSwapLines } from '../../engine/workoutGenerator/generate';
import { explanationOnce } from '../../engine/workoutGenerator/fittingLog';
import { normalizeName } from '../backup/legacyImport';
import {
  COACH_DECLINES_ID,
  UNFINISHED_SOURCE,
  acceptKey,
  restLengthened,
  restOfferStands,
  restRunning,
  emptyDeclines,
  recordDecline,
  setAsideForWorkout,
  setAsideKey,
  type CoachAction,
  type CoachDeclines,
  type CoachSignal,
} from '../../engine/coach/coachConductor';
import { coachingPolicy } from '../../engine/coach/experience';
import {
  COACH_FOCUS_ID,
  createFocus,
  focusSatisfiedBy,
  parseCoachFocus,
  type CoachFocus,
} from '../../engine/planning/focus';
import {
  LASTING_SWAPS_ID,
  lastingSwapsRecord,
  parseLastingSwaps,
  swapIsPast,
  sameSwaps,
  undoSwaps,
  withSwap,
  withoutSwap,
  type LastingSwap,
} from '../../engine/planning/lastingSwaps';
import {
  DELOAD_WEEK_ID,
  inDeloadWindow,
  windowIsPast,
  type DeloadRecommendation,
  type DeloadWeek,
} from '../../engine/planning/deload';
import {
  COACH_ROUTES_ID,
  applyRouteStep,
  detectStalls,
  emptyRoutes,
  reconcileRoutes,
  type CoachRoutes,
} from '../../engine/strategy/plateau';
import { WorkoutRecordSchema } from '../validation/workoutRecord';
import {
  buildBackup,
  buildHistoryExport,
  buildSettingsExport,
  restoreBackup,
  summarizeBackup,
  type BackupAppInfo,
  type BackupSummary,
  type MetaRecord,
  type RestoreCounts,
  type WorkoutRecord,
} from '../backup/backup';
import {
  STORE_NAMES,
  openDatabase,
  type Database,
  type Identified,
  type StoreName,
} from '../storage/indexedDb';
import {
  LOCAL_SETTINGS_KEY,
  ONBOARDING_DRAFT_KEY,
  defaultStorage,
  readLocalSettings,
  removeKey,
  updateLocalSettings,
  type KeyValueStorage,
} from '../storage/localSettings';
import {
  deleteVerified,
  putVerified,
  structurallyEqual,
  type SaveReceipt,
} from '../storage/verifiedSave';
import {
  BackupSchema,
  type Backup,
  type HistoryExport,
  type SettingsExport,
} from '../validation/backup';
import { SESSION_KEY, SESSION_RECOVERY_KEY } from './session';
import {
  barcodeIdFor,
  parsePlaceBarcodes,
  PlaceBarcodeSchema,
  type PickedBarcode,
  type PlaceBarcode,
} from '../validation/placeBarcode';
import {
  CUSTOM_ID_PREFIX,
  CustomExerciseSchema,
  CustomInstructionSchema,
  CustomMediaSchema,
  customToCatalogExercise,
  type CustomExercise,
  type CustomInstruction,
  type CustomMedia,
} from '../validation/customExercise';
import {
  GYM_LOCATION_ID,
  HOME_LOCATION_ID,
  LocationProfileSchema,
  type LocationProfile,
} from '../validation/location';
import {
  UserProfileSchema,
  type ProgramStyle,
  type UserProfile,
  legacyStyleFor,
  normalizeProfile,
} from '../validation/profile';
import { resolveStyle } from '../../engine/planning/styleAdvice';
import type { LocalSettings } from '../validation/settings';
import {
  parseWorkoutRecords,
  type SessionRating,
  type WorkoutRecord as WorkoutHistoryRecord,
} from '../validation/workoutRecord';
import { parseSavedWorkouts, type SavedWorkout } from '../validation/savedWorkout';
import { detectPersonalRecords } from '../../engine/scoring/personalRecords';
import {
  CALIBRATION_LOG_LIMIT,
  IDLE_CALIBRATION,
  clearSession,
  computeBaseKey,
  createSession,
  doneKeys,
  elapsedSeconds,
  heldSeconds,
  readKeptSessions,
  readSessionOrKeep,
  writeSession,
  type CalibrationState,
  type CompletionSummary,
  type HoldState,
  type RestState,
  type SessionRecovery,
  type SetDraft,
  type WorkoutSession,
  undoAvailable,
} from './session';
import { buildCompletion, buildWorkoutRecord } from './workoutRecordBuilder';

/**
 * The single application state owner. Durable data goes through IndexedDB
 * with verified saves; small settings and the workout session go through
 * localStorage. React reads it with useSyncExternalStore (see AppStoreProvider).
 *
 * Every change to the generated workout runs through `recalibrate`, which
 * shows the calibration state, calls the pure Recalibration Engine, and either
 * commits the new workout with its change summary or keeps the previous one
 * and reports the error. The active workout (start, log, rest, pause, finish)
 * lives here too, so one set edit is one small state change.
 */

export type StoreStatus = 'loading' | 'ready' | 'error';

export interface AppState {
  status: StoreStatus;
  error: string | null;
  profile: UserProfile | null;
  locations: LocationProfile[];
  localSettings: LocalSettings;
  lastReceipt: SaveReceipt | null;
  workoutCount: number;
  /** Parsed workout history, oldest first; drives weekly volume and exposure. */
  history: WorkoutHistoryRecord[];
  /** Today's workout session: the generated workout plus session-only state. */
  session: WorkoutSession | null;
  /** Today asked for the end-of-workout sheet; the workout screen opens it and clears this. */
  finishRequested: boolean;
  /** A stored workout could not be read back when the app opened and was kept aside; the notice says so. */
  sessionRecovery: SessionRecovery | null;
  /** Membership barcodes, one per place at most; device only, never synced or backed up. */
  barcodes: PlaceBarcode[];
  /** The place whose barcode popup is open, or null. */
  barcodeSheet: string | null;
  /** The place whose barcode is full screen, or null; opened from the popup. */
  barcodeFullScreen: string | null;
  /**
   * Barcodes brought back from the phone's second copy when the app opened, by id: the browser
   * had cleared the database they live in (Maintenance 25). Their popup says so.
   */
  restoredBarcodes: string[];
  /**
   * What the phone's second copy holds of each barcode, by id: its picture, its code alone, or
   * nothing usable (a big picture with no code read, short of room). Read back after each write.
   */
  barcodeCopies: Record<string, MirrorCopy>;
  /**
   * The phone's database was made since the cloud copy was last walked in full, with a token on
   * the device and no profile: its data is on its way back from the cloud copy, and setup waits
   * for it (the tenth review), unless the lifter chooses to set up anyway.
   */
  restoring: boolean;
  calibration: CalibrationState;
  customExercises: CustomExercise[];
  /** Per-exercise notes and cue memory. */
  customInstructions: CustomInstruction[];
  savedWorkouts: SavedWorkout[];
  customCounts: { exercises: number; instructions: number; media: number };
  /**
   * Bumped whenever a demonstration of the lifter's own is added, replaced or removed, or the
   * data is read again: a replacement keeps the count, and what shows it must still read it
   * again (the review of Maintenance 26, item 50).
   */
  customMediaRevision: number;
  /**
   * Exercises whose own demonstration this session removed, each at the revision its last removal
   * made: what shows one lets go what it read before, without a read of its own, which may fail, and
   * shows what it reads after (the eighth to tenth passes of item 50). A mark is never taken off, by
   * a pick or a read of the data: it lets go only what was read before it (the tenth pass: a sheet
   * kept shut showed the removed picture again once a pick or a read had cleared it).
   */
  customMediaGone: Readonly<Record<string, number>>;
  /** Coach routes for stalled lifts, kept in the meta store and backed up. */
  coachRoutes: CoachRoutes;
  /** Declined coach offers, kept in the meta store and backed up. */
  coachDeclines: CoachDeclines;
  /** A planned deload week, kept in the meta store and backed up; null when none. */
  deloadWeek: DeloadWeek | null;
  /** Maxes the lifter entered by hand, kept in the meta store and backed up. */
  strengthMaxes: StrengthMaxes;
  /** A coach focus for the next session, kept in the meta store and backed up; null when none. */
  coachFocus: CoachFocus | null;
  /** Exercises the lifter swapped in and chose to keep for a few weeks (Maintenance 22). */
  lastingSwaps: LastingSwap[];
  /** The optional cloud copy: on only while a token is on this device. */
  cloud: CloudStatus;
}

/** Why a sync waits while the device is offline: a wait, not a failure (Maintenance 25). */
export const CLOUD_OFFLINE = 'Offline; it will sync when the device is back online.';

export interface CloudStatus {
  url: string;
  configured: boolean;
  syncing: boolean;
  /** Local changes the cloud copy has not received yet. */
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /**
   * Why the last setup link opened was not used (Maintenance 25). Its own field: no sync or
   * reload of the saved state says anything about the link, so none overwrites it. A token saved
   * or removed clears it.
   */
  linkError: string | null;
  deviceId: string | null;
  /**
   * The latest thing that happened to the token when it was a loss: a copy
   * written again from the other, or both copies gone. Null while all is well.
   */
  notice: TokenEvent | null;
}

/** Thrown when a database already holds another person's history; the card asks before it goes ahead. */
export class CloudOccupiedError extends Error {
  readonly rows: number;
  readonly devices: number;

  constructor(rows: number, devices: number) {
    super(
      `That database already holds ${rows} ${rows === 1 ? 'record' : 'records'} from ${devices === 1 ? 'another device' : `${devices} other devices`}. Using it would merge two people's histories.`,
    );
    this.name = 'CloudOccupiedError';
    this.rows = rows;
    this.devices = devices;
  }
}

const CLOUD_OFF: CloudStatus = {
  url: DEFAULT_CLOUD_URL,
  configured: false,
  syncing: false,
  pending: 0,
  lastSyncAt: null,
  lastError: null,
  linkError: null,
  deviceId: null,
  notice: null,
};

function sameNotice(a: TokenEvent | null, b: TokenEvent | null): boolean {
  return a === b || (a !== null && b !== null && a.at === b.at && a.kind === b.kind);
}

/** Pushes wait this long after the last write so a burst of saves goes as one batch. */
const DRAIN_DELAY_MS = 1500;

function parseDeloadWeek(raw: unknown, now: string): DeloadWeek | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<DeloadWeek>;
  if (typeof candidate.startsAt !== 'string' || typeof candidate.endsAt !== 'string') return null;
  const week: DeloadWeek = {
    id: DELOAD_WEEK_ID,
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    plannedAt: typeof candidate.plannedAt === 'string' ? candidate.plannedAt : now,
    reasons: Array.isArray(candidate.reasons)
      ? candidate.reasons.filter((r): r is string => typeof r === 'string')
      : [],
  };
  return windowIsPast(week, now) ? null : week;
}

function parseCoachDeclines(raw: unknown): CoachDeclines {
  if (raw && typeof raw === 'object') {
    const declines = (raw as { declines?: unknown }).declines;
    if (declines && typeof declines === 'object') {
      return { id: COACH_DECLINES_ID, declines: declines as CoachDeclines['declines'] };
    }
  }
  return emptyDeclines();
}

/** The routes with one lift's route as it was in `before`: a step taken back, and nothing else. */
function withRouteOf(routes: CoachRoutes, before: CoachRoutes, exerciseId: string): CoachRoutes {
  const was = before.routes[exerciseId];
  if (routes.routes[exerciseId] === was) return routes;
  const others = Object.entries(routes.routes).filter(([id]) => id !== exerciseId);
  return {
    ...routes,
    routes: Object.fromEntries(was ? [...others, [exerciseId, was]] : others),
  };
}

function parseCoachRoutes(raw: unknown): CoachRoutes {
  if (raw && typeof raw === 'object') {
    const routes = (raw as { routes?: unknown }).routes;
    if (routes && typeof routes === 'object') {
      return { id: COACH_ROUTES_ID, routes: routes as CoachRoutes['routes'] };
    }
  }
  return emptyRoutes();
}

export type SnapshotReason = 'workout' | 'pre-import' | 'manual' | 'legacy-import';

/** Automatic local backups kept on this device; the newest SNAPSHOTS_KEPT survive. */
export const SNAPSHOTS_KEPT = 3;

export interface BackupSnapshot extends Identified {
  createdAt: string;
  reason: SnapshotReason;
  seq: number;
  backup: Backup;
}

export interface BackupSnapshotSummary {
  id: string;
  createdAt: string;
  reason: SnapshotReason;
  seq: number;
  summary: BackupSummary;
}

export interface StorageDiagnostic {
  usageBytes: number | null;
  quotaBytes: number | null;
  persisted: boolean | null;
  counts: Record<StoreName, number>;
  localKeys: { key: string; present: boolean }[];
  /** What happened to the cloud token on this device, oldest first. Never the token. */
  tokenLog: TokenEvent[];
}

export type SaveCheckResult =
  | { ok: true; ms: number; bytes: number; checkedAt: string }
  | { ok: false; error: string; checkedAt: string };

export interface CleanupResult {
  removed: string[];
  kept: string[];
}

export const DIAGNOSTIC_PROBE_ID = 'diagnostic-probe';

/** A receipt for one legacy import, kept in `meta` so the import can be undone exactly. */
export interface LegacyImportReceipt extends Identified {
  kind: 'legacy-import';
  importedAt: string;
  recordIds: string[];
  snapshotId: string;
  fileName: string;
}

export interface AppStoreOptions {
  openDb?: () => Promise<Database>;
  storage?: KeyValueStorage;
  now?: () => string;
  /** The cloud client for a token; tests inject the fake, the app uses the libsql driver. */
  cloudClient?: (token: string) => Promise<CloudClient>;
  /** Whether the device is online; tests flip it to prove the outbox waits. */
  isOnline?: () => boolean;
  /** The recalibration engine; tests inject a failing one to prove rollback. */
  recalibrate?: typeof runRecalibration;
  /** Minimum time the calibration overlay stays up so a fast rebuild still reads as a change. */
  minOverlayMs?: number;
  /**
   * A smaller copy of a barcode picture too big for the phone's second copy; the app draws one on
   * a canvas, tests pass a stand-in. Without it a big picture's second copy keeps its code only.
   */
  shrinkPicture?: (picture: MirrorPicture) => Promise<MirrorPicture | null>;
}

export interface SetValues {
  weight: number | null;
  reps: number;
  rir: number | null;
}

export interface NewCustomExercise {
  name: string;
  primaryMuscles: MuscleId[];
  secondaryMuscles?: MuscleId[];
  movementPattern: MovementPatternId;
  equipment: string[][];
  /** How it loads; left out, the equipment decides. */
  load?: CustomExercise['load'];
  notes?: string;
}

export interface NewCustomMedia {
  kind: 'image' | 'video';
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

type Listener = () => void;

const DEFAULT_MIN_OVERLAY_MS = 450;
const LONG_INTERRUPTION_SECONDS = 20 * 60;
const TECHNIQUES = ['supersets', 'dropSets', 'circuits'] as const;
/** The Web Lock barcode changes take, shared by this app's windows (never by another app's). */
const BARCODE_LOCK = 'workout-conductor-v4-barcodes';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function sortLocations(locations: LocationProfile[]): LocationProfile[] {
  const order = { home: 0, gym: 1, travel: 2, custom: 3 } as const;
  return [...locations].sort(
    (a, b) => order[a.kind] - order[b.kind] || a.createdAt.localeCompare(b.createdAt),
  );
}

function sameEquipment(a: readonly string[], b: readonly string[]): boolean {
  return [...a].sort().join('|') === [...b].sort().join('|');
}

/**
 * Once the newer style field is in use, `trainingStyle` follows it: always the
 * nearest style a copy of the app from before the newer ones can read and train by.
 */
export function alignLegacyStyle(profile: UserProfile): UserProfile {
  if (profile.programStyle === undefined) return profile;
  const trainingStyle = legacyStyleFor(resolveStyle(profile));
  return trainingStyle === profile.trainingStyle ? profile : { ...profile, trainingStyle };
}

/** Which recalibration a profile save calls for; notes and units never trigger one. */
export function profileTrigger(
  previous: UserProfile,
  next: UserProfile,
): RecalibrationTrigger | null {
  if (previous.currentLocationId !== next.currentLocationId) return { type: 'location' };
  const techniques = TECHNIQUES.filter((key) => previous.techniques[key] !== next.techniques[key]);
  if (techniques.length === 1)
    return { type: 'technique', technique: techniques[0] as (typeof TECHNIQUES)[number] };
  if (techniques.length > 1) return { type: 'profile' };
  // Losing fat counts through the style it resolves to: under a style picked by hand it changes
  // nothing the plan is built from, so it must not rebuild a session that is under way.
  const relevant = (profile: UserProfile) =>
    JSON.stringify([
      { ...profile.goals, bodyweight: undefined },
      resolveStyle(profile),
      profile.experience,
      profile.schedule,
      profile.exercisePreferences,
      { ...profile.limitations, notes: '' },
      profile.trainingStyle,
      profile.programStyle ?? null,
      profile.restStyle,
      profile.bodyweight ?? null,
      profile.age ?? null,
      profile.sex ?? null,
    ]);
  return relevant(previous) !== relevant(next) ? { type: 'profile' } : null;
}

/** "Incline Dumbbell Press · set 2 of 3 · 6-10 reps @ RIR 1". */
export function describePosition(workout: GeneratedWorkout, position: SetPosition): string {
  const name = requireExercise(position.exerciseId).name;
  const entry = allEntries(workout.blocks).find((candidate) => candidate.id === position.entryId);
  const count = entry ? entry.sets.filter((set) => set.kind === position.kind).length : 0;
  const [low, high] = position.set.targetReps;
  if (position.kind === 'warmup') return `${name} · warm-up set ${position.ordinal} of ${count}`;
  if (position.kind === 'drop') return `${name} · drop set: strip about 20% and go`;
  if (holdById(position.exerciseId)) {
    return `${name} · set ${position.ordinal} of ${count} · hold ${low} s`;
  }
  return `${name} · set ${position.ordinal} of ${count} · ${low}-${high} reps @ RIR ${position.set.targetRir}`;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * A rest running when the workout is rebuilt names what comes next in the rebuilt workout: the
 * set it named may have moved, or gone with the place it needed.
 */
function restPointingAt(
  rest: WorkoutSession['rest'],
  workout: GeneratedWorkout,
  next: SetPosition | null,
): WorkoutSession['rest'] {
  if (!rest || !next) return rest;
  return { ...rest, nextLabel: `Next: ${describePosition(workout, next)}` };
}

/**
 * A hold survives a rebuild only while its set is still a hold in the rebuilt workout and still the
 * set in front of the lifter: a countdown the screen no longer shows must not keep ticking.
 */
function holdStillFits(
  hold: WorkoutSession['hold'],
  workout: GeneratedWorkout,
  next: SetPosition | null,
): WorkoutSession['hold'] {
  if (!hold) return hold;
  const entry = allEntries(workout.blocks).find((candidate) => candidate.id === hold.entryId);
  const fits =
    entry !== undefined &&
    isHold(getExercise(entry.exerciseId)) &&
    next?.entryId === hold.entryId &&
    next.setIndex === hold.setIndex;
  return fits ? hold : null;
}

/** A timer frozen by a pause, running again from now with what it had left. */
function rearmed<T extends { endsAt: string; pausedRemaining: number | null }>(
  timer: T | null,
  nowMs: number,
): T | null {
  if (!timer || timer.pausedRemaining === null) return timer;
  return {
    ...timer,
    pausedRemaining: null,
    endsAt: new Date(nowMs + timer.pausedRemaining * 1000).toISOString(),
  };
}

/**
 * The engine's lines a max's preview repeats (Maintenance 25): what the weights here, a plate
 * missing, a deload week, the work before the lift today or the max itself did to the target.
 */
function previewLine(line: string): boolean {
  return (
    line.startsWith('Held at the heaviest weight here') ||
    / here make [\d.]+, not [\d.]+ /.test(line) ||
    /^No .+ today: /.test(line) ||
    line.startsWith('The next weight here after ') ||
    line.startsWith('Deload week: ') ||
    line.startsWith('Before this today: ') ||
    line.startsWith('Your max of ')
  );
}

/** What saving a max would do to a lift today: the max sheet's preview (Maintenance 25). */
export interface MaxPreview {
  /** The estimated max the input gives, in the lifter's units. */
  e1rm: number;
  outcome: MaxOutcome;
  /** The lift's first working set after the save's rebuild. */
  target: { weight: number | null; reps: [number, number]; rir: number } | null;
  /** The engine's lines for what the place or the max did to that target. */
  lines: string[];
  /** The target is the one the plan has now: weight, reps and reserve all stay. */
  stays: boolean;
  /** With the outcome 'held': what held the target (Maintenance 25). */
  heldBy?: MaxHeldBy;
}

/** A rest made longer (or shorter) by some seconds, running or paused. */
function restLongerBy(rest: RestState, deltaSeconds: number): RestState {
  const seconds = Math.max(0, rest.seconds + deltaSeconds);
  return rest.pausedRemaining !== null
    ? { ...rest, seconds, pausedRemaining: Math.max(0, rest.pausedRemaining + deltaSeconds) }
    : {
        ...rest,
        seconds,
        endsAt: new Date(Date.parse(rest.endsAt) + deltaSeconds * 1000).toISOString(),
      };
}

/** What one sync is asked to do: pull too, ignore the retry delay, walk from the beginning. */
type SyncRequest = { pull: boolean; force?: boolean; full?: boolean };

export class AppStore {
  private state: AppState;
  private readonly listeners = new Set<Listener>();
  private readonly openDb: () => Promise<Database>;
  private readonly storage: KeyValueStorage;
  private readonly now: () => string;
  /** Background work (automatic snapshots) that tests and diagnostics can wait for. */
  private pendingWork: Promise<void> = Promise.resolve();
  private swapsQueue: Promise<unknown> = Promise.resolve();
  /** Counts the kept-swap changes shown, so a reload that read the list before one keeps it. */
  private swapsVersion = 0;
  /**
   * Bumped by every write of the lifter's own demonstrations: a read of the data begun before one
   * keeps the count it made (Maintenance 26, the re-check of item 50: a hydrate across a pick put
   * the count back to none, and the demonstration went unshown).
   */
  private mediaVersion = 0;
  /**
   * The lifter's own media is written one change at a time, each counting what the database holds
   * once it is written (Maintenance 26, the fourth pass of item 50: a removal and a pick at once,
   * or a read of the data between a count and its write, left the count off and hid a picture).
   */
  private mediaWrites: Promise<unknown> = Promise.resolve();
  /**
   * Counts the barcode changes shown, so a reload that read the barcodes before a save, a switch
   * or a removal keeps what that change showed (Maintenance 25).
   */
  private barcodesVersion = 0;
  /** Barcode changes and the second copy's upkeep, one at a time (see withBarcodeLock). */
  private barcodeQueue: Promise<unknown> = Promise.resolve();
  private readonly shrinkPicture:
    ((picture: MirrorPicture) => Promise<MirrorPicture | null>) | null;
  /** Asked once per open for this origin's storage to be kept. */
  private persistenceAsked = false;
  /** Set up anyway, chosen on the screen that waits for the cloud copy: it waits no more. */
  private restoreSkipped = false;
  /**
   * When the first walk of the cloud copy had ended as this screen last read the disk (null: not
   * yet). A sync that finds a later one reloads, whoever walked: another window, or an attempt
   * cut short (the tenth review's fifth re-check).
   */
  private walkShown: string | null = null;
  private readonly engine: typeof runRecalibration;
  private readonly minOverlayMs: number;
  private dbPromise: Promise<Database> | null = null;
  private calibrationQueue: Promise<unknown> = Promise.resolve();
  private readonly makeCloudClient: (token: string, url: string) => Promise<CloudClient>;
  private readonly isOnline: () => boolean;
  private cloudClient: { token: string; url: string; client: CloudClient } | null = null;
  /**
   * Bumped whenever the token is saved or removed. A sync that started before the change must
   * not write its result over it: a removal that raced an attempt in flight used to be flipped
   * back to "on" when the attempt finished.
   */
  private cloudEpoch = 0;
  private syncRun: Promise<SyncOutcome | null> = Promise.resolve(null);
  /** A sync waiting behind the one under way, not yet started: a later request joins it. */
  private queuedSync: { options: SyncRequest; run: Promise<SyncOutcome | null> } | null = null;
  private cloudTimer: number | null = null;
  private drainTimer: number | null = null;
  private onlineHandler: (() => void) | null = null;

  constructor(options: AppStoreOptions = {}) {
    this.openDb = options.openDb ?? (() => openDatabase());
    this.storage = options.storage ?? defaultStorage();
    this.now = options.now ?? (() => new Date().toISOString());
    this.engine = options.recalibrate ?? runRecalibration;
    this.minOverlayMs = options.minOverlayMs ?? DEFAULT_MIN_OVERLAY_MS;
    this.makeCloudClient = options.cloudClient ?? createLibsqlCloudClient;
    this.shrinkPicture = options.shrinkPicture ?? null;
    this.isOnline =
      options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
    this.state = {
      status: 'loading',
      error: null,
      profile: null,
      locations: [],
      localSettings: readLocalSettings(this.storage),
      lastReceipt: null,
      workoutCount: 0,
      history: [],
      savedWorkouts: [],
      session: null,
      finishRequested: false,
      sessionRecovery: null,
      barcodes: [],
      barcodeSheet: null,
      barcodeFullScreen: null,
      restoredBarcodes: [],
      barcodeCopies: {},
      restoring: false,
      calibration: IDLE_CALIBRATION,
      customExercises: [],
      customInstructions: [],
      customCounts: { exercises: 0, instructions: 0, media: 0 },
      customMediaRevision: 0,
      customMediaGone: {},
      coachRoutes: emptyRoutes(),
      coachDeclines: emptyDeclines(),
      deloadWeek: null,
      strengthMaxes: emptyMaxes(),
      coachFocus: null,
      lastingSwaps: [],
      cloud: CLOUD_OFF,
    };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AppState => this.state;

  private setState(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  getDatabase(): Promise<Database> {
    this.dbPromise ??= this.openDb().then((db) => {
      // Every local write to a synced store lands in the outbox; the push follows shortly.
      db.watchOutbox(() => this.scheduleDrain());
      return db;
    });
    return this.dbPromise;
  }

  private nowMs(): number {
    return Date.parse(this.now());
  }

  async hydrate(): Promise<void> {
    const swapsSeen = this.swapsVersion;
    const mediaSeen = this.mediaVersion;
    const barcodesSeen = this.barcodesVersion;
    try {
      const db = await this.getDatabase();
      // The walk this screen will show, read before the records it shows: a walk ending while
      // they are read then counts as not shown, and the next sync reloads (the sixth re-check).
      const shownBirth = await readDatabaseBirth(db).catch(() => ({ at: null, walkedAt: null }));
      const [
        profiles,
        locations,
        workouts,
        customExercises,
        customInstructions,
        customMedia,
        savedRaw,
        routesRaw,
        declinesRaw,
        deloadRaw,
        maxesRaw,
        focusRaw,
        swapsRaw,
        deviceRaw,
      ] = await Promise.all([
        db.getAll<Identified>('profile'),
        db.getAll<Identified>('locations'),
        db.getAll<Identified>('workouts'),
        db.getAll<Identified>('customExercises'),
        db.getAll<Identified>('customInstructions'),
        db.count('customMedia'),
        db.getAll<Identified>('savedWorkouts'),
        db.get<Identified>('meta', COACH_ROUTES_ID),
        db.get<Identified>('meta', COACH_DECLINES_ID),
        db.get<Identified>('meta', DELOAD_WEEK_ID),
        db.get<Identified>('meta', STRENGTH_MAXES_ID),
        db.get<Identified>('meta', COACH_FOCUS_ID),
        db.get<Identified>('meta', LASTING_SWAPS_ID),
        db.getAll<Identified>('device'),
      ]);
      const deviceId = ensureDeviceId(this.storage);
      // Finds the token in either of its copies and heals the other. A copy that
      // could not be healed must not stop the app from opening.
      const resolved = await resolveToken(db, this.storage, this.now()).catch(() => null);
      // A database that lost the token may have lost more: the next sync walks everything. A
      // write that fails here (a full disk is when browsers clear storage) never stops the app.
      if (resolved?.recover) await restartPull(db).catch(() => undefined);
      // When this database was made, once: a cleared phone's own rows come back over what was
      // made since (Maintenance 25).
      const empty =
        profiles.length +
          locations.length +
          workouts.length +
          customExercises.length +
          customInstructions.length +
          savedRaw.length ===
          0 &&
        [routesRaw, declinesRaw, deloadRaw, maxesRaw, focusRaw, swapsRaw].every(
          (record) => record === undefined,
        );
      await noteDatabaseBirth(db, this.now(), empty).catch(() => null);
      // A barcode the database lost comes back from the phone's second copy.
      const barcodes = await this.reconcileBarcodes(db, parsePlaceBarcodes(deviceRaw));
      const [cloudUrl, cloudState, pending, birth] = await Promise.all([
        resolveCloudUrl(db, this.storage, this.now()),
        readCloudState(db),
        pendingCount(db),
        readDatabaseBirth(db).catch(() => ({ at: null, walkedAt: null })),
      ]);
      const parsedProfile = profiles[0] ? UserProfileSchema.safeParse(profiles[0]) : null;
      const validLocations = locations
        .map((location) => LocationProfileSchema.safeParse(location))
        .filter((result) => result.success)
        .map((result) => result.data);
      const validCustom = customExercises
        .map((record) => CustomExerciseSchema.safeParse(record))
        .filter((result) => result.success)
        .map((result) => result.data);
      const validInstructions = customInstructions
        .map((record) => CustomInstructionSchema.safeParse(record))
        .filter((result) => result.success)
        .map((result) => result.data);
      registerCustomExercises(validCustom.map(customToCatalogExercise));

      // The walk this screen shows from now on, set in the same step as the state.
      this.walkShown = shownBirth.walkedAt ?? null;
      this.setState({
        status: 'ready',
        error:
          parsedProfile && !parsedProfile.success
            ? 'The stored profile could not be read. Finish setup again to replace it.'
            : null,
        profile: parsedProfile?.success ? normalizeProfile(parsedProfile.data) : null,
        locations: sortLocations(validLocations),
        localSettings: readLocalSettings(this.storage),
        workoutCount: workouts.length,
        history: parseWorkoutRecords(workouts),
        // No await inside this literal: the settings read above must not go stale.
        savedWorkouts: parseSavedWorkouts(savedRaw),
        customExercises: validCustom,
        customInstructions: validInstructions,
        customCounts: {
          exercises: validCustom.length,
          instructions: validInstructions.length,
          media: this.mediaVersion === mediaSeen ? customMedia : this.state.customCounts.media,
        },
        customMediaRevision: this.state.customMediaRevision + 1,
        coachRoutes: parseCoachRoutes(routesRaw),
        coachDeclines: parseCoachDeclines(declinesRaw),
        deloadWeek: parseDeloadWeek(deloadRaw, this.now()),
        strengthMaxes: parseStrengthMaxes(maxesRaw),
        coachFocus: parseCoachFocus(focusRaw, this.now()),
        // After the custom exercises register, so a custom swap reads back.
        // A kept-swap change made while this read was under way is newer than what it read.
        lastingSwaps:
          this.swapsVersion === swapsSeen
            ? parseLastingSwaps(swapsRaw, this.now())
            : this.state.lastingSwaps,
        // A barcode saved, switched or removed while this read was under way is newer than it.
        ...(this.barcodesVersion === barcodesSeen
          ? {
              barcodes: barcodes.all,
              // Read as this state is set: a smaller copy kept since the reconcile counts.
              barcodeCopies: this.copiesOf(barcodes.all),
              restoredBarcodes: [
                ...new Set([...this.state.restoredBarcodes, ...barcodes.restored]),
              ],
            }
          : {}),
        restoring:
          !this.restoreSkipped &&
          !parsedProfile?.success &&
          (resolved?.token ?? null) !== null &&
          birth.at !== null &&
          birth.walkedAt === null,
        cloud: {
          ...this.state.cloud,
          url: cloudUrl,
          configured: (resolved?.token ?? null) !== null,
          pending,
          lastSyncAt: cloudState.lastSyncAt,
          // With no token nothing syncs, and an error kept from before is not news (Maintenance
          // 25). A setup link's failure is kept apart, in `linkError`, and stays.
          lastError:
            (resolved?.token ?? null) === null
              ? null
              : this.isOnline()
                ? cloudState.lastError
                : CLOUD_OFFLINE,
          deviceId,
          notice: liveNotice(resolved?.notice ?? null, cloudState.lastSyncAt),
        },
      });
      this.ensureSession();
    } catch (error) {
      this.setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Local storage could not be opened.',
      });
    }
  }

  // ---------------------------------------------------------------- session

  private currentLocation(): LocationProfile | undefined {
    const { profile, locations } = this.state;
    return locations.find((location) => location.id === profile?.currentLocationId);
  }

  private baseKey(): string | null {
    const { profile, history } = this.state;
    if (!profile) return null;
    return computeBaseKey(this.now().slice(0, 10), profile, this.currentLocation(), history.length);
  }

  private setSession(session: WorkoutSession): void {
    writeSession(session, this.storage);
    this.setState({ session });
  }

  private requireSession(): WorkoutSession {
    const session = this.state.session;
    if (!session) throw new Error('There is no workout session yet.');
    return session;
  }

  private isDoneFor(session: WorkoutSession) {
    const keys = doneKeys(session.completed);
    return (entryId: string, setIndex: number) => keys.has(`${entryId}:${setIndex}`);
  }

  /**
   * Reuses the persisted session when it was generated from today's inputs;
   * otherwise (first run, a new day, an edited profile, new history) generates
   * a fresh Default session silently. A started or completed workout is never
   * replaced underneath the user.
   */
  private ensureSession(): void {
    const key = this.baseKey();
    const { profile } = this.state;
    if (!key || !profile) {
      this.setState({ session: null });
      return;
    }
    let current = this.state.session;
    if (!current) {
      // A stored workout that cannot be read back is kept aside first, so the fresh session
      // generated below can never write over the only copy of logged work.
      const read = readSessionOrKeep(this.storage, this.now());
      current = read.session;
      if (read.kept) this.setState({ sessionRecovery: read.kept });
    }
    if (current && current.status !== 'preview') {
      if (this.state.session !== current) this.setState({ session: current });
      return;
    }
    if (current && current.baseKey === key) {
      if (this.state.session !== current) this.setState({ session: current });
      return;
    }
    const now = this.now();
    const deload =
      this.state.deloadWeek && inDeloadWindow(this.state.deloadWeek, now)
        ? { startsAt: this.state.deloadWeek.startsAt, endsAt: this.state.deloadWeek.endsAt }
        : null;
    const focus = this.state.coachFocus?.muscle ?? null;
    const workout = generateWorkout({
      profile,
      location: this.currentLocation(),
      history: this.state.history,
      now,
      duration: 'default',
      constraints: { deload, focusMuscle: focus, swaps: this.activeSwaps() },
      maxes: this.state.strengthMaxes,
    });
    const session = createSession(key, workout, now);
    this.setSession({ ...session, constraints: { ...session.constraints, deload, focus } });
  }

  /** Puts the kept-workout notice away; the kept copy itself stays on the device. */
  dismissSessionRecovery(): void {
    if (this.state.sessionRecovery) this.setState({ sessionRecovery: null });
  }

  /** Re-checks the session against today's inputs; a new day starts a fresh session. */
  refreshSession(): void {
    if (this.state.status === 'ready') this.ensureSession();
  }

  /**
   * A plan previewed on an earlier day and still on the screen (Maintenance 24): nothing chosen
   * for that day is a choice for today.
   */
  private fromEarlierDay(session: WorkoutSession): boolean {
    return (
      session.status === 'preview' && !session.baseKey.startsWith(`${this.now().slice(0, 10)}|`)
    );
  }

  /** Puts today's plan in place of one from an earlier day; true when it did. */
  private leaveEarlierDay(): boolean {
    const session = this.state.session;
    if (!session || !this.fromEarlierDay(session)) return false;
    this.ensureSession();
    return true;
  }

  /** Keeps the session after a save that needs no recalibration (units, notes). */
  private syncSessionKey(): void {
    if (this.leaveEarlierDay()) return;
    const key = this.baseKey();
    const { session } = this.state;
    if (key && session && session.baseKey !== key) this.setSession({ ...session, baseKey: key });
  }

  /** One change's request to the engine, from the session as it stands (a preview's too). */
  private calibrationRequest(
    trigger: RecalibrationTrigger,
    session: WorkoutSession,
    profile: UserProfile,
    reason: string,
    overrides: Partial<RecalibrationRequest> = {},
  ): RecalibrationRequest {
    return {
      trigger,
      workout: session.workout,
      completed: {
        ...session.completed,
        elapsedSeconds: elapsedSeconds(session, this.nowMs()),
      },
      lockedEntryIds: [],
      currentEntryId: session.completed.currentEntryId,
      duration: trigger.type === 'duration' ? trigger.choice : session.duration,
      profile,
      location: this.currentLocation(),
      loading: session.loading,
      history: this.state.history,
      constraints: session.constraints,
      maxes: this.state.strengthMaxes,
      swaps: this.activeSwaps(),
      reason,
      timestamp: this.now(),
      ...overrides,
    };
  }

  private triggerContext(trigger: RecalibrationTrigger, session: WorkoutSession): TriggerContext {
    const entryOf = (id: string) =>
      allEntries(session.workout.blocks).find((entry) => entry.id === id);
    switch (trigger.type) {
      case 'replace':
      case 'max':
        return { exerciseName: getExercise(trigger.exerciseId)?.name };
      case 'pin':
      case 'sets':
      case 'add-warmup':
      case 'rep-range':
      case 'reorder':
      case 'equipment-busy': {
        const entry = entryOf(trigger.entryId);
        return { exerciseName: entry ? requireExercise(entry.exerciseId).name : undefined };
      }
      default:
        return { locationName: this.currentLocation()?.name };
    }
  }

  /**
   * Runs one recalibration through the engine. Recalibrations are serialized
   * so two triggers can never race; the overlay shows at once and stays up for
   * at least `minOverlayMs` so the change is visible.
   */
  recalibrate(trigger: RecalibrationTrigger, reason?: string): Promise<RecalibrationResult | null> {
    const run = this.calibrationQueue.then(() => this.runCalibration(trigger, reason, false));
    this.calibrationQueue = run.catch(() => undefined);
    return run;
  }

  private async runCalibration(
    trigger: RecalibrationTrigger,
    reason: string | undefined,
    /** Worked out once already on a plan not yet started that was made again meanwhile. */
    again: boolean,
  ): Promise<RecalibrationResult | null> {
    // A plan left open from an earlier day gives way to today's first, so nothing chosen for that
    // day carries into today; a change to one of its exercises or pairings, or an exercise added to
    // it, then has nothing to change.
    if (
      this.leaveEarlierDay() &&
      ('entryId' in trigger || 'blockId' in trigger || trigger.type === 'add-exercise')
    ) {
      return null;
    }
    const session = this.state.session;
    const { profile, history } = this.state;
    if (!session || !profile || session.status === 'completed') return null;
    if (trigger.type === 'bad-start') {
      // Read again as it runs: one queued behind another change may no longer be wanted (the
      // re-check of item 42: two quick undos each queued one, and the second spoke of a check-in).
      // A reading the lifter took back, or one that could not be made, is not made again here
      // either (the third pass).
      const reading = this.readStartOf(session);
      if (!reading || reading.low === Boolean(session.constraints.badStart)) return null;
      const key = startKey(reading);
      if (session.startDeclined === key || session.startFailed === key) return null;
      trigger = { type: 'bad-start', low: reading.low, lifts: reading.lifts };
    }
    const described = describeTrigger(trigger, this.triggerContext(trigger, session));
    const startedAt = Date.now();
    this.setState({
      calibration: {
        status: 'running',
        title: described.title,
        label: described.label,
        evaluating: described.evaluating,
        error: null,
      },
    });
    // Let the overlay paint before the engine runs.
    await sleep(0);

    // The history read before the overlay's pause, as the session and profile are.
    const request = this.calibrationRequest(trigger, session, profile, reason ?? described.title, {
      history,
    });
    let result: RecalibrationResult;
    try {
      result = this.engine(request);
    } catch (error) {
      result = {
        ok: false,
        scope: described.scope,
        error: error instanceof Error ? error.message : 'Recalibration failed.',
        workout: session.workout,
        durationMs: 0,
      };
    }
    const remaining = this.minOverlayMs - (Date.now() - startedAt);
    if (remaining > 0) await sleep(remaining);

    const current = this.state.session;
    // A workout discarded or finished while this ran takes nothing of it: the plan in its place is
    // not the one it was worked out on (Maintenance 26, the fourth and fifth passes of item 42).
    if (
      !current ||
      (session.status !== 'preview' &&
        (current.createdAt !== session.createdAt ||
          current.status === 'preview' ||
          current.status === 'completed'))
    ) {
      this.setState({ calibration: IDLE_CALIBRATION });
      return null;
    }
    // A plan not yet started, made again meanwhile (a workout pulled in, a new day, a profile
    // saved), has the change worked out again on it: the plan made from the new inputs never goes
    // back to the old (the sixth pass). A change aimed at one of its exercises has nothing to work
    // on, its exercises being picked again.
    if (session.status === 'preview' && current.createdAt !== session.createdAt) {
      const aimed = 'entryId' in trigger || 'blockId' in trigger || trigger.type === 'add-exercise';
      if (!aimed && !again) {
        this.setState({ calibration: IDLE_CALIBRATION });
        return this.runCalibration(trigger, reason, true);
      }
      // Left, it says so: nothing changed, and why (the seventh pass: it was dropped silently).
      this.setState({
        calibration: {
          status: 'error',
          title: described.title,
          label: described.label,
          evaluating: [],
          error: "Today's plan was made again while this ran, so nothing changed: try it again.",
        },
      });
      return null;
    }
    const latest = current;
    const key = this.baseKey() ?? latest.baseKey;
    if (result.ok) {
      const position = currentPosition(result.workout, this.isDoneFor(latest));
      this.setSession({
        ...latest,
        baseKey: key,
        duration: result.duration,
        workout: result.workout,
        constraints: result.constraints,
        completed: {
          ...latest.completed,
          currentEntryId:
            latest.status === 'preview'
              ? latest.completed.currentEntryId
              : (position?.entryId ?? null),
        },
        defaultEstimatedMinutes:
          result.duration === 'default'
            ? result.workout.duration.estimatedMinutes
            : latest.defaultEstimatedMinutes,
        rest: restPointingAt(latest.rest, result.workout, position),
        hold: holdStillFits(latest.hold, result.workout, position),
        lastSummary: result.summary,
        lastChanges: result.changes,
        previous: {
          workout: latest.workout,
          constraints: latest.constraints,
          duration: latest.duration,
        },
        log: [
          {
            at: this.now(),
            trigger: trigger.type,
            label: described.label,
            scope: result.scope,
            headline: result.summary.headline,
            durationMs: result.durationMs,
          },
          ...latest.log,
        ].slice(0, CALIBRATION_LOG_LIMIT),
      });
      this.setState({ calibration: IDLE_CALIBRATION });
    } else {
      // Rollback: the previous, still valid workout stays exactly as it was.
      if (latest.baseKey !== key) this.setSession({ ...latest, baseKey: key });
      this.setState({
        calibration: {
          status: 'error',
          title: described.title,
          label: described.label,
          evaluating: [],
          error: result.error,
        },
      });
    }
    return result;
  }

  /**
   * Puts the previous workout back, unless a set is logged since on an exercise it does not have. When the change being undone kept a swap for weeks, the kept
   * swaps go back to what they were too (saved with the session, so this holds after a reopen or
   * a change that failed). Resolves once that is saved; rejects, and puts it back, if it cannot be.
   */
  undoRecalibration(): Promise<void> {
    // A plan from an earlier day has nothing to take back today (Maintenance 24).
    if (this.leaveEarlierDay()) return Promise.resolve();
    const session = this.state.session;
    // A finished workout is saved as it was done: nothing to take back.
    if (!session?.previous || session.status === 'completed') return Promise.resolve();
    if (!undoAvailable(session)) {
      return Promise.reject(new Error('Sets logged since that change would be lost, so it stays.'));
    }
    const { swapsBefore, swapsAfter } = session.previous;
    const headline = 'Restored the previous workout.';
    // A hard start's change taken back is the lifter's choice: it does not come straight back on
    // the next set while the start reads the same (the review of item 42).
    const reading = session.log[0]?.trigger === 'bad-start' ? this.readStartOf(session) : null;
    const declined = reading ? startKey(reading) : session.startDeclined;
    const position = currentPosition(session.previous.workout, this.isDoneFor(session));
    const restored = session.previous.workout;
    this.setSession({
      ...session,
      // Its lines about kept swaps say what is true now: a swap stopped since has none.
      workout: {
        ...restored,
        explanation: {
          ...restored.explanation,
          reasons: withSwapLines(restored.explanation.reasons, restored.blocks, this.activeSwaps()),
        },
      },
      constraints: session.previous.constraints,
      duration: session.previous.duration,
      completed: {
        ...session.completed,
        currentEntryId:
          session.status === 'preview'
            ? session.completed.currentEntryId
            : (position?.entryId ?? null),
      },
      defaultEstimatedMinutes:
        session.previous.duration === 'default'
          ? session.previous.workout.duration.estimatedMinutes
          : session.defaultEstimatedMinutes,
      rest: restPointingAt(session.rest, session.previous.workout, position),
      hold: holdStillFits(session.hold, session.previous.workout, position),
      previous: null,
      ...(declined !== undefined ? { startDeclined: declined } : {}),
      lastSummary: {
        headline,
        details: [],
        counts: {
          added: 0,
          removed: 0,
          replaced: 0,
          adjusted: 0,
          supersetsAdded: 0,
          supersetsRemoved: 0,
          setsTrimmed: 0,
        },
      },
      lastChanges: [],
      log: [
        {
          at: this.now(),
          trigger: 'undo',
          label: 'Undo',
          scope: 'local' as const,
          headline,
          durationMs: 0,
        },
        ...session.log,
      ].slice(0, CALIBRATION_LOG_LIMIT),
    });
    if (swapsBefore === undefined) return Promise.resolve();
    const saving = this.changeSwaps((current) =>
      undoSwaps(current, swapsBefore, swapsAfter ?? []),
    ).then((change) => {
      if (change.saved) return;
      throw new Error(
        'The swap is undone, but its four weeks could not be taken back. Stop it on the Plan tab.',
      );
    });
    this.pendingWork = this.pendingWork.then(() => saving.catch(() => undefined));
    return saving;
  }

  dismissSummary(): void {
    const session = this.state.session;
    if (!session || (session.lastSummary === null && session.lastChanges.length === 0)) return;
    this.setSession({ ...session, lastSummary: null, lastChanges: [] });
  }

  dismissCalibrationError(): void {
    this.setState({ calibration: IDLE_CALIBRATION });
  }

  /** Remembered for the current workout only; Settings owns the default length. */
  setDurationChoice(choice: DurationChoice): Promise<RecalibrationResult | null> {
    return this.recalibrate({ type: 'duration', choice });
  }

  /** End by exact time: a hard cap at the chosen length, counted from now. */
  setEndBy(on: boolean): Promise<RecalibrationResult | null> {
    this.leaveEarlierDay();
    const { session, profile } = this.state;
    if (!session || !profile) return Promise.resolve(null);
    const minutes = resolveTargetMinutes(session.duration, profile.schedule.typicalDurationMinutes);
    const time = on ? new Date(this.nowMs() + minutes * 60_000).toISOString() : null;
    return this.recalibrate({ type: 'end-by', time });
  }

  // ---------------------------------------------------------------- active workout

  startWorkout(): void {
    this.leaveEarlierDay();
    const session = this.requireSession();
    if (session.status !== 'preview') return;
    const now = this.now();
    const position = currentPosition(session.workout, this.isDoneFor(session));
    this.setSession({
      ...session,
      status: 'active',
      activeSince: now,
      pausedAt: null,
      completed: {
        ...session.completed,
        startedAt: now,
        currentEntryId: position?.entryId ?? null,
      },
    });
    // At a place with a barcode set to show, its popup comes up for the desk as the workout starts.
    const barcode = this.barcodeFor(this.state.profile?.currentLocationId);
    if (barcode?.autoShow) this.setState({ barcodeSheet: barcode.locationId });
  }

  pauseWorkout(): void {
    const session = this.requireSession();
    if (session.status !== 'active') return;
    const nowMs = this.nowMs();
    const rest: RestState | null = session.rest
      ? {
          ...session.rest,
          pausedRemaining: Math.max(0, (Date.parse(session.rest.endsAt) - nowMs) / 1000),
        }
      : null;
    // A hold still counting freezes with the workout, exactly as the rest does.
    const hold: HoldState | null =
      session.hold && heldSeconds(session.hold, nowMs) === null
        ? {
            ...session.hold,
            pausedRemaining: Math.max(0, (Date.parse(session.hold.endsAt) - nowMs) / 1000),
          }
        : session.hold;
    this.setSession({
      ...session,
      status: 'paused',
      pausedAt: this.now(),
      activeSince: null,
      completed: { ...session.completed, elapsedSeconds: elapsedSeconds(session, nowMs) },
      rest,
      hold,
    });
  }

  /** Resumes; after a long interruption the remaining workout is recalculated. */
  async resumeWorkout(): Promise<void> {
    const session = this.requireSession();
    if (session.status !== 'paused') return;
    const nowMs = this.nowMs();
    const away = session.pausedAt ? Math.max(0, (nowMs - Date.parse(session.pausedAt)) / 1000) : 0;
    const rest: RestState | null =
      session.rest && session.rest.pausedRemaining !== null
        ? {
            ...session.rest,
            pausedRemaining: null,
            endsAt: new Date(nowMs + session.rest.pausedRemaining * 1000).toISOString(),
          }
        : session.rest;
    const hold: HoldState | null =
      session.hold && session.hold.pausedRemaining !== null
        ? {
            ...session.hold,
            pausedRemaining: null,
            endsAt: new Date(nowMs + session.hold.pausedRemaining * 1000).toISOString(),
          }
        : session.hold;
    this.setSession({
      ...session,
      status: 'active',
      activeSince: this.now(),
      pausedAt: null,
      rest,
      hold,
    });
    if (away >= LONG_INTERRUPTION_SECONDS) {
      await this.recalibrate({ type: 'resume', awaySeconds: Math.round(away) });
    }
  }

  private positionOf(
    session: WorkoutSession,
    entryId: string,
    setIndex: number,
  ): SetPosition | null {
    return (
      workoutSequence(session.workout).find(
        (item) => item.entryId === entryId && item.setIndex === setIndex,
      ) ?? null
    );
  }

  /**
   * Logs or corrects one set. A new log advances the current set and starts
   * the programmed rest; a correction changes only that set. Reps far from
   * target on a working set recalibrate the exercise's remaining sets.
   */
  async logSet(entryId: string, setIndex: number, values: SetValues): Promise<void> {
    const session = this.requireSession();
    if (session.status === 'preview' || session.status === 'completed') {
      throw new Error('Start the workout before logging a set.');
    }
    const entry = allEntries(session.workout.blocks).find((candidate) => candidate.id === entryId);
    const set = entry?.sets.find((candidate) => candidate.index === setIndex);
    if (!entry || !set) throw new Error('That set is no longer in the workout.');
    const now = this.now();
    const nowMs = this.nowMs();
    const reps = Math.max(0, Math.round(values.reps));
    // Zero reps is not a set: it is a skip, and it never feeds the engines.
    const skipped = reps === 0;
    // A 0 on a lift done at bodyweight is the bodyweight, not a load.
    values = { ...values, weight: loggedLoad(getExercise(entry.exerciseId), values.weight) };
    const existingAt = session.completed.sets.findIndex(
      (candidate) => candidate.entryId === entryId && candidate.setIndex === setIndex,
    );
    const isEdit = existingAt >= 0;
    const earlier = isEdit ? (session.completed.sets[existingAt] as CompletedSet) : null;
    // Whether its target was set by hand when it was logged, for the hard start (the review of
    // item 42). A correction keeps what the set said then; a skipped set filled in later is
    // logged now (the re-check).
    const byHand =
      earlier && !earlier.skipped
        ? earlier.byHand === true
        : Boolean(entry.manual?.weight || entry.manual?.reps);
    // The plan's reserve for the lift as it stands now: the hard start reads the set against it,
    // whatever the profile says later (the third pass of item 42). A correction keeps its own.
    const planRir =
      earlier && !earlier.skipped
        ? earlier.planRir
        : set.kind === 'working' && !skipped
          ? this.planRirFor(entry)
          : undefined;
    const logged: CompletedSet = {
      entryId,
      exerciseId: entry.exerciseId,
      setIndex,
      kind: set.kind,
      reps,
      weight: skipped ? null : values.weight,
      rir: skipped ? null : values.rir,
      // A skipped set filled in later is done now: the hard start orders the lifts by it (the
      // third pass of item 42: one skipped first took the place of a lift begun after it).
      completedAt: earlier && !earlier.skipped ? earlier.completedAt : now,
      skipped,
      ...(byHand ? { byHand: true } : {}),
      ...(planRir !== undefined ? { planRir } : {}),
    };
    const sets = isEdit
      ? session.completed.sets.map((candidate, index) =>
          index === existingAt ? logged : candidate,
        )
      : [...session.completed.sets, logged];
    const completed = { ...session.completed, sets };
    const keys = doneKeys(completed);
    const isDone = (id: string, index: number) => keys.has(`${id}:${index}`);
    const next = currentPosition(session.workout, isDone);

    let rest = session.rest;
    if (!isEdit) {
      const position = this.positionOf(session, entryId, setIndex);
      const seconds = position ? restAfter(session.workout, position) : 0;
      rest =
        seconds > 0 && next
          ? {
              entryId,
              setIndex,
              seconds,
              startedAt: now,
              endsAt: new Date(nowMs + seconds * 1000).toISOString(),
              pausedRemaining: null,
              nextLabel: `Next: ${describePosition(session.workout, next)}`,
            }
          : null;
    }
    const resuming = session.status === 'paused';
    this.setSession({
      ...session,
      status: 'active',
      activeSince: resuming ? now : session.activeSince,
      pausedAt: null,
      completed: { ...completed, currentEntryId: next?.entryId ?? null },
      // A log resumes a paused workout, so whatever the pause froze runs again from here.
      rest: resuming ? rearmed(rest, nowMs) : rest,
      // A new log takes the hold's seconds with it; a correction leaves a running hold alone.
      hold: isEdit ? (resuming ? rearmed(session.hold, nowMs) : session.hold) : null,
      // A skip carries no numbers, and a warm-up or drop set carries the wrong ones, so only
      // a working set becomes the next set's prefill.
      drafts:
        skipped || set.kind !== 'working'
          ? session.drafts
          : { ...session.drafts, [entryId]: { weight: values.weight, reps, rir: values.rir } },
    });

    // A hold's seconds are not reps: nothing about them moves the load or the target mid-workout.
    const held = isHold(getExercise(entry.exerciseId));
    // The session just after this tap's own change, if it made one: a hard start it brings on
    // is told with it, and taken back with it (the review of item 42).
    let tapped: WorkoutSession | null = null;
    // The same set's own change failed: its error stays in view, and the start is read on the next
    // set (the third pass of item 42: the hard start's run cleared it).
    let failed = false;
    if (!isEdit && set.kind === 'working' && !skipped && !held) {
      const remaining = entry.sets.filter(
        (candidate) =>
          candidate.kind === 'working' &&
          candidate.index > setIndex &&
          !isDone(entryId, candidate.index),
      ).length;
      if (remaining > 0) {
        const done = this.requireSession().completed.sets;
        const earlier = done
          .filter(
            (candidate) =>
              candidate.entryId === entryId &&
              candidate.kind === 'working' &&
              !candidate.skipped &&
              candidate.setIndex < setIndex,
          )
          .sort((a, b) => a.setIndex - b.setIndex)
          .map((candidate) =>
            outcomeFor(
              entry.sets.find((prescribed) => prescribed.index === candidate.setIndex) ?? set,
              {
                reps: candidate.reps,
                rir: candidate.rir ?? null,
                weight: candidate.weight ?? null,
              },
            ),
          );
        const units = this.state.profile?.units ?? 'lb';
        const exercise = getExercise(entry.exerciseId);
        const plan = autoregulate({
          set: outcomeFor(set, { reps, rir: values.rir, weight: values.weight }),
          earlier,
          step: exercise
            ? loadingFor(this.currentLocation()?.loading, session.loading, exercise, units).step
            : 5,
          remaining,
          setNumber: earlier.length + 1,
          units,
        });
        if (plan.kind !== 'none') {
          const performed = await this.recalibrate({
            type: 'performance',
            entryId,
            setIndex,
            actualReps: reps,
            actualWeight: values.weight,
            plan,
          });
          if (performed?.ok) tapped = this.requireSession();
          else if (performed) failed = true;
        }
      }
    }
    if (set.kind === 'working' && !skipped) this.settleDropSet(entryId);
    if (set.kind === 'working' && !failed) await this.settleStart(tapped);
  }

  /** The reserve the plan asks for an entry's lift and role today, before the day's settings. */
  private planRirFor(entry: WorkoutEntry): number | undefined {
    const exercise = getExercise(entry.exerciseId);
    const profile = this.state.profile;
    if (!exercise || !profile) return undefined;
    return prescribeFor(exercise, entry.role, profile, this.state.history).rir;
  }

  /**
   * How the workout started (Maintenance 26, the owner's item 42, docs/research/bad-start.md): when
   * the first two lifts that can be judged both fell well short, the rest is rebuilt with a low
   * check-in's treatment; when an undo or a correction takes that back, without it. A change the
   * lifter took back stays taken back while the start reads the same, and one that could not be
   * made is not tried again for the same reading (the review of item 42). `tapped` is the session
   * just after the same tap's own change: told with this one, and taken back with it.
   */
  private async settleStart(tapped: WorkoutSession | null = null): Promise<void> {
    const session = this.state.session;
    if (!session || session.status === 'preview' || session.status === 'completed') return;
    const reading = this.readStartOf(session);
    if (!reading || reading.low === Boolean(session.constraints.badStart)) return;
    // A change the lifter took back, or one that could not be made, is not made again: the run
    // reads the start again as it begins and checks both (the fourth pass of item 42).
    const key = startKey(reading);
    const result = await this.recalibrate({
      type: 'bad-start',
      low: reading.low,
      lifts: reading.lifts,
    });
    // A run on a workout discarded meanwhile gives nothing back (`runCalibration`).
    const made = this.state.session;
    // A change that could not be made is kept with the session: not tried again on every later
    // set while the start reads the same, and a new session reads its own (the re-check of 42).
    if (result && !result.ok && made) {
      this.setSession({ ...made, startFailed: key });
      return;
    }
    if (!result?.ok || !tapped || !made?.lastSummary || !tapped.lastSummary) return;
    // Told with the set's own change only when nothing ran between them: Undo takes back both,
    // and never a third (the third pass).
    if (made.previous?.workout !== tapped.workout) return;
    this.setSession({
      ...made,
      lastSummary: {
        ...made.lastSummary,
        headline: `${made.lastSummary.headline} Also from this set: ${tapped.lastSummary.headline}`,
      },
      lastChanges: [...tapped.lastChanges, ...made.lastChanges],
      previous: tapped.previous,
    });
  }

  /** How a session's workout started (`readStart`), each lift read against the plan's reserve. */
  private readStartOf(session: WorkoutSession): StartReading | null {
    const profile = this.state.profile;
    if (!profile) return null;
    return readStart(session.workout.blocks, session.completed.sets, {
      profile,
      history: this.state.history,
    });
  }

  /**
   * Once the last working set of an exercise is logged, its drop set takes a
   * load from the weight actually lifted. Until then the drop set carries no
   * load of its own, so it can never come out heavier than the sets before it.
   */
  private settleDropSet(entryId: string): void {
    const session = this.requireSession();
    const entry = allEntries(session.workout.blocks).find((candidate) => candidate.id === entryId);
    if (!entry) return;
    const isDone = this.isDoneFor(session);
    const drop = pendingDropSet(entry, isDone);
    if (!drop) return;
    const workingLeft = entry.sets.some(
      (candidate) => candidate.kind === 'working' && !isDone(entry.id, candidate.index),
    );
    if (workingLeft) return;
    const lifted = session.completed.sets
      .filter((done) => done.entryId === entryId && done.kind === 'working' && !done.skipped)
      .sort((a, b) => a.setIndex - b.setIndex);
    const last = lifted[lifted.length - 1];
    if (!last || last.weight === null || last.weight <= 0) return;
    const exercise = getExercise(entry.exerciseId);
    const units = this.state.profile?.units ?? 'lb';
    const loading = exercise
      ? loadingFor(this.currentLocation()?.loading, session.loading, exercise, units)
      : null;
    const dropped = dropSetWeight(last.weight, loading?.step ?? 5);
    const weight = loading ? fitWeight(dropped, loading) : dropped;
    if (drop.targetWeight === weight) return;
    this.setSession({
      ...session,
      workout: {
        ...session.workout,
        blocks: withDropWeight(session.workout.blocks, entryId, weight),
      },
    });
  }

  /**
   * Skips what is left of an exercise. With nothing logged the engine removes
   * it and rebalances the session. With something logged the logged sets stay,
   * the rest are recorded as skipped so the record shows the exercise was cut
   * short, and nothing is removed, so no logged work is ever at risk.
   */
  async skipExercise(
    entryId: string,
  ): Promise<{ kind: 'removed' | 'trimmed' | 'unchanged'; skippedSets: number; name: string }> {
    const session = this.requireSession();
    const entry = allEntries(session.workout.blocks).find((candidate) => candidate.id === entryId);
    if (!entry) throw new Error('That exercise is no longer in the workout.');
    const name = requireExercise(entry.exerciseId).name;
    const logged = session.completed.sets.some((done) => done.entryId === entryId);
    if (!logged) {
      // Removed only when the change was made: one that failed, or was left, says why on its own
      // (the seventh pass of item 42).
      const result = await this.recalibrate({ type: 'skip', entryId });
      return { kind: result?.ok ? 'removed' : 'unchanged', skippedSets: 0, name };
    }
    const isDone = this.isDoneFor(session);
    const remaining = entry.sets.filter((set) => !isDone(entry.id, set.index));
    if (remaining.length === 0) {
      throw new Error(`Every set of ${name} is already logged. Edit a set from its row instead.`);
    }
    this.markSkipped(
      session,
      entryId,
      entry.exerciseId,
      remaining.map((set) => ({ index: set.index, kind: set.kind })),
    );
    return { kind: 'trimmed', skippedSets: remaining.length, name };
  }

  private markSkipped(
    session: WorkoutSession,
    entryId: string,
    exerciseId: string,
    targets: readonly { index: number; kind: CompletedSet['kind'] }[],
  ): void {
    if (targets.length === 0) return;
    const sets = [
      ...session.completed.sets,
      ...targets.map((set) => ({
        entryId,
        exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: 0,
        weight: null,
        rir: null,
        completedAt: this.now(),
        skipped: true,
      })),
    ];
    const keys = new Set(sets.map((c) => `${c.entryId}:${c.setIndex}`));
    const next = currentPosition(session.workout, (id, index) => keys.has(`${id}:${index}`));
    this.setSession({
      ...session,
      completed: { ...session.completed, sets, currentEntryId: next?.entryId ?? null },
      rest: null,
      hold: null,
    });
  }

  /** A skipped set is done for planning and carries no work. */
  skipSet(entryId: string, setIndex: number): void {
    const session = this.requireSession();
    if (session.status === 'preview' || session.status === 'completed') return;
    const entry = allEntries(session.workout.blocks).find((candidate) => candidate.id === entryId);
    const set = entry?.sets.find((candidate) => candidate.index === setIndex);
    if (!entry || !set) return;
    if (session.completed.sets.some((c) => c.entryId === entryId && c.setIndex === setIndex))
      return;
    this.markSkipped(session, entryId, entry.exerciseId, [set]);
  }

  /** Skips every remaining ramp set of an exercise; ramp sets never count as work. */
  skipWarmup(entryId: string): void {
    const session = this.requireSession();
    const entry = allEntries(session.workout.blocks).find((candidate) => candidate.id === entryId);
    if (!entry || session.status === 'preview' || session.status === 'completed') return;
    const keys = doneKeys(session.completed);
    const pending = entry.sets.filter(
      (set) => set.kind === 'warmup' && !keys.has(`${entryId}:${set.index}`),
    );
    this.markSkipped(session, entryId, entry.exerciseId, pending);
  }

  /** Removes the most recently logged set and cancels its rest. */
  undoLastSet(): void {
    const session = this.requireSession();
    if (session.completed.sets.length === 0) return;
    const sets = session.completed.sets.slice(0, -1);
    const keys = new Set(sets.map((c) => `${c.entryId}:${c.setIndex}`));
    const next = currentPosition(session.workout, (id, index) => keys.has(`${id}:${index}`));
    this.setSession({
      ...session,
      completed: { ...session.completed, sets, currentEntryId: next?.entryId ?? null },
      rest: null,
      hold: null,
    });
    void this.settleStart();
  }

  /** Removes one logged set (from an inline correction). */
  deleteLoggedSet(entryId: string, setIndex: number): void {
    const session = this.requireSession();
    const sets = session.completed.sets.filter(
      (c) => !(c.entryId === entryId && c.setIndex === setIndex),
    );
    if (sets.length === session.completed.sets.length) return;
    const keys = new Set(sets.map((c) => `${c.entryId}:${c.setIndex}`));
    const next = currentPosition(session.workout, (id, index) => keys.has(`${id}:${index}`));
    const hold = session.hold;
    this.setSession({
      ...session,
      completed: { ...session.completed, sets, currentEntryId: next?.entryId ?? null },
      // A countdown stays only while its set is still the one in front of the lifter.
      hold: hold && next?.entryId === hold.entryId && next.setIndex === hold.setIndex ? hold : null,
    });
    void this.settleStart();
  }

  setDraft(entryId: string, draft: SetDraft): void {
    const session = this.requireSession();
    this.setSession({ ...session, drafts: { ...session.drafts, [entryId]: draft } });
  }

  adjustRest(deltaSeconds: number): void {
    const session = this.requireSession();
    if (!session.rest) return;
    this.setSession({ ...session, rest: restLongerBy(session.rest, deltaSeconds) });
  }

  /**
   * The coach's longer rest, tapped (Maintenance 25): the rest running gets the seconds, and the
   * offer is marked as taken for the set that fell short in the same change, so the button never
   * comes back for that set. Once the rest is over, the rest running is before another lift's set,
   * or a newer set of the lift is logged, nothing changes and the error says why. False when the
   * coach already lengthened this rest: a second tap adds nothing.
   */
  takeCoachRest(
    signal: Pick<CoachSignal, 'source' | 'exerciseId' | 'headline' | 'occasion'>,
    deltaSeconds: number,
  ): boolean {
    const session = this.requireSession();
    const rest = session.rest;
    if (
      !rest ||
      !restRunning(rest, this.now()) ||
      (signal.occasion !== undefined &&
        !restOfferStands(session.workout, session.completed, rest, signal.occasion))
    ) {
      throw new Error('That rest is over: the next set can start.');
    }
    const key = acceptKey(signal);
    // Taken already for this rest (a second tap before the card went): nothing more to add.
    if (
      session.coachAccepted.includes(key) ||
      restLengthened(session.workout, session.completed, rest, session.coachAccepted)
    ) {
      return false;
    }
    this.setSession({
      ...session,
      rest: restLongerBy(rest, deltaSeconds),
      coachAccepted: [...session.coachAccepted, key],
    });
    return true;
  }

  skipRest(): void {
    const session = this.requireSession();
    if (!session.rest) return;
    this.setSession({ ...session, rest: null });
  }

  /**
   * Starts a hold's countdown for a set of a held exercise. Holding means the rest is over, so a
   * running rest ends here; starting again replaces the countdown.
   */
  startHold(entryId: string, setIndex: number, seconds: number): void {
    const session = this.requireSession();
    if (session.status !== 'active') return;
    const entry = allEntries(session.workout.blocks).find((candidate) => candidate.id === entryId);
    if (!entry || !isHold(getExercise(entry.exerciseId))) return;
    if (!entry.sets.some((set) => set.index === setIndex)) return;
    const length = Math.max(1, Math.round(seconds));
    const nowMs = this.nowMs();
    this.setSession({
      ...session,
      rest: null,
      hold: {
        entryId,
        setIndex,
        seconds: length,
        startedAt: this.now(),
        endsAt: new Date(nowMs + length * 1000).toISOString(),
        pausedRemaining: null,
        held: null,
      },
    });
  }

  /** Stops a hold before its end: the seconds held so far become the set's seconds. */
  stopHold(): void {
    const session = this.requireSession();
    const hold = session.hold;
    if (!hold || hold.held !== null) return;
    const nowMs = this.nowMs();
    const left =
      hold.pausedRemaining !== null
        ? hold.pausedRemaining
        : Math.max(0, (Date.parse(hold.endsAt) - nowMs) / 1000);
    const held = Math.max(0, Math.min(hold.seconds, Math.floor(hold.seconds - left)));
    this.setSession({ ...session, hold: { ...hold, pausedRemaining: null, held } });
  }

  /** Per-exercise notes and cue memory, kept with the user's custom content and backed up. */
  async saveExerciseNotes(
    exerciseId: string,
    input: { notes: string; cues: string[] },
  ): Promise<void> {
    const existing = this.state.customInstructions.find((item) => item.exerciseId === exerciseId);
    const record = CustomInstructionSchema.parse({
      id: exerciseId,
      exerciseId,
      setup: existing?.setup ?? [],
      execution: existing?.execution ?? [],
      cues: input.cues.map((cue) => cue.trim()).filter((cue) => cue.length > 0),
      notes: input.notes.trim(),
      updatedAt: this.now(),
    });
    const db = await this.getDatabase();
    const receipt = await putVerified(db, 'customInstructions', record, { now: this.now });
    const customInstructions = [
      ...this.state.customInstructions.filter((item) => item.exerciseId !== exerciseId),
      record,
    ];
    this.setState({
      customInstructions,
      lastReceipt: receipt,
      customCounts: { ...this.state.customCounts, instructions: customInstructions.length },
    });
  }

  /** Saves the durable record (one entry per exercise) and shows the completion summary. */
  async finishWorkout(
    rating: SessionRating | null,
    options: { endedEarly?: boolean } = {},
  ): Promise<CompletionSummary> {
    const session = this.requireSession();
    if (session.status === 'preview') throw new Error('Start the workout before finishing it.');
    if (session.status === 'completed' && session.completion) return session.completion;
    const profile = this.state.profile;
    if (!profile) throw new Error('No profile.');
    const now = this.now();
    const elapsed = elapsedSeconds(session, this.nowMs());
    const record = buildWorkoutRecord(session, {
      now,
      elapsedSeconds: elapsed,
      rating,
      endedEarly: options.endedEarly ?? false,
    });
    record.prs = detectPersonalRecords(record, this.state.history, profile.units);
    const db = await this.getDatabase();
    const receipt = await putVerified(db, 'workouts', record, { now: this.now });
    const completion = buildCompletion(session, record, profile, this.state.history);
    this.setState({
      history: parseWorkoutRecords([...this.state.history, record]),
      workoutCount: this.state.workoutCount + 1,
      lastReceipt: receipt,
    });
    await this.reconcileCoachRoutes(db, profile, now);
    await this.reconcileCoachFocus(db, record);
    this.setSession({
      ...session,
      status: 'completed',
      activeSince: null,
      pausedAt: null,
      rest: null,
      hold: null,
      rating,
      completion,
      completed: { ...session.completed, elapsedSeconds: elapsed },
    });
    this.pendingWork = this.snapshotBackup('workout').then(
      () => undefined,
      () => undefined,
    );
    return completion;
  }

  /** Saves today's workout to reuse later; the saved copy is a plain snapshot. */
  async saveCurrentWorkout(name: string): Promise<SavedWorkout> {
    const session = this.requireSession();
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Give the workout a name.');
    const saved: SavedWorkout = {
      id: `saved-${this.now().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed.slice(0, 60),
      createdAt: this.now(),
      locationId: session.workout.locationId,
      duration: session.duration,
      // The plan under a hard start's ease, with no marks: the ease of today is no part of a plan
      // for another day (Maintenance 26, the sixth and seventh passes of item 42).
      workout: planUnderTheEase(session.workout),
    };
    const db = await this.getDatabase();
    const receipt = await putVerified(db, 'savedWorkouts', saved, { now: this.now });
    this.setState({ savedWorkouts: [saved, ...this.state.savedWorkouts], lastReceipt: receipt });
    return saved;
  }

  async deleteSavedWorkout(id: string): Promise<void> {
    const db = await this.getDatabase();
    await deleteVerified(db, 'savedWorkouts', id);
    this.setState({ savedWorkouts: this.state.savedWorkouts.filter((item) => item.id !== id) });
  }

  /** Starts a fresh preview session from a saved workout; everything after that recalibrates as usual. */
  loadSavedWorkout(id: string): void {
    const saved = this.state.savedWorkouts.find((item) => item.id === id);
    const session = this.state.session;
    if (!saved || !session || session.status !== 'preview') return;
    const now = this.now();
    // Made fresh: an exercise stopped on the day it was saved does not come back stopped, and a
    // plan saved before Maintenance 25 says each fitting step once.
    // Its targets were read on the day it was saved: a hard start does not read them (the third
    // pass of item 42).
    const fresh = asSaved(explanationOnce(withoutStops(saved.workout)));
    const workout = {
      ...fresh,
      id: `wk-${now.slice(0, 10)}-saved-${saved.id}`,
      generatedAt: now,
      recalibration: { version: 1, lastTrigger: null },
      // Its lines about kept swaps say what is true now, not when it was saved.
      explanation: {
        ...fresh.explanation,
        reasons: withSwapLines(fresh.explanation.reasons, fresh.blocks, this.activeSwaps()),
      },
    };
    const headline = `Loaded "${saved.name}".`;
    this.setSession({
      ...createSession(this.baseKey() ?? session.baseKey, workout, now),
      duration: saved.duration,
      lastSummary: {
        headline,
        details: [
          `Saved ${saved.createdAt.slice(0, 10)}. Change the length or any exercise and it recalibrates as usual.`,
        ],
        counts: {
          added: 0,
          removed: 0,
          replaced: 0,
          adjusted: 0,
          supersetsAdded: 0,
          supersetsRemoved: 0,
          setsTrimmed: 0,
        },
      },
      log: [
        {
          at: now,
          trigger: 'saved-workout',
          label: 'Saved workout',
          scope: 'full' as const,
          headline,
          durationMs: 0,
        },
      ],
    });
  }

  /** Leaves the completion surface; the next session is generated from the new history. */
  dismissCompletion(): void {
    const session = this.state.session;
    if (!session || session.status !== 'completed') return;
    clearSession(this.storage);
    this.setState({ session: null });
    this.ensureSession();
  }

  /** Ends the workout without saving anything; a fresh preview is generated as usual. */
  discardWorkout(): void {
    const session = this.state.session;
    if (!session || session.status === 'preview' || session.status === 'completed') return;
    clearSession(this.storage);
    this.setState({ session: null });
    this.ensureSession();
  }

  // ---------------------------------------------------------------- custom content

  async addCustomExercise(input: NewCustomExercise): Promise<CustomExercise> {
    const now = this.now();
    const id = `${CUSTOM_ID_PREFIX}${slugify(input.name) || 'exercise'}-${now.replace(/\D/g, '').slice(8, 14)}`;
    const record = CustomExerciseSchema.parse({
      id,
      custom: true,
      name: input.name.trim(),
      primaryMuscles: input.primaryMuscles,
      secondaryMuscles: input.secondaryMuscles ?? [],
      movementPattern: input.movementPattern,
      equipment: input.equipment.length > 0 ? input.equipment : [[]],
      load: input.load,
      notes: input.notes ?? '',
      createdAt: now,
      updatedAt: now,
    });
    const db = await this.getDatabase();
    const receipt = await putVerified(db, 'customExercises', record, { now: this.now });
    const customExercises = [...this.state.customExercises, record];
    registerCustomExercises(customExercises.map(customToCatalogExercise));
    this.setState({
      customExercises,
      lastReceipt: receipt,
      customCounts: { ...this.state.customCounts, exercises: customExercises.length },
    });
    return record;
  }

  /** One user-owned demonstration per exercise; stored inline and backed up. */
  async addCustomMedia(exerciseId: string, media: NewCustomMedia): Promise<CustomMedia> {
    const record = CustomMediaSchema.parse({
      id: exerciseId,
      exerciseId,
      kind: media.kind,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      dataUrl: media.dataUrl,
      source: 'user',
      createdAt: this.now(),
    });
    const run = this.mediaWrites.then(async () => {
      const db = await this.getDatabase();
      this.mediaVersion += 1;
      let written = false;
      try {
        const receipt = await putVerified(db, 'customMedia', record, { now: this.now });
        written = true;
        this.setState({ lastReceipt: receipt });
        return record;
      } catch (error) {
        // A put that landed before its check failed: read once more, and the picture picked found
        // there is saved (the eighth pass of item 50: an error was said over it, saved and shown).
        written = await db.get<Identified>('customMedia', exerciseId).then(
          (raw) => structurallyEqual(raw, record),
          () => false,
        );
        if (!written) throw error;
        return record;
      } finally {
        // A picture verified written is one at least, whatever the count can say (the sixth pass:
        // a count that failed after a first pick hid it).
        await this.mediaWritten(db, written ? 1 : 0);
      }
    });
    // The queue keeps no result: a picked file is not held in memory until the next write (the
    // fifth pass of item 50).
    this.mediaWrites = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Every media write ends here, written or not: the count is what the database holds, the second
   * mark is made (a hydrate that began after the first counted before the write: the third pass of
   * item 50), and every picture is read again, so a write that failed part-way never leaves the
   * screen showing what the database no longer has (the fifth pass).
   */
  private async mediaWritten(
    db: Database,
    atLeast = 0,
    /** The exercise whose picture this write removed. */
    removed: string | null = null,
  ): Promise<void> {
    const counted = await db.count('customMedia').catch(() => null);
    const media =
      counted ?? (atLeast > 0 ? Math.max(atLeast, this.state.customCounts.media) : null);
    this.mediaVersion += 1;
    const revision = this.state.customMediaRevision + 1;
    this.setState({
      ...(media !== null ? { customCounts: { ...this.state.customCounts, media } } : {}),
      customMediaRevision: revision,
      ...(removed !== null
        ? { customMediaGone: { ...this.state.customMediaGone, [removed]: revision } }
        : {}),
    });
  }

  async getCustomMedia(exerciseId: string): Promise<CustomMedia | null> {
    const db = await this.getDatabase();
    const raw = await db.get<Identified>('customMedia', exerciseId);
    if (!raw) return null;
    const parsed = CustomMediaSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  /** Removes the user's demonstration for an exercise; the placeholder returns. */
  deleteCustomMedia(exerciseId: string): Promise<void> {
    const run = this.mediaWrites.then(async () => {
      const db = await this.getDatabase();
      // One already gone (another window, a removal that failed after it landed) is removed again,
      // harmlessly, and the screen is brought up to date (the fifth pass of item 50).
      this.mediaVersion += 1;
      let gone = false;
      try {
        await deleteVerified(db, 'customMedia', exerciseId);
        gone = true;
      } catch (error) {
        // A delete that landed before its check failed: read once more, and none found is removed
        // (the eighth pass of item 50: the store, not each screen, says what the write did).
        gone = await db.get<Identified>('customMedia', exerciseId).then(
          (raw) => raw === undefined,
          () => false,
        );
        if (!gone) throw error;
      } finally {
        await this.mediaWritten(db, 0, gone ? exerciseId : null);
      }
    });
    this.mediaWrites = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // ---------------------------------------------------------------- durable data

  async saveProfile(profile: UserProfile): Promise<SaveReceipt> {
    const previous = this.state.profile;
    const next = alignLegacyStyle(
      normalizeProfile(UserProfileSchema.parse({ ...profile, updatedAt: this.now() })),
    );
    const db = await this.getDatabase();
    const receipt = await putVerified(db, 'profile', next, { now: this.now });
    this.setState({ profile: next, lastReceipt: receipt, error: null });
    if (!this.state.session) {
      this.ensureSession();
      return receipt;
    }
    const trigger = previous ? profileTrigger(previous, next) : null;
    if (trigger && this.state.session.status !== 'completed') {
      // A new place: a weight carried on the dial that it cannot make goes before the rebuild,
      // as with a change of weights (Maintenance 23).
      if (trigger.type === 'location') this.dropUnloadableDrafts();
      await this.recalibrate(trigger);
    } else this.syncSessionKey();
    return receipt;
  }

  /**
   * Records what a place can load for one exercise, or its dumbbells or plates,
   * and re-fits the session's loads to it. Nothing else in the session moves.
   */
  async saveLoading(locationId: string, key: string, spec: LoadingSpec | null): Promise<void> {
    const location = this.state.locations.find((candidate) => candidate.id === locationId);
    if (!location) throw new Error('That place is no longer saved.');
    const loading = { ...location.loading };
    if (spec) loading[key] = LoadingSpecSchema.parse(spec);
    else delete loading[key];
    await this.saveLocation({ ...location, loading });
    const session = this.state.session;
    if (
      session &&
      session.status !== 'completed' &&
      this.state.profile?.currentLocationId === locationId
    ) {
      // Before the rebuild, so the dial the rebuild brings up starts from the refitted target.
      this.dropUnloadableDrafts();
      await this.recalibrate({ type: 'loading' });
    }
  }

  /** Plates that are not around today; the session re-fits its loads and its plate lines. */
  async setMissingPlates(plates: readonly number[]): Promise<void> {
    const session = this.requireSession();
    const missingPlates = [...new Set(plates)].sort((a, b) => b - a);
    this.setSession({ ...session, loading: { ...session.loading, missingPlates } });
    if (session.status !== 'completed') {
      this.dropUnloadableDrafts();
      await this.recalibrate({ type: 'loading' });
    }
  }

  /**
   * The dial starts the next set from the weight the last one used. When the weights here
   * change and cannot make that weight any more, it starts from the refitted target instead.
   */
  private dropUnloadableDrafts(): void {
    const session = this.state.session;
    const units = this.state.profile?.units;
    if (!session || !units) return;
    const drafts = { ...session.drafts };
    let dropped = false;
    for (const [entryId, draft] of Object.entries(drafts)) {
      if (draft.weight === null) continue;
      const entry = allEntries(session.workout.blocks).find(
        (candidate) => candidate.id === entryId,
      );
      if (!entry) continue;
      const exercise = requireExercise(entry.exerciseId);
      const available = loadingFor(
        this.currentLocation()?.loading,
        session.loading,
        exercise,
        units,
      ).available;
      const weight = draft.weight;
      if (available === null || available.some((each) => Math.abs(each - weight) < 1e-6)) continue;
      delete drafts[entryId];
      dropped = true;
    }
    if (dropped) this.setSession({ ...session, drafts });
  }

  async saveLocation(location: LocationProfile): Promise<SaveReceipt> {
    const previous = this.state.locations.find((candidate) => candidate.id === location.id);
    const next = LocationProfileSchema.parse({ ...location, updatedAt: this.now() });
    const db = await this.getDatabase();
    const receipt = await putVerified(db, 'locations', next, { now: this.now });
    const others = this.state.locations.filter((candidate) => candidate.id !== next.id);
    this.setState({ locations: sortLocations([...others, next]), lastReceipt: receipt });
    const isCurrent = this.state.profile?.currentLocationId === next.id;
    if (
      isCurrent &&
      this.state.session &&
      this.state.session.status !== 'completed' &&
      previous &&
      !sameEquipment(previous.equipment, next.equipment)
    ) {
      await this.recalibrate({ type: 'equipment' });
    } else {
      this.syncSessionKey();
    }
    return receipt;
  }

  /** Home can never be deleted; deleting the current location falls back to Home. */
  async deleteLocation(id: string): Promise<void> {
    if (id === HOME_LOCATION_ID) {
      throw new Error('The Home location cannot be deleted.');
    }
    const db = await this.getDatabase();
    // Not while the first walk after a clearing is pending: the place may be the owner's own,
    // coming back, and its barcode, which the cloud copy never holds, would go for good (the
    // tenth review's fifth re-check).
    const birth = await readDatabaseBirth(db).catch(() => ({ at: null, walkedAt: null }));
    if (this.state.cloud.configured && birth.at !== null && birth.walkedAt === null) {
      throw new Error(
        'Your places are still coming back from the cloud copy: remove a place once that is done.',
      );
    }
    // Its barcode goes with it, from both copies, whether or not this window's list shows one
    // (another window may have saved it), and first: a barcode that cannot be removed keeps its
    // place, so Delete again is a real retry. Both under the barcode lock, so a save in another
    // window comes before (and goes with the place) or finds the place gone (the re-checks).
    await this.withBarcodeLock(async () => {
      await this.removeBarcodeNow(db, id);
      await deleteVerified(db, 'locations', id);
    });
    const locations = this.state.locations.filter((location) => location.id !== id);
    this.setState({ locations });
    if (this.state.barcodeSheet === id) this.setState({ barcodeSheet: null });
    if (this.state.profile?.currentLocationId === id) {
      await this.saveProfile({ ...this.state.profile, currentLocationId: HOME_LOCATION_ID });
    }
  }

  /**
   * Runs a barcode change, or the second copy's upkeep, alone: after the one before it in this
   * window and, where the browser has Web Locks, never beside one in another window of the app.
   * Each reads the database and the second copy inside, so none writes from a read another has
   * overtaken (the tenth review's re-check: a reload put a code-only copy over a picture saved
   * while it ran, and wrote a barcode removed meanwhile back into the second copy).
   */
  private withBarcodeLock<T>(work: () => Promise<T>): Promise<T> {
    const locks: LockManager | undefined =
      typeof navigator === 'undefined' ? undefined : navigator.locks;
    const run = async (): Promise<T> => {
      if (!locks) return work();
      let started = false;
      let result!: T;
      try {
        await locks.request(BARCODE_LOCK, async () => {
          started = true;
          result = await work();
        });
      } catch (error) {
        if (started) throw error;
        // No lock to be had here: this window's own queue still keeps its changes in order.
        return work();
      }
      return result;
    };
    const next = this.barcodeQueue.then(run, run);
    this.barcodeQueue = next.catch(() => undefined);
    return next;
  }

  /**
   * Brings back each barcode the database lost from the phone's second copy, then makes the
   * second copy hold every barcode the database holds, one entry at a time (Maintenance 25). A
   * barcode whose write back fails stays in the second copy and shows this open (the tenth review:
   * the rewrite used to drop it). It reads both copies under the barcode lock, never from the
   * opening's earlier read: a barcode saved since is in the database, not lost.
   */
  private async reconcileBarcodes(
    db: Database,
    read: PlaceBarcode[],
  ): Promise<{ all: PlaceBarcode[]; restored: string[] }> {
    return this.withBarcodeLock(() => this.reconcileBarcodesNow(db, read));
  }

  private async reconcileBarcodesNow(
    db: Database,
    read: PlaceBarcode[],
  ): Promise<{ all: PlaceBarcode[]; restored: string[] }> {
    try {
      const held = parsePlaceBarcodes(await db.getAll<Identified>('device'));
      const ids = new Set(held.map((barcode) => barcode.id));
      const lost = readBarcodeMirror(this.storage).filter((barcode) => !ids.has(barcode.id));
      const restored: PlaceBarcode[] = [];
      const unrestored: PlaceBarcode[] = [];
      for (const barcode of lost) {
        try {
          await putVerified(db, 'device', barcode, { now: this.now });
          restored.push(barcode);
        } catch {
          unrestored.push(barcode);
        }
      }
      // The database as it is now, the barcodes brought back included.
      const current = parsePlaceBarcodes(await db.getAll<Identified>('device'));
      for (const barcode of current) keepInMirror(this.storage, barcode);
      // A barcode whose write back failed keeps its entry, so the next open tries again.
      const currentIds = new Set(current.map((barcode) => barcode.id));
      for (const barcode of current) this.shrinkForMirror(barcode);
      return {
        all: [...current, ...unrestored.filter((barcode) => !currentIds.has(barcode.id))],
        restored: restored.map((barcode) => barcode.id).filter((id) => currentIds.has(id)),
      };
    } catch {
      // A second copy that cannot be read or healed never stops the app opening.
      return { all: read, restored: [] };
    }
  }

  /** A place's barcode as the database holds it now, read inside the barcode lock. */
  private async storedBarcode(db: Database, id: string): Promise<PlaceBarcode | undefined> {
    const raw = await db.get<Identified>('device', id);
    return raw ? parsePlaceBarcodes([raw])[0] : undefined;
  }

  /**
   * Shows a place's barcode as stored: replaced in the list, added, or taken out of it, with what
   * the second copy holds of it (the cloud card reads that).
   */
  private showBarcode(locationId: string, barcode: PlaceBarcode | undefined): void {
    const listed = this.state.barcodes.some((item) => item.locationId === locationId);
    if (!barcode && !listed) return;
    this.barcodesVersion += 1;
    const barcodes = barcode
      ? listed
        ? this.state.barcodes.map((item) => (item.locationId === locationId ? barcode : item))
        : [...this.state.barcodes, barcode]
      : this.state.barcodes.filter((item) => item.locationId !== locationId);
    const id = barcodeIdFor(locationId);
    const barcodeCopies = { ...this.state.barcodeCopies };
    if (barcode) barcodeCopies[id] = mirrorCopyOf(this.storage, barcode);
    else delete barcodeCopies[id];
    this.setState({ barcodes, barcodeCopies });
  }

  /** What the second copy holds of each barcode, read back now. */
  private copiesOf(barcodes: readonly PlaceBarcode[]): Record<string, MirrorCopy> {
    return Object.fromEntries(
      barcodes.map((barcode) => [barcode.id, mirrorCopyOf(this.storage, barcode)]),
    );
  }

  /** The picture the second copy keeps for this very version of a barcode, if any. */
  private mirroredImage(barcode: PlaceBarcode): MirrorPicture | undefined {
    const kept = readBarcodeMirror(this.storage).find((item) => item.id === barcode.id);
    return kept && kept.updatedAt === barcode.updatedAt ? kept.image : undefined;
  }

  /** Keeps one barcode's entry in the second copy, the others as they are, and says what stuck. */
  private keepBarcodeCopy(barcode: PlaceBarcode, smaller?: MirrorPicture): void {
    const copy = keepInMirror(this.storage, barcode, smaller);
    if (this.state.barcodeCopies[barcode.id] !== copy) {
      this.setState({ barcodeCopies: { ...this.state.barcodeCopies, [barcode.id]: copy } });
    }
  }

  /**
   * Makes a smaller copy of a big picture for the second copy, in the background, and keeps it
   * only for the barcode as the database still holds it (not the screen's list, which the app
   * opening may not have filled yet: the tenth review).
   */
  private shrinkForMirror(barcode: PlaceBarcode): void {
    const picture = barcode.image;
    if (!this.shrinkPicture || !picture || picture.dataUrl.length <= MIRROR_PICTURE_MAX) return;
    if (mirrorCopyOf(this.storage, barcode) === 'picture') return;
    const shrink = this.shrinkPicture;
    const work = (async () => {
      const copy = await shrink(picture).catch(() => null);
      if (!copy) return;
      const db = await this.getDatabase();
      await this.withBarcodeLock(async () => {
        const stored = await db.get<PlaceBarcode>('device', barcode.id).catch(() => undefined);
        if (!stored || stored.updatedAt !== barcode.updatedAt) return;
        this.keepBarcodeCopy(barcode, copy);
      });
    })();
    this.pendingWork = this.pendingWork.then(() => work);
  }

  private barcodeFor(locationId: string | undefined): PlaceBarcode | undefined {
    if (!locationId) return undefined;
    return this.state.barcodes.find((barcode) => barcode.locationId === locationId);
  }

  /** Saves a place's barcode on this device only; a new one shows at Start unless switched off. */
  async saveBarcode(locationId: string, picked: PickedBarcode): Promise<SaveReceipt> {
    if (!this.state.locations.some((location) => location.id === locationId)) {
      throw new Error('That place is no longer saved.');
    }
    const db = await this.getDatabase();
    const id = barcodeIdFor(locationId);
    let record: PlaceBarcode | null = null;
    const receipt = await this.withBarcodeLock(async () => {
      // The place as stored: another window may have deleted it, and a barcode saved for it
      // then could never be removed (the tenth review's second re-check).
      if (!(await db.get<Identified>('locations', locationId))) {
        throw new Error('That place is no longer saved.');
      }
      // The switch and the first time come from the barcode as stored, not this window's list,
      // which another window may have overtaken (the tenth review's re-check).
      const previous = await this.storedBarcode(db, id);
      const now = this.now();
      const made = PlaceBarcodeSchema.parse({
        id,
        locationId,
        image: picked.image,
        ...(picked.code ? { code: picked.code } : {}),
        autoShow: previous?.autoShow ?? true,
        addedAt: previous?.addedAt ?? now,
        updatedAt: now,
      });
      record = made;
      const saved = await putVerified(db, 'device', made, { now: this.now });
      this.barcodesVersion += 1;
      const barcodes = [
        ...this.state.barcodes.filter((item) => item.locationId !== locationId),
        made,
      ];
      this.setState({
        barcodes,
        restoredBarcodes: this.state.restoredBarcodes.filter((item) => item !== id),
        lastReceipt: saved,
      });
      // The second copy, at once with the code; a big picture's smaller copy follows.
      this.keepBarcodeCopy(made);
      return saved;
    });
    if (record) this.shrinkForMirror(record);
    return receipt;
  }

  async setBarcodeAutoShow(locationId: string, autoShow: boolean): Promise<void> {
    const db = await this.getDatabase();
    const id = barcodeIdFor(locationId);
    const record = await this.withBarcodeLock(async () => {
      // From the barcode as stored: this window's list may be out of date (another window saved a
      // new picture or removed it, or a Replace here ran first), and an old picture or a removed
      // barcode must never come back with the switch (the tenth review's re-check).
      const stored = await this.storedBarcode(db, id);
      if (!stored || stored.autoShow === autoShow) {
        this.showBarcode(locationId, stored);
        return null;
      }
      const next = { ...stored, autoShow, updatedAt: this.now() };
      // Same picture, new time: the second copy keeps the picture it had (a smaller copy too).
      const kept = this.mirroredImage(stored);
      await putVerified(db, 'device', next, { now: this.now });
      this.showBarcode(locationId, next);
      this.keepBarcodeCopy(next, kept);
      return next;
    });
    // A smaller copy still being made was for the version before the switch: make it again.
    if (record) this.shrinkForMirror(record);
  }

  async removeBarcode(locationId: string): Promise<void> {
    const db = await this.getDatabase();
    await this.withBarcodeLock(() => this.removeBarcodeNow(db, locationId));
  }

  /** Removes a place's barcode from both copies; the caller holds the barcode lock. */
  private async removeBarcodeNow(db: Database, locationId: string): Promise<void> {
    const id = barcodeIdFor(locationId);
    // The second copy goes first: one left behind would bring the barcode back at the next open.
    if (!dropFromMirror(this.storage, id)) {
      throw new Error("The barcode's second copy on this phone could not be removed. Try again.");
    }
    await deleteVerified(db, 'device', id);
    this.barcodesVersion += 1;
    const copies = { ...this.state.barcodeCopies };
    delete copies[id];
    this.setState({
      barcodeCopies: copies,
      restoredBarcodes: this.state.restoredBarcodes.filter((item) => item !== id),
      barcodes: this.state.barcodes.filter((item) => item.locationId !== locationId),
      barcodeFullScreen:
        this.state.barcodeFullScreen === locationId ? null : this.state.barcodeFullScreen,
    });
  }

  /** Opens a place's barcode popup; the current place when none is named. Home has none. */
  openBarcodeSheet(locationId?: string): void {
    const id = locationId ?? this.state.profile?.currentLocationId;
    if (!id || id === HOME_LOCATION_ID) return;
    if (this.state.locations.some((location) => location.id === id)) {
      this.setState({ barcodeSheet: id });
    }
  }

  closeBarcodeSheet(): void {
    if (this.state.barcodeSheet !== null || this.state.barcodeFullScreen !== null) {
      this.setState({ barcodeSheet: null, barcodeFullScreen: null });
    }
  }

  /** Puts a place's barcode full screen, on white for the scanner. */
  openBarcodeFullScreen(locationId: string): void {
    if (this.barcodeFor(locationId)) this.setState({ barcodeFullScreen: locationId });
  }

  closeBarcodeFullScreen(): void {
    if (this.state.barcodeFullScreen !== null) this.setState({ barcodeFullScreen: null });
  }

  async setCurrentLocation(id: string): Promise<SaveReceipt> {
    if (!this.state.profile) {
      throw new Error('No profile to update.');
    }
    if (!this.state.locations.some((location) => location.id === id)) {
      throw new Error(`Unknown location ${id}.`);
    }
    return this.saveProfile({ ...this.state.profile, currentLocationId: id });
  }

  /**
   * Saves locations first, then the profile, then marks onboarding complete. Says 'restored'
   * instead when a profile came back to the phone while setup was open: setup then writes nothing
   * and the screen shows what came back.
   */
  async completeOnboarding(
    rawProfile: UserProfile,
    locations: LocationProfile[],
    options: { base?: string | null } = {},
  ): Promise<'saved' | 'restored'> {
    // What setup began from: the setup screen says (null on a first run); a direct call takes
    // what this window shows now.
    const base =
      options.base !== undefined
        ? options.base
        : setupBase(this.state.profile, this.state.locations);
    // In turn with the syncs: a walk of the cloud copy never ends part-way through setup, so it
    // either ends first (and setup sees what came back) or starts after (and its rule replaces
    // what setup wrote) (the tenth review's fifth re-check).
    const run = this.syncRun.then(() => this.completeOnboardingNow(rawProfile, locations, base));
    this.syncRun = run.then(
      () => null,
      () => null,
    );
    // A sync asked for from now on runs after setup, never joining one queued before it.
    this.queuedSync = null;
    return run;
  }

  private async completeOnboardingNow(
    rawProfile: UserProfile,
    locations: LocationProfile[],
    base: string | null,
  ): Promise<'saved' | 'restored'> {
    const profile = normalizeProfile(rawProfile);
    const db = await this.getDatabase();
    // Everything setup writes is checked before its first write: an answer the profile cannot take
    // then fails with nothing written, and a Finish again goes through (the tenth review's
    // eleventh re-check: an age typo failed after the places were written).
    UserProfileSchema.parse(profile);
    const checked = locations.map((location) => LocationProfileSchema.parse(location));
    // Setup writes only over the very data it began from. The cloud copy (or another window) may
    // have changed the profile or the places while it was open, a walk ending before this turn
    // came included: then it writes nothing, its draft goes (Run setup again never resumes it),
    // and the screen shows what is there. A first run began from no profile at all (the tenth
    // review's fourth to sixth re-checks: a wizard open across the walk wrote over the copy).
    const begun = await this.readSetupState(db);
    if (setupBase(begun.profile, begun.places) !== base) {
      removeKey(ONBOARDING_DRAFT_KEY, this.storage);
      await this.hydrate();
      return 'restored';
    }
    const existing = await db.getAll<Identified>('locations');
    // After the browser cleared the database, until the first walk of the cloud copy is done, a
    // place here may be the owner's own coming back: setup leaves the places it does not list, and
    // their barcodes, alone. The walk's records win over setup's anyway; a barcode, never in the
    // cloud copy, would be lost for good (the tenth review's third re-check).
    const birth = await readDatabaseBirth(db).catch(() => ({ at: null, walkedAt: null }));
    const walkPending = this.state.cloud.configured && birth.at !== null && birth.walkedAt === null;
    // And it removes only what its own steps can remove: the Gym, when gym access is switched
    // off, and only a Gym the screen showed. A place setup never lists (one added on Plan that a
    // draft saved earlier never knew, or one the cloud copy brought back unseen) stays, with its
    // barcode (the fourth re-check).
    const shown = new Set(this.state.locations.map((location) => location.id));
    const leftOut = walkPending
      ? []
      : existing.filter(
          (stale) =>
            stale.id === GYM_LOCATION_ID &&
            shown.has(stale.id) &&
            !locations.some((location) => location.id === stale.id),
        );
    try {
      for (const stale of leftOut) {
        // Its barcode goes with it, from both copies and first, as when the place is deleted.
        await this.withBarcodeLock(async () => {
          if ((await db.get('device', barcodeIdFor(stale.id))) || this.barcodeFor(stale.id)) {
            await this.removeBarcodeNow(db, stale.id);
          }
          await deleteVerified(db, 'locations', stale.id);
        });
      }
      for (const location of checked) {
        await putVerified(db, 'locations', location, { now: this.now });
      }
      // Every place on disk now, setup's and the ones it left alone.
      const kept = (await db.getAll<Identified>('locations'))
        .map((record) => LocationProfileSchema.safeParse(record))
        .filter((result) => result.success)
        .map((result) => result.data);
      this.setState({ locations: sortLocations(kept) });
      await this.saveProfile(profile);
    } catch (error) {
      // Cut off part-way (a full disk, say). What this run wrote stays. Setup starts again from
      // the disk as the cut-off left it when every place there is as setup began from it or as
      // setup meant to write it, and every place gone is one setup removed: a write that landed
      // though its check failed counts as setup's own, and a place another window wrote meanwhile
      // still makes Finish again refuse (the tenth review's eleventh to thirteenth re-checks). The
      // screen shows the places as the cut-off left them, so a reopened setup resumes (unless the
      // profile's own write landed: see Known limits); the profile it shows stays as it was, so
      // Finish again rebuilds the plan, and a first setup stays on screen (the fourteenth and
      // fifteenth re-checks).
      const removed = new Set(leftOut.map((stale) => stale.id));
      const left = await this.readSetupState(db)
        .then((now) => {
          this.setState({ locations: sortLocations(now.places) });
          const setupsOwn = (place: LocationProfile) =>
            begun.places.some((before) => structurallyEqual(before, place)) ||
            checked.some((meant) => structurallyEqual(meant, place));
          const ownOnly =
            now.places.every(setupsOwn) &&
            begun.places.every(
              (before) =>
                removed.has(before.id) || now.places.some((place) => place.id === before.id),
            );
          return ownOnly ? setupBase(now.profile, now.places) : base;
        })
        .catch(() => base);
      throw new SetupInterruptedError(error, left);
    }
    removeKey(ONBOARDING_DRAFT_KEY, this.storage);
    this.updateLocalSettings({ onboardingCompletedAt: this.now() });
    return 'saved';
  }

  /** The profile and places setup starts from, read from disk: the profile if it reads, and the places that do. */
  private async readSetupState(
    db: Database,
  ): Promise<{ profile: UserProfile | null; places: LocationProfile[] }> {
    const [storedProfile] = await db.getAll<Identified>('profile');
    const readProfile = storedProfile ? UserProfileSchema.safeParse(storedProfile) : null;
    const places = (await db.getAll<Identified>('locations'))
      .map((record) => LocationProfileSchema.safeParse(record))
      .filter((result) => result.success)
      .map((result) => result.data);
    return { profile: readProfile?.success ? normalizeProfile(readProfile.data) : null, places };
  }

  updateLocalSettings(patch: Partial<LocalSettings>): LocalSettings {
    const localSettings = updateLocalSettings(patch, this.storage);
    this.setState({ localSettings });
    return localSettings;
  }

  /** An exact snapshot of everything durable on this device, read straight from disk. */
  private async buildBackupFromDisk(app: BackupAppInfo, exportedAt: string): Promise<Backup> {
    const db = await this.getDatabase();
    const [
      profiles,
      locations,
      workouts,
      customExercises,
      customInstructions,
      customMedia,
      saved,
      meta,
    ] = await Promise.all([
      db.getAll<Identified>('profile'),
      db.getAll<Identified>('locations'),
      db.getAll<WorkoutRecord>('workouts'),
      db.getAll<CustomExercise>('customExercises'),
      db.getAll<CustomInstruction>('customInstructions'),
      db.getAll<CustomMedia>('customMedia'),
      db.getAll<Identified>('savedWorkouts'),
      db.getAll<Identified>('meta'),
    ]);
    const profile = profiles[0] ? UserProfileSchema.safeParse(profiles[0]) : null;
    return buildBackup(
      {
        profile: profile?.success ? profile.data : null,
        locations: locations
          .map((record) => LocationProfileSchema.safeParse(record))
          .filter((result) => result.success)
          .map((result) => result.data),
        localSettings: this.state.localSettings,
        workouts,
        customExercises,
        customInstructions,
        customMedia,
        savedWorkouts: saved as unknown as SavedWorkout[],
        meta: meta.filter((record) => record.id !== DIAGNOSTIC_PROBE_ID) as MetaRecord[],
      },
      app,
      exportedAt,
    );
  }

  async createBackup(app: BackupAppInfo): Promise<Backup> {
    const exportedAt = this.now();
    const backup = await this.buildBackupFromDisk(app, exportedAt);
    this.updateLocalSettings({ lastExportAt: exportedAt });
    return backup;
  }

  async createHistoryExport(app: BackupAppInfo): Promise<HistoryExport> {
    const db = await this.getDatabase();
    const workouts = await db.getAll<WorkoutRecord>('workouts');
    const exportedAt = this.now();
    this.updateLocalSettings({ lastExportAt: exportedAt });
    return buildHistoryExport({ workouts }, app, exportedAt);
  }

  createSettingsExport(app: BackupAppInfo): SettingsExport {
    const exportedAt = this.now();
    this.updateLocalSettings({ lastExportAt: exportedAt });
    return buildSettingsExport(
      {
        profile: this.state.profile,
        locations: this.state.locations,
        localSettings: this.state.localSettings,
      },
      app,
      exportedAt,
    );
  }

  /**
   * Verified restore with verified rollback, then a fresh hydrate from disk.
   * The data from before the import is kept as a local snapshot first, so an
   * import can always be undone from the Automatic backups card.
   */
  async applyBackup(
    backup: Backup,
    options: { snapshotFirst?: boolean } = {},
  ): Promise<RestoreCounts> {
    const db = await this.getDatabase();
    if (options.snapshotFirst ?? true) await this.snapshotBackup('pre-import');
    const counts = await restoreBackup(db, backup, { now: this.now });
    // The next sync walks the whole cloud copy again before it pushes, so anything there that this
    // backup lacks, or that changed after it was made, comes back to this phone (Maintenance 25).
    await restartPull(db).catch(() => undefined);
    this.updateLocalSettings({
      onboardingCompletedAt: backup.data.localSettings.onboardingCompletedAt,
      lastImportAt: this.now(),
    });
    await this.hydrate();
    return counts;
  }

  // ---------------------------------------------------------------- automatic local backups

  /** Resolves once background snapshot work has settled; never rejects. */
  async flushPendingWork(): Promise<void> {
    await this.pendingWork;
  }

  private async readSnapshots(db: Database): Promise<BackupSnapshot[]> {
    const raw = await db.getAll<Identified>('backups');
    return raw
      .filter((record): record is BackupSnapshot => {
        const candidate = record as Partial<BackupSnapshot>;
        return (
          typeof candidate.createdAt === 'string' &&
          typeof candidate.seq === 'number' &&
          BackupSchema.safeParse(candidate.backup).success
        );
      })
      .sort((a, b) => b.seq - a.seq);
  }

  /** Writes a verified snapshot of the current data and prunes to the newest SNAPSHOTS_KEPT. */
  async snapshotBackup(reason: SnapshotReason): Promise<BackupSnapshotSummary> {
    const db = await this.getDatabase();
    const existing = await this.readSnapshots(db);
    const createdAt = this.now();
    const seq = (existing[0]?.seq ?? 0) + 1;
    const backup = await this.buildBackupFromDisk(
      { version: this.state.localSettings.schemaVersion.toString() },
      createdAt,
    );
    const record: BackupSnapshot = {
      id: `snapshot-${seq}-${createdAt.replace(/[^0-9]/g, '')}`,
      createdAt,
      reason,
      seq,
      backup,
    };
    await putVerified(db, 'backups', record, { now: this.now });
    for (const stale of [record, ...existing].sort((a, b) => b.seq - a.seq).slice(SNAPSHOTS_KEPT)) {
      await deleteVerified(db, 'backups', stale.id);
    }
    return this.summarizeSnapshot(record);
  }

  private summarizeSnapshot(record: BackupSnapshot): BackupSnapshotSummary {
    return {
      id: record.id,
      createdAt: record.createdAt,
      reason: record.reason,
      seq: record.seq,
      summary: summarizeBackup(record.backup),
    };
  }

  /** Newest first. */
  async listSnapshots(): Promise<BackupSnapshotSummary[]> {
    const db = await this.getDatabase();
    return (await this.readSnapshots(db)).map((record) => this.summarizeSnapshot(record));
  }

  async getBackupSnapshot(id: string): Promise<Backup | null> {
    const db = await this.getDatabase();
    const record = await db.get<BackupSnapshot>('backups', id);
    if (!record) return null;
    const parsed = BackupSchema.safeParse(record.backup);
    return parsed.success ? parsed.data : null;
  }

  /** Restores a snapshot the same way an imported file is restored; the current data is snapshotted first. */
  async restoreSnapshot(id: string): Promise<RestoreCounts> {
    const backup = await this.getBackupSnapshot(id);
    if (!backup) throw new Error('That backup is no longer on this device.');
    return this.applyBackup(backup);
  }

  // ---------------------------------------------------------------- legacy import

  /** Catalog lookup by id or by name, tolerant of case, punctuation, and spacing. */
  resolveExerciseName(nameOrId: string): string | null {
    if (getExercise(nameOrId)) return nameOrId;
    const wanted = normalizeName(nameOrId);
    if (!wanted) return null;
    const match = allExercises().find((exercise) => normalizeName(exercise.name) === wanted);
    return match?.id ?? null;
  }

  async listLegacyImports(): Promise<LegacyImportReceipt[]> {
    const db = await this.getDatabase();
    const raw = await db.getAll<Identified>('meta');
    return raw
      .filter((record): record is LegacyImportReceipt => {
        const candidate = record as Partial<LegacyImportReceipt>;
        return candidate.kind === 'legacy-import' && Array.isArray(candidate.recordIds);
      })
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  }

  /**
   * Adds legacy workout records with verified writes after snapshotting the
   * current data. Any failure removes what was written before rethrowing; a
   * receipt in `meta` lets the whole import be undone later.
   */
  async importLegacy(records: WorkoutRecord[], fileName: string): Promise<LegacyImportReceipt> {
    if (records.length === 0) throw new Error('Nothing to import.');
    const validated = records.map((record) => WorkoutRecordSchema.parse(record));
    const snapshot = await this.snapshotBackup('legacy-import');
    const db = await this.getDatabase();
    const written: string[] = [];
    try {
      for (const record of validated) {
        await putVerified(db, 'workouts', record, { now: this.now });
        written.push(record.id);
      }
      const receipt: LegacyImportReceipt = {
        id: `legacy-import-${snapshot.seq}-${this.now().replace(/[^0-9]/g, '')}`,
        kind: 'legacy-import',
        importedAt: this.now(),
        recordIds: written,
        snapshotId: snapshot.id,
        fileName,
      };
      await putVerified(db, 'meta', receipt, { now: this.now });
      await this.hydrate();
      return receipt;
    } catch (error) {
      for (const id of written) {
        try {
          await deleteVerified(db, 'workouts', id);
        } catch {
          // The snapshot taken above still holds the pre-import data.
        }
      }
      await this.hydrate();
      throw error;
    }
  }

  /** Removes exactly the records one legacy import added, then the receipt. */
  async undoLegacyImport(receiptId: string): Promise<number> {
    const db = await this.getDatabase();
    const receipt = (await db.get<LegacyImportReceipt>('meta', receiptId)) ?? null;
    if (!receipt || receipt.kind !== 'legacy-import')
      throw new Error('That import is no longer on this device.');
    let removed = 0;
    for (const id of receipt.recordIds) {
      if ((await db.get<Identified>('workouts', id)) !== undefined) {
        await deleteVerified(db, 'workouts', id);
        removed += 1;
      }
    }
    await deleteVerified(db, 'meta', receiptId);
    await this.hydrate();
    return removed;
  }

  // ---------------------------------------------------------------- coach routes

  /** Plans the recommended deload week; today's preview regenerates if the week already covers it. */
  async planDeloadWeek(recommendation: DeloadRecommendation): Promise<DeloadWeek> {
    if (!recommendation.window) throw new Error('No deload week is recommended right now.');
    const week: DeloadWeek = {
      id: DELOAD_WEEK_ID,
      startsAt: recommendation.window.startsAt,
      endsAt: recommendation.window.endsAt,
      plannedAt: this.now(),
      reasons: recommendation.reasons,
    };
    const db = await this.getDatabase();
    await putVerified(db, 'meta', week, { now: this.now });
    this.setState({ deloadWeek: week });
    // Today's plan changes only when the week covers today.
    if (inDeloadWindow(week, this.now())) await this.regeneratePreview();
    return week;
  }

  async cancelDeloadWeek(): Promise<void> {
    const week = this.state.deloadWeek;
    const db = await this.getDatabase();
    if ((await db.get<Identified>('meta', DELOAD_WEEK_ID)) !== undefined) {
      await deleteVerified(db, 'meta', DELOAD_WEEK_ID);
    }
    this.setState({ deloadWeek: null });
    // Today's plan changes only when the week covered today.
    if (week && inDeloadWindow(week, this.now())) await this.regeneratePreview();
  }

  /**
   * A previewed (not started) session is rebuilt from today's inputs, in turn with every other
   * change. Today's choices hold through it (Maintenance 24): the length, a check-in, the plates
   * missing today, and what was set aside for today (skips, sore joints, a lift moved later for
   * busy equipment, an end time still ahead) are applied to the new plan by the engine, as every
   * rebuild applies them.
   */
  private regeneratePreview(): Promise<void> {
    const run = this.calibrationQueue.then(() => this.rebuildPreview());
    this.calibrationQueue = run.catch(() => undefined);
    return run;
  }

  private rebuildPreview(): void {
    const session = this.state.session;
    if (!session || session.status !== 'preview') return;
    clearSession(this.storage);
    this.setState({ session: null });
    this.ensureSession();
    const fresh = this.state.session;
    const { profile, history } = this.state;
    if (!fresh || !profile || this.fromEarlierDay(session)) return;
    // An end time already past is no longer a choice for today.
    const endBy =
      session.constraints.endBy !== null &&
      Date.parse(session.constraints.endBy) > Date.parse(this.now())
        ? session.constraints.endBy
        : null;
    const today = { ...session.constraints, endBy };
    const chosen =
      session.duration !== fresh.duration ||
      today.readiness !== null ||
      today.intensity !== 0 ||
      today.endBy !== null ||
      today.avoidExerciseIds.length > 0 ||
      today.postponed.length > 0 ||
      today.painJoints.length > 0 ||
      session.loading.missingPlates.length > 0;
    if (!chosen) return;
    let result: RecalibrationResult;
    try {
      result = this.engine({
        trigger: { type: 'duration', choice: session.duration },
        workout: fresh.workout,
        completed: fresh.completed,
        lockedEntryIds: [],
        currentEntryId: null,
        duration: session.duration,
        profile,
        location: this.currentLocation(),
        loading: session.loading,
        history,
        constraints: { ...today, deload: fresh.constraints.deload, focus: fresh.constraints.focus },
        maxes: this.state.strengthMaxes,
        swaps: this.activeSwaps(),
        reason: "Today's choices kept",
        timestamp: this.now(),
      });
    } catch (error) {
      result = {
        ok: false,
        scope: 'full',
        error: error instanceof Error ? error.message : 'The plan could not be built again.',
        workout: fresh.workout,
        durationMs: 0,
      };
    }
    if (!result.ok) {
      // As with any change that fails, the previous plan stays as it was, and says so. The change
      // itself is saved: its focus and deload week go with the plan, so the next rebuild has them.
      const setting = { deload: fresh.constraints.deload, focus: fresh.constraints.focus };
      this.setSession({
        ...session,
        constraints: { ...session.constraints, ...setting },
        previous: session.previous
          ? {
              ...session.previous,
              constraints: { ...session.previous.constraints, ...setting },
            }
          : session.previous,
      });
      this.setState({
        calibration: {
          status: 'error',
          title: "Today's plan",
          label: "Keeping today's choices",
          evaluating: [],
          error: `${result.error} The setting itself is saved.`,
        },
      });
      return;
    }
    this.setSession({
      ...fresh,
      duration: result.duration,
      workout: result.workout,
      constraints: result.constraints,
      loading: session.loading,
      defaultEstimatedMinutes:
        result.duration === 'default'
          ? result.workout.duration.estimatedMinutes
          : fresh.defaultEstimatedMinutes,
    });
  }

  // ---------------------------------------------------------------- cloud copy

  /**
   * Pull on open and every fifteen minutes, and again when the device comes back
   * online. Does nothing without a token. Returns true when it started the schedule.
   */
  startCloud(): boolean {
    if (this.cloudTimer !== null || typeof window === 'undefined') return false;
    if (!this.state.cloud.configured) return false;
    this.cloudTimer = window.setInterval(() => {
      void this.syncNow({ pull: true });
    }, PULL_INTERVAL_MS);
    this.onlineHandler = () => {
      void this.syncNow({ pull: true, force: true });
    };
    window.addEventListener('online', this.onlineHandler);
    void this.syncNow({ pull: true });
    return true;
  }

  stopCloud(): void {
    if (typeof window === 'undefined') return;
    if (this.cloudTimer !== null) window.clearInterval(this.cloudTimer);
    if (this.drainTimer !== null) window.clearTimeout(this.drainTimer);
    if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
    this.cloudTimer = null;
    this.drainTimer = null;
    this.onlineHandler = null;
  }

  /** Saves the pasted token against the current database; the first pull restores everything. */
  async setCloudToken(raw: string): Promise<void> {
    await this.setCloudCredentials({ token: raw });
  }

  /**
   * Saves the database address and token this device syncs with. Before it
   * commits to a database it has not used, it checks the tables exist and that
   * the database is not already carrying somebody else's history; the second
   * needs `acceptExisting` to go ahead. Changing the address re-seeds: the next
   * sync pulls from the new database first, then pushes everything local.
   */
  async setCloudCredentials(input: {
    token: string;
    url?: string;
    acceptExisting?: boolean;
    /** Where the token came from, for the token log; Settings unless said otherwise. */
    via?: string;
  }): Promise<void> {
    const token = input.token.trim();
    if (token.length === 0) throw new Error('Paste the token first.');
    this.cloudEpoch += 1;
    const db = await this.getDatabase();
    const current = await resolveCloudUrl(db, this.storage, this.now());
    const url = (input.url ?? current).trim();
    if (!looksLikeLibsqlUrl(url)) {
      throw new Error('That database address does not look right. It starts with libsql://');
    }
    const changed = url !== current;
    // Only adopting a different database needs checking. A token for the one
    // this device already uses saves as before, and the sync reports any trouble.
    if (changed) {
      if (!this.isOnline()) {
        throw new Error('Connect to the internet to set up a different database.');
      }
      const client = await this.makeCloudClient(token, url);
      let inspection;
      try {
        inspection = await inspectCloud(client);
      } catch (error) {
        try {
          client.close();
        } catch {
          // a closed client is closed
        }
        const message = error instanceof Error ? error.message : 'Could not reach that database.';
        throw new Error(`Could not reach that database: ${message}`, { cause: error });
      }
      if (inspection.missingTables.length > 0) {
        throw new Error(
          `That database has no ${inspection.missingTables.join(' or ')} table yet, so it is not set up for this app.`,
        );
      }
      const deviceId = ensureDeviceId(this.storage);
      const mine = inspection.deviceIds.length === 0 || inspection.deviceIds.includes(deviceId);
      this.cloudClient = { token, url, client };
      if (inspection.rows > 0 && !mine && !input.acceptExisting) {
        throw new CloudOccupiedError(inspection.rows, inspection.deviceIds.length);
      }
      await saveCloudUrl(db, url, this.now());
      await resetCloudState(db);
      await seedOutbox(db);
    }
    await saveToken(db, this.storage, token, this.now(), input.via ?? 'Pasted in Settings.');
    // A token entered again for the database this device already uses means
    // something was lost here, or an old token is being pasted on a new device.
    // Either way the next sync walks the whole history back before it pushes.
    if (!changed) await restartPull(db);
    this.setState({
      cloud: {
        ...this.state.cloud,
        url,
        configured: true,
        lastError: null,
        linkError: null,
        notice: null,
      },
    });
    if (!this.startCloud()) await this.syncNow({ pull: true, force: true });
  }

  /**
   * Setup without waiting for the cloud copy (the tenth review): offline, or with a copy that
   * cannot be reached. What is set up then is replaced by the cloud copy's records once it is.
   */
  skipRestoring(): void {
    this.restoreSkipped = true;
    if (this.state.restoring) this.setState({ restoring: false });
  }

  /** Says on the Cloud copy card why a setup link was not used (Maintenance 25). */
  noteSetupLinkFailure(message: string): void {
    this.setState({ cloud: { ...this.state.cloud, linkError: message } });
  }

  /** Removes the token; the cloud copy is off and nothing leaves the device. The outbox is kept. */
  async clearCloudToken(): Promise<void> {
    this.cloudEpoch += 1;
    const db = await this.getDatabase();
    await clearToken(db, this.storage, this.now());
    await clearSyncError(db);
    this.stopCloud();
    this.dropCloudClient();
    this.setState({
      cloud: {
        ...this.state.cloud,
        configured: false,
        syncing: false,
        lastError: null,
        linkError: null,
        notice: null,
      },
    });
  }

  /**
   * One sync now: push the outbox, then pull when asked. Concurrent calls queue
   * behind each other; without a token it returns null and touches no network.
   * With `full` the pull walks the whole history again, so anything this device
   * has lost comes back; the card's "Sync now" asks for that.
   */
  syncNow(options: SyncRequest = { pull: true }): Promise<SyncOutcome | null> {
    // A request made while another sync waits its turn joins that one, adding what it asks for:
    // taps on Try again, or a run of saves, never stack up syncs for setup to wait through one by
    // one (the tenth review's seventh re-check).
    const waiting = this.queuedSync;
    if (waiting) {
      waiting.options = {
        pull: waiting.options.pull || options.pull,
        force: waiting.options.force === true || options.force === true,
        full: waiting.options.full === true || options.full === true,
      };
      return waiting.run;
    }
    const entry: { options: SyncRequest; run: Promise<SyncOutcome | null> } = {
      options: { ...options },
      run: Promise.resolve(null),
    };
    const run = this.syncRun.then(() => {
      if (this.queuedSync === entry) this.queuedSync = null;
      return this.runSync(entry.options);
    });
    entry.run = run;
    this.queuedSync = entry;
    this.syncRun = run.catch(() => null);
    this.pendingWork = this.pendingWork.then(() => this.syncRun.then(() => undefined));
    return run;
  }

  private async runSync(options: SyncRequest): Promise<SyncOutcome | null> {
    const epoch = this.cloudEpoch;
    const db = await this.getDatabase();
    const resolved = await resolveToken(db, this.storage, this.now());
    if (epoch !== this.cloudEpoch) return null;
    if (resolved.token === null) {
      // Not quietly off: the card says the token went missing, and when.
      if (this.state.cloud.configured || !sameNotice(resolved.notice, this.state.cloud.notice)) {
        this.setState({
          cloud: { ...this.state.cloud, configured: false, notice: resolved.notice },
        });
      }
      return null;
    }
    if (resolved.recover) await restartPull(db);
    const token = resolved.token;
    const url = await resolveCloudUrl(db, this.storage, this.now());
    let client: CloudClient;
    try {
      // The driver comes over the network when the browser has evicted it: a network that never
      // answers fails this sync too, so setup waiting its turn never waits forever (the tenth
      // review's seventh re-check).
      client = await withinBound(this.cloudClientFor(token, url));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed.';
      // Offline, a driver the browser no longer keeps cannot come: that is "offline", not its
      // error, on the card and in what Sync now says (the eighth and ninth re-checks).
      const offline = !this.isOnline();
      if (epoch === this.cloudEpoch) {
        const lastError = offline ? CLOUD_OFFLINE : message;
        this.setState({ cloud: { ...this.state.cloud, syncing: false, lastError } });
      }
      return offline
        ? { ran: false, reason: 'offline', pushed: 0, applied: 0, removed: 0, kept: 0, error: null }
        : { ran: true, pushed: 0, applied: 0, removed: 0, kept: 0, error: message };
    }
    this.setState({ cloud: { ...this.state.cloud, syncing: true } });
    let outcome: SyncOutcome;
    try {
      outcome = await syncOnce(
        db,
        client,
        {
          now: this.now,
          deviceId: ensureDeviceId(this.storage),
          deviceLabel: deviceLabel(),
          isOnline: this.isOnline,
        },
        options,
      );
    } catch (error) {
      outcome = {
        ran: true,
        pushed: 0,
        applied: 0,
        removed: 0,
        kept: 0,
        error: error instanceof Error ? error.message : 'Sync failed.',
      };
    }
    const cloudState = await readCloudState(db);
    const pending = await pendingCount(db);
    // What the walk brought back is on disk whatever else happened; the state reloads from it
    // when records arrived, or when the first walk ended after this screen last read the disk
    // (in an attempt cut short, before a restart, or in another window): the screen must never
    // show setup over a phone whose data is back (the tenth review's fifth re-check).
    const walked = (await readDatabaseBirth(db).catch(() => null))?.walkedAt ?? null;
    const reload =
      outcome.applied + outcome.removed > 0 || (walked !== null && walked !== this.walkShown);
    // The token was saved or removed while this attempt was in flight: its result is stale.
    if (epoch !== this.cloudEpoch) {
      if (reload) await this.hydrate();
      return outcome;
    }
    this.setState({
      cloud: {
        ...this.state.cloud,
        configured: true,
        syncing: false,
        pending,
        notice: liveNotice(resolved.notice, cloudState.lastSyncAt),
        lastSyncAt: cloudState.lastSyncAt,
        lastError: outcome.ran
          ? outcome.error
          : outcome.reason === 'offline'
            ? CLOUD_OFFLINE
            : cloudState.lastError,
      },
    });
    // Records that arrived from the cloud are on disk; the state reloads from it. The reload also
    // ends the wait for the first walk, in the same step as it shows what came back: ending the
    // wait first showed setup for a moment, and a tap there wrote over the cloud copy (the tenth
    // review's fourth re-check).
    if (reload) await this.hydrate();
    return outcome;
  }

  private async cloudClientFor(token: string, url: string): Promise<CloudClient> {
    if (this.cloudClient && this.cloudClient.token === token && this.cloudClient.url === url) {
      return this.cloudClient.client;
    }
    this.dropCloudClient();
    const client = await this.makeCloudClient(token, url);
    this.cloudClient = { token, url, client };
    return client;
  }

  private dropCloudClient(): void {
    if (this.cloudClient) {
      try {
        this.cloudClient.client.close();
      } catch {
        // a closed client is closed
      }
      this.cloudClient = null;
    }
  }

  /** After a local write: refresh the pending count and, with a token, push shortly. */
  private scheduleDrain(): void {
    void this.refreshPending();
    if (!this.state.cloud.configured || typeof window === 'undefined') return;
    if (this.drainTimer !== null) window.clearTimeout(this.drainTimer);
    this.drainTimer = window.setTimeout(() => {
      this.drainTimer = null;
      void this.syncNow({ pull: false });
    }, DRAIN_DELAY_MS);
  }

  private async refreshPending(): Promise<void> {
    try {
      const pending = await pendingCount(await this.getDatabase());
      if (pending !== this.state.cloud.pending) {
        this.setState({ cloud: { ...this.state.cloud, pending } });
      }
    } catch {
      // the count is a status line, never a reason to fail a save
    }
  }

  // ---------------------------------------------------------------- entered maxes

  /**
   * What saving a max would do to a lift today (Maintenance 25): the save's own rebuild, run on
   * the session as it stands without saving anything, so the max sheet shows the target the plan
   * will have. Null with no session to show it on, or an input that makes no max.
   */
  previewStrengthMax(exerciseId: string, entryId: string, input: MaxInput): MaxPreview | null {
    const { session, profile } = this.state;
    if (!session || !profile || session.status === 'completed') return null;
    let maxes: StrengthMaxes;
    try {
      maxes = recordMax(this.state.strengthMaxes, exerciseId, input, profile.units, this.now());
    } catch {
      return null;
    }
    const entered = maxes.maxes[exerciseId];
    if (!entered) return null;
    const result = this.engine(
      this.calibrationRequest({ type: 'max', exerciseId }, session, profile, 'Max preview', {
        maxes,
      }),
    );
    if (!result.ok || !result.max) return null;
    const entry = allEntries(result.workout.blocks).find(
      (candidate) => candidate.id === entryId && !isStopped(candidate),
    );
    const set = entry?.sets.find((candidate) => candidate.kind === 'working');
    // The engine's own words for the target, as the lift's card shows them after the save: only
    // where this save's rebuild set it. A lift under way, logged or set by hand keeps lines from
    // before, about a max the lifter is now changing.
    const setNow =
      result.max === 'first' ||
      result.max === 'moved' ||
      result.max === 'held' ||
      result.max === 'eased' ||
      result.max === 'kept';
    const evidence = setNow ? (entry?.progression?.evidence ?? []) : [];
    const now = allEntries(session.workout.blocks)
      .find((candidate) => candidate.id === entryId)
      ?.sets.find((candidate) => candidate.kind === 'working');
    const target = set
      ? { weight: set.targetWeight, reps: set.targetReps, rir: set.targetRir }
      : null;
    return {
      e1rm: enteredE1rm(entered),
      outcome: result.max,
      ...(result.maxHeldBy ? { heldBy: result.maxHeldBy } : {}),
      target,
      lines: evidence.filter(previewLine),
      stays:
        target !== null &&
        now !== undefined &&
        now.targetWeight === target.weight &&
        now.targetReps[0] === target.reps[0] &&
        now.targetReps[1] === target.reps[1] &&
        now.targetRir === target.rir,
    };
  }

  /** Saves a max the lifter entered; unlogged sets of that lift in today's session start from it. */
  async recordStrengthMax(exerciseId: string, input: MaxInput): Promise<void> {
    const profile = this.state.profile;
    if (!profile) throw new Error('Finish setup before entering a max.');
    const next = recordMax(this.state.strengthMaxes, exerciseId, input, profile.units, this.now());
    const db = await this.getDatabase();
    await putVerified(db, 'meta', next, { now: this.now });
    this.setState({ strengthMaxes: next });
    const session = this.state.session;
    if (
      session &&
      session.status !== 'completed' &&
      allEntries(session.workout.blocks).some((entry) => entry.exerciseId === exerciseId)
    ) {
      await this.recalibrate({ type: 'max', exerciseId });
    }
  }

  /** "Not now" hides the max link for a week; "Don't ask for this lift" hides it for good. */
  async snoozeMaxPrompt(exerciseId: string, forGood: boolean): Promise<void> {
    const next = snoozeMaxPrompt(this.state.strengthMaxes, exerciseId, this.now(), forGood);
    const db = await this.getDatabase();
    await putVerified(db, 'meta', next, { now: this.now });
    this.setState({ strengthMaxes: next });
  }

  // ---------------------------------------------------------------- coach focus

  /** The coverage card's tap when today has no room: the next session leads with the muscle. */
  /** Sets the programming style (Auto included); the plan is rebuilt under it like any profile change. */
  async setProgramStyle(style: ProgramStyle): Promise<void> {
    const profile = this.state.profile;
    if (!profile) throw new Error('Finish setup first.');
    await this.saveProfile({ ...profile, programStyle: style });
  }

  async setCoachFocus(muscle: MuscleId): Promise<void> {
    const focus = createFocus(muscle, this.now());
    const db = await this.getDatabase();
    await putVerified(db, 'meta', focus, { now: this.now });
    this.setState({ coachFocus: focus });
    await this.regeneratePreview();
  }

  /**
   * Swaps an exercise in today's workout. With `keep`, the exercise swapped in is used for the next
   * few weeks wherever the plan would pick the one it replaces (Maintenance 22): the plan's own
   * pick, which is the exercise this entry was first swapped from if it was swapped today. Keeping
   * the plan's own pick ends a kept swap of it. Undo on the swap puts the kept swaps back too.
   */
  async swapExercise(
    entryId: string,
    exerciseId: string,
    keep = false,
  ): Promise<RecalibrationResult | null> {
    const session = this.state.session;
    const entry = session
      ? allEntries(session.workout.blocks).find((candidate) => candidate.id === entryId)
      : undefined;
    const from = entry && session ? planOwnExercise(session.workout.blocks, entry) : undefined;
    const result = await this.recalibrate({ type: 'replace', entryId, exerciseId });
    if (!result?.ok || !keep || !from) return result;
    // The swap stands while today's workout has the exercise swapped in; Undo takes it away.
    const stands = () =>
      allEntries(this.state.session?.workout.blocks ?? []).some(
        (candidate) => candidate.exerciseId === exerciseId,
      );
    const snapshot = this.state.session?.previous ?? null;
    const change = await this.changeSwaps((current) => {
      // Undone before its turn: there is nothing to keep.
      if (!stands()) return current;
      return from === exerciseId
        ? withoutSwap(current, from)
        : withSwap(current, from, exerciseId, this.now());
    });
    if (!change.saved) {
      if (!stands()) return result;
      throw new Error('The swap is made, but keeping it for four weeks could not be saved.');
    }
    const now = this.state.session;
    if (now && snapshot && now.previous === snapshot) {
      // Undo of this swap takes the kept part back too.
      this.setSession({
        ...now,
        previous: { ...snapshot, swapsBefore: change.before, swapsAfter: change.after },
      });
    } else if (!stands()) {
      // Undone while it was being saved: the kept part goes too.
      await this.changeSwaps((current) => undoSwaps(current, change.before, change.after));
    }
    return result;
  }

  /**
   * Ends a lasting swap. A plan not started yet is built again without it, as the coach focus and
   * the deload week do; a workout under way keeps what it has.
   */
  async stopLastingSwap(from: string): Promise<void> {
    const change = await this.changeSwaps((current) => withoutSwap(current, from));
    if (!change.saved) throw new Error('The swap could not be stopped.');
    await this.regeneratePreview();
  }

  /**
   * Shows a new kept-swap list, and makes today's lines about kept swaps true of it: a workout
   * under way keeps its exercises, but a line about a swap stopped or put back follows the list.
   */
  private showSwaps(swaps: LastingSwap[]): void {
    this.swapsVersion += 1;
    this.setState({ lastingSwaps: swaps });
    const session = this.state.session;
    if (!session) return;
    const { explanation } = session.workout;
    const reasons = withSwapLines(explanation.reasons, session.workout.blocks, this.activeSwaps());
    if (reasons.join('\n') === explanation.reasons.join('\n')) return;
    this.setSession({
      ...session,
      workout: { ...session.workout, explanation: { ...explanation, reasons } },
    });
  }

  /** The lasting swaps still running. */
  private activeSwaps(): LastingSwap[] {
    const now = this.now();
    return this.state.lastingSwaps.filter((swap) => !swapIsPast(swap, now));
  }

  /**
   * Changes the kept swaps one change at a time (Maintenance 22). Each change is worked out from
   * the list as the change before it left it, saved, and only then shown. When a save fails, the
   * list shown is read back from what is saved, so the Plan tab and the saved list agree.
   * `saved`: the change is in the saved list.
   */
  private changeSwaps(
    change: (current: LastingSwap[]) => LastingSwap[],
  ): Promise<{ before: LastingSwap[]; after: LastingSwap[]; saved: boolean }> {
    const run = this.swapsQueue.then(async () => {
      const before = this.activeSwaps();
      const after = change(before);
      if (sameSwaps(before, after)) return { before, after, saved: true };
      try {
        await this.writeSwaps(after);
        this.showSwaps(after);
        return { before, after, saved: true };
      } catch {
        const stored = await this.readSwaps().catch(() => null);
        this.showSwaps(stored ?? before);
        return { before, after, saved: stored !== null && sameSwaps(stored, after) };
      }
    });
    this.swapsQueue = run.catch(() => undefined);
    return run;
  }

  /** The kept swaps as saved. */
  private async readSwaps(): Promise<LastingSwap[]> {
    const db = await this.getDatabase();
    return parseLastingSwaps(await db.get<Identified>('meta', LASTING_SWAPS_ID), this.now());
  }

  private async writeSwaps(swaps: readonly LastingSwap[]): Promise<void> {
    const db = await this.getDatabase();
    if (swaps.length > 0) {
      await putVerified(db, 'meta', lastingSwapsRecord(swaps), { now: this.now });
    } else if ((await db.get<Identified>('meta', LASTING_SWAPS_ID)) !== undefined) {
      await deleteVerified(db, 'meta', LASTING_SWAPS_ID);
    }
  }

  async clearCoachFocus(): Promise<void> {
    const db = await this.getDatabase();
    if ((await db.get<Identified>('meta', COACH_FOCUS_ID)) !== undefined) {
      await deleteVerified(db, 'meta', COACH_FOCUS_ID);
    }
    this.setState({ coachFocus: null });
    await this.regeneratePreview();
  }

  /** A saved session that trained the focus muscle clears the focus. */
  private async reconcileCoachFocus(
    db: Database,
    record: Parameters<typeof focusSatisfiedBy>[1],
  ): Promise<void> {
    const focus = this.state.coachFocus;
    if (!focus || !focusSatisfiedBy(focus, record)) return;
    if ((await db.get<Identified>('meta', COACH_FOCUS_ID)) !== undefined) {
      await deleteVerified(db, 'meta', COACH_FOCUS_ID);
    }
    this.setState({ coachFocus: null });
  }

  /**
   * Not now. Most offers stay away for a while; the note about a workout left open is about
   * this workout only, so it stays away for this session and says so again for the next one.
   */
  async dismissCoachSignal(
    signal: Pick<CoachSignal, 'source' | 'exerciseId'> &
      Partial<Pick<CoachSignal, 'domain' | 'concern' | 'action'>>,
  ): Promise<void> {
    // Some cards are set aside for this workout only: the one naming a workout left open, a
    // safety card, which is never declined for days, and a card with nothing to tap, which is a
    // note rather than an offer.
    const key =
      signal.source === UNFINISHED_SOURCE
        ? UNFINISHED_SOURCE
        : setAsideForWorkout(signal)
          ? setAsideKey(signal)
          : null;
    if (key === null) {
      await this.declineCoachSignal(signal);
      return;
    }
    const session = this.state.session;
    if (session && !session.coachAccepted.includes(key)) {
      this.setSession({ ...session, coachAccepted: [...session.coachAccepted, key] });
    }
  }

  /** Remembers a declined offer so the coach stops repeating it for a while. */
  async declineCoachSignal(signal: Pick<CoachSignal, 'source' | 'exerciseId'>): Promise<void> {
    const next = recordDecline(this.state.coachDeclines, signal, this.now());
    const db = await this.getDatabase();
    await putVerified(db, 'meta', next, { now: this.now });
    this.setState({ coachDeclines: next });
  }

  /** Asks the workout screen to open its end-of-workout sheet the next time it shows. */
  requestFinish(): void {
    this.setState({ finishRequested: true });
  }

  clearFinishRequest(): void {
    if (this.state.finishRequested) this.setState({ finishRequested: false });
  }

  /** Remembers an offer the lifter took, so the coach does not make it twice in one session. */
  acceptCoachSignal(
    signal: Pick<CoachSignal, 'source' | 'exerciseId' | 'headline'> &
      Partial<Pick<CoachSignal, 'occasion'>>,
  ): void {
    const session = this.state.session;
    if (!session) return;
    const key = acceptKey(signal);
    if (session.coachAccepted.includes(key)) return;
    this.setSession({ ...session, coachAccepted: [...session.coachAccepted, key] });
  }

  /**
   * A coach card's change, tapped (Maintenance 24). A route step is in place while the change runs,
   * so its card never offers the step again once the overlay goes, and it is saved once the change
   * has landed, onto the routes as they are then (a sync may have reloaded them); a change that
   * fails, or has nothing left to change, takes back that step alone. Any other offer is marked as
   * taken once its change has landed. A step that cannot be saved stays for now, and the error
   * says the coach may offer it again.
   */
  async takeCoachChange(
    action: Extract<CoachAction, { kind: 'recalibrate' }>,
    signal: Pick<CoachSignal, 'source' | 'exerciseId' | 'headline'>,
  ): Promise<RecalibrationResult | null> {
    const route = action.route;
    const before = this.state.coachRoutes;
    const stepped = route ? this.routeStepped(route) : before;
    const stepping = stepped !== before;
    if (stepping) this.setState({ coachRoutes: stepped });
    const takeBack = () => {
      if (route && stepping)
        this.setState({
          coachRoutes: withRouteOf(this.state.coachRoutes, before, route.exerciseId),
        });
    };
    let result: RecalibrationResult | null;
    try {
      result = await this.recalibrate(action.trigger);
    } catch (error) {
      takeBack();
      throw error;
    }
    if (!result?.ok) {
      takeBack();
      return result;
    }
    if (!route) {
      this.acceptCoachSignal(signal);
      return result;
    }
    const landed = this.routeStepped(route);
    // Put in place and saved by an earlier tap of the same step.
    if (!stepping && landed === this.state.coachRoutes) return result;
    if (landed !== this.state.coachRoutes) this.setState({ coachRoutes: landed });
    try {
      await this.saveRoutes(landed);
    } catch {
      throw new Error(
        'The change is made, but this step could not be saved: the coach may offer it again.',
      );
    }
    return result;
  }

  /**
   * A coach tap: a route step that opens a sheet (a variation, a different exercise) is recorded
   * as the sheet opens. A change is recorded only once it has landed (`takeCoachChange`).
   */
  async noteCoachAction(action: CoachAction): Promise<void> {
    if (!action.route || action.kind === 'recalibrate') return;
    const next = this.routeStepped(action.route);
    if (next === this.state.coachRoutes) return;
    await this.saveRoutes(next);
    this.setState({ coachRoutes: next });
  }

  private routeStepped(route: NonNullable<CoachAction['route']>): CoachRoutes {
    return applyRouteStep(
      this.state.coachRoutes,
      route.exerciseId,
      route.step,
      route.baselineE1rm,
      this.now(),
    );
  }

  private async saveRoutes(routes: CoachRoutes): Promise<void> {
    const db = await this.getDatabase();
    await putVerified(db, 'meta', routes, { now: this.now });
  }

  /** After a saved workout: open routes for new stalls, advance applied steps, close moved lifts. */
  private async reconcileCoachRoutes(
    db: Database,
    profile: UserProfile,
    now: string,
  ): Promise<void> {
    const policy = coachingPolicy(profile.experience);
    const stalls = detectStalls(this.state.history, profile, policy);
    const { routes, events } = reconcileRoutes(
      this.state.coachRoutes,
      stalls,
      this.state.history,
      policy,
      now,
    );
    if (events.length === 0) return;
    await putVerified(db, 'meta', routes, { now: this.now });
    this.setState({ coachRoutes: routes });
  }

  // ---------------------------------------------------------------- storage diagnostics

  async storageDiagnostic(): Promise<StorageDiagnostic> {
    const db = await this.getDatabase();
    const counts = {} as Record<StoreName, number>;
    for (const store of STORE_NAMES) counts[store] = await db.count(store);
    const manager =
      typeof navigator !== 'undefined' && 'storage' in navigator ? navigator.storage : undefined;
    let usageBytes: number | null = null;
    let quotaBytes: number | null = null;
    let persisted: boolean | null = null;
    try {
      if (manager && typeof manager.estimate === 'function') {
        const estimate = await manager.estimate();
        usageBytes = estimate.usage ?? null;
        quotaBytes = estimate.quota ?? null;
      }
      if (manager && typeof manager.persisted === 'function') persisted = await manager.persisted();
    } catch {
      // Estimates are advisory; the counts above are the facts that matter.
    }
    const localKeys = [
      LOCAL_SETTINGS_KEY,
      ONBOARDING_DRAFT_KEY,
      SESSION_KEY,
      SESSION_RECOVERY_KEY,
      TOKEN_MIRROR_KEY,
      TOKEN_MARK_KEY,
      TOKEN_LOG_KEY,
      URL_MIRROR_KEY,
      BARCODE_MIRROR_KEY,
    ].map((key) => ({
      key,
      present: this.storage.getItem(key) !== null,
    }));
    const tokenLog = await readTokenLog(db, this.storage);
    return { usageBytes, quotaBytes, persisted, counts, localKeys, tokenLog };
  }

  /**
   * Asks once per open for this origin's storage to be kept (Maintenance 25). Chrome clears a
   * best-effort origin's database first when the phone runs low on space, and it cleared this
   * one; an installed app asking is usually granted without a prompt. Already kept: nothing asked.
   */
  async ensurePersistence(): Promise<boolean | null> {
    if (this.persistenceAsked) return null;
    this.persistenceAsked = true;
    const manager =
      typeof navigator !== 'undefined' && 'storage' in navigator ? navigator.storage : undefined;
    if (!manager || typeof manager.persisted !== 'function') return null;
    try {
      if (await manager.persisted()) return true;
      return typeof manager.persist === 'function' ? await manager.persist() : false;
    } catch {
      return null;
    }
  }

  /** Asks the browser to protect this origin's data from eviction; null when unsupported. */
  async requestPersistence(): Promise<boolean | null> {
    const manager =
      typeof navigator !== 'undefined' && 'storage' in navigator ? navigator.storage : undefined;
    if (!manager || typeof manager.persist !== 'function') return null;
    try {
      return await manager.persist();
    } catch {
      return null;
    }
  }

  /** Writes, reads back, verifies, and removes one probe record; nothing else is touched. */
  async runSaveCheck(): Promise<SaveCheckResult> {
    const checkedAt = this.now();
    const started = Date.now();
    try {
      const db = await this.getDatabase();
      const receipt = await putVerified(
        db,
        'meta',
        { id: DIAGNOSTIC_PROBE_ID, checkedAt, nonce: Math.random().toString(36).slice(2) },
        { now: this.now },
      );
      await deleteVerified(db, 'meta', DIAGNOSTIC_PROBE_ID);
      return { ok: true, ms: Date.now() - started, bytes: receipt.bytes, checkedAt };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Save check failed',
        checkedAt,
      };
    }
  }

  /**
   * Removes temporary data only: a leftover diagnostic probe, an onboarding draft
   * once setup is complete, and snapshots beyond the kept count. Workout history,
   * profile, places, notes, custom content, saved workouts, media, and an active
   * session are never touched; `dryRun` reports without removing.
   */
  async cleanupTemporaryData(options: { dryRun?: boolean } = {}): Promise<CleanupResult> {
    const db = await this.getDatabase();
    const removed: string[] = [];
    const dry = options.dryRun ?? false;
    if ((await db.get<Identified>('meta', DIAGNOSTIC_PROBE_ID)) !== undefined) {
      if (!dry) await deleteVerified(db, 'meta', DIAGNOSTIC_PROBE_ID);
      removed.push('Diagnostic probe record');
    }
    if (
      this.state.localSettings.onboardingCompletedAt &&
      this.storage.getItem(ONBOARDING_DRAFT_KEY) !== null
    ) {
      if (!dry) removeKey(ONBOARDING_DRAFT_KEY, this.storage);
      removed.push('Finished onboarding draft');
    }
    const snapshots = await this.readSnapshots(db);
    for (const stale of snapshots.slice(SNAPSHOTS_KEPT)) {
      if (!dry) await deleteVerified(db, 'backups', stale.id);
      removed.push(`Old automatic backup from ${stale.createdAt}`);
    }
    const kept = [
      `Workout history (${await db.count('workouts')})`,
      `Profile (${await db.count('profile')})`,
      `Places (${await db.count('locations')})`,
      `Notes and cues (${await db.count('customInstructions')})`,
      `Custom exercises (${await db.count('customExercises')})`,
      `Your demonstrations (${await db.count('customMedia')})`,
      `Saved workouts (${await db.count('savedWorkouts')})`,
      `Automatic backups (${Math.min(snapshots.length, SNAPSHOTS_KEPT)})`,
      ...(this.storage.getItem(SESSION_KEY) !== null ? ['Active or previewed session'] : []),
      ...(readKeptSessions(this.storage).length > 0
        ? [`Workouts kept for recovery (${readKeptSessions(this.storage).length})`]
        : []),
    ];
    return { removed, kept };
  }
}
