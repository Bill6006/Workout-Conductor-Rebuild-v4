#!/usr/bin/env node
/**
 * The installed-app update check (Maintenance 25, the owner's item 6): two real builds of the app,
 * served one at a time on one origin, as GitHub Pages serves a deploy. Build A is live until the
 * test switches to build B, as a new deploy replaces the old one.
 *
 *   GET /__variant/a  or  /__variant/b   makes that build live (building it first if needed)
 *   GET /__sw                             when the worker script was last fetched
 *   GET /__fail-install                   the next worker's first file fails, as a server can
 *
 * Builds go under test-results/pwa-update/ with made-up commits (aaaaaaa…, bbbbbbb…), so the app's
 * About row names the build it runs. Every file carries Pages' own header, max-age=600.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.VITE_BASE_PATH ?? '/Workout-Conductor-Rebuild-v4/';
const PORT = Number(process.env.PWA_UPDATE_PORT ?? 4175);
const OUT = path.join(ROOT, 'test-results', 'pwa-update');
const COMMITS = { a: 'a'.repeat(40), b: 'b'.repeat(40) };
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

let live = 'a';
let swFetchedAt = 0;
// The next file a worker fetches past the cache as it installs fails, once.
let failInstall = false;
// Fresh builds for every run, from the source as it is now: a build left from an earlier run
// could be of other code.
rmSync(OUT, { recursive: true, force: true });

function build(variant) {
  const dir = path.join(OUT, variant);
  if (existsSync(path.join(dir, 'sw.js'))) return dir;
  execSync(`npx vite build --outDir "${dir}" --emptyOutDir`, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, GITHUB_SHA: COMMITS[variant], GITHUB_REF_NAME: `pwa-update-${variant}` },
  });
  return dir;
}

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'max-age=600' });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
  const variant = /^\/__variant\/([ab])$/.exec(url.pathname)?.[1];
  if (variant) {
    try {
      build(variant);
      live = variant;
      // Back to A is a fresh start: no failure left over from a test that stopped early.
      if (variant === 'a') failInstall = false;
      send(response, 200, `live: ${variant}`);
    } catch (error) {
      send(response, 500, String(error));
    }
    return;
  }
  if (url.pathname === '/__sw') {
    // When the worker script was last fetched: a test waits for the browser's own checks to end.
    send(
      response,
      200,
      JSON.stringify({ lastAt: swFetchedAt, now: Date.now(), failPending: failInstall }),
      TYPES['.json'],
    );
    return;
  }
  if (url.pathname === '/__fail-install') {
    failInstall = true;
    send(response, 200, 'the next install drops');
    return;
  }
  const header = (name) => String(request.headers[name] ?? '');
  if (
    failInstall &&
    header('sec-fetch-dest') === 'empty' &&
    header('cache-control').includes('no-cache')
  ) {
    // A worker installing fetches each changed file past the cache, as no page does: one fails
    // mid-install, as a server can. (A dropped connection would not do: the browser retries it.)
    failInstall = false;
    send(response, 503, 'unavailable');
    return;
  }
  if (!url.pathname.startsWith(BASE)) {
    send(response, 404, 'not found');
    return;
  }
  const dir = build(live);
  let relative;
  try {
    relative = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
  } catch {
    send(response, 400, 'bad path');
    return;
  }
  if (relative === 'sw.js') swFetchedAt = Date.now();
  const file = path.normalize(path.join(dir, relative));
  if (!file.startsWith(dir)) {
    send(response, 403, 'forbidden');
    return;
  }
  const exists = existsSync(file) && statSync(file).isFile();
  // A page path falls back to the app, as Pages' 404 page does for this app; a missing file is 404.
  if (!exists && path.extname(relative) !== '') {
    send(response, 404, 'not found');
    return;
  }
  const target = exists ? file : path.join(dir, 'index.html');
  send(
    response,
    200,
    readFileSync(target),
    TYPES[path.extname(target)] ?? 'application/octet-stream',
  );
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`pwa update server on http://127.0.0.1:${PORT}${BASE} (live: ${live})`);
});
