import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { TABS, ensureProfile } from './helpers';

/**
 * Real screenshots of the working application, used as phase evidence.
 * Output folder comes from SCREENSHOT_DIR (see scripts/screenshots.mjs).
 */

const screenshotDir = process.env.SCREENSHOT_DIR ?? path.join('test-results', 'screenshots');

async function capture(page: Page, testInfo: TestInfo, name: string, fullPage = false) {
  mkdirSync(screenshotDir, { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`),
    fullPage,
  });
}

test.describe('screenshots @screenshots', () => {
  test('onboarding steps', async ({ page }, testInfo) => {
    await page.goto('./');
    await expect(
      page.getByRole('heading', { level: 1, name: 'What are you training for?' }),
    ).toBeVisible();
    await capture(page, testInfo, 'onboarding-1-goals');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'How often, and how long?' }),
    ).toBeVisible();
    await capture(page, testInfo, 'onboarding-2-schedule');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Where do you train?' }),
    ).toBeVisible();
    await capture(page, testInfo, 'onboarding-3-places');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Anything to work around?' }),
    ).toBeVisible();
    await capture(page, testInfo, 'onboarding-5-limitations');
  });

  test('main tabs', async ({ page }, testInfo) => {
    await ensureProfile(page);
    for (const tab of TABS) {
      await page.goto(`./#/${tab.id}`);
      await expect(page.getByRole('heading', { level: 1, name: tab.label })).toBeVisible();
      await capture(page, testInfo, tab.id);
    }
    await page.goto('./#/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await capture(page, testInfo, 'today-full', true);
  });

  test('sheets', async ({ page }, testInfo) => {
    await ensureProfile(page);
    await page.goto('./#/plan');
    await page.getByRole('button', { name: 'Add a place' }).click();
    await expect(page.getByRole('dialog', { name: 'Add a place' })).toBeVisible();
    await capture(page, testInfo, 'plan-add-place');
    await page.keyboard.press('Escape');

    await page.goto('./#/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Full Backup JSON' }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    await page.getByTestId('import-file-input').setInputFiles(filePath ?? '');
    await expect(page.getByRole('dialog', { name: 'Restore this backup?' })).toBeVisible();
    await capture(page, testInfo, 'settings-import-preview');
  });
});
