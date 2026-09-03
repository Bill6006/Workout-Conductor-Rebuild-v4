# Workout Conductor - Project Status

_Last updated: 2026-09-02 22:45 UTC_

| Item                   | Value                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Repository             | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4                                    |
| Live app (permanent)   | https://bill6006.github.io/Workout-Conductor-Rebuild-v4/                                    |
| Actions                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions                            |
| Commits                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commits/main                       |
| Master issue           | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/issues/1                           |
| Current phase          | Phase 2 - Exercise Catalog, Media, and Conflict Engine                                      |
| Phase gate             | **YELLOW** - awaiting the owner's Android review of the live link                           |
| Current branch         | `main`                                                                                      |
| Latest completed phase | Phase 1 (GREEN from the owner on 2026-09-02)                                                |
| Work in progress       | Phase 2 review gate. No Phase 3 code has been started.                                      |
| Latest commit          | Phase 2 build (this commit); the follow-up commit adds live verification and screenshots    |
| Latest deployment      | Pending the Phase 2 deploy; last successful deploy before it was Phase 1 `cdaaeb8`          |
| Test totals            | Unit: 136 passed (24 files). Browser/mobile: filled in after the local run and the live run |
| Build marker           | Shown under the header on every screen: `Build <sha> · <UTC time> · Phase 2`                |

## Phase checklist

| Phase | Name                                                         | Status               |
| ----- | ------------------------------------------------------------ | -------------------- |
| 0     | Repository, Live Pages, and Scaffold                         | GREEN (owner)        |
| 1     | Product Foundation and First Useful Live Preview             | GREEN (owner)        |
| 2     | Exercise Catalog, Media, and Conflict Engine                 | YELLOW (review gate) |
| 3     | Workout Generation and Duration Engine                       | planned              |
| 4     | Central Recalibration Engine                                 | planned              |
| 5     | Active Workout, Logging, and Superset Experience             | planned              |
| 6     | Adaptive Coach, Progression, Strategy, and Recovery          | planned              |
| 7     | Progress, Plan, Coverage, PRs, and Session Summary           | planned              |
| 8     | Data Safety, Optional Migration, PWA, Polish, and Acceptance | planned              |

## Phase 2 deliverables

- [x] Structured exercise catalog (84 exercises, `defineExercise` + `ExerciseSchema`, original instructions)
- [x] Muscle model (18 muscles, 6 groups) and movement patterns (22)
- [x] Equipment model referenced by equipment requirement groups
- [x] Limitation and joint-stress tags mapped to profile limitations
- [x] Progression families
- [x] Conflict validation (`src/engine/conflicts`, see `docs/conflict-engine.md`)
- [x] Alternative-ranking foundation (`src/engine/alternatives`)
- [x] Production-media manifest and licensing register (`docs/media-license-register.md`, 44 original placeholder diagrams)
- [x] Custom exercise, custom instruction, and custom-media schemas (IndexedDB v2 stores, included in backup and restore)
- [x] Metadata for warm-ups, drop-set safety, supersets, and Plate Math
- [x] Exercise library on the live app (search, muscle-group filter, detail sheet with demonstration, instructions, ranked alternatives, prefer / dislike)
- [x] Today demo rebuilt on the catalog with thumbnails and a per-exercise alternatives preview
- [ ] Live verification and screenshots (filled in after the deploy)
- [ ] Owner opens the live link on the Android phone and gives the phase decision (review gate)

## Known limitations

- Demonstrations are original placeholder diagrams labeled "PLACEHOLDER"; licensed production loops arrive in Phase 8 and no exercise is production-enabled until then.
- Alternatives are a preview: tap-to-replace inside a workout arrives in Phase 5 with the active workout.
- The Today workout is still the synthetic demo (catalog-backed, conflict-checked). The real generation engine and the single 15 / 30 / 45 / Default dropdown arrive in Phase 3.
- Custom exercises, instructions, and media have schemas and storage, but the creation UI arrives in Phase 5.
- `Start Workout` stays disabled until Phase 5. Readiness check-in arrives in Phase 6.
- Bundle: JS 437 KB raw / 127 KB gzip, CSS 25 KB; the catalog and placeholder media are precached with the shell (62 entries).

## Mobile screenshots

Phase 2 screenshots are captured from the deployed build at the gate and land in the follow-up
status commit under [docs/screenshots/phase-2](docs/screenshots/phase-2).

Phase 1: [docs/screenshots/phase-1](docs/screenshots/phase-1) (preview sheet: [preview-sheet.png](docs/screenshots/phase-1/preview-sheet.png)).
Phase 0: [docs/screenshots/phase-0](docs/screenshots/phase-0) (preview sheet: [preview-sheet.png](docs/screenshots/phase-0/preview-sheet.png)).

## Next concrete action

Deploy this commit, run the browser suite against the live URL, capture Phase 2 screenshots from
the live build, update this file, and stop at the review gate. Then the owner opens the live link
on an Android phone, browses the Exercise library from Settings, opens an exercise, taps an
exercise on Today to see its alternatives, and replies with `GREEN - NEXT PHASE`,
`YELLOW - FIX: <issue>`, or `RED - STOP`. On GREEN, Phase 3 begins: workout generation and the
duration engine.
