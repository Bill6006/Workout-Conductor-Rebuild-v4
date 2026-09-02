# Workout Conductor - Project Status

_Last updated: 2026-09-02 21:10 UTC_

| Item                   | Value                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository             | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4                                                                                                                               |
| Live app (permanent)   | https://bill6006.github.io/Workout-Conductor-Rebuild-v4/                                                                                                                               |
| Actions                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions                                                                                                                       |
| Commits                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commits/main                                                                                                                  |
| Master issue           | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/issues/1                                                                                                                      |
| Current phase          | Phase 1 - Product Foundation and First Useful Live Preview                                                                                                                             |
| Phase gate             | **YELLOW** - awaiting the owner's Android review of the live link                                                                                                                      |
| Current branch         | `main`                                                                                                                                                                                 |
| Latest completed phase | Phase 0 (GREEN from the owner on 2026-09-02)                                                                                                                                           |
| Work in progress       | Phase 1 review gate. No Phase 2 code has been started.                                                                                                                                 |
| Latest commit          | Phase 1 build `6de52d2` plus this first-run scroll fix; the follow-up commit adds the screenshots                                                                                      |
| Latest deployment      | Deploy Pages run [33680317024](https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions/runs/33680317024): success, 2026-09-02 20:38 UTC, build marker `6de52d2 · Phase 1`     |
| Test totals            | Unit: 95 passed (17 files). Browser/mobile: 37 passed + 4 skipped by design (extra capture flows run on the 412 px project only); 41 passed against the live URL before the scroll fix |
| Build marker           | Shown under the header on every screen: `Build <sha> · <UTC time> · Phase 1`                                                                                                           |

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

Phase 1 screenshots are captured from the deployed build of this commit and land in the
follow-up status commit under [docs/screenshots/phase-1](docs/screenshots/phase-1) (onboarding
steps, all five tabs, the Add-a-place sheet, and the import preview sheet on 412 px, plus 360 px
and desktop tab captures and a combined preview sheet).

Phase 0: [docs/screenshots/phase-0](docs/screenshots/phase-0) (preview sheet: [preview-sheet.png](docs/screenshots/phase-0/preview-sheet.png)).

## Next concrete action

Owner opens the live link on an Android phone, walks through setup (or taps "Use defaults and
skip setup"), checks Today, Plan, and Settings, and replies with `GREEN - NEXT PHASE`,
`YELLOW - FIX: <issue>`, or `RED - STOP`. On GREEN, Phase 2 begins: the structured exercise
catalog, muscle model, movement patterns, limitation and joint-stress tags, progression families,
conflict validation, alternative-ranking foundation, media manifest and licensing register, and
custom exercise schemas.
