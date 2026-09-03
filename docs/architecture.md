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
    equipment/                  equipment ids, categories, presets
    muscles/ movementPatterns/  muscle model (18 muscles, 6 groups) and 22 movement patterns
    exercises/                  ExerciseSchema, defineExercise DSL, data/ (push, pull, legs, armsCore), catalog lookups
    media/mediaManifest.ts      asset registry with source + license; placeholder loops per pattern
  engine/
    conflicts/                  the one conflict engine (fit, workout, superset) + context builder
    alternatives/               rankAlternatives: ranked, explained, conflict-filtered candidates
    workout/types.ts            GeneratedWorkout, blocks (straight / superset / circuit), entries, sets
    duration/duration.ts        15 / 30 / 45 / Default choices, warm-up budget, time estimation
    volume/weeklyVolume.ts      weekly volume, exposure, goal weights, targets, muscle priorities
    progression/roles.ts        role -> sets, reps, RIR, rest; ramp sets; role ranks
    workoutGenerator/generate.ts templates, slot picking, circuits, supersets, duration fitting, drop set, explanation
  features/
    onboarding/                 7-step wizard over a ProfileDraft, localStorage draft persistence
    profile/draft.ts            ProfileDraft = profile + locations; one editing model
    profile/editors/            Goals, Schedule, Places, ExercisePreferences, Limitations, Style, Units
    profile/useProfileEditor    debounced verified autosave used by Settings and Plan
    today/                      Today dashboard; useTodayWorkout runs the generator; WorkoutPreviewCard
    library/                    exercise library: search, muscle-group filter, detail sheet, preferences
    plan/                       training days, location list, LocationEditorSheet
    settings/                   editor sections, BackupCard, DiagnosticsCard
    workout/                    Active Workout List preview (one row per block); logging in Phase 5
    progress/                   placeholder until Phase 7
  components/
    AppShell/ BottomNav/ NavIcons/ Card/ Button/ FactList/ Screen/
    Form/                       Field, ChoiceGroup, ChipSelect, Toggle, NumberField, TagInput, TextArea
    Sheet/ Toast/ ProgressBar/
    ExerciseDetail/             ExerciseThumb, ExerciseDemo (play/pause/replay, reduced motion), ExerciseDetailSheet
    DurationSelector/           the one workout-length dropdown (15 / 30 / 45 / Default)
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

### Catalog and engines (Phase 2)

Every exercise is authored through `defineExercise`, which fills pattern- and equipment-based
defaults (station, setup time, load type and bar weight for Plate Math, rep ranges, drop-set
safety, superset friendliness, warm-up ramp) and validates the result against `ExerciseSchema`.
The conflict engine (see [conflict-engine.md](conflict-engine.md)) is the only place that decides
whether an exercise, a selection, or a superset pair is acceptable. `rankAlternatives` scores
candidates on muscle overlap, pattern, role, stimulus, progression family, preference, setup time,
joint stress, and superset compatibility, and explains the top reason and the key difference.
Custom exercises (`CustomExerciseSchema`) are presented to the engines through
`customToCatalogExercise`, so user content and catalog content share one code path.

### Generation (Phase 3)

Every change after generation goes through the Recalibration Engine (see
[recalibration-engine.md](recalibration-engine.md)): the store builds a typed request, the pure
engine returns a new valid workout with a change summary or a failure that keeps the previous one,
and the session (workout, constraints, logged work, log) persists in localStorage.

`generateWorkout` (see [workout-engine.md](workout-engine.md)) is pure and deterministic:
profile, place, history, date, and length choice in; an explained `GeneratedWorkout` out. Today
and Workout share it through `useTodayWorkout`, which memoises on those inputs, so changing the
length dropdown regenerates immediately. The length choice is session-only app state; the
Default length is the profile's typical workout length.

### PWA

`vite-plugin-pwa` in `prompt` mode precaches the app shell. A waiting service worker is only
activated when the user taps Reload. Later phases hold the prompt during an active workout.

## Planned structure (from the execution plan)

```
src/engine/     recalibration (Phase 4), recovery (Phase 6), scoring (Phase 7)
                (conflicts, alternatives, workoutGenerator, duration, volume, progression exist)
src/components/ DurationSelector, CalibrationOverlay, ExerciseCard, AlternativeSheet,
                SetLogger, RestTimer, SupersetGroup, WorkoutSummary, Charts, Dialogs
```

## Delivery pipeline

`.github/workflows/ci.yml` runs install, lint, type-check, unit tests, build, privacy scan,
build verification, and the Playwright suite (three device projects plus a serial PWA project).
`.github/workflows/pages.yml` reuses that workflow on every push to `main` and deploys `dist/`
to the permanent Pages URL only when every step passed. `E2E_BASE_URL=<url> npx playwright test`
runs the same suite against a deployed build.
