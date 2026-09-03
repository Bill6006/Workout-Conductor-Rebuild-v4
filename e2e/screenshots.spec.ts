import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { TABS, ensureProfile } from './helpers';

/**
 * Real screenshots of the working application, used as phase evidence.
 * Output folder comes from SCREENSHOT_DIR (see scripts/screenshots.mjs).
 *
 * The five tabs are captured on every device project; onboarding steps, sheets,
 * and the full-page Today capture come from the primary Android project only,
 * which keeps the committed evidence set small.
 */

const screenshotDir = process.env.SCREENSHOT_DIR ?? path.join('test-results', 'screenshots');
const PRIMARY_PROJECT = 'android-412';

async function settleToasts(page: Page) {
  // Only the toast region; the recalibration summary is a status too and may stay.
  await expect(page.locator('[role="status"][aria-live="polite"] > *')).toHaveCount(0, {
    timeout: 8_000,
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string, fullPage = false) {
  mkdirSync(screenshotDir, { recursive: true });
  await page.waitForLoadState('networkidle');
  await settleToasts(page);
  if (fullPage) {
    // Fixed elements would repeat mid-page in a full-page capture.
    await page.addStyleTag({ content: 'nav[aria-label="Primary"] { display: none !important; }' });
  }
  await page.screenshot({
    path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`),
    fullPage,
  });
}

test.describe('screenshots @screenshots', () => {
  test('onboarding steps', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PRIMARY_PROJECT, 'primary project only');
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
    if (testInfo.project.name === PRIMARY_PROJECT) {
      await page.goto('./#/today');
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
      await capture(page, testInfo, 'today-full', true);
      await page.getByTestId('duration-select').selectOption('15');
      await expect(page.getByTestId('workout-estimate')).toContainText('Fitted to 15 min');
      await capture(page, testInfo, 'today-15-min');
      await page.getByTestId('duration-select').selectOption('default');
      await expect(page.getByTestId('workout-estimate')).toContainText('Default time');

      // Phase 4: the calibration overlay (held open by ?slowCalibration=1), the change summary,
      // the session-only actions, and the recalibration log.
      await page.goto('./?slowCalibration=1#/today');
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
      await page.getByTestId('duration-select').selectOption('30');
      const overlay = page.getByTestId('calibration-overlay');
      await expect(overlay).toBeVisible();
      await page.screenshot({
        path: path.join(screenshotDir, `${testInfo.project.name}-calibration-overlay.png`),
      });
      await expect(overlay).toBeHidden({ timeout: 10_000 });
      await expect(page.getByTestId('recalibration-summary')).toBeVisible();
      await capture(page, testInfo, 'today-recalibrated');

      await page.getByTestId('workout-entry').nth(1).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page
        .getByRole('dialog')
        .getByRole('heading', { name: 'This session only' })
        .scrollIntoViewIfNeeded();
      await capture(page, testInfo, 'today-session-actions');
      await page.getByRole('button', { name: 'Equipment busy' }).click();
      await expect(page.getByTestId('recalibration-summary')).toContainText('busy');
      await page.goto('./#/workout');
      await expect(page.getByTestId('calibration-log')).toBeVisible();
      await capture(page, testInfo, 'workout-recalibration-log');
    }
  });

  test('sheets', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PRIMARY_PROJECT, 'primary project only');
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
  test('library and exercise detail', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PRIMARY_PROJECT, 'primary project only');
    await ensureProfile(page);
    await page.goto('./#/library');
    await expect(page.getByRole('heading', { level: 1, name: 'Exercise library' })).toBeVisible();
    await capture(page, testInfo, 'library');
    await page.getByRole('searchbox', { name: 'Search exercises' }).fill('incline dumbbell press');
    await page.getByTestId('library-row').first().click();
    await expect(page.getByRole('dialog', { name: 'Incline Dumbbell Press' })).toBeVisible();
    await capture(page, testInfo, 'exercise-detail');
    await page.keyboard.press('Escape');

    await page.goto('./#/today');
    await page.getByTestId('workout-entry').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('heading', { name: /Alternatives/ })
      .scrollIntoViewIfNeeded();
    await capture(page, testInfo, 'today-alternatives');
  });
});
