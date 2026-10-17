import { expect, test } from '@playwright/test';
import { ensureProfile } from './helpers';

/**
 * Maintenance 30 (round L), the owner's items 6, 30 and 31, in the browser:
 * - 6, the tab is Plates on a bar and Weights on a machine's stack and on dumbbells, and each
 *   place's weights are set in Settings;
 * - 30, a machine that comes both ways is set to its pin stack or to plates, kept for the place;
 * - 31, the loaded versions of the bodyweight moves are in the catalog (the rule that picks them
 *   is in src/engine/workoutGenerator/loadedVersions.test.ts).
 */

test.describe('the weights at each place (items 6 and 30)', () => {
  test('a machine set to plates at the gym stays so, and Home shows its dumbbells only', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.goto('./#/settings/weights');
    const weights = page.getByTestId('place-weights');
    await expect(weights).toBeVisible();
    await weights.getByRole('radio', { name: 'Gym' }).click();
    await expect(weights.getByTestId('place-weights-plates')).toContainText('Plates at Gym');
    // The default gym has kettlebells too, which share the dumbbells' record: named for both.
    await expect(weights.getByTestId('place-weights-dumbbells')).toContainText(
      'Dumbbells and kettlebells at Gym',
    );

    const machines = weights.getByTestId('place-weights-machines');
    await machines.getByTestId('place-weights-machine').selectOption('leg-press-calf-raise');
    await expect(machines.getByTestId('machine-load-stack')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await machines.getByTestId('machine-load-plates').click();
    await expect(machines.getByTestId('machine-load-plates')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(machines.getByTestId('machine-plates-note')).toHaveText(
      'Its weight is the plates loaded on it, the same on each side; the sled is not counted.',
    );
    await expect(machines.getByTestId('plates-mode-hint')).toHaveText('Plates at Gym');

    // Kept for the gym, on the device: read again after a reload.
    await page.reload();
    await expect(weights).toBeVisible();
    await weights.getByRole('radio', { name: 'Gym' }).click();
    await machines.getByTestId('place-weights-machine').selectOption('leg-press-calf-raise');
    await expect(machines.getByTestId('machine-load-plates')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await machines.getByTestId('machine-load-stack').click();
    await expect(machines.getByTestId('machine-load-stack')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(machines.getByTestId('loading-summary')).toContainText('Not set yet');

    // Home has dumbbells, a bench, a bar to hang from and bands: no rack, no machine.
    await weights.getByRole('radio', { name: 'Home' }).click();
    await expect(weights.getByTestId('place-weights-dumbbells')).toContainText('Dumbbells at Home');
    await expect(weights.getByTestId('place-weights-plates')).toHaveCount(0);
    await expect(weights.getByTestId('place-weights-machines')).toHaveCount(0);
  });

  test('a workout names the tab Plates on its bar and Weights on its machines and dumbbells', async ({
    page,
  }) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    const cards = page.getByTestId('exercise-card');
    await expect(cards.first().getByTestId('plates-tab')).toHaveText('Plates');
    // Every other block, viewed from the whole workout's list.
    await page.getByText('Whole workout').click();
    const rows = page.getByRole('list', { name: 'Active workout list' }).getByRole('button');
    const count = await rows.count();
    expect(count).toBeGreaterThan(1);
    const names: string[] = [];
    for (let index = 1; index < count; index += 1) {
      await rows.nth(index).click();
      await expect(rows.nth(index)).toHaveAttribute('aria-pressed', 'true');
      names.push(...(await page.getByTestId('plates-tab').allTextContents()));
    }
    expect(names.every((name) => name === 'Plates' || name === 'Weights')).toBe(true);
    expect(names).toContain('Weights');
  });
});

test.describe('the loaded versions of bodyweight moves (item 31)', () => {
  test('are in the Library', async ({ page }) => {
    await ensureProfile(page);
    await page.goto('./#/library');
    await expect(page.getByTestId('library-count')).toContainText('86 exercises');
    const search = page
      .getByRole('searchbox', { name: 'Search exercises' })
      .or(page.getByRole('textbox', { name: 'Search exercises' }));
    for (const name of [
      'Dumbbell Reverse Lunge',
      'Dumbbell Bulgarian Split Squat',
      'Standing Calf Raise Machine',
    ]) {
      await search.fill(name);
      await expect(page.getByTestId('library-row').filter({ hasText: name })).toHaveCount(1);
    }
  });
});
