import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { TABS, ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Browser smoke test for the app shell. Runs against the production build
 * served under the GitHub Pages subpath (see playwright.config.ts).
 */

test.describe('app shell', () => {
  test('renders the brand, and the phase and build under Settings, About', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByText('Workout Conductor', { exact: true })).toBeVisible();
    await expect(page.getByText('Adaptive Strength + Hypertrophy')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // Maintenance 25: developer facts out of every screen's first lines, into Settings, About.
    await expect(page.getByTestId('phase-chip')).toHaveCount(0);
    await ensureProfile(page);
    await page.goto('./#/settings/about');
    await expect(page.getByTestId('row-about')).toContainText(/Phase 8 · awaiting Android review/);
    await expect(page.getByTestId('build-marker')).toHaveText(
      /^Build \S+ · \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC · Phase 8$/,
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

  test('the app icon shows in the header, the tab, the home screen and the manifest', async ({
    page,
  }) => {
    await ensureProfile(page);
    // Each image decodes at its own size: a file that fails to decode, like the SVG wrapper whose
    // embedded artwork was cut short (2026-10-22), has no natural size and shows a broken image.
    const decoded = (src: string) =>
      page.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        try {
          await image.decode();
        } catch {
          return null;
        }
        return [image.naturalWidth, image.naturalHeight];
      }, src);
    const logo = page.locator('header img').first();
    await expect(logo).toBeVisible();
    await expect
      .poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
      .toBe(192);
    // The tab's icons and the home screen's on iOS.
    const links = await page
      .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
      .evaluateAll((items) =>
        items.map((item) => [item.getAttribute('href'), item.getAttribute('sizes')] as const),
      );
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const [href, sizes] of links) {
      const size = await decoded(new URL(href ?? '', page.url()).toString());
      expect(size, `${href} should decode`).not.toBeNull();
      if (sizes) expect(size!.join('x'), `${href} at its size`).toBe(sizes);
    }
    // Android's launcher icons, from the manifest.
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifestUrl = new URL(manifestHref ?? '', page.url());
    const manifest = (await page.evaluate(
      (url) => fetch(url).then((response) => response.json()),
      manifestUrl.toString(),
    )) as { icons: { src: string; sizes: string; purpose?: string }[] };
    for (const icon of manifest.icons) {
      const size = await decoded(new URL(icon.src, manifestUrl).toString());
      expect(size?.join('x'), `${icon.src} should decode at its size`).toBe(icon.sizes);
    }

    // The launcher's icon (2026-10-24, sized on the owner's phone): dark (luminance 100 at most)
    // and opaque to every edge, and the angled dumbbell's farthest end at 84 to 92% of the maskable
    // standard's safe circle (radius 40% of the width), which every launcher that follows it leaves
    // whole; that fills the owner's tile like the apps beside it. The header's logo is cut closer,
    // the ends at 1.16 of that radius. The dumbbell is its bright metal and bright green where most
    // of the pixels around are bright too, which the artwork's textured surface, bright only in
    // specks, never is.
    const geometry = (src: string) =>
      page.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const size = image.naturalWidth;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, size, size).data;
        const luminance = (x: number, y: number) => {
          const at = (y * size + x) * 4;
          return 0.2126 * data[at] + 0.7152 * data[at + 1] + 0.0722 * data[at + 2];
        };
        let edgesDark = true;
        for (let along = 0; along < size; along += 1) {
          for (const [x, y] of [
            [along, 0],
            [along, size - 1],
            [0, along],
            [size - 1, along],
          ]) {
            if (data[(y * size + x) * 4 + 3] !== 255 || luminance(x, y) > 100) edgesDark = false;
          }
        }
        const bright = (x: number, y: number) => {
          const at = (y * size + x) * 4;
          const [r, g, b] = [data[at], data[at + 1], data[at + 2]];
          return luminance(x, y) > 180 || (g > 200 && g > r + 60 && g > b + 100);
        };
        const centre = (size - 1) / 2;
        let farthest = 0;
        for (let y = 1; y < size - 1; y += 1) {
          for (let x = 1; x < size - 1; x += 1) {
            if (!bright(x, y)) continue;
            let around = 0;
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) if (bright(x + dx, y + dy)) around += 1;
            }
            if (around >= 5) farthest = Math.max(farthest, Math.hypot(x - centre, y - centre));
          }
        }
        return { edgesDark, reach: farthest / (0.4 * size) };
      }, src);
    const maskable = manifest.icons.find((icon) => icon.purpose === 'maskable');
    expect(maskable, 'the manifest names a maskable icon').toBeDefined();
    const launcher = await geometry(new URL(maskable!.src, manifestUrl).toString());
    expect(launcher.edgesDark, 'the launcher icon is dark to its edge').toBe(true);
    expect(launcher.reach).toBeGreaterThanOrEqual(0.84);
    expect(launcher.reach).toBeLessThanOrEqual(0.92);
    const header = await geometry(
      new URL((await logo.getAttribute('src')) ?? '', page.url()).toString(),
    );
    expect(header.edgesDark, 'the header logo is dark to its edge').toBe(true);
    expect(header.reach).toBeGreaterThanOrEqual(1.1);
    expect(header.reach).toBeLessThanOrEqual(1.22);
  });

  test('PWA manifest, icons, and service worker are served', async ({ page, request }) => {
    await page.goto('./');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifestUrl = new URL(manifestHref ?? '', page.url());
    const manifestResponse = await request.get(manifestUrl.toString());
    expect(manifestResponse.ok()).toBe(true);

    const manifest = (await manifestResponse.json()) as {
      id: string;
      name: string;
      display: string;
      start_url: string;
      scope: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest.name).toBe('Workout Conductor');
    expect(manifest.display).toBe('standalone');
    // The installed app's identity: its id, start and scope are all the app's own address.
    const appPath = new URL(page.url()).pathname;
    expect(new URL(manifest.id, manifestUrl).pathname).toBe(appPath);
    expect(new URL(manifest.start_url, manifestUrl).pathname).toBe(appPath);
    expect(new URL(manifest.scope, manifestUrl).pathname).toBe(appPath);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons) {
      const iconResponse = await request.get(new URL(icon.src, manifestUrl).toString());
      expect(iconResponse.ok(), `icon ${icon.src} should be served`).toBe(true);
      // Its address ends with its content's hash, so a changed icon has a new address.
      const version = createHash('sha256')
        .update(await iconResponse.body())
        .digest('hex')
        .slice(0, 8);
      expect(icon.src, `${icon.src} is named by its content`).toMatch(
        new RegExp(`\\?v=${version}$`),
      );
    }

    const serviceWorker = await request.get(new URL('sw.js', page.url()).toString());
    expect(serviceWorker.ok()).toBe(true);
    expect(await serviceWorker.text()).toContain('precache');
  });
});

/**
 * Installing from the app's own page (2026-10-24, Life Mirror's fix of 2026-10-03). On a phone
 * where another app of bill6006.github.io is installed, Chrome's menu says this one is installed
 * too, and cannot open it; the browser's own offer, held from start-up, installs it. A test
 * browser makes no offer, so one is stood in for, as the browser makes it: on the window, at any
 * moment, whatever screen is open.
 */

interface Recorded {
  installPrompts?: number;
  installOffer?: Event;
}

/** The browser offers to install the app; each prompt() it is asked for is counted. */
async function browserOffers(page: Page, outcome: 'accepted' | 'dismissed'): Promise<void> {
  await page.evaluate((answer) => {
    const record = window as unknown as Recorded;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperty(event, 'prompt', {
      value: async () => {
        record.installPrompts = (record.installPrompts ?? 0) + 1;
      },
    });
    Object.defineProperty(event, 'userChoice', {
      value: Promise.resolve({ outcome: answer, platform: 'web' }),
    });
    record.installOffer = event;
    window.dispatchEvent(event);
  }, outcome);
}

const promptsAsked = (page: Page) =>
  page.evaluate(() => (window as unknown as Recorded).installPrompts ?? 0);

async function openSettings(page: Page): Promise<void> {
  // By the bottom bar, as a lifter goes: the page the offer came to stays loaded.
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
}

test.describe('Install the app', () => {
  test('is not in Settings while the browser makes no offer', async ({ page }) => {
    await ensureProfile(page);
    await openSettings(page);
    await expect(page.getByTestId('settings-training')).toBeVisible();
    await expect(page.getByTestId('install-card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Install the app' })).toHaveCount(0);
  });

  test('an offer made on Today is held, shown at the top of Settings, and a tap asks the browser once', async ({
    page,
  }) => {
    await ensureProfile(page);
    await browserOffers(page, 'accepted');
    // Held from start-up: the browser's own prompt is held back for the app's button.
    expect(
      await page.evaluate(() => (window as unknown as Recorded).installOffer?.defaultPrevented),
    ).toBe(true);
    await openSettings(page);
    const card = page.getByTestId('install-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('without Chrome’s address bar');
    // At the top, above the first group of rows.
    const cardBox = await card.boundingBox();
    const groupBox = await page.getByTestId('settings-training').boundingBox();
    expect(cardBox && groupBox && cardBox.y + cardBox.height <= groupBox.y).toBe(true);
    await expectNoHorizontalOverflow(page);

    await card.getByRole('button', { name: 'Install the app' }).click();
    await expect(card).toHaveCount(0);
    expect(await promptsAsked(page)).toBe(1);
  });

  test('a dismissed dialog clears the offer; a new offer brings it back; installing clears it for good', async ({
    page,
  }) => {
    await ensureProfile(page);
    await openSettings(page);
    await browserOffers(page, 'dismissed');
    const card = page.getByTestId('install-card');
    await card.getByRole('button', { name: 'Install the app' }).click();
    await expect(card).toHaveCount(0);
    expect(await promptsAsked(page)).toBe(1);

    await browserOffers(page, 'accepted');
    await expect(card).toBeVisible();
    // Installed another way, from the browser's menu or its banner.
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(card).toHaveCount(0);
    expect(await promptsAsked(page)).toBe(1);
  });
});
