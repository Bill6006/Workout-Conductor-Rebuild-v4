import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Maintenance 18: the gym barcode. Added once to the Gym, on its own sheet, from a picture,
 * it comes up full screen on white as a workout starts there, closes with the X
 * or Back, can be switched off at Start, and is always one tap away on Today.
 * Every picture here is drawn by the test itself; none is anyone's membership.
 */

const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

/** A made-up bar pattern on white, drawn in the page: it only has to look like a key-tag photo. */
async function syntheticBarcodePicture(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 200;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    let x = 48;
    for (const width of [3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 1, 1, 2, 2, 1, 3, 1, 2, 1, 1, 3, 1]) {
      context.fillRect(x, 24, width * 5, 152);
      x += width * 5 + (width === 1 ? 10 : 5);
    }
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  });
  return Buffer.from(base64, 'base64');
}

/** Plan, Where you train, Barcode on the Gym row: a sheet with the barcode and nothing else. */
async function openGymBarcode(page: Page): Promise<Locator> {
  await page.goto('./#/plan');
  const gym = page
    .getByRole('list', { name: 'Saved locations' })
    .getByRole('listitem')
    .filter({ hasText: 'Gym' });
  await expect(gym).toContainText('Current');
  await gym.getByRole('button', { name: 'Barcode' }).click();
  const sheet = page.getByRole('dialog', { name: 'Gym barcode' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Equipment here')).toHaveCount(0);
  return sheet;
}

async function addPicture(page: Page, sheet: Locator): Promise<void> {
  await expect(sheet.getByTestId('barcode-add')).toBeVisible();
  await sheet.getByTestId('barcode-file').setInputFiles({
    name: 'synthetic-barcode.png',
    mimeType: 'image/png',
    buffer: await syntheticBarcodePicture(page),
  });
  await expect(sheet.getByTestId('barcode-section')).toBeVisible();
  await expect(page.getByText('Barcode saved on this phone')).toBeVisible();
}

async function expectFullScreenOnWhite(page: Page, overlay: Locator): Promise<void> {
  const box = await overlay.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport).toBeTruthy();
  expect(Math.round(box?.x ?? -1)).toBe(0);
  expect(Math.round(box?.y ?? -1)).toBe(0);
  expect(Math.round(box?.width ?? 0)).toBe(viewport?.width);
  expect(Math.round(box?.height ?? 0)).toBe(viewport?.height);
  expect(await overlay.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  );
  await expectNoHorizontalOverflow(page);
}

test.describe('the gym barcode', () => {
  test('a picture of it pops up full screen at Start, and the X closes it', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    const sheet = await openGymBarcode(page);
    await addPicture(page, sheet);
    // No barcode reader in this browser: the picture itself is what shows.
    await expect(sheet.getByTestId('barcode-read')).toHaveText('Shows as the picture you added.');
    await expect(
      sheet.getByRole('switch', { name: /Show when I start a workout here/ }),
    ).toHaveAttribute('aria-checked', 'true');
    // Toasts gone, so the evidence shows the whole section.
    await expect(page.getByText('Barcode saved on this phone')).toBeHidden();
    await capture(page, testInfo, 'gym-barcode-sheet', sheet.getByTestId('barcode-remove'));
    // The picture is the preview; a tap shows it as the desk will see it.
    await sheet.getByRole('button', { name: 'Show it full screen' }).click();
    await expect(page.getByTestId('barcode-overlay')).toBeVisible();
    await page.getByRole('button', { name: 'Close barcode' }).click();
    await expect(page.getByTestId('barcode-overlay')).toBeHidden();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();

    await page.goto('./#/today');
    await expect(page.getByTestId('barcode-open')).toBeVisible();
    await capture(page, testInfo, 'today-show-barcode', page.getByTestId('barcode-open'));
    await page.getByTestId('start-workout').click();
    const overlay = page.getByTestId('barcode-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.getByTestId('barcode-picture')).toBeVisible();
    await expectFullScreenOnWhite(page, overlay);
    await capture(page, testInfo, 'barcode-at-start');

    await overlay.getByRole('button', { name: 'Close barcode' }).click();
    await expect(overlay).toBeHidden();
    await expect(page).toHaveURL(/#\/workout$/);
    await expect(page.getByTestId('workout-stats')).toBeVisible();

    // Opening the app again mid-workout does not bring it up a second time; it is still saved.
    await page.reload();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await expect(overlay).toHaveCount(0);
    await page.goto('./#/today');
    await expect(page.getByTestId('barcode-open')).toBeVisible();

    // At Home, the Gym row carries Use, Barcode and Edit, and they fit on one line.
    await page.goto('./#/plan');
    const places = page.getByRole('list', { name: 'Saved locations' });
    await places
      .getByRole('listitem')
      .filter({ hasText: 'Home' })
      .getByRole('button', { name: 'Use' })
      .click();
    // The switch rebuilds the session; the toast comes once that is done.
    const switched = page.getByText('Training at Home');
    await expect(switched).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('calibration-overlay')).toBeHidden();
    await expect(switched).toBeHidden();
    const gymRow = places.getByRole('listitem').filter({ hasText: 'Gym' });
    await expect(gymRow.getByRole('button', { name: 'Use' })).toBeVisible();
    const tops = await Promise.all(
      ['Use', 'Barcode', 'Edit'].map(
        async (name) => (await gymRow.getByRole('button', { name }).boundingBox())?.y,
      ),
    );
    expect(new Set(tops).size).toBe(1);
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'plan-places', places);
  });

  test('a code the phone reads is redrawn sharp, and switched off it waits on Today', async ({
    page,
  }, testInfo) => {
    // Stands in for the barcode reader Chrome on Android has, which desktop Chromium lacks.
    await page.addInitScript(() => {
      class StandInReader {
        static async getSupportedFormats() {
          return ['code_128', 'qr_code', 'aztec'];
        }
        async detect() {
          return [
            {
              format: 'code_128',
              rawValue: 'SYNTH-0001',
              boundingBox: { width: 300, height: 120 },
            },
          ];
        }
      }
      Object.defineProperty(window, 'BarcodeDetector', {
        value: StandInReader,
        configurable: true,
      });
    });
    await ensureProfile(page);
    const sheet = await openGymBarcode(page);
    await addPicture(page, sheet);
    await expect(sheet.getByTestId('barcode-read')).toHaveText(
      'Code read: it shows redrawn, sharp and full width.',
    );
    const autoShow = sheet.getByRole('switch', { name: /Show when I start a workout here/ });
    await autoShow.click();
    await expect(autoShow).toHaveAttribute('aria-checked', 'false');
    await sheet.getByRole('button', { name: 'Done' }).click();

    await page.goto('./#/today');
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await expect(page.getByTestId('barcode-overlay')).toHaveCount(0);

    await page.goto('./#/today');
    await page.getByTestId('barcode-open').click();
    const overlay = page.getByTestId('barcode-overlay');
    const graphic = overlay.getByTestId('barcode-graphic');
    await expect(graphic).toHaveAttribute('data-kind', 'bars');
    await expect(overlay.getByTestId('barcode-value')).toHaveText('SYNTH-0001');
    await expectFullScreenOnWhite(page, overlay);
    // The bars span the width a scanner sees, inside the 16 px margins.
    const bars = await graphic.boundingBox();
    expect(bars?.width ?? 0).toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 0) - 40);
    await capture(page, testInfo, 'barcode-redrawn');

    await overlay.getByTestId('barcode-switch').click();
    await expect(overlay.getByTestId('barcode-picture')).toBeVisible();
    await overlay.getByTestId('barcode-switch').click();
    await expect(graphic).toBeVisible();

    // The phone's Back closes it and stays on Today.
    await page.goBack();
    await expect(overlay).toBeHidden();
    await expect(page).toHaveURL(/#\/today$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  });
});
