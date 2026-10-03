import { expect, test } from '@playwright/test';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Phase 2 flows: the exercise library, the exercise detail sheet with its
 * placeholder demonstration, and the ranked alternatives preview on Today.
 */

test.describe('exercise library', () => {
  test('is reachable from Settings, searches, and opens a detail sheet with a working demonstration', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await page.getByTestId('library-link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Exercise library' })).toBeVisible();
    await expect(page.getByTestId('library-count')).toContainText(/\d+ of \d+ exercises/);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('searchbox', { name: 'Search exercises' }).fill('lat pulldown');
    const row = page.getByTestId('library-row').first();
    await expect(row).toContainText('Lat Pulldown');
    await row.click();

    const dialog = page.getByRole('dialog', { name: 'Lat Pulldown' });
    await expect(dialog).toBeVisible();
    // Its own licensed clip (Maintenance 25, item 7), fetched whole, then playing.
    const demo = dialog.locator('video[data-testid="exercise-demo"]');
    await expect(demo).toHaveAttribute('data-playing', 'true', { timeout: 10_000 });
    await expect
      .poll(() => demo.evaluate((video: HTMLVideoElement) => video.currentTime), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
    await expect(dialog.getByTestId('demo-credit')).toHaveText('Video: FitnessScape · CC BY 3.0');
    await expect(dialog.getByRole('heading', { name: 'Do it' })).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: /Alternatives, best match first/ }),
    ).toBeVisible();
    await expect(dialog.getByText('Pull-Up', { exact: true })).toBeVisible();
    await expect(dialog.getByTestId('alternative-reasons').first()).not.toBeEmpty();

    await dialog.getByRole('button', { name: 'Prefer' }).click();
    await expect(page.getByText('Lat Pulldown marked preferred')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('library-row').first()).toContainText('Preferred');
  });

  test('Today exercises open their demonstration and ranked alternatives', async ({ page }) => {
    await ensureProfile(page);
    await page.getByTestId('workout-entry').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('exercise-demo')).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: /Alternatives, best match first/ }),
    ).toBeVisible();
    await expect(dialog.locator('li').filter({ hasText: /\d{2}/ }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
