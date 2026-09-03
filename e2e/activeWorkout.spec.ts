import { expect, test, type Page } from '@playwright/test';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Phase 5 flows: start the workout, log sets with one tap, rest timer, inline
 * corrections, pause and resume, the combined superset card, completion with
 * a rating, and the next session generated from the new history.
 */

async function startWorkout(page: Page): Promise<void> {
  await ensureProfile(page);
  await page.getByTestId('start-workout').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
  await expect(page.getByTestId('workout-stats')).toBeVisible();
}

/** Logs sets (skipping rests) until the superset card is the current block. */
async function reachSuperset(page: Page): Promise<void> {
  for (let guard = 0; guard < 40; guard += 1) {
    if (await page.getByTestId('superset-group').isVisible()) return;
    const skipWarmup = page.getByTestId('skip-warmup');
    if (await skipWarmup.isVisible()) {
      await skipWarmup.click();
      continue;
    }
    await page.getByTestId('log-set').click();
    const skipRest = page.getByTestId('skip-rest');
    if (await skipRest.isVisible()) await skipRest.click();
  }
  throw new Error('superset never became current');
}

test.describe('active workout', () => {
  test('one-tap logging, rest timer, inline correction, pause, and an early finish', async ({
    page,
  }) => {
    await startWorkout(page);
    const card = page.getByTestId('exercise-card').first();
    await expect(card.getByTestId('target-line')).toContainText('Ramp set');
    await page.getByTestId('skip-warmup').click();
    await expect(card.getByTestId('target-line')).toContainText('Set 1 of');

    await page.getByTestId('log-set').click();
    await expect(page.locator('[data-testid="set-row"][data-state="done"]')).toHaveCount(1);
    const timer = page.getByTestId('rest-timer');
    await expect(timer).toBeVisible();
    await expect(timer).toContainText('Next: Barbell Bench Press · set 2 of');
    await timer.getByRole('button', { name: '+15 s' }).click();
    await page.getByTestId('skip-rest').click();
    await expect(timer).toBeHidden();

    // Skipped ramp rows come first; correct the logged working set.
    const doneValue = page.locator(
      '[data-testid="set-row"][data-state="done"] [data-testid="logged-value"]',
    );
    await doneValue.first().click();
    const editor = page.locator('[data-testid="set-logger"][data-mode="edit"]');
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Increase reps' }).click();
    await editor.getByRole('button', { name: 'Save set' }).click();
    await expect(editor).toBeHidden();
    await expect(doneValue.first()).toContainText('× 7');
    await expect(page.locator('[data-testid="set-logger"][data-mode="log"]')).toBeVisible();

    await page.getByTestId('pause-toggle').click();
    await expect(page.getByTestId('pause-toggle')).toHaveText('Resume');
    await page.getByTestId('pause-toggle').click();
    await expect(page.getByTestId('pause-toggle')).toHaveText('Pause');
    await expectNoHorizontalOverflow(page);

    await page.getByTestId('end-early').click();
    await expect(page.getByRole('dialog', { name: 'End the workout early?' })).toBeVisible();
    await page.getByRole('radio', { name: 'About right' }).click();
    await page.getByTestId('save-workout').click();
    const summary = page.getByTestId('completion-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Sets');
    await expect(
      page.getByText('Ended early; logged work is saved exactly as entered.'),
    ).toBeVisible();

    await page.getByTestId('completion-done').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Push + arms' })).toHaveCount(0);
    await expect(page.getByText('1 logged workouts')).toBeVisible();
  });

  test('a superset logs round by round with both moves together and no rest between them', async ({
    page,
  }) => {
    await startWorkout(page);
    await reachSuperset(page);
    const group = page.getByTestId('superset-group');
    await expect(group.getByTestId('round-counter')).toContainText('Round 1 of');
    await expect(group.locator('[data-testid="exercise-card"][data-active="true"]')).toHaveCount(1);
    const firstActive = await group
      .locator('[data-testid="exercise-card"][data-active="true"]')
      .getAttribute('data-entry-id');

    await page.getByTestId('log-set').click();
    await expect(page.getByTestId('rest-timer')).toBeHidden();
    const secondActive = await group
      .locator('[data-testid="exercise-card"][data-active="true"]')
      .getAttribute('data-entry-id');
    expect(secondActive).not.toBe(firstActive);

    await page.getByTestId('log-set').click();
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await expect(group.getByTestId('round-value')).toHaveCount(2);
    await expect(group.getByTestId('round-counter')).toContainText('Round 2 of');
    await group.getByTestId('round-value').first().click();
    await expect(page.locator('[data-testid="set-logger"][data-mode="edit"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('notes, plate math, and the active session survive a reload', async ({ page }) => {
    await startWorkout(page);
    await page.getByTestId('skip-warmup').click();
    await page.getByTestId('logger-weight').click();
    await page.getByRole('spinbutton', { name: 'Weight' }).fill('185');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('logger-weight')).toContainText('185');
    await page.getByTestId('plates-tab').click();
    await expect(page.getByTestId('plate-math')).toContainText('Bar 45 + per side: 45, 25');
    await page.getByTestId('notes-tab').click();
    await page.getByLabel('Notes for Barbell Bench Press').fill('Bench 4, feet back');
    await page.getByTestId('save-notes').click();
    await expect(page.getByText('Saved and verified. Shown here every time.')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await page.getByTestId('notes-tab').click();
    await expect(page.getByLabel('Notes for Barbell Bench Press')).toHaveValue(
      'Bench 4, feet back',
    );
  });

  test('works at 150 percent zoom on a phone (275 px) and at 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 275, height: 600 });
    await startWorkout(page);
    await expectNoHorizontalOverflow(page);
    await page.getByTestId('skip-warmup').click();
    await expect(page.getByTestId('log-set')).toBeVisible();
    await page.getByTestId('log-set').click();
    await expect(page.locator('[data-testid="set-row"][data-state="done"]')).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await expectNoHorizontalOverflow(page);
  });
});
