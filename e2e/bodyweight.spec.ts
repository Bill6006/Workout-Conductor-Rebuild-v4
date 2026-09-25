import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile, skipWarmupIfShown } from './helpers';

/**
 * Maintenance 23, round E: bodyweight lifts and effort. A chin-up warms up with one set of a few
 * easy reps, said plainly, and "+ Ramp set" adds no second one (the owner's item 22); its working
 * sets say nothing about weights not logged yet, which a loaded lift still says (item 25); and its
 * tempo gives control, not a growth claim, as the reason for a slow lowering (item 26).
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

/** Two chin-up sessions at bodyweight, six and two days ago, inside a 6-12 range: no weights. */
async function seedChinUps(page: Page): Promise<void> {
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
          sets: [8, 8, 7].map((reps) => ({
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
async function rewrite(page: Page, change: typeof latPulldownFirst): Promise<void> {
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

/** Makes the first exercise of today's plan a lat pulldown with no chin-up anywhere else. */
function latPulldownFirst(session: Session): void {
  session.workout.blocks = session.workout.blocks
    .map((block) => ({
      ...block,
      entries: block.entries.filter((entry) => entry.exerciseId !== 'chin-up'),
    }))
    .filter((block) => block.entries.length > 0);
  const block = session.workout.blocks.find((candidate) => candidate.kind === 'straight');
  if (!block) throw new Error('no straight block');
  session.workout.blocks = [block, ...session.workout.blocks.filter((b) => b !== block)];
  const entry = block.entries[0] as Record<string, unknown> & { sets: Record<string, unknown>[] };
  entry.exerciseId = 'lat-pulldown';
  entry.role = 'secondary-hypertrophy';
  entry.warmupSets = 0;
  entry.dropSet = false;
  delete entry.progression;
  delete entry.manual;
  entry.sets = entry.sets
    .filter((set) => set.kind === 'working')
    .slice(0, 3)
    .map((set, index) => ({ ...set, index }));
}

/** Today's plan with a chin-up first, planned by the engine: swapped in for the lat pulldown. */
async function chinUpFirst(page: Page): Promise<void> {
  await rewrite(page, latPulldownFirst);
  await page
    .locator('[data-testid="workout-entry"][data-exercise-id="lat-pulldown"]')
    .first()
    .click();
  await page.getByRole('button', { name: 'Use Chin-Up instead' }).click();
  await expect(page.getByTestId('recalibration-summary')).toContainText(
    'Swapped Lat Pulldown for Chin-Up',
  );
}

async function openSheet(card: Locator): Promise<Locator> {
  await card.getByTestId('card-thumb').click();
  const sheet = card.page().getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Sets and order' })).toBeVisible();
  return sheet;
}

async function closeSheet(sheet: Locator): Promise<void> {
  await sheet.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(sheet).toBeHidden();
}

async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
}

async function startAtGym(page: Page): Promise<void> {
  await expect(page.getByTestId('location-open')).toContainText('Gym');
  await page.getByTestId('start-workout').click();
  await expect(page.getByTestId('workout-stats')).toBeVisible();
}

/** A bodyweight in Settings, so a dumbbell lift starts past what light dumbbells make. */
async function setBodyweight(page: Page): Promise<void> {
  await page.goto('./#/settings');
  await page.locator('#bodyweight').fill('180');
  await expect(page.getByTestId('settings-save-status')).toHaveText(
    'Saved and verified on this device',
    { timeout: 10_000 },
  );
  await settle(page);
  await page.goto('./#/today');
}

/** Skips every exercise ahead of the incline press on Today, so it is the lift in front. */
async function inclineInFront(page: Page): Promise<void> {
  await expect(
    page.locator('[data-testid="workout-entry"][data-exercise-id="incline-dumbbell-press"]'),
  ).toHaveCount(1);
  const first = page.getByTestId('workout-entry').first();
  for (let guard = 0; guard < 8; guard += 1) {
    await expect(first).toBeVisible();
    if ((await first.getAttribute('data-exercise-id')) === 'incline-dumbbell-press') return;
    await first.click();
    await page.getByRole('button', { name: 'Skip today' }).click();
    await settle(page);
  }
  throw new Error('the incline press never came to the front');
}

/** Brings a lift of today's workout to the front from the whole list. */
async function openLift(page: Page, name: string | RegExp): Promise<Locator> {
  const list = page.locator('ol[aria-label="Active workout list"]');
  if (!(await list.isVisible())) await page.getByText('Whole workout', { exact: true }).click();
  await list.locator('li').filter({ hasText: name }).getByRole('button').first().click();
  const card = page.getByTestId('exercise-card').first();
  await expect(card).toContainText(name);
  return card;
}

type Range = [from: number, to: number, step: number];

/** The dumbbells here, from the card's Plates tab: one range, or two where the jump changes. */
async function setDumbbells(card: Locator, first: Range, second?: Range): Promise<void> {
  const editor = card.getByTestId('loading-editor');
  // The tab opens and closes its panel: open it only when it is closed.
  if (!(await editor.isVisible())) await card.getByTestId('plates-tab').click();
  await editor.getByTestId('loading-edit').click();
  if (second && (await editor.getByTestId('loading-row-1').count()) === 0) {
    await editor.getByRole('button', { name: 'The jump changes higher up' }).click();
  }
  const rows = second ? [first, second] : [first];
  for (const [index, range] of rows.entries()) {
    const suffix = second ? `, range ${index + 1}` : '';
    await editor.getByLabel(`Lightest${suffix}`).fill(String(range[0]));
    await editor.getByLabel(`Heaviest${suffix}`).fill(String(range[1]));
    await editor.getByLabel(`Jump${suffix}`).fill(String(range[2]));
  }
  await editor.getByTestId('loading-save').click();
  await settle(card.page());
}

/** The rep range of the sets still to come, set by hand from the lift's sheet. */
async function setReps(card: Locator, low: number, high: number): Promise<void> {
  const sheet = await openSheet(card);
  await sheet.getByLabel('Rep range low').fill(String(low));
  await sheet.getByLabel('Rep range high').fill(String(high));
  await sheet.getByRole('button', { name: 'Set reps' }).click();
  await settle(card.page());
  if (await sheet.isVisible()) await closeSheet(sheet);
}

/** A max for the lift in front, from its Options tab. */
async function enterMax(page: Page, weight: number, reps: number): Promise<void> {
  await page.getByTestId('options-tab').first().click();
  await page.getByTestId('edit-max').click();
  const sheet = page.getByRole('dialog', { name: /Your max for/ });
  await sheet.getByTestId('max-weight').fill(String(weight));
  await sheet.getByTestId('max-reps').fill(String(reps));
  await sheet.getByTestId('max-save').click();
  await settle(page);
}

async function logAndMoveOn(page: Page): Promise<void> {
  await page.getByTestId('log-set').click();
  const skipRest = page.getByTestId('skip-rest');
  if (await skipRest.isVisible()) await skipRest.click();
}

/** One session of the incline press at 30 lb, eight days ago, at the top of 6-10. */
async function seedIncline(page: Page): Promise<void> {
  // Outside this week, and under a template today's plan is not, so today's plan is unchanged.
  const when = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const done = {
    id: 'w-e2e-incline-8',
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'upper',
    title: 'Upper',
    entries: [
      {
        exerciseId: 'incline-dumbbell-press',
        sets: [10, 10, 10].map((reps) => ({
          kind: 'working',
          reps,
          weight: 30,
          rir: 1,
          completed: true,
          targetReps: [6, 10],
          targetRir: 1,
          targetWeight: 30,
        })),
      },
    ],
  };
  await page.evaluate(
    async ({ name, item }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
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
    },
    { name: DB_NAME, item: done },
  );
  await page.reload();
  await expect(page.getByTestId('start-workout')).toBeVisible();
  await backUp(page);
}

test.describe('a chin-up warms up at bodyweight', () => {
  test('with one set of a few easy reps, said plainly, and no second one', async ({
    page,
  }, testInfo) => {
    await ensureProfile(page);
    await seedChinUps(page);
    await chinUpFirst(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();

    const card = page.getByTestId('exercise-card').first();
    await expect(card).toContainText('Chin-Up');
    await expect(card.getByTestId('target-line')).toContainText('Ramp 1 of 1');
    await expect(card.getByTestId('reps-hint')).toHaveText('A few easy reps');
    await expect(card.getByTestId('rir-hint')).toHaveText('Stop well short');
    await expect(card.getByTestId('weight-hint')).toHaveText('Bodyweight');
    // A few: two or three before sets of 6-12.
    await expect(card.getByTestId('logger-reps')).toContainText(/^[23]/);
    await capture(page, testInfo, 'workout-bodyweight-warmup', card.getByTestId('set-logger'));

    // It has its warm-up: "+ Ramp set" is not offered.
    const sheet = await openSheet(card);
    await expect(sheet.getByRole('button', { name: 'Skip warm-up sets' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '+ Ramp set' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: '+ Working set' })).toBeVisible();
    await closeSheet(sheet);

    // The working sets keep their numbers, and say nothing about weights not logged yet.
    await page.getByTestId('log-set').click();
    const skipRest = page.getByTestId('skip-rest');
    if (await skipRest.isVisible()) await skipRest.click();
    await expect(card.getByTestId('target-line')).toContainText('Set 1 of');
    await expect(card.getByTestId('reps-hint')).toHaveText(/^Target \d+-\d+$/);
    await expect(card.getByTestId('rir-hint')).toHaveText(/^Target RIR \d$/);
    await expect(card.getByTestId('weight-hint')).toHaveText('Bodyweight');
    await expect(page.getByTestId('logging-note')).toHaveCount(0);
    await capture(page, testInfo, 'workout-bodyweight-working', card.getByTestId('set-logger'));

    // A slow lowering is for control: the card makes no growth claim for it (item 26).
    await card.getByTestId('tempo-line').click();
    const detail = card.getByTestId('tempo-detail');
    await expect(detail).toContainText('lower for 3 under control, no pause, up smoothly');
    await expect(detail).not.toContainText('stretch');

    // Corrected afterwards, the logged warm-up still says it plainly.
    await card
      .locator('[data-testid="set-row"][data-state="done"] [data-testid="logged-value"]')
      .first()
      .click();
    const editor = card.locator('[data-testid="set-logger"][data-mode="edit"]');
    await expect(editor.getByTestId('reps-hint')).toHaveText('A few easy reps');
    await expect(editor.getByTestId('rir-hint')).toHaveText('Stop well short');
  });

  test('takes one back after "Skip warm-up sets", and no more', async ({ page }) => {
    await ensureProfile(page);
    await seedChinUps(page);
    await chinUpFirst(page);
    await page.getByTestId('start-workout').click();
    const card = page.getByTestId('exercise-card').first();
    await expect(card.getByTestId('target-line')).toContainText('Ramp 1 of 1');
    await page.getByTestId('skip-warmup').click();
    await expect(card.getByTestId('target-line')).toContainText('Set 1 of');

    // A skipped warm-up was never done: one can be added back.
    let sheet = await openSheet(card);
    await sheet.getByRole('button', { name: '+ Ramp set' }).click();
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      'Added a ramp set to Chin-Up',
    );
    await expect(card.getByTestId('target-line')).toContainText('Ramp');
    await expect(card.getByTestId('reps-hint')).toHaveText('A few easy reps');
    sheet = await openSheet(card);
    await expect(sheet.getByRole('button', { name: '+ Ramp set' })).toHaveCount(0);
    await closeSheet(sheet);
  });
});

test.describe('the note about weights not logged yet', () => {
  test('still shows under a loaded lift, with the same history', async ({ page }) => {
    await ensureProfile(page);
    await seedChinUps(page);
    await rewrite(page, latPulldownFirst);
    await page.getByTestId('start-workout').click();
    const card = page.getByTestId('exercise-card').first();
    await expect(card).toContainText('Lat Pulldown');
    await expect(card.getByTestId('target-line')).toContainText('Set 1 of');
    await expect(page.getByTestId('logging-note')).toHaveText(
      'No weights logged yet. Targets follow your last logged load.',
    );
  });
});

test.describe('dumbbells well short of the target', () => {
  test('hold at the heaviest pair and run a muscle-building set to its reserve', async ({
    page,
  }, testInfo) => {
    // Maintenance 23, the owner's item 21, set up the way the owner would at home.
    await ensureProfile(page);
    await page.goto('./#/settings');
    await page.locator('#bodyweight').fill('180');
    await expect(page.getByTestId('settings-save-status')).toHaveText(
      'Saved and verified on this device',
      { timeout: 10_000 },
    );
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    await page.goto('./#/today');
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    await page.getByText('Whole workout').click();
    await page
      .locator('ol[aria-label="Active workout list"] li')
      .filter({ hasText: 'Incline Dumbbell Press' })
      .getByRole('button')
      .first()
      .click();
    const card = page.getByTestId('exercise-card').first();
    await expect(card).toContainText('Incline Dumbbell Press');

    // The dumbbells here stop at 20 lb.
    await card.getByTestId('plates-tab').click();
    const editor = card.getByTestId('loading-editor');
    await expect(editor).toHaveAttribute('data-kind', 'dumbbells');
    await editor.getByTestId('loading-edit').click();
    await editor.getByLabel('Lightest').fill('5');
    await editor.getByLabel('Heaviest').fill('20');
    await editor.getByLabel('Jump').fill('5');
    await editor.getByTestId('loading-save').click();
    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
    await expect(editor.getByTestId('loading-summary')).toContainText('stop at 20 lb');

    // Its working sets take the reps that reach the planned effort, never past 30.
    await expect(card.getByText(/more sets · [0-9]+-[0-9]+ reps @ RIR/)).toHaveText(
      /sets · (1[6-9]|2[0-9])-(2[0-9]|30) reps @ RIR/,
    );
    await card.getByRole('tab', { name: 'How to' }).click();
    const evidence = card.getByTestId('progression-evidence');
    await expect(evidence).toContainText(
      /Held at the heaviest weight here \(20 lb\): about \d+ more reps, (to \d in reserve|up to 30)\./,
    );
    await capture(page, testInfo, 'workout-dumbbells-well-short', evidence);
  });
});

test.describe('changes mid-workout (Maintenance 23)', () => {
  test('a max entered after a ramp is done counts from the next session', async ({ page }) => {
    await ensureProfile(page);
    await startAtGym(page);
    // A max gives the bench press a 160 lb target and its ramps.
    await enterMax(page, 195, 5);
    const card = page.getByTestId('exercise-card').first();
    await expect(card.getByTestId('target-line')).toContainText(/Ramp 1 of \d/);
    const ramps = Number(
      /Ramp 1 of (\d)/.exec((await card.getByTestId('target-line').textContent()) ?? '')?.[1],
    );
    await logAndMoveOn(page);
    // A second max once a ramp is done: the lift keeps its sets, ramps and all.
    await enterMax(page, 225, 5);
    await expect(page.getByTestId('recalibration-summary')).toContainText(
      'Barbell Bench Press already has logged sets today; your max counts from the next session.',
    );
    await expect(card.getByTestId('target-line')).toContainText(
      ramps > 1 ? `Ramp 2 of ${ramps}` : 'Set 1 of',
    );
    await skipWarmupIfShown(page);
    await expect(page.getByTestId('weight-hint')).toHaveText('Target 160 lb');
  });

  test('a ramp still to come follows a working weight a missing plate moves', async ({ page }) => {
    await ensureProfile(page);
    await startAtGym(page);
    await enterMax(page, 195, 5);
    const card = page.getByTestId('exercise-card').first();
    const first = Number(
      /\d+/.exec((await page.getByTestId('logger-weight').textContent()) ?? '')?.[0],
    );
    await logAndMoveOn(page);
    // The 2.5s are not around today: 160 lb is not made, and the working sets drop to 155.
    await card.getByTestId('plates-tab').click();
    await page.getByTestId('missing-2.5').click();
    await settle(page);
    if ((await card.getByTestId('target-line').textContent())?.includes('Ramp')) {
      const next = Number(
        /(\d+) lb/.exec((await page.getByTestId('weight-hint').textContent()) ?? '')?.[1],
      );
      expect(next).toBeGreaterThan(first);
      expect(next).toBeLessThan(155);
    }
    await skipWarmupIfShown(page);
    await expect(page.getByTestId('weight-hint')).toHaveText('Target 155 lb');
  });

  test('reps set by hand stay through a change of dumbbells', async ({ page }) => {
    await ensureProfile(page);
    await setBodyweight(page);
    await inclineInFront(page);
    await startAtGym(page);
    const card = page.getByTestId('exercise-card').first();
    await expect(card).toContainText('Incline Dumbbell Press');
    await skipWarmupIfShown(page);
    await setReps(card, 12, 15);
    await expect(card.getByTestId('reps-hint')).toHaveText('Target 12-15');
    // The dumbbells here stop at 20 lb: the load comes down, and the reps are the lifter's.
    await setDumbbells(card, [5, 20, 5]);
    await expect(card.getByTestId('weight-hint')).toHaveText('Target 20 lb');
    await expect(card.getByTestId('reps-hint')).toHaveText('Target 12-15');
    await card.getByRole('tab', { name: 'How to' }).click();
    await expect(card.getByTestId('progression-evidence')).toContainText(
      'Held at the heaviest weight here (20 lb).',
    );
  });

  test('reps set by hand go back to their weight when the dumbbells come back', async ({
    page,
  }) => {
    await ensureProfile(page);
    await setBodyweight(page);
    await inclineInFront(page);
    await startAtGym(page);
    const card = page.getByTestId('exercise-card').first();
    await expect(card).toContainText('Incline Dumbbell Press');
    await skipWarmupIfShown(page);
    const target = (await card.getByTestId('weight-hint').textContent()) ?? '';
    expect(Number(/^Target (\d+) lb$/.exec(target)?.[1])).toBeGreaterThan(20);
    await setReps(card, 12, 15);
    // The dumbbells here stop at 20 lb, then go to 50 again.
    await setDumbbells(card, [5, 20, 5]);
    await expect(card.getByTestId('weight-hint')).toHaveText('Target 20 lb');
    await setDumbbells(card, [5, 50, 5]);
    await expect(card.getByTestId('weight-hint')).toHaveText(target);
    await expect(card.getByTestId('reps-hint')).toHaveText('Target 12-15');
    await card.getByRole('tab', { name: 'How to' }).click();
    await expect(card.getByTestId('progression-evidence')).not.toContainText(
      'Held at the heaviest weight here (20 lb)',
    );
  });

  test('a bodyweight warm-up stays easy under reps set by hand when the weights change', async ({
    page,
  }) => {
    await ensureProfile(page);
    await seedChinUps(page);
    await chinUpFirst(page);
    await page.getByTestId('start-workout').click();
    let card = page.getByTestId('exercise-card').first();
    await expect(card.getByTestId('target-line')).toContainText('Ramp 1 of 1');
    await setReps(card, 3, 5);
    // The dumbbells change on another lift: nothing to do with a chin-up.
    const other = await openLift(page, /Dumbbell/);
    await setDumbbells(other, [5, 30, 5]);
    // Back in front, its warm-up is a few easy reps under the 3-5 set by hand.
    card = await openLift(page, 'Chin-Up');
    await expect(card.getByTestId('target-line')).toContainText('Ramp 1 of 1');
    await expect(card.getByTestId('reps-hint')).toHaveText('A few easy reps');
    await expect(card.getByTestId('logger-reps')).toContainText(/^1/);
  });

  test('the step rule comes back when the weights that break it return', async ({ page }) => {
    await ensureProfile(page);
    await seedIncline(page);
    await inclineInFront(page);
    await startAtGym(page);
    const card = page.getByTestId('exercise-card').first();
    await expect(card).toContainText('Incline Dumbbell Press');
    // Dumbbells to 30, then a pair of 40s: after 30 lb × 10, the 35 asked is held at 30.
    await setDumbbells(card, [5, 30, 5], [40, 40, 5]);
    await skipWarmupIfShown(page);
    const step = 'The next weight here after 30 lb is 40: the reps go up first';
    await expect(card.getByTestId('target-note')).toContainText(step);
    await expect(card.getByTestId('weight-hint')).toHaveText('Target 30 lb');
    await expect(card.getByTestId('reps-hint')).toHaveText('Target 8-12');
    await logAndMoveOn(page);
    // The 40s go: 30 lb is the heaviest here, and the set runs to its effort.
    await setDumbbells(card, [5, 30, 5], [30, 30, 5]);
    await expect(card.getByTestId('weight-hint')).toHaveText('Target 30 lb');
    await expect(card.getByTestId('reps-hint')).not.toHaveText('Target 8-12');
    // The 40s come back: the step rule again, not a push.
    await setDumbbells(card, [5, 30, 5], [40, 40, 5]);
    await expect(card.getByTestId('target-note')).toContainText(step);
    await expect(card.getByTestId('reps-hint')).toHaveText('Target 8-12');
  });
});
