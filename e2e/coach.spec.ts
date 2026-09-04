import { expect, test } from '@playwright/test';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Phase 6 flows: the one gold Adaptive Coach card, the readiness check-in that
 * recalibrates the session, next-target evidence on the active workout, and
 * coach feedback on the completion surface.
 */

test.describe('adaptive coach', () => {
  test('shows one gold coach card with concise evidence and no unrequested changes', async ({
    page,
  }) => {
    await ensureProfile(page);
    const card = page.getByTestId('coach-card');
    await expect(card).toBeVisible();
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('coach-headline')).toBeVisible();
    await expect(card.getByRole('list', { name: 'Why' }).getByRole('listitem')).toHaveCount(1);
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
});
