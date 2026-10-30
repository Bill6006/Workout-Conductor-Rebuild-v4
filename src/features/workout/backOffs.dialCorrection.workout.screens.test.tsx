import { act, render, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { record } from '../../test/records';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../../features/library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 32, the owner's item 11, on the Workout tab (the second review of round N): a
 * back-off's logger after a correction to the top set starts from its own target, which the
 * correction may move, never the corrected top set's load and reserve. TEST_NOW is a Wednesday, a
 * day the schedule ticks. Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;

/** The main lift first, with two clean straight sessions behind it: on top set plus back-offs. */
async function mainLiftFirst(): Promise<AppStore> {
  const { store } = createTestStore();
  await store.hydrate();
  await store.completeOnboarding(
    {
      ...createDefaultProfile(TEST_NOW),
      bodyweight: 185,
      programStyle: 'hybrid',
      schedule: {
        ...schedule,
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        weeklyFrequency: 5,
      },
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  for (const daysAgo of [7, 3]) {
    for (const exerciseId of ['barbell-bench-press', 'back-squat', 'barbell-row']) {
      const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
      await db.put('workouts', {
        ...record(0, exerciseId, [
          [5, 135, 2],
          [5, 135, 2],
          [5, 135, 2],
        ]),
        id: `w-${exerciseId}-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
  }
  await store.hydrate();
  await store.setCurrentLocation('gym');
  store.startWorkout();
  const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
  if (first.backOffDrop === undefined) throw new Error('the main lift is not first');
  await store.skipWarmup(first.id);
  return store;
}

async function renderWorkout(store: AppStore): Promise<HTMLElement> {
  act(() => {
    window.location.hash = '#/workout';
  });
  const hydrate = vi.spyOn(store, 'hydrate');
  render(
    <Providers store={store}>
      <App />
    </Providers>,
  );
  await act(async () => {
    await hydrate.mock.results[0]?.value;
  });
  const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
  return waitFor(() => {
    const card = document.querySelector<HTMLElement>(
      `[data-testid="exercise-card"][data-entry-id="${first.id}"]`,
    );
    if (!card) throw new Error('no main lift card');
    return card;
  });
}

describe('a back-off’s logger after a correction to the top set, the second review of round N', () => {
  it('starts from the back-off’s own load and reserve, never the corrected top set’s', async () => {
    const store = await mainLiftFirst();
    const entry = () => allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    const [top, firstBackOff] = entry().sets.filter((set) => set.kind === 'working');
    await store.logSet(entry().id, top!.index, { weight: top!.targetWeight, reps: 5, rir: 1 });
    await store.logSet(entry().id, firstBackOff!.index, {
      weight: firstBackOff!.targetWeight,
      reps: 5,
      rir: 2,
    });
    // The top set was really lifted ten heavier: corrected, the back-offs still to come follow it.
    const lifted = top!.targetWeight! + 10;
    await store.logSet(entry().id, top!.index, { weight: lifted, reps: 5, rir: 1 });
    const next = entry().sets.filter((set) => set.tier === 'back-off')[1]!;
    expect(next.targetWeight).toBeLessThan(lifted);
    const card = await renderWorkout(store);
    const logger = () => within(card).getByTestId('set-logger');
    expect(within(logger()).getByTestId('target-line')).toHaveTextContent('Back-off 2 of 3');
    // The back-off's own load, not the top set's.
    expect(within(logger()).getByTestId('logger-weight')).toHaveTextContent(
      String(next.targetWeight),
    );
  });
});
