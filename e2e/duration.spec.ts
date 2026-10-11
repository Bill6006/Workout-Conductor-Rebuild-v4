import { expect, test } from '@playwright/test';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Phase 3 flows: the single workout-length dropdown rebuilds the session at
 * once, and the Workout tab shows the same canonical list.
 */

test.describe('workout length', () => {
  test('15 / 30 / 45 / Default rebuild the session immediately', async ({ page }) => {
    await ensureProfile(page);
    const select = page.getByTestId('duration-select');
    await expect(select).toHaveValue('default');
    // The dropdown says the Default's minutes, and nothing says them again (Maintenance 29).
    await expect(select.locator('option:checked')).toHaveText(/^Default: \d+ min$/);
    await expect(page.getByTestId('workout-estimate')).toHaveCount(0);
    const defaultCount = await page.getByTestId('workout-entry').count();
    expect(defaultCount).toBeGreaterThanOrEqual(5);

    await select.selectOption('15');
    await expect(page.getByTestId('workout-estimate')).toContainText('Fitted to 15 min');
    const shortCount = await page.getByTestId('workout-entry').count();
    expect(shortCount).toBeLessThan(defaultCount);
    expect(shortCount).toBeLessThanOrEqual(4);
    await expect(page.getByTestId('workout-block').first()).toContainText('Main lift');
    await expectNoHorizontalOverflow(page);

    await select.selectOption('30');
    await expect(page.getByTestId('workout-estimate')).toContainText('Fitted to 30 min');
    const midCount = await page.getByTestId('workout-entry').count();
    expect(midCount).toBeGreaterThanOrEqual(shortCount);

    await select.selectOption('default');
    await expect(page.getByTestId('workout-estimate')).toHaveCount(0);
    expect(await page.getByTestId('workout-entry').count()).toBe(defaultCount);
  });

  test('the Workout tab shows the same session as one row per block', async ({ page }) => {
    await ensureProfile(page);
    await page.getByTestId('duration-select').selectOption('45');
    await expect(page.getByTestId('workout-estimate')).toContainText('Fitted to 45 min');
    await page.goto('./#/workout');
    const list = page.getByRole('list', { name: 'Active workout list' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('listitem').first()).toBeVisible();
    await expect(list).toContainText('A1');
    await expect(page.getByText(/45 min · about \d+ min/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
