import { expect, test, type Locator, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile } from './helpers';

/**
 * Maintenance 25, item 7, in a real browser at a phone's width: How to opens over the workout card
 * with the exercise's own clip large, slowed or paused on a tap, then its steps and its credit;
 * nothing runs off the side, the clip leaves room for the steps, and the card does not grow.
 */

/** A workout started, and the first card's clip playing. */
async function startedCardClip(page: Page): Promise<Locator> {
  await ensureProfile(page);
  await page.getByTestId('start-workout').click();
  await expect(page.getByTestId('workout-stats')).toBeVisible();
  const clip = page
    .getByTestId('exercise-card')
    .first()
    .locator('video[data-testid="exercise-thumb"]');
  await expect(clip).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(
      () =>
        clip.evaluate((element: HTMLVideoElement) =>
          element.paused ? 0 : element.currentTime && element.duration,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  return clip;
}

/**
 * The Linux runner draws text in DejaVu Sans, wider than Windows' Segoe UI or Android's Roboto.
 * Verdana stands in for it on every run, so the card is as tall here as there: at 360 px the tap
 * on Options then scrolls the card's clip out of view, where it rests by design (the first deploy
 * of the phone review's fix failed on the runner only).
 */
async function wideFont(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const add = () => {
      const style = document.createElement('style');
      style.textContent = '* { font-family: Verdana, sans-serif !important; }';
      document.head.append(style);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  });
}

test.describe('How to', () => {
  test('opens over the card with the clip large, its steps and its credit', async ({ page }) => {
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    const card = page.getByTestId('exercise-card').first();
    const before = await card.boundingBox();

    await card.getByTestId('howto-button').click();
    const sheet = page.getByRole('dialog', { name: /^How to: / });
    await expect(sheet).toBeVisible();
    const video = sheet.locator('video[data-testid="exercise-demo"]');
    await expect(video).toBeVisible();
    // It plays, silent and looping: time moves on.
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0.2);
    expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
    expect(await video.evaluate((element: HTMLVideoElement) => element.loop)).toBe(true);
    await sheet.getByTestId('demo-slow').click();
    expect(await video.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(0.5);
    await sheet.getByTestId('demo-pause').click();
    await expect(video).toHaveAttribute('data-playing', 'false');
    expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);

    for (const name of ['Setup', 'Do it', 'Key cues', 'Avoid']) {
      await expect(sheet.getByRole('heading', { name })).toBeAttached();
    }
    await expect(sheet.getByTestId('demo-credit')).toHaveText(
      /^(Video|Drawings): .+ · (CC BY 3\.0|CC BY-SA 4\.0|Public domain)$/,
    );
    // Nothing runs off the side at a phone's width, and the clip leaves room for the steps.
    expect(
      await sheet.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    const clip = await video.boundingBox();
    const viewport = page.viewportSize();
    expect(clip && viewport ? clip.height : Infinity).toBeLessThanOrEqual(
      (viewport?.height ?? 0) * 0.53 + 1,
    );

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    // The card never grew by the demonstration.
    const after = await card.boundingBox();
    expect(Math.abs((after?.height ?? 0) - (before?.height ?? 0))).toBeLessThanOrEqual(1);
  });

  test("keeps the card's demonstration looping well past five seconds", async ({ page }) => {
    // The phone review: the card's clip rested on a still after five seconds and stayed there.
    // It watches the clip start over for nine seconds and more: room beyond the usual 30 s.
    test.setTimeout(90_000);
    const clip = await startedCardClip(page);
    const duration = await clip.evaluate((element: HTMLVideoElement) => element.duration);
    const starts = Math.max(2, Math.ceil(9 / duration));
    await clip.evaluate((element: HTMLVideoElement) => {
      const seen = { starts: 0, last: element.currentTime };
      Object.assign(window, { cardLoop: seen });
      element.addEventListener('timeupdate', () => {
        if (element.currentTime + 0.05 < seen.last) seen.starts += 1;
        seen.last = element.currentTime;
      });
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { cardLoop: { starts: number } }).cardLoop.starts,
          ),
        { timeout: (starts * duration + 15) * 1000 },
      )
      .toBeGreaterThanOrEqual(starts);
    await expect(
      page.getByTestId('exercise-card').first().getByTestId('exercise-thumb'),
    ).toHaveAttribute('data-animated', 'true');
  });

  test("rests the card's clip in the background, out of view or under a sheet, and plays it on once it is back", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clip = await startedCardClip(page);
    const paused = () => clip.evaluate((element: HTMLVideoElement) => element.paused);
    /** Playing again, and its time moving on from where it rested. */
    const playsOn = async () => {
      await expect.poll(paused, { timeout: 5_000 }).toBe(false);
      const from = await clip.evaluate((element: HTMLVideoElement) => element.currentTime);
      await expect
        .poll(() => clip.evaluate((element: HTMLVideoElement) => element.currentTime), {
          timeout: 5_000,
        })
        .not.toBe(from);
    };
    const pageBecomes = (state: 'hidden' | 'visible') =>
      page.evaluate((next) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => next });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);

    // Sent to the background and brought back, twice: it rests, then plays on.
    for (let round = 0; round < 2; round += 1) {
      await pageBecomes('hidden');
      await expect.poll(paused, { timeout: 5_000 }).toBe(true);
      await pageBecomes('visible');
      await playsOn();
    }

    // Scrolled out of view: it rests; scrolled back: it plays on. The whole workout's list,
    // opened, makes the page long enough to scroll the card away.
    await page.getByText('Whole workout', { exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement?.scrollHeight ?? 0));
    await expect(clip).not.toBeInViewport();
    await expect.poll(paused, { timeout: 5_000 }).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(clip).toBeInViewport();
    await playsOn();

    // Under How to the card's clip rests where it is, and plays on once How to closes.
    const card = page.getByTestId('exercise-card').first();
    const before = await clip.elementHandle();
    await card.getByTestId('card-thumb').click();
    const sheet = page.getByRole('dialog', { name: /^How to: / });
    await expect(sheet.locator('video[data-testid="exercise-demo"]')).toBeVisible();
    await expect.poll(paused, { timeout: 5_000 }).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await playsOn();
    expect(await clip.evaluate((element, earlier) => element === earlier, before)).toBe(true);
  });

  test('holds the card still with a pause mark while paused in How to, until Play there; a pause in Options holds nothing', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await wideFont(page);
    const clip = await startedCardClip(page);
    const card = page.getByTestId('exercise-card').first();
    const thumb = card.getByTestId('exercise-thumb');
    const sheet = page.getByRole('dialog', { name: /^How to: / });

    await card.getByTestId('card-thumb').click();
    await expect(sheet.locator('video[data-testid="exercise-demo"]')).toBeVisible();
    // Started by the app first, so the tap is a Pause.
    await expect
      .poll(() =>
        sheet
          .locator('video[data-testid="exercise-demo"]')
          .evaluate((v: HTMLVideoElement) => v.paused),
      )
      .toBe(false);
    await sheet.getByTestId('demo-pause').click();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(thumb).toHaveAttribute('data-animated', 'false');
    await expect(card.getByTestId('thumb-paused')).toBeVisible();
    // Brought back, the page leaves a held card still.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(1_000);
    expect(await thumb.evaluate((element) => element.tagName)).toBe('IMG');

    await card.getByTestId('card-thumb').click();
    await expect(sheet.getByTestId('demo-pause')).toHaveText('Play');
    await sheet.getByTestId('demo-pause').click();
    // The card's clip comes back under How to, and stays where it is until How to closes: the
    // card and How to never play the same clip at once (the re-check).
    await expect(clip).toBeAttached({ timeout: 10_000 });
    await page.waitForTimeout(1_500);
    expect(await clip.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(clip).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(
        () =>
          clip.evaluate((element: HTMLVideoElement) => (element.paused ? 0 : element.currentTime)),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0.2);
    await expect(card.getByTestId('thumb-paused')).toHaveCount(0);

    // Options' details have the demonstration too: a pause there is theirs alone.
    await card.getByTestId('options-tab').click();
    const options = page.getByRole('dialog');
    await expect(options.locator('video[data-testid="exercise-demo"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect
      .poll(() =>
        options
          .locator('video[data-testid="exercise-demo"]')
          .evaluate((v: HTMLVideoElement) => v.paused),
      )
      .toBe(false);
    await options.getByTestId('demo-pause').click();
    await expect(options.getByTestId('demo-pause')).toHaveText('Play');
    await page.keyboard.press('Escape');
    await expect(options).toBeHidden();
    await expect(thumb).toHaveAttribute('data-animated', 'true');
    await expect(card.getByTestId('thumb-paused')).toHaveCount(0);
    // The tap on Options scrolled the page down to it; back in view, the clip plays on.
    await clip.scrollIntoViewIfNeeded();
    await expect(clip).toBeInViewport();
    await expect
      .poll(() => clip.evaluate((element: HTMLVideoElement) => element.paused), { timeout: 5_000 })
      .toBe(false);
  });

  test("shows the card's still under reduced motion, and plays the clip once motion is allowed", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    await expect(page.getByTestId('workout-stats')).toBeVisible();
    const card = page.getByTestId('exercise-card').first();
    const thumb = card.getByTestId('exercise-thumb');
    await expect(thumb).toHaveAttribute('data-animated', 'false');
    await page.waitForTimeout(1_000);
    expect(await thumb.evaluate((element) => element.tagName)).toBe('IMG');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const clip = card.locator('video[data-testid="exercise-thumb"]');
    await expect(clip).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(
        () =>
          clip.evaluate((element: HTMLVideoElement) => (element.paused ? 0 : element.currentTime)),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0.2);
  });

  test('holds a tall clip to part of the screen, so the steps stay in reach', async ({ page }) => {
    await ensureProfile(page);
    await page.goto('./#/settings');
    await page.getByTestId('library-link').click();
    await page.getByRole('searchbox', { name: 'Search exercises' }).fill('back squat');
    await page.getByTestId('library-row').first().click();
    const sheet = page.getByRole('dialog', { name: 'Back Squat' });
    const video = sheet.locator('video[data-testid="exercise-demo"]');
    await expect(video).toBeVisible({ timeout: 10_000 });
    // A portrait clip (3:4) at a phone's width would stand taller than half the screen.
    const viewport = page.viewportSize();
    const limit = Math.min((viewport?.height ?? 0) * 0.52, 420) + 1;
    // The box the clip sits in, as the text below it sees it.
    const box = await video.locator('xpath=..').boundingBox();
    expect(box?.height ?? Infinity).toBeLessThanOrEqual(limit);
    expect(box?.height ?? 0).toBeGreaterThan(200);
    expect(
      await sheet.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
  });

  test('serves every demonstration from the app itself', async ({ request }) => {
    // Every clip the app ships, and its still, each named by its content (the unit tests tie
    // each to its exercise and check the name against the file).
    const files = readdirSync(path.join('public', 'media', 'exercises'));
    const clips = files.filter((name) => name.endsWith('.mp4'));
    expect(clips).toHaveLength(72);
    for (const clip of clips) {
      const exercise = clip.split('.')[0]!;
      const stills = files.filter(
        (name) => name.startsWith(`${exercise}.`) && name.endsWith('.webp'),
      );
      expect(stills, exercise).toHaveLength(1);
      for (const [file, type] of [
        [`media/exercises/${stills[0]}`, 'image/webp'],
        [`media/exercises/${clip}`, 'video/mp4'],
      ] as const) {
        const response = await request.get(file);
        expect(response.status(), file).toBe(200);
        expect(response.headers()['content-type'] ?? '', file).toContain(type);
      }
    }
  });
});
