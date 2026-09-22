import { describe, expect, it } from 'vitest';
import { workoutSequence } from '../../engine/workout/sequence';
import { allEntries } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { SESSION_KEY, readKeptSessions } from './session';

const DAY = 86_400_000;

function daysAgo(days: number, item: WorkoutRecord, id: string): WorkoutRecord {
  const when = new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();
  return { ...item, id, startedAt: when, completedAt: when };
}

/** Onboarded, with the given history saved, and the app opened again so it reads it. */
async function opened(history: WorkoutRecord[]) {
  const first = createTestStore();
  await first.store.hydrate();
  await first.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await first.store.getDatabase();
  for (const item of history) await db.put('workouts', item);
  const again = createTestStore({ factory: first.factory, storage: first.storage });
  await again.store.hydrate();
  return {
    ...again,
    reopen: () => createTestStore({ factory: first.factory, storage: first.storage }),
  };
}

describe('reopening the app mid-workout', () => {
  it('brings back a workout whose first lift is back after a month off, logged sets and all', async () => {
    const bench = record(0, 'barbell-bench-press', [
      [10, 135, 2],
      [10, 135, 2],
    ]);
    const handle = await opened([daysAgo(30, bench, 'w-month-ago')]);
    const preview = handle.store.getSnapshot().session!;
    // The case that was lost on the owner's phone: a target worked out as a return.
    expect(allEntries(preview.workout.blocks).map((entry) => entry.progression?.mode)).toContain(
      'return',
    );
    handle.store.startWorkout();
    const first = workoutSequence(handle.store.getSnapshot().session!.workout)[0]!;
    await handle.store.logSet(first.entryId, first.setIndex, {
      weight: first.set.targetWeight,
      reps: first.set.targetReps[0],
      rir: first.set.targetRir,
    });
    const before = handle.store.getSnapshot().session!;

    const reopened = handle.reopen();
    await reopened.store.hydrate();
    const after = reopened.store.getSnapshot();
    expect(after.session?.id).toBe(before.id);
    expect(after.session?.status).toBe('active');
    expect(after.session?.completed.sets).toEqual(before.completed.sets);
    expect(after.sessionRecovery).toBeNull();
    expect(readKeptSessions(reopened.storage)).toEqual([]);
  });

  it('keeps a workout it cannot read back, says so once, and starts a fresh one beside it', async () => {
    const handle = await opened([]);
    handle.store.startWorkout();
    const stored = JSON.parse(handle.storage.getItem(SESSION_KEY)!) as Record<string, unknown>;
    const logged = Array.from({ length: 4 }, (_, index) => ({
      entryId: 'e1',
      exerciseId: 'barbell-bench-press',
      setIndex: index,
      kind: 'working',
      reps: 5,
      weight: 185,
      rir: 2,
      skipped: false,
      completedAt: TEST_NOW,
    }));
    const damaged = {
      ...stored,
      status: 'active',
      completed: { ...(stored.completed as object), sets: logged },
      workout: { ...(stored.workout as object), blocks: 'not a list' },
    };
    handle.storage.setItem(SESSION_KEY, JSON.stringify(damaged));

    const reopened = handle.reopen();
    await reopened.store.hydrate();
    const state = reopened.store.getSnapshot();
    expect(state.sessionRecovery).toEqual({
      keptAt: TEST_NOW,
      status: 'active',
      setsLogged: 4,
      saved: true,
    });
    expect(readKeptSessions(reopened.storage)[0]?.session).toEqual(damaged);
    // A fresh preview takes its place; the kept copy is untouched by it.
    expect(state.session?.status).toBe('preview');
    expect(JSON.parse(reopened.storage.getItem(SESSION_KEY)!).status).toBe('preview');

    reopened.store.dismissSessionRecovery();
    expect(reopened.store.getSnapshot().sessionRecovery).toBeNull();

    // Opened again: nothing new to say, and the kept copy is still there.
    const later = handle.reopen();
    await later.store.hydrate();
    expect(later.store.getSnapshot().sessionRecovery).toBeNull();
    expect(readKeptSessions(later.storage)).toHaveLength(1);
    const cleanup = await later.store.cleanupTemporaryData({ dryRun: true });
    expect(cleanup.kept).toContain('Workouts kept for recovery (1)');
  });
});
