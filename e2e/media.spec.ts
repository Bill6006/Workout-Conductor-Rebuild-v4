import { expect, test } from '@playwright/test';
import { ensureProfile } from './helpers';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

test.describe('your own demonstration', () => {
  test('the card loop plays, and a GIF picked in the details replaces it, survives a reload, and can be removed', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    const firstCard = () => page.getByTestId('exercise-card').first();
    const thumb = () => firstCard().getByTestId('exercise-thumb');
    await expect(thumb()).toHaveAttribute('data-animated', 'true');
    await expect(thumb()).toHaveAttribute('data-custom', 'false');

    await firstCard().getByTestId('card-thumb').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Placeholder · tap it to use your own GIF')).toBeVisible();
    await sheet.getByTestId('demo-file-input').setInputFiles({
      name: 'bench.gif',
      mimeType: 'image/gif',
      buffer: GIF,
    });
    await expect(sheet.getByTestId('custom-media')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Replace', exact: true })).toBeVisible();
    await expect(
      page.locator('[role="status"]').filter({ hasText: 'Saved your demonstration' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(thumb()).toHaveAttribute('data-custom', 'true');

    await page.reload();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await expect(thumb()).toHaveAttribute('data-custom', 'true');

    await firstCard().getByTestId('card-thumb').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByRole('dialog').getByTestId('exercise-demo')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(thumb()).toHaveAttribute('data-custom', 'false');
  });
});
