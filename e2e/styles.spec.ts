import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Programming styles: Auto lets the goals and settings pick the style and says
 * why, with the research one tap away; Losing fat changes the pick; and a
 * profile from before Auto existed is offered it once by the coach.
 */

const DB_NAME = 'workout-conductor-v4';
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

/** Rewrites the stored profile as one saved before the newer style field existed. */
async function asProfileFromBefore(page: Page): Promise<void> {
  await page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['profile'], 'readwrite');
      const store = tx.objectStore('profile');
      const read = store.get('current');
      read.onsuccess = () => {
        const profile = read.result as Record<string, unknown>;
        delete profile.programStyle;
        store.put(profile);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, DB_NAME);
}

const styleGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Programming style' });

test.describe('programming styles', () => {
  test('Auto picks the style from the goals, says why, and follows Losing fat', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await expect(styleGroup(page).getByRole('radio')).toHaveCount(8);
    await expect(styleGroup(page).getByRole('radio', { name: /^Hybrid/ })).toBeChecked();

    await styleGroup(page).getByRole('radio', { name: /^Auto/ }).click();
    await settle(page);
    await expect(page.getByTestId('style-resolved')).toHaveText('Auto picked Hypertrophy focus');
    await expect(page.getByTestId('style-why')).toContainText('Size follows weekly sets');
    const research = page.getByTestId('style-research');
    await expect(research).not.toHaveAttribute('open', '');
    await research.getByText('The research').click();
    await expect(research).toContainText('Schoenfeld, Ogborn and Krieger, 2017');
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'settings-style-auto', page.getByTestId('style-why'));

    // Today names the style the goals came to, and the plan was rebuilt under it.
    await page.goto('./#/today');
    await expect(page.getByText('Auto · Hypertrophy focus')).toBeVisible();

    // Losing fat changes what the lifting is for, and the pick with it.
    await page.goto('./#/settings');
    await page.getByRole('switch', { name: /Losing fat right now/ }).click();
    await settle(page);
    await expect(page.getByTestId('style-resolved')).toHaveText('Auto picked Lean-down');
    await expect(page.getByTestId('style-why')).toContainText('keep the muscle and strength');
    await capture(page, testInfo, 'settings-style-lean-down', page.getByTestId('style-why'));
    await page.goto('./#/today');
    await expect(page.getByText('Auto · Lean-down')).toBeVisible();

    // It is saved: a reload reads the same thing back.
    await page.reload();
    await expect(page.getByText('Auto · Lean-down')).toBeVisible();
  });

  test('a style picked by hand stands, and says where the research is mixed', async ({ page }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await styleGroup(page)
      .getByRole('radio', { name: /^Undulating/ })
      .click();
    await settle(page);
    await expect(page.getByTestId('style-resolved')).toHaveText('Undulating');
    await expect(page.getByTestId('style-why')).toContainText('Mixed evidence');
    await page.goto('./#/today');
    await expect(page.getByText('Undulating', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('a profile from before Auto is offered it once by the coach, and one tap takes it', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await asProfileFromBefore(page);
    await page.reload();
    const card = page.getByTestId('coach-card');
    await expect(page.getByTestId('coach-headline')).toHaveText(
      'Your goals point to Hypertrophy focus, not Hybrid',
    );
    await expect(card).toContainText('Size follows weekly sets');
    await capture(page, testInfo, 'today-coach-style-offer', card);

    await page.getByTestId('coach-action').click();
    await settle(page);
    await expect(page.getByText('Auto · Hypertrophy focus')).toBeVisible();
    // Taken once, it is not made again.
    await expect(page.getByTestId('coach-headline')).not.toContainText('Your goals point to');
    await page.reload();
    await expect(page.getByText('Auto · Hypertrophy focus')).toBeVisible();
    await expect(page.getByTestId('coach-headline')).not.toContainText('Your goals point to');
  });
});
