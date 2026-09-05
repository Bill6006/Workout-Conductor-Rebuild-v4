import { expect, test, type Page } from '@playwright/test';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Phase 6 flows: the one gold Adaptive Coach card, the readiness check-in that
 * recalibrates the session, next-target evidence on the active workout, and
 * coach feedback on the completion surface.
 */

const STALLED_BENCH = Buffer.from(
  JSON.stringify({
    history: [28, 21, 14, 7].map((daysAgo) => ({
      date: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      unit: 'lb',
      exercises: [
        {
          name: 'Barbell Bench Press',
          sets: [
            { weight: 185, reps: 5, rir: 2 },
            { weight: 185, reps: 5, rir: 2 },
            { weight: 185, reps: 5, rir: 2 },
          ],
        },
      ],
    })),
  }),
);

/** Four bench sessions at the same load and effort, imported as older history. */
async function importStalledBench(page: Page): Promise<void> {
  await page.goto('./#/settings');
  await page.getByTestId('legacy-file-input').setInputFiles({
    name: 'old-history.json',
    mimeType: 'application/json',
    buffer: STALLED_BENCH,
  });
  await expect(page.getByRole('dialog', { name: 'Import these workouts?' })).toBeVisible();
  await page.getByTestId('legacy-confirm').click();
  await expect(
    page.locator('[role="status"]').filter({ hasText: 'Imported and verified 4 workouts' }),
  ).toBeVisible();
  // A fresh backup, so the coach's save reminder does not outrank the stall.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Full Backup JSON' }).click();
  await download;
  await page.goto('./#/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
}

test.describe('adaptive coach', () => {
  test('shows one gold coach card with concise evidence and no unrequested changes', async ({
    page,
  }) => {
    await ensureProfile(page);
    const card = page.getByTestId('coach-card');
    await expect(card).toBeVisible();
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('coach-headline')).toBeVisible();
    // Beginners get the explained card; intermediate and advanced lifters get one quiet line.
    if ((await card.getAttribute('data-tone')) === 'brief') {
      await expect(card.getByRole('list', { name: 'Why' })).toHaveCount(0);
    } else {
      await expect(card.getByRole('list', { name: 'Why' }).getByRole('listitem')).toHaveCount(1);
    }
    await expect(card).toContainText(/Nothing is applied without your tap|No signal outranks/);
    expect(await card.getByTestId('coach-action').count()).toBeLessThanOrEqual(1);
    await expectNoHorizontalOverflow(page);
  });

  test('a low readiness check-in adjusts the session and moves the coach to recovery', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.getByTestId('readiness-open').click();
    const sheet = page.getByRole('dialog', { name: 'Quick check-in' });
    await expect(sheet).toBeVisible();
    await sheet
      .getByRole('radiogroup', { name: 'Energy' })
      .getByRole('radio', { name: '1' })
      .click();
    await sheet
      .getByRole('radiogroup', { name: 'Sleep' })
      .getByRole('radio', { name: '1' })
      .click();
    await sheet
      .getByRole('radiogroup', { name: 'Soreness' })
      .getByRole('radio', { name: '5' })
      .click();
    await sheet.getByTestId('readiness-apply').click();

    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    await expect(page.getByTestId('recalibration-summary')).toContainText(/Adjusted for today/);
    await expect(page.getByTestId('readiness-summary')).toContainText('Energy 1/5');
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-domain', 'recovery');
    await expect(page.getByTestId('coach-headline')).toContainText(
      /Fatigue is building|Recovery first/,
    );
  });

  test('every card carries a load target and its evidence during the workout', async ({ page }) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await page.getByRole('tab', { name: 'How to' }).first().click();
    const evidence = page.getByTestId('progression-evidence').first();
    await expect(evidence).toContainText('First time logged');
    await page.getByTestId('skip-warmup').click();
    await page.getByTestId('logger-weight').click();
    await page.getByRole('spinbutton', { name: 'Weight' }).fill('185');
    await page.keyboard.press('Enter');
    await page.getByTestId('log-set').click();
    await page.getByTestId('skip-rest').click();
    await page.getByTestId('end-early').click();
    await page.getByTestId('save-workout').click();
    const summary = page.getByTestId('completion-summary');
    await expect(summary).toBeVisible();
    await expect(
      page.getByText(
        /^1 progressed, 0 on target, 0 short\.|^0 progressed, 1 on target, 0 short\.|^0 progressed, 0 on target, 1 short\./,
      ),
    ).toBeVisible();
    await page.getByTestId('completion-done').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByTestId('coach-card')).toBeVisible();
  });

  test('a stalled lift shows its route and one tap applies the first step to today', async ({
    page,
  }) => {
    await ensureProfile(page);
    await importStalledBench(page);
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-domain', 'plateau');
    await expect(card.getByTestId('coach-headline')).toHaveText(
      'Barbell Bench Press has stalled for 4 exposures at the prescribed effort',
    );
    await expect(card).toContainText(/Route: 1 shift the rep range \(now\)/);
    const action = card.getByTestId('coach-action');
    await expect(action).toHaveText(/^Shift to 6-10 reps for two weeks$/);
    await action.click();
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    await expect(page.getByTestId('recalibration-summary')).toBeVisible();
    await expect(
      page.locator('[data-testid="workout-entry"][data-exercise-id="barbell-bench-press"]'),
    ).toContainText('6-10');
    await expectNoHorizontalOverflow(page);
  });
});
