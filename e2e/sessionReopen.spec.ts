import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile, skipWarmupIfShown } from './helpers';

/**
 * Maintenance 17: a workout in progress survives the app being closed and
 * opened again, whatever way its targets were worked out; and a stored workout
 * that cannot be read back is kept and named, never written over in silence.
 */

const DB_NAME = 'workout-conductor-v4';
const SESSION_KEY = 'wc.v1.session';
const RECOVERY_KEY = 'wc.v1.sessionRecovery';
const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

/** A bench session from a month ago, so today's bench target is worked out as a return. */
async function seedBenchMonthAgo(page: Page): Promise<void> {
  const when = new Date(Date.now() - 30 * 86_400_000).toISOString();
  await page.evaluate(
    async ({ name, record }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['workouts'], 'readwrite');
        tx.objectStore('workouts').put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    {
      name: DB_NAME,
      record: {
        id: 'w-e2e-month-ago',
        startedAt: when,
        completedAt: when,
        locationId: 'gym',
        templateId: 'push-arms',
        entries: [
          {
            exerciseId: 'barbell-bench-press',
            sets: [
              {
                kind: 'working',
                reps: 8,
                weight: 135,
                rir: 2,
                completed: true,
                targetReps: [4, 6],
              },
              {
                kind: 'working',
                reps: 8,
                weight: 135,
                rir: 2,
                completed: true,
                targetReps: [4, 6],
              },
            ],
          },
        ],
      },
    },
  );
}

const setsDone = (page: Page) => page.getByTestId('workout-stats').getByText(/^\d+\/\d+$/);

test.describe('reopening the app mid-workout', () => {
  test('a workout in progress comes back with its logged sets', async ({ page }, testInfo) => {
    await ensureProfile(page);
    await seedBenchMonthAgo(page);
    await page.reload();
    await expect(page.getByTestId('start-workout')).toBeVisible();
    // The kind of target that made a stored workout unreadable before this fix.
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY);
    expect(stored).toContain('"mode":"return"');

    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await skipWarmupIfShown(page);
    await page.getByTestId('log-set').click();
    await expect(setsDone(page)).toHaveText(/^1\//);

    // The phone closes the app; it is opened again.
    await page.reload();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await expect(setsDone(page)).toHaveText(/^1\//);
    await expect(page.getByTestId('session-recovery')).toHaveCount(0);
    await capture(page, testInfo, 'workout-after-reopening', page.getByTestId('workout-stats'));
  });

  test('a stored workout that cannot be read back is kept and named, not overwritten', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    // Damage the stored copy the way a mismatch would: logged work in a shape this copy cannot read.
    await page.evaluate((key) => {
      const session = JSON.parse(window.localStorage.getItem(key) ?? '{}');
      const set = { kind: 'working', reps: 5, weight: 135, rir: 2, skipped: false };
      session.completed.sets = [0, 1, 2].map((index) => ({
        ...set,
        entryId: 'e1',
        exerciseId: 'barbell-bench-press',
        setIndex: index,
        completedAt: new Date().toISOString(),
      }));
      session.workout.blocks = 'not a list';
      window.localStorage.setItem(key, JSON.stringify(session));
    }, SESSION_KEY);

    await page.reload();
    const notice = page.getByTestId('session-recovery');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("A workout couldn't be reopened");
    await expect(notice).toContainText('Its 3 logged sets are kept on this phone');
    const kept = await page.evaluate((key) => window.localStorage.getItem(key), RECOVERY_KEY);
    expect(kept).toContain('not a list');
    await capture(page, testInfo, 'workout-kept-for-recovery', notice);

    await page.getByTestId('session-recovery-dismiss').click();
    await expect(notice).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('session-recovery')).toHaveCount(0);
    const still = await page.evaluate((key) => window.localStorage.getItem(key), RECOVERY_KEY);
    expect(still).toContain('not a list');
  });
});
