import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { SESSION_KEY } from '../../core/state/session';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * The owner, 2026-11-02, on Today: the bench press swapped for the dumbbells, and the day's session
 * as the build before saved it, its line still on the lift swapped out. Opened again, Why this
 * workout names the lift on the screen. Synthetic data only.
 */

const leads = (name: string) =>
  `${name} leads as the primary strength lift with full rests and warm-up ramp sets.`;

describe('Why this workout, a session saved before', () => {
  it('names the lift swapped in, never the lift swapped out', async () => {
    const handle = createTestStore();
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await handle.store.setCurrentLocation('gym');
    const bench = allEntries(handle.store.getSnapshot().session!.workout.blocks)[0]!;
    await handle.store.swapExercise(bench.id, 'dumbbell-bench-press');
    // The session as the build before saved it: the line still on the lift swapped out.
    const saved = handle.storage.getItem(SESSION_KEY)!;
    expect(saved).toContain(leads('Dumbbell Bench Press'));
    handle.storage.setItem(
      SESSION_KEY,
      saved.replace(leads('Dumbbell Bench Press'), leads('Barbell Bench Press')),
    );

    const again = createTestStore({ factory: handle.factory, storage: handle.storage });
    await again.store.hydrate();
    expect(again.store.getSnapshot().session!.workout.explanation.reasons).toContain(
      leads('Barbell Bench Press'),
    );
    act(() => {
      window.location.hash = '#/today';
    });
    render(
      <Providers store={again.store}>
        <App />
      </Providers>,
    );
    expect(await screen.findByText(leads('Dumbbell Bench Press'))).toBeInTheDocument();
    expect(screen.queryByText(leads('Barbell Bench Press'))).not.toBeInTheDocument();
  });

  it('names no lift to push to lead once it is swapped out after a set (the review)', async () => {
    const handle = createTestStore();
    const { store } = handle;
    await store.hydrate();
    await store.completeOnboarding(
      {
        ...createDefaultProfile(TEST_NOW),
        bodyweight: 185,
        pushLift: {
          exerciseId: 'barbell-bench-press',
          target: 225,
          units: 'lb',
          since: '2026-08-01T12:00:00.000Z',
        },
      },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await store.setCurrentLocation('gym');
    const bench = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    expect(bench.exerciseId).toBe('barbell-bench-press');
    store.startWorkout();
    const set = bench.sets.find((one) => one.kind === 'working')!;
    await store.logSet(bench.id, set.index, { weight: 185, reps: 5, rir: 2 });
    expect((await store.swapExercise(bench.id, 'dumbbell-bench-press'))?.ok).toBe(true);
    act(() => {
      window.location.hash = '#/today';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    expect(await screen.findByText(leads('Dumbbell Bench Press'))).toBeInTheDocument();
    expect(screen.queryByText(/^Barbell Bench Press leads/)).not.toBeInTheDocument();
  });
});
