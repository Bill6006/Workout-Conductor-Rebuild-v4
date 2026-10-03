import { expect, test, type Locator, type Page } from '@playwright/test';
import { installFakeTurso } from './fakeTurso';
import { ensureProfile } from './helpers';

/**
 * Maintenance 25, the owner's report: a saved gym barcode had to be added again before workouts,
 * though nothing was said to be waiting. Chrome on Android had cleared the app's database (its
 * IndexedDB, with its cache and service worker) and kept its local storage, and the barcode lived
 * in the database alone. Here a second browser context is made from the first one's storage
 * state, which carries local storage and no IndexedDB: exactly what the clearing leaves. The
 * database is stood in for at the network layer, and the barcode is a pattern drawn in the page.
 */

const TOKEN = 'e2e-storage-token-never-real';

/** A made-up bar pattern on white, drawn in the page. */
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
    for (const width of [3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 1, 1, 2, 2, 1, 3, 1, 2]) {
      context.fillRect(x, 24, width * 5, 152);
      x += width * 5 + (width === 1 ? 10 : 5);
    }
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  });
  return Buffer.from(base64, 'base64');
}

async function openGymBarcode(page: Page): Promise<Locator> {
  await page.goto('./#/plan');
  const gym = page
    .getByRole('list', { name: 'Saved locations' })
    .getByRole('listitem')
    .filter({ hasText: 'Gym' });
  await gym.getByRole('button', { name: 'Barcode' }).click();
  const sheet = page.getByRole('dialog', { name: 'Gym barcode' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('a phone whose database the browser cleared', () => {
  test('gets its gym barcode back from the phone and its places from the cloud copy, which never holds the barcode', async ({
    browser,
    page,
  }, testInfo) => {
    const turso = await installFakeTurso(page);
    await ensureProfile(page);
    // The cloud copy on, and synced.
    await page.goto('./#/settings/cloud');
    await page.getByTestId('cloud-token').fill(TOKEN);
    await page.getByTestId('cloud-save-token').click();
    await expect(page.getByText('0 changes waiting')).toBeVisible({ timeout: 15_000 });
    // The gym's barcode, saved.
    const sheet = await openGymBarcode(page);
    await sheet.getByTestId('barcode-file').setInputFiles({
      name: 'synthetic-barcode.png',
      mimeType: 'image/png',
      buffer: await syntheticBarcodePicture(page),
    });
    await expect(sheet.getByTestId('barcode-section')).toBeVisible();
    const picture = await sheet
      .getByRole('img', { name: 'Gym barcode picture' })
      .getAttribute('src');
    await sheet.getByRole('button', { name: 'Done' }).click();
    // The cloud card says what the copy never holds, and that the barcode is kept twice.
    await page.goto('./#/settings/cloud');
    await expect(page.getByText('Gym barcode, with a second copy on this phone')).toBeVisible();

    // What the clearing leaves: local storage, and no database, cache or service worker.
    const left = await page.context().storageState();
    const cleared = await browser.newContext({
      storageState: left,
      baseURL: testInfo.project.use.baseURL,
      viewport: testInfo.project.use.viewport ?? null,
      serviceWorkers: 'block',
    });
    try {
      await installFakeTurso(cleared, undefined, turso);
      const again = await cleared.newPage();
      await again.goto('./');
      // The places come back from the cloud copy; setup is never asked for again.
      await expect(again.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
        timeout: 15_000,
      });
      // The barcode comes back from the phone's second copy, at the gym, as it was saved.
      await again.getByTestId('start-workout').click();
      const popup = again.getByRole('dialog', { name: 'Gym barcode' });
      await expect(popup).toBeVisible();
      await expect(popup.getByRole('img', { name: 'Gym barcode picture' })).toHaveAttribute(
        'src',
        picture ?? '',
      );
      // And it is in the database again, not only on screen.
      const stored = await again.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('workout-conductor-v4');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const count = await new Promise<number>((resolve, reject) => {
          const request = db.transaction('device').objectStore('device').count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        db.close();
        return count;
      });
      expect(stored).toBe(1);
    } finally {
      await cleared.close();
    }
    // Nothing of the barcode ever reached the cloud copy.
    expect(turso.rows().some((row) => row.store === 'device')).toBe(false);
    expect(JSON.stringify(turso.rows())).not.toContain('data:image');
  });
});
