import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { MaxSheet } from './MaxSheet';

async function seeded() {
  const handle = createTestStore({ minOverlayMs: 0 });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const session = handle.store.getSnapshot().session;
  if (!session) throw new Error('no session');
  const entry = allEntries(session.workout.blocks)[0];
  if (!entry) throw new Error('no entry');
  return { ...handle, entry, exercise: requireExercise(entry.exerciseId) };
}

describe('MaxSheet', () => {
  it('as the one-time offer it can be snoozed or declined for the lift', async () => {
    const { store, entry, exercise } = await seeded();
    render(
      <Providers store={store}>
        <MaxSheet exercise={exercise} entry={entry} units="lb" open onClose={vi.fn()} />
      </Providers>,
    );
    expect(screen.getByTestId('max-not-now')).toBeInTheDocument();
    expect(screen.getByTestId('max-never')).toBeInTheDocument();
    expect(screen.queryByTestId('max-cancel')).toBeNull();
  });

  it('opened from Options it enters or updates a max: no snooze, the saved max shown, and both ways in', async () => {
    const { store, entry, exercise } = await seeded();
    await store.recordStrengthMax(exercise.id, { kind: 'max', e1rm: 216 });
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Providers store={store}>
        <MaxSheet
          exercise={exercise}
          entry={entry}
          units="lb"
          open
          offer={false}
          onClose={onClose}
        />
      </Providers>,
    );
    expect(screen.queryByTestId('max-not-now')).toBeNull();
    expect(screen.queryByTestId('max-never')).toBeNull();
    expect(screen.getByTestId('max-saved')).toHaveTextContent(/^Saved now: 216 lb, entered /);
    expect(screen.getByRole('radio', { name: 'A recent set' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'I know my max' }));
    await user.type(screen.getByTestId('max-value'), '240');
    expect(screen.getByTestId('max-preview')).toHaveTextContent(
      /^Max 240 lb\. On its own it puts the target at: \d+ lb × /,
    );
    await user.click(screen.getByTestId('max-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getSnapshot().strengthMaxes.maxes[exercise.id]?.e1rm).toBe(240);
  });
});
