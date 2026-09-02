#!/usr/bin/env node
/**
 * Captures real screenshots of the built app for a phase and assembles a
 * combined preview sheet. Usage: node scripts/screenshots.mjs --phase 0
 *
 * Output: docs/screenshots/phase-<n>/<project>-<screen>.png plus preview-sheet.png
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const phaseIndex = args.indexOf('--phase');
const phase = phaseIndex >= 0 ? args[phaseIndex + 1] : '0';
const label = `phase-${phase}`;
const outDir = path.join('docs', 'screenshots', label);
mkdirSync(outDir, { recursive: true });

const SCREENS = ['today', 'workout', 'progress', 'plan', 'settings'];

const result = spawnSync('npx', ['playwright', 'test', '--grep', '@screenshots'], {
  stdio: 'inherit',
  env: { ...process.env, SCREENSHOT_DIR: outDir },
  shell: process.platform === 'win32',
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

function imageTag(file, width) {
  const full = path.join(outDir, file);
  if (!existsSync(full)) return '';
  const data = readFileSync(full).toString('base64');
  return `<figure><img src="data:image/png;base64,${data}" style="width:${width}px" alt=""><figcaption>${file}</figcaption></figure>`;
}

const mobile = SCREENS.map((screen) => imageTag(`android-412-${screen}.png`, 220)).join('');
const narrow = SCREENS.slice(0, 2)
  .map((screen) => imageTag(`android-360-${screen}.png`, 190))
  .join('');
const desktop = imageTag('desktop-today.png', 640);

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
  <h2>Android 412 px (Pixel 7)</h2><div class="row">${mobile}</div>
  <h2>Android 360 px</h2><div class="row">${narrow}</div>
  <h2>Desktop 1280 px</h2><div class="row">${desktop}</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.screenshot({ path: path.join(outDir, 'preview-sheet.png'), fullPage: true });
  console.log(`screenshots: wrote ${path.join(outDir, 'preview-sheet.png')}`);
} finally {
  await browser.close();
}
