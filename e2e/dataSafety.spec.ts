import { expect, test, type Page } from '@playwright/test';
import { ensureProfile } from './helpers';

const LEGACY_EXPORT = Buffer.from(
  JSON.stringify({
    exportedBy: 'an older app',
    history: [
      {
        date: '2026-05-01T18:00:00Z',
        name: 'Push A',
        unit: 'lb',
        exercises: [
          {
            name: 'Barbell Bench Press',
            sets: [
              { weight: 95, reps: 8, warmup: true },
              { weight: 135, reps: 5, rir: 2 },
              { weight: 135, reps: 5, rir: 1 },
            ],
          },
          { name: 'Unknown Thing', sets: [{ weight: 1, reps: 1 }] },
        ],
      },
    ],
  }),
);

const status = (page: Page, text: string | RegExp) =>
  page.locator('[role="status"]').filter({ hasText: text });

test.describe('data safety in Settings', () => {
  test('exports history and settings files, keeps and restores an automatic backup, checks saves, and cleans up safely', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

    const historyDownload = page.waitForEvent('download');
    await page.getByTestId('export-history').click();
    expect((await historyDownload).suggestedFilename()).toMatch(/^workout-conductor-history-/);
    const settingsDownload = page.waitForEvent('download');
    await page.getByTestId('export-settings').click();
    expect((await settingsDownload).suggestedFilename()).toMatch(/^workout-conductor-settings-/);

    await expect(page.getByTestId('snapshots-empty')).toBeVisible();
    await page.getByTestId('snapshot-now').click();
    await expect(status(page, 'Backed up on this device')).toBeVisible();
    await expect(page.getByTestId('snapshot-list').locator('li')).toHaveCount(1);
    await page.getByTestId('snapshot-restore').click();
    await expect(
      page.getByRole('dialog', { name: 'Restore this automatic backup?' }),
    ).toBeVisible();
    await page.getByTestId('restore-confirm').click();
    await expect(status(page, 'Backup restored and verified')).toBeVisible();
    // Restoring keeps the data from before as another snapshot.
    await expect(page.getByTestId('snapshot-list').locator('li')).toHaveCount(2);

    await page.getByTestId('save-check').click();
    await expect(status(page, /Save check passed/)).toBeVisible();

    await page.getByTestId('cleanup-preview').click();
    await expect(page.getByRole('dialog', { name: 'Clear temporary data?' })).toBeVisible();
    await expect(page.getByTestId('cleanup-kept')).toContainText('Profile (1)');
    await page.getByTestId('cleanup-confirm').click();
    await expect(status(page, /Nothing temporary to remove|Removed/)).toBeVisible();
    await expect(page.getByTestId('snapshot-list').locator('li')).toHaveCount(2);
  });

  test('imports an older export after a preview, counts it in history, and undoes it exactly', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await page.getByTestId('legacy-file-input').setInputFiles({
      name: 'old-history.json',
      mimeType: 'application/json',
      buffer: LEGACY_EXPORT,
    });
    const dialog = page.getByRole('dialog', { name: 'Import these workouts?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Barbell Bench Press');
    await expect(page.getByTestId('legacy-skipped')).toContainText('Unknown Thing');
    await page.getByTestId('legacy-confirm').click();
    await expect(status(page, 'Imported and verified 1 workout')).toBeVisible();
    await expect(page.getByTestId('legacy-receipts').locator('li')).toHaveCount(1);

    await page.goto('./#/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
    await expect(page.getByText('Nothing logged yet.')).toHaveCount(0);

    await page.goto('./#/settings');
    await page.getByTestId('legacy-undo').click();
    await expect(status(page, 'Removed 1 imported workout')).toBeVisible();
    await expect(page.getByTestId('legacy-receipts')).toHaveCount(0);
    await page.goto('./#/progress');
    await expect(page.getByText('Nothing logged yet.').first()).toBeVisible();
  });
});
