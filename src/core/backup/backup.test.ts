import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openDatabase, type Database, type StoreName } from '../storage/indexedDb';
import {
  BACKUP_SCHEMA_VERSION,
  HistoryExportSchema,
  SettingsExportSchema,
  migrateBackupShape,
} from '../validation/backup';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { DEFAULT_LOCAL_SETTINGS } from '../validation/settings';
import {
  RestoreRollbackError,
  backupFileName,
  buildBackup,
  buildHistoryExport,
  buildSettingsExport,
  historyFileName,
  parseBackupText,
  restoreBackup,
  sameData,
  serializeBackup,
  settingsFileName,
  summarizeBackup,
} from './backup';

const NOW = '2026-09-02T12:00:00.000Z';

function sampleBackup() {
  return buildBackup(
    {
      profile: createDefaultProfile(NOW),
      locations: createDefaultLocations({ gymAccess: true }, NOW),
      localSettings: { ...DEFAULT_LOCAL_SETTINGS, onboardingCompletedAt: NOW },
      workouts: [{ id: 'w1', synthetic: true }],
      customExercises: [],
      customInstructions: [],
      customMedia: [],
      savedWorkouts: [],
      meta: [{ id: 'legacy-import-1', kind: 'receipt' }],
    },
    { version: '0.0.1', commit: 'abc' },
    NOW,
  );
}

describe('backup format', () => {
  it('builds, serializes, and parses an exact round trip at schema 2', () => {
    const backup = sampleBackup();
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    const parsed = parseBackupText(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.backup).toEqual(backup);
      expect(parsed.summary).toMatchObject({
        hasProfile: true,
        primaryGoal: 'build-muscle',
        locationCount: 2,
        workoutCount: 1,
        noteCount: 0,
        mediaCount: 0,
        savedWorkoutCount: 0,
        newerThanThisApp: false,
        migrations: [],
        unknownTopLevelKeys: [],
      });
      expect(parsed.summary.bytes).toBeGreaterThan(100);
    }
    expect(backupFileName(NOW)).toBe('workout-conductor-backup-20260902-1200.json');
    expect(historyFileName(NOW)).toBe('workout-conductor-history-20260902-1200.json');
    expect(settingsFileName(NOW)).toBe('workout-conductor-settings-20260902-1200.json');
  });

  it('migrates a schema 1 backup forward and keeps every unknown field', () => {
    const v1 = {
      ...sampleBackup(),
      schemaVersion: 1,
      extraTop: 'kept',
      data: { ...sampleBackup().data, extraInner: { nested: true } },
    };
    delete (v1.data as { meta?: unknown }).meta;
    const migrated = migrateBackupShape(v1);
    expect(migrated.steps).toEqual([{ from: 1, to: 2, note: 'Added the meta section (empty).' }]);
    const parsed = parseBackupText(JSON.stringify(v1));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.backup.schemaVersion).toBe(2);
      expect(parsed.backup.data.meta).toEqual([]);
      expect(parsed.backup.extraTop).toBe('kept');
      expect(parsed.backup.data.extraInner).toEqual({ nested: true });
      expect(parsed.summary.migrations).toHaveLength(1);
      expect(parsed.summary.unknownTopLevelKeys).toEqual(['extraTop']);
    }
  });

  it('rejects non-JSON and non-backup files with readable errors', () => {
    expect(parseBackupText('nope')).toEqual({ ok: false, error: 'This file is not valid JSON.' });
    const wrong = parseBackupText(JSON.stringify({ format: 'something-else' }));
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toMatch(/not a Workout Conductor backup/);
    expect(migrateBackupShape('text').steps).toEqual([]);
  });

  it('passes newer schema versions through untouched and flags them', () => {
    const backup = { ...sampleBackup(), schemaVersion: 7, futureSection: { a: 1 } };
    const parsed = parseBackupText(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.backup.futureSection).toEqual({ a: 1 });
      expect(parsed.backup.schemaVersion).toBe(7);
      expect(summarizeBackup(parsed.backup).newerThanThisApp).toBe(true);
      expect(summarizeBackup(parsed.backup).unknownTopLevelKeys).toEqual(['futureSection']);
    }
  });

  it('exports history and settings on their own', () => {
    const backup = sampleBackup();
    const history = buildHistoryExport({ workouts: backup.data.workouts }, backup.app, NOW);
    expect(HistoryExportSchema.safeParse(JSON.parse(serializeBackup(history))).success).toBe(true);
    expect(history.workouts).toEqual([{ id: 'w1', synthetic: true }]);
    const settings = buildSettingsExport(backup.data, backup.app, NOW);
    expect(SettingsExportSchema.safeParse(JSON.parse(serializeBackup(settings))).success).toBe(
      true,
    );
    expect(settings.locations).toHaveLength(2);
    expect('workouts' in settings).toBe(false);
  });

  it('compares durable data while ignoring export bookkeeping', () => {
    const a = sampleBackup();
    const b = {
      ...a,
      exportedAt: '2027-01-01T00:00:00.000Z',
      data: { ...a.data, localSettings: { ...a.data.localSettings, lastExportAt: NOW } },
    };
    expect(sameData(a, b)).toBe(true);
    expect(sameData(a, { ...a, data: { ...a.data, workouts: [] } })).toBe(false);
  });
});

describe('restoreBackup', () => {
  it('replaces durable data exactly and reports counts', async () => {
    const db = await openDatabase({ factory: new IDBFactory(), name: 'restore' });
    await db.put('locations', { id: 'stale', name: 'Old place' });
    await db.put('meta', { id: 'stale-meta' });
    const backup = sampleBackup();
    const counts = await restoreBackup(db, backup, { now: () => NOW });

    expect(counts).toEqual({
      profile: 1,
      locations: 2,
      workouts: 1,
      customExercises: 0,
      customInstructions: 0,
      customMedia: 0,
      savedWorkouts: 0,
      meta: 1,
    });
    expect(await db.get('profile', 'current')).toEqual(backup.data.profile);
    expect((await db.getAll('locations')).map((location) => location.id).sort()).toEqual([
      'gym',
      'home',
    ]);
    expect(await db.getAll('workouts')).toEqual([{ id: 'w1', synthetic: true }]);
    expect(await db.getAll('meta')).toEqual([{ id: 'legacy-import-1', kind: 'receipt' }]);
  });

  it('rolls back to the previous data when a write fails part-way, and verifies the rollback', async () => {
    const real = await openDatabase({ factory: new IDBFactory(), name: 'rollback' });
    const previousProfile = { ...createDefaultProfile(NOW), units: 'kg' as const };
    await real.put('profile', previousProfile);
    await real.put('locations', { id: 'home', name: 'Old home' });

    let puts = 0;
    const flaky: Database = {
      ...real,
      put: async (store: StoreName, value) => {
        puts += 1;
        if (puts === 2) throw new Error('disk full');
        await real.put(store, value);
      },
    };

    await expect(restoreBackup(flaky, sampleBackup(), { now: () => NOW })).rejects.toThrow(
      'disk full',
    );
    expect(await real.get('profile', 'current')).toEqual(previousProfile);
    expect(await real.getAll('locations')).toEqual([{ id: 'home', name: 'Old home' }]);
    expect(await real.count('workouts')).toBe(0);
  });

  it('says so plainly when the rollback itself cannot be verified', async () => {
    const real = await openDatabase({ factory: new IDBFactory(), name: 'rollback-broken' });
    await real.put('locations', { id: 'home', name: 'Old home' });
    // Every write of the "home" place fails: first the restore, then the rollback.
    const broken: Database = {
      ...real,
      put: async (store: StoreName, value) => {
        if (value.id === 'home') throw new Error('write refused');
        await real.put(store, value);
      },
    };
    await expect(restoreBackup(broken, sampleBackup(), { now: () => NOW })).rejects.toBeInstanceOf(
      RestoreRollbackError,
    );
  });
});
