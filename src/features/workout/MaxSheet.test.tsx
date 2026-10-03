import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { STRENGTH_MAXES_ID } from '../../engine/progression/maxes';
import { allEntries } from '../../engine/workout/types';
import { record } from '../../test/records';
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
    // Maintenance 25, the owner's item 36: the preview is the target the save leaves today.
    const preview = screen.getByTestId('max-preview').textContent ?? '';
    expect(preview).toMatch(/^Max 240 lb\. Today’s target: \d+ lb × \d+-\d+ reps at RIR \d\.$/);
    const [, weight, low, high] = /: (\d+) lb × (\d+)-(\d+) reps/.exec(preview) ?? [];
    await user.click(screen.getByTestId('max-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getSnapshot().strengthMaxes.maxes[exercise.id]?.e1rm).toBe(240);
    const after = allEntries(store.getSnapshot().session!.workout.blocks)
      .find((candidate) => candidate.id === entry.id)
      ?.sets.find((set) => set.kind === 'working');
    expect([after?.targetWeight, after?.targetReps]).toEqual([
      Number(weight),
      [Number(low), Number(high)],
    ]);
  });

  it('says what the save leaves today: kept by the logged sets, moved two steps, or from the next session (Maintenance 25)', async () => {
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
        ...record(
          daysAgo,
          'barbell-bench-press',
          [
            [6, 155, 2],
            [6, 155, 2],
            [5, 155, 2],
          ],
          [4, 6],
          2,
        ),
        id: `bench-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
    await handle.store.hydrate();
    await handle.store.setCoachFocus('chest');
    const store = handle.store;
    const bench = () =>
      allEntries(store.getSnapshot().session!.workout.blocks).find(
        (entry) => entry.exerciseId === 'barbell-bench-press',
      )!;
    const target = bench().sets.find((set) => set.kind === 'working')!;
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <MaxSheet
          exercise={requireExercise('barbell-bench-press')}
          entry={bench()}
          units="lb"
          open
          offer={false}
          onClose={vi.fn()}
        />
      </Providers>,
    );
    await user.click(screen.getByRole('radio', { name: 'I know my max' }));
    await user.type(screen.getByTestId('max-value'), '150');
    expect(screen.getByTestId('max-preview')).toHaveTextContent(
      `Max 150 lb. Today’s target stays ${target.targetWeight} lb × 4-6 reps at RIR 2: your logged sets already say as much as this max.`,
    );
    await user.clear(screen.getByTestId('max-value'));
    await user.type(screen.getByTestId('max-value'), '260');
    expect(screen.getByTestId('max-preview')).toHaveTextContent(
      `Max 260 lb. Today’s target: ${(target.targetWeight as number) + 10} lb × 4-6 reps at RIR 2. Your max of 260 lb, entered after you began this lift last time, says more than your logged sets: up 2 steps toward it. Your next logged session takes over.`,
    );
    // Under way: the max counts from the next session.
    store.startWorkout();
    store.skipWarmup(bench().id);
    await store.logSet(bench().id, target.index, { weight: target.targetWeight, reps: 6, rir: 2 });
    await user.clear(screen.getByTestId('max-value'));
    await user.type(screen.getByTestId('max-value'), '300');
    expect(screen.getByTestId('max-preview')).toHaveTextContent(
      'Max 300 lb. Barbell Bench Press is already under way today; this max counts from your next session.',
    );
  });

  it('says the max waits behind sets logged today when the lift’s weight is set by hand', async () => {
    const handle = createTestStore({ minOverlayMs: 0 });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const store = handle.store;
    const bench = () =>
      allEntries(store.getSnapshot().session!.workout.blocks).find(
        (entry) => entry.exerciseId === 'barbell-bench-press',
      )!;
    await store.recalibrate({ type: 'target-weight', entryId: bench().id, weight: 135 });
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <MaxSheet
          exercise={requireExercise('barbell-bench-press')}
          entry={bench()}
          units="lb"
          open
          offer={false}
          onClose={vi.fn()}
        />
      </Providers>,
    );
    await user.click(screen.getByRole('radio', { name: 'I know my max' }));
    await user.type(screen.getByTestId('max-value'), '250');
    // A max older than sets logged later does not count against them: the words promise no more.
    expect(screen.getByTestId('max-preview')).toHaveTextContent(
      'Max 250 lb. Barbell Bench Press keeps the weight you set for today. Sets of it you log today count instead of this max.',
    );
  });

  it('shows a set saved before Maintenance 25 read by today’s rule', async () => {
    const handle = createTestStore({ minOverlayMs: 0 });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await handle.store.getDatabase();
    // 100 lb for 20 reps, saved with the old cap as 140.
    await db.put('meta', {
      id: STRENGTH_MAXES_ID,
      maxes: {
        'barbell-bench-press': {
          e1rm: 140,
          units: 'lb',
          enteredAt: TEST_NOW,
          from: { weight: 100, reps: 20 },
        },
      },
      prompts: {},
    });
    await handle.store.hydrate();
    const entry = allEntries(handle.store.getSnapshot().session!.workout.blocks).find(
      (candidate) => candidate.exerciseId === 'barbell-bench-press',
    )!;
    render(
      <Providers store={handle.store}>
        <MaxSheet
          exercise={requireExercise('barbell-bench-press')}
          entry={entry}
          units="lb"
          open
          offer={false}
          onClose={vi.fn()}
        />
      </Providers>,
    );
    expect(screen.getByTestId('max-saved')).toHaveTextContent(/^Saved now: 167 lb, entered /);
  });

  it('says a lift taken lighter to win back missed reps stays so, never that the log says as much (Maintenance 25)', async () => {
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
        ...record(
          daysAgo,
          'barbell-bench-press',
          [
            [3, 185, 0],
            [3, 185, 0],
            [2, 185, 0],
          ],
          [4, 6],
          2,
        ),
        id: `bench-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
    await handle.store.hydrate();
    await handle.store.setCoachFocus('chest');
    const store = handle.store;
    const bench = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-bench-press',
    )!;
    const target = bench.sets.find((set) => set.kind === 'working')!;
    const user = userEvent.setup();
    render(
      <Providers store={store}>
        <MaxSheet
          exercise={requireExercise('barbell-bench-press')}
          entry={bench}
          units="lb"
          open
          offer={false}
          onClose={vi.fn()}
        />
      </Providers>,
    );
    await user.click(screen.getByRole('radio', { name: 'I know my max' }));
    await user.type(screen.getByTestId('max-value'), '300');
    expect(screen.getByTestId('max-preview')).toHaveTextContent(
      `Max 300 lb. Today’s target stays ${target.targetWeight} lb × 4-6 reps at RIR 2: the lift is lighter today to win back missed reps, and a max does not change that.`,
    );
  });
});
