#!/usr/bin/env node
/**
 * Renders the approved app icon, assets/app-icon.png (the owner's artwork exactly as provided,
 * 1024 x 1024), into every file the page, the PWA manifest and the app use, then reads each file
 * back from disk and checks it holds the artwork at its size. Uses the Playwright Chromium already
 * required for the browser tests, so there is no extra native image dependency.
 * Run: npm run icons (ICONS_CHROMIUM=<path> renders with another Chromium).
 *
 * - icon-192.png and icon-512.png: the artwork, full bleed: the manifest's icons. The 192 is also
 *   the logo in the app's header and the notifications' icon.
 * - icon-maskable-512.png: Android's launcher icon. The artwork at 58%, its own dark edge carried
 *   out to the border, so the background stays full bleed with no seam where the artwork ends,
 *   and the dumbbell keeps clear space on every side even where a launcher shows only the centre
 *   two thirds of the icon (below), whatever shape it cuts.
 * - apple-touch-icon-180.png: full bleed; iOS rounds the corners itself.
 * - favicon-32.png: the browser tab.
 *
 * The icons were once SVG files wrapping the artwork as base64 text, and a truncated copy of that
 * text broke the app's own logo: here nothing is copied by hand, and a file that does not decode,
 * does not show the artwork, is not dark to its edge or has the dumbbell out of place stops the run.
 */
// The functions given to page.evaluate run in the page, where these are defined.
/* global document, Image */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = path.join('assets', 'app-icon.png');
const ICON_DIR = path.join('public', 'icons');

/**
 * scale is the artwork's share of the icon's width, centred, its edge carried out to the border.
 * reach is where the dumbbell's farthest point must fall, measured on the written file, as a share
 * of the narrowest launcher circle seen: a third of the icon's width. Chrome's home-screen shortcut
 * on a Pixel launcher (Android 16, Chrome 133, 2026-10-24) showed only the centre 72 of Android's
 * 108 dp, the maskable icon unpadded; a launcher that pads it as the maskable standard intends shows
 * the centre 87%, and the dumbbell only sits farther in. Full bleed, the artwork reaches 1.25.
 */
const TARGETS = [
  { file: 'icon-192.png', size: 192, scale: 1, reach: [1.2, 1.3] },
  { file: 'icon-512.png', size: 512, scale: 1, reach: [1.2, 1.3] },
  // At 90% (2026-10-23) that launcher cut off both ends of the dumbbell. At 58% it reaches 0.73:
  // about 71% of a rounded-square tile's width with a seventh clear on each side, and as clear
  // inside a circle; 55% of the tile where the icon is padded.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.58, reach: [0.65, 0.8] },
  { file: 'apple-touch-icon-180.png', size: 180, scale: 1, reach: [1.2, 1.3] },
  { file: 'favicon-32.png', size: 32, scale: 1, reach: [1.15, 1.3] },
];

const dataUrlOf = (bytes) => `data:image/png;base64,${bytes.toString('base64')}`;

mkdirSync(ICON_DIR, { recursive: true });
const source = dataUrlOf(readFileSync(SOURCE));
const executablePath = process.env.ICONS_CHROMIUM || undefined;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');

  for (const target of TARGETS) {
    const png = await page.evaluate(
      async ({ src, size, scale }) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        let canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        // Halved step by step, then drawn at its size: a smooth downscale with no aliasing.
        const inner = Math.round(size * scale);
        while (canvas.width / 2 >= inner) {
          const half = document.createElement('canvas');
          half.width = Math.round(canvas.width / 2);
          half.height = Math.round(canvas.height / 2);
          const context = half.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(canvas, 0, 0, half.width, half.height);
          canvas = half;
        }
        const art = document.createElement('canvas');
        art.width = inner;
        art.height = inner;
        const artContext = art.getContext('2d');
        artContext.imageSmoothingQuality = 'high';
        artContext.drawImage(canvas, 0, 0, inner, inner);
        const out = document.createElement('canvas');
        out.width = size;
        out.height = size;
        const context = out.getContext('2d');
        const at = Math.floor((size - inner) / 2);
        const far = size - at - inner;
        // The artwork's outermost pixels carried out to the border, side by side and the corners.
        context.imageSmoothingEnabled = false;
        const last = inner - 1;
        context.drawImage(art, 0, 0, 1, inner, 0, at, at, inner);
        context.drawImage(art, last, 0, 1, inner, at + inner, at, far, inner);
        context.drawImage(art, 0, 0, inner, 1, at, 0, inner, at);
        context.drawImage(art, 0, last, inner, 1, at, at + inner, inner, far);
        context.drawImage(art, 0, 0, 1, 1, 0, 0, at, at);
        context.drawImage(art, last, 0, 1, 1, at + inner, 0, far, at);
        context.drawImage(art, 0, last, 1, 1, 0, at + inner, at, far);
        context.drawImage(art, last, last, 1, 1, at + inner, at + inner, far, far);
        context.drawImage(art, at, at);
        return out.toDataURL('image/png').split(',')[1];
      },
      { src: source, size: target.size, scale: target.scale },
    );
    writeFileSync(path.join(ICON_DIR, target.file), Buffer.from(png, 'base64'));

    // Read back from disk: it decodes, it is its size, its artwork area matches the artwork (both
    // drawn down to 16 x 16, the channels a little off at most on average), its dark background
    // reaches every edge, and the dumbbell reaches as far as its target allows, no farther.
    const { problem, reach } = await page.evaluate(
      async ({ src, written, size, scale, band }) => {
        const load = async (url) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          return image;
        };
        const thumb = (image, inset) => {
          const canvas = document.createElement('canvas');
          canvas.width = 16;
          canvas.height = 16;
          const context = canvas.getContext('2d');
          context.imageSmoothingQuality = 'high';
          const from = image.naturalWidth * inset;
          const span = image.naturalWidth - 2 * from;
          context.drawImage(image, from, from, span, span, 0, 0, 16, 16);
          return context.getImageData(0, 0, 16, 16).data;
        };
        const icon = await load(written);
        if (icon.naturalWidth !== size || icon.naturalHeight !== size) {
          return {
            problem: `is ${icon.naturalWidth}x${icon.naturalHeight}, not ${size}x${size}`,
            reach: null,
          };
        }
        const expected = thumb(await load(src), 0);
        const actual = thumb(icon, (1 - scale) / 2);
        let total = 0;
        for (let index = 0; index < expected.length; index += 4) {
          for (let channel = 0; channel < 3; channel += 1) {
            total += Math.abs(expected[index + channel] - actual[index + channel]);
          }
        }
        const mean = total / ((expected.length / 4) * 3);
        if (mean > 12) {
          return {
            problem: `does not show the artwork (mean difference ${mean.toFixed(1)})`,
            reach: null,
          };
        }

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        context.drawImage(icon, 0, 0);
        const data = context.getImageData(0, 0, size, size).data;
        const luminance = (x, y) => {
          const index = (y * size + x) * 4;
          return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
        };
        // Full bleed: every edge pixel opaque and as dark as the artwork's own background.
        for (let along = 0; along < size; along += 1) {
          for (const [x, y] of [
            [along, 0],
            [along, size - 1],
            [0, along],
            [size - 1, along],
          ]) {
            if (data[(y * size + x) * 4 + 3] !== 255 || luminance(x, y) > 40) {
              return { problem: `is not dark and opaque to its edge at ${x},${y}`, reach: null };
            }
          }
        }
        // The dumbbell is every pixel well above the background; its farthest from the centre,
        // as a share of the narrowest launcher circle's radius, a third of the width.
        const centre = (size - 1) / 2;
        let farthest = 0;
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            if (luminance(x, y) > 60) {
              farthest = Math.max(farthest, Math.hypot(x - centre, y - centre));
            }
          }
        }
        const reach = farthest / (size / 3);
        if (reach < band[0] || reach > band[1]) {
          return {
            problem: `has the dumbbell reaching ${reach.toFixed(3)} of the launcher circle, outside ${band[0]} to ${band[1]}`,
            reach,
          };
        }
        return { problem: null, reach };
      },
      {
        src: source,
        written: dataUrlOf(readFileSync(path.join(ICON_DIR, target.file))),
        size: target.size,
        scale: target.scale,
        band: target.reach,
      },
    );
    if (problem !== null) throw new Error(`generate-icons: ${target.file} ${problem}`);
    console.log(
      `generate-icons: wrote ${target.file} (${target.size}px), checked: the dumbbell reaches ${reach.toFixed(3)} of the launcher circle`,
    );
  }
} finally {
  await browser.close();
}
