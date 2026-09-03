import { expect, test, type Page } from '@playwright/test';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Phase 4 flows: every change to the workout runs through the one
 * Recalibration Engine, shows the calibration overlay, and ends with a compact
 * change summary. Session-only changes never touch the saved profile.
 */

function exerciseIds(page: Page): Promise<(string | null)[]> {
  return page
    .getByTestId('workout-entry')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-exercise-id')));
}

test.describe('recalibration', () => {
  test('changing the length shows the calibration overlay, then a summary with undo', async ({
    page,
  }) => {
    await ensureProfile(page);
    const before = await exerciseIds(page);

    await page.getByTestId('duration-select').selectOption('15');
    const overlay = page.getByTestId('calibration-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Fitting the session to 15 minutes');
    await expect(overlay).toBeHidden({ timeout: 8_000 });

    const summary = page.getByTestId('recalibration-summary');
    await expect(summary).toContainText(/Recalibrated to 15 min: .*removed/);
    expect((await exerciseIds(page)).length).toBeLessThan(before.length);
    await expectNoHorizontalOverflow(page);

    await summary.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('duration-select')).toHaveValue('default');
    expect(await exerciseIds(page)).toEqual(before);
    await expect(summary).toContainText('Restored the previous workout.');
  });

  test('an alternative swaps only one exercise and marks it as your pick', async ({ page }) => {
    await ensureProfile(page);
    const before = await exerciseIds(page);

    await page.getByTestId('workout-entry').nth(3).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('use-alternative').first().click();

    const summary = page.getByTestId('recalibration-summary');
    await expect(summary).toContainText(/Swapped .+ for .+\./);
    const after = await exerciseIds(page);
    expect(after.length).toBe(before.length);
    expect(after.filter((id, index) => id !== before[index])).toHaveLength(1);
    await expect(page.locator('[data-changed="replaced"]')).toHaveCount(1);
    await expect(page.locator('[data-changed="replaced"]')).toContainText('Your pick');
  });

  test('busy station, skip, and pain are session-only and survive a reload', async ({ page }) => {
    await ensureProfile(page);
    const before = await exerciseIds(page);

    await page.getByTestId('workout-entry').first().click();
    await page.getByRole('button', { name: 'Equipment busy' }).click();
    const summary = page.getByTestId('recalibration-summary');
    await expect(summary).toContainText(/busy: 1 exercise replaced\./);
    expect((await exerciseIds(page))[0]).not.toBe(before[0]);

    await page.getByTestId('workout-entry').nth(2).click();
    await page.getByRole('button', { name: 'Skip today' }).click();
    await expect(summary).toContainText(/Skipped .+: about \d+ min saved\./);
    expect((await exerciseIds(page)).length).toBe(before.length - 1);

    await page.getByTestId('workout-entry').nth(1).click();
    await page.getByRole('combobox', { name: 'Which joint hurts?' }).selectOption('shoulder');
    await page.getByRole('button', { name: 'Hurts, protect it' }).click();
    await expect(summary).toContainText(/Protecting your shoulder: /);
    const afterPain = await exerciseIds(page);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(await exerciseIds(page)).toEqual(afterPain);
    await page.goto('./#/workout');
    const log = page.getByTestId('calibration-log');
    await expect(log).toContainText('Protecting your shoulder');
    await expect(log).toContainText('Equipment busy · local');
  });

  test('switching the place on Plan rebuilds the session for it', async ({ page }) => {
    await ensureProfile(page);
    await page.goto('./#/plan');
    await page.getByRole('button', { name: 'Use' }).first().click();
    await expect(page.getByTestId('calibration-overlay')).toBeVisible();
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });

    await page.goto('./#/today');
    await expect(page.getByTestId('recalibration-summary')).toContainText(/Rebuilt for Home: /);
    await expect(page.locator('[data-exercise-id="barbell-bench-press"]')).toHaveCount(0);
    await expect(page.getByText('Home ›')).toBeVisible();
  });
});
