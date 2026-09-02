# Workout Conductor - Project Status

_Last updated: 2026-09-02 21:35 UTC_

| Item                   | Value                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository             | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4                                                                                                                             |
| Live app (permanent)   | https://bill6006.github.io/Workout-Conductor-Rebuild-v4/                                                                                                                             |
| Actions                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions                                                                                                                     |
| Commits                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commits/main                                                                                                                |
| Master issue           | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/issues/1                                                                                                                    |
| Current phase          | Phase 1 - Product Foundation and First Useful Live Preview                                                                                                                           |
| Phase gate             | **YELLOW** - awaiting the owner's Android review of the live link                                                                                                                    |
| Current branch         | `main`                                                                                                                                                                               |
| Latest completed phase | Phase 0 (GREEN from the owner on 2026-09-02)                                                                                                                                         |
| Work in progress       | Phase 1 review gate. No Phase 2 code has been started.                                                                                                                               |
| Latest commit          | App build `f9e58d2` ([commit](https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commit/f9e58d2)) on top of the Phase 1 build `6de52d2`; this commit adds the live screenshots |
| Latest deployment      | Deploy Pages run [33681260911](https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions/runs/33681260911): success, 2026-09-02 20:47 UTC, build marker `f9e58d2 · Phase 1`   |
| Test totals            | Unit: 95 passed (17 files). Browser/mobile: 37 passed + 4 skipped by design, locally and against the live URL (11 flows × 412 px, 360 px, desktop + 412 px capture flows + 2 PWA)    |
| Build marker           | Shown under the header on every screen: `Build <sha> · <UTC time> · Phase 1`                                                                                                         |

## Phase checklist

| Phase | Name                                                         | Status               |
| ----- | ------------------------------------------------------------ | -------------------- |
| 0     | Repository, Live Pages, and Scaffold                         | GREEN (owner)        |
| 1     | Product Foundation and First Useful Live Preview             | YELLOW (review gate) |
| 2     | Exercise Catalog, Media, and Conflict Engine                 | planned              |
| 3     | Workout Generation and Duration Engine                       | planned              |
| 4     | Central Recalibration Engine                                 | planned              |
| 5     | Active Workout, Logging, and Superset Experience             | planned              |
| 6     | Adaptive Coach, Progression, Strategy, and Recovery          | planned              |
| 7     | Progress, Plan, Coverage, PRs, and Session Summary           | planned              |
| 8     | Data Safety, Optional Migration, PWA, Polish, and Acceptance | planned              |

## Phase 1 deliverables

- [x] Step-by-step onboarding (7 steps, plan defaults, skip with defaults, draft survives reload, conflicts explained)
- [x] Profile and goals
- [x] Equipment and location profiles (Home, Gym, Travel, Custom; Plan tab editor; current location switch)
- [x] Preferences and limitations
- [x] Settings for everything collected, with verified autosave and restart-onboarding
- [x] localStorage for small settings and the onboarding draft
- [x] IndexedDB durable-data foundation (profile, locations, workouts, meta)
- [x] Schema validation with unknown-field preservation
- [x] Write/read-back save-verification helper with rollback, receipt shown in Diagnostics
- [x] Export Full Backup JSON / Import with preview, verified restore, and rollback
- [x] Today dashboard with date, planned length, location, muscle focus, why-this-workout, profile summary
- [x] Safe synthetic demo workout preview, clearly labeled
- [x] Interactive navigation and profile editing verified on the live Pages link (onboarding, settings autosave, places, export/import, and PWA flows pass against production under Pixel 7 emulation)
- [x] First-run scroll position fixed: finishing setup now opens Today at the top (found while reviewing live captures)
- [ ] Owner opens the live link on the Android phone and gives the phase decision (review gate)

## Known limitations

- The demo workout is synthetic and says so. The real generation engine and the single 15 / 30 / 45 / Default workout-length dropdown arrive in Phase 3; until then Today shows "Default: N min" as a value.
- `Start Workout` stays disabled until the active workout arrives in Phase 5. Readiness check-in arrives in Phase 6.
- Exercise preferences are stored as names; Phase 2's catalog resolves them by alias.
- Bodyweight-only home setups are accepted only once the catalog can build a bodyweight session (Phase 2/3); onboarding asks for at least one piece of home equipment when there is no gym access.
- Bundle: JS 350 KB raw / 105 KB gzip, CSS 21 KB, dist total 629 KB across 14 files.
- Playwright runs with two workers everywhere; four parallel Chromium contexts crashed the browser on the development machine.

## Mobile screenshots

Phase 1, captured by Playwright from the deployed build `f9e58d2` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/phase-1](docs/screenshots/phase-1)).

- Combined preview sheet: [preview-sheet.png](docs/screenshots/phase-1/preview-sheet.png)
- Android 412 px (Pixel 7): [Onboarding 1 goals](docs/screenshots/phase-1/android-412-onboarding-1-goals.png) · [Onboarding 2 schedule](docs/screenshots/phase-1/android-412-onboarding-2-schedule.png) · [Onboarding 3 places](docs/screenshots/phase-1/android-412-onboarding-3-places.png) · [Onboarding 5 limitations](docs/screenshots/phase-1/android-412-onboarding-5-limitations.png) · [Today](docs/screenshots/phase-1/android-412-today.png) · [Today full page](docs/screenshots/phase-1/android-412-today-full.png) · [Workout](docs/screenshots/phase-1/android-412-workout.png) · [Progress](docs/screenshots/phase-1/android-412-progress.png) · [Plan](docs/screenshots/phase-1/android-412-plan.png) · [Add a place sheet](docs/screenshots/phase-1/android-412-plan-add-place.png) · [Settings](docs/screenshots/phase-1/android-412-settings.png) · [Import preview sheet](docs/screenshots/phase-1/android-412-settings-import-preview.png)
- Android 360 px: [Today](docs/screenshots/phase-1/android-360-today.png) · [Workout](docs/screenshots/phase-1/android-360-workout.png) · [Progress](docs/screenshots/phase-1/android-360-progress.png) · [Plan](docs/screenshots/phase-1/android-360-plan.png) · [Settings](docs/screenshots/phase-1/android-360-settings.png)
- Desktop 1280 px: [Today](docs/screenshots/phase-1/desktop-today.png) · [Workout](docs/screenshots/phase-1/desktop-workout.png) · [Progress](docs/screenshots/phase-1/desktop-progress.png) · [Plan](docs/screenshots/phase-1/desktop-plan.png) · [Settings](docs/screenshots/phase-1/desktop-settings.png)

Phase 0: [docs/screenshots/phase-0](docs/screenshots/phase-0) (preview sheet: [preview-sheet.png](docs/screenshots/phase-0/preview-sheet.png)).

## Next concrete action

Owner opens the live link on an Android phone, walks through setup (or taps "Use defaults and
skip setup"), checks Today, Plan, and Settings, and replies with `GREEN - NEXT PHASE`,
`YELLOW - FIX: <issue>`, or `RED - STOP`. On GREEN, Phase 2 begins: the structured exercise
catalog, muscle model, movement patterns, limitation and joint-stress tags, progression families,
conflict validation, alternative-ranking foundation, media manifest and licensing register, and
custom exercise schemas.
