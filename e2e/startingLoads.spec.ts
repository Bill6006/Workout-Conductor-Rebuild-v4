import { expect, test } from '@playwright/test';
import { ensureProfile } from './helpers';

/**
 * Maintenance 5: where the first weight comes from. A first-time bar lift
 * starts at the empty bar and says so; the line under the weight always says
 * what to load; a max the lifter enters sets the first target and the ramps;
 * bodyweight, age, and sex in Settings give a starting estimate.
 */

test.describe('where the first weight comes from', () => {
  test('a first-time bar lift starts at the empty bar, the logger says what to load, and an entered max sets the target', async ({
    page,
  }) => {
    await ensureProfile(page);
    await expect(page.getByTestId('workout-entry').first()).toContainText('× 45 × ');
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();

    const card = page.getByTestId('exercise-card').first();
    await expect(card.getByTestId('target-line')).toContainText('Ramp set · 45 lb');
    const logger = page.getByTestId('set-logger');
    await expect(logger).toContainText('Warm-up 45 lb');
    await expect(page.getByTestId('logger-weight')).toContainText('45');
    await page.getByTestId('skip-warmup').click();
    await expect(card.getByTestId('target-line')).toContainText('Set 1 of');
    await expect(logger).toContainText('Target 45 lb');
    await expect(logger).not.toContainText('Step 5');

    await card.getByTestId('know-max').click();
    const sheet = page.getByRole('dialog', { name: /Your max for Barbell Bench Press/ });
    await expect(sheet).toBeVisible();
    await sheet.getByTestId('max-weight').fill('185');
    await sheet.getByTestId('max-reps').fill('5');
    await expect(sheet.getByTestId('max-preview')).toContainText(
      'Estimated max about 216 lb from that set. First target: 155 lb × 4-6 reps at RIR 2.',
    );
    await sheet.getByTestId('max-save').click();
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      'First target for Barbell Bench Press set from your max.',
    );
    await expect(card.getByTestId('target-line')).toContainText('155 lb');
    await expect(logger).toContainText('Target 155 lb');
    await expect(page.getByTestId('logger-weight')).toContainText('155');
    await expect(card.getByTestId('know-max')).toHaveCount(0);

    await page.getByRole('tab', { name: 'How to' }).first().click();
    await expect(page.getByTestId('progression-evidence').first()).toContainText(
      'Your max for Barbell Bench Press: 215.8 lb',
    );
  });

  test('"Not now" hides the max offer for a week and survives a reload', async ({ page }) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    const card = page.getByTestId('exercise-card').first();
    await card.getByTestId('know-max').click();
    await page.getByTestId('max-not-now').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(card.getByTestId('know-max')).toHaveCount(0);

    await page.reload();
    const reloaded = page.getByTestId('exercise-card').first();
    await expect(reloaded).toBeVisible();
    await expect(reloaded.getByTestId('know-max')).toHaveCount(0);
  });

  test('bodyweight, age, and sex in Settings give a first-time lift a starting estimate', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await page.locator('#bodyweight').fill('180');
    await page.locator('#age').fill('30');
    await page
      .getByRole('radiogroup', { name: 'Sex' })
      .getByRole('radio', { name: 'Male', exact: true })
      .click();
    await expect(page.getByTestId('settings-save-status')).toHaveText(
      'Saved and verified on this device',
      { timeout: 10_000 },
    );
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });

    await page.goto('./#/today');
    // Reference max 1.0 x 180 lb; 85% of what it implies for 4-6 at RIR 2 -> 120 lb.
    await expect(page.getByTestId('workout-entry').first()).toContainText('× 120 × ');
    await page.getByTestId('start-workout').click();
    await page.getByRole('tab', { name: 'How to' }).first().click();
    await expect(page.getByTestId('progression-evidence').first()).toContainText(
      'Starting estimate from your 180 lb bodyweight, intermediate lifter, male, age 30',
    );
  });
});
