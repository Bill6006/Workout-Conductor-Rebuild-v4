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
    await page.goto('./#/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page.getByTestId('build-marker')).toBeVisible();
    // Durable data is still there offline: the profile came from IndexedDB, not the network.
    await expect(page.getByText('IndexedDB ready')).toBeVisible();
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
