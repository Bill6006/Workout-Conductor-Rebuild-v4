import { describe, expect, it } from 'vitest';
import { sameData } from '../backup/backup';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import { currentPosition } from '../../engine/workout/sequence';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { DIAGNOSTIC_PROBE_ID, SNAPSHOTS_KEPT } from './appStore';
import { doneKeys } from './session';

const APP = { version: 'test', commit: 'abc1234' };

async function seeded(): Promise<TestStoreHandle> {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

/** Logs one set and finishes, so history, records, and a snapshot exist. */
async function finishOneWorkout(handle: TestStoreHandle): Promise<void> {
  const { store } = handle;
  await store.startWorkout();
  const session = store.getSnapshot().session;
  if (!session) throw new Error('no session');
  const keys = doneKeys(session.completed);
  const at = currentPosition(session.workout, (id, index) => keys.has(`${id}:${index}`));
  if (!at) throw new Error('no position');
  await store.logSet(at.entryId, at.setIndex, { weight: 100, reps: 8, rir: 2 });
  await store.finishWorkout(null);
  // The workout snapshot is written in the background after completion.
  await store.flushPendingWork();
}

describe('backup, snapshots, and diagnostics in the store', () => {
  it('restores a full backup exactly, including notes, custom content, media, saved workouts, and meta', async () => {
    const source = await seeded();
    const custom = await source.store.addCustomExercise({
      name: 'Landmine Press',
      primaryMuscles: ['chest'],
      movementPattern: 'horizontal-push',
      equipment: [['barbell']],
    });
    await source.store.addCustomMedia(custom.id, {
      kind: 'image',
      mimeType: 'image/gif',
      sizeBytes: 12,
      dataUrl: 'data:image/gif;base64,AAAA',
    });
    await source.store.saveExerciseNotes('barbell-bench-press', {
      notes: 'Elbows tucked',
      cues: ['Leg drive'],
    });
    await finishOneWorkout(source);
    await source.store.saveCurrentWorkout('Push day');
    const exported = await source.store.createBackup(APP);
    expect(exported.data.customInstructions).toHaveLength(1);
    expect(exported.data.customMedia).toHaveLength(1);
    expect(exported.data.workouts).toHaveLength(1);
    expect(exported.data.savedWorkouts).toHaveLength(1);

    const target = await seeded();
    const counts = await target.store.applyBackup(exported);
    expect(counts.workouts).toBe(1);
    expect(counts.customMedia).toBe(1);
    const reexported = await target.store.createBackup(APP);
    expect(sameData(reexported, exported)).toBe(true);
    expect(target.store.getSnapshot().customCounts).toEqual({
      exercises: 1,
      instructions: 1,
      media: 1,
    });
    expect(target.store.getSnapshot().savedWorkouts[0]?.name).toBe('Push day');
    expect(target.store.getSnapshot().workoutCount).toBe(1);
    // The pre-import state was kept as a snapshot, so the import can be undone.
    const snapshots = await target.store.listSnapshots();
    expect(snapshots[0]?.reason).toBe('pre-import');
    expect(snapshots[0]?.summary.workoutCount).toBe(0);
    await target.store.restoreSnapshot(snapshots[0]!.id);
    expect(target.store.getSnapshot().workoutCount).toBe(0);
  });

  it('keeps an automatic snapshot after every finished workout and prunes to the newest few', async () => {
    const handle = await seeded();
    await finishOneWorkout(handle);
    let snapshots = await handle.store.listSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ reason: 'workout', seq: 1 });
    expect(snapshots[0]?.summary.workoutCount).toBe(1);

    for (let i = 0; i < SNAPSHOTS_KEPT + 1; i += 1) {
      await handle.store.snapshotBackup('manual');
    }
    snapshots = await handle.store.listSnapshots();
    expect(snapshots).toHaveLength(SNAPSHOTS_KEPT);
    expect(snapshots.map((snapshot) => snapshot.seq)).toEqual([5, 4, 3]);
    expect(snapshots.every((snapshot) => snapshot.reason === 'manual')).toBe(true);
    expect(await handle.store.getBackupSnapshot('missing')).toBeNull();
    await expect(handle.store.restoreSnapshot('missing')).rejects.toThrow(
      'no longer on this device',
    );
  });

  it('runs a save check that leaves nothing behind, and reports storage facts', async () => {
    const handle = await seeded();
    const check = await handle.store.runSaveCheck();
    expect(check.ok).toBe(true);
    const diagnostic = await handle.store.storageDiagnostic();
    expect(diagnostic.counts.meta).toBe(0);
    expect(diagnostic.counts.profile).toBe(1);
    expect(diagnostic.counts.locations).toBe(2);
    expect(diagnostic.localKeys.find((entry) => entry.key === 'wc.v1.settings')?.present).toBe(
      true,
    );
    expect(diagnostic.usageBytes).toBeNull();
    expect(await handle.store.requestPersistence()).toBeNull();
  });

  it('cleans up temporary data only and never touches protected data', async () => {
    const handle = await seeded();
    await finishOneWorkout(handle);
    const db = await handle.store.getDatabase();
    await db.put('meta', { id: DIAGNOSTIC_PROBE_ID, leftover: true });
    handle.storage.setItem('wc.v1.onboardingDraft', '{"step":2}');
    for (let i = 0; i < SNAPSHOTS_KEPT + 2; i += 1) {
      await db.put('backups', {
        id: `snapshot-${100 + i}-x`,
        createdAt: TEST_NOW,
        reason: 'manual',
        seq: 100 + i,
        backup: (await handle.store.createBackup(APP)) as unknown as Record<string, unknown>,
      });
    }
    const before = await handle.store.storageDiagnostic();

    const preview = await handle.store.cleanupTemporaryData({ dryRun: true });
    expect(preview.removed).toHaveLength(2 + 3);
    expect(await db.get('meta', DIAGNOSTIC_PROBE_ID)).toBeDefined();

    const result = await handle.store.cleanupTemporaryData();
    expect(result.removed).toEqual(preview.removed);
    expect(result.kept.some((line) => line.startsWith('Workout history (1)'))).toBe(true);
    expect(await db.get('meta', DIAGNOSTIC_PROBE_ID)).toBeUndefined();
    expect(handle.storage.getItem('wc.v1.onboardingDraft')).toBeNull();
    const after = await handle.store.storageDiagnostic();
    expect(after.counts.backups).toBe(SNAPSHOTS_KEPT);
    for (const store of [
      'workouts',
      'profile',
      'locations',
      'customInstructions',
      'savedWorkouts',
    ] as const) {
      expect(after.counts[store]).toBe(before.counts[store]);
    }
    expect(handle.storage.getItem('wc.v1.settings')).not.toBeNull();
  });
});
