import { expect, test, type Page } from '@playwright/test';
import { ensureProfile } from './helpers';

/**
 * Maintenance 27, the owner's review on the phone (`docs/reports/maintenance-27.md`, Review on the
 * phone), walked as written on a fresh profile, so every line it quotes is the app's own: a lift to
 * push, a reserve check, each lift's curve, and what the app has learned.
 */

async function openSettingsRow(page: Page, name: string): Promise<void> {
  await page.goto('./#/settings');
  const row = page.getByTestId(`row-${name}`);
  await row.scrollIntoViewIfNeeded();
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
}

async function saved(page: Page): Promise<void> {
  await expect(page.getByTestId('settings-save-status')).toHaveText(
    'Saved and verified on this device',
  );
}

/** Types a value into one of the set logger's fields. */
async function typeInto(page: Page, field: string, label: string, value: string): Promise<void> {
  await page.getByTestId(`logger-${field}`).click();
  const input = page.getByRole('spinbutton', { name: label, exact: true });
  await input.fill(value);
  await input.press('Enter');
}

const checkSwitch = (page: Page) =>
  page.getByRole('switch', { name: /Check how well I judge reps in reserve/ });

test.describe('the phone review of round I', () => {
  test('runs as the report writes it', async ({ page }) => {
    test.setTimeout(300_000);
    await ensureProfile(page);

    // 1. Two sessions a week, and the bench press to push.
    await openSettingsRow(page, 'schedule');
    await page
      .getByRole('radiogroup', { name: 'Sessions per week' })
      .getByRole('radio', { name: '2' })
      .click();
    await saved(page);
    await openSettingsRow(page, 'push');
    const editor = page.getByTestId('push-lift-editor');
    await editor.getByLabel('Lift', { exact: true }).selectOption('barbell-bench-press');
    await editor.getByLabel('Target max').fill('225');
    await saved(page);
    await expect(page.getByTestId('row-push')).toContainText('Barbell Bench Press to 225 lb');

    // 2. Today: it leads, and Why this workout says so.
    await page.goto('./#/today');
    const first = page.getByTestId('workout-entry').first();
    await expect(first).toHaveAttribute('data-exercise-id', 'barbell-bench-press');
    await expect(first).toContainText('Lift to push');
    await page.getByText('Why this workout').click();
    await expect(
      page.getByText(
        'Barbell Bench Press leads: the lift you are pushing to 225 lb goes first, where a lift gains most (Nunes et al. 2021).',
      ),
    ).toBeVisible();

    // 3. Progress: no reading yet, and what a reading is.
    await page.goto('./#/progress');
    await expect(page.getByText('Barbell Bench Press to 225 lb')).toBeVisible();
    await expect(page.getByTestId('push-pace')).toHaveText('No reading yet');
    await expect(
      page.getByText(
        'A reading is its first working set each session, at 12 reps or fewer with 3 or fewer in reserve.',
      ),
    ).toBeVisible();

    // 4. Reserve checks on.
    await openSettingsRow(page, 'programming');
    await checkSwitch(page).click();
    await saved(page);

    // 5. The workout, logged as filled in up to the check.
    await page.goto('./#/today');
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    for (let guard = 0; guard < 80; guard += 1) {
      if (await page.getByTestId('check-note').isVisible()) break;
      const skipWarmup = page.getByTestId('skip-warmup');
      if (await skipWarmup.isVisible()) {
        await skipWarmup.click();
        continue;
      }
      // A lift with no weight to fill in yet takes any.
      if (!/\d/.test((await page.getByTestId('logger-weight').textContent()) ?? '')) {
        await typeInto(page, 'weight', 'Weight', '95');
      }
      await page.getByTestId('log-set').click();
      const skipRest = page.getByTestId('skip-rest');
      if (await skipRest.isVisible()) await skipRest.click();
    }
    await expect(page.getByTestId('check-note')).toContainText('Reserve check:');
    // Its set list says the last set goes to failure.
    await expect(page.getByText(/the last to failure/).first()).toBeVisible();
    await page.getByTestId('check-failed-early').click();
    await page.getByTestId('check-stopped').click();
    await expect(page.getByTestId('check-failed-early')).not.toBeChecked();
    await page.getByTestId('check-stopped').click();
    await expect(page.getByTestId('check-stopped')).not.toBeChecked();
    await typeInto(page, 'reps', 'Reps at your stop', '12');
    await typeInto(page, 'rir', 'RIR', '1');
    await typeInto(page, 'total', 'Reps in all', '15');
    await page.getByTestId('log-set').click();
    await expect(
      page.getByText(
        'You judged 1 left at 12 and did 15 in all: 3 were left, 2 reps more than you judged.',
      ),
    ).toBeVisible();

    // 6. Finished and saved: still learning.
    const skipRest = page.getByTestId('skip-rest');
    if (await skipRest.isVisible()) await skipRest.click();
    await page.getByTestId('end-early').click();
    await page.getByTestId('save-workout').click();
    await expect(page.getByTestId('completion-summary')).toBeVisible();
    await page.getByTestId('completion-done').click();
    await openSettingsRow(page, 'learned');
    const learned = page.getByTestId('learned-values');
    await expect(learned.getByTestId('learned-reserve')).toContainText(
      'Still learning: 1 check of the 4 it needs.',
    );

    // 7. The curve: learning, not in use; then the checks off.
    const curves = learned.getByTestId('learned-curves');
    await expect(curves).toContainText('Learning: not in use on any lift yet.');
    await expect(curves).toContainText('not sure enough yet, from 1 set to failure');
    await openSettingsRow(page, 'programming');
    await checkSwitch(page).click();
    await saved(page);
    await openSettingsRow(page, 'learned');
    await expect(page.getByTestId('learned-reserve')).toContainText(
      'Reserve checks are off: nothing is read through your 1 check.',
    );

    // 8. Progress: a baseline from the session's reading.
    await page.goto('./#/progress');
    await expect(
      page.getByText(
        'Building a baseline: 1 reading so far, 9 more sessions and 6 more weeks to go.',
      ),
    ).toBeVisible();
    await expect(page.getByText(/^Now about \d+ lb \(estimated max\)\.$/)).toBeVisible();

    // 9. The push ended.
    await openSettingsRow(page, 'push');
    await page.getByTestId('push-lift-editor').getByLabel('Lift', { exact: true }).selectOption('');
    await saved(page);
    await page.goto('./#/today');
    await expect(page.getByTestId('workout-entry').first()).toBeVisible();
    await expect(page.getByTestId('workout-entry').filter({ hasText: 'Lift to push' })).toHaveCount(
      0,
    );

    // 10 and 11. What the app has learned, and a reset that asks once more.
    await openSettingsRow(page, 'learned');
    const reserve = page.getByTestId('learned-reserve');
    await reserve.getByTestId('learned-reset-reserve').click();
    await expect(reserve.getByTestId('learned-confirm-reserve')).toHaveText(
      'Confirm: start learning again',
    );
    await expect(reserve.getByRole('button', { name: 'Keep it' })).toBeVisible();
    await reserve.getByTestId('learned-confirm-reserve').click();
    await expect(reserve).toContainText('Last reset');
  });
});
