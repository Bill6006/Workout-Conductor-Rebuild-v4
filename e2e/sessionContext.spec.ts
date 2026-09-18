import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile, skipWarmupIfShown } from './helpers';

/**
 * Maintenance 13, round C: no ramp sits at the working weight, the ramps
 * arrive under a real target and later presses get at most one, and a lift
 * never done takes its first target from the lifts that have been.
 */

const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

function firstNumber(text: string | null): number {
  return Number(/\d+(?:\.\d+)?/.exec(text ?? '')?.[0]);
}

async function skipRestIfShown(page: Page): Promise<void> {
  const skipRest = page.getByTestId('skip-rest');
  if (await skipRest.isVisible()) await skipRest.click();
}

test.describe('session context', () => {
  test('no ramp at the empty bar; with a max the ramps arrive under the target, and the next press gets one at most', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    const card = page.getByTestId('exercise-card').first();
    // The bar is the working weight: the first set is a working set.
    await expect(card.getByTestId('target-line')).toContainText('Set 1 of');
    await expect(card.getByText(/ramps?\b/)).toHaveCount(0);

    await card.getByTestId('know-max').click();
    const sheet = page.getByRole('dialog', { name: /Your max for/ });
    await sheet.getByTestId('max-weight').fill('185');
    await sheet.getByTestId('max-reps').fill('5');
    await sheet.getByTestId('max-save').click();
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    await expect(card.getByTestId('target-line')).toContainText('Ramp 1 of 2');
    const ramp = firstNumber(await page.getByTestId('logger-weight').textContent());
    expect(ramp).toBeGreaterThanOrEqual(45);
    expect(ramp).toBeLessThan(155);
    await capture(page, testInfo, 'workout-ramps-under-target', card);

    // Skip the ramps and the working sets: the next exercise is a press on warm muscles.
    await skipWarmupIfShown(page);
    await expect(card.getByTestId('target-line')).toContainText('Set 1 of');
    await page.getByRole('button', { name: 'Options' }).first().click();
    await page.getByTestId('skip-today').click();
    await skipRestIfShown(page);
    const next = page.getByTestId('exercise-card').first();
    await expect(next.getByRole('heading').first()).not.toContainText('Barbell Bench Press');
    const line = (await next.getByTestId('target-line').textContent()) ?? '';
    expect(line).not.toMatch(/Ramp [2-9] of/);
    expect(line).not.toMatch(/Ramp 1 of [2-9]/);
  });

  test('a lift never done takes its first target from a lift that has been', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    const card = page.getByTestId('exercise-card').first();
    await card.getByTestId('know-max').click();
    const sheet = page.getByRole('dialog', { name: /Your max for/ });
    await sheet.getByTestId('max-weight').fill('185');
    await sheet.getByTestId('max-reps').fill('5');
    await sheet.getByTestId('max-save').click();
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });

    // Every other pressing lift now starts from the bench, not from a blank.
    await page.getByText('Whole workout').click();
    const rows = page.locator('ol[aria-label="Active workout list"] li');
    const count = await rows.count();
    let found = false;
    for (let index = 1; index < count && !found; index += 1) {
      await rows.nth(index).getByRole('button').click();
      await page.getByRole('tab', { name: 'How to' }).first().click();
      const evidence = page.getByTestId('progression-evidence').first();
      const text = (await evidence.textContent()) ?? '';
      if (/From your Barbell Bench Press \(about 216 lb max\)/.test(text)) {
        found = true;
        await expect(evidence).toContainText('the first target sits under it');
        await capture(page, testInfo, 'workout-cross-estimate', evidence);
      }
      await page.getByRole('tab', { name: 'How to' }).first().click();
    }
    expect(found).toBe(true);
  });
});
