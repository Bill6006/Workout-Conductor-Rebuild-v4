import { act, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { PLATES_KEY, loadingFor } from '../../engine/loading/loading';
import { allEntries } from '../../engine/workout/types';
import { requireExercise } from '../../catalog/exercises/catalog';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 30, the owner's items 6 and 30, on the Workout tab: a machine that comes both ways is
 * switched to plates from its own Weights tab during a workout. The plates start from the gym's rack,
 * the tab becomes Plates, the targets land on what the plates make, and the logger reads its plates.
 */

const MACHINE = 'machine-chest-press';

/**
 * At the gym, its rack without 35s, 5s or 2.5s, the first lift swapped to another: the chest press
 * machine unless said otherwise.
 */
async function started(
  exerciseId = MACHINE,
  before?: (store: AppStore) => Promise<void>,
): Promise<AppStore> {
  const { store } = createTestStore();
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  await store.setCurrentLocation('gym');
  await store.saveLoading('gym', PLATES_KEY, { kind: 'plates', perSide: [45, 25, 10] });
  await before?.(store);
  store.startWorkout();
  const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
  const swapped = await store.swapExercise(first.id, exerciseId);
  if (!swapped?.ok) throw new Error('the swap did not go through');
  const entry = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
  if (entry.exerciseId !== exerciseId) throw new Error(`no ${exerciseId} first`);
  await store.skipWarmup(entry.id);
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
  const entry = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
  return waitFor(() => {
    const card = document.querySelector<HTMLElement>(
      `[data-testid="exercise-card"][data-entry-id="${entry.id}"]`,
    );
    if (!card) throw new Error('no machine card');
    return card;
  });
}

const gymLoading = (store: AppStore) =>
  store.getSnapshot().locations.find((place) => place.id === 'gym')?.loading ?? {};

describe('a machine switched to plates during a workout', () => {
  it('starts from the gym’s rack, names the tab Plates, and lands every target on its plates', async () => {
    const store = await started();
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    const tab = within(card).getByTestId('plates-tab');
    expect(tab).toHaveTextContent('Weights');
    await user.click(tab);
    await user.click(within(card).getByTestId('machine-load-plates'));
    await waitFor(() =>
      expect(gymLoading(store)[MACHINE]).toEqual({ kind: 'plates', perSide: [45, 25, 10] }),
    );
    await waitFor(() => expect(within(card).getByTestId('plates-tab')).toHaveTextContent('Plates'));

    // Every working target is a weight two of each plate make, the sled not counted.
    const exercise = requireExercise(MACHINE);
    const made = loadingFor(gymLoading(store), { missingPlates: [] }, exercise, 'lb').available;
    expect(made).toContain(90);
    await waitFor(() => {
      const entry = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
      const targets = entry.sets
        .filter((set) => set.kind === 'working')
        .map((set) => set.targetWeight);
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) expect(made).toContain(target);
    });
    // The logger reads the plates on the machine, a side's worth, and its total.
    await waitFor(() =>
      expect(within(card).getByTestId('logger-helper')).toHaveTextContent(/each side · \d+ lb/),
    );
    expect(within(card).getByTestId('plate-math')).toHaveTextContent(
      'The same on each side; the sled is not counted.',
    );
  });
});

describe('a machine switched to plates and back in a workout (the review)', () => {
  it('gets its recorded stack back after the Weights tab was closed and opened', async () => {
    const stack = { kind: 'stack' as const, ranges: [{ from: 20, to: 300, step: 20 }] };
    const store = await started(MACHINE, (store) => store.saveLoading('gym', MACHINE, stack));
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await user.click(within(card).getByTestId('plates-tab'));
    await user.click(within(card).getByTestId('machine-load-plates'));
    await waitFor(() => expect(gymLoading(store)[MACHINE]?.kind).toBe('plates'));
    await waitFor(() => expect(within(card).getByTestId('plates-tab')).toHaveTextContent('Plates'));
    // Closed and opened again, as between sets.
    await user.click(within(card).getByTestId('plates-tab'));
    await user.click(within(card).getByTestId('plates-tab'));
    await user.click(within(card).getByTestId('machine-load-stack'));
    await waitFor(() =>
      expect(within(card).getByTestId('plates-tab')).toHaveTextContent('Weights'),
    );
    expect(gymLoading(store)[MACHINE]).toEqual(stack);
  });
});

describe('a kettlebell lift’s Weights at a gym with dumbbells too (the re-check)', () => {
  it('names the one record both share', async () => {
    const store = await started('kettlebell-swing');
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await user.click(within(card).getByTestId('plates-tab'));
    expect(within(card).getByTestId('loading-editor')).toHaveTextContent(
      'Dumbbells and kettlebells at Gym',
    );
  });
});

describe('the "Bodyweight" hint on a step-up (the review)', () => {
  it('is no button, and opens no empty panel', async () => {
    const store = await started('step-up');
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    const hint = within(card).getByTestId('weight-hint');
    expect(hint).toHaveTextContent('Bodyweight');
    expect(hint.tagName).toBe('SPAN');
    await user.click(hint);
    expect(within(card).queryByTestId('plate-math')).toBeNull();
    expect(within(card).queryByTestId('plates-tab')).toBeNull();
  });
});

describe('a Settings edit waiting to save while a weight is set below it (the re-check)', () => {
  /** Settings at the weights, on a clock that moves, as a phone's does. */
  async function settingsAtWeights() {
    let at = Date.parse(TEST_NOW);
    const { store } = createTestStore({ now: () => new Date((at += 1000)).toISOString() });
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await store.setCurrentLocation('gym');
    act(() => {
      window.location.hash = '#/settings/weights';
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
    return store;
  }
  const radio = (name: string) =>
    [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find(
      (candidate) => candidate.textContent === name,
    )!;

  it('stays on the screen, and is kept by an edit made on top of it', async () => {
    const store = await settingsAtWeights();
    const user = userEvent.setup({ delay: null });
    const weights = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-testid="place-weights"]');
      if (!found) throw new Error('no weights row open');
      return found;
    });
    await user.click(document.querySelector<HTMLElement>('[data-testid="row-units"]')!);
    await user.click(radio('Female'));
    await user.click(
      within(within(weights).getByTestId('place-weights-plates')).getByTestId('plate-35'),
    );
    await waitFor(() => expect(gymLoading(store)[PLATES_KEY]?.kind).toBe('plates'), {
      interval: 5,
    });
    expect(radio('Female')).toHaveAttribute('aria-checked', 'true');
    // A second edit in the same row, within the wait, on what the screen shows.
    await user.click(radio('Kilograms (kg)'));
    await waitFor(() => expect(store.getSnapshot().profile?.units).toBe('kg'), { timeout: 3000 });
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(store.getSnapshot().profile?.sex).toBe('female');
    expect(gymLoading(store)[PLATES_KEY]).toEqual({
      kind: 'plates',
      perSide: [45, 25, 10, 5, 2.5],
    });
  });
});

describe('the weights at each place, in Settings', () => {
  it('keeps a plate set just after another Settings edit (the review)', async () => {
    // An edit in Units and body waits 450 ms to save with the places as they were: the plate
    // set meanwhile from the Weights row stays.
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await store.setCurrentLocation('gym');
    act(() => {
      window.location.hash = '#/settings/weights';
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
    const user = userEvent.setup();
    const weights = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-testid="place-weights"]');
      if (!found) throw new Error('no weights row open');
      return found;
    });
    await user.click(document.querySelector<HTMLElement>('[data-testid="row-units"]')!);
    await user.click(
      [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find(
        (radio) => radio.textContent === 'Female',
      )!,
    );
    await user.click(
      within(within(weights).getByTestId('place-weights-plates')).getByTestId('plate-35'),
    );
    await waitFor(() => expect(store.getSnapshot().profile?.sex).toBe('female'), {
      timeout: 3000,
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(gymLoading(store)[PLATES_KEY]).toEqual({
      kind: 'plates',
      perSide: [45, 25, 10, 5, 2.5],
    });
  });

  it('open from their own link, under the places', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    act(() => {
      window.location.hash = '#/settings/weights';
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
    const weights = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-testid="place-weights"]');
      if (!found) throw new Error('no weights row open');
      return found;
    });
    expect(within(weights).getByTestId('place-weights-machines')).toBeInTheDocument();
    expect(document.body).toHaveTextContent('Weights at your places');
  });
});
