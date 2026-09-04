import { expect, test, type Page } from '@playwright/test';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Phase 7 flows: history and explained scores on Progress, the week plan,
 * weekly targets, recovery balance, and saved workouts on Plan, and the
 * extended session summary.
 */

async function completeOneSet(page: Page, weight: string) {
  await page.getByTestId('start-workout').click();
  await expect(page.getByTestId('workout-stats')).toBeVisible();
  await page.getByTestId('skip-warmup').click();
  await page.getByTestId('logger-weight').click();
  await page.getByRole('spinbutton', { name: 'Weight' }).fill(weight);
  await page.keyboard.press('Enter');
  await page.getByTestId('log-set').click();
  await page.getByTestId('skip-rest').click();
  await page.getByTestId('end-early').click();
  await page.getByTestId('save-workout').click();
  await expect(page.getByTestId('completion-summary')).toBeVisible();
}

test.describe('progress and plan', () => {
  test('the session summary shows next targets and focus, then Progress explains every score', async ({
    page,
  }) => {
    await ensureProfile(page);
    await completeOneSet(page, '185');
    await expect(page.getByText(/^Next focus: /)).toBeVisible();
    await expect(page.getByTestId('next-targets')).toContainText(/× \d+-\d+/);
    await page.getByTestId('completion-done').click();

    await page.goto('./#/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
    await expect(page.getByTestId('consistency-hero')).toContainText(/1 of \d/);
    await expect(page.getByTestId('coverage-row').first()).toBeVisible();
    await expect(page.getByTestId('coverage-row').first()).toContainText(/under|in band|over/);
    expect(await page.getByTestId('score-panel').count()).toBeGreaterThanOrEqual(4);
    await page.getByTestId('score-panel').first().locator('summary').click();
    await expect(page.getByTestId('score-panel').first()).toContainText(
      /samples? · (none|low|medium|high) confidence/,
    );
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await page.getByTestId('history-row').first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('185');
    await page.keyboard.press('Escape');
    await expectNoHorizontalOverflow(page);
  });

  test('Plan shows the week, weekly targets, recovery balance, and saved workouts', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.goto('./#/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
    const week = page.getByTestId('week-plan');
    await expect(week).toBeVisible();
    await expect(week.getByRole('listitem').first()).toContainText('Today');
    await expect(page.getByTestId('weekly-targets')).toBeVisible();
    await expect(page.getByTestId('recovery-balance')).toContainText(/Fresh/);

    await page.getByTestId('saved-workout-name').fill('Push day A');
    await page.getByTestId('save-workout-button').click();
    const saved = page.getByTestId('saved-workout-row');
    await expect(saved).toHaveCount(1);
    await expect(saved.first()).toContainText('Push day A');
    await page.reload();
    await expect(page.getByTestId('saved-workout-row')).toHaveCount(1);

    await page.getByTestId('use-saved-workout').first().click();
    await page.goto('./#/today');
    await expect(page.getByTestId('recalibration-summary')).toContainText('Loaded "Push day A"');
    await expectNoHorizontalOverflow(page);
  });
});
