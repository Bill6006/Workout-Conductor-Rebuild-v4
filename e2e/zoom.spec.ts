import { expect, test } from '@playwright/test';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

const WIDTHS = [360, 375, 412, 430];
const ZOOMS = [1, 1.15, 1.3, 1.5];

/**
 * Narrow phones and browser zoom: no horizontal overflow and the controls that
 * matter stay reachable at every width and zoom level. Browser zoom is
 * emulated with CSS zoom on the root element, which changes layout the same
 * way Chrome's page zoom does.
 */
test.describe('widths and zoom', () => {
  test('Today and the active workout fit at every width and zoom level', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'android-412', 'one project is enough for layout');
    await ensureProfile(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      for (const zoom of ZOOMS) {
        await page.goto('./');
        await page.evaluate((level) => {
          (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom =
            String(level);
        }, zoom);
        await expect(page.getByTestId('start-workout')).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await expect(page.getByRole('navigation')).toBeVisible();
      }
    }
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('./');
    await page.evaluate(() => {
      (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = '1.5';
    });
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByTestId('skip-warmup').click();
    await expect(page.getByTestId('logger-weight')).toBeVisible();
    await expect(page.getByTestId('log-set')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
