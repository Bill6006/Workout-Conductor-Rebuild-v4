import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile } from './helpers';

/**
 * Maintenance 21, round C. The coach talks only about the workout on the screen; a lift done at
 * bodyweight that keeps falling short gets fewer reps over more sets instead of "take 10% off";
 * a strength set at the heaviest weight a place has keeps its fast lift; and the hints under the
 * logger's dials are never cut off.
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

/** A fresh backup, so the coach's save reminder does not outrank what the test is about. */
async function backUp(page: Page): Promise<void> {
  await page.goto('./#/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Full Backup JSON' }).click();
  await download;
  await page.goto('./#/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
}

const STALLED_BENCH = Buffer.from(
  JSON.stringify({
    history: [28, 21, 14, 7].map((daysAgo) => ({
      date: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      unit: 'lb',
      exercises: [
        {
          name: 'Barbell Bench Press',
          sets: [
            { weight: 185, reps: 5, rir: 2 },
            { weight: 185, reps: 5, rir: 2 },
            { weight: 185, reps: 5, rir: 2 },
          ],
        },
      ],
    })),
  }),
);

/** Four bench sessions at the same load and effort, imported as older history. */
async function importStalledBench(page: Page): Promise<void> {
  await page.goto('./#/settings');
  await page.getByTestId('legacy-file-input').setInputFiles({
    name: 'old-history.json',
    mimeType: 'application/json',
    buffer: STALLED_BENCH,
  });
  await expect(page.getByRole('dialog', { name: 'Import these workouts?' })).toBeVisible();
  await page.getByTestId('legacy-confirm').click();
  await expect(
    page.locator('[role="status"]').filter({ hasText: 'Imported and verified 4 workouts' }),
  ).toBeVisible();
  await backUp(page);
}

/** Two chin-up sessions, six and two days ago, both short of the bottom of a 6-12 range. */
async function seedShortChinUps(page: Page): Promise<void> {
  const records = [6, 2].map((daysAgo) => {
    const when = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    return {
      id: `w-e2e-chin-${daysAgo}`,
      startedAt: when,
      completedAt: when,
      locationId: 'gym',
      templateId: 'pull-arms',
      title: 'Pull + arms',
      entries: [
        {
          exerciseId: 'chin-up',
          sets: [5, 4, 4].map((reps) => ({
            kind: 'working',
            reps,
            weight: null,
            rir: 1,
            completed: true,
            targetReps: [6, 12],
            targetRir: 1,
          })),
        },
      ],
    };
  });
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
  // Opened again with the new history, the plan for today is rebuilt from it.
  await page.reload();
  await expect(page.getByTestId('start-workout')).toBeVisible();
  await backUp(page);
}

type Session = { workout: { blocks: { kind: string; entries: Record<string, unknown>[] }[] } };

/** Rewrites the stored plan for today and opens the app again, as a phone would. */
/** A change to today's stored plan: what `without` and `firstIs` make. */
type Change = ReturnType<typeof without>;

async function rewrite(page: Page, change: Change): Promise<void> {
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY);
  const session = JSON.parse(stored ?? '{}') as Session;
  change(session);
  await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
    key: SESSION_KEY,
    value: JSON.stringify(session),
  });
  await page.reload();
  await expect(page.getByTestId('start-workout')).toBeVisible();
}

/** Takes an exercise out of today's plan, dropping any block it leaves empty. */
function without(exerciseId: string) {
  return (session: Session) => {
    session.workout.blocks = session.workout.blocks
      .map((block) => ({
        ...block,
        entries: block.entries.filter((entry) => entry.exerciseId !== exerciseId),
      }))
      .filter((block) => block.entries.length > 0);
  };
}

/** Makes the first straight exercise of today's plan the given one, moved to the top. */
function firstIs(exerciseId: string, role: string, extra: Record<string, unknown> = {}) {
  return (session: Session) => {
    const block = session.workout.blocks.find((candidate) => candidate.kind === 'straight');
    if (!block) throw new Error('no straight block');
    session.workout.blocks = [block, ...session.workout.blocks.filter((b) => b !== block)];
    const entry = block.entries[0] as Record<string, unknown> & { sets: Record<string, unknown>[] };
    entry.exerciseId = exerciseId;
    entry.role = role;
    entry.warmupSets = 0;
    entry.dropSet = false;
    delete entry.progression;
    delete entry.manual;
    entry.sets = entry.sets
      .filter((set) => set.kind === 'working')
      .slice(0, 3)
      .map((set, index) => ({ ...set, index }));
    Object.assign(entry, extra);
  };
}

test.describe('the coach talks about the workout on the screen', () => {
  test('a stalled bench press waits for a day that has it', async ({ page }) => {
    await ensureProfile(page);
    await importStalledBench(page);
    const card = page.getByTestId('coach-card');
    await expect(card.getByTestId('coach-headline')).toContainText('Barbell Bench Press');
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY);

    await rewrite(page, without('barbell-bench-press'));
    await expect(page.getByTestId('coach-card')).toBeVisible();
    await expect(page.getByTestId('coach-card')).not.toContainText('Bench Press');

    // The same plan with the bench press back brings the note back with its step.
    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value ?? ''), {
      key: SESSION_KEY,
      value: stored,
    });
    await page.reload();
    await expect(page.getByTestId('coach-card').getByTestId('coach-headline')).toContainText(
      'Barbell Bench Press',
    );
  });
});

test.describe('a lift done at bodyweight that keeps falling short', () => {
  test('gets fewer reps over more sets as one tap, never "take 10% off"', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await seedShortChinUps(page);
    await rewrite(page, (session) => {
      without('chin-up')(session);
      firstIs('lat-pulldown', 'secondary-hypertrophy')(session);
    });

    // Chin-Up comes in through the swap list, so its target is the engine's own.
    await page
      .locator('[data-testid="workout-entry"][data-exercise-id="lat-pulldown"]')
      .first()
      .click();
    await page.getByRole('button', { name: 'Use Chin-Up instead' }).click();
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      'Swapped Lat Pulldown for Chin-Up',
    );

    const card = page.getByTestId('coach-card');
    await expect(card.getByTestId('coach-headline')).toHaveText(
      'Chin-Up: short of 6 reps twice in a row',
    );
    await expect(card).toContainText(
      'Do fewer reps over more sets, or swap in Lat Pulldown for a few weeks.',
    );
    await expect(card).not.toContainText(/micro-deload|10%/);
    const action = card.getByTestId('coach-action');
    await expect(action).toHaveText(/^\d sets of 3-5 today$/);
    await expect(card.getByTestId('coach-dismiss')).toBeVisible();
    await capture(page, testInfo, 'today-fewer-reps-card', card);

    const label = (await action.textContent()) ?? '';
    const sets = Number(/^(\d)/.exec(label)?.[1]);
    await action.click();
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      `Chin-Up: ${sets} sets of 3-5.`,
    );
    await expect(
      page.locator('[data-testid="workout-entry"][data-exercise-id="chin-up"]'),
    ).toContainText('3-5');
    await expect(page.getByTestId('coach-card')).not.toContainText('short of 6 reps');
  });
});

test.describe('a strength set at the heaviest weight a place has', () => {
  test('keeps the fast lift: 3-1-X-0, with the research behind the slower lowering', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await rewrite(
      page,
      firstIs('barbell-bench-press', 'primary-strength', {
        progression: {
          mode: 'weight',
          evidence: ['Held at the heaviest weight here (135 lb): the reps go up instead.'],
          sessions: 3,
          viaFamily: false,
          confidence: 'high',
          setsAdvice: 0,
          capped: { at: 135 },
        },
      }),
    );
    await page.getByTestId('start-workout').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
    const card = page.getByTestId('exercise-card').first();
    await expect(card.getByTestId('tempo-line')).toContainText('3-1-X-0');
    await card.getByTestId('tempo-line').click();
    const detail = card.getByTestId('tempo-detail');
    await expect(detail).toContainText('drive up as fast as you can');
    // Said once, in the reason itself (Maintenance 23, the owner's item 27).
    await expect(detail).not.toContainText('X is as fast as you can');
    await detail.getByTestId('tempo-why').locator('summary').click();
    await expect(detail.getByTestId('tempo-why')).toContainText('Amdi and King, 2025');
    await expect(detail.getByTestId('tempo-why')).not.toContainText('Roig');
    await capture(page, testInfo, 'workout-capped-strength-tempo', detail);
  });
});

test.describe('the hints under the dials', () => {
  test('fit on a ramp set, and wrap rather than being cut off at larger text', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    const card = page.getByTestId('exercise-card').first();
    // The empty bar earns no ramp; a max gives the lift its ramps.
    await card.getByTestId('know-max').click();
    const sheet = page.getByRole('dialog', { name: /Your max for/ });
    await sheet.getByTestId('max-weight').fill('185');
    await sheet.getByTestId('max-reps').fill('5');
    await sheet.getByTestId('max-save').click();
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    await expect(card.getByTestId('target-line')).toContainText('Ramp 1 of');
    await expect(card.getByTestId('reps-hint')).toHaveText(/^Target \d+-\d+$/);
    await expect(card.getByTestId('rir-hint')).toHaveText(/^Easy, RIR \d+$/);
    await capture(page, testInfo, 'workout-ramp-hints', card.getByTestId('set-logger'));

    const clipped = () =>
      card.evaluate((root) =>
        ['weight-hint', 'reps-hint', 'rir-hint']
          .map((id) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`))
          .filter((el): el is HTMLElement => el !== null)
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.dataset.testid),
      );
    expect(await clipped()).toEqual([]);
    // Larger text, in a wide font close to the Linux runner's: still nothing cut off.
    await page.addStyleTag({ content: '* { font-family: Verdana, sans-serif !important; }' });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '130%';
    });
    expect(await clipped()).toEqual([]);
  });
});
