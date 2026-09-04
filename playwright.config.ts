import { defineConfig, devices } from '@playwright/test';

/**
 * Browser and mobile tests run against the production build served by
 * `vite preview` under the GitHub Pages subpath, so what is tested is what ships.
 *
 * Service workers are blocked in the parallel smoke projects: many contexts
 * installing the same worker on one origin stall each other's asset fetches in
 * Chromium, which is a test artifact rather than a product behaviour. PWA
 * behaviour (install, control after reload, offline shell) is verified in the
 * dedicated `pwa` project, which runs serially after the smoke projects.
 *
 * Two workers everywhere: more parallel Chromium contexts destabilised the
 * browser on the development machine, and CI runs two as well.
 */

const REPO_NAME = 'Workout-Conductor-Rebuild-v4';
const base = process.env.VITE_BASE_PATH ?? `/${REPO_NAME}/`;
const port = 4173;
// 127.0.0.1 on purpose: "localhost" resolves to both loopback stacks and the
// preview server binds only one of them, which made the browser's first
// connection attempt stall on Windows. The preview script binds the same host.
const localURL = `http://127.0.0.1:${port}${base}`;

/**
 * Set E2E_BASE_URL to run the same suite against a deployed build, for example
 * the permanent GitHub Pages URL after a deploy. No local server is started then.
 */
const deployedURL = process.env.E2E_BASE_URL;
const baseURL = deployedURL ?? localURL;

const pixel7 = { ...devices['Pixel 7'], deviceScaleFactor: 2 };
const smokeSpecs =
  /(smoke|onboarding|library|duration|recalibration|activeWorkout|coach|progress|media|dataSafety|a11y|zoom|screenshots)\.spec\.ts/;
const pwaSpecs = /pwa\.spec\.ts/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'android-412',
      testMatch: smokeSpecs,
      use: pixel7,
    },
    {
      name: 'android-360',
      testMatch: smokeSpecs,
      // 1x is enough for the narrow-width layout check and keeps evidence files small.
      use: { ...pixel7, viewport: { width: 360, height: 800 }, deviceScaleFactor: 1 },
    },
    {
      name: 'desktop',
      testMatch: smokeSpecs,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'pwa',
      testMatch: pwaSpecs,
      dependencies: ['android-412', 'android-360', 'desktop'],
      use: { ...pixel7, serviceWorkers: 'allow' },
    },
  ],
  webServer: deployedURL
    ? undefined
    : {
        command: 'npm run preview',
        url: localURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
