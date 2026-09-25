import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { AppStore } from '../../core/state/appStore';
import { DUMBBELLS_KEY } from '../../engine/loading/loading';
import { GYM_LOCATION_ID, createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * Maintenance 23: "Know your max?" promises today's first target, so it shows only while an
 * entered max can still set it: nothing of the lift done or skipped, its ramps included, and no
 * weight set for today. Past that, the lift keeps its sets and a max counts from the next session.
 */

async function onboarded(place = GYM_LOCATION_ID): Promise<AppStore> {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW, place), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle.store;
}

async function started(): Promise<{ store: AppStore; lift: WorkoutEntry }> {
  const handle = { store: await onboarded() };
  handle.store.startWorkout();
  const lift = allEntries(handle.store.getSnapshot().session?.workout.blocks ?? [])[0];
  if (!lift) throw new Error('no lift');
  expect(lift.progression?.mode).toBe('start');
  return { store: handle.store, lift };
}

async function cardOf(store: AppStore, lift: WorkoutEntry): Promise<HTMLElement> {
  act(() => {
    window.location.hash = '#/workout';
  });
  // The provider reads the store again as it mounts: that read lands before the test acts, as
  // it does in the app, where nothing is tapped before it.
  const hydrate = vi.spyOn(store, 'hydrate');
  render(
    <Providers store={store}>
      <App />
    </Providers>,
  );
  await act(async () => {
    await hydrate.mock.results[0]?.value;
  });
  const name = requireExercise(lift.exerciseId).name;
  const heading = await screen.findByRole('heading', { level: 3, name });
  const card = heading.closest<HTMLElement>('[data-testid="exercise-card"]');
  if (!card) throw new Error('no card');
  return card;
}

const rampOf = (lift: WorkoutEntry) => {
  const ramp = lift.sets.find((set) => set.kind === 'warmup');
  if (!ramp) throw new Error('no ramp');
  return ramp;
};

describe('the one-time "Know your max?" offer', () => {
  it('sets the first target it promises while nothing of the lift is done', async () => {
    const { store, lift } = await started();
    const user = userEvent.setup();
    const card = await cardOf(store, lift);
    await user.click(within(card).getByTestId('know-max'));
    await user.click(screen.getByRole('radio', { name: 'I know my max' }));
    await user.type(screen.getByTestId('max-value'), '225');
    const preview = screen.getByTestId('max-preview').textContent ?? '';
    const promised = Number(/First target: (\d+(?:\.\d+)?) lb/.exec(preview)?.[1]);
    expect(promised).toBeGreaterThan(0);
    await user.click(screen.getByTestId('max-save'));
    await waitFor(() => expect(store.getSnapshot().session?.lastSummary).not.toBeNull());
    const after = allEntries(store.getSnapshot().session?.workout.blocks ?? []).find(
      (entry) => entry.id === lift.id,
    );
    expect(after?.sets.find((set) => set.kind === 'working')?.targetWeight).toBe(promised);
  });

  it('is gone once a ramp is done: the max would count from the next session', async () => {
    const { store, lift } = await started();
    const ramp = rampOf(lift);
    await store.logSet(lift.id, ramp.index, { weight: ramp.targetWeight, reps: 5, rir: 5 });
    const card = await cardOf(store, lift);
    expect(within(card).queryByTestId('know-max')).toBeNull();
  });

  it('is gone once a ramp is skipped', async () => {
    const { store, lift } = await started();
    // Zero reps is a skip.
    await store.logSet(lift.id, rampOf(lift).index, { weight: null, reps: 0, rir: null });
    const card = await cardOf(store, lift);
    expect(within(card).queryByTestId('know-max')).toBeNull();
  });

  it('is gone once a weight is set for today', async () => {
    const { store, lift } = await started();
    await store.recalibrate({ type: 'target-weight', entryId: lift.id, weight: 95 });
    const card = await cardOf(store, lift);
    expect(within(card).queryByTestId('know-max')).toBeNull();
  });
});

/** Types a max into the offer and saves it: what it promised, and the first working set after. */
async function enterThroughOffer(store: AppStore, lift: WorkoutEntry, max: string) {
  const user = userEvent.setup();
  const card = await cardOf(store, lift);
  await user.click(within(card).getByTestId('know-max'));
  await user.click(screen.getByRole('radio', { name: 'I know my max' }));
  await user.type(screen.getByTestId('max-value'), max);
  const preview = screen.getByTestId('max-preview').textContent ?? '';
  await user.click(screen.getByTestId('max-save'));
  await waitFor(() => expect(store.getSnapshot().session?.lastSummary).not.toBeNull());
  const after = allEntries(store.getSnapshot().session?.workout.blocks ?? []).find(
    (entry) => entry.id === lift.id,
  );
  return { preview, set: after?.sets.find((one) => one.kind === 'working') };
}

describe('the offer, after changes to the lift before it starts', () => {
  it('shows on a lift swapped in after a weight was set for the one swapped out', async () => {
    const store = await onboarded();
    store.startWorkout();
    const bench = allEntries(store.getSnapshot().session?.workout.blocks ?? [])[0];
    if (!bench || bench.exerciseId !== 'barbell-bench-press') throw new Error('no bench first');
    // The coach's weight for the bench, accepted; then the bench swapped for dumbbells.
    await store.recalibrate({ type: 'target-weight', entryId: bench.id, weight: 95 });
    const result = await store.swapExercise(bench.id, 'dumbbell-bench-press');
    if (!result?.ok) throw new Error('swap failed');
    const lift = allEntries(store.getSnapshot().session?.workout.blocks ?? []).find(
      (entry) => entry.id === bench.id,
    );
    if (!lift) throw new Error('no lift');
    expect(lift.manual?.weight).toBeUndefined();
    const card = await cardOf(store, lift);
    expect(within(card).queryByTestId('know-max')).not.toBeNull();
    await userEvent.setup().click(within(card).getByRole('tab', { name: /how to/i }));
    expect(within(card).getByTestId('progression-evidence').textContent ?? '').not.toMatch(
      /You set this by hand/,
    );
  });

  it('sets the load it promises for reps set by hand', async () => {
    const { store, lift } = await started();
    // The plan asks 4-6; the lifter asks 10-12, then enters a 225 lb max.
    await store.recalibrate({ type: 'rep-range', entryId: lift.id, reps: [10, 12] });
    const { preview, set } = await enterThroughOffer(store, lift, '225');
    expect(preview).toContain('First target: 145 lb × 10-12 reps at RIR 2.');
    expect([set?.targetWeight, set?.targetReps]).toEqual([145, [10, 12]]);
  });

  it('names the range a pushed set stands in for, never the push’s extra reps', async () => {
    const store = await onboarded('home');
    await store.saveLoading('home', DUMBBELLS_KEY, {
      kind: 'dumbbells',
      ranges: [{ from: 5, to: 20, step: 5 }],
    });
    store.startWorkout();
    const lift = allEntries(store.getSnapshot().session?.workout.blocks ?? []).find(
      (entry) =>
        entry.progression?.mode === 'start' &&
        requireExercise(entry.exerciseId).load === 'dumbbell-each' &&
        entry.sets.some((set) => set.kind === 'working' && set.asked !== undefined),
    );
    const pushed = lift?.sets.find((set) => set.kind === 'working');
    if (!lift || !pushed?.asked) throw new Error('no pushed dumbbell lift never done');
    const asked = pushed.asked.reps;
    expect(pushed.targetReps).not.toEqual(asked);
    const { preview, set } = await enterThroughOffer(store, lift, '150');
    expect(preview).toContain(`× ${asked[0]}-${asked[1]} reps at RIR`);
    // What it promised is the target the set now stands in for, at the heaviest pair here.
    const promised = Number(/First target: (\d+) lb/.exec(preview)?.[1]);
    expect([set?.targetWeight, set?.asked]).toEqual([20, { weight: promised, reps: asked }]);
  });
});
