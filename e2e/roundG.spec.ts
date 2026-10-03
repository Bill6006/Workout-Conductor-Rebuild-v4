import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile, skipWarmupIfShown } from './helpers';

/**
 * Maintenance 25, round G: issues the owner saw on the live app. Equipment busy moves a lift later
 * instead of swapping it out (item 37); "Why this workout" says each line once (item 39); a max's
 * preview is the target the plan then has (item 36).
 */

const screenshotDir = process.env.SCREENSHOT_DIR;

/** A capture for the round's folder, from the phone-width project only. */
async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  // The first-run toast would cover the picture; it is gone in a few seconds.
  await expect(page.getByText('Profile saved and verified on this device')).toHaveCount(0, {
    timeout: 10_000,
  });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

function exerciseIds(page: Page): Promise<(string | null)[]> {
  return page
    .getByTestId('workout-entry')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-exercise-id')));
}

async function settled(page: Page): Promise<void> {
  await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
}

test.describe('Equipment busy (Maintenance 25)', () => {
  test('moves a lift behind the next one each time, until it is the last, then is off', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    const before = await exerciseIds(page);
    const lead = before[0] as string;
    for (let guard = 0; guard < before.length; guard += 1) {
      await page.locator(`[data-testid="workout-entry"][data-exercise-id="${lead}"]`).click();
      const busy = page.getByTestId('equipment-busy');
      if (await busy.isDisabled()) break;
      const at = (await exerciseIds(page)).indexOf(lead);
      const summary = page.getByTestId('recalibration-summary');
      const before = (await summary.isVisible()) ? await summary.textContent() : null;
      await busy.click();
      await settled(page);
      // This move's own line, not the one before it.
      await expect(summary).not.toHaveText(before ?? '');
      await expect(summary).toContainText(/moved after .+: its equipment is busy\./);
      // Behind the next row: past one row, or past both moves of a pair.
      expect((await exerciseIds(page)).indexOf(lead)).toBeGreaterThan(at);
      if (guard === 0) await capture(page, testInfo, 'today-busy-moved', summary);
    }
    // Last of the workout: the button is off and says what is left to do.
    await expect(page.getByTestId('equipment-busy')).toBeDisabled();
    await expect(page.getByTestId('busy-reason')).toHaveText(
      'Nothing after it is left to do, so there is nothing to move it behind: do it when it comes up, or skip it today.',
    );
    await capture(page, testInfo, 'today-busy-off', page.getByTestId('busy-reason'));
    const after = await exerciseIds(page);
    expect(after.at(-1)).toBe(lead);
    // Nothing was swapped out or left out.
    expect([...after].sort()).toEqual([...before].sort());
    await expect(page.getByTestId('skip-today')).toBeEnabled();
  });

  test('brings the lift back once the exercise it gave way to is done', async ({ page }) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    // The whole-workout list sits in a closed details: read it as it is, open or not.
    const list = page.locator('ol[aria-label="Active workout list"]');
    const current = list.locator('li[data-state="current"]');
    const name = ((await current.textContent()) ?? '').replace(/now$/, '').trim();
    expect(name.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Options' }).first().click();
    await page.getByTestId('equipment-busy').click();
    await settled(page);
    // The next exercise leads; the busy one waits right behind it.
    await expect(current).not.toContainText(name);
    await expect(list.locator('li').nth(1)).toContainText(name);

    // Do the exercise in front: when it is done, the busy lift leads again.
    for (let guard = 0; guard < 30; guard += 1) {
      if (((await current.textContent()) ?? '').includes(name)) break;
      await skipWarmupIfShown(page);
      await page.getByTestId('log-set').click();
      const skipRest = page.getByTestId('skip-rest');
      if (await skipRest.isVisible()) await skipRest.click();
    }
    await expect(current).toContainText(name);
  });
});

test.describe('Why this workout (Maintenance 25)', () => {
  test('says each line once on a short session', async ({ page }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('duration-select').selectOption('15');
    await settled(page);
    const why = page.locator('details', { hasText: 'Why this workout' });
    await why.locator('summary').click();
    const lines = await why.locator('li').allTextContents();
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.filter((line, at) => lines.indexOf(line) !== at)).toEqual([]);
    expect(
      lines.filter((line) => line === 'Shortened rests toward the realistic minimum.'),
    ).toHaveLength(1);
    await capture(page, testInfo, 'today-why-once', why);
  });
});

test.describe('a max’s preview (Maintenance 25)', () => {
  test('is the target the lift has once the max is saved', async ({ page }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    await page.getByTestId('know-max').first().click();
    await page.getByTestId('max-weight').fill('135');
    await page.getByTestId('max-reps').fill('8');
    const preview = page.getByTestId('max-preview');
    await expect(preview).toContainText('Estimated max about 171 lb from that set.');
    const text = (await preview.textContent()) ?? '';
    const [, weight] = /First target: (\d+) lb × \d+-\d+ reps at RIR \d/.exec(text) ?? [];
    expect(Number(weight)).toBeGreaterThan(45);
    await capture(page, testInfo, 'workout-max-preview', preview);
    await page.getByTestId('max-save').click();
    await settled(page);
    // A bench at that weight ramps up to it: the ramp is skipped once its row is up.
    await page.getByTestId('skip-warmup').click();
    await expect(page.getByTestId('logger-weight').first()).toContainText(String(weight));
  });
});

test.describe('Settings, Plan and Progress as one layout (Maintenance 25)', () => {
  test('a link to a row of another tab lands on it, open and on screen', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.goto('./#/plan');
    await page.getByTestId('plan-days-link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    const schedule = page.getByTestId('row-schedule');
    await expect(schedule).toHaveAttribute('aria-expanded', 'true');
    await expect(schedule).toBeInViewport();
    await capture(page, testInfo, 'settings-schedule-from-plan');

    // And back: where you train lands on Plan's places card.
    await page.getByTestId('places-link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
    await expect(page.getByTestId('plan-places')).toBeInViewport();
    await capture(page, testInfo, 'plan-places-from-settings');
  });

  test('shows each tab’s first screen, and the build under About', async ({ page }, testInfo) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await expect(page.getByTestId('row-goals')).toBeVisible();
    await capture(page, testInfo, 'settings');
    await page.goto('./#/settings/about');
    await expect(page.getByTestId('build-marker')).toHaveText(/^Build \S+ · .+ · Phase 8$/);
    await capture(page, testInfo, 'settings-about');
    await page.goto('./#/plan');
    await expect(page.getByTestId('plan-days')).toBeVisible();
    await capture(page, testInfo, 'plan');
    await page.goto('./#/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
    await capture(page, testInfo, 'progress');
  });

  test('a row closed and opened again keeps what was typed in it', async ({ page }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    const row = page.getByTestId('row-cloud');
    await row.click();
    await page.getByTestId('cloud-token').fill('typed-not-saved');
    await row.click();
    await expect(page.getByTestId('cloud-token')).toBeHidden();
    await row.click();
    await expect(page.getByTestId('cloud-token')).toHaveValue('typed-not-saved');
  });
});
