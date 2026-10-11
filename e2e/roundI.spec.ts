import { expect, test, type Page } from '@playwright/test';
import { ensureProfile } from './helpers';

/**
 * Maintenance 27, round I, in a real browser: a lift to push set in Settings leads Today and has its
 * card on Progress (item 44); what the app has learned resets after a second tap (item 47); four
 * weeks trained on two days bring the card that moves the schedule (item 46); a joint that keeps
 * hurting with one exercise brings its four-week swap (item 45). Synthetic data only.
 */

const DB_NAME = 'workout-conductor-v4';
const DAY = 86_400_000;

async function openSettingsRow(page: Page, name: string): Promise<void> {
  await page.goto('./#/settings');
  const row = page.getByTestId(`row-${name}`);
  await row.scrollIntoViewIfNeeded();
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
}

async function setSessions(page: Page, count: string): Promise<void> {
  await openSettingsRow(page, 'schedule');
  await page
    .getByRole('radiogroup', { name: 'Sessions per week' })
    .getByRole('radio', { name: count })
    .click();
  await expect(page.getByTestId('settings-save-status')).toHaveText(
    'Saved and verified on this device',
  );
}

/** Synthetic workouts written straight into the app's database, then the app opened again. */
async function seed(page: Page, records: unknown[]): Promise<void> {
  await page.evaluate(
    async ({ name, list }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['workouts'], 'readwrite');
        for (const item of list) tx.objectStore('workouts').put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { name: DB_NAME, list: records },
  );
  await page.reload();
  await expect(page.getByTestId('start-workout')).toBeVisible();
}

function workout(
  at: Date,
  lifts: { exerciseId: string; joint?: string }[],
  id: string,
): Record<string, unknown> {
  const when = at.toISOString();
  const reported = lifts.filter((lift) => lift.joint);
  return {
    id,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'full-body',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: reported.map((lift) => lift.joint),
    ...(reported.length > 0
      ? {
          painReports: reported.map((lift) => ({ exerciseId: lift.exerciseId, joint: lift.joint })),
        }
      : {}),
    readiness: null,
    prs: [],
    entries: lifts.map((lift) => ({
      exerciseId: lift.exerciseId,
      sets: [8, 8, 8].map((reps) => ({
        kind: 'working',
        reps,
        weight: 95,
        rir: 2,
        completed: true,
        targetReps: [6, 10],
        targetRir: 2,
      })),
    })),
  };
}

/** Puts away cards until the one wanted shows, or there are none left. */
async function coachCardFor(page: Page, headline: RegExp): Promise<void> {
  const card = page.getByTestId('coach-card');
  const title = card.getByTestId('coach-headline');
  for (let tries = 0; tries < 8; tries += 1) {
    const text = (await title.textContent()) ?? '';
    if (headline.test(text)) return;
    const dismiss = card.getByTestId('coach-dismiss');
    if (!(await dismiss.isVisible())) break;
    await dismiss.click();
    // Wait for the next card before reading again, so a tap never puts away a card unread.
    await expect(title).not.toHaveText(text);
  }
  await expect(title).toHaveText(headline);
}

test.describe('a lift to push (item 44)', () => {
  test('set in Settings, it leads Today with its badge and has its card on Progress', async ({
    page,
  }) => {
    await ensureProfile(page);
    // Two sessions a week: every session is full body, which has the bench press's place.
    await setSessions(page, '2');
    await openSettingsRow(page, 'push');
    const editor = page.getByTestId('push-lift-editor');
    await editor.getByLabel('Lift', { exact: true }).selectOption('barbell-bench-press');
    await expect(page.getByTestId('push-needs-target')).toHaveText(
      'Set a target to start pushing Barbell Bench Press.',
    );
    await editor.getByLabel('Target max').fill('225');
    await expect(page.getByTestId('settings-save-status')).toHaveText(
      'Saved and verified on this device',
    );
    await expect(page.getByTestId('row-push')).toContainText('Barbell Bench Press to 225 lb');

    await page.goto('./#/today');
    const first = page.getByTestId('workout-entry').first();
    await expect(first).toHaveAttribute('data-exercise-id', 'barbell-bench-press');
    await expect(first).toContainText('Lift to push');

    await page.goto('./#/progress');
    await expect(page.getByText('Barbell Bench Press to 225 lb')).toBeVisible();
    await expect(page.getByTestId('push-pace')).toHaveText('No reading yet');
  });
});

test.describe('what the app has learned (item 47)', () => {
  test('lists each learned value, and a reset asks once more', async ({ page }) => {
    await ensureProfile(page);
    await openSettingsRow(page, 'learned');
    const page47 = page.getByTestId('learned-values');
    for (const key of ['pace', 'habit', 'curves', 'reserve', 'pain', 'declines']) {
      await expect(page47.getByTestId(`learned-${key}`)).toBeVisible();
    }
    await expect(page47.getByTestId('learned-pace')).toContainText(
      'Nothing learned yet: it reads each finished workout from this version on.',
    );
    const habit = page47.getByTestId('learned-habit');
    await habit.getByTestId('learned-reset-habit').click();
    await expect(habit.getByTestId('learned-confirm-habit')).toBeVisible();
    await habit.getByTestId('learned-confirm-habit').click();
    await expect(habit).toContainText('Last reset');
  });
});

test.describe('the week the lifter actually trains (item 46)', () => {
  test('four weeks on two days bring the card, and the move takes the schedule there', async ({
    page,
  }) => {
    await ensureProfile(page);
    // Monday and Thursday of each of the last four complete weeks, at local noon.
    const records = await page.evaluate((day) => {
      const now = new Date();
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const out: string[] = [];
      for (let week = 1; week <= 4; week += 1) {
        for (const offset of [0, 3]) {
          out.push(new Date(monday.getTime() - week * 7 * day + offset * day).toISOString());
        }
      }
      return out;
    }, DAY);
    await seed(
      page,
      records.map((iso, index) =>
        workout(new Date(iso), [{ exerciseId: 'back-squat' }], `w-week-${index}`),
      ),
    );
    await coachCardFor(page, /^You train 2 days a week, not 4$/);
    await page.getByTestId('coach-action').click();
    await openSettingsRow(page, 'schedule');
    await expect(page.getByTestId('row-schedule')).toContainText('2');
    await expect(
      page.getByRole('radiogroup', { name: 'Sessions per week' }).getByRole('radio', { name: '2' }),
    ).toBeChecked();
  });
});

test.describe('pain patterns over weeks (item 45)', () => {
  test('a joint that keeps hurting with one exercise brings its four-week swap', async ({
    page,
  }) => {
    await ensureProfile(page);
    // Full body every session, which has the bench press.
    await setSessions(page, '2');
    await page.goto('./#/today');
    const now = Date.now();
    const at = (days: number) => new Date(now - days * DAY);
    await seed(page, [
      workout(at(21), [{ exerciseId: 'barbell-bench-press', joint: 'shoulder' }], 'w-p-21'),
      workout(at(17), [{ exerciseId: 'dumbbell-bench-press' }], 'w-p-17'),
      workout(at(14), [{ exerciseId: 'barbell-bench-press', joint: 'shoulder' }], 'w-p-14'),
      workout(at(10), [{ exerciseId: 'dumbbell-bench-press' }], 'w-p-10'),
      workout(at(7), [{ exerciseId: 'barbell-bench-press', joint: 'shoulder' }], 'w-p-7'),
    ]);
    await coachCardFor(
      page,
      /^Shoulder pain with Barbell Bench Press, not with Dumbbell Bench Press$/,
    );
    const card = page.getByTestId('coach-card');
    // The setup's lifter is past beginner, so the card is brief: the footnote carries this.
    const footnote = card.getByTestId('coach-footnote');
    await expect(footnote).toContainText('A pattern in what you logged, not a diagnosis.');
    await expect(footnote).toContainText('a health professional can check it');
    await card.getByTestId('coach-action').click();
    await expect(
      page.locator('[data-testid="workout-entry"][data-exercise-id="dumbbell-bench-press"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="workout-entry"][data-exercise-id="barbell-bench-press"]'),
    ).toHaveCount(0);
  });
});
