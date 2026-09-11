import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ensureProfile } from './helpers';

/**
 * Maintenance 6: the cloud copy. These tests never reach the database: every
 * request to its host is aborted at the browser, so CI and the live run both
 * exercise the queue-and-report path without a token that works.
 */

const TOKEN = 'e2e-token-never-real';

test.describe('cloud copy', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/turso\.io/, (route) => route.abort());
  });

  test('is off until a token is pasted, then queues, reports, survives a reload, and turns off again', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await expect(page.getByText('Off until you paste a token.')).toBeVisible();
    await expect(
      page.getByText('libsql://life-record-bill6006.aws-us-east-1.turso.io'),
    ).toBeVisible();
    await expect(page.getByTestId('cloud-sync-now')).toHaveCount(0);

    await page.getByTestId('cloud-token').fill(TOKEN);
    await page.getByTestId('cloud-save-token').click();
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
    await expect(page.getByTestId('cloud-sync-now')).toBeVisible();
    // The push was attempted and blocked at the browser: the changes stay queued and the status says so.
    await expect(page.getByText(/Last attempt failed/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/\d+ changes? waiting/)).toBeVisible();

    await page.reload();
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
    await expect(page.getByText(/\d+ changes? waiting/)).toBeVisible();

    await page.getByTestId('cloud-remove-token').click();
    await expect(page.getByText('Off until you paste a token.')).toBeVisible();
    await expect(page.getByTestId('cloud-token')).toBeVisible();
  });

  test('a backup carries neither the token nor the device id', async ({ page }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await page.getByTestId('cloud-token').fill(TOKEN);
    await page.getByTestId('cloud-save-token').click();
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Full Backup JSON' }).click();
    const download = await downloadPromise;
    const text = readFileSync((await download.path()) ?? '', 'utf8');
    expect(text).not.toContain(TOKEN);
    const backup = JSON.parse(text) as { data: { localSettings: { deviceId: unknown } } };
    expect(backup.data.localSettings.deviceId).toBeNull();
  });
});
