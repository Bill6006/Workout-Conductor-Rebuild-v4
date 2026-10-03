import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { STRENGTH_MAXES_ID } from '../../engine/progression/maxes';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
// The screens' clock reads the store's day (TEST_NOW), a minute in: a workout started then is
// not days old.
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  // A rest started at the store's time has not ended by the screens' clock.
  useMomentReached: () => false,
}));

/**
 * Maintenance 25 on the screens: Equipment busy is off, and says why, once the lift is the last
 * one left (item 37), on Today and on the Workout tab; and the coach's longer rest, tapped, adds
 * its 30 s once and goes (item 38).
 */

const BENCH = 'barbell-bench-press';

async function onboarded(): Promise<AppStore> {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle.store;
}

const benchOf = (store: AppStore): WorkoutEntry =>
  allEntries(store.getSnapshot().session!.workout.blocks).find(
    (entry) => entry.exerciseId === BENCH,
  )!;

/** Equipment busy until the bench press is the last row: nothing done, each tap passes one row. */
async function benchLast(store: AppStore): Promise<void> {
  for (let guard = 0; guard < 10; guard += 1) {
    const blocks = store.getSnapshot().session!.workout.blocks;
    if (blocks.at(-1)?.entries.some((entry) => entry.exerciseId === BENCH)) return;
    const result = await store.recalibrate({ type: 'equipment-busy', entryId: benchOf(store).id });
    if (!result?.ok) throw new Error('busy failed');
  }
  throw new Error('the bench never reached the end');
}

async function renderAt(store: AppStore, hash: string): Promise<void> {
  act(() => {
    window.location.hash = hash;
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
}

describe('Equipment busy on the screens', () => {
  it('on Today, is off with nothing left after it and says why; Skip today stays', async () => {
    const store = await onboarded();
    await benchLast(store);
    await renderAt(store, '#/today');
    const user = userEvent.setup();
    await screen.findAllByTestId('workout-entry', {}, { timeout: 4_000 });
    const row = document.querySelector<HTMLElement>(
      `[data-testid="workout-entry"][data-exercise-id="${BENCH}"]`,
    );
    if (!row) throw new Error('no bench row');
    await user.click(row);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByTestId('equipment-busy')).toBeDisabled();
    expect(within(sheet).getByTestId('busy-reason')).toHaveTextContent(
      'Nothing after it is left to do, so there is nothing to move it behind: do it when it comes up, or skip it today.',
    );
    expect(within(sheet).getByTestId('skip-today')).toBeEnabled();
  });

  it('on the Workout tab, is off with nothing left after it, and names finishing', async () => {
    const store = await onboarded();
    await benchLast(store);
    store.startWorkout();
    await renderAt(store, '#/workout');
    const user = userEvent.setup();
    const list = await screen.findByRole('list', { name: 'Active workout list', hidden: true });
    const rows = within(list).getAllByRole('button', { hidden: true });
    await user.click(rows.at(-1)!);
    const card = await waitFor(() => {
      const found = [
        ...document.querySelectorAll<HTMLElement>('[data-testid="exercise-card"]'),
      ].find((candidate) => candidate.getAttribute('data-entry-id') === benchOf(store).id);
      if (!found) throw new Error('bench card not shown');
      return found;
    });
    await user.click(within(card).getByTestId('options-tab'));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByTestId('equipment-busy')).toBeDisabled();
    expect(within(sheet).getByTestId('busy-reason')).toHaveTextContent(
      'Nothing after it is left to do, so there is nothing to move it behind: do it now, skip it today, or finish the workout.',
    );
  });

  it('on Today, is off for the lift a busy lift waits on when only that lift is left after it (the third review)', async () => {
    const store = await onboarded();
    await benchLast(store);
    const blocks = store.getSnapshot().session!.workout.blocks;
    const before = blocks.at(-2)!.entries[0]!;
    await renderAt(store, '#/today');
    const user = userEvent.setup();
    await screen.findAllByTestId('workout-entry', {}, { timeout: 4_000 });
    const row = document.querySelector<HTMLElement>(
      `[data-testid="workout-entry"][data-exercise-id="${before.exerciseId}"]`,
    );
    if (!row) throw new Error('no row before the bench');
    await user.click(row);
    const sheet = await screen.findByRole('dialog');
    // The bench waits on it, its equipment still taken: there is nothing to move it behind.
    expect(within(sheet).getByTestId('equipment-busy')).toBeDisabled();
    expect(within(sheet).getByTestId('busy-reason')).toHaveTextContent(
      'The exercises left after it are waiting for it, moved there for busy equipment, so there is nothing to move it behind: do it when it comes up, or skip it today.',
    );
  });

  it('on the Workout tab, is off for the lift a busy lift waits on when only that lift is left after it (the third review)', async () => {
    const store = await onboarded();
    await benchLast(store);
    store.startWorkout();
    const before = store.getSnapshot().session!.workout.blocks.at(-2)!.entries[0]!;
    await renderAt(store, '#/workout');
    const user = userEvent.setup();
    const list = await screen.findByRole('list', { name: 'Active workout list', hidden: true });
    const rows = within(list).getAllByRole('button', { hidden: true });
    await user.click(rows.at(-2)!);
    const card = await waitFor(() => {
      const found = [
        ...document.querySelectorAll<HTMLElement>('[data-testid="exercise-card"]'),
      ].find((candidate) => candidate.getAttribute('data-entry-id') === before.id);
      if (!found) throw new Error('card before the bench not shown');
      return found;
    });
    await user.click(within(card).getByTestId('options-tab'));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByTestId('equipment-busy')).toBeDisabled();
    expect(within(sheet).getByTestId('busy-reason')).toHaveTextContent(
      'The exercises left after it are waiting for it, moved there for busy equipment, so there is nothing to move it behind: do it now, skip it today, or finish the workout.',
    );
  });

  it('on the Workout tab, is off for a lift with every set done, as the engine refuses it', async () => {
    const store = await onboarded();
    store.startWorkout();
    const bench = benchOf(store);
    for (const set of bench.sets) {
      await store.logSet(bench.id, set.index, { weight: set.targetWeight, reps: 6, rir: 2 });
    }
    await renderAt(store, '#/workout');
    const user = userEvent.setup();
    const list = await screen.findByRole('list', { name: 'Active workout list', hidden: true });
    await user.click(within(list).getAllByRole('button', { hidden: true })[0]!);
    const card = await waitFor(() => {
      const found = [
        ...document.querySelectorAll<HTMLElement>('[data-testid="exercise-card"]'),
      ].find((candidate) => candidate.getAttribute('data-entry-id') === bench.id);
      if (!found) throw new Error('bench card not shown');
      return found;
    });
    await user.click(within(card).getByTestId('options-tab'));
    const sheet = await screen.findByRole('dialog');
    // Both buttons are off, and the one line under them says why.
    expect(within(sheet).getByTestId('equipment-busy')).toBeDisabled();
    expect(within(sheet).getByTestId('skip-today')).toBeDisabled();
    expect(within(sheet).getByTestId('skip-reason')).toHaveTextContent(
      'Every set is logged. Edit a set from its row instead.',
    );
  });

  it('on the Workout tab, moves the lift in front behind the next one', async () => {
    const store = await onboarded();
    store.startWorkout();
    await renderAt(store, '#/workout');
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: 'Options' }))[0]!);
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByTestId('equipment-busy'));
    await waitFor(() => {
      const blocks = store.getSnapshot().session!.workout.blocks;
      expect(blocks[1]?.entries.some((entry) => entry.exerciseId === BENCH)).toBe(true);
    });
  });
});

describe('Options on the Workout tab (item 36)', () => {
  it('says a max saved before Maintenance 25 as the max sheet and the engine read it', async () => {
    const store = await onboarded();
    const db = await store.getDatabase();
    // 100 lb for 20 reps, saved with the old cap as 140; read today it is 167.
    await db.put('meta', {
      id: STRENGTH_MAXES_ID,
      maxes: {
        [BENCH]: { e1rm: 140, units: 'lb', enteredAt: TEST_NOW, from: { weight: 100, reps: 20 } },
      },
      prompts: {},
    });
    await store.hydrate();
    store.startWorkout();
    await renderAt(store, '#/workout');
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: 'Options' }))[0]!);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByTestId('max-line')).toHaveTextContent(/^167 lb, entered /);
  });
});

describe('the coach’s longer rest on the Workout tab', () => {
  it('adds its 30 s once, and the card goes', async () => {
    const store = await onboarded();
    store.startWorkout();
    const bench = benchOf(store);
    store.skipWarmup(bench.id);
    const working = bench.sets.filter((set) => set.kind === 'working');
    await store.logSet(bench.id, working[0]!.index, {
      weight: working[0]!.targetWeight,
      reps: 8,
      rir: 1,
    });
    await store.logSet(bench.id, working[1]!.index, {
      weight: working[1]!.targetWeight,
      reps: 5,
      rir: 0,
    });
    const seconds = store.getSnapshot().session!.rest!.seconds;
    await renderAt(store, '#/workout');
    const user = userEvent.setup();
    const headline = await screen.findByTestId('coach-headline');
    expect(headline).toHaveTextContent('Rest 30 s longer before the next Barbell Bench Press set');
    await user.click(screen.getByRole('button', { name: 'Add 30 s to this rest' }));
    expect(store.getSnapshot().session!.rest!.seconds).toBe(seconds + 30);
    // The tap says what it did.
    expect(await screen.findByText('Added 30 s to this rest.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add 30 s to this rest' })).toBeNull(),
    );
    expect(store.getSnapshot().session!.rest!.seconds).toBe(seconds + 30);
  });

  it('adds its 30 s once from Today too, and the card goes', async () => {
    const store = await onboarded();
    store.startWorkout();
    const bench = benchOf(store);
    store.skipWarmup(bench.id);
    const working = bench.sets.filter((set) => set.kind === 'working');
    await store.logSet(bench.id, working[0]!.index, {
      weight: working[0]!.targetWeight,
      reps: 8,
      rir: 1,
    });
    await store.logSet(bench.id, working[1]!.index, {
      weight: working[1]!.targetWeight,
      reps: 5,
      rir: 0,
    });
    const seconds = store.getSnapshot().session!.rest!.seconds;
    await renderAt(store, '#/today');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add 30 s to this rest' }));
    expect(store.getSnapshot().session!.rest!.seconds).toBe(seconds + 30);
    expect(await screen.findByText('Added 30 s to this rest.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add 30 s to this rest' })).toBeNull(),
    );
  });
});
