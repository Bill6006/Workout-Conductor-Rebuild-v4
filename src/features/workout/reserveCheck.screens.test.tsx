import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { doneKeys } from '../../core/state/session';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { currentPosition } from '../../engine/workout/sequence';
import { allEntries } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 27, item 43, on the Workout tab: today's reserve check is on the last set of one
 * machine or cable isolation lift; the set list says so, the logger asks for the reps in all, and
 * the reading is said at once.
 */

/**
 * A workout under way with the lifter's yes to checks, logged as prefilled up to the check set,
 * or, with `firstOfLift`, up to the first set of the lift the check is on.
 */
async function upToTheCheck(
  firstOfLift = false,
): Promise<{ store: AppStore; entryId: string; setIndex: number }> {
  const { store } = createTestStore();
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), reserveCheck: true },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  store.startWorkout();
  const check = store.reserveCheckSetFor();
  if (!check) throw new Error('no check today');
  for (;;) {
    const session = store.getSnapshot().session!;
    const keys = doneKeys(session.completed);
    const position = currentPosition(session.workout, (entry, index) =>
      keys.has(`${entry}:${index}`),
    );
    if (!position) throw new Error('the workout ran out before the check');
    if (
      position.entryId === check.entryId &&
      (firstOfLift || position.setIndex === check.setIndex)
    ) {
      break;
    }
    const entry = allEntries(session.workout.blocks).find((one) => one.id === position.entryId)!;
    const set = entry.sets.find((one) => one.index === position.setIndex)!;
    await store.logSet(entry.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[0],
      rir: set.targetRir,
    });
    store.skipRest();
  }
  return { store, entryId: check.entryId, setIndex: check.setIndex };
}

async function renderWorkout(store: AppStore, entryId: string): Promise<HTMLElement> {
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
  return waitFor(() => {
    const card = document.querySelector<HTMLElement>(
      `[data-testid="exercise-card"][data-entry-id="${entryId}"]`,
    );
    if (!card) throw new Error('no card for the check');
    return card;
  });
}

describe('a reserve check on the Workout tab', () => {
  it('opens the logger in check mode on the check set, and says the reading once logged', async () => {
    const { store, entryId, setIndex } = await upToTheCheck();
    const card = await renderWorkout(store, entryId);
    const logger = within(card).getByTestId('set-logger');
    expect(within(logger).getByTestId('check-note')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(logger).getByTestId('logger-total'));
    const total = within(logger).getByRole('spinbutton', { name: 'Reps in all' });
    await user.clear(total);
    await user.type(total, '16');
    await user.click(within(logger).getByTestId('log-set'));
    await waitFor(() =>
      expect(
        store
          .getSnapshot()
          .session!.completed.sets.find(
            (set) => set.entryId === entryId && set.setIndex === setIndex,
          )?.reserveCheck?.total,
      ).toBe(16),
    );
    const done = store
      .getSnapshot()
      .session!.completed.sets.find((set) => set.entryId === entryId && set.setIndex === setIndex)!;
    await waitFor(() =>
      expect(screen.getByRole('status', { hidden: true })).toHaveTextContent(
        `You judged ${done.rir} left at ${done.reps} and did 16 in all`,
      ),
    );
  });

  it('says no reading for a check logged as a skip', async () => {
    // Stalled early with none in all: a skip, which read nothing (the re-check of item 43).
    const { store, entryId, setIndex } = await upToTheCheck();
    const card = await renderWorkout(store, entryId);
    const logger = within(card).getByTestId('set-logger');
    const user = userEvent.setup();
    await user.click(within(logger).getByTestId('check-failed-early'));
    await user.click(within(logger).getByTestId('logger-total'));
    const total = within(logger).getByRole('spinbutton', { name: 'Reps in all' });
    await user.clear(total);
    await user.type(total, '0');
    expect(within(logger).getByTestId('log-set')).toHaveAttribute('data-intent', 'skip');
    await user.click(within(logger).getByTestId('log-set'));
    await waitFor(() =>
      expect(
        store
          .getSnapshot()
          .session!.completed.sets.some(
            (set) => set.entryId === entryId && set.setIndex === setIndex,
          ),
      ).toBe(true),
    );
    // No reading of any kind: a skip judged nothing and reached no failure.
    expect(screen.queryByText(/You judged|to failure|counts for nothing/)).toBeNull();
  });

  it('says in the set list, before the lift begins, that its last set goes on to failure', async () => {
    const { store, entryId } = await upToTheCheck(true);
    const card = await renderWorkout(store, entryId);
    expect(within(card).getByTestId('sets-summary')).toHaveTextContent('the last to failure');
    // The logger in front is an ordinary one until the check set comes.
    expect(within(card).queryByTestId('check-note')).toBeNull();
    const user = userEvent.setup();
    await user.click(within(card).getByTestId('sets-summary'));
    expect(
      within(card)
        .getAllByTestId('set-row')
        .some((row) => (row.textContent ?? '').includes('then on to failure')),
    ).toBe(true);
  });
});
