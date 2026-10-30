import { act, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { record } from '../../test/records';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 32, the owner's item 11, on the Workout tab: the main lift's card names its top set
 * and what it asks, and once the top set is logged the logger offers the first back-off at its own
 * load and reserve, never the top set's. TEST_NOW is a Wednesday, here a day the schedule ticks.
 * Synthetic data only.
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
        ...record(
          0,
          exerciseId,
          [
            [5, 135, 2],
            [5, 135, 2],
            [5, 135, 2],
          ],
          [4, 6],
          2,
        ),
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

describe('the main lift’s top set and back-offs on the Workout tab', () => {
  it('names the top set, then offers the first back-off at its own load and reserve', async () => {
    const store = await mainLiftFirst();
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    const [top, backOff] = first.sets.filter((set) => set.kind === 'working');
    const card = await renderWorkout(store);
    const logger = () => within(card).getByTestId('set-logger');
    expect(within(logger()).getByTestId('target-line')).toHaveTextContent('Top set');
    expect(within(logger()).getByTestId('logger-weight')).toHaveTextContent(
      String(top!.targetWeight),
    );
    expect(card).toHaveTextContent('4 more sets · 4-6 reps @ RIR 1, back-offs @ RIR 2');
    const user = userEvent.setup();
    await user.click(within(card).getByTestId('tempo-toggle'));
    expect(within(card).getByTestId('effort-line')).toHaveTextContent(
      'top set: stop 1 clean rep short of failure; the back-offs follow it',
    );
    await user.click(within(logger()).getByTestId('logger-reps'));
    const reps = within(logger()).getByRole('spinbutton', { name: 'Reps' });
    await user.clear(reps);
    await user.type(reps, '5');
    await user.click(within(logger()).getByTestId('log-set'));
    await waitFor(() =>
      expect(within(logger()).getByTestId('target-line')).toHaveTextContent('Back-off 1 of 3'),
    );
    // Before: the dial took the top set just logged.
    expect(within(logger()).getByTestId('logger-weight')).toHaveTextContent(
      String(backOff!.targetWeight),
    );
    // "Why this target" says what the back-offs are, and why.
    await user.click(within(card).getByTestId('options-tab'));
    const sheet = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!found) throw new Error('no detail sheet');
      return found;
    });
    await waitFor(() =>
      expect(sheet).toHaveTextContent(
        `Top set, then 3 back-offs at ${backOff!.targetWeight} lb, 5% lighter at 2 in reserve`,
      ),
    );
    expect(sheet).toHaveTextContent('A top set, then lighter sets at the same reps');
  });
});
