import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile } from './helpers';

/**
 * Maintenance 12, round B: a plate missing today puts the bar's targets on the
 * grid the rack can make, the target line glows gold while the dial sits under
 * it and opens Plates on a tap, the finish and the check-in ask in words, the
 * Location control looks like the control it is, and a custom exercise says
 * how it loads.
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

async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
}

function firstNumber(text: string | null): number {
  return Number(/\d+(?:\.\d+)?/.exec(text ?? '')?.[0]);
}

/** Logs ramp sets until the first working set is in front of the logger. */
async function reachWorkingSet(page: Page, card: Locator): Promise<void> {
  for (let guard = 0; guard < 5; guard += 1) {
    const line = await card.getByTestId('target-line').textContent();
    if (line?.includes('Set 1 of')) return;
    await page.getByTestId('log-set').click();
    await skipRestIfShown(page);
  }
  await expect(card.getByTestId('target-line')).toContainText('Set 1 of');
}

test.describe('what the place can load', () => {
  test('a plate missing today moves every bar target onto the grid the rack can make', async ({
    page,
  }, testInfo) => {
    await startWorkout(page);
    const card = page.getByTestId('exercise-card').first();
    await expect(card.getByRole('button', { name: 'Increase weight by 5 lb' })).toBeVisible();
    await card.getByTestId('plates-tab').click();
    const editor = card.getByTestId('loading-editor');
    await expect(editor).toHaveAttribute('data-kind', 'plates');
    await expect(editor.getByTestId('missing-2.5')).toHaveAttribute('aria-pressed', 'false');

    await editor.getByTestId('missing-2.5').click();
    await settle(page);
    await expect(editor.getByTestId('missing-2.5')).toHaveAttribute('aria-pressed', 'true');
    // One row, plain meaning: the plate reads as off, and one line says what that does.
    await expect(editor.getByTestId('missing-2.5')).toHaveAttribute('data-state', 'off');
    await expect(editor.getByTestId('loading-note')).toHaveText(
      'No 2.5 today: the bar moves by 10 lb. Back next workout.',
    );
    // Without the 2.5s the bar moves by 10, and the plate line never asks for the missing plate.
    await expect(card.getByRole('button', { name: 'Increase weight by 10 lb' })).toBeVisible();
    const dial = firstNumber(await card.getByTestId('logger-weight').textContent());
    expect((dial - 45) % 10).toBe(0);
    const plateLine = card.getByText(/^(Bar \d|Empty bar)/).first();
    await expect(plateLine).toBeVisible();
    expect(await plateLine.textContent()).not.toContain('2.5');
    await capture(page, testInfo, 'workout-plates-not-today', editor);

    // Session-only: the chip comes back off and the finer step returns.
    await editor.getByTestId('missing-2.5').click();
    await settle(page);
    await expect(card.getByRole('button', { name: 'Increase weight by 5 lb' })).toBeVisible();
    await expect(editor.getByTestId('loading-note')).toHaveText('The bar moves by 5 lb.');

    // Once per place: Edit rack says which plates the gym never has, and All plates undoes it.
    await expect(editor).toHaveAttribute('data-mode', 'today');
    await editor.getByTestId('rack-edit').click();
    await expect(editor).toHaveAttribute('data-mode', 'rack');
    await expect(editor).toContainText('Plates at Gym');
    await editor.getByTestId('plate-35').click();
    await settle(page);
    await expect(editor.getByTestId('plate-35')).toHaveAttribute('data-state', 'off');
    await capture(page, testInfo, 'workout-plates-edit-rack', editor);
    await editor.getByTestId('rack-edit').click();
    await expect(editor.getByTestId('missing-35')).toHaveCount(0);
    await expect(editor.getByTestId('missing-45')).toBeVisible();
    await editor.getByTestId('rack-edit').click();
    await editor.getByTestId('rack-all').click();
    await settle(page);
    await editor.getByTestId('rack-edit').click();
    await expect(editor.getByTestId('missing-35')).toBeVisible();
  });

  test('the target line glows while the dial sits under it, and opens Plates on a tap', async ({
    page,
  }, testInfo) => {
    await startWorkout(page);
    const card = page.getByTestId('exercise-card').first();
    await reachWorkingSet(page, card);
    const hint = card.getByTestId('weight-hint');
    await expect(hint).not.toHaveAttribute('data-pulse', 'true');
    // Log the first working set two steps light; the second set's dial starts where you left it.
    await card.getByRole('button', { name: /^Decrease weight/ }).click();
    await card.getByRole('button', { name: /^Decrease weight/ }).click();
    await page.getByTestId('log-set').click();
    await skipRestIfShown(page);
    await settle(page);
    await expect(card.getByTestId('target-line')).toContainText('Set 2 of');
    const target = firstNumber(await hint.textContent());
    const dial = firstNumber(await card.getByTestId('logger-weight').textContent());
    expect(dial).toBeLessThan(target);
    await expect(hint).toHaveAttribute('data-pulse', 'true');
    // The target line is the same size as the other two and never cut off.
    const sizes = await card.evaluate((element) => {
      const size = (id: string) => {
        const node = element.querySelector(`[data-testid="${id}"]`);
        return node ? getComputedStyle(node).fontSize : null;
      };
      const weight = element.querySelector('[data-testid="weight-hint"]');
      return {
        weight: size('weight-hint'),
        reps: size('reps-hint'),
        cut: weight ? weight.scrollWidth > weight.clientWidth + 1 : true,
      };
    });
    expect(sizes.weight).toBe(sizes.reps);
    expect(sizes.cut).toBe(false);
    await capture(page, testInfo, 'workout-target-glow', hint);

    await hint.click();
    await expect(card.getByTestId('loading-editor')).toBeVisible();
    await card.getByRole('button', { name: /^Increase weight/ }).click();
    await expect(hint).not.toHaveAttribute('data-pulse', 'true');
  });

  test('the finish asks for energy in words', async ({ page }, testInfo) => {
    await startWorkout(page);
    await page.getByTestId('log-set').click();
    await skipRestIfShown(page);
    await page.getByTestId('end-early').click();
    const sheet = page.getByRole('dialog', { name: 'End the workout early?' });
    await expect(sheet).toBeVisible();
    const energy = sheet.getByTestId('energy-after');
    await expect(energy).toContainText('Drained');
    await expect(energy).toContainText('Full');
    await expect(energy.getByRole('radio', { name: /^\d$/ })).toHaveCount(0);
    await energy.getByRole('radio', { name: 'Good' }).click();
    await expect(energy.getByRole('radio', { name: 'Good' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await capture(page, testInfo, 'finish-energy-words', energy);
    await sheet.getByRole('radio', { name: 'About right' }).click();
    await page.getByTestId('save-workout').click();
    await expect(page.getByTestId('completion-summary')).toBeVisible();
  });

  test('Today: the Location control looks like a control, and the check-in asks in words', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    const control = page.getByTestId('location-open');
    await expect(control).toBeVisible();
    await expect(control).toContainText('›');
    const border = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.borderTopWidth, style: style.borderTopStyle, cursor: style.cursor };
    });
    expect(border.style).not.toBe('none');
    expect(parseFloat(border.width)).toBeGreaterThan(0);
    expect(border.cursor).toBe('pointer');
    await capture(page, testInfo, 'today-location-control', control);

    await page.getByTestId('readiness-open').click();
    const sheet = page.getByRole('dialog', { name: 'Quick check-in' });
    await expect(sheet).toBeVisible();
    await expect(
      sheet
        .getByRole('radiogroup', { name: 'Motivation' })
        .getByRole('radio', { name: 'Fired up' }),
    ).toBeVisible();
    await expect(
      sheet.getByRole('radiogroup', { name: 'Soreness' }).getByRole('radio', { name: 'Wrecked' }),
    ).toBeVisible();
    await expect(sheet.getByRole('radio', { name: /^\d$/ })).toHaveCount(0);
    await sheet
      .getByRole('radiogroup', { name: 'Energy' })
      .getByRole('radio', { name: 'Good' })
      .click();
    await capture(page, testInfo, 'today-checkin-words', sheet);
    await sheet.getByTestId('readiness-apply').click();
    await settle(page);
    await expect(page.getByTestId('readiness-summary')).toContainText('Energy 4/5');
  });

  test('a custom exercise says how it loads', async ({ page }, testInfo) => {
    await ensureProfile(page);
    await page.goto('./#/library');
    await page.getByTestId('add-custom-exercise').click();
    const load = page.getByTestId('custom-load');
    await expect(load).toBeVisible();
    await expect(load.locator('option')).toContainText([
      /Decide from the equipment/,
      'Machine stack (pin)',
      'Bar with plates',
      'Dumbbells, one in each hand',
    ]);
    await load.selectOption('stack');
    await expect(load).toHaveValue('stack');
    await capture(page, testInfo, 'library-custom-load', load);
  });
});
