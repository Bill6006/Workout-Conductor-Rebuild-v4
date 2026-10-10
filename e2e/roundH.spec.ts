import { expect, test, type Locator, type Page } from '@playwright/test';
import { ensureProfile, skipWarmupIfShown } from './helpers';

/**
 * Maintenance 26, round H, in a real browser: a typed number that looks like a slip is asked about
 * once before it is logged (item 40), and a bad start to a workout carries over to the lifts still
 * to come, and comes back off after an undo (item 42). Synthetic data only.
 */

const SESSION_KEY = 'wc.v1.session';

async function startWorkout(page: Page): Promise<void> {
  await ensureProfile(page);
  await page.getByTestId('start-workout').click();
  await expect(page.getByTestId('workout-stats')).toBeVisible();
}

const logger = (page: Page) => page.locator('[data-testid="set-logger"][data-mode="log"]');

async function typeInto(
  dial: Locator,
  field: 'weight' | 'reps' | 'rir',
  label: string,
  value: string,
) {
  await dial.getByTestId(`logger-${field}`).click();
  const input = dial.getByRole('spinbutton', { name: label });
  await input.fill(value);
  await input.press('Enter');
}

/** A set was just logged with a rest after it: skip the rest and let the next set come in front. */
async function skipRest(page: Page): Promise<void> {
  const timer = page.getByTestId('rest-timer');
  await expect(timer).toBeVisible();
  await page.getByTestId('skip-rest').click();
  await expect(timer).toBeHidden();
}

test.describe('numbers that look like slips (item 40)', () => {
  test('a weight past what almost anyone loads is asked about once, changed or kept', async ({
    page,
  }) => {
    await startWorkout(page);
    await skipWarmupIfShown(page);
    const done = page.locator('[data-testid="set-row"][data-state="done"]');
    const before = await done.count();
    const card = logger(page);
    await card.getByTestId('logger-weight').click();
    await card.getByRole('spinbutton', { name: 'Weight' }).fill('1850');
    await card.getByTestId('log-set').click();
    const question = card.getByTestId('slip-question');
    await expect(question).toContainText('1850 lb is more than 1000 lb');
    // Nothing was logged: no set row more is done (the review: a hidden rest proved nothing).
    await expect(done).toHaveCount(before);

    // Change it: back to the weight, ready to type.
    await card.getByTestId('slip-change').click();
    const weight = card.getByRole('spinbutton', { name: 'Weight' });
    await expect(weight).toBeFocused();
    await weight.fill('95');
    await card.getByTestId('log-set').click();
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await skipRest(page);

    // Kept: the next set at 1850 logs as it is, once asked.
    await logger(page).getByTestId('logger-weight').click();
    await logger(page).getByRole('spinbutton', { name: 'Weight' }).fill('1850');
    await logger(page).getByTestId('log-set').click();
    await expect(logger(page).getByTestId('slip-keep')).toHaveText(/^Log 1850 lb × \d+$/);
    await logger(page).getByTestId('slip-keep').click();
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await expect(
      page.locator('[data-testid="set-row"][data-state="done"] [data-testid="logged-value"]'),
    ).toContainText([/1850 lb/]);
  });
});

type Entry = Record<string, unknown> & { sets: Record<string, unknown>[] };
type Session = { workout: { blocks: { kind: string; entries: Entry[] }[] } };

/**
 * Today's first two straight lifts with targets their own logs set: 8-12 reps with nothing in
 * reserve on the weight they have, three working sets, no ramps. The rest of the plan is left as
 * built. A start is read against the smaller of a target's reserve and the plan's (the re-check of
 * item 42), and none is the smaller whatever the style plans, so three short is three short.
 */
async function judgeableStart(page: Page): Promise<string[]> {
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY);
  const session = JSON.parse(stored ?? '{}') as Session;
  const straight = session.workout.blocks.filter((block) => block.kind === 'straight').slice(0, 2);
  if (straight.length < 2) throw new Error('fewer than two straight lifts');
  session.workout.blocks = [
    ...straight,
    ...session.workout.blocks.filter((block) => !straight.includes(block)),
  ];
  const names: string[] = [];
  for (const block of straight) {
    const entry = block.entries[0] as Entry;
    names.push(entry.exerciseId as string);
    entry.warmupSets = 0;
    entry.dropSet = false;
    delete entry.manual;
    entry.progression = {
      mode: 'reps',
      evidence: ['Last: as logged'],
      sessions: 2,
      viaFamily: false,
      confidence: 'medium',
      setsAdvice: 0,
    };
    const working = entry.sets.filter((set) => set.kind === 'working').slice(0, 3);
    entry.sets = working.map((set, index) => ({
      ...set,
      index,
      targetReps: [8, 12],
      targetRir: 0,
    }));
  }
  await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
    key: SESSION_KEY,
    value: JSON.stringify(session),
  });
  await page.reload();
  await expect(page.getByTestId('start-workout')).toBeVisible();
  return names;
}

/** Logs the set in front: 5 reps at 0 in reserve (three short of 8 at 0), or as prefilled. */
async function logSet(page: Page, short: boolean): Promise<void> {
  const card = logger(page);
  if (short) {
    await typeInto(card, 'reps', 'Reps', '5');
    await expect(card.getByTestId('logger-reps')).toContainText('5');
    await typeInto(card, 'rir', 'RIR', '0');
    await expect(card.getByTestId('logger-rir')).toContainText('0');
  }
  await card.getByTestId('log-set').click();
  // A question would only come from a slip; these are plausible numbers.
  await expect(card.getByTestId('slip-question')).toHaveCount(0);
  // Every set here has a rest after it.
  await skipRest(page);
}

test.describe('a bad start carries over (item 42)', () => {
  test('two lifts three reps short ease the rest, and an undo brings the plan back', async ({
    page,
  }) => {
    await ensureProfile(page);
    await judgeableStart(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();

    // The first lift: its first set three reps short, then two as prefilled.
    await logSet(page, true);
    await logSet(page, false);
    await logSet(page, false);
    await expect(page.getByTestId('recalibration-summary')).not.toContainText('hard start');

    // The second lift's first set falls short too: the rest is eased, and the line says why.
    await logSet(page, true);
    const summary = page.getByTestId('recalibration-summary');
    await expect(summary).toContainText(/^Eased for a hard start \(.+ and .+ fell well short; /);
    await expect(summary).toContainText('fewer sets');

    // Undone, the start no longer falls short: the planned work comes back.
    await page.getByTestId('undo-set').click();
    await expect(summary).toContainText(/^Back to plan/);
  });
});
