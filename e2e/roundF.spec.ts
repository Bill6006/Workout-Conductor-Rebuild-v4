import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile } from './helpers';

/**
 * Maintenance 24, round F. A short session keeps its main lifts and leaves the isolation moves out
 * first (the owner's item 33), and what a check-in changes in the plan holds through a change of
 * length, until a check-in back to fine gives the plan back (item 34).
 *
 * Maintenance 33 (the owner's decision 1) changed what a check-in changes: a low answer alone keeps
 * the full workout (the check-in lowers what the first sets are expected to do, never the plan), and
 * a head cold keeps every set two or more reps short of failure. So item 34's hold is now the head
 * cold's floor, and a low answer alone is checked to leave the plan as it was.
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

/** Every reserve the plan's rows show, in order: a top set's and its back-offs' too (round N). */
async function reservesOf(page: Page): Promise<number[]> {
  const metas = await page.getByTestId('workout-entry').getByTestId('entry-meta').allTextContents();
  return metas.flatMap((text) =>
    [...text.matchAll(/@ RIR (\d)/g)].map((match) => Number(match[1])),
  );
}

async function fitTo(page: Page, minutes: '15' | '30' | '45' | 'default'): Promise<void> {
  await page.getByTestId('duration-select').selectOption(minutes);
  await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
  if (minutes === 'default') {
    // At the Default, a line under the dropdown is there only when the plan says more than it.
    await expect(page.getByTestId('duration-select')).toHaveValue('default');
    await expect(
      page.getByTestId('workout-estimate').filter({ hasNotText: 'Default time' }),
    ).toHaveCount(0);
  } else {
    await expect(page.getByTestId('workout-estimate')).toContainText(`Fitted to ${minutes} min`);
  }
}

async function checkIn(
  page: Page,
  energy: 'Drained' | 'Good',
  unwell: 'No' | 'Head cold' = 'No',
): Promise<void> {
  await page.getByTestId('readiness-open').click();
  const sheet = page.getByRole('dialog', { name: 'Quick check-in' });
  await sheet
    .getByRole('radiogroup', { name: 'Energy' })
    .getByRole('radio', { name: energy })
    .click();
  await sheet
    .getByRole('radiogroup', { name: 'Unwell' })
    .getByRole('radio', { name: unwell })
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

test.describe('a check-in through a change of length (Maintenance 24, on Maintenance 33 rules)', () => {
  test('a low answer alone keeps the full workout', async ({ page }) => {
    await ensureProfile(page);
    const plain = await reservesOf(page);
    expect(plain.length).toBeGreaterThan(0);

    await checkIn(page, 'Drained');
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      'Checked in: full workout kept.',
    );
    expect(await reservesOf(page)).toEqual(plain);
  });

  test('a head cold keeps every set 2 or more short of failure through a change of length, until it is taken back', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await fitTo(page, '45');
    const plain = await reservesOf(page);
    expect(plain.length).toBeGreaterThan(0);
    const floored = plain.map((reserve) => Math.max(2, reserve));
    // Some set at 45 minutes goes nearer failure than 2 in reserve, so the floor shows.
    expect(floored).not.toEqual(plain);
    await fitTo(page, 'default');

    await checkIn(page, 'Good', 'Head cold');
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      'every set 2 or more short of failure for the head cold',
    );
    await fitTo(page, '45');
    expect(await reservesOf(page)).toEqual(floored);
    await capture(page, testInfo, 'today-checkin-kept-at-45', mainLift(page));

    await checkIn(page, 'Good', 'No');
    await expect(page.getByTestId('recalibration-summary')).toBeVisible();
    expect(await reservesOf(page)).toEqual(plain);
    expect(await reserveOf(page)).toBe(plain[0]);
    await capture(page, testInfo, 'today-checkin-back', page.getByTestId('recalibration-summary'));
  });
});
