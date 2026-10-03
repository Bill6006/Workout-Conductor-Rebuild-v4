import { act, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { PLATES_KEY } from '../../engine/loading/loading';
import type { MaxInput } from '../../engine/progression/maxes';
import { allEntries } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 25, item 8, on the Workout tab: the plates drawn for the weight on the dial; Today
 * marks a plate missing for this workout only, Default changes the plates the gym keeps and is
 * saved; either redraws the plates at once.
 */

/** The bench first, at the gym, its ramps skipped: 135 set by hand, or a target worked from a max. */
async function started(
  load: { weight: number } | { max: MaxInput } = { weight: 135 },
): Promise<{ handle: TestStoreHandle; store: AppStore }> {
  const handle = createTestStore();
  const { store } = handle;
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  await store.setCurrentLocation('gym');
  store.startWorkout();
  const bench = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
  if (bench.exerciseId !== 'barbell-bench-press') throw new Error('no bench first');
  if ('weight' in load) {
    await store.recalibrate({ type: 'target-weight', entryId: bench.id, weight: load.weight });
  } else {
    await store.recordStrengthMax(bench.exerciseId, load.max);
  }
  await store.skipWarmup(bench.id);
  return { handle, store };
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
  const bench = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
  return waitFor(() => {
    const card = document.querySelector<HTMLElement>(
      `[data-testid="exercise-card"][data-entry-id="${bench.id}"]`,
    );
    if (!card) throw new Error('no bench card');
    return card;
  });
}

/** The drawn plates as they sit on the sleeve, outermost first. */
const sizes = (scope: HTMLElement) =>
  [...scope.querySelectorAll<HTMLElement>('[data-plate]')].map((plate) =>
    Number(plate.dataset.plate),
  );
const gymPlates = (store: AppStore) =>
  store.getSnapshot().locations.find((place) => place.id === 'gym')?.loading[PLATES_KEY];

describe('the plates on the Workout tab', () => {
  it('draws the plates for the dial, under the logger and on the Plates panel alike', async () => {
    const { store } = await started();
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    expect(sizes(within(card).getByTestId('logger-helper'))).toEqual([45]);
    await user.click(within(card).getByTestId('plates-tab'));
    const panel = within(card).getByTestId('plate-math');
    expect(sizes(within(panel).getByTestId('plate-stack'))).toEqual([45]);
    expect(within(panel).getByTestId('plate-caption')).toHaveTextContent(
      '135 lb = 45 lb bar + 45 lb of plates each side',
    );
  });

  it('Today takes a plate out for this workout only; Default saves the gym’s; both redraw at once', async () => {
    const { handle, store } = await started();
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await user.click(within(card).getByTestId('plates-tab'));
    const panel = () => within(card).getByTestId('plate-math');
    const stack = () => within(panel()).getByTestId('plate-stack');

    // Today: no 45s. The session says so; the gym's saved plates do not change.
    await user.click(within(panel()).getByTestId('missing-45'));
    await waitFor(() => expect(store.getSnapshot().session?.loading.missingPlates).toEqual([45]));
    expect(gymPlates(store)).toBeUndefined();
    // 45 a side without a 45 is a 35 and a 10: the 10 outside, the 35 against the collar.
    await waitFor(() => expect(sizes(stack())).toEqual([10, 35]));
    expect(within(panel()).getByTestId('plate-caption')).toHaveTextContent('135 lb');

    // Default: the gym has no 10s. Saved for the gym; today's missing 45 stays as it was.
    await user.click(within(panel()).getByTestId('plates-mode-default'));
    await user.click(within(panel()).getByTestId('plate-10'));
    await waitFor(() =>
      expect(gymPlates(store)).toEqual({ kind: 'plates', perSide: [45, 35, 25, 5, 2.5] }),
    );
    expect(store.getSnapshot().session?.loading.missingPlates).toEqual([45]);
    // 45 a side from 35s, 25s, 5s and 2.5s: a 35, a 5 and a 5.
    await waitFor(() => expect(sizes(stack())).toEqual([5, 5, 35]));
    expect(sizes(within(card).getByTestId('logger-helper'))).toEqual([5, 5, 35]);

    // Back on Today the gym's plates are the ones offered: no 10, the 45 still missing.
    await user.click(within(panel()).getByTestId('plates-mode-today'));
    expect(within(panel()).queryByTestId('missing-10')).toBeNull();
    expect(within(panel()).getByTestId('missing-45')).toHaveAttribute('data-state', 'off');

    // Opened again from the device's own database: the gym keeps its plates.
    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(gymPlates(reopened.store)).toEqual({ kind: 'plates', perSide: [45, 35, 25, 5, 2.5] });
  });

  it('a plate change that moves the target draws the new target, not the dial turned before it', async () => {
    // A target the engine worked out (one set by hand never moves): 160 from a 195 × 5 max, a 45,
    // a 10 and a 2.5 a side. The lifter turns the dial up to 165 first: a 35 and a 25 a side.
    const { store } = await started({ max: { kind: 'set', weight: 195, reps: 5 } });
    const working = () =>
      allEntries(store.getSnapshot().session!.workout.blocks)[0]!.sets.find(
        (set) => set.kind === 'working',
      )!.targetWeight;
    expect(working()).toBe(160);
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    const helper = () => within(card).getByTestId('logger-helper');
    expect(sizes(helper())).toEqual([2.5, 10, 45]);
    await user.click(within(card).getByRole('button', { name: /^Increase weight/ }));
    expect(within(card).getByTestId('logger-weight')).toHaveTextContent('165');
    expect(sizes(helper())).toEqual([25, 35]);

    // No 2.5s today: 160 cannot be made, the target moves to 155 and the logger starts from it.
    await user.click(within(card).getByTestId('plates-tab'));
    const panel = () => within(card).getByTestId('plate-math');
    await user.click(within(panel()).getByTestId('missing-2.5'));
    await waitFor(() => expect(working()).toBe(155));
    await waitFor(() => expect(within(card).getByTestId('logger-weight')).toHaveTextContent('155'));
    // Both drawings follow the logger: a 45 and a 10, not the 165 turned before the change.
    expect(sizes(helper())).toEqual([10, 45]);
    expect(sizes(within(panel()).getByTestId('plate-stack'))).toEqual([10, 45]);
    expect(within(panel()).getByTestId('plate-caption')).toHaveTextContent(
      '155 lb = 45 lb bar + 55 lb of plates each side',
    );
  });

  it('a target that moves and comes back draws the logger’s own value, not the dial turned before', async () => {
    // The tenth review: 160 turned up to 165, the 2.5s out (155), then back (160 again). The
    // logger starts again at 160; the 165 turned on the first 160 dial must not come back.
    const { store } = await started({ max: { kind: 'set', weight: 195, reps: 5 } });
    const working = () =>
      allEntries(store.getSnapshot().session!.workout.blocks)[0]!.sets.find(
        (set) => set.kind === 'working',
      )!.targetWeight;
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    const helper = () => within(card).getByTestId('logger-helper');
    await user.click(within(card).getByRole('button', { name: /^Increase weight/ }));
    expect(sizes(helper())).toEqual([25, 35]);

    await user.click(within(card).getByTestId('plates-tab'));
    const panel = () => within(card).getByTestId('plate-math');
    await user.click(within(panel()).getByTestId('missing-2.5'));
    await waitFor(() => expect(working()).toBe(155));
    await user.click(within(panel()).getByTestId('missing-2.5'));
    await waitFor(() => expect(working()).toBe(160));
    await waitFor(() => expect(within(card).getByTestId('logger-weight')).toHaveTextContent('160'));
    expect(sizes(helper())).toEqual([2.5, 10, 45]);
    expect(sizes(within(panel()).getByTestId('plate-stack'))).toEqual([2.5, 10, 45]);
    expect(within(panel()).getByTestId('plate-caption')).toHaveTextContent(
      '160 lb = 45 lb bar + 57.5 lb of plates each side',
    );
  });
});
