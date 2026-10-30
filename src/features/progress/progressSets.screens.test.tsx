import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, type SetSpec } from '../../test/records';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../../features/library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 32, the owner's item 11, on Progress (the first review of round N): a lift's sheet
 * lists every working set of a session on top set plus back-offs, and counts a session whose top
 * set was skipped and its back-offs done. Synthetic data only.
 */

const DAY = 86_400_000;
const BENCH = 'barbell-bench-press';

/** A session `daysAgo` before TEST_NOW: a top set, then back-offs; the top set skipped if asked. */
function structured(daysAgo: number, skipTop = false): WorkoutRecord {
  const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
  const sets: SetSpec[] = [
    [5, 190, 1],
    [5, 180, 2],
    [5, 180, 2],
    [5, 180, 2],
  ];
  const done = record(0, BENCH, sets, [4, 6], 2, {
    id: `w-structured-${daysAgo}`,
    startedAt: when,
    completedAt: when,
  });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
    if (at === 0 && skipTop) {
      set.completed = false;
      set.reps = 0;
      set.weight = null;
      set.rir = null;
    }
  });
  return done;
}

async function lifter(): Promise<AppStore> {
  const { store } = createTestStore();
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, programStyle: 'hybrid' },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  const when = new Date(Date.parse(TEST_NOW) - 9 * DAY).toISOString();
  await db.put('workouts', {
    ...record(
      0,
      BENCH,
      [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ],
      [4, 6],
      2,
    ),
    id: 'w-straight',
    startedAt: when,
    completedAt: when,
  });
  await db.put('workouts', structured(5));
  await db.put('workouts', structured(2, true));
  await store.hydrate();
  return store;
}

async function openProgress(store: AppStore): Promise<HTMLElement> {
  act(() => {
    window.location.hash = '#/progress';
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
    const found = screen
      .getAllByTestId('exercise-progress-row')
      .find((candidate) => candidate.textContent?.includes('Barbell Bench Press'));
    if (!found) throw new Error('no bench press row');
    return found;
  });
}

describe('a lift’s sessions on Progress, the first review of round N', () => {
  it('counts a session whose top set was skipped, its back-offs done', async () => {
    const row = await openProgress(await lifter());
    // Three sessions of the bench press were logged.
    expect(row).toHaveTextContent('3 sessions');
  });

  it('lists every working set of a session on top set plus back-offs', async () => {
    const row = await openProgress(await lifter());
    await userEvent.setup().click(row);
    const sheet = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!found) throw new Error('no lift sheet');
      return found;
    });
    // The matcher reads the row's text with its spaces run together.
    expect(within(sheet).getByText('190×5@1 180×5@2 180×5@2 180×5@2')).toBeInTheDocument();
  });
});
