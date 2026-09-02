#!/usr/bin/env node
/**
 * Renders the original SVG icon into the PNG sizes the PWA manifest needs.
 * Uses the Playwright Chromium already required for smoke tests, so there is
 * no extra native image dependency. Run: npm run icons
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ICON_DIR = path.join('public', 'icons');
const svg = readFileSync(path.join(ICON_DIR, 'icon.svg'), 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/** radius is a fraction of the icon size; 0 keeps the full-bleed square for maskable use. */
const TARGETS = [
  { file: 'icon-192.png', size: 192, radius: 0.22 },
  { file: 'icon-512.png', size: 512, radius: 0.22 },
  { file: 'icon-maskable-512.png', size: 512, radius: 0 },
  { file: 'apple-touch-icon-180.png', size: 180, radius: 0 },
];

mkdirSync(ICON_DIR, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const target of TARGETS) {
    await page.setViewportSize({ width: target.size, height: target.size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">` +
        `<img id="icon" src="${dataUrl}" alt="" style="display:block;width:${target.size}px;height:${target.size}px;border-radius:${target.radius * 100}%">` +
        `</body></html>`,
    );
    await page.locator('#icon').screenshot({
      path: path.join(ICON_DIR, target.file),
      omitBackground: true,
    });
    console.log(`generate-icons: wrote ${target.file} (${target.size}px)`);
  }
} finally {
  await browser.close();
}
