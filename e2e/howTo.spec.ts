import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { ensureProfile } from './helpers';

/**
 * Maintenance 25, item 7, in a real browser at a phone's width: How to opens over the workout card
 * with the exercise's own clip large, slowed or paused on a tap, then its steps and its credit;
 * nothing runs off the side, the clip leaves room for the steps, and the card does not grow.
 */

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
