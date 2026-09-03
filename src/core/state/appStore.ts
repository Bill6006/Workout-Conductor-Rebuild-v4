import { EQUIPMENT } from '../../catalog/equipment/equipment';
import { getExercise, requireExercise } from '../../catalog/exercises/catalog';
import { resolveTargetMinutes } from '../../engine/duration/duration';
import { recalibrate as runRecalibration } from '../../engine/recalibration/recalibrate';
import { describeTrigger, type TriggerContext } from '../../engine/recalibration/triggers';
import type {
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationTrigger,
} from '../../engine/recalibration/types';
import { allEntries, type DurationChoice } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import {
  buildBackup,
  restoreBackup,
  type BackupAppInfo,
  type WorkoutRecord,
} from '../backup/backup';
import { openDatabase, type Database, type Identified } from '../storage/indexedDb';
import {
  ONBOARDING_DRAFT_KEY,
  defaultStorage,
  readLocalSettings,
  removeKey,
  updateLocalSettings,
  type KeyValueStorage,
} from '../storage/localSettings';
import { deleteVerified, putVerified, type SaveReceipt } from '../storage/verifiedSave';
import type { Backup } from '../validation/backup';
import type { CustomExercise, CustomInstruction, CustomMedia } from '../validation/customExercise';
import {
  HOME_LOCATION_ID,
  LocationProfileSchema,
  type LocationProfile,
} from '../validation/location';
import { UserProfileSchema, type UserProfile } from '../validation/profile';
import type { LocalSettings } from '../validation/settings';
import {
  parseWorkoutRecords,
  type WorkoutRecord as WorkoutHistoryRecord,
} from '../validation/workoutRecord';
import {
  CALIBRATION_LOG_LIMIT,
  IDLE_CALIBRATION,
  computeBaseKey,
  createSession,
  readSession,
  writeSession,
  type CalibrationState,
  type WorkoutSession,
} from './session';

/**
 * The single application state owner. Durable data goes through IndexedDB
 * with verified saves; small settings and the workout session go through
 * localStorage. React reads it with useSyncExternalStore (see AppStoreProvider).
 *
 * Every change to the generated workout runs through `recalibrate`, which
 * shows the calibration state, calls the pure Recalibration Engine, and either
 * commits the new workout with its change summary or keeps the previous one
 * and reports the error.
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
  /** Parsed workout history, newest last; drives weekly volume and exposure. */
  history: WorkoutHistoryRecord[];
  /** Today's workout session: the generated workout plus session-only state. */
  session: WorkoutSession | null;
  calibration: CalibrationState;
  customCounts: { exercises: number; instructions: number; media: number };
}

export interface AppStoreOptions {
  openDb?: () => Promise<Database>;
  storage?: KeyValueStorage;
  now?: () => string;
  /** The recalibration engine; tests inject a failing one to prove rollback. */
  recalibrate?: typeof runRecalibration;
  /** Minimum time the calibration overlay stays up so a fast rebuild still reads as a change. */
  minOverlayMs?: number;
}

type Listener = () => void;

const DEFAULT_MIN_OVERLAY_MS = 450;
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
  const relevant = (profile: UserProfile) =>
    JSON.stringify([
      profile.goals,
      profile.experience,
      profile.schedule,
      profile.exercisePreferences,
      { ...profile.limitations, notes: '' },
      profile.trainingStyle,
      profile.restStyle,
    ]);
  return relevant(previous) !== relevant(next) ? { type: 'profile' } : null;
}

export class AppStore {
  private state: AppState;
  private readonly listeners = new Set<Listener>();
  private readonly openDb: () => Promise<Database>;
  private readonly storage: KeyValueStorage;
  private readonly now: () => string;
  private readonly engine: typeof runRecalibration;
  private readonly minOverlayMs: number;
  private dbPromise: Promise<Database> | null = null;
  private calibrationQueue: Promise<unknown> = Promise.resolve();

  constructor(options: AppStoreOptions = {}) {
    this.openDb = options.openDb ?? (() => openDatabase());
    this.storage = options.storage ?? defaultStorage();
    this.now = options.now ?? (() => new Date().toISOString());
    this.engine = options.recalibrate ?? runRecalibration;
    this.minOverlayMs = options.minOverlayMs ?? DEFAULT_MIN_OVERLAY_MS;
    this.state = {
      status: 'loading',
      error: null,
      profile: null,
      locations: [],
      localSettings: readLocalSettings(this.storage),
      lastReceipt: null,
      workoutCount: 0,
      history: [],
      session: null,
      calibration: IDLE_CALIBRATION,
      customCounts: { exercises: 0, instructions: 0, media: 0 },
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
    this.dbPromise ??= this.openDb();
    return this.dbPromise;
  }

  async hydrate(): Promise<void> {
    try {
      const db = await this.getDatabase();
      const [profiles, locations, workouts, customExercises, customInstructions, customMedia] =
        await Promise.all([
          db.getAll<Identified>('profile'),
          db.getAll<Identified>('locations'),
          db.getAll<Identified>('workouts'),
          db.count('customExercises'),
          db.count('customInstructions'),
          db.count('customMedia'),
        ]);
      const parsedProfile = profiles[0] ? UserProfileSchema.safeParse(profiles[0]) : null;
      const validLocations = locations
        .map((location) => LocationProfileSchema.safeParse(location))
        .filter((result) => result.success)
        .map((result) => result.data);

      this.setState({
        status: 'ready',
        error:
          parsedProfile && !parsedProfile.success
            ? 'The stored profile could not be read. Finish setup again to replace it.'
            : null,
        profile: parsedProfile?.success ? parsedProfile.data : null,
        locations: sortLocations(validLocations),
        localSettings: readLocalSettings(this.storage),
        workoutCount: workouts.length,
        history: parseWorkoutRecords(workouts),
        customCounts: {
          exercises: customExercises,
          instructions: customInstructions,
          media: customMedia,
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

  /**
   * Reuses the persisted session when it was generated from today's inputs;
   * otherwise (first run, a new day, an edited profile, new history) generates
   * a fresh Default session silently.
   */
  private ensureSession(): void {
    const key = this.baseKey();
    const { profile } = this.state;
    if (!key || !profile) {
      this.setState({ session: null });
      return;
    }
    if (this.state.session?.baseKey === key) return;
    const persisted = readSession(this.storage);
    if (persisted && persisted.baseKey === key) {
      this.setState({ session: persisted });
      return;
    }
    const workout = generateWorkout({
      profile,
      location: this.currentLocation(),
      history: this.state.history,
      now: this.now(),
      duration: 'default',
    });
    this.setSession(createSession(key, workout, this.now()));
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
        return { exerciseName: getExercise(trigger.exerciseId)?.name };
      case 'pin': {
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
    if (!session || !profile) return null;
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
      completed: session.completed,
      lockedEntryIds: [],
      currentEntryId: session.completed.currentEntryId,
      duration: trigger.type === 'duration' ? trigger.choice : session.duration,
      profile,
      location: this.currentLocation(),
      history,
      constraints: session.constraints,
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

    const key = this.baseKey() ?? session.baseKey;
    if (result.ok) {
      this.setSession({
        ...session,
        baseKey: key,
        duration: result.duration,
        workout: result.workout,
        constraints: result.constraints,
        defaultEstimatedMinutes:
          result.duration === 'default'
            ? result.workout.duration.estimatedMinutes
            : session.defaultEstimatedMinutes,
        lastSummary: result.summary,
        lastChanges: result.changes,
        previous: {
          workout: session.workout,
          constraints: session.constraints,
          duration: session.duration,
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
          ...session.log,
        ].slice(0, CALIBRATION_LOG_LIMIT),
      });
      this.setState({ calibration: IDLE_CALIBRATION });
    } else {
      // Rollback: the previous, still valid workout stays exactly as it was.
      const current = this.state.session;
      if (current && current.baseKey !== key) this.setSession({ ...current, baseKey: key });
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
    this.setSession({
      ...session,
      workout: session.previous.workout,
      constraints: session.previous.constraints,
      duration: session.previous.duration,
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
    const time = on ? new Date(Date.parse(this.now()) + minutes * 60_000).toISOString() : null;
    return this.recalibrate({ type: 'end-by', time });
  }

  // ---------------------------------------------------------------- durable data

  async saveProfile(profile: UserProfile): Promise<SaveReceipt> {
    const previous = this.state.profile;
    const next = UserProfileSchema.parse({ ...profile, updatedAt: this.now() });
    const db = await this.getDatabase();
    const receipt = await putVerified(db, 'profile', next, { now: this.now });
    this.setState({ profile: next, lastReceipt: receipt, error: null });
    if (!this.state.session) {
      this.ensureSession();
      return receipt;
    }
    const trigger = previous ? profileTrigger(previous, next) : null;
    if (trigger) await this.recalibrate(trigger);
    else this.syncSessionKey();
    return receipt;
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
    if (this.state.profile?.currentLocationId === id) {
      await this.saveProfile({ ...this.state.profile, currentLocationId: HOME_LOCATION_ID });
    }
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
  async completeOnboarding(profile: UserProfile, locations: LocationProfile[]): Promise<void> {
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

  async createBackup(app: BackupAppInfo): Promise<Backup> {
    const db = await this.getDatabase();
    const [workouts, customExercises, customInstructions, customMedia] = await Promise.all([
      db.getAll<WorkoutRecord>('workouts'),
      db.getAll<CustomExercise>('customExercises'),
      db.getAll<CustomInstruction>('customInstructions'),
      db.getAll<CustomMedia>('customMedia'),
    ]);
    const exportedAt = this.now();
    const backup = buildBackup(
      {
        profile: this.state.profile,
        locations: this.state.locations,
        localSettings: this.state.localSettings,
        workouts,
        customExercises,
        customInstructions,
        customMedia,
      },
      app,
      exportedAt,
    );
    this.updateLocalSettings({ lastExportAt: exportedAt });
    return backup;
  }

  /** Verified restore with rollback, then a fresh hydrate from disk. */
  async applyBackup(backup: Backup): Promise<void> {
    const db = await this.getDatabase();
    await restoreBackup(db, backup, { now: this.now });
    this.updateLocalSettings({
      onboardingCompletedAt: backup.data.localSettings.onboardingCompletedAt,
      lastImportAt: this.now(),
    });
    await this.hydrate();
  }
}
