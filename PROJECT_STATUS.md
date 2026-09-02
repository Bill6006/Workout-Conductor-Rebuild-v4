# Workout Conductor - Project Status

_Last updated: 2026-09-02 22:30 UTC_

| Item                   | Value                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Repository             | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4                                                   |
| Live app (permanent)   | https://bill6006.github.io/Workout-Conductor-Rebuild-v4/                                                   |
| Actions                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions                                           |
| Commits                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commits/main                                      |
| Master issue           | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/issues/1                                          |
| Current phase          | Phase 1 - Product Foundation and First Useful Live Preview                                                 |
| Phase gate             | **YELLOW** - awaiting the owner's Android review of the live link                                          |
| Current branch         | `main`                                                                                                     |
| Latest completed phase | Phase 0 (GREEN from the owner on 2026-09-02)                                                               |
| Work in progress       | Phase 1 review gate. No Phase 2 code has been started.                                                     |
| Latest commit          | Phase 1 build (this commit); the follow-up commit adds live verification and screenshots                   |
| Latest deployment      | Pending the Phase 1 deploy; last successful deploy before it was Phase 0 `81aeb56`                         |
| Test totals            | Unit: 95 passed (17 files). Browser/mobile: 41 passed locally (13 flows × 412 px, 360 px, desktop + 2 PWA) |
| Build marker           | Shown under the header on every screen: `Build <sha> · <UTC time> · Phase 1`                               |

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
- [ ] Interactive navigation and profile editing verified on the live Pages link (filled in after the deploy)
- [ ] Owner opens the live link on the Android phone and gives the phase decision (review gate)

## Known limitations

- The demo workout is synthetic and says so. The real generation engine and the single 15 / 30 / 45 / Default workout-length dropdown arrive in Phase 3; until then Today shows "Default: N min" as a value.
- `Start Workout` stays disabled until the active workout arrives in Phase 5. Readiness check-in arrives in Phase 6.
- Exercise preferences are stored as names; Phase 2's catalog resolves them by alias.
- Bodyweight-only home setups are accepted only once the catalog can build a bodyweight session (Phase 2/3); onboarding asks for at least one piece of home equipment when there is no gym access.
- Bundle: JS 350 KB raw / 105 KB gzip, CSS 21 KB, dist total 629 KB across 14 files.
- Playwright runs with two workers everywhere; four parallel Chromium contexts crashed the browser on the development machine.

## Mobile screenshots

Phase 0: [docs/screenshots/phase-0](docs/screenshots/phase-0) (preview sheet: [preview-sheet.png](docs/screenshots/phase-0/preview-sheet.png)).

Phase 1: captured from the deployed build after this commit's deploy; see [docs/screenshots/phase-1](docs/screenshots/phase-1).

## Next concrete action

Deploy this commit, run the browser suite against the live URL, capture Phase 1 screenshots from
the live build, update this file, and stop at the review gate. Then the owner opens the live link
on an Android phone and replies with `GREEN - NEXT PHASE`, `YELLOW - FIX: <issue>`, or
`RED - STOP`. On GREEN, Phase 2 begins: the structured exercise catalog, muscle model, movement
patterns, limitation tags, progression families, conflict validation, alternative-ranking
foundation, media manifest and licensing register, and custom exercise schemas.
