import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { record } from '../../test/records';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 31, item 12, on Today: a day not ticked says so in one line and offers the catch-up,
 * the full session one tap away, and the catch-up one tap back. TEST_NOW is a Wednesday, which the
 * default schedule does not tick.
 */

/** A lifter in training: Monday's bench press. */
async function inTraining(): Promise<AppStore> {
  const { store } = createTestStore();
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  const monday = new Date(Date.parse(TEST_NOW) - 2 * 86_400_000).toISOString();
  await db.put('workouts', {
    ...record(
      0,
      'barbell-bench-press',
      [
        [8, 135, 2],
        [8, 135, 2],
        [8, 135, 2],
      ],
      [6, 10],
      2,
    ),
    id: 'w-monday',
    startedAt: monday,
    completedAt: monday,
  });
  await store.hydrate();
  return store;
}

describe('a day not ticked, on Today', () => {
  it('shows the one workout the app chose: the catch-up first, and no choice of its kind', async () => {
    // The owner, 2026-10-31: "the user does NOT choose between 'Catch-up' and 'Full session'".
    const store = await inTraining();
    act(() => {
      window.location.hash = '#/today';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    const note = await screen.findByTestId('day-note-text');
    expect(note).toHaveTextContent(
      /^Not one of your training days: a \d+-minute catch-up for what is behind this week\.$/,
    );
    expect(screen.getByRole('heading', { name: 'Catch-up' })).toBeInTheDocument();
    expect(screen.queryByTestId('day-note-action')).not.toBeInTheDocument();
    for (const name of ['Full session', 'Catch-up instead', 'Go easy instead']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('start-workout')).toBeInTheDocument();
  });
});

describe('a day not ticked with no catch-up to offer, on Today', () => {
  it('says so to a new lifter too, with nothing to take', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    act(() => {
      window.location.hash = '#/today';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    expect(await screen.findByTestId('day-note-text')).toHaveTextContent(
      /^Not one of your training days\.$/,
    );
    expect(screen.queryByRole('button', { name: 'Full session' })).not.toBeInTheDocument();
    expect(screen.getByTestId('start-workout')).toBeInTheDocument();
  });

  it('says nothing on a day ticked', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    const schedule = createDefaultProfile(TEST_NOW).schedule;
    await store.completeOnboarding(
      {
        ...createDefaultProfile(TEST_NOW),
        bodyweight: 185,
        schedule: { ...schedule, availableDays: [...schedule.availableDays, 'wed'] },
      },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    act(() => {
      window.location.hash = '#/today';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    expect(await screen.findByTestId('start-workout')).toBeInTheDocument();
    expect(screen.queryByTestId('day-note-text')).not.toBeInTheDocument();
  });
});
