import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { installFakeTurso, type FakeTurso } from './fakeTurso';
import { ensureProfile } from './helpers';

/**
 * Maintenance 10: getting a device's history back. The database is stood in
 * for at the network layer, so the push and the pull are real; the loss is
 * done to IndexedDB behind the app's back, the way it happened on the phone:
 * records gone with no tombstone and no trace.
 */

const TOKEN = 'e2e-recovery-token-never-real';
/** Evidence captures, only when asked for and only from the primary phone project. */
const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, testId: string) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  await page.getByTestId(testId).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}
const DB_NAME = 'workout-conductor-v4';
const MIRROR_KEY = 'wc.v1.cloudToken';
const WORKOUT = {
  id: 'w-e2e-lost',
  startedAt: '2026-09-14T00:39:13.007Z',
  completedAt: '2026-09-14T01:10:00.000Z',
  locationId: null,
  templateId: null,
  entries: [
    {
      exerciseId: 'barbell-curl',
      sets: [{ kind: 'working', reps: 8, weight: 20, rir: 2, completed: true }],
    },
  ],
};

/** Writes a finished workout the way the app does: the record and its queue entry in one transaction. */
async function seedWorkout(page: Page): Promise<void> {
  await page.evaluate(
    async ({ name, record }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['workouts', 'outbox'], 'readwrite');
        tx.objectStore('workouts').put(record);
        tx.objectStore('outbox').put({
          id: `workouts|${record.id}`,
          store: 'workouts',
          recordId: record.id,
          op: 'put',
          queuedAt: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { name: DB_NAME, record: WORKOUT },
  );
}

/** Removes records behind the app's back: no tombstone, no queue entry, no trace. */
async function lose(page: Page, what: { workout: boolean; token: boolean }): Promise<void> {
  await page.evaluate(
    async ({ name, id, what }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['workouts', 'cloud'], 'readwrite');
        if (what.workout) tx.objectStore('workouts').delete(id);
        if (what.token) tx.objectStore('cloud').delete('token');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { name: DB_NAME, id: WORKOUT.id, what },
  );
}

async function pasteToken(page: Page): Promise<void> {
  await page.goto('./#/settings');
  await page.getByTestId('cloud-token').fill(TOKEN);
  await page.getByTestId('cloud-save-token').click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
}

async function expectWorkouts(page: Page, count: number): Promise<void> {
  await page.goto('./#/progress');
  await expect(page.getByText(`${count} workouts on this device`)).toBeVisible({
    timeout: 15_000,
  });
}

/** A device with a profile, one finished workout, and a token; the workout pushed to the cloud copy. */
async function deviceWithHistory(page: Page, turso: FakeTurso) {
  await ensureProfile(page);
  await seedWorkout(page);
  await page.reload();
  await expectWorkouts(page, 1);
  await pasteToken(page);
  await expect(page.getByText(/Last sync/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('0 changes waiting')).toBeVisible({ timeout: 15_000 });
  const pushed = turso.rows().find((row) => row.store === 'workouts' && row.id === WORKOUT.id);
  expect(pushed).toBeDefined();
  expect(pushed?.deleted).toBe(0);
  // One more sync, so the cursor sits past the pushed row as it did on the phone
  // after a day of routine syncs; a later routine pull cannot see the row.
  await page.getByTestId('cloud-sync-now').click();
  await expect(page.getByText(/Synced: 0 sent, 0 received/)).toBeVisible({ timeout: 15_000 });
  return pushed;
}

test.describe('getting a device history back', () => {
  test('a database that lost the token and the workout gets both back from the phone copy and the cloud, and the cloud row is untouched', async ({
    page,
  }, testInfo) => {
    const turso = await installFakeTurso(page);
    const pushed = await deviceWithHistory(page, turso);

    await lose(page, { workout: true, token: true });
    await page.reload();
    await page.goto('./#/settings');
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
    await expect(page.getByTestId('cloud-notice')).toContainText(
      'database copy of the token was missing',
    );
    await capture(page, testInfo, 'settings-cloud-token-restored', 'cloud-notice');
    await expectWorkouts(page, 1);

    const after = turso.rows().find((row) => row.store === 'workouts' && row.id === WORKOUT.id);
    expect(after).toEqual(pushed);
    expect(turso.rows().every((row) => row.deleted === 0)).toBe(true);
    // The token log is on the Storage card, and it never carries the token.
    await page.goto('./#/settings');
    await expect(page.getByTestId('token-log')).toContainText('restored');
    expect(await page.getByTestId('token-log').textContent()).not.toContain(TOKEN);
    await capture(page, testInfo, 'settings-storage-token-log', 'token-log');
  });

  test('with the token intact, Sync now brings back a record the device lost', async ({ page }) => {
    const turso = await installFakeTurso(page);
    const pushed = await deviceWithHistory(page, turso);

    await lose(page, { workout: true, token: false });
    await page.reload();
    await expectWorkouts(page, 0);
    await page.goto('./#/settings');
    await expect(page.getByTestId('cloud-notice')).toHaveCount(0);
    await page.getByTestId('cloud-sync-now').click();
    await expect(page.getByText(/Synced: 0 sent, 1 received/)).toBeVisible({ timeout: 15_000 });
    await expectWorkouts(page, 1);
    expect(turso.rows().find((row) => row.id === WORKOUT.id)).toEqual(pushed);
  });

  test('both copies gone: the card says the token went missing, and pasting it again restores the history', async ({
    page,
  }, testInfo) => {
    const turso = await installFakeTurso(page);
    const pushed = await deviceWithHistory(page, turso);

    await lose(page, { workout: true, token: true });
    await page.evaluate((key) => window.localStorage.removeItem(key), MIRROR_KEY);
    await page.reload();
    await page.goto('./#/settings');
    await expect(page.getByText('Missing', { exact: true })).toBeVisible();
    await expect(page.getByTestId('cloud-notice')).toContainText('missing from both');
    await expect(page.getByTestId('cloud-notice')).toContainText('last seen');
    await capture(page, testInfo, 'settings-cloud-token-missing', 'cloud-notice');

    await pasteToken(page);
    await expect(page.getByTestId('cloud-notice')).toHaveCount(0);
    await expectWorkouts(page, 1);
    expect(turso.rows().find((row) => row.id === WORKOUT.id)).toEqual(pushed);
    expect(turso.rows().every((row) => row.deleted === 0)).toBe(true);
  });
});
