import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { readSession, writeSession } from './session';

/**
 * Maintenance 21's review, from the owner's phone: a Smith Machine Squat started at the gym
 * with its warm-up, then the place changed to Home, and changed again. Home has no Smith
 * machine, so the squat stops at its warm-up and its sets go to a squat Home can equip, right
 * after it; every later change has to keep them there.
 */

interface Clock {
  now: () => string;
  advance: (minutes: number) => void;
}

/** The owner's shape of day: a 30-minute lower-body session at the gym, Smith squat first. */
async function legDayAtTheGym(): Promise<{ handle: TestStoreHandle; clock: Clock }> {
  let current = Date.parse(TEST_NOW);
  const clock: Clock = {
    now: () => new Date(current).toISOString(),
    advance: (minutes) => {
      current += minutes * 60_000;
    },
  };
  const handle = createTestStore({ now: clock.now });
  await handle.store.hydrate();
  const base = createDefaultProfile(TEST_NOW);
  await handle.store.completeOnboarding(
    {
      ...base,
      bodyweight: 185,
      schedule: { ...base.schedule, typicalDurationMinutes: 30 },
      exercisePreferences: { preferred: ['Smith Machine Squat'], disliked: [] },
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  // A push day and a pull day just done, so today is the lower-body day.
  const db = await handle.store.getDatabase();
  const days: [number, string][] = [
    [2, 'barbell-bench-press'],
    [1, 'barbell-row'],
  ];
  for (const [daysAgo, exerciseId] of days) {
    const when = new Date(Date.parse(TEST_NOW) - daysAgo * 86_400_000).toISOString();
    await db.put('workouts', {
      ...record(daysAgo, exerciseId, [
        [8, 135, 2],
        [8, 135, 2],
        [8, 135, 2],
      ]),
      id: `seed-${daysAgo}`,
      startedAt: when,
      completedAt: when,
    });
  }
  await handle.store.hydrate();
  await handle.store.setCurrentLocation('gym');
  return { handle, clock };
}

function entries(handle: TestStoreHandle): WorkoutEntry[] {
  return allEntries(handle.store.getSnapshot().session!.workout.blocks);
}

const working = (entry: WorkoutEntry | undefined) =>
  entry?.sets.filter((set) => set.kind === 'working').length ?? 0;
const isSquat = (entry: WorkoutEntry | undefined) =>
  entry !== undefined && requireExercise(entry.exerciseId).movementPattern === 'squat';

/** The Smith squat started, its warm-up logged or skipped, and the move Home. */
async function startedThenHome(how: 'logged' | 'skipped') {
  const { handle, clock } = await legDayAtTheGym();
  const { store } = handle;
  const smith = entries(handle)[0]!;
  expect(smith.exerciseId).toBe('smith-machine-squat');
  store.startWorkout();
  const warm = smith.sets.find((set) => set.kind === 'warmup')!;
  if (how === 'logged') await store.logSet(smith.id, warm.index, { weight: 95, reps: 5, rir: 5 });
  else store.skipWarmup(smith.id);
  await store.setCurrentLocation('home');
  return { handle, clock, smith };
}

/** The stopped Smith squat, and what comes right after it. */
function stoppedAndNext(handle: TestStoreHandle, smithId: string) {
  const list = entries(handle);
  const at = list.findIndex((entry) => entry.id === smithId);
  return { stopped: list[at], next: list[at + 1], list };
}

describe('a Smith machine squat started at the gym, then the place changed', () => {
  it.each(['logged', 'skipped'] as const)(
    'keeps a Home squat after it through Home, the gym and Home again (warm-up %s)',
    async (how) => {
      const { handle, smith } = await startedThenHome(how);
      const { store } = handle;
      const moves = [
        ['home', 'Rebuilt for Home'],
        ['gym', 'Rebuilt for Gym'],
        ['home', 'Rebuilt for Home'],
      ] as const;
      for (const [index, [place, headline]] of moves.entries()) {
        if (index > 0) await store.setCurrentLocation(place);
        expect(store.getSnapshot().session!.lastSummary?.headline).toMatch(
          new RegExp(`^${headline}`),
        );
        const { stopped, next, list } = stoppedAndNext(handle, smith.id);
        // The Smith squat stays as the warm-up it had, and says what it still owed.
        expect(stopped?.sets.map((set) => set.kind)).toEqual(['warmup']);
        expect(stopped?.stopped).toEqual({ owed: working(smith) });
        // The squat sets follow it, on a squat this place has, and nowhere else.
        expect(next?.exerciseId).toBe('goblet-squat');
        expect(working(next)).toBeGreaterThan(0);
        expect(list.filter(isSquat).map((entry) => entry.id)).toEqual([smith.id, next?.id]);
      }
    },
  );

  it('keeps it through a change of length, there and back', async () => {
    const { handle, smith } = await startedThenHome('logged');
    const first = stoppedAndNext(handle, smith.id).next;
    await handle.store.setDurationChoice(45);
    expect(stoppedAndNext(handle, smith.id).next?.exerciseId).toBe('goblet-squat');
    await handle.store.setDurationChoice('default');
    const { next } = stoppedAndNext(handle, smith.id);
    expect(next?.exerciseId).toBe('goblet-squat');
    expect(working(next)).toBe(working(first));
  });

  it('keeps it through a long pause, when coming back rebuilds the rest', async () => {
    const { handle, clock, smith } = await startedThenHome('logged');
    handle.store.pauseWorkout();
    clock.advance(25);
    await handle.store.resumeWorkout();
    expect(handle.store.getSnapshot().session!.lastSummary?.headline).toMatch(/^Back after 25 min/);
    expect(stoppedAndNext(handle, smith.id).next?.exerciseId).toBe('goblet-squat');
  });

  it('keeps what the stopped squat owed when the app reopens, and a damaged note costs nothing', async () => {
    const { handle, smith } = await startedThenHome('logged');
    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(stoppedAndNext(reopened, smith.id).stopped?.stopped).toEqual({ owed: working(smith) });
    expect(stoppedAndNext(reopened, smith.id).next?.exerciseId).toBe('goblet-squat');

    const stored = readSession(handle.storage)!;
    const damaged = {
      ...stored,
      workout: {
        ...stored.workout,
        blocks: stored.workout.blocks.map((block) => ({
          ...block,
          entries: block.entries.map((entry) =>
            entry.id === smith.id ? { ...entry, stopped: { owed: 'many' } } : entry,
          ),
        })),
      },
    };
    writeSession(damaged as unknown as typeof stored, handle.storage);
    const again = createTestStore({ factory: handle.factory, storage: handle.storage });
    await again.store.hydrate();
    // The workout is read back whole; only the note is dropped.
    expect(again.store.getSnapshot().session?.id).toBe(stored.id);
    expect(stoppedAndNext(again, smith.id).stopped?.stopped).toBeUndefined();
    await again.store.setDurationChoice(45);
    expect(stoppedAndNext(again, smith.id).next?.exerciseId).toBe('goblet-squat');
  });

  it('gives the squat sets back to a workout an older copy stopped, at the next change', async () => {
    const { handle, smith } = await startedThenHome('logged');
    // What the older copy left on the phone: the Smith squat at its warm-up with no count
    // written, and no Home squat after it.
    const stored = readSession(handle.storage)!;
    const lost = {
      ...stored,
      workout: {
        ...stored.workout,
        blocks: stored.workout.blocks
          .filter((block) => !block.entries.some((entry) => entry.exerciseId === 'goblet-squat'))
          .map((block) => ({
            ...block,
            entries: block.entries.map((entry) =>
              entry.id === smith.id ? { ...entry, stopped: undefined } : entry,
            ),
          })),
      },
    };
    writeSession(lost, handle.storage);
    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(entries(reopened).some((entry) => entry.exerciseId === 'goblet-squat')).toBe(false);
    await reopened.store.setDurationChoice(45);
    const { next } = stoppedAndNext(reopened, smith.id);
    expect(next?.exerciseId).toBe('goblet-squat');
    expect(working(next)).toBeGreaterThan(0);
  });
});
