# Phase 0 report - Repository, Live Pages, and Scaffold

Status: **YELLOW** (awaiting the owner's Android review). Only the owner can mark this GREEN.

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

## Delivered

- Public repository `Workout-Conductor-Rebuild-v4` with README, PROJECT_STATUS, LICENSE (MIT),
  privacy rules, and the full scaffold in the first commit (`0ee2c52`).
- Vite 8 + React 19 + TypeScript 5.9 scaffold, CSS modules, Zod, Vitest, Playwright, ESLint 10,
  Prettier. TypeScript 7 was not used because typescript-eslint requires TypeScript below 6.1.
- PWA shell via vite-plugin-pwa in `prompt` mode (no silent takeover), manifest with original
  icons rendered from `public/icons/icon.svg`, safe-area viewport, zoom left enabled.
- Blank but polished mobile shell: header with brand, tagline, phase chip and build marker;
  Today / Workout / Progress / Plan / Settings bottom navigation; large rounded cards; disabled
  Start Workout action; Build status and Privacy cards on Today; Diagnostics card on Settings.
- Hash routing (`#/today` ...) so deep links and reloads work under the Pages subpath.
- `scripts/privacy-scan.mjs`, `scripts/verify-build.mjs` (subpath, manifest, icons, service
  worker, build marker, phase-constant agreement, bundle size), `scripts/generate-icons.mjs`,
  `scripts/screenshots.mjs`.
- `.github/workflows/ci.yml` (install, lint, type-check, unit tests, build, privacy scan, verify
  build, Playwright smoke) and `.github/workflows/pages.yml` (reuses CI, then deploys).
- GitHub Pages enabled with the Actions build type; milestone 1 and master execution issue 1.

## Verification

| Check                           | Result                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                  | clean                                                                                                          |
| `npm run typecheck`             | clean                                                                                                          |
| `npm run test:unit`             | 41 passed (navigation, build marker, phases, App shell, update prompt)                                         |
| `npm run build`                 | ok, 18 precache entries                                                                                        |
| `npm run privacy-scan`          | passed, 0 findings                                                                                             |
| `npm run verify-build`          | passed                                                                                                         |
| `npm run test:e2e` (local)      | 20 passed: 18 smoke (412 px, 360 px, desktop) + 2 PWA (install, control after reload, offline shell, manifest) |
| Deploy Pages run 33676126959    | success: verify job 1m 0s, deploy 9s                                                                           |
| `npm run test:e2e` against live | 20 passed against https://bill6006.github.io/Workout-Conductor-Rebuild-v4/                                     |
| Live bundle                     | carries build marker commit `0ee2c52`, branch `main`, phase 0                                                  |
| Screenshots                     | 15 captures + preview sheet from the live build in `docs/screenshots/phase-0/`                                 |

## Decisions and notes

- Service workers are blocked in the parallel smoke projects. Many contexts installing the same
  worker on one origin stalled each other's asset fetches in Chromium (traced: JS and CSS requests
  never answered). PWA behaviour is tested serially in its own `pwa` project instead, including an
  offline navigation served from the precache.
- The preview server and Playwright use `127.0.0.1` explicitly instead of `localhost`, which
  resolves to both loopback stacks while the server binds one of them.
- The sandboxed local shell used during development drops loopback connections under parallel
  browser load. The identical suite passed 20/20 twice outside that sandbox, in CI, and against
  the live URL, so this was recorded as a test-infrastructure note rather than patched around.
- The email rule of the privacy scan skips only `package-lock.json`, where npm stores third-party
  deprecation notices; every other rule still applies to it.
- The push needed a repository-local `http.sslBackend=schannel` because the machine-wide git
  config forces the OpenSSL backend with a CA bundle that does not trust this network's TLS path.
  Certificate verification stays on.
- Bundle: JS 285 KB raw / 87 KB gzip, CSS 8 KB, dist 552 KB (14 files).
- `E2E_BASE_URL=<url> npx playwright test` runs the same suite against any deployed build.

## Next

Owner review on Android at the permanent link. On `GREEN - NEXT PHASE`, Phase 1 starts.
