#!/usr/bin/env node
/**
 * Verify the production build in dist/ is a deployable Pages app shell:
 * correct subpath, PWA manifest and icons, service worker, visible build marker,
 * and phase constants that agree. Also reports bundle size. Run: npm run verify-build
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const REPO_NAME = 'Workout-Conductor-Rebuild-v4';
const base = process.env.VITE_BASE_PATH ?? `/${REPO_NAME}/`;

const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function read(relative) {
  return readFileSync(path.join(DIST, relative), 'utf8');
}

function distHas(relative) {
  return existsSync(path.join(DIST, relative));
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function readPhaseConstant(file, pattern) {
  const content = readFileSync(path.join(ROOT, file), 'utf8');
  const match = content.match(pattern);
  return match ? Number(match[1]) : null;
}

function expectedShortCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

check(existsSync(DIST), 'dist/ does not exist. Run `npm run build` first.');
if (!existsSync(DIST)) {
  report();
}

// index.html
check(distHas('index.html'), 'dist/index.html is missing');
const html = distHas('index.html') ? read('index.html') : '';
check(html.includes('id="root"'), 'index.html must contain the #root mount point');
check(
  html.includes(`${base}assets/`),
  `index.html must reference assets under the base path ${base}`,
);
check(/<link rel="manifest"/.test(html), 'index.html must link the web app manifest');
check(
  /viewport-fit=cover/.test(html),
  'viewport meta must include viewport-fit=cover for safe-area insets',
);
check(!/maximum-scale=1|user-scalable=no/.test(html), 'viewport must not disable browser zoom');
check(/<meta name="theme-color"/.test(html), 'index.html must declare a theme-color');

// Manifest
check(distHas('manifest.webmanifest'), 'dist/manifest.webmanifest is missing');
if (distHas('manifest.webmanifest')) {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  check(manifest.name === 'Workout Conductor', 'manifest name must be "Workout Conductor"');
  check(manifest.display === 'standalone', 'manifest display must be standalone');
  check(manifest.start_url === base, `manifest start_url must be ${base}`);
  check(manifest.scope === base, `manifest scope must be ${base}`);
  check(
    Array.isArray(manifest.icons) && manifest.icons.length >= 3,
    'manifest needs at least 3 icons',
  );
  check(
    manifest.icons.some((icon) => icon.purpose === 'maskable'),
    'manifest must include a maskable icon for Android',
  );
  for (const icon of manifest.icons ?? []) {
    const iconPath = icon.src.replace(/^\.?\//, '');
    check(distHas(iconPath), `manifest icon ${icon.src} is missing from dist`);
  }
}

// Service worker and static shell assets
check(distHas('sw.js'), 'dist/sw.js is missing (vite-plugin-pwa did not run)');
if (distHas('sw.js')) {
  check(read('sw.js').includes('precache'), 'sw.js must precache the app shell');
}
check(distHas('.nojekyll'), 'dist/.nojekyll is missing (copy from public/)');
check(distHas('favicon.svg'), 'dist/favicon.svg is missing');
check(distHas('icons/icon.svg'), 'dist/icons/icon.svg is missing (shell logo)');
check(distHas('icons/apple-touch-icon-180.png'), 'dist/icons/apple-touch-icon-180.png is missing');

// Build marker inside the JS bundle
const assetsDir = path.join(DIST, 'assets');
const jsFiles = existsSync(assetsDir) ? walk(assetsDir).filter((file) => file.endsWith('.js')) : [];
check(jsFiles.length > 0, 'no JS assets found in dist/assets');
const bundleText = jsFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
check(
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(bundleText),
  'build marker (builtAt ISO timestamp) not found in the JS bundle',
);
const shortCommit = expectedShortCommit();
if (shortCommit) {
  check(
    bundleText.includes(shortCommit),
    `build marker commit ${shortCommit} not found in the JS bundle`,
  );
  notes.push(`build marker commit: ${shortCommit}`);
} else {
  notes.push('build marker commit: not verifiable (no git commit yet)');
}

// Phase constants must agree
const configPhase = readPhaseConstant('vite.config.ts', /const CURRENT_PHASE = (\d+)/);
const appPhase = readPhaseConstant('src/app/phases.ts', /export const CURRENT_PHASE = (\d+)/);
check(
  configPhase !== null && appPhase !== null,
  'could not read CURRENT_PHASE from vite.config.ts and src/app/phases.ts',
);
check(
  configPhase === appPhase,
  `CURRENT_PHASE mismatch: vite.config.ts=${configPhase} src/app/phases.ts=${appPhase}`,
);
if (configPhase !== null) notes.push(`current phase: ${configPhase}`);

// Bundle size report (performance target tracking)
const allFiles = walk(DIST);
const totalBytes = allFiles.reduce((sum, file) => sum + statSync(file).size, 0);
const jsBytes = jsFiles.reduce((sum, file) => sum + statSync(file).size, 0);
const jsGzipBytes = jsFiles.reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0);
const cssFiles = existsSync(assetsDir)
  ? walk(assetsDir).filter((file) => file.endsWith('.css'))
  : [];
const cssBytes = cssFiles.reduce((sum, file) => sum + statSync(file).size, 0);
notes.push(`dist total: ${formatBytes(totalBytes)} across ${allFiles.length} files`);
notes.push(
  `JS: ${formatBytes(jsBytes)} raw, ${formatBytes(jsGzipBytes)} gzip (${jsFiles.length} files)`,
);
notes.push(`CSS: ${formatBytes(cssBytes)} (${cssFiles.length} files)`);

report();

function report() {
  for (const note of notes) console.log(`verify-build: ${note}`);
  if (failures.length > 0) {
    console.error(`verify-build: FAILED (${failures.length} problem(s))`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('verify-build: passed');
  process.exit(0);
}
