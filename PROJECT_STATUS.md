# Workout Conductor - Project Status

_Last updated: 2026-09-03 02:20 UTC_

| Item                   | Value                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Repository             | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4                                    |
| Live app (permanent)   | https://bill6006.github.io/Workout-Conductor-Rebuild-v4/                                    |
| Actions                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions                            |
| Commits                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commits/main                       |
| Master issue           | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/issues/1                           |
| Current phase          | Phase 3 - Workout Generation and Duration Engine                                            |
| Phase gate             | **YELLOW** - awaiting the owner's Android review of the live link                           |
| Current branch         | `main`                                                                                      |
| Latest completed phase | Phase 2 (GREEN from the owner on 2026-09-03)                                                |
| Work in progress       | Phase 3 review gate. No Phase 4 code has been started.                                      |
| Latest commit          | Phase 3 build (this commit); the follow-up commit adds live verification and screenshots    |
| Latest deployment      | Pending the Phase 3 deploy; last successful deploy before it was Phase 2 `be4bee3`          |
| Test totals            | Unit: 152 passed (26 files). Browser/mobile: filled in after the local run and the live run |
| Build marker           | Shown under the header on every screen: `Build <sha> · <UTC time> · Phase 3`                |

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
- [ ] Live verification and screenshots (filled in after the deploy)
- [ ] Owner opens the live link on the Android phone and gives the phase decision (review gate)

## Known limitations

- Load targets stay empty until the progression engine (Phase 6); sets show reps and RIR targets only.
- Changing the length regenerates the not-yet-started session. Recalibrating a started workout (locked completed work, calibration overlay, change summary, End-by time) is Phase 4.
- `Start Workout` stays disabled until the active workout in Phase 5; there is no history yet, so weekly volume starts from the plan defaults and confidence reads "low" until sessions are logged.
- Demonstrations remain original placeholder diagrams until Phase 8.

## Mobile screenshots

Phase 3 screenshots are captured from the deployed build at the gate and land in the follow-up
status commit under [docs/screenshots/phase-3](docs/screenshots/phase-3).

Phase 2: [docs/screenshots/phase-2](docs/screenshots/phase-2) · Phase 1: [docs/screenshots/phase-1](docs/screenshots/phase-1) · Phase 0: [docs/screenshots/phase-0](docs/screenshots/phase-0).

## Next concrete action

Deploy this commit, run the browser suite against the live URL, capture Phase 3 screenshots from
the live build, update this file, and stop at the review gate. Then the owner opens the live link
on an Android phone, changes the workout length between 15 / 30 / 45 / Default and watches the
session rebuild, opens "Why this workout", checks the Workout tab list, and replies with
`GREEN - NEXT PHASE`, `YELLOW - FIX: <issue>`, or `RED - STOP`. On GREEN, Phase 4 begins: the
central recalibration engine.
