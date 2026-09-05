import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ensureProfile } from './helpers';

/**
 * Accessibility sweep with axe: every screen, the active workout with its
 * logger, and the exercise details sheet. Serious and critical WCAG 2.0/2.1 A
 * and AA violations fail; anything milder is reported in the test output.
 */

async function checkPage(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  const describe = (violations: typeof results.violations) =>
    violations
      .map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes
            .slice(0, 3)
            .map((node) => node.target.join(' '))
            .join('\n  ')}`,
      )
      .join('\n');
  const milder = results.violations.filter((violation) => !blocking.includes(violation));
  for (const violation of blocking) {
    for (const node of violation.nodes.slice(0, 6)) {
      const data = (node.any[0] ?? node.all[0])?.data as
        | {
            fgColor?: string;
            bgColor?: string;
            contrastRatio?: number;
            expectedContrastRatio?: string;
          }
        | undefined;
      const detail = data?.contrastRatio
        ? `${data.fgColor} on ${data.bgColor} = ${data.contrastRatio} (needs ${data.expectedContrastRatio})`
        : (node.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 160);
      console.log(`AXE| ${label} | ${violation.id} | ${node.target.join(' ')} | ${detail}`);
    }
  }
  if (milder.length > 0) console.log(`[a11y] ${label}: milder findings\n${describe(milder)}`);
  expect(blocking, `${label}: serious or critical violations\n${describe(blocking)}`).toEqual([]);
}

test.describe('accessibility', () => {
  test('every screen passes axe without serious or critical violations', async ({ page }) => {
    await ensureProfile(page);
    await checkPage(page, 'Today');
    for (const route of ['workout', 'progress', 'plan', 'settings', 'library']) {
      await page.goto(`./#/${route}`);
      await expect(page.locator('h1')).toBeVisible();
      await checkPage(page, route);
    }
  });

  test('the active workout, its logger, and the exercise details pass axe', async ({ page }) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await checkPage(page, 'active workout');
    await page.getByTestId('exercise-card').first().getByTestId('card-thumb').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The sheet fades and slides in; axe must sample the settled colours, not the transition.
    await expect
      .poll(() => dialog.evaluate((el) => getComputedStyle(el).opacity), { timeout: 5_000 })
      .toBe('1');
    await page.waitForTimeout(400);
    await checkPage(page, 'exercise details');
  });
});
