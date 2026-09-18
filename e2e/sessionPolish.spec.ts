import { expect, test } from '@playwright/test';
import { ensureProfile } from './helpers';

/**
 * Maintenance 8: session polish. The tempo detail reads as four labelled rows
 * with the research folded behind a closed disclosure, and the Location
 * control on Today opens a sheet instead of leaving the tab.
 */

test.describe('session polish', () => {
  test('the tempo detail reads as four rows with the research folded away', async ({ page }) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    const card = page.getByTestId('exercise-card').first();
    // The empty bar earns no ramp; a max gives the lift its ramps, so the ramp tempo shows first.
    await card.getByTestId('know-max').click();
    const sheet = page.getByRole('dialog', { name: /Your max for/ });
    await sheet.getByTestId('max-weight').fill('185');
    await sheet.getByTestId('max-reps').fill('5');
    await sheet.getByTestId('max-save').click();
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    await expect(card.getByTestId('target-line')).toContainText('Ramp 1 of');
    await card.getByTestId('tempo-line').click();
    const detail = card.getByTestId('tempo-detail');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('term')).toHaveText(['Tempo', 'Cue', 'Effort', 'Rest']);
    await expect(detail).not.toContainText('X is as fast as you can');

    const why = detail.getByTestId('tempo-why');
    await expect(why).not.toHaveAttribute('open', '');
    const research = detail.getByRole('list', { name: 'Why this tempo, effort, and rest' });
    await expect(research).toBeHidden();
    await why.locator('summary').click();
    await expect(research).toBeVisible();
    const items = research.getByRole('listitem');
    await expect(items.first().locator('strong')).toHaveText(/^[A-Z][a-z]+( [a-z]+)?\.$/);
    // One ramp-set line, not two; no rest-style line at the Standard rest style.
    await expect(items.filter({ hasText: 'Ramp sets.' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'Rest style.' })).toHaveCount(0);
  });

  test('the set list stays short when opened: finished ramps on one line, identical sets in one row', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    const card = page.getByTestId('exercise-card').first();
    // A max gives the lift two ramps; log them and the first working set.
    await card.getByTestId('know-max').click();
    const sheet = page.getByRole('dialog', { name: /Your max for/ });
    await sheet.getByTestId('max-weight').fill('185');
    await sheet.getByTestId('max-reps').fill('5');
    await sheet.getByTestId('max-save').click();
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    for (let logged = 0; logged < 3; logged += 1) {
      await page.getByTestId('log-set').click();
      const skipRest = page.getByTestId('skip-rest');
      if (await skipRest.isVisible()) await skipRest.click();
    }
    await expect(card.getByTestId('target-line')).toContainText('Set 2 of');
    await card.getByTestId('sets-summary').click();
    const rows = card.getByTestId('set-row');
    // One line for the two ramps, one for the set done, one for the three still to come.
    await expect(rows).toHaveCount(3);
    await expect(card.getByTestId('ramps-summary')).toContainText('2 ramps');
    const upcoming = card.locator('[data-testid="set-row"][data-state="upcoming"]');
    await expect(upcoming).toHaveCount(1);
    await expect(upcoming).toContainText('Sets 2–4');
    await expect(upcoming).toHaveAttribute('data-count', '3');
    if (process.env.SCREENSHOT_DIR && testInfo.project.name === 'android-412') {
      await card.getByTestId('sets-collapse').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${process.env.SCREENSHOT_DIR}/android-412-workout-set-list-compact.png`,
      });
    }
    await card.getByTestId('sets-collapse').click();
    await expect(rows).toHaveCount(3);
    await expect(upcoming).toHaveCount(0);
  });

  test('Location on Today opens a sheet, switches the place, and stays on the tab', async ({
    page,
  }) => {
    await ensureProfile(page);
    await expect(page.getByTestId('location-open')).toContainText('Gym');
    await page.getByTestId('location-open').click();
    const sheet = page.getByRole('dialog', { name: 'Where are you training?' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('option', { selected: true })).toContainText('Gym');
    await sheet.getByTestId('location-option-home').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByTestId('location-open')).toContainText('Home');
    await expect(page.getByTestId('recalibration-summary')).toContainText(/Rebuilt for Home/);

    // The choice is the profile's: it survives a reload and Settings agrees.
    await page.reload();
    await expect(page.getByTestId('location-open')).toContainText('Home');
  });
});
