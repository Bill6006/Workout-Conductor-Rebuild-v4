import { execSync } from 'node:child_process';
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
const CURRENT_PHASE = 2;

const buildInfo = {
  commit,
  shortCommit: commit.slice(0, 7),
  branch,
  builtAt: new Date().toISOString(),
  version: pkg.version,
  phase: CURRENT_PHASE,
};

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.svg', 'icons/*.png'],
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
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
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
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
});
