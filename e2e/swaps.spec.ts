import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile, expectNoHorizontalOverflow, skipWarmupIfShown } from './helpers';

/**
 * Maintenance 22, round D: swaps you can trust. A swap once a set is logged leaves that set with
 * the exercise it was done on and gives the new exercise its own target; the stopped exercise
 * says so on Today; a swap kept for a few weeks shows on Plan until it is stopped.
 */

const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  // Toasts clear first; the recalibration summary is a status too, and stays.
  await expect(page.locator('[role="status"][aria-live="polite"] > *')).toHaveCount(0, {
    timeout: 8_000,
  });
  if (target) await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  // A sheet still fading in would show the page through it: finite animations finish first.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
}

const activeCard = (page: Page) =>
  page.locator('[data-testid="exercise-card"][data-active="true"]');
const row = (page: Page, exerciseId: string) =>
  page.locator(`[data-testid="workout-entry"][data-exercise-id="${exerciseId}"]`);

test.describe('swaps you can trust', () => {
  test('a swap after a logged set leaves that set with its exercise and gives the new one its own target', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    // A bodyweight gives every lift a starting weight, as on the owner's phone.
    await page.goto('./#/settings');
    await page.locator('#bodyweight').fill('180');
    await expect(page.getByTestId('settings-save-status')).toHaveText(
      'Saved and verified on this device',
      { timeout: 10_000 },
    );
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    await page.goto('./#/today');
    await expect(page.getByTestId('location-open')).toContainText('Gym');
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await expect(activeCard(page)).toHaveAttribute('aria-label', /^Barbell Bench Press,/);
    await skipWarmupIfShown(page);
    const barbellDial = (await page.getByTestId('logger-weight').textContent())?.trim() ?? '';
    await page.getByTestId('log-set').click();
    await expect(activeCard(page)).toHaveAttribute('aria-label', /1 of \d+ sets done/);

    await page.goto('./#/today');
    await row(page, 'barbell-bench-press').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Use Dumbbell Bench Press instead' }).click();
    await settle(page);
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      'Swapped Barbell Bench Press for Dumbbell Bench Press.',
    );
    // Today: the bench press says it stopped, and the dumbbells take over right after it.
    const bench = row(page, 'barbell-bench-press');
    await expect(bench.getByTestId('entry-meta')).toHaveText(/^Stopped: 1 of \d+ sets done$/);
    await expect(bench).not.toContainText('Main lift');
    await expect(row(page, 'dumbbell-bench-press')).toHaveAttribute('data-changed', 'replaced');
    const ids = await page
      .getByTestId('workout-entry')
      .evaluateAll((rows) => rows.map((item) => item.getAttribute('data-exercise-id')));
    expect(ids[ids.indexOf('barbell-bench-press') + 1]).toBe('dumbbell-bench-press');
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'today-stopped-and-swapped', bench);

    // Nothing is left to change on the stopped bench press: its sheet says what happened instead.
    await bench.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByTestId('stopped-note')).toHaveText(
      /^Stopped: 1 of [0-9]+ sets done[.] Dumbbell Bench Press took over the rest[.]$/,
    );
    await expect(sheet.getByTestId('skip-today')).toHaveCount(0);
    await expect(sheet.getByTestId('use-alternative')).toHaveCount(0);
    await capture(page, testInfo, 'stopped-sheet', sheet.getByTestId('stopped-note'));
    await sheet.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(sheet).toBeHidden();

    // Workout: the dumbbells are up with nothing logged against them, and their dial does not
    // start from the barbell's weight.
    await page.goto('./#/workout');
    await expect(activeCard(page)).toHaveAttribute('aria-label', /^Dumbbell Bench Press,/);
    await expect(activeCard(page)).toHaveAttribute('aria-label', /0 of \d+ sets done/);
    // A weight of their own: never none, and never the barbell's.
    await expect(page.getByTestId('logger-weight')).toHaveText(/[0-9]/);
    await expect(page.getByTestId('logger-weight')).not.toHaveText(barbellDial);
    await capture(page, testInfo, 'workout-swapped-in', activeCard(page));
    // Its sheet here offers no set, order or session changes either.
    await page.getByText('Whole workout', { exact: true }).click();
    await page
      .getByRole('list', { name: 'Active workout list' })
      .getByRole('button', { name: /Barbell Bench Press/ })
      .click();
    await page
      .locator('[data-testid="exercise-card"][aria-label^="Barbell Bench Press,"]')
      .getByTestId('card-thumb')
      .click();
    const workoutSheet = page.getByRole('dialog');
    await expect(workoutSheet.getByTestId('stopped-note')).toContainText(
      'Dumbbell Bench Press took over the rest.',
    );
    await expect(workoutSheet.getByRole('button', { name: '+ Working set' })).toHaveCount(0);
    await expect(workoutSheet.getByRole('button', { name: 'Equipment busy' })).toHaveCount(0);
    await workoutSheet.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(workoutSheet).toBeHidden();

    // The dumbbells' sheet offers the bench press back; taking it picks the bench press up again.
    await page.goto('./#/today');
    await row(page, 'dumbbell-bench-press').click();
    await page.getByRole('button', { name: 'Use Barbell Bench Press instead' }).click();
    await settle(page);
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      'Swapped Dumbbell Bench Press for Barbell Bench Press.',
    );
    await expect(row(page, 'barbell-bench-press').getByTestId('entry-meta')).not.toContainText(
      'Stopped',
    );
    await expect(row(page, 'dumbbell-bench-press')).toHaveCount(0);
  });

  test('Undo steps aside once a set is logged on the exercise a swap brought in', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(activeCard(page)).toHaveAttribute('aria-label', /^Barbell Bench Press,/);
    await skipWarmupIfShown(page);
    await page.getByTestId('log-set').click();
    await page.goto('./#/today');
    await row(page, 'barbell-bench-press').click();
    await page.getByRole('button', { name: 'Use Dumbbell Bench Press instead' }).click();
    await settle(page);
    const undo = page.getByTestId('recalibration-summary').getByRole('button', { name: 'Undo' });
    await expect(undo).toBeVisible();

    // A set of the dumbbells logged: Undo would lose it, so it is no longer offered.
    await page.goto('./#/workout');
    await expect(activeCard(page)).toHaveAttribute('aria-label', /^Dumbbell Bench Press,/);
    await skipWarmupIfShown(page);
    await page.getByTestId('logger-weight').click();
    await page.getByRole('spinbutton', { name: 'Weight' }).fill('40');
    await page.keyboard.press('Enter');
    await page.getByTestId('log-set').click();
    await expect(activeCard(page)).toHaveAttribute('aria-label', /1 of [0-9]+ sets done/);
    await expect(page.getByTestId('recalibration-summary')).toBeVisible();
    await expect(undo).toHaveCount(0);
    await page.goto('./#/today');
    await expect(page.getByTestId('recalibration-summary')).toBeVisible();
    await expect(undo).toHaveCount(0);
  });

  test('a swap kept for a few weeks shows on Plan until it is stopped', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('workout-entry').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const keep = dialog.getByRole('switch', { name: /Keep it for the next 4 weeks/ });
    // Turned on and the sheet closed, it is off again the next time the sheet opens.
    await keep.click();
    await expect(keep).toHaveAttribute('aria-checked', 'true');
    await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(dialog).toBeHidden();
    await page.getByTestId('workout-entry').first().click();
    await expect(keep).toHaveAttribute('aria-checked', 'false');
    await keep.click();
    await expect(keep).toHaveAttribute('aria-checked', 'true');
    await capture(page, testInfo, 'swap-keep-switch', keep);
    const use = dialog.getByTestId('use-alternative').first();
    const name = ((await use.getAttribute('aria-label')) ?? '').replace(/^Use | instead$/g, '');
    expect(name.length).toBeGreaterThan(0);
    await use.click();
    await settle(page);
    await expect(page.getByTestId('recalibration-summary')).toContainText(/Swapped .+ for .+\./);

    await page.goto('./#/plan');
    const line = page.getByTestId('lasting-swap');
    await expect(line).toContainText(`${name} in place of`);
    await expect(line).toContainText('wherever it fits');
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'plan-lasting-swap', line);
    await page.getByTestId('lasting-swap-stop').click();
    await expect(line).toHaveCount(0);
  });
});
