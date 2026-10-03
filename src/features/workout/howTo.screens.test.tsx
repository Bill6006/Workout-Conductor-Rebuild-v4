import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
 * Maintenance 25, item 7, on the Workout tab: How to (the card's demonstration or its How to
 * button) opens the teaching view, and the card stays as small as it was; why the target is what
 * it is moved to Options, beside the session's own actions.
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

describe('How to on the Workout tab', () => {
  it('shows the cues the lifter saved in Notes, after the catalog’s (the ninth review)', async () => {
    const store = await started();
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    await store.saveExerciseNotes(first.exerciseId, {
      notes: '',
      cues: ['Big breath before each rep'],
    });
    const card = await renderWorkout(store);
    const user = userEvent.setup();
    await user.click(within(card).getByTestId('howto-button'));
    const sheet = await screen.findByRole('dialog', {
      name: `How to: ${requireExercise(first.exerciseId).name}`,
    });
    expect(within(sheet).getByRole('heading', { name: 'Your cues' })).toBeInTheDocument();
    expect(within(sheet).getByText('Big breath before each rep')).toBeInTheDocument();
  });

  it('opens the teaching view from the demonstration and from the How to button', async () => {
    const store = await started();
    const card = await renderWorkout(store);
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    const exercise = requireExercise(first.exerciseId);
    const user = userEvent.setup();
    // The card no longer opens a panel of its own: How to is a sheet.
    expect(within(card).queryByRole('tab', { name: 'How to' })).toBeNull();
    for (const opener of ['card-thumb', 'howto-button']) {
      await user.click(within(card).getByTestId(opener));
      const sheet = await screen.findByRole('dialog', { name: `How to: ${exercise.name}` });
      expect(within(sheet).getByTestId('how-to-text')).toHaveTextContent(
        exercise.instructions.execution[0] as string,
      );
      expect(within(sheet).queryByTestId('equipment-busy')).toBeNull();
      await user.click(within(sheet).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    expect(within(card).queryByTestId('how-to-text')).toBeNull();
  });

  it('shows why the target is what it is in Options, beside the session’s actions', async () => {
    const store = await started();
    const card = await renderWorkout(store);
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    const user = userEvent.setup();
    await user.click(within(card).getByTestId('options-tab'));
    const sheet = await screen.findByRole('dialog');
    const why = within(sheet).getByTestId('progression-evidence');
    for (const line of first.progression?.evidence ?? []) {
      expect(why).toHaveTextContent(line);
    }
    expect(within(sheet).getByRole('heading', { name: 'Why this target' })).toBeInTheDocument();
    expect(within(sheet).getByTestId('equipment-busy')).toBeInTheDocument();
    // Options also teaches, in the same words as How to.
    expect(within(sheet).getByTestId('how-to-text')).toBeInTheDocument();
  });
});
