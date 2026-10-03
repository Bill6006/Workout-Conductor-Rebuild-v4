import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { CLOUD_OFFLINE, type AppStore } from '../../core/state/appStore';
import { EXERCISES } from '../../catalog/exercises/catalog';
import { loadClass } from '../../engine/progression/startingLoad';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { createFakeCloud } from '../../test/fakeCloud';
import { record } from '../../test/records';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * Maintenance 25, the owner's item 5: Settings, Plan and Progress as one layout. Each thing has
 * one home: the days with the schedule in Settings, the places on Plan, every muscle's coverage
 * and every lift on Progress, and the build under Settings, About. The other tabs link to it.
 */

async function onboarded(workouts = 0): Promise<AppStore> {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  if (workouts > 0) {
    const db = await handle.store.getDatabase();
    for (let at = 0; at < workouts; at += 1) {
      const daysAgo = 2 + at * 2;
      const when = new Date(Date.parse(TEST_NOW) - daysAgo * 86_400_000).toISOString();
      await db.put('workouts', {
        ...record(daysAgo, 'barbell-bench-press', [
          [6, 150 + at * 5, 2],
          [6, 150 + at * 5, 2],
        ]),
        id: `w-bench-${at}`,
        startedAt: when,
        completedAt: when,
      });
    }
    await handle.store.hydrate();
  }
  return handle.store;
}

async function renderAt(store: AppStore, hash: string): Promise<void> {
  act(() => {
    window.location.hash = hash;
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
}

describe('Settings, one home for each setting', () => {
  it('shows every row’s value closed, and opens the one a link names', async () => {
    const store = await onboarded();
    await renderAt(store, '#/settings/schedule');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(screen.getByTestId('row-schedule')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Training experience' })).toBeInTheDocument();
    for (const name of ['goals', 'programming', 'preferences', 'limitations', 'units']) {
      expect(screen.getByTestId(`row-${name}`)).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.getByTestId('row-goals')).toHaveTextContent(/Build muscle/);
    expect(screen.getByTestId('row-units')).toHaveTextContent('Pounds · 185 lb bodyweight');
  });

  it('keeps gym access one tap away, and the places on Plan', async () => {
    const store = await onboarded();
    const user = userEvent.setup();
    await renderAt(store, '#/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    const gym = screen.getByRole('switch', { name: /I have gym access/ });
    expect(gym).toBeChecked();
    // The home equipment is edited on Plan, where every place is: no second editor here.
    expect(screen.queryByText('Home equipment')).not.toBeInTheDocument();
    // The library and custom exercises have a row of their own (Maintenance 25).
    expect(screen.getByTestId('library-link')).toHaveAttribute('href', '#/library');
    const places = screen.getByTestId('places-link');
    // Straight to the places card on Plan, in view (Maintenance 25).
    expect(places).toHaveAttribute('href', '#/plan/places');
    expect(places).toHaveTextContent(/Gym \(current\)/);
    await user.click(gym);
    await vi.waitFor(() =>
      expect(store.getSnapshot().locations.some((place) => place.id === 'gym')).toBe(false),
    );
  });

  it('keeps the alerts’ switches in view and the data and the build a tap away', async () => {
    const store = await onboarded();
    await renderAt(store, '#/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(screen.getByRole('switch', { name: /Rest timer sounds/ })).toBeVisible();
    for (const name of [
      'cloud',
      'backup',
      'automatic-backups',
      'storage',
      'older-exports',
      'about',
    ]) {
      expect(screen.getByTestId(`row-${name}`)).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.queryByTestId('build-marker')).not.toBeInTheDocument();
  });
});

describe('the coach’s backup card (Maintenance 25)', () => {
  it('takes Export a backup straight to Export and import, open', async () => {
    const store = await onboarded(3);
    const user = userEvent.setup();
    await renderAt(store, '#/today');
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    expect(screen.getByTestId('coach-headline')).toHaveTextContent('Back up your history');
    await user.click(screen.getByTestId('coach-action'));
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(window.location.hash).toBe('#/settings/backup');
    expect(screen.getByTestId('row-backup')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Export Full Backup JSON' })).toBeVisible();
  });
});

describe('Settings, a row that needs a look', () => {
  it('opens the cloud copy row by itself when the copy failed, and says so closed', async () => {
    const store = await onboarded();
    await renderAt(store, '#/today');
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    act(() => store.noteSetupLinkFailure('Could not reach that database.'));
    act(() => {
      window.location.hash = '#/settings';
    });
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    const row = screen.getByTestId('row-cloud');
    expect(row).toHaveTextContent('Needs a look: open for what happened');
    expect(row).toHaveAttribute('aria-expanded', 'true');
  });

  it('still brings the row a link names into view, not the one that needs a look (Maintenance 25)', async () => {
    const seen: string[] = [];
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: Element) {
        seen.push(this.querySelector('[data-testid^="row-"]')?.getAttribute('data-testid') ?? '');
      },
    });
    try {
      const store = await onboarded();
      await renderAt(store, '#/today');
      await screen.findByRole('heading', { level: 1, name: 'Today' });
      act(() => store.noteSetupLinkFailure('Could not reach that database.'));
      act(() => {
        window.location.hash = '#/settings/schedule';
      });
      await screen.findByRole('heading', { level: 1, name: 'Settings' });
      expect(screen.getByTestId('row-cloud')).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('row-schedule')).toHaveAttribute('aria-expanded', 'true');
      expect(seen).toEqual(['row-schedule']);
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('names on the cloud copy card what the copy never holds: the barcode and your demonstrations', async () => {
    const store = await onboarded();
    // Synthetic picture and code.
    await store.saveBarcode('gym', {
      image: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,U1lOVEhFVElD' },
      code: { format: 'code_128', value: 'SYNTH-0004' },
    });
    const db = await store.getDatabase();
    await db.put('customMedia', { id: 'media-1' });
    await store.hydrate();
    await renderAt(store, '#/settings/cloud');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(screen.getByTestId('row-cloud')).toHaveAttribute('aria-expanded', 'true');
    const card = screen.getByTestId('row-cloud').closest('section') ?? document.body;
    expect(card).toHaveTextContent(
      'Not in the copyGym barcode, with a second copy on this phone · 1 demonstration of your own, in backups you export',
    );
  });

  it('says a barcode with no second copy is kept on the phone once (the tenth review)', async () => {
    const store = await onboarded();
    // A synthetic picture too big for local storage, with no code read from it.
    await store.saveBarcode('gym', {
      image: {
        mimeType: 'image/png',
        dataUrl: `data:image/png;base64,${'A'.repeat(210_000)}`,
      },
    });
    await renderAt(store, '#/settings/cloud');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(screen.getByTestId('row-cloud').closest('section') ?? document.body).toHaveTextContent(
      'Gym barcode, on this phone once (too big for a second copy)',
    );
  });

  it('does not ask for a look while the phone is only offline', async () => {
    const handle = createTestStore({
      cloudClient: async () => createFakeCloud().client,
      isOnline: () => false,
    });
    const { store } = handle;
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    try {
      await store.setCloudToken('test-token');
      await store.flushPendingWork();
      expect(store.getSnapshot().cloud.lastError).toBe(CLOUD_OFFLINE);
      await renderAt(store, '#/settings');
      await screen.findByRole('heading', { level: 1, name: 'Settings' });
      const row = screen.getByTestId('row-cloud');
      expect(row).toHaveTextContent('once online');
      expect(row).not.toHaveTextContent('Needs a look');
      expect(row).toHaveAttribute('aria-expanded', 'false');
    } finally {
      store.stopCloud();
    }
  });

  it('says why a setup link was not used, while the copy goes on to the database it had (the third review)', async () => {
    const handle = createTestStore({
      cloudClient: async () => createFakeCloud().client,
      isOnline: () => false,
    });
    const { store } = handle;
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    try {
      await store.setCloudToken('test-token');
      await store.flushPendingWork();
      // A link to a different database, opened offline: refused, and the store reads its saved
      // state again (as when records arrive from the cloud) and tries a sync after it.
      const refused = await store
        .setCloudCredentials({ token: 'other-token', url: 'libsql://other-db.turso.io' })
        .then(() => null)
        .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
      expect(refused).toBe('Connect to the internet to set up a different database.');
      act(() => store.noteSetupLinkFailure(refused!));
      await store.hydrate();
      await store.syncNow();
      expect(store.getSnapshot().cloud.linkError).toBe(refused);
      await renderAt(store, '#/settings');
      await screen.findByRole('heading', { level: 1, name: 'Settings' });
      const row = screen.getByTestId('row-cloud');
      expect(row).toHaveTextContent('Needs a look: open for what happened');
      expect(row).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('cloud-link-error')).toHaveTextContent(
        'The setup link was not used: Connect to the internet to set up a different database. This device still uses the database above.',
      );
      // A reason with no stop of its own still reads as two sentences (the fourth review).
      act(() => store.noteSetupLinkFailure('Could not reach that database: Failed to fetch'));
      expect(screen.getByTestId('cloud-link-error')).toHaveTextContent(
        'The setup link was not used: Could not reach that database: Failed to fetch. This device still uses the database above.',
      );
      // A token saved again clears it.
      await act(async () => {
        await store.setCloudToken('test-token');
      });
      expect(store.getSnapshot().cloud.linkError).toBeNull();
      expect(screen.queryByTestId('cloud-link-error')).toBeNull();
    } finally {
      store.stopCloud();
    }
  });
});

describe('Plan, the week and where you train', () => {
  it('shows the days with a link to change them in Settings, and no second days editor', async () => {
    const store = await onboarded();
    await renderAt(store, '#/plan');
    await screen.findByRole('heading', { level: 1, name: 'Plan' });
    expect(screen.queryByRole('group', { name: 'Available days' })).not.toBeInTheDocument();
    expect(screen.queryByText('Available days')).not.toBeInTheDocument();
    const days = screen.getByTestId('plan-days');
    expect(days).toHaveTextContent('Mon, Tue, Thu, Fri');
    expect(within(days).getByRole('link', { name: 'Change days ›' })).toHaveAttribute(
      'href',
      '#/settings/schedule',
    );
    expect(screen.getByTestId('week-plan')).toBeInTheDocument();
  });

  it('says the week’s priority muscles in a line and leaves their bars to Progress', async () => {
    const store = await onboarded();
    await renderAt(store, '#/plan');
    await screen.findByRole('heading', { level: 1, name: 'Plan' });
    const priority = screen.getByTestId('weekly-targets');
    expect(priority).toHaveTextContent(/^Priority this week.+ of \d+ sets/);
    expect(
      within(priority).getByRole('link', { name: 'Every muscle on Progress ›' }),
    ).toHaveAttribute('href', '#/progress');
    expect(screen.queryByText('Weekly muscle targets')).not.toBeInTheDocument();
  });
});

describe('Plan, when the week is empty or has no priorities (Maintenance 25)', () => {
  /** A store whose profile is changed before setup, with workouts logged at the given times. */
  async function storeWith(
    change: (profile: UserProfile) => UserProfile,
    workouts: { exerciseId: string; at: string }[] = [],
  ): Promise<AppStore> {
    const handle = createTestStore();
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      change({ ...createDefaultProfile(TEST_NOW), bodyweight: 185 }),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await handle.store.getDatabase();
    for (const [index, workout] of workouts.entries()) {
      await db.put('workouts', {
        ...record(0, workout.exerciseId, [[8, 100, 2]]),
        id: `w-${index}`,
        startedAt: workout.at,
        completedAt: workout.at,
      });
    }
    await handle.store.hydrate();
    return handle.store;
  }

  it('says today’s session is done when the only day set is today, never that no days are set', async () => {
    const now = new Date().toISOString();
    const today = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const)[
      (new Date(now).getUTCDay() + 6) % 7
    ] as UserProfile['schedule']['availableDays'][number];
    const store = await storeWith(
      (profile) => ({
        ...profile,
        schedule: { ...profile.schedule, availableDays: [today], weeklyFrequency: 1 },
      }),
      [{ exerciseId: 'barbell-bench-press', at: now }],
    );
    await renderAt(store, '#/plan');
    await screen.findByRole('heading', { level: 1, name: 'Plan' });
    expect(screen.getByTestId('week-empty')).toHaveTextContent(
      'Today’s session is done. The next one is a week from today.',
    );
    expect(screen.queryByText('No available days set.')).not.toBeInTheDocument();
  });

  it('links every muscle on Progress with no priority muscles too', async () => {
    const store = await storeWith((profile) => ({
      ...profile,
      goals: { ...profile.goals, secondary: 'none' },
    }));
    await renderAt(store, '#/plan');
    await screen.findByRole('heading', { level: 1, name: 'Plan' });
    const block = screen.getByTestId('weekly-targets');
    // Build muscle alone gives no priority muscles: the line is gone, the link stays.
    expect(block).not.toHaveTextContent('Priority this week');
    expect(screen.getByTestId('plan-progress-link')).toHaveAttribute('href', '#/progress');
    expect(block).toContainElement(screen.getByTestId('plan-progress-link'));
  });

  it('lands the link from Settings on the places card, in view', async () => {
    const seen: (string | null)[] = [];
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: Element) {
        seen.push(this.getAttribute('data-testid'));
      },
    });
    try {
      const store = await onboarded();
      await renderAt(store, '#/plan/places');
      await screen.findByRole('heading', { level: 1, name: 'Plan' });
      expect(seen).toEqual(['plan-places']);
      expect(screen.getByTestId('plan-places')).toHaveTextContent('Where you train');
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });
});

describe('Progress, every lift once', () => {
  it('lists each lift once with its trend and its estimated max', async () => {
    const store = await onboarded(3);
    await renderAt(store, '#/progress');
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    expect(screen.queryByText('Best estimates per lift')).not.toBeInTheDocument();
    const rows = screen.getAllByTestId('exercise-progress-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByTestId('lift-estimate')).toHaveTextContent(/^~\d+ lb max$/);
  });

  it('shows the five newest workouts, and every other one a tap away', async () => {
    const store = await onboarded(25);
    const user = userEvent.setup();
    await renderAt(store, '#/progress');
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    expect(screen.getAllByTestId('history-row')).toHaveLength(5);
    const more = screen.getByTestId('history-more');
    expect(more).toHaveTextContent('Show 20 more');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    // All twenty-five, not the twenty the list once stopped at (Maintenance 25).
    expect(screen.getAllByTestId('history-row')).toHaveLength(25);
    expect(more).toHaveAttribute('aria-expanded', 'true');
  });

  it('reads a session on the lift’s own sheet as its row does (Maintenance 25)', async () => {
    const handle = createTestStore();
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await handle.store.getDatabase();
    await db.put('workouts', {
      ...record(2, 'dumbbell-bench-press', [[25, 20, 1]], [20, 25], 1),
      id: 'w-light',
    });
    await handle.store.hydrate();
    const user = userEvent.setup();
    await renderAt(handle.store, '#/progress');
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    const row = screen.getByTestId('exercise-progress-row');
    expect(within(row).getByTestId('lift-estimate')).toHaveTextContent('~37 lb max');
    await user.click(row);
    const sheet = screen.getByRole('dialog', { name: /Dumbbell Bench Press/ });
    // 20 × 25 reads about 37 lb in the session's own line too, not 28.
    expect(within(sheet).getByText('~37')).toBeInTheDocument();
    expect(within(sheet).queryByText('~28')).not.toBeInTheDocument();
  });

  it('lists a lift’s newest eight sessions and every other one a tap away, its best read from all (the third review)', async () => {
    const handle = createTestStore();
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await handle.store.getDatabase();
    for (let at = 0; at < 10; at += 1) {
      // The oldest session is the heaviest: 200 × 8.
      const weight = at === 9 ? 200 : 100;
      const reps = at === 9 ? 8 : 5;
      await db.put('workouts', {
        ...record(2 + at * 2, 'barbell-bench-press', [[reps, weight, 2]]),
        id: `w-bench-${at}`,
      });
    }
    await handle.store.hydrate();
    const user = userEvent.setup();
    await renderAt(handle.store, '#/progress');
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    const row = screen.getByTestId('exercise-progress-row');
    expect(row).toHaveTextContent('10 sessions · best 200 lb × 8');
    await user.click(row);
    const sheet = screen.getByRole('dialog', { name: /Barbell Bench Press/ });
    expect(within(sheet).getByText('200 lb × 8 (~253 lb e1RM)')).toBeInTheDocument();
    expect(within(sheet).getAllByText('~117')).toHaveLength(8);
    const more = within(sheet).getByTestId('lift-sessions-more');
    expect(more).toHaveTextContent('Show 2 more');
    await user.click(more);
    expect(within(sheet).getAllByText('~117')).toHaveLength(9);
    expect(within(sheet).getByText('~253')).toBeInTheDocument();
    expect(more).toHaveTextContent('Show the newest eight');
  });

  it('shows no max for a pull-up with weight added, as the max sheet takes none (the third review)', async () => {
    const handle = createTestStore();
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await handle.store.getDatabase();
    await db.put('workouts', { ...record(2, 'pull-up', [[8, 10, 2]]), id: 'w-pull' });
    await handle.store.hydrate();
    const user = userEvent.setup();
    await renderAt(handle.store, '#/progress');
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    const row = screen.getByTestId('exercise-progress-row');
    expect(row).toHaveTextContent('1 session · best 10 lb × 8');
    expect(within(row).queryByTestId('lift-estimate')).toBeNull();
    await user.click(row);
    const sheet = screen.getByRole('dialog', { name: /Pull-Up/ });
    expect(within(sheet).getByText('10 lb × 8')).toBeInTheDocument();
    expect(within(sheet).queryByText(/e1RM/)).toBeNull();
    expect(within(sheet).queryByText('Trend')).toBeNull();
  });

  it('lists the first twelve lifts and every other one a tap away', async () => {
    const handle = createTestStore();
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await handle.store.getDatabase();
    const lifts = EXERCISES.filter((exercise) => loadClass(exercise.load) !== null).slice(0, 14);
    for (const [index, exercise] of lifts.entries()) {
      await db.put('workouts', {
        ...record(index + 1, exercise.id, [[8, 40, 2]]),
        id: `w-lift-${index}`,
      });
    }
    await handle.store.hydrate();
    const user = userEvent.setup();
    await renderAt(handle.store, '#/progress');
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    expect(screen.getAllByTestId('exercise-progress-row')).toHaveLength(12);
    await user.click(screen.getByTestId('lifts-more'));
    expect(screen.getAllByTestId('exercise-progress-row')).toHaveLength(14);
  });
});
