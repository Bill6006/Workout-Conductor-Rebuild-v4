#!/usr/bin/env node
/**
 * Captures real screenshots of the built app for a phase and assembles a
 * combined preview sheet. Usage: node scripts/screenshots.mjs --phase 1
 *
 * Runs the @screenshots browser tests with SCREENSHOT_DIR pointing at
 * docs/screenshots/phase-<n>/ and then renders every captured PNG into
 * preview-sheet.png, grouped by device project.
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const phaseIndex = args.indexOf('--phase');
const phase = phaseIndex >= 0 ? args[phaseIndex + 1] : '0';
const labelIndex = args.indexOf('--label');
const label = labelIndex >= 0 ? args[labelIndex + 1] : `phase-${phase}`;
const outDir = path.join('docs', 'screenshots', label);
mkdirSync(outDir, { recursive: true });

const result = spawnSync('npx', ['playwright', 'test', '--grep', '@screenshots'], {
  stdio: 'inherit',
  env: { ...process.env, SCREENSHOT_DIR: outDir },
  shell: process.platform === 'win32',
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const GROUPS = [
  { prefix: 'android-412-', title: 'Android 412 px (Pixel 7)', width: 200, limit: 26 },
  { prefix: 'android-360-', title: 'Android 360 px', width: 180, limit: 6 },
  { prefix: 'desktop-', title: 'Desktop 1280 px', width: 480, limit: 3 },
];

const files = readdirSync(outDir)
  .filter((file) => file.endsWith('.png') && file !== 'preview-sheet.png')
  .sort();

function figure(file, width) {
  const data = readFileSync(path.join(outDir, file)).toString('base64');
  return `<figure><img src="data:image/png;base64,${data}" style="width:${width}px" alt=""><figcaption>${file}</figcaption></figure>`;
}

const sections = GROUPS.map((group) => {
  const matching = files
    .filter((file) => file.startsWith(group.prefix) && !file.includes('-full'))
    .slice(0, group.limit);
  if (matching.length === 0) return '';
  return `<h2>${group.title}</h2><div class="row">${matching
    .map((file) => figure(file, group.width))
    .join('')}</div>`;
}).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;padding:28px;background:#0e1012;color:#f4f6f7;font-family:system-ui,Segoe UI,Roboto,sans-serif}
  h1{font-size:22px;margin:0 0 4px} p{margin:0 0 20px;color:#9aa3ad;font-size:14px}
  h2{font-size:14px;color:#c6f542;text-transform:uppercase;letter-spacing:.08em;margin:22px 0 10px}
  .row{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
  figure{margin:0} img{display:block;border-radius:18px;border:1px solid rgba(255,255,255,.12)}
  figcaption{font-size:11px;color:#6a7380;margin-top:6px;font-family:ui-monospace,monospace}
</style></head><body>
  <h1>Workout Conductor · ${label} preview sheet</h1>
  <p>Real screenshots captured from the production build by Playwright on ${new Date().toISOString().slice(0, 10)}.</p>
  ${sections}
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.screenshot({ path: path.join(outDir, 'preview-sheet.png'), fullPage: true });
  console.log(
    `screenshots: wrote ${path.join(outDir, 'preview-sheet.png')} (${files.length} captures)`,
  );
} finally {
  await browser.close();
}
