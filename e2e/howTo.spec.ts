import { expect, test, type Locator, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile } from './helpers';

/**
 * Maintenance 25, item 7, in a real browser at a phone's width: How to opens over the workout card
 * with the exercise's own clip large and slowed on a tap (no Pause: Maintenance 26, item 50), then
 * its steps and its credit; nothing runs off the side, the clip leaves room for the steps, and the
 * card does not grow.
 */

/** A one-pixel GIF: synthetic, the lifter's own demonstration in a test. */
const ONE_PIXEL_GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
/** The same pixel twice over: a two-frame GIF, synthetic, a replacement in a test. */
const TWO_FRAME_GIF =
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAAh+QQBAAAAACwAAAAAAQABAAACAUQAOw==';
const SESSION_KEY = 'wc.v1.session';

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
    // No Pause on any demonstration (Maintenance 26, item 50): it plays on.
    await expect(sheet.getByRole('button', { name: /pause/i })).toHaveCount(0);
    await expect(video).toHaveAttribute('data-playing', 'true');

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

  test("has no Pause, keeps the card looping, and sets the lifter's own GIF from How to", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clip = await startedCardClip(page);
    const card = page.getByTestId('exercise-card').first();
    const sheet = page.getByRole('dialog', { name: /^How to: / });

    await card.getByTestId('card-thumb').click();
    const video = sheet.locator('video[data-testid="exercise-demo"]');
    await expect(video).toBeVisible();
    await expect(sheet.getByRole('button', { name: /pause/i })).toHaveCount(0);
    // The way to their own: the demonstration itself, or its button.
    await expect(sheet.getByTestId('demo-pick')).toBeVisible();
    await expect(sheet.getByTestId('demo-your-gif')).toBeVisible();
    // A tap on the demonstration opens the phone's file chooser (the review of item 50): a
    // synthetic one-frame GIF is handed over through it.
    const chooser = page.waitForEvent('filechooser');
    await sheet.getByTestId('demo-pick').click();
    await (
      await chooser
    ).setFiles({
      name: 'mine.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from(ONE_PIXEL_GIF, 'base64'),
    });
    const own = sheet.getByTestId('custom-demo');
    await expect(own).toHaveAttribute('src', `data:image/gif;base64,${ONE_PIXEL_GIF}`);
    await expect(sheet.getByTestId('demo-remove')).toBeVisible();
    // Replaced through Replace: the new one shows at once, though there is still one.
    const again = page.waitForEvent('filechooser');
    await sheet.getByTestId('demo-replace').click();
    await (
      await again
    ).setFiles({
      name: 'other.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from(TWO_FRAME_GIF, 'base64'),
    });
    await expect(own).toHaveAttribute('src', /^data:image\/gif;base64,/);
    await expect(own).not.toHaveAttribute('src', `data:image/gif;base64,${ONE_PIXEL_GIF}`);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(card.getByTestId('exercise-thumb')).toHaveAttribute('data-custom', 'true');

    // Removed from How to: the clip again on the card, still under How to while How to's own
    // plays on (nothing plays a clip as it loads, Maintenance 25), then looping once it closes.
    await card.getByTestId('card-thumb').click();
    await sheet.getByTestId('demo-remove').click();
    const demo = sheet.locator('video[data-testid="exercise-demo"]');
    await expect(demo).toBeVisible();
    await expect(clip).toBeAttached();
    // At 360 px the tap on Remove scrolled How to's own past the top, where it rests.
    await demo.scrollIntoViewIfNeeded();
    await expect
      .poll(() => demo.evaluate((element: HTMLVideoElement) => element.currentTime), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0.5);
    expect(await clip.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect
      .poll(
        () =>
          clip.evaluate((element: HTMLVideoElement) => (element.paused ? 0 : element.currentTime)),
        {
          timeout: 10_000,
        },
      )
      .toBeGreaterThan(0.2);
  });

  test('a diagram in How to has no Pause over its label, and is tapped to use your own GIF', async ({
    page,
  }) => {
    await ensureProfile(page);
    // The owner's phone shot: Ab Wheel Rollout, a diagram, with Pause over its label.
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY);
    const session = JSON.parse(stored ?? '{}') as {
      workout: { blocks: { kind: string; entries: Record<string, unknown>[] }[] };
    };
    const block = session.workout.blocks.find((candidate) => candidate.kind === 'straight');
    if (!block) throw new Error('no straight block');
    session.workout.blocks = [block, ...session.workout.blocks.filter((other) => other !== block)];
    const entry = block.entries[0] as Record<string, unknown>;
    entry.exerciseId = 'ab-wheel-rollout';
    delete entry.progression;
    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
      key: SESSION_KEY,
      value: JSON.stringify(session),
    });
    await page.reload();
    await page.getByTestId('start-workout').click();
    const card = page.getByTestId('exercise-card').first();
    await card.getByTestId('card-thumb').click();
    const sheet = page.getByRole('dialog', { name: 'How to: Ab Wheel Rollout' });
    await expect(sheet.getByTestId('exercise-demo')).toBeVisible();
    await expect(sheet.getByRole('button', { name: /pause/i })).toHaveCount(0);
    await expect(sheet.getByTestId('demo-play')).toHaveCount(0);
    await expect(sheet.getByTestId('demo-credit')).toHaveText(
      'Diagram · tap it to use your own GIF',
    );
    // The diagram itself is the button that picks one, as is "Your GIF" under it, on one line,
    // in a wide font close to the Linux runner's too: at 360 px it would break there without its
    // rule (Windows' narrow font fits either way).
    await expect(sheet.getByTestId('demo-pick').getByTestId('exercise-demo')).toBeVisible();
    const yourGif = sheet.getByTestId('demo-your-gif');
    await expect(yourGif).toBeVisible();
    await page.addStyleTag({ content: '* { font-family: Verdana, sans-serif !important; }' });
    const lines = await yourGif.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
    });
    expect(lines).toBe(1);
    expect((await yourGif.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    // Under reduced motion it waits on its still with Play: at the top, clear of the diagram's
    // label along its foot, and a thumb's height (the review of item 50).
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await card.getByTestId('card-thumb').click();
    const play = sheet.getByTestId('demo-play');
    await expect(play).toBeVisible();
    const playBox = await play.boundingBox();
    const pictureBox = await sheet.getByTestId('exercise-demo').boundingBox();
    if (!playBox || !pictureBox) throw new Error('no Play or picture');
    expect(playBox.height).toBeGreaterThanOrEqual(44);
    expect(playBox.y + playBox.height).toBeLessThan(pictureBox.y + pictureBox.height / 2);
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
    // The stage the clip sits in, as the text below it sees it, and the clip's own box in it (the
    // picker button around it fills the stage: the re-check of item 50).
    const box = await sheet.getByTestId('demo-pick').locator('xpath=..').boundingBox();
    expect(box?.height ?? Infinity).toBeLessThanOrEqual(limit);
    expect(box?.height ?? 0).toBeGreaterThan(200);
    const own = await video.boundingBox();
    expect(own?.height ?? Infinity).toBeLessThanOrEqual(limit);
    expect(own?.height ?? 0).toBeGreaterThan(200);
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
