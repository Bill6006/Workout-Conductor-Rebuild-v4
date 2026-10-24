import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

/**
 * Workout Conductor - Vite configuration.
 *
 * - `base` is the GitHub Pages repository subpath. Override with VITE_BASE_PATH
 *   (for example "/") when serving from a domain root.
 * - `__BUILD_INFO__` is injected at build time so the deployed shell can show a
 *   visible build marker (commit, time, phase) on the phone.
 * - The PWA plugin is configured in "prompt" mode: a new service worker never
 *   takes over silently; the app shows a safe "New version available" prompt.
 */

const REPO_NAME = 'Workout-Conductor-Rebuild-v4';
const base = process.env.VITE_BASE_PATH ?? `/${REPO_NAME}/`;

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function gitValue(command: string, fallback: string): string {
  try {
    const value = execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

const commit = process.env.GITHUB_SHA ?? gitValue('git rev-parse HEAD', 'local');
const branch = process.env.GITHUB_REF_NAME ?? gitValue('git rev-parse --abbrev-ref HEAD', 'local');

/** Keep in sync with src/app/phases.ts (CURRENT_PHASE). Validated by verify-build. */
const CURRENT_PHASE = 8;

const buildInfo = {
  commit,
  shortCommit: commit.slice(0, 7),
  branch,
  builtAt: new Date().toISOString(),
  version: pkg.version,
  phase: CURRENT_PHASE,
};

/**
 * A manifest icon's address ends with the first 8 hex digits of its content's SHA-256, so a
 * changed icon has a new address (2026-10-24). An installed app's update check fetches the icons
 * the manifest names: one kept under an old address, by the service worker or the browser, cannot
 * stand in for a new one.
 */
function iconSrc(file: string): string {
  const bytes = readFileSync(new URL(`./public/icons/${file}`, import.meta.url));
  return `icons/${file}?v=${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}`;
}

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // Every icon is kept for offline under its plain address; the manifest's versioned addresses
      // are for the browser's install and update checks, which fetch them from the network.
      includeAssets: ['icons/*.png'],
      manifest: {
        id: base,
        name: 'Workout Conductor',
        short_name: 'Conductor',
        description: 'Adaptive Strength + Hypertrophy. A local-first workout coach.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e1012',
        theme_color: '#0e1012',
        lang: 'en',
        categories: ['fitness', 'health'],
        icons: [
          { src: iconSrc('icon-192.png'), sizes: '192x192', type: 'image/png' },
          { src: iconSrc('icon-512.png'), sizes: '512x512', type: 'image/png' },
          {
            src: iconSrc('icon-maskable-512.png'),
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      integration: {
        // The plugin adds the manifest it writes to the precache; the route below serves it.
        beforeBuildServiceWorker(options) {
          options.workbox.additionalManifestEntries = (
            options.workbox.additionalManifestEntries ?? []
          ).filter(
            (entry) => (typeof entry === 'string' ? entry : entry.url) !== 'manifest.webmanifest',
          );
        },
      },
      workbox: {
        // The demonstrations' stills (WebP) install with the app, so every exercise shows its own
        // still offline (Maintenance 25, item 7); a clip is kept the first time it plays. The
        // manifest is not precached (below).
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico}'],
        runtimeCaching: [
          {
            // The manifest, from the server whenever there is a network, its last copy kept for
            // offline (2026-10-24). Precached, an installed app's update check read the release
            // the phone runs, and saw a new icon or name only after Reload took the new one.
            urlPattern: /\/manifest\.webmanifest$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'web-manifest',
              // Asked of the server every time, past the browser's ten-minute copy.
              fetchOptions: { cache: 'no-cache' },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Each clip is named by its content (the ninth review): a corrected clip has a new
            // address, so a phone that kept the old one fetches it, and the old one ages out.
            urlPattern: /\/media\/exercises\/[a-z0-9-]+\.[0-9a-f]{8}\.mp4$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-clips',
              expiration: { maxEntries: 120, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        navigateFallback: `${base}index.html`,
        // The manifest and an icon's versioned address, opened in a tab, show the file, not the
        // app: neither is precached now, so the fallback would otherwise answer for them.
        navigateFallbackDenylist: [/\/manifest\.webmanifest$/, /\/icons\//],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        // A tap on a notification brings the app forward (public/sw-notify.js).
        importScripts: ['sw-notify.js'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Tests that drive the whole app pass five seconds when the full suite runs in parallel;
    // a test that truly hangs still fails.
    testTimeout: 15_000,
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
});
