import { expect, test } from '@playwright/test';
import { ensureProfile, skipWarmupIfShown } from './helpers';

/**
 * Maintenance 29 (round K), the owner's items 7, 8 and 14, in the browser:
 * - 7, "Vibration alongside the rest sounds, one switch for both";
 * - 8, "Screen wake lock during a workout";
 * - 14, the phone's Back closes any open sheet.
 * Item 10 is in duration.spec.ts.
 */

test.describe("the phone's Back and a sheet (item 14)", () => {
  test('closes the sheet, not the screen, and is never spent on a sheet gone', async ({ page }) => {
    await ensureProfile(page);
    await page.goto('./#/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
    await page.goto('./#/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

    // Back closes the check-in, and Today stays.
    await page.getByTestId('readiness-open').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/#\/today$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

    // Closed with its X, the sheet gives its entry back: the next Back leaves Today as usual.
    await page.getByTestId('readiness-open').click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => (history.state as { openViews?: string[] } | null)?.openViews ?? []),
      )
      .toEqual([]);
    await page.goBack();
    await expect(page).toHaveURL(/#\/progress$/);
  });
});

test.describe('a workout under way (items 7 and 8)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const record = window as unknown as {
        buzzes: (number | number[])[];
        locks: string[];
      };
      record.buzzes = [];
      record.locks = [];
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        value: (pattern: number | number[]) => {
          record.buzzes.push(pattern);
          return true;
        },
      });
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: (type: string) => {
            record.locks.push(`request ${type}`);
            return Promise.resolve({
              release: () => {
                record.locks.push('release');
                return Promise.resolve();
              },
            });
          },
        },
      });
    });
  });

  test('keeps the screen on while it runs, and lets it sleep once paused', async ({ page }) => {
    await ensureProfile(page);
    const locks = () => page.evaluate(() => (window as unknown as { locks: string[] }).locks);
    expect(await locks()).toEqual([]);
    await page.getByTestId('start-workout').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    await expect.poll(locks).toContain('request screen');
    await page.getByTestId('pause-toggle').click();
    await expect(page.getByTestId('pause-toggle')).toHaveText('Resume');
    await expect.poll(locks).toContain('release');
  });

  test("buzzes with the rest's last ticks and its end, under the sounds' switch", async ({
    page,
  }) => {
    await page.clock.install();
    await page.clock.resume();
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    await skipWarmupIfShown(page);
    await page.getByTestId('log-set').click();
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    // Past the longest rest a plan sets: the ticks and the end go by.
    await page.clock.runFor(6 * 60_000);
    const buzzes = () =>
      page.evaluate(() => (window as unknown as { buzzes: (number | number[])[] }).buzzes);
    const pattern = [60, 940, 60, 940, 60, 940, 120, 60, 120];
    await expect.poll(buzzes).toContainEqual(pattern);
    // Once, and nothing buzzes on its own beside it: the timer's old end buzz is gone.
    const first = await buzzes();
    expect(first.filter((buzz) => JSON.stringify(buzz) === JSON.stringify(pattern))).toHaveLength(
      1,
    );
    expect(first).not.toContainEqual([120, 60, 120]);

    // The one switch off: the next rest ends without a buzz.
    await page.goto('./#/settings');
    const sounds = page.getByTestId('alerts-card').getByRole('switch', {
      name: /^Rest timer sounds and vibration/,
    });
    await sounds.click();
    await expect(sounds).toHaveAttribute('aria-checked', 'false');
    await page.goto('./#/workout');
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    await skipWarmupIfShown(page);
    await page.getByTestId('log-set').click();
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await page.clock.runFor(6 * 60_000);
    const after = await buzzes();
    expect(after.filter((buzz) => Array.isArray(buzz) && buzz.length > 1)).toHaveLength(1);
  });
});
