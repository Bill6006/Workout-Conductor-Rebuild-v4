import { expect, test, type Page } from '@playwright/test';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

const WIDTHS = [360, 375, 412, 430];
const LEVELS = [1, 1.15, 1.3, 1.5];

/**
 * Narrow phones, browser zoom, and text scaling: no horizontal overflow and
 * the controls that matter stay reachable.
 *
 * - Desktop browsers zoom the page: emulated with CSS zoom on the root, which
 *   shrinks the layout viewport the way Chrome's page zoom does.
 * - Android scales text instead (Settings > Display > Font size): emulated by
 *   scaling the root font size, which every rem-based size follows.
 */

/** E2E_WIDE_FONTS=1 swaps in a wide fallback font, close to the Linux runner's DejaVu Sans. */
async function emulateWideFonts(page: Page): Promise<void> {
  if (!process.env.E2E_WIDE_FONTS) return;
  await page.addStyleTag({ content: '* { font-family: Verdana, sans-serif !important; }' });
}

async function setZoom(page: Page, level: number): Promise<void> {
  await emulateWideFonts(page);
  await page.evaluate((value) => {
    (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(value);
  }, level);
}

async function setTextScale(page: Page, level: number): Promise<void> {
  await emulateWideFonts(page);
  await page.evaluate((value) => {
    document.documentElement.style.fontSize = `${value * 100}%`;
  }, level);
}

async function expectTodayFits(page: Page): Promise<void> {
  await expect(page.getByTestId('start-workout')).toBeVisible();
  await expect(page.getByRole('navigation')).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

async function expectWorkoutFits(page: Page): Promise<void> {
  await page.getByTestId('start-workout').click();
  await expect(page.getByTestId('workout-stats')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('skip-warmup').click();
  await expect(page.getByTestId('logger-weight')).toBeVisible();
  await expect(page.getByTestId('log-set')).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

test.describe('widths and zoom', () => {
  test('browser zoom: Today and the active workout fit at every width and level', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'page zoom is a desktop browser feature');
    await ensureProfile(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      for (const level of LEVELS) {
        await page.goto('./');
        await setZoom(page, level);
        await expectTodayFits(page);
      }
    }
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('./');
    await setZoom(page, 1.5);
    await expectWorkoutFits(page);
  });

  test('text scaling: Today and the active workout fit at every width and level', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'android-412', 'one phone project is enough');
    await ensureProfile(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      for (const level of LEVELS) {
        await page.goto('./');
        await setTextScale(page, level);
        await expectTodayFits(page);
      }
    }
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('./');
    await setTextScale(page, 1.5);
    await expectWorkoutFits(page);
  });
});
