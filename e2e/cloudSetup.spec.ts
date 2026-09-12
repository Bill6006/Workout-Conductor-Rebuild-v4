import { expect, test } from '@playwright/test';
import { ensureProfile } from './helpers';

/**
 * Maintenance 9: one database per person. The address sits beside the token and
 * can be changed; a personal setup link fills both and clears itself out of the
 * address bar. These tests never reach a database: every request to the host is
 * aborted at the browser.
 */

const OTHER = 'libsql://life-record-p1-bill6006.aws-us-east-1.turso.io';
const TOKEN = 'e2e-token-never-real';

test.describe('one database per person', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/turso\.io/, (route) => route.abort());
  });

  test('the address sits beside the token and a different one must be reachable', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await expect(page.getByTestId('cloud-url')).toHaveValue(
      'libsql://life-record-bill6006.aws-us-east-1.turso.io',
    );

    // A made-up address is refused before anything is saved.
    await page.getByTestId('cloud-url').fill('not-a-database');
    await page.getByTestId('cloud-token').fill(TOKEN);
    await page.getByTestId('cloud-save-token').click();
    await expect(page.getByText(/does not look right/)).toBeVisible();

    // A real-looking one this device has never used has to answer first, and the
    // host is blocked here, so it is refused rather than saved on a promise.
    await page.getByTestId('cloud-url').fill(OTHER);
    await page.getByTestId('cloud-save-token').click();
    await expect(page.getByText(/Could not reach that database/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('cloud-sync-now')).toHaveCount(0);
  });

  test('a setup link fills both values and does not linger in the address bar', async ({
    page,
  }) => {
    await ensureProfile(page);
    const link = `./#/setup?db=${encodeURIComponent(OTHER)}&token=${encodeURIComponent(TOKEN)}`;
    await page.goto(link);
    // It lands on Settings with the link already scrubbed, whatever the outcome.
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page).toHaveURL(/#\/settings$/);
    expect(page.url()).not.toContain(TOKEN);
    // The host is blocked in this test, so the card reports why rather than pretending.
    await expect(page.getByText(/Could not reach that database/)).toBeVisible({ timeout: 15_000 });

    // Reloading does not re-apply it: the credentials are gone from the URL.
    await page.reload();
    expect(page.url()).not.toContain(TOKEN);
  });
});
