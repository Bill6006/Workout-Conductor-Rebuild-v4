import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile, expectNoHorizontalOverflow, skipWarmupIfShown } from './helpers';

/**
 * Maintenance 19, round A: what happens mid-workout. Moving from the gym to Home
 * keeps what was logged and fills the rest from Home; a plate missing in the middle
 * of an exercise moves the sets still to come onto what the plates make, and says
 * so by the target; Not now on a safety card sets it aside for the workout; Up next
 * names work not yet done.
 */

const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
}

const activeCard = (page: Page) =>
  page.locator('[data-testid="exercise-card"][data-active="true"]');

async function startAtGym(page: Page): Promise<void> {
  await ensureProfile(page);
  await expect(page.getByTestId('location-open')).toContainText('Gym');
  await page.getByTestId('start-workout').click();
  await expect(page.getByTestId('workout-stats')).toBeVisible();
}

test.describe('mid-workout', () => {
  test('moving to Home keeps what was logged and fills the rest from Home', async ({
    page,
  }, testInfo) => {
    await startAtGym(page);
    const list = page.getByRole('list', { name: 'Active workout list' });
    const openList = async () => {
      if (!(await list.isVisible())) await page.getByText('Whole workout', { exact: true }).click();
      await expect(list).toBeVisible();
    };
    await openList();
    const rowsBefore = await list.getByRole('listitem').count();
    expect(rowsBefore).toBeGreaterThan(2);
    // One working set of the barbell bench press at the gym.
    await expect(activeCard(page)).toHaveAttribute('aria-label', /^Barbell Bench Press,/);
    await skipWarmupIfShown(page);
    await page.getByTestId('log-set').click();
    await expect(activeCard(page)).toHaveAttribute('aria-label', /1 of \d+ sets done/);

    await page.goto('./#/today');
    await page.getByTestId('location-open').click();
    await page.getByTestId('location-option-home').click();
    await settle(page);
    await expect(page.getByTestId('recalibration-summary')).toContainText(/Rebuilt for Home/);

    await page.goto('./#/workout');
    await openList();
    // The bench press ends at its logged set, and Home takes the sets it owed.
    const bench = list.getByRole('listitem').filter({ hasText: 'Barbell Bench Press' });
    await expect(bench).toHaveAttribute('data-state', 'done');
    await expect(activeCard(page)).not.toHaveAttribute('aria-label', /^Barbell Bench Press,/);
    // Nothing was deleted: every row the gym had is still there, plus the replacement.
    expect(await list.getByRole('listitem').count()).toBeGreaterThanOrEqual(rowsBefore);
    await expect(page.getByText(/option fits Home/)).toHaveCount(0);
    // The rest still running from the gym names what comes next here.
    await expect(page.getByText(/^Next: Barbell Bench Press/)).toHaveCount(0);
    // Up next names work still to do.
    const upNext = page.getByText('Up next', { exact: true }).locator('xpath=..');
    const nextTitle = (await upNext.locator('h2, h3').first().textContent())?.trim() ?? '';
    expect(nextTitle.length).toBeGreaterThan(0);
    await expect(
      list.getByRole('listitem').filter({ hasText: nextTitle }).first(),
    ).not.toHaveAttribute('data-state', 'done');
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'moved-home', activeCard(page));
  });

  test('a plate missing mid-exercise moves the sets to come onto the plates, and says so', async ({
    page,
  }, testInfo) => {
    await startAtGym(page);
    // A max that gives the bench press a 160 lb target, which takes 2.5s.
    await page.getByTestId('options-tab').first().click();
    await page.getByTestId('edit-max').click();
    const sheet = page.getByRole('dialog', { name: /Your max for Barbell Bench Press/ });
    await sheet.getByTestId('max-weight').fill('195');
    await sheet.getByTestId('max-reps').fill('5');
    await sheet.getByTestId('max-save').click();
    await settle(page);
    // The max brings ramp sets to the working weight; past them, the first working set.
    await expect(page.getByTestId('weight-hint')).toHaveText(/^Warm-up/);
    await page.getByTestId('skip-warmup').click();
    await expect(page.getByTestId('weight-hint')).toHaveText('Target 160 lb');
    await page.getByTestId('log-set').click();

    // The 2.5s are not around today.
    await page.getByTestId('plates-tab').first().click();
    await page.getByTestId('missing-2.5').click();
    await settle(page);
    await expect(page.getByTestId('weight-hint')).toHaveText('Target 155 lb');
    await expect(page.getByTestId('target-note')).toHaveText(
      'No 2.5s today: 155 instead of 160, one extra rep.',
    );
    // The dial starts from what the plates make, and the plate line says what to load.
    await expect(page.getByTestId('logger-weight')).toContainText('155');
    await expect(page.getByText('Bar 45 + 45, 10 each side · 155 lb').first()).toBeVisible();
    await expect(page.getByText(/short\)/)).toHaveCount(0);
    await capture(page, testInfo, 'plate-missing-today', page.getByTestId('set-logger'));
    // The arrows step between weights the plates make.
    await page.getByRole('button', { name: /^Increase weight/ }).click();
    await expect(page.getByTestId('logger-weight')).toContainText('165');
    await page.getByRole('button', { name: /^Decrease weight/ }).click();
    await page.getByRole('button', { name: /^Decrease weight/ }).click();
    await expect(page.getByTestId('logger-weight')).toContainText('145');

    // The 2.5s are back: the target is what it was, and the line goes.
    await page.getByTestId('missing-2.5').click();
    await settle(page);
    await expect(page.getByTestId('weight-hint')).toHaveText('Target 160 lb');
    await expect(page.getByTestId('target-note')).toHaveCount(0);
  });

  test('Not now on a safety card sets it aside for this workout', async ({ page }, testInfo) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await page
      .getByRole('group', { name: 'Pain areas' })
      .getByRole('button', { name: 'Shoulder' })
      .click();
    // The saved profile rebuilds the session; Today says so once the rebuild is done.
    await page.goto('./#/today');
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      'Rebuilt for your updated profile',
      { timeout: 10_000 },
    );
    await settle(page);
    const headline = page.getByTestId('coach-headline');
    await expect(headline).toContainText('Watch your shoulder');
    await expect(page.getByText('Profile saved and verified on this device')).toBeHidden();
    await capture(page, testInfo, 'safety-card', page.getByTestId('coach-card'));

    await page.getByTestId('coach-dismiss').click();
    await expect(headline).not.toContainText('Watch your shoulder');
    // Still set aside after the app is opened again, and on the workout screen.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByText('Watch your shoulder')).toHaveCount(0);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await expect(page.getByText('Watch your shoulder')).toHaveCount(0);
  });
});
