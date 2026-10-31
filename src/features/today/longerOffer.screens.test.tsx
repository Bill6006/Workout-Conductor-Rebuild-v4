import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { DurationChoice } from '../../engine/workout/types';
import { record } from '../../test/records';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * Maintenance 34, "Longer would help" on Today: a line beside the length control, never a question,
 * with the length to take and Not now. Every weekday ticked; a lifter who trained last week.
 * Synthetic data only.
 */

async function lifter(): Promise<{ store: AppStore; choice: DurationChoice }> {
  const { store } = createTestStore({ now: () => TEST_NOW, minOverlayMs: 0 });
  await store.hydrate();
  const profile = createDefaultProfile(TEST_NOW);
  await store.completeOnboarding(
    {
      ...profile,
      bodyweight: 185,
      schedule: {
        ...profile.schedule,
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        weeklyFrequency: 5,
      },
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  const when = new Date(Date.parse(TEST_NOW) - 7 * 86_400_000).toISOString();
  await db.put('workouts', {
    ...record(0, 'back-squat', [
      [5, 225, 2],
      [5, 225, 2],
      [5, 225, 2],
    ]),
    id: 'w-last-week',
    startedAt: when,
    completedAt: when,
  });
  await store.hydrate();
  for (const choice of [15, 30, 45] as DurationChoice[]) {
    expect((await store.setDurationChoice(choice))?.ok).toBe(true);
    if (store.longerOfferFor()) return { store, choice };
  }
  throw new Error('no length brought the suggestion');
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

describe('"Longer would help" on Today', () => {
  it('says what the next length closes, and takes it on a tap', async () => {
    const { store } = await lifter();
    const offer = store.longerOfferFor()!;
    showToday(store);
    expect(await screen.findByTestId('longer-text')).toHaveTextContent(
      new RegExp(`^${offer.minutes} min would close (most of )?this week’s .+ gap$`),
    );
    await userEvent.setup().click(screen.getByTestId('longer-take'));
    await waitFor(() => expect(store.getSnapshot().session?.duration).toBe(offer.choice));
  });

  it('goes with Not now', async () => {
    const { store } = await lifter();
    showToday(store);
    await screen.findByTestId('longer-offer');
    await userEvent.setup().click(screen.getByTestId('longer-decline'));
    await waitFor(() =>
      expect(store.getSnapshot().timeOffers.answers.map((answer) => answer.answer)).toEqual([
        'not-now',
      ]),
    );
  });
});
