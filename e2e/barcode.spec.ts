import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile, expectNoHorizontalOverflow } from './helpers';

/**
 * Maintenance 18: the gym barcode. Added once to the Gym, on a popup of its own,
 * from a picture. The popup comes up as a workout starts there and from Today's
 * Show barcode; a tap on the barcode puts it full screen on white; the X or Back
 * steps back one view at a time; the pop-up at Start can be switched off.
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

const popupOf = (page: Page) => page.getByRole('dialog', { name: 'Gym barcode' });

/** Waits out the popup's rise, so a capture shows it as it rests. */
async function settled(target: Locator): Promise<void> {
  await target.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
}

/** Plan, Where you train, Barcode on the Gym row: a popup with the barcode and nothing else. */
async function openGymBarcode(page: Page): Promise<Locator> {
  await page.goto('./#/plan');
  const gym = page
    .getByRole('list', { name: 'Saved locations' })
    .getByRole('listitem')
    .filter({ hasText: 'Gym' });
  await expect(gym).toContainText('Current');
  await gym.getByRole('button', { name: 'Barcode' }).click();
  const sheet = popupOf(page);
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
  await expect(sheet.getByText(/stays on this phone/i)).toHaveCount(0);
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
  test('its popup comes up at Start, a tap goes full screen, and the X and Done close them', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    const sheet = await openGymBarcode(page);
    await addPicture(page, sheet);
    // No barcode reader in this browser: the picture itself is what shows.
    await expect(sheet.getByTestId('barcode-read')).toHaveText('Tap it for full screen.');
    await expect(
      sheet.getByRole('switch', { name: /Show when I start a workout here/ }),
    ).toHaveAttribute('aria-checked', 'true');
    // Toasts gone, so the evidence shows the whole popup.
    await expect(page.getByText('Barcode saved on this phone')).toBeHidden();
    await capture(page, testInfo, 'gym-barcode-sheet', sheet.getByTestId('barcode-remove'));
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();

    await page.goto('./#/today');
    await expect(page.getByTestId('barcode-open')).toBeVisible();
    await capture(page, testInfo, 'today-show-barcode', page.getByTestId('barcode-open'));
    await page.getByTestId('start-workout').click();
    const overlay = page.getByTestId('barcode-overlay');
    const popup = popupOf(page);
    // The popup first, over the workout; not full screen.
    await expect(popup).toBeVisible();
    await expect(overlay).toHaveCount(0);
    await expect(page).toHaveURL(/#\/workout$/);
    await settled(popup);
    await capture(page, testInfo, 'barcode-at-start');

    await popup.getByRole('button', { name: 'Show it full screen' }).click();
    await expect(overlay).toBeVisible();
    await expect(overlay.getByTestId('barcode-picture')).toBeVisible();
    await expectFullScreenOnWhite(page, overlay);
    await capture(page, testInfo, 'barcode-full-screen');

    await overlay.getByRole('button', { name: 'Close barcode' }).click();
    await expect(overlay).toBeHidden();
    await expect(popup).toBeVisible();
    await popup.getByRole('button', { name: 'Done' }).click();
    await expect(popup).toBeHidden();
    await expect(page).toHaveURL(/#\/workout$/);
    await expect(page.getByTestId('workout-stats')).toBeVisible();

    // Opening the app again mid-workout does not bring it up a second time; it is still saved.
    await page.reload();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await expect(popup).toHaveCount(0);
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
      'Code read. Tap it for full screen.',
    );
    const autoShow = sheet.getByRole('switch', { name: /Show when I start a workout here/ });
    await autoShow.click();
    await expect(autoShow).toHaveAttribute('aria-checked', 'false');
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();

    await page.goto('./#/today');
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    const popup = popupOf(page);
    await expect(popup).toHaveCount(0);

    await page.goto('./#/today');
    await page.getByTestId('barcode-open').click();
    await expect(popup).toBeVisible();
    const overlay = page.getByTestId('barcode-overlay');
    await expect(overlay).toHaveCount(0);
    await popup.getByRole('button', { name: 'Show it full screen' }).click();
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

    // The phone's Back steps back: full screen to the popup, then the popup away, staying on Today.
    await page.goBack();
    await expect(overlay).toBeHidden();
    await expect(popup).toBeVisible();
    await page.goBack();
    await expect(popup).toBeHidden();
    await expect(page).toHaveURL(/#\/today$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  });
});
