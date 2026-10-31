import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { DUMBBELLS_KEY } from '../../engine/loading/loading';
import { allEntries } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * The owner's report of 2026-10-31, on screen: Dumbbell Row at home, held at 50 lb, the heaviest
 * pair there. The coach's "A harder variation" opens the lift's sheet, which lists one first; at a
 * home with nothing harder to offer, no card offers one. Synthetic data only.
 */

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();

/** Dumbbell Row at 50 lb, every set at the top of 4-6 with two in reserve. */
function rows(days: number): WorkoutRecord {
  return {
    id: `w-${days}`,
    startedAt: at(days),
    completedAt: at(days),
    locationId: 'home',
    templateId: 'full-body',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: 'dumbbell-row',
        plannedSets: 3,
        sets: [0, 1, 2].map((setIndex) => ({
          kind: 'working' as const,
          reps: 6,
          weight: 50,
          rir: 2,
          completed: true,
          setIndex,
          targetReps: [4, 6] as [number, number],
          targetRir: 2,
        })),
      },
    ],
  };
}

/** A lifter at home whose dumbbells go to 50 lb, with `equipment` there. */
async function atHome(equipment?: string[]): Promise<AppStore> {
  const { store } = createTestStore({ minOverlayMs: 0 });
  await store.hydrate();
  await store.completeOnboarding(
    createDefaultProfile(TEST_NOW, 'home'),
    createDefaultLocations(
      { gymAccess: false, ...(equipment ? { homeEquipment: equipment } : {}) },
      TEST_NOW,
    ),
  );
  const db = await store.getDatabase();
  for (const record of [rows(7), rows(4)]) await db.put('workouts', record);
  await store.hydrate();
  await store.saveLoading('home', DUMBBELLS_KEY, {
    kind: 'dumbbells',
    ranges: [{ from: 5, to: 50, step: 5 }],
  });
  const row = allEntries(store.getSnapshot().session?.workout.blocks ?? []).find(
    (entry) => entry.exerciseId === 'dumbbell-row',
  );
  expect(row?.progression?.capped).toEqual({ at: 50 });
  return store;
}

/** Every coach card Today shows, in turn, each put away with Not now; stops at `until`. */
async function cardsUntil(until: string | null): Promise<string[]> {
  const user = userEvent.setup();
  const seen: string[] = [];
  const headline = () => screen.queryByTestId('coach-headline')?.textContent ?? null;
  for (let tries = 0; tries < 10; tries += 1) {
    const now = headline();
    if (now === null) break;
    seen.push(now);
    // The quiet line, with nothing to put away: no card is left.
    const dismiss = screen.queryByTestId('coach-dismiss');
    if (now === until || dismiss === null) break;
    await user.click(dismiss);
    await waitFor(() => expect(headline()).not.toBe(now));
  }
  return seen;
}

function showToday(store: AppStore): void {
  act(() => {
    window.location.hash = '#/today';
  });
  render(
    <Providers store={store}>
      <App />
    </Providers>,
  );
}

const HEADLINE = 'Dumbbell Row: at the heaviest weight here (50 lb)';

describe('"A harder variation" on Today', () => {
  it('opens the lift’s sheet with the harder variation first', async () => {
    showToday(await atHome());
    await waitFor(() => expect(screen.getByTestId('coach-headline')).toBeInTheDocument());
    expect((await cardsUntil(HEADLINE)).at(-1)).toBe(HEADLINE);
    const action = screen.getByTestId('coach-action');
    expect(action).toHaveTextContent('A harder variation');
    await userEvent.setup().click(action);
    const list = await screen.findByRole('region', { name: 'Alternatives' });
    const first = within(list).getAllByRole('listitem')[0]!;
    expect(first).toHaveTextContent('Chest-Supported Row');
    expect(within(first).getByTestId('alternative-reasons')).toHaveTextContent(
      'still heavy with the weights you have',
    );
  });

  it('is never offered where the lift’s sheet has nothing harder', async () => {
    // Dumbbells and nothing else: no bench for the chest-supported row.
    showToday(await atHome(['adjustable-dumbbells']));
    await waitFor(() => expect(screen.getByTestId('coach-headline')).toBeInTheDocument());
    const seen = await cardsUntil(HEADLINE);
    expect(seen).not.toContain(HEADLINE);
    // Every card was seen: the walk ended on the quiet line, with nothing left to put away.
    expect(screen.queryByTestId('coach-dismiss')).not.toBeInTheDocument();
    expect(seen.length).toBeLessThan(10);
  });
});
