#!/usr/bin/env node
/**
 * Renders the approved app icon, assets/app-icon.png (the owner's artwork, its pixels exactly as
 * provided on 2026-10-25: an angled dumbbell, brushed metal with neon-green rings, on a smooth dark
 * studio backdrop, 1254 x 1254), into every file the page, the PWA manifest and the app use, then
 * reads each file back from disk and checks it. Uses the Playwright Chromium already required for
 * the browser tests, so there is no extra native image dependency.
 * Run: npm run icons (ICONS_CHROMIUM=<path> renders with another Chromium).
 *
 * Every icon is cut around the dumbbell, so all of them show the same picture:
 * - icon-192.png, icon-512.png, apple-touch-icon-180.png and favicon-32.png: the dumbbell's width at
 *   82% of the icon. The 192 is also the logo in the app's header and the notifications' icon; iOS
 *   rounds the apple-touch icon's corners itself.
 * - icon-maskable-512.png: Android's launcher icon, the dumbbell's width at 69% (below).
 *
 * The dumbbell spans 90% of the artwork's width, so every cut reaches past the artwork's edge.
 * Inside its frame the artwork is as provided. Past it, the backdrop, a smooth gradient, goes on: a
 * cubic in x and y for each channel, fitted to the backdrop alone and held at its value at the
 * nearest point of the frame, plus the artwork's own departure from that fit there (the dark beside
 * an end cap, say), leaving the frame on the artwork's own slope and fading over 60 px. At the frame
 * it is the artwork's own shade and slope, so the frame leaves no line; farther out it settles to
 * the fit, so nothing at the frame runs on as a band.
 *
 * The dumbbell is measured on the artwork: its bright metal and bright green, in dense clusters. A
 * file that does not decode, does not show the artwork, is not dark and opaque to its edge, shows
 * the artwork's frame as a step, a groove or a ridge, does not settle to the fit far past it, or has
 * the dumbbell out of place stops the run.
 */
// The functions given to page.evaluate run in the page, where these are defined.
/* global document, Image, ImageData, window */
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
  { file: 'icon-192.png', size: 192, span: 0.82, reach: [1.02, 1.11] },
  { file: 'icon-512.png', size: 512, span: 0.82, reach: [1.02, 1.11] },
  // The owner's phone shows the centre 85% of the icon (measured from the owner's screenshots,
  // 2026-10-24 and 25). At 69% the dumbbell spans 81% of that tile's width, as far toward its edges
  // as the widest glyph beside it (81%), which the owner asked for. Its ends reach 0.90 of the safe
  // circle: whole on any launcher that follows the standard.
  { file: 'icon-maskable-512.png', size: 512, span: 0.69, reach: [0.86, 0.94] },
  { file: 'apple-touch-icon-180.png', size: 180, span: 0.82, reach: [1.02, 1.11] },
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

  // The dumbbell's box in the artwork: bright metal (luminance over 180) and bright green, where at
  // least a quarter of the 21 x 21 pixels around are bright too.
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
  // or picked up the backdrop.
  const margin = artwork.size * 0.03;
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
  // Each cut is centred on the dumbbell, not on the artwork's frame (the dumbbell sits above it).
  const centreX = (artwork.box.minX + artwork.box.maxX) / 2;
  const centreY = (artwork.box.minY + artwork.box.maxY) / 2;

  // The backdrop, once, kept in the page for the cuts.
  // - The fit: the mean of each 32-px block that is even (its middle half within 3 levels) and dark
  //   (nothing over 120), a cubic in x and y fitted to them, refitted without the blocks it misses by
  //   more than 8, then 4, then 3 (the dumbbell's shadow, its glow); then each channel's own cubic.
  // - Along each side of the frame, for each channel, averaged over 33 px along the side: the
  //   departure, the artwork's own shade less the fit's over its outer 8 px; and the trend, how the
  //   artwork's shade changes toward the frame, from its 8 px 24 to 32 px in to its outer 8 px.
  const backdrop = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const S = image.naturalWidth;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const A = context.getImageData(0, 0, S, S).data;
    const luminanceAt = (i) => 0.2126 * A[i * 4] + 0.7152 * A[i * 4 + 1] + 0.0722 * A[i * 4 + 2];
    const half = (S - 1) / 2;
    const terms = [];
    for (let i = 0; i <= 3; i += 1) for (let j = 0; j <= 3 - i; j += 1) terms.push([i, j]);
    const cubic = (coef, u, v) => {
      let sum = 0;
      for (let k = 0; k < terms.length; k += 1)
        sum += coef[k] * u ** terms[k][0] * v ** terms[k][1];
      return sum;
    };
    // Least squares by the normal equations, Gaussian elimination with partial pivoting.
    const fit = (rows, value) => {
      const m = terms.length;
      const M = Array.from({ length: m }, () => new Float64Array(m));
      const b = new Float64Array(m);
      for (const row of rows) {
        const f = terms.map(([i, j]) => row.u ** i * row.v ** j);
        const y = value(row);
        for (let p = 0; p < m; p += 1) {
          b[p] += f[p] * y;
          for (let q = 0; q < m; q += 1) M[p][q] += f[p] * f[q];
        }
      }
      for (let col = 0; col < m; col += 1) {
        let pivot = col;
        for (let r = col + 1; r < m; r += 1) {
          if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
        }
        [M[col], M[pivot]] = [M[pivot], M[col]];
        [b[col], b[pivot]] = [b[pivot], b[col]];
        for (let r = 0; r < m; r += 1) {
          if (r === col) continue;
          const factor = M[r][col] / M[col][col];
          for (let c = col; c < m; c += 1) M[r][c] -= factor * M[col][c];
          b[r] -= factor * b[col];
        }
      }
      return Array.from(b, (v, i) => v / M[i][i]);
    };
    const B = 32;
    const blocks = [];
    for (let by = 0; by + B <= S; by += B) {
      for (let bx = 0; bx + B <= S; bx += B) {
        const values = [];
        const sums = [0, 0, 0];
        for (let y = by; y < by + B; y += 1) {
          for (let x = bx; x < bx + B; x += 1) {
            const i = y * S + x;
            values.push(luminanceAt(i));
            for (let ch = 0; ch < 3; ch += 1) sums[ch] += A[i * 4 + ch];
          }
        }
        values.sort((p, q) => p - q);
        const count = values.length;
        const channels = sums.map((s) => s / count);
        blocks.push({
          u: (bx + B / 2 - 0.5 - half) / half,
          v: (by + B / 2 - 0.5 - half) / half,
          even: values[(3 * count) >> 2] - values[count >> 2] <= 3 && values[count - 1] <= 120,
          channels,
          luminance: 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2],
        });
      }
    }
    const even = blocks.filter((block) => block.even).length;
    let kept = blocks.filter((block) => block.even);
    for (const limit of [8, 4, 3]) {
      const coef = fit(kept, (block) => block.luminance);
      kept = kept.filter(
        (block) => Math.abs(block.luminance - cubic(coef, block.u, block.v)) <= limit,
      );
    }
    const lumCoef = fit(kept, (block) => block.luminance);
    const misses = kept.map((block) => block.luminance - cubic(lumCoef, block.u, block.v));
    const rms = Math.sqrt(
      misses.reduce((s, miss) => s + miss * miss, 0) / Math.max(1, misses.length),
    );
    const coef = [0, 1, 2].map((ch) => fit(kept, (block) => block.channels[ch]));

    const alongSide = (values) => {
      const smoothed = new Float64Array(S);
      for (let along = 0; along < S; along += 1) {
        let sum = 0;
        for (let o = -16; o <= 16; o += 1) sum += values[Math.min(S - 1, Math.max(0, along + o))];
        smoothed[along] = sum / 33;
      }
      return smoothed;
    };
    const departures = {};
    const trends = {};
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const at = (along, inward) =>
        ({
          top: [along, inward],
          bottom: [along, S - 1 - inward],
          left: [inward, along],
          right: [S - 1 - inward, along],
        })[side];
      departures[side] = [];
      trends[side] = [];
      for (let ch = 0; ch < 3; ch += 1) {
        const departure = new Float64Array(S);
        const trend = new Float64Array(S);
        for (let along = 0; along < S; along += 1) {
          let outer = 0;
          let fitted = 0;
          let inner = 0;
          for (let inward = 0; inward < 8; inward += 1) {
            const [x, y] = at(along, inward);
            outer += A[(y * S + x) * 4 + ch];
            fitted += cubic(coef[ch], (x - half) / half, (y - half) / half);
            const [ix, iy] = at(along, inward + 24);
            inner += A[(iy * S + ix) * 4 + ch];
          }
          departure[along] = (outer - fitted) / 8;
          // Per pixel outward: the outer band's centre lies 24 px beyond the inner band's.
          trend[along] = (outer - inner) / 8 / 24;
        }
        departures[side].push(alongSide(departure));
        trends[side].push(alongSide(trend));
      }
    }
    // The artwork's own shades along its frame (its outer 8 px, in 32-px stretches, each averaged
    // over its grain): what the backdrop carries past the edge stays among them.
    let darkest = Infinity;
    let lightest = -Infinity;
    for (let along = 0; along + B <= S; along += B) {
      for (const [x0, y0, w, h] of [
        [along, 0, B, 8],
        [along, S - 8, B, 8],
        [0, along, 8, B],
        [S - 8, along, 8, B],
      ]) {
        let sum = 0;
        for (let y = y0; y < y0 + h; y += 1) {
          for (let x = x0; x < x0 + w; x += 1) sum += luminanceAt(y * S + x);
        }
        const shade = sum / (w * h);
        darkest = Math.min(darkest, shade);
        lightest = Math.max(lightest, shade);
      }
    }
    window.icon = { S, A, coef, terms, departures, trends };
    return { blocks: kept.length, even, rms, shades: [darkest, lightest] };
  }, source);
  // A smooth gradient: the fit holds most of the even blocks (all but the dumbbell's shadow and the
  // like) and misses them by little. A fit that cannot follow the backdrop drops much of it instead.
  if (!(backdrop.blocks >= 100 && backdrop.blocks >= 0.75 * backdrop.even && backdrop.rms <= 2.5)) {
    throw new Error(
      `generate-icons: ${SOURCE}'s backdrop is not a smooth gradient (the fit holds ${backdrop.blocks} of ${backdrop.even} even blocks, off by ${backdrop.rms.toFixed(2)} on average), so it cannot be carried past the artwork's edge`,
    );
  }
  console.log(
    `generate-icons: the backdrop fitted to ${backdrop.blocks} of ${backdrop.even} even blocks, off by ${backdrop.rms.toFixed(2)} on average; its shades along the frame ${backdrop.shades[0].toFixed(1)} to ${backdrop.shades[1].toFixed(1)}`,
  );

  for (const target of TARGETS) {
    // The square cut around the dumbbell, in the artwork's pixels.
    const side = artwork.width / target.span;
    const cutX = centreX - side / 2;
    const cutY = centreY - side / 2;
    const png = await page.evaluate(
      ({ side, size, cutX, cutY }) => {
        const { S, A, coef, terms, departures, trends } = window.icon;
        const half = (S - 1) / 2;
        const backdropAt = (ch, x, y) => {
          const u = (x - half) / half;
          const v = (y - half) / half;
          let sum = 0;
          for (let k = 0; k < terms.length; k += 1) {
            sum += coef[ch][k] * u ** terms[k][0] * v ** terms[k][1];
          }
          return sum;
        };
        // Past the artwork's edge: the fit at the nearest point of the frame, plus the artwork's own
        // departure D from it there (past a corner, the two sides' weighted by how far the point lies
        // past each, so a corner meets both sides without a seam), fading over 60 px, and a
        // bend that leaves the frame on the artwork's own trend T there:
        // D e^(-d / 60) + (T + D / 60) d e^(-d / 50) starts at D with slope T, and settles to 0. A
        // shorter bend creases the frame; a longer one lingers far past it.
        const fade = 60;
        const bend = 50;
        const beyond = (ch, x, y) => {
          const ex = Math.min(S - 1, Math.max(0, x));
          const ey = Math.min(S - 1, Math.max(0, y));
          const sides = [];
          if (y < 0) sides.push(['top', Math.round(ex), -y]);
          if (y > S - 1) sides.push(['bottom', Math.round(ex), y - (S - 1)]);
          if (x < 0) sides.push(['left', Math.round(ey), -x]);
          if (x > S - 1) sides.push(['right', Math.round(ey), x - (S - 1)]);
          const weight = sides.reduce((sum, [, , past]) => sum + past, 0);
          const mean = (table) =>
            sides.reduce((sum, [side, along, past]) => sum + table[side][ch][along] * past, 0) /
            weight;
          const departure = mean(departures);
          const trend = mean(trends);
          const d = Math.hypot(x - ex, y - ey);
          const carried = departure * Math.exp(-d / fade);
          const bent = (trend + departure / fade) * d * Math.exp(-d / bend);
          return backdropAt(ch, ex, ey) + carried + bent;
        };
        const cells = Math.round(side);
        const step = side / cells;
        const image = new ImageData(cells, cells);
        const out = image.data;
        for (let j = 0; j < cells; j += 1) {
          const y = cutY + (j + 0.5) * step - 0.5;
          for (let i = 0; i < cells; i += 1) {
            const x = cutX + (i + 0.5) * step - 0.5;
            const k = (j * cells + i) * 4;
            if (x >= 0 && y >= 0 && x <= S - 1 && y <= S - 1) {
              const p = Math.round(y) * S + Math.round(x);
              for (let ch = 0; ch < 3; ch += 1) out[k + ch] = A[p * 4 + ch];
            } else {
              for (let ch = 0; ch < 3; ch += 1) out[k + ch] = beyond(ch, x, y);
            }
            out[k + 3] = 255;
          }
        }
        let canvas = document.createElement('canvas');
        canvas.width = cells;
        canvas.height = cells;
        canvas.getContext('2d').putImageData(image, 0, 0);
        // Halved step by step, then drawn at its size: a smooth downscale with no aliasing.
        while (canvas.width / 2 >= size) {
          const halfCanvas = document.createElement('canvas');
          halfCanvas.width = Math.round(canvas.width / 2);
          halfCanvas.height = Math.round(canvas.height / 2);
          const context = halfCanvas.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(canvas, 0, 0, halfCanvas.width, halfCanvas.height);
          canvas = halfCanvas;
        }
        const final = document.createElement('canvas');
        final.width = size;
        final.height = size;
        const context = final.getContext('2d');
        context.imageSmoothingQuality = 'high';
        context.drawImage(canvas, 0, 0, size, size);
        return final.toDataURL('image/png').split(',')[1];
      },
      { side, size: target.size, cutX, cutY },
    );
    writeFileSync(path.join(ICON_DIR, target.file), Buffer.from(png, 'base64'));

    // Read back from disk: it decodes, it is its size, it shows the artwork (the part of the icon
    // the artwork covers against that part of the artwork itself, drawn straight from the source,
    // both down to 16 x 16, the channels a little off at most on average), it is dark and opaque to
    // every edge and among the artwork's own shades, it settles to the fit far past the frame, the
    // frame leaves no step, groove or ridge (at 512 px), and the dumbbell reaches as far as its
    // target allows, no farther.
    const { problem, reach, difference, frameStep, settle } = await page.evaluate(
      async ({ src, written, side, cutX, cutY, size, band, shades }) => {
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
        // The part of the cut the artwork covers, in the artwork's pixels and in the icon's.
        const art = await load(src);
        const S = art.naturalWidth;
        const left = Math.max(0, cutX);
        const top = Math.max(0, cutY);
        const right = Math.min(S, cutX + side);
        const bottom = Math.min(S, cutY + side);
        const scale = size / side;
        const thumb = (image, sx, sy, sw, sh) => {
          const canvas = document.createElement('canvas');
          canvas.width = 16;
          canvas.height = 16;
          const context = canvas.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(image, sx, sy, sw, sh, 0, 0, 16, 16);
          return context.getImageData(0, 0, 16, 16).data;
        };
        const expected = thumb(art, left, top, right - left, bottom - top);
        const actual = thumb(
          icon,
          (left - cutX) * scale,
          (top - cutY) * scale,
          (right - left) * scale,
          (bottom - top) * scale,
        );
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
        // Full bleed: every edge pixel opaque and dark, luminance 100 at most, and among the shades
        // the artwork's own backdrop has along its frame, give or take 3: the fit extrapolated past
        // the frame, rather than held at it, grows lighter than any of them.
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
            if (luminance(i) < shades[0] - 3 || luminance(i) > shades[1] + 3) {
              return {
                problem: `carries the backdrop past the artwork's edge outside its own shades (${luminance(i).toFixed(1)} at ${x},${y}, the frame's ${shades[0].toFixed(1)} to ${shades[1].toFixed(1)})`,
                reach: null,
              };
            }
          }
        }
        // Far past the frame (three fades, 180 px of the artwork, and more), the backdrop is the fit
        // itself: what the artwork shows at its frame fades out instead of running on as a band.
        const { coef, terms } = window.icon;
        const half = (S - 1) / 2;
        const fitShade = (x, y) => {
          const u = (x - half) / half;
          const v = (y - half) / half;
          let shade = 0;
          for (const [ch, weight] of [
            [0, 0.2126],
            [1, 0.7152],
            [2, 0.0722],
          ]) {
            let sum = 0;
            for (let k = 0; k < terms.length; k += 1) {
              sum += coef[ch][k] * u ** terms[k][0] * v ** terms[k][1];
            }
            shade += weight * sum;
          }
          return shade;
        };
        let settled = 0;
        let settledWithin = 0;
        for (let along = 0; along < size; along += 1) {
          for (const [ix, iy] of [
            [along, 0],
            [along, size - 1],
            [0, along],
            [size - 1, along],
          ]) {
            const x = cutX + ((ix + 0.5) * side) / size - 0.5;
            const y = cutY + ((iy + 0.5) * side) / size - 0.5;
            const ex = Math.min(S - 1, Math.max(0, x));
            const ey = Math.min(S - 1, Math.max(0, y));
            if (Math.hypot(x - ex, y - ey) < 180) continue;
            settled += 1;
            const shade = luminance(at(ix, iy));
            settledWithin = Math.max(settledWithin, Math.abs(shade - fitShade(ex, ey)));
            if (Math.abs(shade - fitShade(ex, ey)) > 3) {
              return {
                problem: `does not settle to the fitted backdrop far past the artwork's edge (${shade.toFixed(1)} against ${fitShade(ex, ey).toFixed(1)} at ${ix},${iy})`,
                reach: null,
              };
            }
          }
        }
        // The artwork's frame, where it falls inside the icon: along it, in 16-px stretches, the 3 px
        // just inside against the 3 px just outside, never more than 3 levels apart (a step; the
        // backdrop's own slope across 3 px is a fraction of that); and the 3 px on the line against
        // the mean of the 3 px 8 px either side, never more than 1.5 apart (a groove or a ridge: the
        // backdrop's own bend reads under 1 at that distance, a crease at the line over 2).
        // Measured at 512 px; the smaller icons are drawn down from the same cut. And where a frame
        // line runs on past the artwork, into the margin round a corner, the 3 px either side of it,
        // both backdrop, never more than 1.6 apart: the backdrop's own slope across it reads about
        // 1, two sides' backdrops meeting unweighted over 2 (a seam).
        let frameStep = null;
        if (size >= 512) {
          const mean = (x0, x1, y0, y1) => {
            let sum = 0;
            let count = 0;
            for (let y = Math.max(0, Math.round(y0)); y < Math.min(size, Math.round(y1)); y += 1) {
              for (
                let x = Math.max(0, Math.round(x0));
                x < Math.min(size, Math.round(x1));
                x += 1
              ) {
                sum += luminance(at(x, y));
                count += 1;
              }
            }
            return count > 0 ? sum / count : null;
          };
          const edges = {
            left: (0 - cutX) * scale,
            right: (S - cutX) * scale,
            top: (0 - cutY) * scale,
            bottom: (S - cutY) * scale,
          };
          const stretch = 16;
          frameStep = {
            step: 0,
            where: 'none',
            groove: 0,
            grooveWhere: 'none',
            seam: 0,
            seamWhere: 'none',
          };
          for (const [name, line] of Object.entries(edges)) {
            if (line <= 14 || line >= size - 14) continue;
            const vertical = name === 'left' || name === 'right';
            const from = Math.max(0, vertical ? edges.top : edges.left) + 4;
            const to = Math.min(size, vertical ? edges.bottom : edges.right) - 4;
            for (let s = from; s + stretch <= to; s += stretch) {
              const across = (a, b) =>
                vertical
                  ? mean(line + a, line + b, s, s + stretch)
                  : mean(s, s + stretch, line + a, line + b);
              const before = across(-3, 0);
              const after = across(0, 3);
              if (before === null || after === null) continue;
              const step = Math.abs(before - after);
              if (step > frameStep.step)
                frameStep = { ...frameStep, step, where: `${name} ${Math.round(s)}` };
              const band3 = (offset) => across(offset - 1.5, offset + 1.5);
              const onLine = band3(0);
              const inside = band3(-8);
              const outside = band3(8);
              if (onLine === null || inside === null || outside === null) continue;
              const groove = Math.abs(onLine - (inside + outside) / 2);
              if (groove > frameStep.groove) {
                frameStep = { ...frameStep, groove, grooveWhere: `${name} ${Math.round(s)}` };
              }
            }
          }
          // Each line's run past the artwork, inside the icon.
          for (const [name, line] of Object.entries(edges)) {
            if (line <= 14 || line >= size - 14) continue;
            const vertical = name === 'left' || name === 'right';
            const [near, far] = vertical ? [edges.top, edges.bottom] : [edges.left, edges.right];
            for (const [from, to] of [
              [0, near - 4],
              [far + 4, size],
            ]) {
              for (let s = Math.max(0, from); s + stretch <= Math.min(size, to); s += stretch) {
                const across = (a, b) =>
                  vertical
                    ? mean(line + a, line + b, s, s + stretch)
                    : mean(s, s + stretch, line + a, line + b);
                const seam = Math.abs(across(-3, 0) - across(0, 3));
                if (seam > frameStep.seam) {
                  frameStep = { ...frameStep, seam, seamWhere: `${name} ${Math.round(s)}` };
                }
              }
            }
          }
          if (frameStep.step > 3) {
            return {
              problem: `shows the artwork's frame as a step of ${frameStep.step.toFixed(1)} (${frameStep.where})`,
              reach: null,
            };
          }
          if (frameStep.seam > 1.6) {
            return {
              problem: `shows a seam where the backdrop past two sides meets, ${frameStep.seam.toFixed(1)} (${frameStep.seamWhere})`,
              reach: null,
            };
          }
          if (frameStep.groove > 1.5) {
            return {
              problem: `shows the artwork's frame as a groove or a ridge of ${frameStep.groove.toFixed(1)} (${frameStep.grooveWhere})`,
              reach: null,
            };
          }
        }
        const settle = { settled, settledWithin };
        if (band === null) return { problem: null, reach: null, difference, frameStep, settle };
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
        return { problem: null, reach, difference, frameStep, settle };
      },
      {
        src: source,
        written: dataUrlOf(readFileSync(path.join(ICON_DIR, target.file))),
        side,
        cutX,
        cutY,
        size: target.size,
        band: target.reach,
        shades: backdrop.shades,
      },
    );
    if (problem !== null) throw new Error(`generate-icons: ${target.file} ${problem}`);
    const checked = [
      `the artwork within ${difference.toFixed(1)} on average`,
      'dark to its edge',
      ...(frameStep === null
        ? []
        : [
            `its frame's largest step ${frameStep.step.toFixed(1)}, groove or ridge ${frameStep.groove.toFixed(1)}, seam past it ${frameStep.seam.toFixed(1)}`,
          ]),
      ...(settle.settled === 0
        ? []
        : [
            `settled to the fit at ${settle.settled} edge pixels far past it, within ${settle.settledWithin.toFixed(1)}`,
          ]),
      ...(reach === null ? [] : [`the dumbbell reaching ${reach.toFixed(3)} of the safe circle`]),
    ];
    console.log(
      `generate-icons: wrote ${target.file} (${target.size}px), cut with the dumbbell's width at ${(target.span * 100).toFixed(1)}%; checked: ${checked.join(', ')}`,
    );
  }
} finally {
  await browser.close();
}
