import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 26, item 50, on the Workout tab: How to and Options' details have no Pause, How to
 * offers the lifter their own GIF, and the card's demonstration loops on after either closes (the
 * Maintenance 25 hold on the card went with the Pause).
 */

async function started(): Promise<AppStore> {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  await handle.store.setCurrentLocation('gym');
  handle.store.startWorkout();
  return handle.store;
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
    if (!card) throw new Error('no first card');
    return card;
  });
}

/** A sheet's clip, once it has arrived. */
function sheetClip(sheet: HTMLElement): Promise<HTMLVideoElement> {
  return waitFor(() => {
    const found = within(sheet).getByTestId('exercise-demo');
    if (!(found instanceof HTMLVideoElement)) throw new Error('still the still');
    return found;
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['mp4'], { type: 'video/mp4' }),
    })),
  );
  let blobs = 0;
  URL.createObjectURL = vi.fn(() => {
    blobs += 1;
    return `blob:clip-${blobs}`;
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the card's demonstration on the Workout tab (Maintenance 26, item 50)", () => {
  it('How to has no Pause and offers the lifter their own GIF; the card loops on after it closes', async () => {
    const store = await started();
    const card = await renderWorkout(store);
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    const exercise = requireExercise(first.exerciseId);
    const user = userEvent.setup();
    const thumb = () => within(card).getByTestId('exercise-thumb');
    await waitFor(() => expect(thumb()).toHaveAttribute('data-animated', 'true'));
    expect(within(card).getByTestId('card-thumb')).toHaveAccessibleName(
      `How to do ${exercise.name}: demonstration and steps`,
    );

    await user.click(within(card).getByTestId('card-thumb'));
    const sheet = await screen.findByRole('dialog', { name: `How to: ${exercise.name}` });
    const playing = await sheetClip(sheet);
    await waitFor(() => expect(playing.paused).toBe(false));
    expect(within(sheet).queryByRole('button', { name: /pause/i })).toBeNull();
    // The way to set their own: a tap on the demonstration, or its button.
    expect(within(sheet).getByTestId('demo-pick')).toBeInTheDocument();
    expect(within(sheet).getByTestId('demo-your-gif')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(thumb()).toHaveAttribute('data-animated', 'true'));
  });

  it("Options' details have no Pause either, and the card loops on", async () => {
    const store = await started();
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    const thumb = () => within(card).getByTestId('exercise-thumb');
    await waitFor(() => expect(thumb()).toHaveAttribute('data-animated', 'true'));
    await user.click(within(card).getByTestId('options-tab'));
    const sheet = await screen.findByRole('dialog');
    const playing = await sheetClip(sheet);
    await waitFor(() => expect(playing.paused).toBe(false));
    expect(within(sheet).queryByRole('button', { name: /pause/i })).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(thumb()).toHaveAttribute('data-animated', 'true');
  });
});
