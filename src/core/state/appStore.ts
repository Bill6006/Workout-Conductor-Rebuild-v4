import { EQUIPMENT } from '../../catalog/equipment/equipment';
import {
  allExercises,
  getExercise,
  registerCustomExercises,
  requireExercise,
} from '../../catalog/exercises/catalog';
import type { MuscleId } from '../../catalog/muscles/muscles';
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns';
import { resolveTargetMinutes } from '../../engine/duration/duration';
import { autoregulate, outcomeFor } from '../../engine/recalibration/autoregulate';
import { dropSetWeight, pendingDropSet, withDropWeight } from '../../engine/recalibration/dropSet';
import {
  LoadingSpecSchema,
  fitWeight,
  loadingFor,
  type LoadingSpec,
} from '../../engine/loading/loading';
import {
  inspectCloud,
  pendingCount,
  readCloudState,
  readCloudUrl,
  resetCloudState,
  restartPull,
  saveCloudUrl,
  seedOutbox,
  syncOnce,
  type SyncOutcome,
} from '../cloud/cloudSync';
import { deviceLabel, ensureDeviceId } from '../cloud/deviceId';
import {
  TOKEN_LOG_KEY,
  TOKEN_MARK_KEY,
  TOKEN_MIRROR_KEY,
  clearToken,
  readTokenLog,
  resolveToken,
  saveToken,
  type TokenEvent,
} from '../cloud/tokenVault';
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
  parseStrengthMaxes,
  recordMax,
  snoozeMaxPrompt,
  type MaxInput,
  type StrengthMaxes,
} from '../../engine/progression/maxes';
import { recalibrate as runRecalibration } from '../../engine/recalibration/recalibrate';
import { describeTrigger, type TriggerContext } from '../../engine/recalibration/triggers';
import type {
  CompletedSet,
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
import { allEntries, type DurationChoice, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { normalizeName } from '../backup/legacyImport';
import {
  COACH_DECLINES_ID,
  UNFINISHED_SOURCE,
  acceptKey,
  emptyDeclines,
  recordDecline,
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
import { deleteVerified, putVerified, type SaveReceipt } from '../storage/verifiedSave';
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
  readKeptSessions,
  readSessionOrKeep,
  writeSession,
  type CalibrationState,
  type CompletionSummary,
  type RestState,
  type SessionRecovery,
  type SetDraft,
  type WorkoutSession,
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
  /** The place whose barcode is on screen, or null. */
  barcodeOpen: string | null;
  calibration: CalibrationState;
  customExercises: CustomExercise[];
  /** Per-exercise notes and cue memory. */
  customInstructions: CustomInstruction[];
  savedWorkouts: SavedWorkout[];
  customCounts: { exercises: number; instructions: number; media: number };
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
  /** The optional cloud copy: on only while a token is on this device. */
  cloud: CloudStatus;
}

export interface CloudStatus {
  url: string;
  configured: boolean;
  syncing: boolean;
  /** Local changes the cloud copy has not received yet. */
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
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

export class AppStore {
  private state: AppState;
  private readonly listeners = new Set<Listener>();
  private readonly openDb: () => Promise<Database>;
  private readonly storage: KeyValueStorage;
  private readonly now: () => string;
  /** Background work (automatic snapshots) that tests and diagnostics can wait for. */
  private pendingWork: Promise<void> = Promise.resolve();
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
      barcodeOpen: null,
      calibration: IDLE_CALIBRATION,
      customExercises: [],
      customInstructions: [],
      customCounts: { exercises: 0, instructions: 0, media: 0 },
      coachRoutes: emptyRoutes(),
      coachDeclines: emptyDeclines(),
      deloadWeek: null,
      strengthMaxes: emptyMaxes(),
      coachFocus: null,
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
    try {
      const db = await this.getDatabase();
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
        db.getAll<Identified>('device'),
      ]);
      const deviceId = ensureDeviceId(this.storage);
      // Finds the token in either of its copies and heals the other. A copy that
      // could not be healed must not stop the app from opening.
      const resolved = await resolveToken(db, this.storage, this.now()).catch(() => null);
      // A database that lost the token may have lost more: the next sync walks everything.
      if (resolved?.recover) await restartPull(db);
      const [cloudUrl, cloudState, pending] = await Promise.all([
        readCloudUrl(db),
        readCloudState(db),
        pendingCount(db),
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
          media: customMedia,
        },
        coachRoutes: parseCoachRoutes(routesRaw),
        coachDeclines: parseCoachDeclines(declinesRaw),
        deloadWeek: parseDeloadWeek(deloadRaw, this.now()),
        strengthMaxes: parseStrengthMaxes(maxesRaw),
        coachFocus: parseCoachFocus(focusRaw, this.now()),
        barcodes: parsePlaceBarcodes(deviceRaw),
        cloud: {
          ...this.state.cloud,
          url: cloudUrl,
          configured: (resolved?.token ?? null) !== null,
          pending,
          lastSyncAt: cloudState.lastSyncAt,
          lastError: cloudState.lastError,
          deviceId,
          notice: resolved?.notice ?? null,
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
      constraints: { deload, focusMuscle: focus },
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

  /** Keeps the session after a save that needs no recalibration (units, notes). */
  private syncSessionKey(): void {
    const key = this.baseKey();
    const { session } = this.state;
    if (key && session && session.baseKey !== key) this.setSession({ ...session, baseKey: key });
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
      case 'reorder': {
        const entry = entryOf(trigger.entryId);
        return { exerciseName: entry ? requireExercise(entry.exerciseId).name : undefined };
      }
      case 'equipment-busy': {
        const entry = entryOf(trigger.entryId);
        const first = entry ? requireExercise(entry.exerciseId).equipment[0]?.[0] : undefined;
        const name = first ? EQUIPMENT.find((item) => item.id === first)?.name : undefined;
        return { equipment: name ? name.toLowerCase() : 'station' };
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
    const run = this.calibrationQueue.then(() => this.runCalibration(trigger, reason));
    this.calibrationQueue = run.catch(() => undefined);
    return run;
  }

  private async runCalibration(
    trigger: RecalibrationTrigger,
    reason: string | undefined,
  ): Promise<RecalibrationResult | null> {
    const session = this.state.session;
    const { profile, history } = this.state;
    if (!session || !profile || session.status === 'completed') return null;
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

    const request: RecalibrationRequest = {
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
      history,
      constraints: session.constraints,
      maxes: this.state.strengthMaxes,
      reason: reason ?? described.title,
      timestamp: this.now(),
    };
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

    const latest = this.state.session ?? session;
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

  /** Restores the workout and constraints from before the last recalibration. */
  undoRecalibration(): void {
    const session = this.state.session;
    if (!session?.previous) return;
    const headline = 'Restored the previous workout.';
    const position = currentPosition(session.previous.workout, this.isDoneFor(session));
    this.setSession({
      ...session,
      workout: session.previous.workout,
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
      previous: null,
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
    const { session, profile } = this.state;
    if (!session || !profile) return Promise.resolve(null);
    const minutes = resolveTargetMinutes(session.duration, profile.schedule.typicalDurationMinutes);
    const time = on ? new Date(this.nowMs() + minutes * 60_000).toISOString() : null;
    return this.recalibrate({ type: 'end-by', time });
  }

  // ---------------------------------------------------------------- active workout

  startWorkout(): void {
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
    // At a place with a barcode set to show, it comes up for the desk as the workout starts.
    const barcode = this.barcodeFor(this.state.profile?.currentLocationId);
    if (barcode?.autoShow) this.setState({ barcodeOpen: barcode.locationId });
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
    this.setSession({
      ...session,
      status: 'paused',
      pausedAt: this.now(),
      activeSince: null,
      completed: { ...session.completed, elapsedSeconds: elapsedSeconds(session, nowMs) },
      rest,
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
    this.setSession({
      ...session,
      status: 'active',
      activeSince: this.now(),
      pausedAt: null,
      rest,
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
    const existingAt = session.completed.sets.findIndex(
      (candidate) => candidate.entryId === entryId && candidate.setIndex === setIndex,
    );
    const isEdit = existingAt >= 0;
    const logged: CompletedSet = {
      entryId,
      exerciseId: entry.exerciseId,
      setIndex,
      kind: set.kind,
      reps,
      weight: skipped ? null : values.weight,
      rir: skipped ? null : values.rir,
      completedAt: isEdit ? (session.completed.sets[existingAt] as CompletedSet).completedAt : now,
      skipped,
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
      rest,
      // A skip carries no numbers, and a warm-up or drop set carries the wrong ones, so only
      // a working set becomes the next set's prefill.
      drafts:
        skipped || set.kind !== 'working'
          ? session.drafts
          : { ...session.drafts, [entryId]: { weight: values.weight, reps, rir: values.rir } },
    });

    if (!isEdit && set.kind === 'working' && !skipped) {
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
          await this.recalibrate({
            type: 'performance',
            entryId,
            setIndex,
            actualReps: reps,
            actualWeight: values.weight,
            plan,
          });
        }
      }
    }
    if (set.kind === 'working' && !skipped) this.settleDropSet(entryId);
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
  ): Promise<{ kind: 'removed' | 'trimmed'; skippedSets: number; name: string }> {
    const session = this.requireSession();
    const entry = allEntries(session.workout.blocks).find((candidate) => candidate.id === entryId);
    if (!entry) throw new Error('That exercise is no longer in the workout.');
    const name = requireExercise(entry.exerciseId).name;
    const logged = session.completed.sets.some((done) => done.entryId === entryId);
    if (!logged) {
      await this.recalibrate({ type: 'skip', entryId });
      return { kind: 'removed', skippedSets: 0, name };
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
    });
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
    this.setSession({
      ...session,
      completed: { ...session.completed, sets, currentEntryId: next?.entryId ?? null },
    });
  }

  setDraft(entryId: string, draft: SetDraft): void {
    const session = this.requireSession();
    this.setSession({ ...session, drafts: { ...session.drafts, [entryId]: draft } });
  }

  adjustRest(deltaSeconds: number): void {
    const session = this.requireSession();
    if (!session.rest) return;
    const rest = session.rest;
    const seconds = Math.max(0, rest.seconds + deltaSeconds);
    this.setSession({
      ...session,
      rest:
        rest.pausedRemaining !== null
          ? { ...rest, seconds, pausedRemaining: Math.max(0, rest.pausedRemaining + deltaSeconds) }
          : {
              ...rest,
              seconds,
              endsAt: new Date(Date.parse(rest.endsAt) + deltaSeconds * 1000).toISOString(),
            },
    });
  }

  skipRest(): void {
    const session = this.requireSession();
    if (!session.rest) return;
    this.setSession({ ...session, rest: null });
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
      workout: session.workout,
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
    const workout = {
      ...saved.workout,
      id: `wk-${now.slice(0, 10)}-saved-${saved.id}`,
      generatedAt: now,
      recalibration: { version: 1, lastTrigger: null },
    };
    const headline = `Loaded "${saved.name}".`;
    this.setSession({
      ...createSession(session.baseKey, workout, now),
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
    const db = await this.getDatabase();
    const existed = (await db.get<Identified>('customMedia', exerciseId)) !== undefined;
    const receipt = await putVerified(db, 'customMedia', record, { now: this.now });
    this.setState({
      lastReceipt: receipt,
      customCounts: {
        ...this.state.customCounts,
        media: this.state.customCounts.media + (existed ? 0 : 1),
      },
    });
    return record;
  }

  async getCustomMedia(exerciseId: string): Promise<CustomMedia | null> {
    const db = await this.getDatabase();
    const raw = await db.get<Identified>('customMedia', exerciseId);
    if (!raw) return null;
    const parsed = CustomMediaSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  /** Removes the user's demonstration for an exercise; the placeholder returns. */
  async deleteCustomMedia(exerciseId: string): Promise<void> {
    const db = await this.getDatabase();
    const existed = (await db.get<Identified>('customMedia', exerciseId)) !== undefined;
    if (!existed) return;
    await deleteVerified(db, 'customMedia', exerciseId);
    this.setState({
      customCounts: {
        ...this.state.customCounts,
        media: Math.max(0, this.state.customCounts.media - 1),
      },
    });
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
    if (trigger && this.state.session.status !== 'completed') await this.recalibrate(trigger);
    else this.syncSessionKey();
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
      await this.recalibrate({ type: 'loading' });
    }
  }

  /** Plates that are not around today; the session re-fits its loads and its plate lines. */
  async setMissingPlates(plates: readonly number[]): Promise<void> {
    const session = this.requireSession();
    const missingPlates = [...new Set(plates)].sort((a, b) => b - a);
    this.setSession({ ...session, loading: { ...session.loading, missingPlates } });
    if (session.status !== 'completed') await this.recalibrate({ type: 'loading' });
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
    await deleteVerified(db, 'locations', id);
    const locations = this.state.locations.filter((location) => location.id !== id);
    this.setState({ locations });
    if (this.barcodeFor(id)) await this.removeBarcode(id);
    if (this.state.profile?.currentLocationId === id) {
      await this.saveProfile({ ...this.state.profile, currentLocationId: HOME_LOCATION_ID });
    }
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
    const now = this.now();
    const previous = this.barcodeFor(locationId);
    const record = PlaceBarcodeSchema.parse({
      id: barcodeIdFor(locationId),
      locationId,
      image: picked.image,
      ...(picked.code ? { code: picked.code } : {}),
      autoShow: previous?.autoShow ?? true,
      addedAt: previous?.addedAt ?? now,
      updatedAt: now,
    });
    const db = await this.getDatabase();
    const receipt = await putVerified(db, 'device', record, { now: this.now });
    this.setState({
      barcodes: [...this.state.barcodes.filter((item) => item.locationId !== locationId), record],
      lastReceipt: receipt,
    });
    return receipt;
  }

  async setBarcodeAutoShow(locationId: string, autoShow: boolean): Promise<void> {
    const barcode = this.barcodeFor(locationId);
    if (!barcode || barcode.autoShow === autoShow) return;
    const record = { ...barcode, autoShow, updatedAt: this.now() };
    const db = await this.getDatabase();
    await putVerified(db, 'device', record, { now: this.now });
    this.setState({
      barcodes: this.state.barcodes.map((item) => (item.locationId === locationId ? record : item)),
    });
  }

  async removeBarcode(locationId: string): Promise<void> {
    const db = await this.getDatabase();
    await deleteVerified(db, 'device', barcodeIdFor(locationId));
    this.setState({
      barcodes: this.state.barcodes.filter((item) => item.locationId !== locationId),
      barcodeOpen: this.state.barcodeOpen === locationId ? null : this.state.barcodeOpen,
    });
  }

  /** Puts a place's barcode on screen; the current place when none is named. */
  openBarcode(locationId?: string): void {
    const barcode = this.barcodeFor(locationId ?? this.state.profile?.currentLocationId);
    if (barcode) this.setState({ barcodeOpen: barcode.locationId });
  }

  closeBarcode(): void {
    if (this.state.barcodeOpen !== null) this.setState({ barcodeOpen: null });
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

  /** Saves locations first, then the profile, then marks onboarding complete. */
  async completeOnboarding(rawProfile: UserProfile, locations: LocationProfile[]): Promise<void> {
    const profile = normalizeProfile(rawProfile);
    const db = await this.getDatabase();
    const existing = await db.getAll<Identified>('locations');
    for (const stale of existing) {
      if (!locations.some((location) => location.id === stale.id)) {
        await deleteVerified(db, 'locations', stale.id);
      }
    }
    for (const location of locations) {
      await putVerified(db, 'locations', LocationProfileSchema.parse(location), { now: this.now });
    }
    this.setState({ locations: sortLocations(locations) });
    await this.saveProfile(profile);
    removeKey(ONBOARDING_DRAFT_KEY, this.storage);
    this.updateLocalSettings({ onboardingCompletedAt: this.now() });
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
    this.regeneratePreview();
    return week;
  }

  async cancelDeloadWeek(): Promise<void> {
    const db = await this.getDatabase();
    if ((await db.get<Identified>('meta', DELOAD_WEEK_ID)) !== undefined) {
      await deleteVerified(db, 'meta', DELOAD_WEEK_ID);
    }
    this.setState({ deloadWeek: null });
    this.regeneratePreview();
  }

  /** A previewed (not started) session is rebuilt from today's inputs. */
  private regeneratePreview(): void {
    const session = this.state.session;
    if (!session || session.status !== 'preview') return;
    clearSession(this.storage);
    this.setState({ session: null });
    this.ensureSession();
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
    const current = await readCloudUrl(db);
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
      cloud: { ...this.state.cloud, url, configured: true, lastError: null, notice: null },
    });
    if (!this.startCloud()) await this.syncNow({ pull: true, force: true });
  }

  /** Reports a cloud problem where the Cloud copy card already shows one. */
  noteCloudError(message: string): void {
    this.setState({ cloud: { ...this.state.cloud, lastError: message } });
  }

  /** Removes the token; the cloud copy is off and nothing leaves the device. The outbox is kept. */
  async clearCloudToken(): Promise<void> {
    this.cloudEpoch += 1;
    const db = await this.getDatabase();
    await clearToken(db, this.storage, this.now());
    this.stopCloud();
    this.dropCloudClient();
    this.setState({
      cloud: {
        ...this.state.cloud,
        configured: false,
        syncing: false,
        lastError: null,
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
  syncNow(
    options: { pull: boolean; force?: boolean; full?: boolean } = { pull: true },
  ): Promise<SyncOutcome | null> {
    const run = this.syncRun.then(() => this.runSync(options));
    this.syncRun = run.catch(() => null);
    this.pendingWork = this.pendingWork.then(() => this.syncRun.then(() => undefined));
    return run;
  }

  private async runSync(options: {
    pull: boolean;
    force?: boolean;
    full?: boolean;
  }): Promise<SyncOutcome | null> {
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
    const client = await this.cloudClientFor(token, await readCloudUrl(db));
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
        error: error instanceof Error ? error.message : 'Sync failed.',
      };
    }
    const cloudState = await readCloudState(db);
    const pending = await pendingCount(db);
    // The token was saved or removed while this attempt was in flight: its result is stale.
    if (epoch !== this.cloudEpoch) return outcome;
    this.setState({
      cloud: {
        ...this.state.cloud,
        configured: true,
        syncing: false,
        pending,
        notice: resolved.notice,
        lastSyncAt: cloudState.lastSyncAt,
        lastError: outcome.ran
          ? outcome.error
          : outcome.reason === 'offline'
            ? 'Offline; it will sync when the device is back online.'
            : cloudState.lastError,
      },
    });
    // Records that arrived from the cloud are on disk; the state reloads from it.
    if (outcome.applied + outcome.removed > 0) await this.hydrate();
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
    this.regeneratePreview();
  }

  async clearCoachFocus(): Promise<void> {
    const db = await this.getDatabase();
    if ((await db.get<Identified>('meta', COACH_FOCUS_ID)) !== undefined) {
      await deleteVerified(db, 'meta', COACH_FOCUS_ID);
    }
    this.setState({ coachFocus: null });
    this.regeneratePreview();
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
  async dismissCoachSignal(signal: Pick<CoachSignal, 'source' | 'exerciseId'>): Promise<void> {
    if (signal.source !== UNFINISHED_SOURCE) {
      await this.declineCoachSignal(signal);
      return;
    }
    const session = this.state.session;
    if (session && !session.coachAccepted.includes(UNFINISHED_SOURCE)) {
      this.setSession({ ...session, coachAccepted: [...session.coachAccepted, UNFINISHED_SOURCE] });
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
  acceptCoachSignal(signal: Pick<CoachSignal, 'source' | 'exerciseId' | 'headline'>): void {
    const session = this.state.session;
    if (!session) return;
    const key = acceptKey(signal);
    if (session.coachAccepted.includes(key)) return;
    this.setSession({ ...session, coachAccepted: [...session.coachAccepted, key] });
  }

  /** Records that the lifter took a coach route step; the step itself is applied elsewhere. */
  async noteCoachAction(action: CoachAction): Promise<void> {
    if (!action.route) return;
    const next = applyRouteStep(
      this.state.coachRoutes,
      action.route.exerciseId,
      action.route.step,
      action.route.baselineE1rm,
      this.now(),
    );
    if (next === this.state.coachRoutes) return;
    const db = await this.getDatabase();
    await putVerified(db, 'meta', next, { now: this.now });
    this.setState({ coachRoutes: next });
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
    ].map((key) => ({
      key,
      present: this.storage.getItem(key) !== null,
    }));
    const tokenLog = await readTokenLog(db, this.storage);
    return { usageBytes, quotaBytes, persisted, counts, localKeys, tokenLog };
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
