import { expect, test, type Page } from '@playwright/test';
import { ensureProfile, skipWarmupIfShown } from './helpers';

/**
 * Maintenance 25, the owner's item 6: an installed app on Android is brought back from the
 * background far more often than it is loaded, and a browser looks for a new service worker only
 * when a page loads. The owner's installed app showed an older build than the deployed site.
 *
 * Two real builds are served on one origin (scripts/pwa-update-server.mjs), A and then B, with
 * Pages' own cache header. The app runs A under its service worker with a profile, a finished
 * workout and a workout under way; B is deployed while the app is in the background, and the app
 * is brought back: it must find B, offer it, and move to it with every saved thing still there.
 */

test.describe.configure({ mode: 'serial' });

const DB_NAME = 'workout-conductor-v4';

function origin(): string {
  return new URL(test.info().project.use.baseURL ?? '').origin;
}

/** Makes a build live on the test server, building it first the first time. */
async function live(page: Page, variant: 'a' | 'b'): Promise<void> {
  const response = await page.request.get(`${origin()}/__variant/${variant}`, { timeout: 180_000 });
  expect(response.ok(), await response.text()).toBe(true);
}

/**
 * Both builds exist before the app loads, and any check the browser made while loading has come
 * back empty, so the only way the app can find B is to look for it itself.
 */
async function prepared(page: Page): Promise<void> {
  await live(page, 'b');
  await live(page, 'a');
}

interface SwFetches {
  lastAt: number;
  now: number;
  failPending: boolean;
}

async function swFetches(page: Page): Promise<SwFetches> {
  return (await (await page.request.get(`${origin()}/__sw`)).json()) as SwFetches;
}

/** No worker script fetched for a while: the checks the browser made as the app loaded are over. */
async function checksSettled(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const { lastAt, now } = await swFetches(page);
        return now - lastAt;
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBeGreaterThan(3_000);
}

/** The app goes to the background and comes back, as switching apps on the phone does. */
async function awayAndBack(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const state of ['hidden', 'visible'] as const) {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
}

/** The app's service worker installed and running: it runs a page only once that page loads. */
async function activated(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('service worker never activated')), 60_000);
        void navigator.serviceWorker.ready.then((registration) => {
          const worker = registration.active;
          if (!worker) return;
          const settle = () => {
            if (worker.state === 'activated') {
              clearTimeout(timer);
              resolve();
            }
          };
          worker.addEventListener('statechange', settle);
          settle();
        });
      }),
  );
}

/**
 * The app under its worker, as an installed app runs, and the browser's own check after that
 * reload come and gone: with it done, a new release can only be found by the app looking.
 */
async function controlled(page: Page): Promise<void> {
  await activated(page);
  const before = (await swFetches(page)).lastAt;
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  // The browser looks for a new worker after the load: wait for that look, then for quiet.
  await expect
    .poll(async () => (await swFetches(page)).lastAt, { timeout: 15_000, intervals: [250] })
    .toBeGreaterThan(before);
  await checksSettled(page);
}

/**
 * B is deployed while the app sits in the background, and nothing is loaded again: the page does
 * not find it by itself (without this, a late check by the browser could stand in for the app's).
 */
async function deployedWhileAway(page: Page): Promise<void> {
  await live(page, 'b');
  await page.waitForTimeout(5_000);
  await expect(page.getByTestId('update-prompt')).toBeHidden();
}

/** A finished workout in the app's own store: history the update must not touch. */
async function seedWorkout(page: Page): Promise<void> {
  await page.evaluate(async (name) => {
    const when = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['workouts'], 'readwrite');
      tx.objectStore('workouts').put({
        id: 'w-e2e-before-update',
        startedAt: when,
        completedAt: when,
        locationId: 'gym',
        templateId: 'push-arms',
        entries: [
          {
            exerciseId: 'barbell-bench-press',
            sets: [
              {
                kind: 'working',
                reps: 6,
                weight: 155,
                rir: 2,
                completed: true,
                targetReps: [4, 6],
              },
            ],
          },
        ],
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, DB_NAME);
}

/** A workout under way: started, one set logged, its rest running. */
async function workoutUnderWay(page: Page): Promise<void> {
  await page.goto('./#/today');
  await page.getByTestId('start-workout').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
  await skipWarmupIfShown(page);
  await page.getByTestId('log-set').click();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
}

async function buildShown(page: Page): Promise<string> {
  await page.goto('./#/settings/about');
  const marker = page.getByTestId('build-marker');
  await expect(marker).toBeVisible();
  return (await marker.textContent()) ?? '';
}

/** A release waits to take over; null with no registration at all, which no check expects. */
async function waitingNow(page: Page): Promise<boolean | null> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration ? registration.waiting !== null : null;
  });
}

/** Reload on the offer, and the page loaded again. */
async function reloadOnOffer(page: Page): Promise<void> {
  const reloaded = page.waitForEvent('load', { timeout: 30_000 });
  await page.getByTestId('update-prompt').getByRole('button', { name: 'Reload' }).click();
  await reloaded;
}

test.describe('an installed app and a new release', () => {
  test.skip(Boolean(process.env.E2E_BASE_URL), 'a deployed site cannot be switched to a new build');

  test('brought back from the background, it finds the new release, offers it, and moves to it with everything kept', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await prepared(page);
    await ensureProfile(page);
    await seedWorkout(page);
    await workoutUnderWay(page);
    const logged = await page.locator('[data-testid="set-row"][data-state="done"]').count();
    await controlled(page);
    expect(await buildShown(page)).toMatch(/^Build aaaaaaa · /);

    await deployedWhileAway(page);
    await awayAndBack(page);
    const prompt = page.getByTestId('update-prompt');
    await expect(prompt).toContainText('New version available', { timeout: 60_000 });
    // During a workout it says what a reload keeps.
    await expect(prompt).toContainText('Logged sets and timers are kept on this device');

    await reloadOnOffer(page);
    expect(await buildShown(page)).toMatch(/^Build bbbbbbb · /);

    // Everything saved before the update is still there: the profile, the history, and the
    // workout under way with its set and its rest.
    await page.goto('./#/settings');
    await expect(page.getByTestId('row-goals')).toContainText('Build muscle');
    await page.goto('./#/progress');
    await expect(page.getByRole('heading', { level: 2, name: '1 workout logged' })).toBeVisible();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await page.goto('./#/workout');
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    await expect(page.locator('[data-testid="set-row"][data-state="done"]')).toHaveCount(logged);
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await live(page, 'a');
  });

  test('a release put off with Later is offered again the next time the app comes back', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await prepared(page);
    await ensureProfile(page);
    await controlled(page);
    expect(await buildShown(page)).toMatch(/^Build aaaaaaa · /);

    await deployedWhileAway(page);
    await awayAndBack(page);
    const prompt = page.getByTestId('update-prompt');
    await expect(prompt).toContainText('New version available', { timeout: 60_000 });
    // Every offer of B is in (the app's own and the plugin's, a moment apart) before Later.
    await page.waitForTimeout(1_000);
    await prompt.getByRole('button', { name: 'Later' }).click();
    await expect(prompt).toBeHidden();
    // Put off, it stays put off while the app stays in front.
    await page.waitForTimeout(1_000);
    await expect(prompt).toBeHidden();
    // Still on A until the lifter says so: nothing takes over silently.
    expect(await buildShown(page)).toMatch(/^Build aaaaaaa · /);

    await awayAndBack(page);
    await expect(prompt).toContainText('New version available', { timeout: 30_000 });
    await reloadOnOffer(page);
    expect(await buildShown(page)).toMatch(/^Build bbbbbbb · /);
    await live(page, 'a');
  });

  test('brought back long after it opened, with the first try at the release failed, it still offers the release and Reload lands on it, on this page and on one left behind', async ({
    page,
  }) => {
    // An installed app comes back minutes or hours after it opened. The plugin takes a worker
    // found a minute or more after the page registered for another page's and stops listening,
    // and an install can fail midway: a worker found again after that is one the plugin never
    // offers, and its Reload would not load the page.
    test.setTimeout(300_000);
    await prepared(page);
    await ensureProfile(page);
    await controlled(page);
    // The app open twice, as a browser tab beside the installed app, both open long before B.
    const other = await page.context().newPage();
    const before = (await swFetches(page)).lastAt;
    await other.goto('./#/today');
    await expect(other.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect
      .poll(() => other.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    // The browser's own look after the second page loads, then quiet.
    await expect
      .poll(async () => (await swFetches(page)).lastAt, { timeout: 15_000, intervals: [250] })
      .toBeGreaterThan(before);
    await checksSettled(page);
    expect(await buildShown(page)).toMatch(/^Build aaaaaaa · /);
    await page.waitForTimeout(62_000);

    // The first look finds B, and B's install fails on the way.
    await page.request.get(`${origin()}/__fail-install`);
    await deployedWhileAway(page);
    await awayAndBack(page);
    await expect
      .poll(async () => (await swFetches(page)).failPending, { timeout: 30_000 })
      .toBe(false);
    // The failure cut the install short: nothing waits, and nothing is offered.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            return registration?.installing === null && registration.waiting === null;
          }),
        { timeout: 30_000 },
      )
      .toBe(true);
    const prompt = page.getByTestId('update-prompt');
    const otherPrompt = other.getByTestId('update-prompt');
    await expect(prompt).toBeHidden();
    await expect(otherPrompt).toBeHidden();

    // The next look installs B: the plugin no longer listens, and the app offers it as soon as it
    // waits.
    await checksSettled(page);
    await awayAndBack(page);
    await expect(prompt).toContainText('New version available', { timeout: 60_000 });
    await prompt.getByRole('button', { name: 'Later' }).click();
    await expect(prompt).toBeHidden();

    // Put off, it is offered again from the worker waiting.
    await awayAndBack(page);
    await expect(prompt).toContainText('New version available', { timeout: 30_000 });
    await prompt.getByRole('button', { name: 'Later' }).click();
    await expect(prompt).toBeHidden();

    // Reload on the other page ends on B, though its plugin never saw B either.
    await expect(otherPrompt).toContainText('New version available', { timeout: 30_000 });
    await reloadOnOffer(other);
    expect(await buildShown(other)).toMatch(/^Build bbbbbbb · /);

    // This page is left on A under B's worker: it is offered B at once, and, put off, again when
    // it comes back, though nothing waits now; and Reload ends on B (the third review).
    await expect(prompt).toContainText('New version available', { timeout: 30_000 });
    await prompt.getByRole('button', { name: 'Later' }).click();
    await expect(prompt).toBeHidden();
    expect(await waitingNow(page)).toBe(false);
    await awayAndBack(page);
    await expect(prompt).toContainText('New version available', { timeout: 30_000 });
    await reloadOnOffer(page);
    expect(await buildShown(page)).toMatch(/^Build bbbbbbb · /);
    await live(page, 'a');
  });

  test('on a first visit, before any worker runs the page, a release that takes over at once is offered, again after Later, and Reload lands on it', async ({
    page,
  }) => {
    // A page opened for the first time runs with no worker until it loads again, so a release found
    // then takes over at once, with no page under it: nothing waits, though the page is still A
    // (the third review).
    test.setTimeout(300_000);
    await prepared(page);
    await ensureProfile(page);
    await activated(page);
    await checksSettled(page);
    expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
    expect(await buildShown(page)).toMatch(/^Build aaaaaaa · /);

    await deployedWhileAway(page);
    await awayAndBack(page);
    const prompt = page.getByTestId('update-prompt');
    await expect(prompt).toContainText('New version available', { timeout: 60_000 });
    await page.waitForTimeout(1_000);
    await prompt.getByRole('button', { name: 'Later' }).click();
    await expect(prompt).toBeHidden();
    // B runs the service worker already; nothing waits.
    await expect.poll(() => waitingNow(page)).toBe(false);
    expect(await buildShown(page)).toMatch(/^Build aaaaaaa · /);

    await awayAndBack(page);
    await expect(prompt).toContainText('New version available', { timeout: 30_000 });
    await reloadOnOffer(page);
    expect(await buildShown(page)).toMatch(/^Build bbbbbbb · /);
    await live(page, 'a');
  });
});
