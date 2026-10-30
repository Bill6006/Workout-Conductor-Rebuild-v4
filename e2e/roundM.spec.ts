import { expect, test, type Page } from '@playwright/test';
import { ensureProfile } from './helpers';

/**
 * Maintenance 31 (round M), the owner's items 12 and 32, in the browser:
 * - 12, a day not ticked says so in one line and offers a catch-up of what is behind this week,
 *   the full session one tap away (the default schedule ticks Monday, Tuesday, Thursday and
 *   Friday, so a Wednesday is not ticked);
 * - 32, a second workout the same day leads with what was missed.
 * The rules themselves are in src/engine/planning/catchUp.test.ts.
 */

const DAY = 86_400_000;

/** A bench press workout begun at `when`, as a finished workout is saved. */
async function seedBench(page: Page, when: string): Promise<void> {
  const record = {
    id: `w-e2e-bench-${when}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'push-arms',
    entries: [
      {
        exerciseId: 'barbell-bench-press',
        sets: [8, 8, 8].map((reps) => ({
          kind: 'working',
          reps,
          weight: 135,
          rir: 2,
          completed: true,
          targetReps: [6, 10],
          targetRir: 2,
        })),
      },
    ],
  };
  await page.evaluate(async (item) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('workout-conductor-v4');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['workouts'], 'readwrite');
      tx.objectStore('workouts').put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, record);
}

/** Noon on the coming Wednesday on this device, as an instant. */
function comingWednesday(): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + ((3 - date.getDay() + 7) % 7 || 7));
  return date;
}

test.describe('a day not ticked (item 12)', () => {
  test('offers a lifter in training a catch-up in one line, the full session a tap away', async ({
    page,
  }) => {
    const wednesday = comingWednesday();
    await page.clock.install({ time: wednesday });
    await page.clock.resume();
    await ensureProfile(page);
    // Monday's bench press: a lifter in training.
    await seedBench(page, new Date(wednesday.getTime() - 2 * DAY).toISOString());
    await page.reload();
    const note = page.getByTestId('day-note-text');
    await expect(note).toHaveText(
      /^Not one of your training days: a \d+-minute catch-up for what is behind this week\.$/,
    );
    await expect(page.getByRole('heading', { level: 2, name: 'Catch-up' })).toBeVisible();

    await page.getByTestId('day-note-action').click();
    await expect(note).toHaveText('Not one of your training days.');
    await expect(page.getByTestId('day-note-action')).toHaveText('Catch-up instead');
    await expect(page.getByRole('heading', { level: 2, name: 'Catch-up' })).toHaveCount(0);

    // Kept for the day: read again after a reload.
    await page.reload();
    await expect(note).toHaveText('Not one of your training days.');
    await page.getByTestId('day-note-action').click();
    await expect(page.getByRole('heading', { level: 2, name: 'Catch-up' })).toBeVisible();
  });
});

test.describe('a second workout the same day (item 32)', () => {
  test('leads with what was missed', async ({ page }) => {
    // Noon today on this device, so the workout an hour before is today's whatever the hour.
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    await page.clock.install({ time: noon });
    await page.clock.resume();
    await ensureProfile(page);
    await seedBench(page, new Date(noon.getTime() - 60 * 60_000).toISOString());
    await page.reload();
    await expect(page.getByTestId('day-note-text')).toHaveText(
      'You trained today: this one leads with what you missed and goes easy on the rest.',
    );
    await expect(page.getByRole('heading', { level: 2, name: 'Second workout' })).toBeVisible();
    // The bench press done today is not in it again.
    await expect(
      page.locator('[data-testid="workout-entry"][data-exercise-id="barbell-bench-press"]'),
    ).toHaveCount(0);
  });
});
