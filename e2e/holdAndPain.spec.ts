import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile } from './helpers';

/**
 * Maintenance 20, round B. A held exercise counts down on the phone and logs
 * seconds; pain said at the end of a workout names the joint, and the next
 * workout's coach card names the exercise that loads it.
 */

const DB_NAME = 'workout-conductor-v4';
const SESSION_KEY = 'wc.v1.session';
const screenshotDir = process.env.SCREENSHOT_DIR;

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  if (!screenshotDir || testInfo.project.name !== 'android-412') return;
  mkdirSync(screenshotDir, { recursive: true });
  // The first-run toast would cover the picture; it is gone in a few seconds.
  await expect(page.getByText('Profile saved and verified on this device')).toHaveCount(0, {
    timeout: 10_000,
  });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-${name}.png`) });
}

/**
 * Makes the planned workout open with the given exercise, two working sets of it, whatever
 * today's template is, so the test does not depend on the day it runs.
 */
async function openWith(
  page: Page,
  exerciseId: string,
  targetReps: [number, number],
  targetRir: number,
  role?: string,
): Promise<void> {
  await page.evaluate(
    ({ key, exerciseId, targetReps, targetRir, role }) => {
      const session = JSON.parse(window.localStorage.getItem(key) ?? '{}');
      const block = session.workout.blocks.find(
        (candidate: { kind: string }) => candidate.kind === 'straight',
      );
      session.workout.blocks = [
        block,
        ...session.workout.blocks.filter((b: unknown) => b !== block),
      ];
      const entry = block.entries[0];
      const working = entry.sets.filter((set: { kind: string }) => set.kind === 'working');
      entry.exerciseId = exerciseId;
      if (role) entry.role = role;
      entry.warmupSets = 0;
      entry.dropSet = false;
      delete entry.progression;
      entry.sets = working.slice(0, 2).map((set: Record<string, unknown>, index: number) => ({
        ...set,
        index,
        targetReps,
        targetRir,
        targetWeight: null,
      }));
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    { key: SESSION_KEY, exerciseId, targetReps, targetRir, role },
  );
  await page.reload();
  await expect(page.getByTestId('start-workout')).toBeVisible();
}

/** A workout saved ten days ago that reported shoulder pain. */
async function seedShoulderPain(page: Page): Promise<void> {
  const when = new Date(Date.now() - 10 * 86_400_000).toISOString();
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
        id: 'w-e2e-shoulder',
        startedAt: when,
        completedAt: when,
        locationId: 'gym',
        templateId: 'push-arms',
        title: 'Push + arms',
        rating: { effort: 'right', pain: true, joint: 'shoulder', energyAfter: 3, note: '' },
        entries: [
          {
            exerciseId: 'barbell-bench-press',
            sets: [{ kind: 'working', reps: 6, weight: 135, rir: 2, completed: true }],
          },
        ],
      },
    },
  );
  await page.reload();
  await expect(page.getByTestId('start-workout')).toBeVisible();
}

test.describe('a hold timer', () => {
  test('counts down, stops early or runs out, and logs seconds', async ({ page }, testInfo) => {
    await page.clock.install();
    await page.clock.resume();
    await ensureProfile(page);
    await openWith(page, 'plank', [30, 60], 0, 'finisher');
    await page.getByTestId('start-workout').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();

    const card = page.getByTestId('exercise-card').first();
    await expect(card.getByRole('heading', { name: 'Plank' })).toBeVisible();
    // Seconds, not reps, no RIR, and no rep tempo.
    await expect(card.getByTestId('logger-reps')).toHaveAccessibleName(/^Seconds, 30\./);
    await expect(card.getByTestId('logger-rir')).toHaveCount(0);
    await expect(card.getByTestId('hold-line')).toHaveText(/Hold 30 s/);
    await expect(card.getByTestId('tempo-bar')).toHaveCount(0);

    // Stopped early: the seconds held so far go into the dial.
    await card.getByTestId('hold-start').click();
    await expect(card.getByTestId('hold-clock')).toBeVisible();
    await page.clock.fastForward(12_000);
    // The fake clock also runs in real time, so a slow machine may be a few seconds further on.
    await expect(card.getByTestId('hold-clock')).toHaveText(/^0:1[3-8]$/);
    await capture(page, testInfo, 'workout-hold-counting', card.getByTestId('hold-timer'));
    await card.getByTestId('hold-stop').click();
    await expect(card.getByTestId('hold-held')).toHaveText(/^Held 1[2-7] s$/);
    await expect(card.getByTestId('logger-reps')).toHaveText(/^1[2-7]/);

    // Run out: the full thirty go in, and the set logs as seconds.
    await card.getByTestId('hold-start').click();
    await page.clock.fastForward(31_000);
    await expect(card.getByTestId('hold-held')).toHaveText('Held 30 s');
    await expect(card.getByTestId('logger-reps')).toHaveText(/^30/);
    await capture(page, testInfo, 'workout-hold-done', card.getByTestId('hold-timer'));
    await card.getByTestId('log-set').click();
    await expect(card.locator('[data-testid="set-row"][data-state="done"]').first()).toContainText(
      '30 s',
    );

    // Starting the next hold ends the rest that was running.
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await card.getByTestId('hold-start').click();
    await expect(page.getByTestId('rest-timer')).toHaveCount(0);
    await expect(card.getByTestId('hold-clock')).toBeVisible();
  });
});

test.describe('pain you can trust', () => {
  test('the end-of-workout sheet asks where, and the summary and history say it', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    await page.getByTestId('log-set').click();
    await page.getByTestId('end-early').click();

    const pain = page.getByTestId('rating-pain');
    await expect(pain.getByRole('radio', { name: 'No pain' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('rating-pain-where')).toHaveCount(0);
    await pain.getByRole('radio', { name: 'Some pain' }).click();
    const where = page.getByTestId('rating-pain-where');
    await where.getByRole('radio', { name: 'Shoulder' }).click();
    await expect(where.getByRole('radio', { name: 'Shoulder' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await capture(page, testInfo, 'rating-pain-where', where);
    await page.getByTestId('save-workout').click();

    const summary = page.getByTestId('completion-summary');
    await expect(summary).toBeVisible();
    // Said once, under Next time: not again in Recovery or the feedback.
    const noted = page.getByText(
      'Shoulder pain noted: next time the coach flags exercises that load it.',
    );
    await expect(noted).toHaveCount(1);
    await expect(noted).toBeVisible();
    await page.getByTestId('completion-done').click();

    await page.goto('./#/progress');
    await page.getByTestId('history-row').first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('shoulder');
  });

  test('the next workout names the exercise that loads the joint, and where it came from', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await seedShoulderPain(page);
    await openWith(page, 'barbell-bench-press', [6, 10], 2);
    const card = page.getByTestId('coach-card');
    await expect(card.getByTestId('coach-headline')).toHaveText(
      'Shoulder pain last time: Barbell Bench Press loads it',
    );
    await expect(card).toContainText(/[A-Z][a-z]{2} \d{1,2}, Push \+ arms: shoulder\./);
    await capture(page, testInfo, 'today-pain-card', card);
  });
});
