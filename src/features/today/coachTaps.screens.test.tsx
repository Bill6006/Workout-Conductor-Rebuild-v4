import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 27, the review of items 45 and 49, on screen: a coach card's four-week swap that
 * could not be kept says so, on Today and on the workout screen, and records nothing taken.
 */

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();

/** A synthetic session of one exercise, with shoulder pain reported on it when `hurt`. */
function day(days: number, exerciseId: string, hurt = false): WorkoutRecord {
  return {
    id: `w-${days}`,
    startedAt: at(days),
    completedAt: at(days),
    locationId: 'gym',
    templateId: 'full-body',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: hurt ? ['shoulder'] : [],
    ...(hurt ? { painReports: [{ exerciseId, joint: 'shoulder' as const }] } : {}),
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId,
        sets: [{ kind: 'working' as const, reps: 8, weight: 95, rir: 2, completed: true }],
      },
    ],
  };
}

/** Two sessions a week (every one full body, with the bench press) and a shoulder pattern on it. */
async function painful(): Promise<AppStore> {
  const { store } = createTestStore();
  await store.hydrate();
  const profile = createDefaultProfile(TEST_NOW);
  await store.completeOnboarding(
    {
      ...profile,
      schedule: { ...profile.schedule, weeklyFrequency: 2, availableDays: ['mon', 'thu'] },
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  for (const record of [
    day(21, 'barbell-bench-press', true),
    day(17, 'dumbbell-bench-press'),
    day(14, 'barbell-bench-press', true),
    day(10, 'dumbbell-bench-press'),
    day(7, 'barbell-bench-press', true),
  ]) {
    await db.put('workouts', record);
  }
  await store.hydrate();
  return store;
}

describe("a coach card's four-week swap", () => {
  it('says when it could not be kept, and records nothing taken', async () => {
    const store = await painful();
    await takeFailingSwap(store, '#/today');
  });

  it('says so on the workout screen too', async () => {
    const store = await painful();
    store.startWorkout();
    await takeFailingSwap(store, '#/workout');
  });
});

/** The pattern's card shown at `hash`, its four-week swap taken, and the swap failing. */
async function takeFailingSwap(store: AppStore, hash: string): Promise<void> {
  act(() => {
    window.location.hash = hash;
  });
  render(
    <Providers store={store}>
      <App />
    </Providers>,
  );
  const user = userEvent.setup();
  const headline = () => screen.getByTestId('coach-headline').textContent ?? '';
  await waitFor(() => expect(screen.getByTestId('coach-headline')).toBeInTheDocument());
  // Cards that outrank it are put away until the pattern's shows.
  for (let tries = 0; tries < 6 && !headline().startsWith('Shoulder pain with'); tries += 1) {
    const before = headline();
    await user.click(screen.getByTestId('coach-dismiss'));
    await waitFor(() => expect(headline()).not.toBe(before));
  }
  expect(headline()).toBe('Shoulder pain with Barbell Bench Press, not with Dumbbell Bench Press');
  const swap = vi
    .spyOn(store, 'swapExercise')
    .mockRejectedValue(new Error('Swapped for today, but its four weeks could not be kept.'));
  const note = vi.spyOn(store, 'noteCoachAction');
  await user.click(screen.getByTestId('coach-action'));
  expect(
    await screen.findByText('Swapped for today, but its four weeks could not be kept.'),
  ).toBeInTheDocument();
  expect(swap).toHaveBeenCalledTimes(1);
  expect(note).not.toHaveBeenCalled();
}
