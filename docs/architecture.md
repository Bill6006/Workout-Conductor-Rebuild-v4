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
- **Honest UI.** Settings, About this app shows the current phase and build marker (every screen's
  header did until Maintenance 25, when developer facts left the main flow), and a screen
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
    pwa/UpdatePrompt.tsx        "New version available" prompt, and the checks for a release; never forces a refresh
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
    barcode/                    a place's membership barcode: add from a picture, read it where the
                                phone can, redraw it (JsBarcode, qrcode-generator, loaded on demand),
                                popup, full screen on a tap; device-only store, never synced or backed up
    settings/                   grouped rows, BackupCard, DiagnosticsCard (About)
    workout/                    Active Workout List preview (one row per block); logging in Phase 5
    progress/                   placeholder until Phase 7
  components/
    AppShell/ BottomNav/ NavIcons/ Card/ Button/ FactList/ Screen/
    Form/                       Field, ChoiceGroup, ChipSelect, Toggle, NumberField, TagInput, TextArea
    Sheet/ Toast/ ProgressBar/
    ExerciseDetail/             ExerciseThumb, ExerciseDemo (looping, Slow, Play under reduced motion, your own GIF), ExerciseDetailSheet
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
validates it with Zod and shows `Build <sha> · <time> UTC · Phase <n>` under Settings, About this
app, with the full facts (Maintenance 25; until then under every screen's header). `scripts/verify-build.mjs` checks the marker is really
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
and the session (workout, constraints, logged work, log) persists in localStorage. It is
validated only when read back at startup, against the same lists the engines write from
(`PROGRESSION_MODES`, for example); a stored workout that still cannot be read and may hold work
is moved aside to `wc.v1.sessionRecovery` before a fresh session is written, and the app says so
(Maintenance 17).

`generateWorkout` (see [workout-engine.md](workout-engine.md)) is pure and deterministic:
profile, place, history, date, and length choice in; an explained `GeneratedWorkout` out. Today
and Workout share it through `useTodayWorkout`, which memoises on those inputs, so changing the
length dropdown regenerates immediately. The length choice is session-only app state; the
Default length is the profile's typical workout length.

### PWA

`vite-plugin-pwa` in `prompt` mode precaches the app shell. A waiting service worker is only
activated when the user taps Reload. During a workout the offer stays and says the logged sets and
timers are kept on this device and carry on after the reload, which they do: the session lives in
local storage and the rest and hold timers keep absolute end times. A value on a dial not yet
logged is not kept, and is not promised.

An installed app on Android is mostly brought back from the background rather than loaded, and a
browser looks for a new worker only when a page loads, so an installed app could sit on an old
build (the owner saw one). Since Maintenance 25 the app looks itself (`UpdatePrompt`): when it
comes back to the front, when the network comes back, and hourly while open, through
`registration.update()`; a release put off with Later is offered again the next time the app
comes back, until the page loads again, whether it still waits or already runs the service worker
(it took over with no page under it, or another page let it in). The plugin listens for new
workers only until it sees one it takes for another page's (found a minute or more after the page
registered, or any after its first), and never sees a worker after it, so the app listens itself:
it offers a release the moment it waits, and when another page of the app let it take over;
Reload loads the page once the new worker is in (as this page's worker, or active for a page no
worker runs), and at once when nothing waits. Pages serves every
file with `max-age=600`, and the browser fetches the worker script past that cache for an update
check, so a deploy is found at the next check. `e2e/pwaUpdate.spec.ts` proves it on two real
builds served one after the other on one origin (`scripts/pwa-update-server.mjs`).

## Planned structure (from the execution plan)

```
src/engine/     recalibration (Phase 4), recovery (Phase 6), scoring (Phase 7)
                (conflicts, alternatives, workoutGenerator, duration, volume, progression exist)
src/components/ DurationSelector, CalibrationOverlay, ExerciseCard, AlternativeSheet,
                SetLogger, RestTimer, SupersetGroup, WorkoutSummary, Charts, Dialogs
```

## Delivery pipeline

`.github/workflows/ci.yml` runs install, lint, type-check, unit tests, build, privacy scan,
build verification, and the Playwright suite (three device projects, a serial PWA project, and a
serial update project on two builds served by its own server).
`.github/workflows/pages.yml` reuses that workflow on every push to `main` and deploys `dist/`
to the permanent Pages URL only when every step passed. `E2E_BASE_URL=<url> npx playwright test`
runs the same suite against a deployed build.

## Alerts (`src/core/alerts/`, Maintenance 14)

`cues.ts` plans the rest's last seconds; `restSounds.ts` lays them onto the Web Audio clock
through a `ToneOutput` seam (a recorder in tests); `notify.ts` shows notifications through the
service worker, whose click handler is `public/sw-notify.js` (loaded by workbox `importScripts`);
`useWorkoutAlerts` is mounted once in `App` so everything works from any tab. There is no server:
a notification needs the app alive in the background.
