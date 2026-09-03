# Workout Conductor - Project Status

_Last updated: _

| Item                   | Value                                                                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository             | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4                                                                                                                                                                                                         |
| Live app (permanent)   | https://bill6006.github.io/Workout-Conductor-Rebuild-v4/                                                                                                                                                                                                         |
| Actions                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions                                                                                                                                                                                                 |
| Commits                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commits/main                                                                                                                                                                                            |
| Master issue           | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/issues/1                                                                                                                                                                                                |
| Current phase          | Phase 5 - Active Workout, Logging, and Superset Experience                                                                                                                                                                                                       |
| Phase gate             | **YELLOW** - Phase 5 work complete, deployed, and verified live; awaiting the owner's review on Android                                                                                                                                                          |
| Current branch         | `main`                                                                                                                                                                                                                                                           |
| Latest completed phase | Phase 4 (GREEN from the owner on 2026-09-03)                                                                                                                                                                                                                     |
| Work in progress       | Phase 5 review gate. No Phase 6 code has been started.                                                                                                                                                                                                           |
| Latest commit          | Phase 5 docs and screenshots (this commit); app build under review is `5af4611`                                                                                                                                                                                  |
| Latest deployment      | `5af4611` deployed by Deploy Pages run 33779170915 (success); full browser suite passed against the live URL (two desktop runs hit a network timeout while a screenshot capture ran alongside and passed alone); 37 screenshots captured from the deployed build |
| Test totals            | Unit: 208 passed (33 files). Browser/mobile: 75 passed + 8 skipped by design locally and against the live URL                                                                                                                                                    |
| Build marker           | Shown under the header on every screen: `Build <sha> · <UTC time> · Phase 5`                                                                                                                                                                                     |

## Phase checklist

| Phase | Name                                                         | Status               |
| ----- | ------------------------------------------------------------ | -------------------- |
| 0     | Repository, Live Pages, and Scaffold                         | GREEN (owner)        |
| 1     | Product Foundation and First Useful Live Preview             | GREEN (owner)        |
| 2     | Exercise Catalog, Media, and Conflict Engine                 | GREEN (owner)        |
| 3     | Workout Generation and Duration Engine                       | GREEN (owner)        |
| 4     | Central Recalibration Engine                                 | GREEN (owner)        |
| 5     | Active Workout, Logging, and Superset Experience             | YELLOW (review gate) |
| 6     | Adaptive Coach, Progression, Strategy, and Recovery          | planned              |
| 7     | Progress, Plan, Coverage, PRs, and Session Summary           | planned              |
| 8     | Data Safety, Optional Migration, PWA, Polish, and Acceptance | planned              |

## Phase 5 deliverables

- [x] Premium active workout screen (`src/features/workout/ActiveWorkoutScreen.tsx`): current set unmistakable, elapsed and remaining time, duration dropdown mid-workout, pause and resume, up next, whole-workout list
- [x] Reusable Set Logger (`src/components/SetLogger/SetLogger.tsx`): one-tap normal set, large dials, tap-to-type, cooldown against double taps; design rationale and tap counts in `docs/mobile-test-report.md`
- [x] Inline completed-set editing in place, Undo for the last set, persistent completion marks
- [x] Set Options (add or remove set, ramp set, skip ramp sets, rep range, reorder, split superset) routed through the engine; 23 triggers now
- [x] Rest timer: programmed rest, quick adjust, skip, next target, survives screen changes and backgrounding, freezes on pause, vibration, no sound
- [x] Demonstrations, instructions, cues, previous performance in a How-to panel; alternatives and one-exercise replacement from Options
- [x] Combined two-move superset card with round table; separate durable records per member; one list row per superset; round editing; final-round completion authority
- [x] Drop-set presentation; warm-up Add/Skip and logging that never counts as working sets
- [x] Per-exercise notes and cue memory (verified write, backed up); Plate Math with live weight
- [x] Custom exercise creator with optional user media; custom exercises resolve everywhere
- [x] Workout completion with quick rating, one verified record write, summary, and the next session generated from history
- [x] 360 px and 150 percent zoom (275 px) layouts verified in the browser suite
- [ ] Owner opens the live link on the Android phone and gives the phase decision (review gate)

## Phase 4 deliverables

- [x] One central Recalibration Engine (`src/engine/recalibration/recalibrate.ts`, see `docs/recalibration-engine.md`); no recalibration logic in components
- [x] Typed request: trigger, current workout, completed work, locked entries, current exercise, requested duration, location, equipment, preferences, limitations, recovery, performance changes, reason, timestamp
- [x] Trigger registry with 18 triggers, default scopes, and overlay messages (`src/engine/recalibration/triggers.ts`)
- [x] Local, partial, and full scopes; no full rebuild for a local change
- [x] Completed-work locking: logged sets never change; pinned, selected, accepted, and current exercises are locked
- [x] Partial recalibration through the generator's constraints (kept entries, remaining budget, no warm-up once started)
- [x] Duration recalibration before and during a workout, with elapsed time subtracted and only future rows recalculated
- [x] Equipment and location recalibration; unavailable exercises removed automatically
- [x] Session-only Equipment Busy substitution
- [x] Pain ("Hurts, protect it") and discomfort handling, session-only
- [x] Recovery recalibration from readiness (engine path; the check-in screen is Phase 6)
- [x] Remaining-session recalculation: resume, finish early, harder or easier, reps far from target, target weight
- [x] Failure rollback with a readable error and the previous workout kept; Undo for the last recalibration
- [x] Calibration overlay: immediate, tap-blocking, trigger named, evaluation list, brief transition, error state
- [x] Change summary with counts, details, and subtle marks on changed rows; unchanged rows stable
- [x] End by exact time as a hard cap when the requested length is impossible
- [x] Session persisted across reloads; recalibration log on the Workout tab
- [ ] Owner opens the live link on the Android phone and gives the phase decision (review gate)

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

## Phase 3 review-gate fix (YELLOW - FIX)

- Reported from the owner's Android phone: "Local storage is unavailable. The requested version (2) is less than the existing version (5)." Finish setup then failed with the same message.
- Cause: every GitHub Pages project of one account shares the origin `bill6006.github.io`, and IndexedDB is per origin. An earlier Workout Conductor app on the phone left a database named `workout-conductor` at version 5; this app asked for version 2 and the browser refused.
- Fix: this app's database is now `workout-conductor-v4`, and opening recovers automatically when a same-named database already exists at a higher version (open as-is, add the missing stores one version up, never remove any store). Covered by a unit test that simulates another app owning the name at version 5.
- Data written to the old name by earlier apps is left untouched.

## Known limitations

- Load targets, personal records, strength progression, and the weekly-volume effect line on the completion summary arrive with Phases 6 and 7; the record already carries everything they need.
- The readiness check-in screen arrives in Phase 6; the engine path is built.
- Vibration on rest completion depends on the phone allowing it; there is never a sound.
- Demonstrations remain original placeholder diagrams until Phase 8; user media can replace them per exercise now.

## Mobile screenshots

Phase 5, captured by Playwright from the deployed build `5af4611` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/phase-5](docs/screenshots/phase-5)).

- Combined preview sheet: [preview-sheet.png](docs/screenshots/phase-5/preview-sheet.png)
- Android 412 px (Pixel 7): [Active workout start](docs/screenshots/phase-5/android-412-workout-active-start.png) · [Set logger](docs/screenshots/phase-5/android-412-workout-set-logger.png) · [Rest timer](docs/screenshots/phase-5/android-412-workout-rest-timer.png) · [Plate Math](docs/screenshots/phase-5/android-412-workout-plate-math.png) · [Superset card](docs/screenshots/phase-5/android-412-workout-superset.png) · [Rating](docs/screenshots/phase-5/android-412-workout-rating.png) · [Completion](docs/screenshots/phase-5/android-412-workout-completion.png) · [Calibration overlay](docs/screenshots/phase-5/android-412-calibration-overlay.png) · [Today after recalibration](docs/screenshots/phase-5/android-412-today-recalibrated.png) · [Session-only actions](docs/screenshots/phase-5/android-412-today-session-actions.png) · [Today, Default time](docs/screenshots/phase-5/android-412-today.png) · [Today full page](docs/screenshots/phase-5/android-412-today-full.png) · [Workout preview](docs/screenshots/phase-5/android-412-workout.png) · [Library](docs/screenshots/phase-5/android-412-library.png) · [Exercise detail sheet](docs/screenshots/phase-5/android-412-exercise-detail.png) · [Progress](docs/screenshots/phase-5/android-412-progress.png) · [Plan](docs/screenshots/phase-5/android-412-plan.png) · [Settings](docs/screenshots/phase-5/android-412-settings.png)
- Android 360 px: [Today](docs/screenshots/phase-5/android-360-today.png) · [Workout](docs/screenshots/phase-5/android-360-workout.png) · [Progress](docs/screenshots/phase-5/android-360-progress.png) · [Plan](docs/screenshots/phase-5/android-360-plan.png) · [Settings](docs/screenshots/phase-5/android-360-settings.png)
- Desktop 1280 px: [Today](docs/screenshots/phase-5/desktop-today.png) · [Workout](docs/screenshots/phase-5/desktop-workout.png) · [Progress](docs/screenshots/phase-5/desktop-progress.png) · [Plan](docs/screenshots/phase-5/desktop-plan.png) · [Settings](docs/screenshots/phase-5/desktop-settings.png)

Phase 4: [docs/screenshots/phase-4](docs/screenshots/phase-4) · Phase 3: [docs/screenshots/phase-3](docs/screenshots/phase-3) · Phase 2: [docs/screenshots/phase-2](docs/screenshots/phase-2) · Phase 1: [docs/screenshots/phase-1](docs/screenshots/phase-1) · Phase 0: [docs/screenshots/phase-0](docs/screenshots/phase-0).

## Next concrete action

Owner opens the live link on an Android phone, starts the workout from Today, logs sets with one
tap, corrects one in place, uses the rest timer, reaches the superset card, pauses and resumes,
finishes with a rating, reads the summary, taps Done, and replies with `GREEN - NEXT PHASE`,
`YELLOW - FIX: <issue>`, or `RED - STOP`. On GREEN, Phase 6 begins: adaptive coach, progression,
strategy, and recovery.
