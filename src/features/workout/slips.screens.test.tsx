import { act, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { maxFromSet } from '../../engine/progression/maxes';
import { SLIP_OVER_BODY } from '../../engine/progression/slips';
import { estimateStartingMax } from '../../engine/progression/startingLoad';
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
 * Maintenance 26, the review of item 40, on the Workout tab: the slip check reads today's sets and
 * the max saved for the lift with its history, so a heavier set kept once is not asked about on
 * every later set, and a max the lifter saved counts as their own word.
 */

const bench = requireExercise('barbell-bench-press');
/** A light profile: the body's estimate for the bench is low, so a modest set is far above it. */
const profile = {
  ...createDefaultProfile(TEST_NOW),
  bodyweight: 120,
  experience: 'beginner' as const,
  sex: 'female' as const,
};
const body = estimateStartingMax(bench, profile)!.e1rm;
/**
 * The lightest 5 lb step whose five reps read past what the body suggests, and past the set's own
 * first target, the empty bar, which no estimate questions (the fifth pass of item 40).
 */
const firstWeight =
  Math.ceil((Math.max(body, maxFromSet(45, 5)) * SLIP_OVER_BODY) / (1 + 5 / 30) / 5) * 5 + 5;

/** The bench first at the gym, with nothing logged before, its ramps skipped unless kept. */
async function benchFirst(saved: number | null = null, ramps = false): Promise<AppStore> {
  const handle = createTestStore();
  const { store } = handle;
  await store.hydrate();
  await store.completeOnboarding(profile, createDefaultLocations({ gymAccess: true }, TEST_NOW));
  await store.setCurrentLocation('gym');
  store.startWorkout();
  const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
  if (first.exerciseId !== bench.id) throw new Error('no bench first');
  if (saved !== null) await store.recordStrengthMax(bench.id, { kind: 'max', e1rm: saved });
  if (!ramps) await store.skipWarmup(first.id);
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
    if (!card) throw new Error('no bench card');
    return card;
  });
}

/** The sets logged so far, skipped ramps aside. */
const logged = (store: AppStore) =>
  store.getSnapshot().session!.completed.sets.filter((set) => !set.skipped);

/** Types a weight on the set in front (or leaves it) and logs it for `count` reps. */
async function logAt(
  card: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
  weight: number | null,
  count = 5,
) {
  const logger = () => within(card).getByTestId('set-logger');
  if (weight !== null) {
    await user.click(within(logger()).getByTestId('logger-weight'));
    const field = within(logger()).getByRole('spinbutton', { name: 'Weight' });
    await user.clear(field);
    await user.type(field, String(weight));
  }
  await user.click(within(logger()).getByTestId('logger-reps'));
  const reps = within(logger()).getByRole('spinbutton', { name: 'Reps' });
  await user.clear(reps);
  await user.type(reps, String(count));
  await user.click(within(logger()).getByTestId('log-set'));
}

describe('the slip check on the Workout tab (Maintenance 26, the review of item 40)', () => {
  it('reads a heavier set kept today with the history: the next set is not asked about again', async () => {
    expect(maxFromSet(firstWeight, 5)).toBeGreaterThan(body * SLIP_OVER_BODY);
    const store = await benchFirst();
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await logAt(card, user, firstWeight);
    expect(within(card).getByTestId('slip-question')).toHaveTextContent(
      'far above what your bodyweight and experience suggest',
    );
    // Keep waits a moment before a tap can reach it (the re-check of item 40).
    await waitFor(() => expect(within(card).getByTestId('slip-keep')).toBeEnabled());
    await user.click(within(card).getByTestId('slip-keep'));
    await waitFor(() => expect(logged(store)).toHaveLength(1));
    await logAt(card, user, firstWeight + 10);
    expect(within(card).queryByTestId('slip-question')).toBeNull();
    await waitFor(() => expect(logged(store)).toHaveLength(2));
  });

  it('asks about reps far past the range on a working set only, never on a ramp', async () => {
    const store = await benchFirst(Math.ceil(maxFromSet(firstWeight, 5)), true);
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    expect(first.sets[0]?.kind).toBe('warmup');
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await logAt(card, user, null, 60);
    expect(within(card).queryByTestId('slip-question')).toBeNull();
    await waitFor(() => expect(logged(store)).toHaveLength(1));
  });

  it('takes the max saved for the lift as the lifter’s own word', async () => {
    const store = await benchFirst(Math.ceil(maxFromSet(firstWeight, 5)));
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await logAt(card, user, firstWeight);
    expect(within(card).queryByTestId('slip-question')).toBeNull();
    await waitFor(() => expect(logged(store)).toHaveLength(1));
  });
});

describe('the slip check on the Workout tab after the re-check of item 40', () => {
  it('asks about reps once: reps kept on the lift are not asked about again', async () => {
    const store = await benchFirst(Math.ceil(maxFromSet(firstWeight, 5)));
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await logAt(card, user, null, 60);
    expect(within(card).getByTestId('slip-question')).toHaveTextContent('60 reps is far past');
    await waitFor(() => expect(within(card).getByTestId('slip-keep')).toBeEnabled());
    await user.click(within(card).getByTestId('slip-keep'));
    await waitFor(() => expect(logged(store)).toHaveLength(1));
    await logAt(card, user, null, 60);
    expect(within(card).queryByTestId('slip-question')).toBeNull();
    await waitFor(() => expect(logged(store)).toHaveLength(2));
  });

  it('leaves a set corrected with its weight and reps as logged: only its reserve moved', async () => {
    const store = await benchFirst();
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await logAt(card, user, firstWeight);
    await waitFor(() => expect(within(card).getByTestId('slip-keep')).toBeEnabled());
    await user.click(within(card).getByTestId('slip-keep'));
    await waitFor(() => expect(logged(store)).toHaveLength(1));
    // Open the logged set and change its reserve alone.
    const done = card.querySelector<HTMLElement>(
      '[data-testid="set-row"][data-state="done"] [data-testid="logged-value"]',
    );
    if (!done) throw new Error('no logged set');
    await user.click(done);
    const editor = await waitFor(() => {
      const found = card.querySelector<HTMLElement>('[data-testid="set-logger"][data-mode="edit"]');
      if (!found) throw new Error('no editor');
      return found;
    });
    await user.click(within(editor).getByRole('button', { name: 'Increase RIR' }));
    await user.click(within(editor).getByTestId('log-set'));
    expect(within(card).queryByTestId('slip-question')).toBeNull();
  });
});

describe('the slip check on the Workout tab after the third pass of item 40', () => {
  it('leaves a kept set corrected to fewer reps: its own numbers were kept', async () => {
    const store = await benchFirst();
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await logAt(card, user, firstWeight);
    await waitFor(() => expect(within(card).getByTestId('slip-keep')).toBeEnabled());
    await user.click(within(card).getByTestId('slip-keep'));
    await waitFor(() => expect(logged(store)).toHaveLength(1));
    const done = card.querySelector<HTMLElement>(
      '[data-testid="set-row"][data-state="done"] [data-testid="logged-value"]',
    );
    if (!done) throw new Error('no logged set');
    await user.click(done);
    const editor = await waitFor(() => {
      const found = card.querySelector<HTMLElement>('[data-testid="set-logger"][data-mode="edit"]');
      if (!found) throw new Error('no editor');
      return found;
    });
    await user.click(within(editor).getByRole('button', { name: /^Decrease reps/ }));
    await user.click(within(editor).getByTestId('log-set'));
    expect(within(card).queryByTestId('slip-question')).toBeNull();
    await waitFor(() => expect(logged(store)[0]?.reps).toBe(4));
  });
});

describe('the slip check on the Workout tab after the fourth pass of item 40', () => {
  it('leaves a kept set corrected to fewer reps: its own reps spare the question', async () => {
    const store = await benchFirst(Math.ceil(maxFromSet(firstWeight, 5)));
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await logAt(card, user, null, 60);
    await waitFor(() => expect(within(card).getByTestId('slip-keep')).toBeEnabled());
    await user.click(within(card).getByTestId('slip-keep'));
    await waitFor(() => expect(logged(store)).toHaveLength(1));
    const done = card.querySelector<HTMLElement>(
      '[data-testid="set-row"][data-state="done"] [data-testid="logged-value"]',
    );
    if (!done) throw new Error('no logged set');
    await user.click(done);
    const editor = await waitFor(() => {
      const found = card.querySelector<HTMLElement>('[data-testid="set-logger"][data-mode="edit"]');
      if (!found) throw new Error('no editor');
      return found;
    });
    await user.click(within(editor).getByTestId('logger-reps'));
    const reps = within(editor).getByRole('spinbutton', { name: 'Reps' });
    await user.clear(reps);
    await user.type(reps, '58');
    await user.click(within(editor).getByTestId('log-set'));
    expect(within(card).queryByTestId('slip-question')).toBeNull();
    await waitFor(() => expect(logged(store)[0]?.reps).toBe(58));
  });

  it('judges a correction as if typed new: a set logged too light is no best to hold it to', async () => {
    const store = await benchFirst();
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await logAt(card, user, 50);
    expect(within(card).queryByTestId('slip-question')).toBeNull();
    await waitFor(() => expect(logged(store)).toHaveLength(1));
    const done = card.querySelector<HTMLElement>(
      '[data-testid="set-row"][data-state="done"] [data-testid="logged-value"]',
    );
    if (!done) throw new Error('no logged set');
    await user.click(done);
    const editor = await waitFor(() => {
      const found = card.querySelector<HTMLElement>('[data-testid="set-logger"][data-mode="edit"]');
      if (!found) throw new Error('no editor');
      return found;
    });
    // 120 × 5 reads under what the body suggests: no question, as if it were typed new.
    await user.click(within(editor).getByTestId('logger-weight'));
    const field = within(editor).getByRole('spinbutton', { name: 'Weight' });
    await user.clear(field);
    await user.type(field, '120');
    await user.click(within(editor).getByTestId('log-set'));
    expect(within(card).queryByTestId('slip-question')).toBeNull();
    await waitFor(() => expect(logged(store)[0]?.weight).toBe(120));
  });
});

describe('the slip check on the Workout tab after the fifth pass of item 40', () => {
  it("logs the app's own first target with one tap: a light beginner's empty bar on a curl", async () => {
    const store = await benchFirst();
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    await store.recalibrate({ type: 'replace', entryId: first.id, exerciseId: 'barbell-curl' });
    const swapped = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    if (swapped.exerciseId !== 'barbell-curl') throw new Error('no curl first');
    store.skipWarmup(swapped.id);
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await user.click(within(card).getByTestId('log-set'));
    expect(within(card).queryByTestId('slip-question')).toBeNull();
    await waitFor(() => expect(logged(store)).toHaveLength(1));
  });

  it("reads a set a little over the set's own target by that target, not the body's estimate", async () => {
    const store = await benchFirst();
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    await store.recalibrate({ type: 'replace', entryId: first.id, exerciseId: 'barbell-curl' });
    const swapped = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    if (swapped.exerciseId !== 'barbell-curl') throw new Error('no curl first');
    store.skipWarmup(swapped.id);
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    // 50 × 12 reads past three and a half times the body's estimate for this lifter's curl, and
    // within three and a half times the empty bar asked for at 12.
    await logAt(card, user, 50, 12);
    expect(within(card).queryByTestId('slip-question')).toBeNull();
    await waitFor(() => expect(logged(store)).toHaveLength(1));
  });
});

describe('the slip check on the Workout tab: the max saved beside the log', () => {
  it('reads the max saved for the lift with its logged sets: the higher stands', async () => {
    const handle = createTestStore();
    const { store } = handle;
    await store.hydrate();
    await store.completeOnboarding(profile, createDefaultLocations({ gymAccess: true }, TEST_NOW));
    await store.setCurrentLocation('gym');
    const db = await store.getDatabase();
    const when = new Date(Date.parse(TEST_NOW) - 5 * 86_400_000).toISOString();
    await db.put('workouts', {
      ...record(5, bench.id, [[5, 100, 1]]),
      id: 'w-bench',
      startedAt: when,
      completedAt: when,
    });
    await store.hydrate();
    store.startWorkout();
    let first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    if (first.exerciseId !== bench.id) {
      await store.recalibrate({ type: 'replace', entryId: first.id, exerciseId: bench.id });
      first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    }
    expect(first.exerciseId).toBe(bench.id);
    // Logged at 100 × 5, with a max of 300 saved: 250 × 5 is far above the log, not the max.
    await store.recordStrengthMax(bench.id, { kind: 'max', e1rm: 300 });
    store.skipWarmup(first.id);
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await logAt(card, user, 250);
    expect(within(card).queryByTestId('slip-question')).toBeNull();
    await waitFor(() => expect(logged(store)).toHaveLength(1));
  });
});

describe('the slip check on the Workout tab after the seventh pass of item 40', () => {
  it("asks about a tenfold slip of a target the lifter's other lifts set, no bodyweight saved", async () => {
    const handle = createTestStore();
    const { store } = handle;
    await store.hydrate();
    // The default profile saves no bodyweight: the curl's first target reads the bench alone.
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await store.setCurrentLocation('gym');
    const db = await store.getDatabase();
    const when = new Date(Date.parse(TEST_NOW) - 3 * 86_400_000).toISOString();
    await db.put('workouts', {
      ...record(3, bench.id, [[5, 225, 1]]),
      id: 'w-bench',
      startedAt: when,
      completedAt: when,
    });
    await store.hydrate();
    store.startWorkout();
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    await store.recalibrate({ type: 'replace', entryId: first.id, exerciseId: 'barbell-curl' });
    const curl = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    if (curl.exerciseId !== 'barbell-curl') throw new Error('no curl first');
    store.skipWarmup(curl.id);
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await logAt(card, user, 650, 12);
    expect(await within(card).findByTestId('slip-question')).toHaveTextContent(
      /^650 lb × 12 is far above what your other lifts suggest for Barbell Curl \(a max of about \d+ lb\)\./,
    );
    expect(logged(store)).toHaveLength(0);
  });
});
