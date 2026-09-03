import { expect, test } from '@playwright/test';
import { TABS, ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Browser smoke test for the app shell. Runs against the production build
 * served under the GitHub Pages subpath (see playwright.config.ts).
 */

test.describe('app shell', () => {
  test('renders brand, current phase, and a visible build marker', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByText('Workout Conductor', { exact: true })).toBeVisible();
    await expect(page.getByText('Adaptive Strength + Hypertrophy')).toBeVisible();
    await expect(page.getByTestId('phase-chip')).toHaveText(/Phase 5/);
    await expect(page.getByTestId('build-marker')).toHaveText(
      /^Build \S+ · \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC · Phase 5$/,
    );
    await expectNoHorizontalOverflow(page);
  });

  test('bottom navigation reaches all five screens', async ({ page }) => {
    await ensureProfile(page);
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link')).toHaveCount(5);

    for (const tab of TABS) {
      await nav.getByRole('link', { name: tab.label }).click();
      await expect(page).toHaveURL(new RegExp(`#/${tab.id}$`));
      await expect(page.getByRole('heading', { level: 1, name: tab.label })).toBeVisible();
      await expect(nav.getByRole('link', { name: tab.label })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expectNoHorizontalOverflow(page);
    }
  });

  test('a deep link opens the requested screen after reload', async ({ page }) => {
    await ensureProfile(page);
    await page.goto('./#/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
  });

  test('bottom navigation stays within thumb reach at the bottom of the viewport', async ({
    page,
  }) => {
    await ensureProfile(page);
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const box = await nav.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
      expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 2);
      expect(box.height).toBeLessThanOrEqual(110);
    }
  });

  test('PWA manifest, icons, and service worker are served', async ({ page, request }) => {
    await page.goto('./');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifestUrl = new URL(manifestHref ?? '', page.url());
    const manifestResponse = await request.get(manifestUrl.toString());
    expect(manifestResponse.ok()).toBe(true);

    const manifest = (await manifestResponse.json()) as {
      name: string;
      display: string;
      start_url: string;
      scope: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest.name).toBe('Workout Conductor');
    expect(manifest.display).toBe('standalone');
    expect(new URL(manifest.start_url, manifestUrl).pathname).toBe(new URL(page.url()).pathname);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons) {
      const iconResponse = await request.get(new URL(icon.src, manifestUrl).toString());
      expect(iconResponse.ok(), `icon ${icon.src} should be served`).toBe(true);
    }

    const serviceWorker = await request.get(new URL('sw.js', page.url()).toString());
    expect(serviceWorker.ok()).toBe(true);
    expect(await serviceWorker.text()).toContain('precache');
  });
});
