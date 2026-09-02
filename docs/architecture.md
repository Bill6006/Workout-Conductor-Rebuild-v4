# Architecture

This document grows with each phase. It describes the shell (Phase 0), the data and product
foundation (Phase 1), and the structure later phases fill in.

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

## Source map

```
src/
  main.tsx                      entry; AppStoreProvider > ToastProvider > App
  app/
    App.tsx                     hydration gate, first-run redirect to onboarding, active screen
    navigation.ts               RouteId, NAV_ITEMS (5 tabs; onboarding is a tab-less route)
    routes.tsx                  RouteId -> screen component
    useHashRoute.ts             hash routing (works under the Pages subpath and on reload)
    phases.ts                   the nine plan phases, CURRENT_PHASE, gate state
    buildInfo.ts                Zod-validated build marker injected by vite.config.ts
    pwa/UpdatePrompt.tsx        "New version available" prompt; never forces a refresh
  core/
    validation/                 Zod schemas: profile, location, settings, backup (loose objects)
    storage/indexedDb.ts        promise wrapper, stores: profile, locations, workouts, meta
    storage/verifiedSave.ts     write, read back, compare, roll back; SaveReceipt
    storage/localSettings.ts    validated localStorage access with in-memory fallback
    backup/                     build / parse / summarize / restore (with snapshot rollback)
    state/appStore.ts           the single state owner (useSyncExternalStore), verified saves
    time/clock.ts               minute clock hook so render stays pure
  catalog/
    equipment/                  equipment ids, categories, presets (Phase 2 extends)
    exercises/                  seed exercise names (replaced by the Phase 2 catalog)
  features/
    onboarding/                 7-step wizard over a ProfileDraft, localStorage draft persistence
    profile/draft.ts            ProfileDraft = profile + locations; one editing model
    profile/editors/            Goals, Schedule, Places, ExercisePreferences, Limitations, Style, Units
    profile/useProfileEditor    debounced verified autosave used by Settings and Plan
    today/                      Today dashboard; demo/ holds the synthetic demo (deleted in Phase 3)
    plan/                       training days, location list, LocationEditorSheet
    settings/                   editor sections, BackupCard, DiagnosticsCard
    workout/ progress/          placeholders until Phases 5 and 7
  components/
    AppShell/ BottomNav/ NavIcons/ Card/ Button/ FactList/ Screen/
    Form/                       Field, ChoiceGroup, ChipSelect, Toggle, NumberField, TagInput, TextArea
    Sheet/ Toast/ ProgressBar/
  styles/                       tokens.css (dark charcoal, lime accent, radii, safe areas), global.css
```

### Routing

Hash routing (`#/today`, `#/workout`, ...) keeps deep links and reloads working on GitHub Pages
without a 404 fallback and without a router dependency. Unknown hashes fall back to Today. While
no profile exists the app renders onboarding regardless of the hash and hides the tab bar.

### State and persistence

`AppStore` hydrates from IndexedDB and localStorage at startup and exposes a snapshot to React
through `useSyncExternalStore`. Mutations (`saveProfile`, `saveLocation`, `deleteLocation`,
`setCurrentLocation`, `completeOnboarding`, `applyBackup`) go through `putVerified` /
`deleteVerified`, so state only changes after the write has been read back. See
[data-model.md](data-model.md) for schemas and the backup contract.

### Build marker

`vite.config.ts` injects `__BUILD_INFO__` (commit, branch, build time, version, phase). The app
validates it with Zod and shows `Build <sha> · <time> UTC · Phase <n>` under the header;
Settings, Diagnostics shows the full facts. `scripts/verify-build.mjs` checks the marker is really
in the bundle and that the phase constant in `vite.config.ts` matches `src/app/phases.ts`.

### PWA

`vite-plugin-pwa` in `prompt` mode precaches the app shell. A waiting service worker is only
activated when the user taps Reload. Later phases hold the prompt during an active workout.

## Planned structure (from the execution plan)

```
src/engine/     workoutGenerator, recalibration, conflicts, alternatives, progression,
                recovery, duration, volume, scoring
src/catalog/    exercises (structured), muscles, movementPatterns, mediaManifest
src/components/ DurationSelector, CalibrationOverlay, ExerciseCard, AlternativeSheet,
                SetLogger, RestTimer, SupersetGroup, WorkoutSummary, Charts, Dialogs
```

## Delivery pipeline

`.github/workflows/ci.yml` runs install, lint, type-check, unit tests, build, privacy scan,
build verification, and the Playwright suite (three device projects plus a serial PWA project).
`.github/workflows/pages.yml` reuses that workflow on every push to `main` and deploys `dist/`
to the permanent Pages URL only when every step passed. `E2E_BASE_URL=<url> npx playwright test`
runs the same suite against a deployed build.
