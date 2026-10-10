import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { record } from '../../test/records';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { MaxSheet } from './MaxSheet';

vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse(TEST_NOW),
}));

/**
 * A store whose bench press was logged twice at 155 × 6 (a max of about 186 lb); `before` runs on
 * the store before the sheet opens (the provider reads the data again as it mounts).
 */
async function withBench(
  before?: (store: ReturnType<typeof createTestStore>['store']) => Promise<void>,
) {
  const handle = createTestStore({ minOverlayMs: 0 });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  for (const daysAgo of [7, 4]) {
    const when = new Date(Date.parse(TEST_NOW) - daysAgo * 86_400_000).toISOString();
    await db.put('workouts', {
      ...record(daysAgo, 'barbell-bench-press', [
        [6, 155, 2],
        [6, 155, 2],
      ]),
      id: `bench-${daysAgo}`,
      startedAt: when,
      completedAt: when,
    });
  }
  await handle.store.hydrate();
  await handle.store.setCoachFocus('chest');
  const store = handle.store;
  await before?.(store);
  const entry = allEntries(store.getSnapshot().session!.workout.blocks).find(
    (candidate) => candidate.exerciseId === 'barbell-bench-press',
  )!;
  const onClose = vi.fn();
  render(
    <Providers store={store}>
      <MaxSheet
        exercise={requireExercise('barbell-bench-press')}
        entry={entry}
        units="lb"
        open
        offer={false}
        onClose={onClose}
      />
    </Providers>,
  );
  return { store, onClose, user: userEvent.setup() };
}

const savedMax = (store: Awaited<ReturnType<typeof withBench>>['store']) =>
  store.getSnapshot().strengthMaxes.maxes['barbell-bench-press']?.e1rm ?? null;

describe('MaxSheet: numbers that look like slips (Maintenance 26, item 40)', () => {
  it('asks about a max far above the logged sets before saving it, and changes it', async () => {
    const { store, onClose, user } = await withBench();
    await user.click(screen.getByRole('radio', { name: 'I know my max' }));
    await user.type(screen.getByTestId('max-value'), '2250');
    await user.click(screen.getByTestId('max-save'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A max of 2250 lb is more than 1000 lb: more than almost anyone loads on Barbell Bench Press.',
    );
    expect(savedMax(store)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('slip-change'));
    expect(screen.getByTestId('max-value')).toHaveFocus();
    expect(screen.queryByTestId('slip-question')).toBeNull();
    await user.clear(screen.getByTestId('max-value'));
    await user.type(screen.getByTestId('max-value'), '225');
    await user.click(screen.getByTestId('max-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(savedMax(store)).toBe(225);
  });

  it('keeps a high max with one tap', async () => {
    const { store, onClose, user } = await withBench();
    await user.click(screen.getByRole('radio', { name: 'I know my max' }));
    await user.type(screen.getByTestId('max-value'), '400');
    await user.click(screen.getByTestId('max-save'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A max of 400 lb is far above anything logged for Barbell Bench Press (best 155 lb × 6).',
    );
    await user.click(screen.getByTestId('slip-keep'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(savedMax(store)).toBe(400);
  });

  it('asks about a recent set the same way, and a typed field takes the question away', async () => {
    const { store, user } = await withBench();
    await user.type(screen.getByTestId('max-weight'), '1850');
    await user.type(screen.getByTestId('max-reps'), '5');
    await user.click(screen.getByTestId('max-save'));
    expect(screen.getByTestId('slip-keep')).toHaveTextContent('Save 1850 lb × 5');
    await user.type(screen.getByTestId('max-reps'), '0');
    expect(screen.queryByTestId('slip-question')).toBeNull();
    expect(screen.getByTestId('max-save')).toBeInTheDocument();
    expect(savedMax(store)).toBeNull();
  });

  it('saves a plausible or a lower max without a question', async () => {
    const { store, onClose, user } = await withBench();
    await user.click(screen.getByRole('radio', { name: 'I know my max' }));
    await user.type(screen.getByTestId('max-value'), '120');
    await user.click(screen.getByTestId('max-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByTestId('slip-question')).toBeNull();
    expect(savedMax(store)).toBe(120);
  });
});

describe('MaxSheet after the review of item 40', () => {
  it('puts Change it where Save stood, with the focus: a second tap or Enter never saves the slip', async () => {
    const { store, onClose, user } = await withBench();
    await user.click(screen.getByRole('radio', { name: 'I know my max' }));
    await user.type(screen.getByTestId('max-value'), '2250');
    const save = screen.getByTestId('max-save');
    await user.click(save);
    // New buttons: the one pressed is gone, and the one in its place changes the number.
    expect(save).not.toBeInTheDocument();
    const keep = screen.getByTestId('slip-keep');
    const change = screen.getByTestId('slip-change');
    expect(change).toHaveFocus();
    expect(keep.nextElementSibling).toBe(change);
    expect(change).toHaveAccessibleDescription(/A max of 2250 lb is more than 1000 lb/);
    expect(keep).toHaveAccessibleDescription(/A max of 2250 lb is more than 1000 lb/);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('max-value')).toHaveFocus();
    expect(savedMax(store)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('refuses a recent set of more than thirty reps, never reading it as thirty', async () => {
    const { store, user } = await withBench();
    await user.type(screen.getByTestId('max-weight'), '135');
    await user.type(screen.getByTestId('max-reps'), '50');
    expect(screen.getByTestId('max-reps-limit')).toHaveTextContent('Up to 30 reps');
    expect(screen.getByTestId('max-save')).toBeDisabled();
    await user.clear(screen.getByTestId('max-reps'));
    await user.type(screen.getByTestId('max-reps'), '30');
    expect(screen.queryByTestId('max-reps-limit')).toBeNull();
    expect(screen.getByTestId('max-save')).toBeEnabled();
    expect(savedMax(store)).toBeNull();
  });

  it('never asks about a max at or below the one saved for the lift', async () => {
    const { store, onClose, user } = await withBench((ready) =>
      ready.recordStrengthMax('barbell-bench-press', { kind: 'max', e1rm: 400 }),
    );
    await user.click(screen.getByRole('radio', { name: 'I know my max' }));
    await user.type(screen.getByTestId('max-value'), '350');
    await user.click(screen.getByTestId('max-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByTestId('slip-question')).toBeNull();
    expect(savedMax(store)).toBe(350);
  });
});

describe('MaxSheet after the seventh pass of item 40', () => {
  it("asks about a max far above what the lifter's other lifts suggest, no bodyweight saved", async () => {
    const handle = createTestStore({ minOverlayMs: 0 });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await handle.store.getDatabase();
    const when = new Date(Date.parse(TEST_NOW) - 3 * 86_400_000).toISOString();
    await db.put('workouts', {
      ...record(3, 'barbell-bench-press', [[5, 225, 1]]),
      id: 'bench-3',
      startedAt: when,
      completedAt: when,
    });
    await handle.store.hydrate();
    const store = handle.store;
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    await store.recalibrate({ type: 'replace', entryId: first.id, exerciseId: 'barbell-curl' });
    const curl = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    if (curl.exerciseId !== 'barbell-curl') throw new Error('no curl first');
    render(
      <Providers store={store}>
        <MaxSheet
          exercise={requireExercise('barbell-curl')}
          entry={curl}
          units="lb"
          open
          offer={false}
          onClose={vi.fn()}
        />
      </Providers>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'I know my max' }));
    await user.type(screen.getByTestId('max-value'), '840');
    await user.click(screen.getByTestId('max-save'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      /what your other lifts suggest for Barbell Curl/,
    );
    expect(store.getSnapshot().strengthMaxes.maxes['barbell-curl']).toBeUndefined();
  });
});
