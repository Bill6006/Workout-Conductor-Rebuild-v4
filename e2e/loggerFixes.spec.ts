import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile } from './helpers';

/**
 * Maintenance 11, round A: the plate line describes the dial, a zero-rep set
 * says Skip before the tap, skipping a started exercise keeps its logged sets,
 * a finished exercise's Skip today is greyed out with a reason, and any
 * exercise in the Whole workout list opens for editing.
 */

/** Evidence captures, only when asked for and only from the primary phone project. */
const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

async function startWorkout(page: Page): Promise<void> {
  await ensureProfile(page);
  await page.getByTestId('start-workout').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
}

async function skipRestIfShown(page: Page): Promise<void> {
  const skipRest = page.getByTestId('skip-rest');
  if (await skipRest.isVisible()) await skipRest.click();
}

function firstNumber(text: string | null): number {
  return Number(/\d+(?:\.\d+)?/.exec(text ?? '')?.[0]);
}

/** The total a plate line loads: "Empty bar · 45 lb", or "Bar 45 + 45, 25 each side · 185 lb". */
function loadedTotal(line: string): number | null {
  const empty = /^Empty bar · (\d+(?:\.\d+)?) (?:lb|kg)$/.exec(line.trim());
  if (empty) return Number(empty[1]);
  const match = /^Bar (\d+(?:\.\d+)?) \+ (.+) each side · (\d+(?:\.\d+)?) (?:lb|kg)$/.exec(
    line.trim(),
  );
  if (!match) return null;
  const perSide = (match[2] ?? '').split(',').reduce((sum, part) => sum + Number(part.trim()), 0);
  const total = Number(match[1]) + perSide * 2;
  // The line states its total, and the plates it names add up to it.
  return total === Number(match[3]) ? total : null;
}

test.describe('logger fixes', () => {
  test('after a heavier warm-up the plate line still matches the working set dial, and zero reps reads Skip', async ({
    page,
  }, testInfo) => {
    await startWorkout(page);
    const card = page.getByTestId('exercise-card').first();
    // The empty bar earns no ramp, so give the lift a max first: the ramps arrive under it.
    await card.getByTestId('know-max').click();
    const sheet = page.getByRole('dialog', { name: /Your max for/ });
    await sheet.getByTestId('max-weight').fill('185');
    await sheet.getByTestId('max-reps').fill('5');
    await sheet.getByTestId('max-save').click();
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    await expect(card.getByTestId('target-line')).toContainText('Ramp 1 of');
    // Turn the ramp up well past its offer before logging it. Before this round that weight
    // became the plate line of the working set while the dial showed the target.
    const increase = card.getByRole('button', { name: /^Increase weight/ });
    for (let i = 0; i < 6; i += 1) await increase.click();
    const rampWeight = firstNumber(await card.getByTestId('logger-weight').textContent());
    await page.getByTestId('log-set').click();
    await skipRestIfShown(page);
    for (let guard = 0; guard < 4; guard += 1) {
      const line = await card.getByTestId('target-line').textContent();
      if (line?.includes('Set 1 of')) break;
      await page.getByTestId('log-set').click();
      await skipRestIfShown(page);
    }
    await expect(card.getByTestId('target-line')).toContainText('Set 1 of');
    const dial = firstNumber(await card.getByTestId('logger-weight').textContent());
    expect(dial).toBeGreaterThan(0);
    expect(dial).not.toBe(rampWeight);
    const plateLine = card.getByText(/^(Bar \d|Empty bar)/).first();
    await expect(plateLine).toBeVisible();
    expect(loadedTotal((await plateLine.textContent()) ?? '')).toBe(dial);

    // Turn the reps down to zero: the button says what will happen.
    const decrease = card.getByRole('button', { name: 'Decrease reps' });
    for (let guard = 0; guard < 25; guard += 1) {
      if (firstNumber(await card.getByTestId('logger-reps').textContent()) === 0) break;
      await decrease.click();
    }
    await expect(page.getByTestId('log-set')).toHaveText('Skip set');
    await capture(page, testInfo, 'workout-skip-set-label', page.getByTestId('log-set'));
    await page.getByTestId('log-set').click();
    await expect(
      page.locator('[data-testid="set-row"][data-state="skipped"]').first(),
    ).toBeVisible();
  });

  test('skipping a started exercise keeps its logged sets, and a finished one greys the button', async ({
    page,
  }, testInfo) => {
    await startWorkout(page);
    const card = page.getByTestId('exercise-card').first();
    const name = (await card.getByRole('heading').first().textContent())?.trim() ?? '';
    // One ramp set logged, then Skip today from the options sheet.
    await page.getByTestId('log-set').click();
    await skipRestIfShown(page);
    await page.getByRole('button', { name: 'Options' }).first().click();
    await page.getByTestId('skip-today').click();
    await expect(page.getByText(/Skipped the rest of/)).toBeVisible();
    await expect(page.getByText('Recalibration failed')).toHaveCount(0);

    // Whole workout: the finished exercise opens for editing, and Skip today is greyed with a reason.
    await page.getByText('Whole workout').click();
    const row = page.locator('ol[aria-label="Active workout list"] li').first();
    await row.getByRole('button').click();
    await expect(page.getByTestId('viewing-note')).toContainText(name || 'Viewing');
    await expect(
      page.locator('[data-testid="set-row"][data-state="skipped"]').first(),
    ).toBeVisible();
    await capture(page, testInfo, 'workout-viewing', page.getByTestId('viewing-note'));
    await capture(page, testInfo, 'workout-skip-rest', page.getByTestId('viewing-note'));
    await page.getByRole('button', { name: 'Options' }).first().click();
    await expect(page.getByTestId('skip-today')).toBeDisabled();
    await expect(page.getByTestId('skip-reason')).toContainText('Every set is logged');
    await capture(page, testInfo, 'workout-skip-greyed', page.getByTestId('skip-reason'));
    await page.keyboard.press('Escape');
    await page.getByTestId('back-to-current').click();
    await expect(page.getByTestId('viewing-note')).toHaveCount(0);
  });
});
