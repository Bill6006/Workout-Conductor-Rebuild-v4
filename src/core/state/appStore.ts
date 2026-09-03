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
import {
  HOME_LOCATION_ID,
  LocationProfileSchema,
  type LocationProfile,
} from '../validation/location';
import { UserProfileSchema, type UserProfile } from '../validation/profile';
import type { LocalSettings } from '../validation/settings';
import type { CustomExercise, CustomInstruction, CustomMedia } from '../validation/customExercise';

/**
 * The single application state owner. Durable data goes through IndexedDB
 * with verified saves; small settings go through localStorage. React reads it
 * with useSyncExternalStore (see AppStoreProvider).
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
  customCounts: { exercises: number; instructions: number; media: number };
}

export interface AppStoreOptions {
  openDb?: () => Promise<Database>;
  storage?: KeyValueStorage;
  now?: () => string;
}

type Listener = () => void;

function sortLocations(locations: LocationProfile[]): LocationProfile[] {
  const order = { home: 0, gym: 1, travel: 2, custom: 3 } as const;
  return [...locations].sort(
    (a, b) => order[a.kind] - order[b.kind] || a.createdAt.localeCompare(b.createdAt),
  );
}

export class AppStore {
  private state: AppState;
  private readonly listeners = new Set<Listener>();
  private readonly openDb: () => Promise<Database>;
  private readonly storage: KeyValueStorage;
  private readonly now: () => string;
  private dbPromise: Promise<Database> | null = null;

  constructor(options: AppStoreOptions = {}) {
    this.openDb = options.openDb ?? (() => openDatabase());
    this.storage = options.storage ?? defaultStorage();
    this.now = options.now ?? (() => new Date().toISOString());
    this.state = {
      status: 'loading',
      error: null,
      profile: null,
      locations: [],
      localSettings: readLocalSettings(this.storage),
      lastReceipt: null,
      workoutCount: 0,
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
      const [profiles, locations, workoutCount, customExercises, customInstructions, customMedia] =
        await Promise.all([
          db.getAll<Identified>('profile'),
          db.getAll<Identified>('locations'),
          db.count('workouts'),
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
        workoutCount,
        customCounts: {
          exercises: customExercises,
          instructions: customInstructions,
          media: customMedia,
        },
      });
    } catch (error) {
      this.setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Local storage could not be opened.',
      });
    }
  }

  async saveProfile(profile: UserProfile): Promise<SaveReceipt> {
    const next = UserProfileSchema.parse({ ...profile, updatedAt: this.now() });
    const db = await this.getDatabase();
    const receipt = await putVerified(db, 'profile', next, { now: this.now });
    this.setState({ profile: next, lastReceipt: receipt, error: null });
    return receipt;
  }

  async saveLocation(location: LocationProfile): Promise<SaveReceipt> {
    const next = LocationProfileSchema.parse({ ...location, updatedAt: this.now() });
    const db = await this.getDatabase();
    const receipt = await putVerified(db, 'locations', next, { now: this.now });
    const others = this.state.locations.filter((candidate) => candidate.id !== next.id);
    this.setState({ locations: sortLocations([...others, next]), lastReceipt: receipt });
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
