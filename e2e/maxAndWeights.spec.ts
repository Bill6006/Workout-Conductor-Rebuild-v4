import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile } from './helpers';

/**
 * A max can be entered or updated on any lift from Options, and the weights
 * editor says what each box is: lightest, heaviest, and the jump.
 */

const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
}

async function enterMaxFromOptions(page: Page): Promise<void> {
  await page.getByTestId('options-tab').first().click();
  await expect(page.getByTestId('max-line')).toContainText('None entered');
  await page.getByTestId('edit-max').click();
  const sheet = page.getByRole('dialog', { name: /Your max for Barbell Bench Press/ });
  await expect(sheet).toBeVisible();
  // Opened from Options there is nothing to snooze: Cancel, and Save.
  await expect(sheet.getByTestId('max-not-now')).toHaveCount(0);
  await expect(sheet.getByTestId('max-never')).toHaveCount(0);
  await expect(sheet.getByTestId('max-cancel')).toBeVisible();
  await sheet.getByTestId('max-weight').fill('185');
  await sheet.getByTestId('max-reps').fill('5');
  await sheet.getByTestId('max-save').click();
  await settle(page);
}

test.describe('a max on any lift, and the weights editor', () => {
  test('Options has Your max: it opens the sheet, saves, and shows what is saved', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    await enterMaxFromOptions(page);
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      'First target for Barbell Bench Press set from your max.',
    );
    await page.getByTestId('options-tab').first().click();
    const line = page.getByTestId('max-line');
    await expect(line).toContainText('216 lb, entered');
    await expect(page.getByTestId('edit-max')).toHaveText('Update your max');
    await capture(page, testInfo, 'workout-options-your-max', line);
  });

  test('the weights editor names its three boxes and reads the result back', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await enterMaxFromOptions(page);
    // The bench max gives the dumbbell press a target, so its Plates panel has the editor.
    await page.getByText('Whole workout').click();
    const rows = page.locator('ol[aria-label="Active workout list"] li');
    const count = await rows.count();
    let opened = false;
    for (let index = 1; index < count && !opened; index += 1) {
      const text = (await rows.nth(index).textContent()) ?? '';
      if (!/Dumbbell/.test(text)) continue;
      await rows.nth(index).getByRole('button').click();
      opened = true;
    }
    expect(opened).toBe(true);
    const card = page.getByTestId('exercise-card').first();
    await card.getByTestId('plates-tab').click();
    const editor = card.getByTestId('loading-editor');
    await expect(editor).toHaveAttribute('data-kind', 'dumbbells');
    await expect(editor.getByTestId('loading-summary')).toContainText('Not set yet');
    await editor.getByTestId('loading-edit').click();
    const row = editor.getByTestId('loading-row-0');
    await expect(row).toContainText('Lightest (lb)');
    await expect(row).toContainText('Heaviest (lb)');
    await expect(row).toContainText('Jump (lb)');
    await editor.getByLabel('Lightest').fill('5');
    await editor.getByLabel('Heaviest').fill('55');
    await editor.getByLabel('Jump').fill('5');
    await expect(editor.getByTestId('loading-readback')).toHaveText('5 to 55 lb in 5 lb jumps');
    await capture(page, testInfo, 'workout-weights-editor', editor);
    await editor.getByTestId('loading-save').click();
    await settle(page);
    await expect(editor.getByTestId('loading-summary')).toContainText('stop at 55 lb');
  });
});
