# Workout Conductor - Project Status

_Last updated: _

| Item                   | Value                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository             | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4                                                                                                                                                              |
| Live app (permanent)   | https://bill6006.github.io/Workout-Conductor-Rebuild-v4/                                                                                                                                                              |
| Actions                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions                                                                                                                                                      |
| Commits                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commits/main                                                                                                                                                 |
| Master issue           | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/issues/1                                                                                                                                                     |
| Current phase          | Plan complete (Phases 0 to 8 GREEN); Maintenance 1 GREEN. Maintenance 2, in-session autoregulation and estimated-max targets, in progress                                                                             |
| Phase gate             | Maintenance 1 **GREEN** (owner approved on Android, 2026-09-05). Maintenance 2 in progress; no gate yet                                                                                                               |
| Current branch         | `main`                                                                                                                                                                                                                |
| Latest completed phase | Phase 6 (GREEN from the owner on 2026-09-03)                                                                                                                                                                          |
| Work in progress       | Maintenance 2: remaining sets of an exercise adjust from the reps and RIR just logged; targets after a break or for a new variation come from the estimated max. Report to follow in `docs/reports/maintenance-2.md`. |
| Latest commit          | Maintenance 1 status, report, and screenshots (this commit); app build under review is `223c767`                                                                                                                      |
| Latest deployment      | `223c767` deployed by Deploy Pages run 33941004535 (success); full browser suite passed against the live URL (114 passed + 14 skipped by design); 49 screenshots captured from the deployed build                     |
| Test totals            | Unit: 305 passed (56 files). Browser/mobile: 114 passed + 14 skipped by design locally and against the live URL                                                                                                       |
| Build marker           | Shown under the header on every screen: `Build <sha> · <UTC time> · Phase 7`                                                                                                                                          |

## Phase checklist

| Phase | Name                                                         | Status        |
| ----- | ------------------------------------------------------------ | ------------- |
| 0     | Repository, Live Pages, and Scaffold                         | GREEN (owner) |
| 1     | Product Foundation and First Useful Live Preview             | GREEN (owner) |
| 2     | Exercise Catalog, Media, and Conflict Engine                 | GREEN (owner) |
| 3     | Workout Generation and Duration Engine                       | GREEN (owner) |
| 4     | Central Recalibration Engine                                 | GREEN (owner) |
| 5     | Active Workout, Logging, and Superset Experience             | GREEN (owner) |
| 6     | Adaptive Coach, Progression, Strategy, and Recovery          | GREEN (owner) |
| 7     | Progress, Plan, Coverage, PRs, and Session Summary           | GREEN         |
| 8     | Data Safety, Optional Migration, PWA, Polish, and Acceptance | GREEN         |

## Phase 7 deliverables

- [x] Workout history with full per-set detail, substitutions, rating, records, pain, and exercise notes (Progress)
- [x] Muscle volume with direct and indirect weekly coverage and priority-muscle target bands (Progress and Plan)
- [x] Estimated strength, exercise progress and ranking, consistency, and duration efficiency (`src/engine/scoring/analytics.ts`, see `docs/progress-and-plan.md`)
- [x] Personal-record detection with compact badges during the workout, on the summary, in history, and on Progress (`src/engine/scoring/personalRecords.ts`)
- [x] Weekly planning and recovery balance (`src/engine/planning/weeklyPlan.ts`); saved workouts (database version 3, backed up)
- [x] Explanation panels with definition, evidence, sample count, and confidence on every score
- [x] Session Summary with completed work, PRs, muscles trained, recovery note, substitutions, next targets, and next focus
- [ ] Owner opens the live link on the Android phone and gives the phase decision (review gate)

## Phase 6 deliverables

- [x] Progression engine (`src/engine/progression/progression.ts`, see `docs/progression-engine.md`): double, weight, rep, and set progression, micro-deload, regression, maintain, family continuity, equipment increments; load targets on every card
- [x] Readiness check-in on Today and in the workout; recovery adjustments through the existing readiness recalibration
- [x] Fatigue interpretation (`src/engine/recovery/fatigue.ts`) feeding progression, strategy, and the coach
- [x] Performance recalibration, pain handling, next-target recommendations with "Why this target"
- [x] Actual-completed-record truth and manual-edit protection (flags on entries the engines never override)
- [x] One gold Adaptive Coach card with Coach Conductor priority arbitration, one action maximum, concise Why evidence
- [x] Two-move superset coaching from logged rounds only; incomplete drafts excluded; duration- and readiness-aware evidence
- [x] Multi-session strategy (`src/engine/strategy/strategy.ts`): load, rep, fatigue, recovery, fit, and coverage plateau diagnosis with user-controlled recommendations
- [x] Intelligent rest recommendations; safe optional drop-set recommendations; session feedback on completion
- [x] Nothing auto-applied: swaps, deloads, extra sets, and drop sets all require a tap (major ones a second tap)
- [ ] Owner opens the live link on the Android phone and gives the phase decision (review gate)

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

## Phase 7 review-gate fix (YELLOW - FIX)

- Reported from the owner's phone: the exercise card showed no demonstration, no tempo or visual cue, the set list took most of the screen, and the right side of each set row was empty.
- Later rounds: RIR and rest targets now carry their evidence (effort and rest lines in the tempo detail and the How to panel; ramp sets labelled warm-up beside their RIR; three hypertrophy rest defaults raised to match the research; header line ends at the reps); the card demonstration plays the same loop as the details and shows your own GIF, photo, or video picked from the details view (on device, 3 MB, Replace and Remove); Pause and Replay are gone; the rating step offers End without saving behind a Discard this workout? confirmation. See `docs/tempo-guidance.md` and `docs/media-license-register.md`.
- Fix: a larger demonstration (96 × 72) sits at the top right of every card and opens the full demonstration; a tempo chip under it and a one-rep tempo bar in the header (the fill moves like the weight: down at the lowering pace, hold, up at the lifting pace, squeeze) reveal the reason, a one-line form cue, and the evidence on tap (tempo modelled as phases with research-backed reasons, see `docs/tempo-guidance.md`); the equipment line is gone from the card header; logged and current rows stay open while the remaining sets collapse into one expandable line; the right column carries the current set's target load (or "log below"), and each upcoming set's load and rest when expanded.

## Phase 8 deliverables (GREEN)

- Full Backup JSON schema 2: profile, places, settings, workouts, notes and cues, custom exercises, your demonstrations, saved workouts, meta; schema 1 files migrate forward; unknown fields kept at every level; history and settings exports on their own (`docs/backup-and-restore.md`).
- Exact restore with verified writes and a verified rollback; the pre-import state is kept as an automatic backup so any import can be undone; restore reports counts per store.
- Automatic local backups after each finished workout, before each import, and on demand; the newest three stay on the device; each previews and restores like a file.
- Storage and save check: usage and quota, persistence, record counts, last verified save, a write/read-back/verify probe, and a request for persistent storage.
- Safe cleanup, previewed first: only a leftover probe, a finished onboarding draft, and old automatic backups; protected data proven untouched by test.
- Optional legacy import: a forgiving JSON export shape, previewed with matched and skipped exercises, written with verified saves after a backup, undone exactly from a receipt.
- Service-worker update safety: Reload is withheld during an active workout; the viewport lets the Android keyboard resize the layout.
- Accessibility: axe sweep over every screen, the active workout, and the details sheet (no serious or critical findings); subtle text raised to 4.5:1; tab list fixed.
- Zoom and width sweep: 360, 375, 412, 430 px at 100, 115, 130, 150 percent, as desktop page zoom and as phone text scaling; bottom navigation and set rows shrink correctly.
- Demonstration coverage test, database version 4 with a backups store, Phase 8 report (`docs/reports/phase-8.md`), and the cutover report against the acceptance rules (`docs/cutover-report.md`).

## Maintenance 1: coaching by experience, and stall routes (GREEN)

- The experience level in Settings now drives a coaching policy: beginners get explained cards, three reasons, the footer, the "follow today's plan" card, and every progression nudge; intermediate and advanced lifters get two reasons, no footer, one quiet line when nothing outranks the plan, and no card that only restates a target ("load goes up", "ready for more load", "aim one rep higher", superset readouts). Deloads, resets, extra-set offers, safety, recovery, coverage, and stalls speak to everyone.
- Progression follows the policy: advanced lifters bank two clean strength sessions (floor cleared with reps in reserve, no tolerance under the prescribed RIR) and two top-of-range sessions in double progression before load moves; the "Why this target" line names the policy.
- Stalls are read by exposure: the newest 3 (beginner) or 4 exposures with no better estimated max, at the prescribed effort. Sets ending far from failure are diagnosed as undershooting with the next load step on offer; missed reps stay with the deload rules; a top-of-range session is left to progression.
- A stalled lift opens a route on the one gold card: shift the rep range, swap for a variation, short deload, add a set. Each step is the card's one action; tapping records it; after two more flat exposures the next step is offered; when the max moves the route closes. Routes live in the meta store and are backed up.
- No new buttons or surfaces. Report: `docs/reports/maintenance-1.md`; engine notes in `docs/progression-engine.md`.

## Known limitations

- Progress scores need records: with none logged the cards show their definitions and "none" confidence until sessions accumulate.
- Trends and rankings need at least three sessions per lift; the first session of a lift is its baseline and never a record.
- Vibration on rest completion depends on the phone allowing it; there is never a sound.
- Demonstrations are original placeholder diagrams (one animated loop per movement pattern); your own GIF, photo, or video replaces them per exercise.
- Automatic backups include your demonstrations inline, so three of them cost about three times the size of your media.

## Mobile screenshots

Maintenance 1, captured by Playwright from the deployed build `223c767` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-1](docs/screenshots/maintenance-1)): [Stall route on the coach card](docs/screenshots/maintenance-1/android-412-today-coach-stall-route.png) · [After the first step](docs/screenshots/maintenance-1/android-412-today-coach-stall-applied.png) · [Quiet coach line](docs/screenshots/maintenance-1/android-412-today-coach-card.png) · [Combined preview sheet](docs/screenshots/maintenance-1/preview-sheet.png).

Phase 8, captured by Playwright from the deployed build `5691ed7` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/phase-8](docs/screenshots/phase-8)): [Settings with backups, automatic backups, and storage check](docs/screenshots/phase-8/android-412-settings-data-safety.png) · [Legacy import preview](docs/screenshots/phase-8/android-412-settings-legacy-preview.png) · [Import preview](docs/screenshots/phase-8/android-412-settings-import-preview.png) · [Combined preview sheet](docs/screenshots/phase-8/preview-sheet.png); the full set is in the folder.

Phase 7, captured by Playwright from the deployed build `584a5b8` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/phase-7](docs/screenshots/phase-7)).

- Combined preview sheet: [preview-sheet.png](docs/screenshots/phase-7/preview-sheet.png)
- Android 412 px (Pixel 7): [Progress after a workout](docs/screenshots/phase-7/android-412-progress-after-workout.png) · [History detail](docs/screenshots/phase-7/android-412-progress-history-detail.png) · [Progress with explained scores](docs/screenshots/phase-7/android-412-progress-scores.png) · [Plan with the week and a saved workout](docs/screenshots/phase-7/android-412-plan-week-and-saved.png) · [Completion with records, recovery, and next targets](docs/screenshots/phase-7/android-412-workout-completion.png) · [Adaptive Coach card](docs/screenshots/phase-7/android-412-today-coach-card.png) · [Readiness check-in](docs/screenshots/phase-7/android-412-today-readiness-check-in.png) · [Active workout start](docs/screenshots/phase-7/android-412-workout-active-start.png) · [How to sheet with Your GIF](docs/screenshots/phase-7/android-412-workout-how-to-sheet.png) · [Your own GIF on the exercise](docs/screenshots/phase-7/android-412-workout-own-gif.png) · [Set logger](docs/screenshots/phase-7/android-412-workout-set-logger.png) · [Rest timer](docs/screenshots/phase-7/android-412-workout-rest-timer.png) · [Superset card](docs/screenshots/phase-7/android-412-workout-superset.png) · [Calibration overlay](docs/screenshots/phase-7/android-412-calibration-overlay.png) · [Today, Default time](docs/screenshots/phase-7/android-412-today.png) · [Today full page](docs/screenshots/phase-7/android-412-today-full.png) · [Workout preview](docs/screenshots/phase-7/android-412-workout.png) · [Library](docs/screenshots/phase-7/android-412-library.png) · [Progress](docs/screenshots/phase-7/android-412-progress.png) · [Plan](docs/screenshots/phase-7/android-412-plan.png) · [Settings](docs/screenshots/phase-7/android-412-settings.png)
- Android 360 px: [Today](docs/screenshots/phase-7/android-360-today.png) · [Workout](docs/screenshots/phase-7/android-360-workout.png) · [Progress](docs/screenshots/phase-7/android-360-progress.png) · [Plan](docs/screenshots/phase-7/android-360-plan.png) · [Settings](docs/screenshots/phase-7/android-360-settings.png)
- Desktop 1280 px: [Today](docs/screenshots/phase-7/desktop-today.png) · [Workout](docs/screenshots/phase-7/desktop-workout.png) · [Progress](docs/screenshots/phase-7/desktop-progress.png) · [Plan](docs/screenshots/phase-7/desktop-plan.png) · [Settings](docs/screenshots/phase-7/desktop-settings.png)

Phase 7: [docs/screenshots/phase-7](docs/screenshots/phase-7) · Phase 6: [docs/screenshots/phase-6](docs/screenshots/phase-6) · Phase 5: [docs/screenshots/phase-5](docs/screenshots/phase-5) · Phase 4: [docs/screenshots/phase-4](docs/screenshots/phase-4) · Phase 3: [docs/screenshots/phase-3](docs/screenshots/phase-3) · Phase 2: [docs/screenshots/phase-2](docs/screenshots/phase-2) · Phase 1: [docs/screenshots/phase-1](docs/screenshots/phase-1) · Phase 0: [docs/screenshots/phase-0](docs/screenshots/phase-0).

## Next concrete action

Owner opens the live link on an Android phone, sets experience to Advanced in Settings, and reads
that Today's coach becomes one quiet line when nothing outranks the plan and never repeats a target;
then imports an older export with four sessions of one bench load at the prescribed effort, reads the
stall card and its route, taps the first step, and sees the bench target change for the session.
Reply with `GREEN - NEXT PHASE`, `YELLOW - FIX: <issue>`, or `RED - STOP`.
