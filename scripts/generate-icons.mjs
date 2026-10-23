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
 * - icon-maskable-512.png: the artwork at 90%, its own edge carried out to the border, so all of
 *   it sits inside the maskable safe zone (a circle 80% of the width) whatever shape a launcher
 *   cuts, with no seam where the artwork ends.
 * - apple-touch-icon-180.png: full bleed; iOS rounds the corners itself.
 * - favicon-32.png: the browser tab.
 *
 * The icons were once SVG files wrapping the artwork as base64 text, and a truncated copy of that
 * text broke the app's own logo: here nothing is copied by hand, and a file that does not decode,
 * or does not show the artwork, stops the run.
 */
// The functions given to page.evaluate run in the page, where these are defined.
/* global document, Image */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = path.join('assets', 'app-icon.png');
const ICON_DIR = path.join('public', 'icons');

/** scale is the artwork's share of the icon's width, centred, its edge carried out to the border. */
const TARGETS = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.9 },
  { file: 'apple-touch-icon-180.png', size: 180, scale: 1 },
  { file: 'favicon-32.png', size: 32, scale: 1 },
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

    // Read back from disk: it decodes, it is its size, and its artwork area matches the artwork
    // (both drawn down to 16 x 16, the channels a little off at most on average).
    const problem = await page.evaluate(
      async ({ src, written, size, scale }) => {
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
          return `is ${icon.naturalWidth}x${icon.naturalHeight}, not ${size}x${size}`;
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
        return mean <= 12 ? null : `does not show the artwork (mean difference ${mean.toFixed(1)})`;
      },
      {
        src: source,
        written: dataUrlOf(readFileSync(path.join(ICON_DIR, target.file))),
        size: target.size,
        scale: target.scale,
      },
    );
    if (problem !== null) throw new Error(`generate-icons: ${target.file} ${problem}`);
    console.log(`generate-icons: wrote ${target.file} (${target.size}px), checked`);
  }
} finally {
  await browser.close();
}
