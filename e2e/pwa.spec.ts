import { expect, test } from '@playwright/test';
import { ensureProfile } from './helpers';

/**
 * PWA behaviour of the app shell, run serially in its own project so that a
 * single service worker owns the origin during the test.
 */

test.describe.configure({ mode: 'serial' });

test.describe('PWA shell', () => {
  test('service worker installs, controls the page after reload, and serves the shell offline', async ({
    page,
    context,
  }) => {
    await ensureProfile(page);

    // Wait for full activation (not just "activating"): only an activated worker
    // controls pages loaded afterwards, and activation implies the precache
    // finished installing. page.evaluate awaits the returned promise.
    const state = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('service worker never activated')),
            20_000,
          );
          navigator.serviceWorker.ready
            .then((registration) => {
              const worker = registration.active;
              if (!worker) {
                reject(new Error('no active worker'));
                return;
              }
              const settle = () => {
                if (worker.state === 'activated') {
                  clearTimeout(timer);
                  resolve(worker.state);
                }
              };
              worker.addEventListener('statechange', settle);
              settle();
            })
            .catch(reject);
        }),
    );
    expect(state).toBe('activated');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    // The build and the storage facts are under Settings, About (Maintenance 25).
    await page.goto('./#/settings/about');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page.getByTestId('build-marker')).toBeVisible();
    // Durable data is still there offline: the profile came from IndexedDB, not the network.
    await expect(page.getByText('IndexedDB ready')).toBeVisible();
    await context.setOffline(false);
  });

  // Maintenance 25, item 7: every exercise's still installs with the app; a clip is kept the first
  // time it plays, and plays offline after that. One never played shows its still and says why.
  test('keeps a How to clip once it has played, and shows the still offline before that', async ({
    page,
    context,
  }) => {
    await ensureProfile(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    const cards = page.getByTestId('exercise-card');
    await cards.first().getByTestId('howto-button').click();
    const sheet = page.getByRole('dialog', { name: /^How to: / });
    await expect(sheet.locator('video[data-testid="exercise-demo"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () => (await (await caches.open('exercise-clips')).keys()).length),
      )
      .toBeGreaterThan(0);
    // The stills came with the install.
    const stills = await page.evaluate(async () => {
      const names = await caches.keys();
      let count = 0;
      for (const name of names) {
        const keys = await (await caches.open(name)).keys();
        count += keys.filter((request) => /\/media\/exercises\/.+\.webp/.test(request.url)).length;
      }
      return count;
    });
    expect(stills).toBe(72);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    // Playwright's offline emulation does not carry navigator.onLine through a reload (requests
    // still fail, the flag reads online): set it again, so the page reads offline as a phone does.
    await context.setOffline(false);
    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    // Played once, it plays offline.
    await cards.first().getByTestId('howto-button').click();
    await expect(sheet.locator('video[data-testid="exercise-demo"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    // Never played (an exercise opened for the first time, in the Library): its still, and the
    // note that the video plays once online.
    await page.goto('./#/settings');
    await page.getByTestId('library-link').click();
    await page.getByRole('searchbox', { name: 'Search exercises' }).fill('goblet');
    await page.getByTestId('library-row').first().click();
    const detail = page.getByRole('dialog', { name: 'Goblet Squat' });
    const still = detail.locator('img[data-testid="exercise-demo"]');
    await expect(still).toBeVisible();
    await expect(still).toHaveAttribute('data-still', 'poster');
    await expect
      .poll(() => still.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
    await expect(detail.getByTestId('demo-status')).toHaveText(
      'Shown as a still: the video plays here once you are online.',
    );
    await context.setOffline(false);
  });

  // The phone review: the card's demonstration loops in the installed app too, from the clip the
  // service worker kept, offline as well.
  test("loops the card's clip from the clip the app kept, offline too", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await ensureProfile(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    const clip = page
      .getByTestId('exercise-card')
      .first()
      .locator('video[data-testid="exercise-thumb"]');
    await expect(clip).toBeVisible({ timeout: 10_000 });
    // Kept by the service worker the first time it played.
    await expect
      .poll(() =>
        page.evaluate(async () => (await (await caches.open('exercise-clips')).keys()).length),
      )
      .toBeGreaterThan(0);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    // As above: offline again after the reload, so the page reads offline as a phone does.
    await context.setOffline(false);
    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await expect(clip).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() => clip.evaluate((element: HTMLVideoElement) => element.duration || 0), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
    const duration = await clip.evaluate((element: HTMLVideoElement) => element.duration);
    const starts = Math.max(2, Math.ceil(9 / duration));
    await clip.evaluate((element: HTMLVideoElement) => {
      const seen = { starts: 0, last: element.currentTime };
      Object.assign(window, { cardLoop: seen });
      element.addEventListener('timeupdate', () => {
        if (element.currentTime + 0.05 < seen.last) seen.starts += 1;
        seen.last = element.currentTime;
      });
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { cardLoop: { starts: number } }).cardLoop.starts,
          ),
        { timeout: (starts * duration + 15) * 1000 },
      )
      .toBeGreaterThanOrEqual(starts);
    await context.setOffline(false);
  });

  test('the manifest advertises an installable standalone app', async ({ page }) => {
    await page.goto('./');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = (await (
      await page.request.get(new URL(manifestHref ?? '', page.url()).toString())
    ).json()) as { display: string; icons: { sizes: string }[]; theme_color: string };
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
    expect(manifest.theme_color).toBe('#0e1012');
  });
});
