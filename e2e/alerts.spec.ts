import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile } from './helpers';

/**
 * Maintenance 14, round D: the rest timer's sounds and the notifications are
 * switches on this device, permission is asked for only from the switch, and
 * a workout left open for hours is named by the coach with the way to save it.
 */

const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

test.describe('alerts', () => {
  test('sounds are on by default and the switch is remembered on this device', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    const card = page.getByTestId('alerts-card');
    const sounds = card.getByRole('switch', { name: /Rest timer sounds/ });
    await expect(sounds).toHaveAttribute('aria-checked', 'true');
    await expect(card).toContainText('Three ticks, then a longer tone when the rest ends.');
    await capture(page, testInfo, 'settings-alerts', card);
    await sounds.click();
    await expect(sounds).toHaveAttribute('aria-checked', 'false');
    await page.reload();
    await expect(
      page.getByTestId('alerts-card').getByRole('switch', { name: /Rest timer sounds/ }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  test('notifications turn on only from the switch, once the browser allows them', async ({
    page,
  }) => {
    // The browser's answer is stubbed, so the test is about the switch and not about headless Chromium.
    await page.addInitScript(() => {
      let permission: 'default' | 'granted' | 'denied' = 'default';
      class FakeNotification {
        static get permission() {
          return permission;
        }
        static requestPermission() {
          permission = 'granted';
          return Promise.resolve(permission);
        }
      }
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: FakeNotification,
      });
    });
    await ensureProfile(page);
    await page.goto('./#/settings');
    const card = page.getByTestId('alerts-card');
    const toggle = card.getByRole('switch', { name: /Notifications/ });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(card.getByTestId('alerts-note')).toContainText('may come late or not at all');
    await page.reload();
    await expect(
      page.getByTestId('alerts-card').getByRole('switch', { name: /Notifications/ }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('a workout left open for hours is named by the coach, with the way to save it', async ({
    page,
  }, testInfo) => {
    await page.clock.install();
    await page.clock.resume();
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    await page.getByTestId('log-set').click();
    await expect(page.locator('[data-testid="set-row"][data-state="done"]')).toHaveCount(1);

    // Four hours later the workout is still open.
    await page.clock.fastForward('04:00:00');
    const card = page.getByTestId('coach-card');
    await expect(card.getByTestId('coach-headline')).toHaveText(
      'This workout has been open for 4 hours',
      { timeout: 15_000 },
    );
    await expect(card).toContainText('exercises have logged sets, and nothing is lost.');
    await capture(page, testInfo, 'workout-left-open', card);
    await card.getByTestId('coach-action').click();
    const sheet = page.getByRole('dialog', { name: 'End the workout early?' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    // From Today the same tap lands on the workout with the sheet already open.
    await page.goto('./#/');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    const today = page.getByTestId('coach-card');
    await expect(today.getByTestId('coach-headline')).toHaveText(
      'This workout has been open for 4 hours',
    );
    await today.getByTestId('coach-action').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    const opened = page.getByRole('dialog', { name: 'End the workout early?' });
    await expect(opened).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(opened).toBeHidden();

    // Not now puts the card away for this workout, and another hour does not bring it back.
    await page.getByTestId('coach-card').getByTestId('coach-dismiss').click();
    await expect(page.getByTestId('coach-headline')).not.toContainText('has been open');
    await page.clock.fastForward('01:00:00');
    await expect(page.getByTestId('coach-headline')).not.toContainText('has been open');
  });
});
