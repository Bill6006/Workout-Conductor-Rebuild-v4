import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { doneKeys } from '../../core/state/session';
import { remainingMinutes } from '../../engine/duration/duration';
import { allEntries } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 28, the owner's item 4, on the Workout tab: Left is the time still to go at the
 * lifter's own pace, the one today's plan was fitted to.
 */

/** A finished workout `daysAgo` before TEST_NOW, an hour against the plan's fifty minutes. */
function paced(daysAgo: number): WorkoutRecord {
  const when = new Date(Date.parse(TEST_NOW) - daysAgo * 86_400_000).toISOString();
  return {
    id: `w-paced-${daysAgo}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'pull-arms',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    trainingSeconds: 60 * 60,
    estimatedSeconds: 50 * 60,
    entries: [
      {
        exerciseId: 'cable-curl',
        sets: [{ kind: 'working', reps: 12, weight: 40, rir: 2, completed: true }],
      },
    ],
  };
}

describe("the preview's time (Maintenance 28, the review of item 4)", () => {
  it("shows the plan's own parts, and the minutes the pace adds as a part of its own", async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await store.getDatabase();
    for (const days of [7, 5, 3]) await db.put('workouts', paced(days));
    await store.hydrate();
    const workout = store.getSnapshot().session!.workout;
    const time = workout.explanation.time;
    act(() => {
      window.location.hash = '#/';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    const line = await screen.findByTestId('time-breakdown');
    expect(line).toHaveTextContent(
      `Time: ${workout.warmup.generalMinutes} min warm-up, ${time.workMinutes} min work, ${time.restMinutes} min rest, ${time.transitionMinutes} min setup, ${time.paceMinutes} min more at your pace. Confidence`,
    );
  });
});

describe('Left on the Workout tab (Maintenance 28, item 4)', () => {
  it("is the time still to go at the lifter's own pace", async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await store.getDatabase();
    for (const days of [7, 5, 3]) await db.put('workouts', paced(days));
    await store.hydrate();
    expect(store.getSnapshot().session!.workout.duration.pace).toBe(1.2);
    store.startWorkout();
    const workout = store.getSnapshot().session!.workout;
    expect(workout.duration.pace).toBe(1.2);
    // The first set logged and its rest skipped: Left is the sets still to do, whatever the clock.
    const first = allEntries(workout.blocks)[0]!;
    const set = first.sets[0]!;
    await store.logSet(first.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[0],
      rir: set.targetRir,
    });
    store.skipRest();
    const keys = doneKeys(store.getSnapshot().session!.completed);
    act(() => {
      window.location.hash = '#/workout';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    const left = (pace: number) =>
      Math.round(
        remainingMinutes({
          blocks: store.getSnapshot().session!.workout.blocks,
          exerciseOf: requireExercise,
          isDone: (entryId, setIndex) => keys.has(`${entryId}:${setIndex}`),
          generalWarmupMinutes: workout.warmup.generalMinutes,
          anythingLogged: true,
          elapsedSeconds: 0,
          restSecondsLeft: 0,
          pace,
        }),
      );
    expect(left(1.2)).not.toBe(left(1));
    await waitFor(() =>
      expect(screen.getByTestId('time-left')).toHaveTextContent(`~${left(1.2)} min`),
    );
  });
});
