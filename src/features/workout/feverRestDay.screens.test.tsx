import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { REST_TODAY } from '../../engine/readiness/checkIn';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 33, the illness gate (proposal part 2: "With fever or whole-body symptoms, no
 * session"): Today hides Start on a fever or aches all over, and so does the Workout tab, one of
 * the five bottom destinations; the store starts no workout that day from any screen (the fresh
 * review before shipping: the Workout tab's Start went round the one Today hides). Synthetic data
 * only.
 */
describe('a fever or aches all over, on the Workout tab', () => {
  async function feverDay() {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const done = await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 3,
        sleep: 3,
        soreness: 2,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
        illness: 'body',
      },
    });
    expect(done?.ok).toBe(true);
    return store;
  }

  it('Today hides Start on the rest day', async () => {
    const store = await feverDay();
    act(() => {
      window.location.hash = '#/today';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    expect(await screen.findByTestId('day-note-text')).toBeInTheDocument();
    expect(screen.queryByTestId('start-workout')).not.toBeInTheDocument();
  });

  it('the Workout tab says it is a rest day and offers no Start Workout', async () => {
    const store = await feverDay();
    expect(store.getSnapshot().session?.status).toBe('preview');
    act(() => {
      window.location.hash = '#/workout';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    expect(await screen.findByTestId('rest-today')).toHaveTextContent(REST_TODAY);
    expect(
      screen.queryByTestId('start-workout'),
      'a fever or aches all over: no session, yet the Workout tab shows Start Workout',
    ).not.toBeInTheDocument();
  });

  it('the store does not start a workout on the rest day', async () => {
    const store = await feverDay();
    store.startWorkout();
    expect(
      store.getSnapshot().session?.status,
      'startWorkout() on a fever rest day started the workout',
    ).toBe('preview');
  });

  it('the Workout tab offers Start again once the check-in is changed back', async () => {
    const store = await feverDay();
    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 3,
        sleep: 3,
        soreness: 2,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    act(() => {
      window.location.hash = '#/workout';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    expect(await screen.findByTestId('start-workout')).toBeInTheDocument();
    expect(screen.queryByTestId('rest-today')).not.toBeInTheDocument();
    store.startWorkout();
    expect(store.getSnapshot().session?.status).toBe('active');
  });
});
