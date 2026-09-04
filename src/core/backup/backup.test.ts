import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openDatabase, type Database, type StoreName } from '../storage/indexedDb';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { DEFAULT_LOCAL_SETTINGS } from '../validation/settings';
import {
  backupFileName,
  buildBackup,
  parseBackupText,
  restoreBackup,
  serializeBackup,
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
    },
    { version: '0.0.1', commit: 'abc' },
    NOW,
  );
}

describe('backup format', () => {
  it('builds, serializes, and parses an exact round trip', () => {
    const backup = sampleBackup();
    const parsed = parseBackupText(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.backup).toEqual(backup);
      expect(parsed.summary).toMatchObject({
        hasProfile: true,
        primaryGoal: 'build-muscle',
        locationCount: 2,
        workoutCount: 1,
        newerThanThisApp: false,
        unknownTopLevelKeys: [],
      });
    }
    expect(backupFileName(NOW)).toBe('workout-conductor-backup-20260902-1200.json');
  });

  it('rejects non-JSON and non-backup files with readable errors', () => {
    expect(parseBackupText('nope')).toEqual({ ok: false, error: 'This file is not valid JSON.' });
    const wrong = parseBackupText(JSON.stringify({ format: 'something-else' }));
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toMatch(/not a Workout Conductor backup/);
  });

  it('preserves unknown fields and flags newer schema versions', () => {
    const backup = { ...sampleBackup(), schemaVersion: 7, futureSection: { a: 1 } };
    const parsed = parseBackupText(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.backup.futureSection).toEqual({ a: 1 });
      expect(summarizeBackup(parsed.backup).newerThanThisApp).toBe(true);
      expect(summarizeBackup(parsed.backup).unknownTopLevelKeys).toEqual(['futureSection']);
    }
  });
});

describe('restoreBackup', () => {
  it('replaces durable data exactly', async () => {
    const db = await openDatabase({ factory: new IDBFactory(), name: 'restore' });
    await db.put('locations', { id: 'stale', name: 'Old place' });
    const backup = sampleBackup();
    await restoreBackup(db, backup, { now: () => NOW });

    expect(await db.get('profile', 'current')).toEqual(backup.data.profile);
    expect((await db.getAll('locations')).map((location) => location.id).sort()).toEqual([
      'gym',
      'home',
    ]);
    expect(await db.getAll('workouts')).toEqual([{ id: 'w1', synthetic: true }]);
  });

  it('rolls back to the previous data when a write fails part-way', async () => {
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
});
