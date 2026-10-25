#!/usr/bin/env node
/**
 * Renders the approved app icon, assets/app-icon.png (the owner's artwork, its pixels exactly as
 * provided on 2026-10-24: an angled dumbbell, neon green on dark metal, glowing on a dark textured
 * surface, full bleed, 1254 x 1254), into every file the page, the PWA manifest and the app use,
 * then reads each file back from disk and checks it. Uses the Playwright Chromium already required
 * for the browser tests, so there is no extra native image dependency.
 * Run: npm run icons (ICONS_CHROMIUM=<path> renders with another Chromium).
 *
 * Every icon is cut from the artwork around its centre, as the owner composed it, so all of them
 * show the same picture:
 * - icon-192.png, icon-512.png, apple-touch-icon-180.png and favicon-32.png: cut so the dumbbell's
 *   width spans 82% of the icon. The 192 is also the logo in the app's header and the
 *   notifications' icon; iOS rounds the apple-touch icon's corners itself.
 * - icon-maskable-512.png: Android's launcher icon, the dumbbell's width at 61.4% (below): the whole
 *   artwork, with its own edge mirrored past each side, at the very edge of what the owner's
 *   launcher shows.
 *
 * The dumbbell is measured on the artwork: its bright metal and bright green, in dense clusters,
 * which the textured surface's lone bright specks never form. A file that does not decode, does not
 * show the artwork, is not dark and opaque to its edge, or has the dumbbell out of place stops the
 * run.
 */
// The functions given to page.evaluate run in the page, where these are defined.
/* global document, Image */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = path.join('assets', 'app-icon.png');
const ICON_DIR = path.join('public', 'icons');

/**
 * span is the dumbbell's width as a share of the icon's. reach is where the dumbbell's farthest
 * point from the icon's centre must fall, measured on the written file, as a share of the maskable
 * standard's safe circle (radius 40% of the width), which every launcher that follows it leaves
 * whole; null where the icon is too small to measure.
 */
const TARGETS = [
  { file: 'icon-192.png', size: 192, span: 0.82, reach: [1.1, 1.22] },
  { file: 'icon-512.png', size: 512, span: 0.82, reach: [1.1, 1.22] },
  // The owner's phone shows the centre 85% of the icon (measured from the owner's screenshot,
  // 2026-10-24). At 61.4% the dumbbell spans 72% of that tile and 57% of its height, close to the
  // angled dumbbell of the app beside it (81% by 60%), clear of the tile's edge. Its ends reach
  // 0.87 of the safe circle: whole on any launcher that follows the standard.
  { file: 'icon-maskable-512.png', size: 512, span: 0.614, reach: [0.84, 0.92] },
  { file: 'apple-touch-icon-180.png', size: 180, span: 0.82, reach: [1.1, 1.22] },
  { file: 'favicon-32.png', size: 32, span: 0.82, reach: null },
];

const dataUrlOf = (bytes) => `data:image/png;base64,${bytes.toString('base64')}`;

mkdirSync(ICON_DIR, { recursive: true });
const source = dataUrlOf(readFileSync(SOURCE));
const executablePath = process.env.ICONS_CHROMIUM || undefined;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');

  // The dumbbell's width in the artwork: bright metal (luminance over 180) and bright green, where
  // at least a quarter of the 21 x 21 pixels around are bright too.
  const artwork = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, w, h).data;
    const n = w * h;
    const bright = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const [r, g, b] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      bright[i] = luminance > 180 || (g > 200 && g > r + 60 && g > b + 100) ? 1 : 0;
    }
    const radius = 10;
    const across = new Float32Array(n);
    const density = new Float32Array(n);
    const clamp = (v, max) => Math.min(max, Math.max(0, v));
    for (let y = 0; y < h; y += 1) {
      let sum = 0;
      for (let x = -radius; x <= radius; x += 1) sum += bright[y * w + clamp(x, w - 1)];
      for (let x = 0; x < w; x += 1) {
        across[y * w + x] = sum;
        sum +=
          bright[y * w + clamp(x + radius + 1, w - 1)] - bright[y * w + clamp(x - radius, w - 1)];
      }
    }
    const area = (2 * radius + 1) ** 2;
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let y = -radius; y <= radius; y += 1) sum += across[clamp(y, h - 1) * w + x];
      for (let y = 0; y < h; y += 1) {
        density[y * w + x] = sum / area;
        sum +=
          across[clamp(y + radius + 1, h - 1) * w + x] - across[clamp(y - radius, h - 1) * w + x];
      }
    }
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (bright[i] && density[i] >= 0.25) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    return { size: w, height: h, width: maxX - minX + 1, box: { minX, maxX, minY, maxY } };
  }, source);
  // A square artwork with a dumbbell found, clear of its edges; otherwise the measure found nothing
  // or picked up the background.
  const margin = artwork.size * 0.05;
  if (
    artwork.height !== artwork.size ||
    !(artwork.width > 0) ||
    artwork.box.minX < margin ||
    artwork.box.minY < margin ||
    artwork.box.maxX > artwork.size - margin ||
    artwork.box.maxY > artwork.size - margin
  ) {
    throw new Error(
      `generate-icons: ${SOURCE} must be square with the dumbbell clear of its edges; found ${JSON.stringify(artwork)}`,
    );
  }

  for (const target of TARGETS) {
    // The square cut around the artwork's centre, in the artwork's pixels; past its edge, the
    // artwork's own edge mirrored.
    const side = artwork.width / target.span;
    const png = await page.evaluate(
      async ({ src, side, size }) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const S = image.naturalWidth;
        const pad = Math.max(0, Math.ceil((side - S) / 2) + 2);
        const padded = document.createElement('canvas');
        padded.width = S + 2 * pad;
        padded.height = S + 2 * pad;
        const p = padded.getContext('2d');
        p.imageSmoothingEnabled = false;
        p.drawImage(image, pad, pad);
        if (pad > 0) {
          // Each side and corner: the artwork's outermost pixels, reflected across its edge.
          const mirror = (sx, sy, sw, sh, dx, dy, flipX, flipY) => {
            p.save();
            p.translate(dx + (flipX ? sw : 0), dy + (flipY ? sh : 0));
            p.scale(flipX ? -1 : 1, flipY ? -1 : 1);
            p.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
            p.restore();
          };
          mirror(0, 0, pad, S, 0, pad, true, false);
          mirror(S - pad, 0, pad, S, S + pad, pad, true, false);
          mirror(0, 0, S, pad, pad, 0, false, true);
          mirror(0, S - pad, S, pad, pad, S + pad, false, true);
          mirror(0, 0, pad, pad, 0, 0, true, true);
          mirror(S - pad, 0, pad, pad, S + pad, 0, true, true);
          mirror(0, S - pad, pad, pad, 0, S + pad, true, true);
          mirror(S - pad, S - pad, pad, pad, S + pad, S + pad, true, true);
        }
        const from = pad + S / 2 - side / 2;
        let canvas = document.createElement('canvas');
        canvas.width = Math.round(side);
        canvas.height = Math.round(side);
        canvas
          .getContext('2d')
          .drawImage(padded, from, from, side, side, 0, 0, canvas.width, canvas.height);
        // Halved step by step, then drawn at its size: a smooth downscale with no aliasing.
        while (canvas.width / 2 >= size) {
          const half = document.createElement('canvas');
          half.width = Math.round(canvas.width / 2);
          half.height = Math.round(canvas.height / 2);
          const context = half.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(canvas, 0, 0, half.width, half.height);
          canvas = half;
        }
        const out = document.createElement('canvas');
        out.width = size;
        out.height = size;
        const context = out.getContext('2d');
        context.imageSmoothingQuality = 'high';
        context.drawImage(canvas, 0, 0, size, size);
        return out.toDataURL('image/png').split(',')[1];
      },
      { src: source, side, size: target.size },
    );
    writeFileSync(path.join(ICON_DIR, target.file), Buffer.from(png, 'base64'));

    // Read back from disk: it decodes, it is its size, it shows the artwork (the part of the icon
    // the artwork covers against that part of the artwork itself, drawn straight from the source,
    // both down to 16 x 16, the channels a little off at most on average), it is dark and opaque to
    // every edge, and the dumbbell reaches as far as its target allows, no farther.
    const { problem, reach, difference } = await page.evaluate(
      async ({ src, written, side, size, band }) => {
        const load = async (url) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          return image;
        };
        const icon = await load(written);
        if (icon.naturalWidth !== size || icon.naturalHeight !== size) {
          return {
            problem: `is ${icon.naturalWidth}x${icon.naturalHeight}, not ${size}x${size}`,
            reach: null,
          };
        }
        // The cut in the artwork's pixels, the part of it the artwork covers, and where that part
        // lies in the icon.
        const art = await load(src);
        const S = art.naturalWidth;
        const cut = S / 2 - side / 2;
        const first = Math.max(0, cut);
        const last = Math.min(S, cut + side);
        const inIcon = (x) => ((x - cut) * size) / side;
        const thumb = (image, from, span) => {
          const canvas = document.createElement('canvas');
          canvas.width = 16;
          canvas.height = 16;
          const context = canvas.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(image, from, from, span, span, 0, 0, 16, 16);
          return context.getImageData(0, 0, 16, 16).data;
        };
        const expected = thumb(art, first, last - first);
        const actual = thumb(icon, inIcon(first), inIcon(last) - inIcon(first));
        let total = 0;
        for (let index = 0; index < expected.length; index += 4) {
          for (let channel = 0; channel < 3; channel += 1) {
            total += Math.abs(expected[index + channel] - actual[index + channel]);
          }
        }
        const difference = total / ((expected.length / 4) * 3);
        if (difference > 12) {
          return {
            problem: `does not show the artwork (mean difference ${difference.toFixed(1)})`,
            reach: null,
          };
        }
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        context.drawImage(icon, 0, 0);
        const data = context.getImageData(0, 0, size, size).data;
        const at = (x, y) => (y * size + x) * 4;
        const luminance = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        // Full bleed: every edge pixel opaque and dark, luminance 100 at most. The surface's own
        // edge reaches 72; the plates' glow, mirrored into the margin of a cut too close, passes 100.
        for (let along = 0; along < size; along += 1) {
          for (const [x, y] of [
            [along, 0],
            [along, size - 1],
            [0, along],
            [size - 1, along],
          ]) {
            const i = at(x, y);
            if (data[i + 3] !== 255 || luminance(i) > 100) {
              return { problem: `is not dark and opaque to its edge at ${x},${y}`, reach: null };
            }
          }
        }
        if (band === null) return { problem: null, reach: null, difference };
        // The dumbbell is its bright metal and bright green where most of the 3 x 3 pixels around
        // are bright too; its farthest pixel from the centre, as a share of the safe circle's radius.
        const bright = (x, y) => {
          const i = at(x, y);
          const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
          return luminance(i) > 180 || (g > 200 && g > r + 60 && g > b + 100);
        };
        const centre = (size - 1) / 2;
        let farthest = 0;
        for (let y = 1; y < size - 1; y += 1) {
          for (let x = 1; x < size - 1; x += 1) {
            if (!bright(x, y)) continue;
            let around = 0;
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) if (bright(x + dx, y + dy)) around += 1;
            }
            if (around >= 5) farthest = Math.max(farthest, Math.hypot(x - centre, y - centre));
          }
        }
        const reach = farthest / (0.4 * size);
        if (reach < band[0] || reach > band[1]) {
          return {
            problem: `has the dumbbell reaching ${reach.toFixed(3)} of the safe circle, outside ${band[0]} to ${band[1]}`,
            reach,
          };
        }
        return { problem: null, reach, difference };
      },
      {
        src: source,
        written: dataUrlOf(readFileSync(path.join(ICON_DIR, target.file))),
        side,
        size: target.size,
        band: target.reach,
      },
    );
    if (problem !== null) throw new Error(`generate-icons: ${target.file} ${problem}`);
    console.log(
      `generate-icons: wrote ${target.file} (${target.size}px), cut with the dumbbell's width at ${(target.span * 100).toFixed(1)}%; checked: the artwork within ${difference.toFixed(1)} on average, dark to its edge${reach === null ? '' : `, the dumbbell reaching ${reach.toFixed(3)} of the safe circle`}`,
    );
  }
} finally {
  await browser.close();
}
