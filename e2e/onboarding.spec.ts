import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Phase 1 product flows: first-run setup, persistence across reload, settings
 * autosave, location profiles, and the export / import round trip.
 */

test.describe('onboarding', () => {
  test('first run walks through setup and lands on a profile-driven demo workout', async ({
    page,
  }) => {
    await page.goto('./');
    await expect(
      page.getByRole('heading', { level: 1, name: 'What are you training for?' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    const primary = page.getByRole('radiogroup', { name: 'Primary goal' });
    await primary.getByRole('radio', { name: /Strength progress/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'How often, and how long?' }),
    ).toBeVisible();
    await page.getByRole('radio', { name: '45 min' }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Where do you train?' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Exercises you love or avoid' }),
    ).toBeVisible();
    const disliked = page.getByRole('textbox', { name: 'Disliked exercises' });
    await disliked.fill('Barbell Row');
    await disliked.press('Enter');
    await expect(page.getByRole('button', { name: 'Remove Barbell Row' })).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Anything to work around?' }),
    ).toBeVisible();
    await page.getByRole('switch', { name: /Avoid barbell squats/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Style and techniques' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Units and bodyweight' }),
    ).toBeVisible();
    await page.getByRole('radio', { name: /Kilograms/ }).click();
    await page.getByRole('button', { name: 'Finish setup' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Full body' })).toBeVisible();
    await expect(page.getByText('Back Squat')).toHaveCount(0);
    await expect(page.getByText('Barbell Row', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('workout-estimate')).toContainText('Default time');
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    // Finishing setup lands at the top of Today, not where the wizard was scrolled.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // The profile is durable: a reload skips setup and rebuilds the same preview.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Full body' })).toBeVisible();
    await expect(page.getByText('45 min per week')).toBeVisible();
  });

  test('a conflicting answer is explained instead of accepted', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: '6', exact: true }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'You chose 6 sessions but only 4 available days.',
    );
  });
});

test.describe('settings and plan', () => {
  test('settings changes autosave with verification and survive a reload', async ({ page }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    const dropSets = page.getByRole('switch', { name: /Allow drop sets/ });
    await expect(dropSets).toHaveAttribute('aria-checked', 'true');
    await dropSets.click();
    await expect(page.getByTestId('settings-save-status')).toHaveText(
      'Saved and verified on this device',
    );
    await expectNoHorizontalOverflow(page);

    await page.reload();
    await expect(page.getByRole('switch', { name: /Allow drop sets/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(page.getByText('IndexedDB ready')).toBeVisible();
  });

  test('a custom place can be added, used, and shows up on Today', async ({ page }) => {
    await ensureProfile(page);
    await page.goto('./#/plan');
    await page.getByRole('button', { name: 'Add a place' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a place' });
    await dialog.getByLabel('Name').fill('Hotel gym');
    await dialog.getByRole('button', { name: 'Save place' }).click();
    await expect(dialog).toBeHidden();

    const list = page.getByRole('list', { name: 'Saved locations' });
    const hotelRow = list.getByRole('listitem').filter({ hasText: 'Hotel gym' });
    await expect(hotelRow).toBeVisible();
    await hotelRow.getByRole('button', { name: 'Use' }).click();
    await expect(hotelRow).toContainText('Current');

    await page.goto('./#/today');
    await expect(page.getByText('Hotel gym ›')).toBeVisible();
  });

  test('a Full Backup JSON exports and imports back with a preview', async ({ page }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Full Backup JSON' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^workout-conductor-backup-\d{8}-\d{4}\.json$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const text = readFileSync(path ?? '', 'utf8');
    expect(JSON.parse(text).format).toBe('workout-conductor-backup');

    await page.getByTestId('import-file-input').setInputFiles(path ?? '');
    const preview = page.getByRole('dialog', { name: 'Restore this backup?' });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Build muscle');
    await preview.getByRole('button', { name: 'Replace my data' }).click();
    await expect(preview).toBeHidden();
    await expect(page.getByText('Backup restored and verified')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  });
});
