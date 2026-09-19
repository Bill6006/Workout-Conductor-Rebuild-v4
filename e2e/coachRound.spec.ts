import { expect, test } from '@playwright/test';
import { ensureProfile } from './helpers';

/**
 * Maintenance 7: the coach round. Goals are five honest choices under one
 * rule, Strength progress points at the programming style, and the superset
 * readout lives on the superset card instead of the coach card.
 */

test.describe('the coach round', () => {
  test('goals are five honest choices, and Strength progress points at the programming style', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    const primary = page.getByRole('radiogroup', { name: 'Primary goal' });
    await expect(primary.getByRole('radio')).toHaveCount(5);
    await expect(primary.getByRole('radio', { name: /Balanced development/ })).toHaveCount(0);
    await primary.getByRole('radio', { name: /Strength progress/ }).click();
    await expect(
      page.getByText(
        'For lower reps and longer rests, set Programming style to Strength focus or Auto.',
        { exact: false },
      ),
    ).toBeVisible();
    await primary.getByRole('radio', { name: /Build muscle/ }).click();
    await expect(page.getByText(/Programming style decides how each set is done/)).toBeVisible();
    await expect(page.getByTestId('settings-save-status')).toHaveText(
      'Saved and verified on this device',
      { timeout: 10_000 },
    );
  });

  test('the superset card carries the logged-rounds line itself', async ({ page }) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    for (let guard = 0; guard < 40; guard += 1) {
      if (await page.getByTestId('superset-group').isVisible()) break;
      const skipWarmup = page.getByTestId('skip-warmup');
      if (await skipWarmup.isVisible()) {
        await skipWarmup.click();
        continue;
      }
      await page.getByTestId('log-set').click();
      const skipRest = page.getByTestId('skip-rest');
      if (await skipRest.isVisible()) await skipRest.click();
    }
    await expect(page.getByTestId('superset-note')).toHaveText(
      'Only logged rounds count; the next round starts from what you actually did.',
    );
  });
});
