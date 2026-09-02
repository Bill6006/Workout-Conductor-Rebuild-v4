# Architecture

This document grows with each phase. It currently describes the Phase 0 shell and the structure
the later phases will fill in.

## Principles

- **One owner per responsibility.** Generation, recalibration, conflicts, alternatives,
  progression, recovery, coaching, storage, and media each get exactly one engine. New abilities
  extend the owner in place; they never create a parallel system.
- **Local-first.** The whole engine runs in the browser. Durable data lives in IndexedDB, small
  settings in localStorage. No network dependency for any training decision.
- **Deterministic engines, thin UI.** Engines are pure TypeScript functions over typed inputs so
  they can be unit tested without a browser.
- **Honest UI.** The shell shows the current phase and build marker on every screen, and a screen
  never pretends a feature exists before its phase.

## Phase 0 shell

```
src/
  main.tsx                      entry; mounts <App /> with global styles
  app/
    App.tsx                     routes the active screen inside the shell
    navigation.ts               RouteId, NAV_ITEMS, parseRouteId (no component imports)
    routes.ts                   RouteId -> screen component
    useHashRoute.ts             hash-based routing (works under the Pages subpath and on reload)
    phases.ts                   the nine plan phases, CURRENT_PHASE, gate state
    buildInfo.ts                Zod-validated build marker injected by vite.config.ts
    projectLinks.ts             repository / status / actions URLs shown in the shell
    pwa/UpdatePrompt.tsx        "New version available" prompt; never forces a refresh
  components/
    AppShell/                   header (brand, phase chip, build marker) + main + bottom nav
    BottomNav/                  Today / Workout / Progress / Plan / Settings
    NavIcons/                   original line icons
    Card/, Button/, FactList/, Screen/   shared surfaces
  features/
    today/ workout/ progress/ plan/ settings/   one screen each
  styles/
    tokens.css                  design tokens (dark charcoal, lime accent, radii, safe areas)
    global.css                  reset and base styles
```

### Routing

Hash routing (`#/today`, `#/workout`, ...) keeps deep links and reloads working on GitHub Pages
without a 404 fallback and without a router dependency. Unknown hashes fall back to Today.

### Build marker

`vite.config.ts` injects `__BUILD_INFO__` (commit, branch, build time, version, phase). The app
validates it with Zod and shows `Build <sha> · <time> UTC · Phase <n>` under the header, plus a
Build status card on Today. `scripts/verify-build.mjs` checks the marker is really in the bundle
and that the phase constant in `vite.config.ts` matches `src/app/phases.ts`.

### PWA

`vite-plugin-pwa` in `prompt` mode precaches the app shell. A waiting service worker is only
activated when the user taps Reload. Later phases hold the prompt during an active workout.

## Planned structure (from the execution plan)

```
src/core/       state, storage (IndexedDB + localStorage), time, validation, backup
src/engine/     workoutGenerator, recalibration, conflicts, alternatives, progression,
                recovery, duration, volume, scoring
src/catalog/    exercises, equipment, muscles, movementPatterns, mediaManifest
src/components/ DurationSelector, CalibrationOverlay, ExerciseCard, AlternativeSheet,
                SetLogger, RestTimer, SupersetGroup, WorkoutSummary, Charts, Dialogs
```

## Delivery pipeline

`.github/workflows/ci.yml` runs install, lint, type-check, unit tests, build, privacy scan,
build verification, and the Playwright smoke test. `.github/workflows/pages.yml` reuses that
workflow on every push to `main` and deploys `dist/` to the permanent Pages URL only when every
step passed.
