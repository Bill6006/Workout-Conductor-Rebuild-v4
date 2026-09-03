# Workout Conductor - Project Status

_Last updated: 2026-09-03 06:05 UTC_

| Item                   | Value                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository             | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4                                                                                                                                                         |
| Live app (permanent)   | https://bill6006.github.io/Workout-Conductor-Rebuild-v4/                                                                                                                                                         |
| Actions                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions                                                                                                                                                 |
| Commits                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commits/main                                                                                                                                            |
| Master issue           | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/issues/1                                                                                                                                                |
| Current phase          | Phase 3 - Workout Generation and Duration Engine                                                                                                                                                                 |
| Phase gate             | **YELLOW** - awaiting the owner's Android review of the live link                                                                                                                                                |
| Current branch         | `main`                                                                                                                                                                                                           |
| Latest completed phase | Phase 2 (GREEN from the owner on 2026-09-03)                                                                                                                                                                     |
| Work in progress       | Phase 3 review gate. No Phase 4 code has been started.                                                                                                                                                           |
| Latest commit          | App build `f30bec0` ([commit](https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commit/f30bec0)) on top of the engine build `2d9d605`; this commit adds the live screenshots and final status             |
| Latest deployment      | Deploy Pages run [33719882460](https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions/runs/33719882460): success, 2026-09-03 05:42 UTC, build marker `f30bec0 · Phase 3`                               |
| Test totals            | Unit: 152 passed (26 files). Browser/mobile: 50 passed + 6 skipped by design locally and against the live URL (one image-loaded check was made to poll after a network timing miss on the live run, then passed) |
| Build marker           | Shown under the header on every screen: `Build <sha> · <UTC time> · Phase 3`                                                                                                                                     |

## Phase checklist

| Phase | Name                                                         | Status               |
| ----- | ------------------------------------------------------------ | -------------------- |
| 0     | Repository, Live Pages, and Scaffold                         | GREEN (owner)        |
| 1     | Product Foundation and First Useful Live Preview             | GREEN (owner)        |
| 2     | Exercise Catalog, Media, and Conflict Engine                 | GREEN (owner)        |
| 3     | Workout Generation and Duration Engine                       | YELLOW (review gate) |
| 4     | Central Recalibration Engine                                 | planned              |
| 5     | Active Workout, Logging, and Superset Experience             | planned              |
| 6     | Adaptive Coach, Progression, Strategy, and Recovery          | planned              |
| 7     | Progress, Plan, Coverage, PRs, and Session Summary           | planned              |
| 8     | Data Safety, Optional Migration, PWA, Polish, and Acceptance | planned              |

## Phase 3 deliverables

- [x] Hybrid strength and hypertrophy generation (`src/engine/workoutGenerator/generate.ts`, see `docs/workout-engine.md`)
- [x] Weekly-volume and recent-exposure logic (`src/engine/volume/weeklyVolume.ts`) driving muscle priorities and template rotation
- [x] Progression roles with sets, rep ranges, RIR, and rests per role and style (`src/engine/progression/roles.ts`)
- [x] The single duration dropdown: 15 min, 30 min, 45 min, Default time, on Today, rebuilding the session at once
- [x] 15 / 30 / 45 / Default generation with row caps, rest floors, set trimming, value-ordered drops, and honest over-time reporting
- [x] Time estimation shared by fitting and display (`src/engine/duration/duration.ts`)
- [x] Warm-up planning: general warm-up budget per length plus flagged ramp sets on the main lifts
- [x] Smart supersets as two-move blocks with one canonical list row per superset
- [x] Optional intelligent drop sets (one, on a safe isolation move, never a priority lift)
- [x] Optional circuits on short hypertrophy sessions only
- [x] Workout explanation: summary, reasons, fitting steps, time breakdown, confidence
- [x] Active Workout List preview on the Workout tab; synthetic demo deleted
- [x] Live verification: the full browser suite passes against the deployed build; 26 screenshots captured from it
- [ ] Owner opens the live link on the Android phone and gives the phase decision (review gate)

## Known limitations

- Load targets stay empty until the progression engine (Phase 6); sets show reps and RIR targets only.
- Changing the length regenerates the not-yet-started session. Recalibrating a started workout (locked completed work, calibration overlay, change summary, End-by time) is Phase 4.
- `Start Workout` stays disabled until the active workout in Phase 5; there is no history yet, so weekly volume starts from the plan defaults and confidence reads "low" until sessions are logged.
- Demonstrations remain original placeholder diagrams until Phase 8.

## Mobile screenshots

Phase 3, captured by Playwright from the deployed build `f30bec0` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/phase-3](docs/screenshots/phase-3)).

- Combined preview sheet: [preview-sheet.png](docs/screenshots/phase-3/preview-sheet.png)
- Android 412 px (Pixel 7): [Today, Default time](docs/screenshots/phase-3/android-412-today.png) · [Today, fitted to 15 min](docs/screenshots/phase-3/android-412-today-15-min.png) · [Today full page](docs/screenshots/phase-3/android-412-today-full.png) · [Today alternatives](docs/screenshots/phase-3/android-412-today-alternatives.png) · [Workout list](docs/screenshots/phase-3/android-412-workout.png) · [Library](docs/screenshots/phase-3/android-412-library.png) · [Exercise detail sheet](docs/screenshots/phase-3/android-412-exercise-detail.png) · [Onboarding 1 goals](docs/screenshots/phase-3/android-412-onboarding-1-goals.png) · [Progress](docs/screenshots/phase-3/android-412-progress.png) · [Plan](docs/screenshots/phase-3/android-412-plan.png) · [Settings](docs/screenshots/phase-3/android-412-settings.png)
- Android 360 px: [Today](docs/screenshots/phase-3/android-360-today.png) · [Workout](docs/screenshots/phase-3/android-360-workout.png) · [Progress](docs/screenshots/phase-3/android-360-progress.png) · [Plan](docs/screenshots/phase-3/android-360-plan.png) · [Settings](docs/screenshots/phase-3/android-360-settings.png)
- Desktop 1280 px: [Today](docs/screenshots/phase-3/desktop-today.png) · [Workout](docs/screenshots/phase-3/desktop-workout.png) · [Progress](docs/screenshots/phase-3/desktop-progress.png) · [Plan](docs/screenshots/phase-3/desktop-plan.png) · [Settings](docs/screenshots/phase-3/desktop-settings.png)

Phase 2: [docs/screenshots/phase-2](docs/screenshots/phase-2) · Phase 1: [docs/screenshots/phase-1](docs/screenshots/phase-1) · Phase 0: [docs/screenshots/phase-0](docs/screenshots/phase-0).

## Next concrete action

Owner opens the live link on an Android phone, changes the workout length between 15 / 30 / 45 /
Default and watches the session rebuild, opens "Why this workout", checks the Workout tab list,
and replies with `GREEN - NEXT PHASE`, `YELLOW - FIX: <issue>`, or `RED - STOP`. On GREEN,
Phase 4 begins: the central recalibration engine.
