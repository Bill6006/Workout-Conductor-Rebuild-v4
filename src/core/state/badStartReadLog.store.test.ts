import { describe, expect, it, vi } from 'vitest';
import { readStart } from '../../engine/recalibration/badStart';
import { allEntries } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

vi.mock('../../engine/recalibration/badStart', async (original) => {
  const actual = await original<typeof import('../../engine/recalibration/badStart')>();
  return { ...actual, readStart: vi.fn(actual.readStart) };
});

/**
 * The first and second reviews of Maintenance 33: the hard start reads the log as the rules read it
 * (`readHistory`, a logged reserve the lifter's checked error covers read through it), as the coach
 * and the Plan screen do, never the log as logged. Synthetic data only.
 */

const DAY = 86_400_000;

describe('the log the hard start reads', () => {
  it('is the log as the rules read it', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185, reserveCheck: true },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    // Four checks: each check set reads the reserve it measured, so the read log is its own.
    const db = await store.getDatabase();
    for (const daysAgo of [5, 12, 19, 26]) {
      const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
      const done = record(0, 'cable-curl', [
        [12, 40, 1],
        [12, 40, 1],
      ]);
      await db.put('workouts', {
        ...done,
        id: `curl-check-${daysAgo}`,
        startedAt: when,
        completedAt: when,
        entries: done.entries.map((entry) => ({
          ...entry,
          sets: entry.sets.map((set, index) =>
            index === 1 ? { ...set, reserveCheck: { total: 15 } } : set,
          ),
        })),
      });
    }
    await store.hydrate();
    const { history, readHistory } = store.getSnapshot();
    expect(readHistory).not.toBe(history);
    store.startWorkout();
    const entry = allEntries(store.getSnapshot().session!.workout.blocks).find((candidate) =>
      candidate.sets.some((set) => set.kind === 'working'),
    )!;
    const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
    vi.mocked(readStart).mockClear();
    await store.logSet(entry.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[0],
      rir: set.targetRir,
    });
    const calls = vi.mocked(readStart).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)![2].history).toBe(store.getSnapshot().readHistory);
  });
});
