import { expect, type Page } from '@playwright/test';

/** Lands on Today with a saved profile, completing first-run setup with defaults when needed. */
export async function ensureProfile(page: Page): Promise<void> {
  await page.goto('./');
  const skip = page.getByRole('button', { name: 'Use defaults and skip setup' });
  const today = page.getByRole('heading', { level: 1, name: 'Today' });
  await expect(skip.or(today)).toBeVisible();
  if (await skip.isVisible()) {
    await skip.click();
    await expect(today).toBeVisible();
  }
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(widths.scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(
    widths.clientWidth,
  );
}

export const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'workout', label: 'Workout' },
  { id: 'progress', label: 'Progress' },
  { id: 'plan', label: 'Plan' },
  { id: 'settings', label: 'Settings' },
] as const;
