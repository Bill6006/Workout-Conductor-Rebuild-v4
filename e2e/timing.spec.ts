import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * The numbers at the top of the workout add up: the length on the dropdown is
 * the clock plus the time left, and the exercise card's header has no dead
 * space beside the demonstration.
 */

const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

const minutesIn = (text: string | null): number => Number(/(\d+)\s*min/.exec(text ?? '')?.[1]);

test.describe('timing that adds up', () => {
  test('the dropdown, the clock, and the time left agree, and the warm-up drops out at the first set', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();

    const planned = minutesIn(
      await page.getByTestId('duration-select').locator('option:checked').textContent(),
    );
    const leftAtStart = minutesIn(await page.getByTestId('time-left').textContent());
    expect(planned).toBeGreaterThan(20);
    // Seconds into the workout, the time left is the whole plan: clock plus left is the length.
    expect(planned - leftAtStart).toBeGreaterThanOrEqual(0);
    expect(planned - leftAtStart).toBeLessThanOrEqual(1);
    await capture(page, testInfo, 'workout-timing-adds-up', page.getByTestId('workout-stats'));

    // The first logged set ends the general warm-up, so more than that one set comes off.
    const skipWarmup = page.getByTestId('skip-warmup');
    if (await skipWarmup.isVisible()) await skipWarmup.click();
    await page.getByTestId('log-set').click();
    await expect
      .poll(async () => minutesIn(await page.getByTestId('time-left').textContent()))
      .toBeLessThanOrEqual(leftAtStart - 4);
  });

  test('the card header has no dead space beside the demonstration', async ({ page }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    const card = page.getByTestId('exercise-card').first();
    await expect(card).toBeVisible();
    const sizes = await card.evaluate((element) => {
      const header = element.querySelector('header') as HTMLElement;
      const [main, aside] = Array.from(header.children) as HTMLElement[];
      const height = (item: Element | undefined) => item?.getBoundingClientRect().height ?? 0;
      return {
        header: height(header),
        main: main ? Array.from(main.children).reduce((sum, child) => sum + height(child), 0) : 0,
        asideControls: aside?.querySelectorAll('button').length ?? 0,
      };
    });
    // The demonstration has its column to itself, and the text column fills the header.
    expect(sizes.asideControls).toBe(1);
    expect(sizes.header - sizes.main).toBeLessThanOrEqual(16);

    // The notation sits on the bar's row and opens the same detail the bar does.
    const toggle = card.getByTestId('tempo-toggle');
    await expect(toggle.getByTestId('tempo-line')).toHaveText(/\d-\d-[\dX]-\d ▾/);
    await card.getByTestId('tempo-line').click();
    await expect(card.getByTestId('tempo-detail')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'workout-card-header', card);
  });
});
