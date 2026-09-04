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
  const widths = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(
        ({ el, rect }) =>
          rect.right > clientWidth + 1 ||
          (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible'),
      )
      .sort(
        (a, b) =>
          Math.max(b.rect.right, b.el.scrollWidth) - Math.max(a.rect.right, a.el.scrollWidth),
      )
      .slice(0, 8)
      .map(
        ({ el, rect }) =>
          `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(rect.right)} scrollW=${el.scrollWidth} clientW=${el.clientWidth} text=${(el.textContent ?? '').trim().slice(0, 28)}`,
      );
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth,
      innerWidth: window.innerWidth,
      offenders,
    };
  });
  expect(
    widths.scrollWidth,
    `page must not scroll horizontally (innerWidth ${widths.innerWidth})\n${widths.offenders.join('\n')}`,
  ).toBeLessThanOrEqual(widths.clientWidth);
}

export const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'workout', label: 'Workout' },
  { id: 'progress', label: 'Progress' },
  { id: 'plan', label: 'Plan' },
  { id: 'settings', label: 'Settings' },
] as const;
