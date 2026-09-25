import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile } from './helpers';

/**
 * Maintenance 24, round F. A short session keeps its main lifts and leaves the isolation moves out
 * first (the owner's item 33), and a low check-in's set fewer and extra rep in reserve hold through
 * a change of length, until a check-in back to fine brings the planned sets back (item 34).
 */

const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  // The first-run toast would cover the picture; it is gone in a few seconds.
  await expect(page.getByText('Profile saved and verified on this device')).toHaveCount(0, {
    timeout: 10_000,
  });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

/** The meta line of the main lift's row, for example "3 × 4-6 @ RIR 2 · 2 min 30 s · Barbell". */
function mainLift(page: Page): Locator {
  return page
    .getByTestId('workout-entry')
    .filter({ hasText: 'Main lift' })
    .first()
    .getByTestId('entry-meta');
}

async function reserveOf(page: Page): Promise<number> {
  const text = (await mainLift(page).textContent()) ?? '';
  return Number(/@ RIR (\d)/.exec(text)?.[1]);
}

async function fitTo(page: Page, minutes: '15' | '30' | '45' | 'default'): Promise<void> {
  await page.getByTestId('duration-select').selectOption(minutes);
  await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
  await expect(page.getByTestId('workout-estimate')).toContainText(
    minutes === 'default' ? 'Default time' : `Fitted to ${minutes} min`,
  );
}

async function checkIn(page: Page, energy: 'Drained' | 'Good'): Promise<void> {
  await page.getByTestId('readiness-open').click();
  const sheet = page.getByRole('dialog', { name: 'Quick check-in' });
  await sheet
    .getByRole('radiogroup', { name: 'Energy' })
    .getByRole('radio', { name: energy })
    .click();
  await sheet.getByTestId('readiness-apply').click();
  await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
}

test.describe('a short session (Maintenance 24)', () => {
  test('keeps its main lifts and leaves the isolation moves out first', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await fitTo(page, '15');
    const rows = page.getByTestId('workout-entry');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Main lift');
    await expect(rows.filter({ hasText: /Curl|Fly|Raise|Pushdown|Extension/ })).toHaveCount(0);
    await capture(page, testInfo, 'today-15-min-main-lifts', rows.first());
  });
});

test.describe('a low check-in (Maintenance 24)', () => {
  test('keeps its extra rep in reserve through a change of length, until it is taken back', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await fitTo(page, '45');
    const plain = await reserveOf(page);
    expect(plain).toBeGreaterThanOrEqual(0);
    await fitTo(page, 'default');

    await checkIn(page, 'Drained');
    await expect(page.getByTestId('recalibration-summary')).toContainText(/Adjusted for today/);
    await fitTo(page, '45');
    await expect(mainLift(page)).toContainText(`@ RIR ${Math.min(4, plain + 1)}`);
    await capture(page, testInfo, 'today-checkin-kept-at-45', mainLift(page));

    await checkIn(page, 'Good');
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      'Planned sets and effort back',
    );
    await expect(mainLift(page)).toContainText(`@ RIR ${plain}`);
    await capture(page, testInfo, 'today-checkin-back', page.getByTestId('recalibration-summary'));
  });
});
