# Workout Conductor - Project Status

_Last updated: 2026-09-24_

| Item                   | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository             | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Live app (permanent)   | https://bill6006.github.io/Workout-Conductor-Rebuild-v4/                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Actions                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Commits                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commits/main                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Master issue           | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/issues/1                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Current phase          | Plan complete (Phases 0 to 8 GREEN); Maintenance 1 to 3, 6, 7, 12, 13, 18, 19, 20, 22, and 23 GREEN; 4, 5, 8, 9, 10, 11, 14, 15, 16, 17, 21, and 24 at their review gates                                                                                                                                                                                                                                                                                                                                                 |
| Phase gate             | Maintenance 24 **YELLOW** (issue #25), awaiting the owner's review. Maintenance 23 **GREEN** from the owner on 2026-09-24 (issue #24). Maintenance 21 YELLOW (issue #22). Maintenance 4, 5, 8, 9, 10, 11, 14, 15, 16, and 17 YELLOW (reviews still open)                                                                                                                                                                                                                                                                  |
| Current branch         | `main`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Latest completed phase | Phase 6 (GREEN from the owner on 2026-09-03)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Work in progress       | Maintenance 24, round F, the rebuilds and the coach (the owner's items 33, 34, and 35), awaiting the owner's review on the phone (issue #25). Agreed and waiting: 1, 3, 4, 6 to 8, 10 to 12, 14, and 30 to 32                                                                                                                                                                                                                                                                                                             |
| Latest commit          | Maintenance 24 status, report verification, and live captures (this commit); the live app build it deploys is the same app code as `6d1b105`                                                                                                                                                                                                                                                                                                                                                                              |
| Latest deployment      | `6d1b105` deployed by Deploy Pages run 36176742471 (success); browser suite against the live URL: 312 passed + 14 skipped by design; one data-safety test timed out once at its first page load and passed 3 of 3 reruns, and the 2 installed-app tests it held back passed on their own                                                                                                                                                                                                                                  |
| Test totals            | Unit: 1176 passed (163 files). Browser/mobile: 315 passed + 14 skipped by design, none failed, locally in the gate (its first run had 4 fail at their first page load, net::ERR_ABORTED from the local preview server, and 2 not run); against the live URL: 312 passed + 14 skipped by design; one data-safety test timed out once at its first page load and passed 3 of 3 reruns, and the 2 installed-app tests it held back passed on their own. Reverts: 348 of 348 caught (174 this round, 174 from Maintenance 23) |
| Build marker           | Shown under the header on every screen: `Build <sha> · <UTC time> · Phase 8`                                                                                                                                                                                                                                                                                                                                                                                                                                              |

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

## Maintenance 24: round F, the rebuilds and the coach (YELLOW - awaiting review)

- Built on the owner's word (2026-09-24): "Green next" (Maintenance 23) and "Yes approved proposals and your recommendations as long as 34 and 33 are backed by research and evidence". The owner's items 33, 34 and 35. Review issue #25, build `6d1b105`.
- 33: when a short session cannot fit every exercise, the main lifts stay and an isolation exercise gives way first: one whose muscles the main lifts train first, the day's only work for a muscle later (core work counts as that), lower-back work last. A main lift gives way only once no isolation exercise is left, for a move that fits in its place; with none, the main lift stays alone and takes back the sets the fit trimmed, each where it sat. Moves left out come back on their own while the minutes allow, and say so at fewer sets. A circuit's count of rounds is the rounds it runs. Default lengths unchanged. Research: `docs/research/short-sessions.md` (Iversen et al. 2021, PMID 34125411; Gentil et al. 2013, PMID 23537028; de França et al. 2015, PMID 26244600; Gentil, Fisher and Steele 2017, PMID 27677913; Mannarino et al. 2021, PMID 31268995).
- 34: a correction first: the app has no "Make it harder" or "Make it easier" button; the setting a lifter sees is the check-in. Every rebuild of the rest of the workout keeps a low check-in's set fewer and extra rep in reserve; a check-in reaches every lift not begun that the plan keeps (the lift in front, a pinned or swapped-in lift), fitted to the time, keeping a count or ramp set by hand; a check-in back to fine brings the planned sets back; the words say what the check-in changed, never what the fit to time did, and name a sore joint only where a lift it rules out left or stopped. A plan built again for a coach focus, a deload week or a kept swap stopped keeps today's choices; a plan still on the screen from an earlier day holds none of that day's. Research: `docs/research/effort-setting.md` (Zhang et al. 2021, PMID 33776802; Larsen, Kristiansen and van den Tillaar 2021, PMID 33520457; Pelland et al. 2026, PMID 41343037; Schoenfeld, Ogborn and Krieger 2017, PMID 27433992; Robinson et al. 2024, PMID 38970765; Refalo et al. 2023, PMID 36334240).
- 35: a weight the coach offers is one ordinary step onto what the place makes today, missing plates counted; a card whose step the place cannot make, or the plan already took, is left out; no step up on a lighter day the plan chose or a lighter weight set by hand (the coach's own deload among them); a stalled lift's route passes over a step the weights here cannot give; a route step that cannot be saved stays for now and the app says so; a deload week holds back everything that pushes for more; the exercise the coach adds is fitted like a pick of the plan.
- Twenty independent reviews in seven passes (two of the fifth pass run again after a session limit); every finding was checked against the code. Each fix has a test that fails when that fix alone is taken back out (174 reverts this round, 348 with Maintenance 23's, all caught). The last fixes (the fifth pass's reruns and the sixth pass) have had no further independent review.
- Report: `docs/reports/maintenance-24.md` (things to settle, known limits, proposed).

## Maintenance 23: round E, bodyweight lifts and effort (GREEN)

- GREEN from the owner on 2026-09-24 (issue #24), given on build `db22916`.
- Built on the owner's word (2026-09-24): "Proposed approved. GREEN - NEXT PHASE" (Maintenance 22). The owner's items 2, 5, 21, 22, 24, 25, 26 and 27. Review issue #24, build `db22916`.
- 2: no drop set on a lift with no weight to drop (bodyweight, a band, Bench Dip, Step-Up) or on a core stability move (Plank, Dead Bug, Ab Wheel Rollout, Pallof Press); a core stability move keeps 2 reps in reserve under every style, also after "Make it harder", and its effort row says so.
- 5: the "Allow drop sets" switch reads "At most one a workout, on an isolation move that suits it. Lean-down and Foundation plan none."
- 21: a muscle-building set more than 10% lighter than asked runs to its planned reps in reserve, never past 30 reps, and the line says so; strength sets keep one to three extra reps. Each such set records what it stood in for, so the next session counts it toward that load and range, judged against the reps it showed; a push short of the effort holds the load asked. The rule holds through the plan, a swap, a change of weights or of place, a max, autoregulation, a weight the coach sets and reps set by hand. Research: `docs/research/lighter-loads.md` (Schoenfeld et al. 2017, PMID 28834797; Robinson et al. 2024, PMID 38970765).
- 22: a lift at bodyweight gets one warm-up set of a few easy reps ("A few easy reps", "Stop well short"); "+ Ramp set" adds no second one.
- 24: back after 21 days or more, a lift at bodyweight starts at the bottom of its range with a rep more in reserve (two after 42 days); misses from before a break stop counting.
- 25 to 27: no "No weights logged yet" under a lift at bodyweight; the muscle-building tempo reads "lower for 3 under control, no pause, up smoothly" (Amdi and King, 2025); the strength tempo says "drive up as fast as you can" once.
- Ten independent reviews confirmed 89 problems. Each fix has a test that fails when that fix alone is taken back out (174 reverts, all caught); what is left is listed in the report's known limits.
- Report: `docs/reports/maintenance-23.md` (known limits). The owner approved Proposed 33, 34 and 35 on 2026-09-24, now Agreed, 33 and 34 on the condition that research backs them: `docs/research/short-sessions.md` (33: the main lifts stay and an isolation exercise gives way first) and `docs/research/effort-setting.md` (34: every rebuild keeps Make it harder or easier). 35: the coach's offers respect the weights at the place and a deload week.

## Maintenance 22: round D, swaps you can trust (GREEN)

- GREEN from the owner on 2026-09-24 (issue #23), given on build `95fe897`.
- Built on the owner's word (2026-09-23): "Proposed are approved. Please proceed with the next phase/round. Make sure to keep thing intelligent." The owner's items 29, 28 and 23. Review issue #23, build `95fe897`.
- 29, a swap once sets are logged: the started exercise stops at what it logged, and those sets stay under its own name; the new exercise follows right after for the working sets still to come, with its own target (its own history, today's work, a deload week and the day's fatigue, weights the place has), so dumbbells no longer ask for a barbell's weight in each hand and a Leg Press Calf Raise after a bodyweight set no longer asks for no weight. Swapping back picks the first exercise up again. A superset keeps its pairing until its rounds start. The summary reads as one swap. Undo of the swap is offered until a set is logged on the new exercise.
- 28, the rest of the Smith machine fix: a stopped exercise says so on Today ("Stopped: 1 of 4 sets done"), with no Main lift badge, and its sheet says which exercise took over, with nothing to change on it; back at a place with the machine, an exercise the place stopped picks up again for the sets still owed. An exercise swapped out stays stopped until it is swapped back.
- 23, a swap kept for a few weeks: "Keep it for the next 4 weeks" in an exercise's sheet, off by default. The plan uses the swapped-in exercise wherever the swapped-out one would go and it fits; the swapped-out one is kept out of every slot and the coach's offers (the next best goes in when the swap-in cannot join, the plan's own pick when nothing else fits). The Plan tab lists each kept swap with its end date and Stop; Undo on the swap takes back only what that swap did. "Why this workout" names each kept swap it used. Research: `docs/research/lasting-swaps.md`.
- Seven independent reviews found 52 problems; 50 are fixed, each with a test that fails without its fix (every fix was also taken out alone to see its test fail), and 2 are known limits in the report. Among them: Undo that could lose or misfile a logged set, kept-swap saves that could disagree with the Plan tab, and explanation lines that could go stale.
- Report: `docs/reports/maintenance-22.md` (with two known limits, both needing storage failures or a save slower than an Undo and a new swap).

## Maintenance 21: round C, the coach card and quick fixes (YELLOW - awaiting review)

- Built on the owner's GREEN for Maintenance 20. The owner's items 15 to 20. Review issue #22, build `5c2aee6`.
- 15, the coach talks only about the workout on the screen: a note about one lift (a stall, a strategy note, "keeps getting swapped") shows only when that lift is in today's workout, in every state; notes about the day, week or programme are unchanged. On a leg day the one card no longer reads "Chin-Up is stalling at bodyweight".
- 16, Not now on every card: a card with nothing to tap is set aside for this workout, like a safety card, never remembered for days. A pending "Confirm:" belongs to the card and action it was started on.
- 17, advice that works without weight: a bodyweight lift short of today's floor twice keeps its target ("try fewer reps over more sets"), never a 10% deload; on a day with the lift the coach offers "N sets of a-b today" (one more set of fewer reps, ramps within the range) and names Lat Pulldown only where it fits. Also fixed under the same rule: a Push-Up no longer takes about 150 lb from bench history, a 0 on a bodyweight lift reads as the bodyweight, and one no-weight test (no load reference) is used everywhere, Bench Dip and Step-Up included.
- 18, capped strength sets keep the fast lift (3-1-X-0); 19, the lowering note cites Amdi and King 2025 (PMID 40692176) instead of Roig 2009; 20, the dial hints are short ("Target 4-6", "Easy, RIR 5", "Aim 8-12") and wrap instead of being cut off.
- Three adversarial review passes before shipping; every confirmed finding is fixed with a test that fails without its fix. Among them, a finished workout offers no tap that would change it (a stall-route step tapped there used to be recorded as applied, a defect older than this round), a put-away offer no longer holds the day's offer place, and one lift gets one offer.
- Fix from the owner's review (2026-09-23, build `4bce35a`): a Smith Machine Squat started at the gym, then the place changed to Home and changed again, lost the Home squat that carried its sets (Maintenance 19's code: the first move was right, any later rebuild dropped the stand-in or moved it to the end). A stopped exercise now keeps the sets it still owed, and every later rebuild (place, length, a pause) puts an exercise that fits right after it with those sets; a stand-in already started stays where it is with no second one; a plan stopped by the older code gets its stand-in back at its next rebuild. Only the part the owner called critical; picking up again where the machine is, and a stopped exercise that says so, stay Proposed (28).
- Report: `docs/reports/maintenance-21.md`.

## Maintenance 20: round B, pain you can trust and a hold timer (GREEN)

- GREEN from the owner on 2026-09-23 (issue #21), given on build `2894aad`.
- Built on the owner's GREEN for Maintenance 19. The owner's items 3 and 1. Review issue #21, build `2894aad`.
- 3, pain: the rating stored only pain yes or no, so the next workout named any exercise that had been in that workout (Chin-ups) as the pain. The end-of-workout sheet now asks No pain / Some pain, and Where? for Some pain; the joint is saved. The next workout's coach card names the joint, an exercise of today's that loads it and where the report came from, with the swap as its one action; the alternatives and the coach's added exercises keep away from it until the next saved workout. Pain without a joint names nothing; the summary says it once.
- 1, holds: Plank and Farmer Carry are timed, their seconds kept in the reps fields. The logger shows Seconds and no RIR, Start hold counts down with Stop, and the seconds held fill the dial. The countdown lives on the workout (Pause, reload), ends a running rest, plays the rest's ticks and end tone, and keeps the screen awake only while it counts. Seconds grow by five once every set reaches them; at the top a carry takes the next real weight from the bottom. Holds stay out of the estimated max, records, volume and the coach's rep cards.
- An adversarial review (four lenses, each finding checked by a skeptic) confirmed 17 defects in the first build of the round; all were fixed before it shipped.
- Report: `docs/reports/maintenance-20.md`.

## Maintenance 19: round A, what happens mid-workout (GREEN)

- GREEN from the owner on 2026-09-22 (issue #20), given on build `9fd2794`.
- The owner's items 6, 5 and 4, with Proposed 13, which the plan included in Round A.
- 6, a place change mid-workout: a rebuild checked each candidate together with the logged exercises, and a barbell lift logged at the gym does not fit Home, so every candidate was refused and the rest of the session deleted. Now a candidate is kept out only by a conflict it is part of (`blocksCandidate`); an exercise started at the gym that Home cannot equip ends at its logged sets and a Home move takes the sets it owed, right after it; a rest running through the rebuild names the new next set.
- 5, weights the plates can make: a bar loads exactly what its plates make (every total, from the rack's plates); a target they cannot make comes down to the weight under it, with the reps that keep the effort and one line by the target, "No 2.5s today: 95 instead of 100, two extra reps."; a started exercise is re-fitted too, logged sets untouched, and goes back when the plate returns; the dial starts from the re-fitted target and steps between real weights; the plate line reads "Bar 45 + 45, 10 each side · 155 lb" and "(5 lb short)" is gone.
- 4, Not now on a safety card sets that worry aside for this workout; a new one still shows, and the next workout starts clean. 13, Up next names the exercise of the next set not yet done.
- Report: `docs/reports/maintenance-19.md`.

## Maintenance 18: the gym barcode (GREEN)

- GREEN from the owner on 2026-09-22 (issue #19), given on the second build `c4966f5`.
- From the owner: starting a workout at the gym brings up the membership barcode so it can be scanned, with an X in case it was already scanned, and a setting to stop it popping up.
- One popup for the barcode: Plan, Where you train, Barcode on a place's row (every place but Home) opens it to add a screenshot from the gym's app or a photo of the card; it saves on the pick. The same popup comes up as a workout starts there and from Today's Show barcode, before and during the workout. A tap on the barcode puts it full screen on white with a large X, the screen kept awake; the X goes back to the popup, Done closes it, and the phone's Back steps back one view at a time. The switch "Show when I start a workout here" turns the popup at Start off.
- Where the phone can read the code (Chrome on Android), the app keeps it and redraws it for full screen: black on white, full width, the number under it. Code 128, Code 39, Code 93, Codabar, ITF, EAN-13, EAN-8, UPC-A, UPC-E and QR; anything else shows as the picture.
- Changed after review: it first sat under the equipment in Edit Gym (moved to its own popup), its Show button went (the barcode itself opens full screen), and on the first build's review Start and Show barcode now open the popup first instead of full screen, with "Stays on this phone" gone.
- Device only: the `device` store (database version 6) is never synced, never in a backup, a snapshot, or an export, and a restore leaves it alone. Reading gives up after six seconds and keeps the picture; full screen falls back to the picture if the drawing is slow.
- Cannot: pop up on arrival (no background location for a web app) or raise the brightness. The camera-to-drawn-code path ran with a stand-in reader here; it needs one try on the phone.
- Report: `docs/reports/maintenance-18.md`.

## Maintenance 17: a workout in progress survives the app reopening, hotfix (YELLOW - awaiting review)

- From the owner: he trained at the gym, drove home, and his workout was gone, not in History and not resumable; he had not cancelled it.
- Found: the stored-session reader validated each exercise's target note against a hand-copied list that never got the two kinds added on 2026-09-05 ('return' after three weeks off, and 'estimate' from a related lift or a new rep range). A workout carrying one could not be read back when the app reopened, and the app then made a fresh workout and saved it over the old one. Maintenance 15 made the 'estimate' kind common. Reproduced end to end. The day's session could not be recovered: a workout in progress lives only on the phone and only finished workouts reach the cloud copy and backups.
- One list, used by both: `PROGRESSION_MODES` in the engine is what the reader validates against. A target note the reader cannot follow is dropped instead of costing the workout.
- Nothing is written over in silence: a stored workout that still cannot be read back and may hold work is moved aside to `wc.v1.sessionRecovery` (newest three kept) before a fresh session is written, and the app says so once. Cleanup never removes the kept copies and lists them.
- Report: `docs/reports/maintenance-17.md`.

## Maintenance 16: timing that adds up, and the card header's empty space (YELLOW - awaiting review)

- From the owner's phone mid-workout: does the length count the time the sets take, why do 1:10 elapsed and 37 left not make the 42 on the dropdown, and why is there a big empty space on the exercise card. He was right on all three.
- Found: the dropdown's minutes included a general warm-up allowance that Left dropped the moment the workout started; the plan counted no rest after the last set of an exercise although the rest timer runs it in full; a set's own time was a flat number per set type whatever its reps, so at the app's own coached tempo isolation and high-rep sets ran far longer than counted; and a rest before a drop set was counted that never runs. Together a session shown as 42 minutes came to about 50 by the app's own timers.
- One timeline, used twice: the length estimate now walks the same set order and the same rest rule as the rest timer (`restBetween`), with every set timed at the middle of its rep range and the coached tempo. A test checks the estimate's rest against the timer's, set by set, through six generated sessions; another holds the seconds per rep to the tempo module.
- Left adds up with the clock: the general warm-up stays ahead until the first set is logged, less what the clock has run, and a rest in progress counts. The coach's room today is measured the same way and against the clock, so logged sets no longer make the room grow.
- The fitter uses the minutes it frees (a dropped row's best move is kept on its own when it fits, so 15 minutes is the main lift plus one move instead of one exercise and nine minutes), and asked to make a session harder it may take back an added set but never one the plan had.
- The card header: the tempo notation sits at the end of the bar it abbreviates and the three are one tap target; the right-hand column is the demonstration alone. Measured at 412 px: 131 px to 113 px (98 px for a one-line name), with the text column now setting the height; at 360 px the height is unchanged and the hole is gone.
- Stated lengths read higher than before for the same sessions: that is the honest number, not a longer workout. Targets, progression, and logged history are untouched.
- Report: `docs/reports/maintenance-16.md`.

## Maintenance 15: programming styles chosen by the goals, round E (YELLOW - awaiting review)

- Found: three styles picked by hand, so the lifter had to know the answer in advance; the 2026 ACSM position stand (137 systematic reviews) found few prescription variables change outcomes, so a style has to earn its place; the progression engine carried last session's weight into a new rep range, which already happened when a lift changed role; and the profile syncs, while an older copy of the app rejects a style value it does not know and asks for setup again.
- Seven styles, each with an evidence grade and its sources (25 studies, every one read on PubMed, in `docs/research/programming-styles.md`): Hybrid, Hypertrophy focus, and Strength focus exactly as before, plus Undulating (mixed evidence, said so), Lean-down for losing fat, Light weights for limited weights or sore joints, and Foundation for a new lifter. No time-efficient style: the workout-length dropdown is that control (owner, 2026-09-18).
- Auto: the goals choose. It reads the profile only, in a fixed order (beginner, Losing fat, strength with size, strength alone, size alone), says which rule decided in a sentence, and folds the research under one line. Losing fat is one switch in Goals. Auto never reads the training log, so the plan does not move with a good or bad week; what the log can say (two or more lifts stalled at a fixed rep range) comes through the coach with one tap.
- Nothing is switched silently: a profile from before this round keeps its style and gets one gold card saying where its goals point, with one action, Let my goals choose. A style picked by hand is never second-guessed, and no style offer is made during a workout.
- The weight follows the reps: a logged session counts toward today's target only when it was run at about the same rep range; a new range starts from 95% of what the latest estimated max implies; a break is measured across ranges. A lift that stays at one range behaves exactly as before (the 498 earlier unit tests passed unchanged).
- Stored so an older copy still works: the choice rides in the optional `programStyle`, `trainingStyle` always keeps the nearest original style, and both new fields read a value from a newer copy as unset.
- Found by a test while building: Lean-down and Foundation say nothing is taken to failure, and the generator still planned a drop set. Neither plans one now, and the coach does not offer one.
- Report: `docs/reports/maintenance-15.md`.

## Maintenance 14: alerts, round D (YELLOW - awaiting review)

- Found: the rest timer ended in silence, a workout left open stays open for days with nothing said, and there is no server, so a notification cannot be scheduled for a moment when the app is asleep. The owner was told that limit when the item was agreed.
- The rest counts itself in: three ticks and a longer tone, laid onto the audio clock a few seconds ahead and cancelled on any change, from any tab, unlocked by the tap that logs a set, on by default with a switch in Settings. A notification when the rest ends and a nudge after half an hour without a logged set, both only while the app is in the background, with permission asked for once from the Settings switch. Whatever the phone does with those, the coach names a workout still open after three hours and its one action opens the end-of-workout sheet from Today or from the workout. One honest line in Settings says what a locked phone can and cannot do. No server, no push service, no new network call; the two switches stay on the device.
- Found on the live capture (build `f7a298d`): Not now on the open-workout card would have hidden it for seven days, like any declined offer, so a different workout left open next week would have gone unnamed. It now hides for the current workout only, and another hour does not bring it back.
- Follow-up from the owner's phone, on his go (build `3edb0b3`): the max entry was a one-time offer on a lift never logged, so he could not find it on a lift he had trained or update a max. Options now has Your max on every lift that takes a load, opening the same sheet with nothing to snooze; on a lift with logged sets a max counts only while it is newer than the last session and says more than those sets, moving the target toward it by two steps at most until the next logged session takes over. The weights editor's three unlabeled boxes read as random numbers: they now sit under Lightest, Heaviest, and Jump, with the result read back in words. The Plates tab shows on any lift that takes a load, with or without a weight showing.
- Report: `docs/reports/maintenance-14.md`.

## Maintenance 13: session context, round C (GREEN)

- GREEN from the owner on 2026-09-18 (issue #14), given together with the last two fixes below.
- Found: the backup reminder did not know about the cloud copy; targets for later exercises were computed as though the lifter walked in fresh, while a target read from a logged set already carries that day's fatigue, so the obvious discount would drift targets down forever; ramps were decided per exercise, with a first-time bar lift getting two ramps at the working weight itself; a lift never done started from bodyweight or a blank.
- Session context (`src/engine/recovery/sessionContext.ts`): the overlapping work before each exercise today, done or planned, against the same measure on the day its target came from; the load moves by the difference (three more sets a step down, six two, three fewer a step up on a clean reference day), so the usual order never drifts. A long break (20 min) makes what follows a fresher start: earlier work counts half, ramps come back, and the exercise in front gets one light ramp. Ramps decided from the whole session and never at the working weight (none at the empty bar); a target set by hand recomputes its pending ramps. The cross-exercise estimate (`crossEstimate.ts`) sets the first target of a lift never done from lifts with history or an entered max, before the bodyweight table; an entered max now informs every lift never logged. The backup reminder goes quiet while the cloud copy is on and current.
- Follow-up from the owner's first look (builds `de7a194`, `5f59823`, `65753ef`): a coach offer the lifter took kept coming back because its evidence is weeks of history a tap does not change, and repeated taps stacked fifteen sets on the main lift. The session now remembers every offer taken (`session.coachAccepted`) and the coach does not make it twice; offers that add a set never stack on an exercise already changed today; one exercise stops at eight working sets whatever asks; the extra set goes on direct work for the muscle and never on the strength lifts. The opened set list folds a run of identical sets into one row: seven rows became four. A removed cloud token stays removed when a sync is still in flight (found by the live run). The Target line keeps the hint's size and is never cut off. The Plates panel is one row with a plain meaning: tap a plate you cannot find today, with the place's own rack behind Edit rack and All plates to restore it.
- Report: `docs/reports/maintenance-13.md`.

## Maintenance 12: what the place can load, round B (GREEN)

- GREEN from the owner on 2026-09-18 (issue #13).
- Found, from the owner's sessions and the code: every target was rounded to one fixed step per load kind with nothing known about the place, so a stack that runs by tens then twenties, a set of dumbbells that stops at 50, or a rack missing its 2.5s produced targets that could not be loaded and a dial that nudged through weights that did not exist; progression had no ceiling; the dial and the target line were silent about each other; plate math assumed the full inventory; a preferred exercise only earned points; the Location line was styled as text; energy and the check-in asked for numbers; a custom exercise had no load kind.
- A loading engine (`src/engine/loading/loading.ts`): each place records a stack per machine exercise, one dumbbell record, and the rack's plates per side; every target from progression, the drop-set rule, in-session autoregulation, and recalibration lands on a weight the place has, manual weights untouched. At the heaviest weight the load holds and the reps rise by two, the coach offers a harder variation or an extra set, the alternatives favour variations still heavy here, and the tempo slows. Plates hosts the record and a session-only Not today row. The dial nudges through real weights and names the nearest one; the target line glows gold while the dial sits under it and opens Plates on a tap. Preferred exercises win their slot outright, custom machines included, and a step the place cannot make holds the load and pushes the reps with the next real weight named. The creator asks how a custom exercise loads. The Location control keeps its border and a gold chevron. Energy after and the check-in ask in words with the same numbers underneath.
- Report: `docs/reports/maintenance-12.md`.

## Maintenance 11: the logger's defects, round A (YELLOW - awaiting review)

- Found, from the owner's screenshots and the code: the plate line took any draft ahead of the target while the dial did not, so a working set was described with its warm-up's plates; any logged set blocked Skip today because skipping removed the exercise and the guard on logged work refused; a drop set's load was fixed at accept time from the plan and rounded upward, above the weight lifted; a zero-rep skip was a hidden gesture; a failed save spoke in the browser's words; and updates were withheld during a workout, so a broken save could not receive its fix.
- One rule for the dial and the plate line; warm-ups and drop sets leave no draft. Skipping keeps every logged set and records the rest as skipped, with the guard untouched and Skip today greyed with its reason once every set is logged. A drop set takes a fifth off the last working set actually lifted, rounded down to the step. The button reads Skip set at zero reps. Any Whole workout row opens its exercise for editing. A failed save is explained on the screen with Try again. The update offer stays during a workout and says the session carries on.
- Report: `docs/reports/maintenance-11.md`.

## Maintenance 10: the token on the device, and getting a device's history back (YELLOW - awaiting review)

- Found, from the code: the pull skipped every row this device wrote, so a device could never recover its own uploads; a token entered again for the same database did not restart the pull; the token had one copy, written once with the browser's default durability and never read back; a missing token showed as "off", the same as never having had one.
- The token is kept in two verified copies, in IndexedDB and in local storage, each written again from the other when the app opens and before every sync, with a dated log naming the layer that lost it. Neither the log nor the marks hold the token; none of it enters a backup, an export, or the cloud copy.
- A device gets its own rows back where the record is gone from it; entering a token again restarts the pull while the device remembers it has synced; Sync now walks everything; every write is flushed before it counts.
- The Cloud copy card says when the token was written again from its other copy, or that it is missing from both and since when; the Storage card lists the token log.
- Verified in the browser with the database stood in for at the network layer: the phone's exact loss, then the workout back and the cloud row untouched; a lost record back on Sync now; both copies gone said plainly and the history back on a paste, with no deletion reaching the cloud.
- Report: `docs/reports/maintenance-10.md`; design in `docs/cloud-copy.md`.

## Maintenance 9: one database per person (YELLOW - awaiting review)

- The cloud copy's database address sits beside the token, both on the device and neither in a backup nor the built files; the shipped default is unchanged, so an existing install is untouched until the field is edited.
- Adopting a database this device has never used is checked first: it must answer, carry the `records` and `devices` tables, and not already hold rows from other devices, which needs a deliberate second tap. Offline, a new database is refused rather than saved on a promise.
- Changing the address re-seeds: the cursor resets so the next sync pulls first, then every mirrored record is queued so the new database receives the whole history.
- A personal setup link (`#/setup?db=...&token=...`) fills both values from the URL fragment, which never reaches a server, then scrubs itself from the address bar and lands on Settings.
- Report: `docs/reports/maintenance-9.md`; design in `docs/cloud-copy.md`.

## Maintenance 8: session polish (YELLOW - awaiting review)

- The tempo chip opens four labelled one-line rows (Tempo, Cue, Effort, Rest) with the research behind a closed "Why: the research" disclosure; each research line carries a bold two-word lead, the duplicate ramp-set line is gone, "X is as fast as you can" shows only when the tempo has an X, and the rest-style line only when the rest style is not Standard.
- The Location control on Today opens a sheet of saved places with today's marked; one tap switches the place through the existing location recalibration with its banner, Settings shows the same choice, and a link leads to the Plan tab for editing equipment.
- A lean active card, from the owner's first look: the logger alone names the set, the header's target line and the set list's "now" row are gone, finished ramps fold into one line that opens on tap, and the phase legend under the bar goes because the tempo chip carries it.
- A set logged with zero reps records as a skip with no weight, and never feeds the engines or the next set's prefill.
- Report: `docs/reports/maintenance-8.md`; the detail is described in `docs/tempo-guidance.md`.

## Maintenance 7: the coach (GREEN)

- Goals under one rule: the goal decides where the weekly volume goes, the programming style decides how each set is done. "Balanced development" (identical to "Build muscle" in every engine) is retired and reads as Build muscle on the way in; "More overall size" leads with legs, back, and chest; "Strength progress" carries a hint line pointing at Programming style.
- Coverage that acts or stays quiet: fires only once half the week's sessions are done, for a muscle under 40 percent of target with nothing today, and only when no coming session reaches it; the tap adds two sets of the best accessory when today has room, or sets a coach focus for the next session when it does not (Plan tab line with Clear; cleared by a session that trains the muscle or after a week).
- Every card ends in a tap or a must-know: the pain-area watch offers a swap, an extra set on offer offers "Add the set", the superset readout moved onto the superset card, the logging tip moved under the first working set, restating notes are gone, a lowered load stays as a must-know.
- Report: `docs/reports/maintenance-7.md`; engine notes in `docs/progression-engine.md` and `docs/workout-engine.md`.

## Maintenance 6: the cloud copy (GREEN)

- Settings > Cloud copy: the database URL (a constant), a token pasted once and kept in the app's own IndexedDB on that device, a status line, the pending count, "Sync now", and "Remove token"; off until a token exists. The token is never in source, the bundle, tests, CI, logs, a backup, or an export, and the privacy scan now fails on any JWT-shaped token anywhere and on any libSQL host in the bundle other than the owner's URL.
- An outbox behind the IndexedDB wrapper for the seven mirrored stores (never demonstrations, never automatic backups), written in the same transaction as every put, delete, and clear; records from the cloud are applied without touching it, so pulls never re-enqueue.
- Push in batches of fifty over the libSQL web driver, loaded on demand; pull on open, every fifteen minutes, on reconnect, and on demand; a fresh install restores everything on its first pull before it pushes anything; retries back off to ten minutes; offline queues. One device id per install, registered in `devices`, stripped from exports. The shared schema is untouched.
- Report: `docs/reports/maintenance-6.md`; design in `docs/cloud-copy.md`; rules amended in `docs/privacy-rules.md`, `docs/data-model.md`, and `docs/backup-and-restore.md`.

## Maintenance 5: the numbers you lift (YELLOW - awaiting review)

- A lift with no history of its own carries one "Know your max?" link: a remembered set or a one-rep max sets the first target of its unlogged sets, ramps included, through the recalibration engine; "Not now" for a week, "Don't ask for this lift" for good; hidden once a set is logged; back only after a three-week break. Entered maxes are kept in the meta store and backed up.
- Settings' units card takes optional age and sex beside bodyweight; with a bodyweight, every first-time lift starts from a reference max per pattern and load type scaled by experience, sex, and age, and "Why this target" names the numbers used.
- Bar lifts never target, ramp, or drop below the empty bar; family estimates convert between load types (a dumbbell per hand is not a barbell); in-session autoregulation moves from the weight actually lifted.
- The line under the logger's weight always says what to load ("Target 155 lb", "Warm-up 80 lb", "Bodyweight"); ramp, drop, and first working sets prefill as prescribed.
- Report: `docs/reports/maintenance-5.md`; engine notes in `docs/progression-engine.md`.

## Maintenance 4: richer fatigue and recovery signals, and week-aware selection (YELLOW - awaiting review)

- Fatigue also reads the saved check-ins as a trend, rests that ran long between logged sets, and performance drift across each lift's estimated max; the same score and levels feed progression, the coach, and the strategy engine.
- The Plan tab's recovery card suggests a deload week, with its reasons and one "Plan it" button, when a dense fortnight meets elevated or high fatigue and a sign the body is not keeping up. A planned week lightens every generated session (one set fewer, one more rep in reserve, loads 10 percent lighter), says so in "Why this workout", is backed up, can be cancelled, and expires on its own.
- The template choice counts muscles trained in the last two days against a session and muscles behind their weekly target for it; accessories for behind muscles lead after the anchor lift; "Why this workout" says which muscles recovered, which sit out, and which lead.
- Report: `docs/reports/maintenance-4.md`; engine notes in `docs/progression-engine.md` and `docs/workout-engine.md`.

## Maintenance 3: smarter alternatives, and learning from overrides (GREEN)

- Alternatives are ranked by what a swap costs: your history with each candidate (when, and at what load and reps), how loaded each muscle already is this week, joints that hurt today (high stress excludes, moderate costs), and whether the coach route for the current lift asks for a variation. Each candidate shows up to two specific reasons and the strongest reason against.
- The next target follows your habit: above the suggested load in three of the last four sessions steps it up one more step, below steps it down, always with the reason; deloads, resets, returns from a break, and estimates are never biased.
- One small "Not now" link beside a coach action remembers a declined offer by source and lift: away for seven days, for good after two declines, never for safety. Declines live in the meta store and are backed up.
- Report: `docs/reports/maintenance-3.md`; engine notes in `docs/conflict-engine.md` and `docs/progression-engine.md`.

## Maintenance 2: in-session autoregulation, and targets from the estimated max (GREEN)

- After every logged working set with sets still to come, the remaining sets of that exercise adjust from the reps and RIR just logged and the earlier sets this session: up a load step when the set was clearly easy, far past the top, or the second in a row past the top; down a step after a grind under the floor or far under it; rep targets shift when there is no load. One missed floor with reps in reserve changes nothing. Done sets and other exercises never change; the summary line names the set and the reason.
- Back after 21 days or more, a lift starts at 90 percent of the load its estimated max implies for the rep range at the prescribed RIR (85 percent after 42 days); a new variation with family history starts at 90 percent of the family's estimate. "Why this target" says so; warm-up ramps follow.
- No new buttons or surfaces. Report: `docs/reports/maintenance-2.md`; engine notes in `docs/recalibration-engine.md` and `docs/progression-engine.md`.

## Maintenance 1: coaching by experience, and stall routes (GREEN)

- The experience level in Settings now drives a coaching policy: beginners get explained cards, three reasons, the footer, the "follow today's plan" card, and every progression nudge; intermediate and advanced lifters get two reasons, no footer, one quiet line when nothing outranks the plan, and no card that only restates a target ("load goes up", "ready for more load", "aim one rep higher", superset readouts). Deloads, resets, extra-set offers, safety, recovery, coverage, and stalls speak to everyone.
- Progression follows the policy: advanced lifters bank two clean strength sessions (floor cleared with reps in reserve, no tolerance under the prescribed RIR) and two top-of-range sessions in double progression before load moves; the "Why this target" line names the policy.
- Stalls are read by exposure: the newest 3 (beginner) or 4 exposures with no better estimated max, at the prescribed effort. Sets ending far from failure are diagnosed as undershooting with the next load step on offer; missed reps stay with the deload rules; a top-of-range session is left to progression.
- A stalled lift opens a route on the one gold card: shift the rep range, swap for a variation, short deload, add a set. Each step is the card's one action; tapping records it; after two more flat exposures the next step is offered; when the max moves the route closes. Routes live in the meta store and are backed up.
- No new buttons or surfaces. Report: `docs/reports/maintenance-1.md`; engine notes in `docs/progression-engine.md`.

## Known limitations

- Progress scores need records: with none logged the cards show their definitions and "none" confidence until sessions accumulate.
- Trends and rankings need at least three sessions per lift; the first session of a lift is its baseline and never a record.
- Vibration at the end of a rest or a hold depends on the phone allowing it. The ticks and end tone play only after a tap has let the page make sound, and a locked phone may not run them.
- Demonstrations are original placeholder diagrams (one animated loop per movement pattern); your own GIF, photo, or video replaces them per exercise.
- Automatic backups include your demonstrations inline, so three of them cost about three times the size of your media.
- The gym barcode's popup comes up at Start Workout, not on arrival, and cannot raise the brightness; it is read and redrawn only where the browser can read barcodes (Chrome on Android), and shows as the picture elsewhere.

## Mobile screenshots

Maintenance 23, captured by Playwright from the deployed build `db22916` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-23](docs/screenshots/maintenance-23)): [A chin-up's one warm-up set: a few easy reps](docs/screenshots/maintenance-23/android-412-workout-bodyweight-warmup.png) · [Its working sets, with no weights note](docs/screenshots/maintenance-23/android-412-workout-bodyweight-working.png) · [Dumbbells well short of the target: the reps that reach the reserve](docs/screenshots/maintenance-23/android-412-workout-dumbbells-well-short.png).

Maintenance 22, captured by Playwright from the deployed build `95fe897` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-22](docs/screenshots/maintenance-22)): [Today: the stopped bench press, the dumbbells right after it](docs/screenshots/maintenance-22/android-412-today-stopped-and-swapped.png) · [The stopped exercise's sheet](docs/screenshots/maintenance-22/android-412-stopped-sheet.png) · [The dumbbells with their own target](docs/screenshots/maintenance-22/android-412-workout-swapped-in.png) · [Keep it for the next 4 weeks](docs/screenshots/maintenance-22/android-412-swap-keep-switch.png) · [A kept swap on Plan, with Stop](docs/screenshots/maintenance-22/android-412-plan-lasting-swap.png) · [Back at the gym: the bench press picked up again](docs/screenshots/maintenance-22/android-412-back-at-gym-picked-up.png).

Maintenance 21, captured by Playwright from the deployed build `5c2aee6` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-21](docs/screenshots/maintenance-21)): [The fewer-reps card on a chin-up day](docs/screenshots/maintenance-21/android-412-today-fewer-reps-card.png) · [A ramp set's hints in full](docs/screenshots/maintenance-21/android-412-workout-ramp-hints.png) · [3-1-X-0 at the heaviest weight here, with the Amdi and King note](docs/screenshots/maintenance-21/android-412-workout-capped-strength-tempo.png). The fix, from build `4bce35a`: [Home, Gym, Home: the stand-in still right after the stopped bench press](docs/screenshots/maintenance-21/android-412-moved-home-gym-home.png).

Maintenance 20, captured by Playwright from the deployed build `2894aad` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-20](docs/screenshots/maintenance-20)): [A Plank hold counting down](docs/screenshots/maintenance-20/android-412-workout-hold-counting.png) · [The hold done, its seconds in the dial](docs/screenshots/maintenance-20/android-412-workout-hold-done.png) · [Some pain, and Where?](docs/screenshots/maintenance-20/android-412-rating-pain-where.png) · [The coach card naming the exercise that loads it](docs/screenshots/maintenance-20/android-412-today-pain-card.png).

Maintenance 19, captured by Playwright from the deployed build `9fd2794` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-19](docs/screenshots/maintenance-19)): [Moved to Home mid-workout: the rest of the session from Home](docs/screenshots/maintenance-19/android-412-moved-home.png) · [No 2.5s today: the target, the line by it, and the plate line](docs/screenshots/maintenance-19/android-412-plate-missing-today.png) · [A safety card before Not now](docs/screenshots/maintenance-19/android-412-safety-card.png).

Maintenance 18, captured by Playwright from the deployed build `c4966f5` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-18](docs/screenshots/maintenance-18)): [Where you train: Barcode beside Use and Edit](docs/screenshots/maintenance-18/android-412-plan-places.png) · [The Gym's barcode popup](docs/screenshots/maintenance-18/android-412-gym-barcode-sheet.png) · [Show barcode on Today's card](docs/screenshots/maintenance-18/android-412-today-show-barcode.png) · [The popup as the workout starts](docs/screenshots/maintenance-18/android-412-barcode-at-start.png) · [Full screen on white, a tap on the barcode](docs/screenshots/maintenance-18/android-412-barcode-full-screen.png) · [A code read from the picture, redrawn full width](docs/screenshots/maintenance-18/android-412-barcode-redrawn.png).

Maintenance 17, captured by Playwright from the deployed build `1ccd356` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-17](docs/screenshots/maintenance-17)): [A workout back after the app reopened, its logged set intact](docs/screenshots/maintenance-17/android-412-workout-after-reopening.png) · [The notice for a stored workout that could not be read back](docs/screenshots/maintenance-17/android-412-workout-kept-for-recovery.png).

Maintenance 16, captured by Playwright from the deployed build `43a485b` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-16](docs/screenshots/maintenance-16)): [The top of the workout: the dropdown, the clock, and Left agree](docs/screenshots/maintenance-16/android-412-workout-timing-adds-up.png) · [The exercise card's header, tempo detail open](docs/screenshots/maintenance-16/android-412-workout-card-header.png).

Maintenance 15, captured by Playwright from the deployed build `91d0234` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-15](docs/screenshots/maintenance-15)): [The coach saying where the goals point](docs/screenshots/maintenance-15/android-412-today-coach-style-offer.png) · [Auto in Settings, with the research open](docs/screenshots/maintenance-15/android-412-settings-style-auto.png) · [Losing fat moves Auto to Lean-down](docs/screenshots/maintenance-15/android-412-settings-style-lean-down.png).

Maintenance 14, captured by Playwright from the deployed builds `1b0096d` and `3edb0b3` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-14](docs/screenshots/maintenance-14)): [The Alerts card in Settings](docs/screenshots/maintenance-14/android-412-settings-alerts.png) · [The coach naming a workout left open](docs/screenshots/maintenance-14/android-412-workout-left-open.png) · [Your max in Options](docs/screenshots/maintenance-14/android-412-workout-options-your-max.png) · [The weights editor with its boxes named](docs/screenshots/maintenance-14/android-412-workout-weights-editor.png).

Maintenance 13, captured by Playwright from the deployed builds `2159826` and `65753ef` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-13](docs/screenshots/maintenance-13)): [Ramps under the target after a max](docs/screenshots/maintenance-13/android-412-workout-ramps-under-target.png) · [A first target from the bench](docs/screenshots/maintenance-13/android-412-workout-cross-estimate.png) · [The set list, opened and still short](docs/screenshots/maintenance-13/android-412-workout-set-list-compact.png) · [Plates: a plate missing today](docs/screenshots/maintenance-13/android-412-workout-plates-not-today.png) · [Plates: Edit rack](docs/screenshots/maintenance-13/android-412-workout-plates-edit-rack.png) · [The Target line at its own size](docs/screenshots/maintenance-13/android-412-workout-target-glow.png).

Maintenance 12, captured by Playwright from the deployed build `cf1ab6e` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-12](docs/screenshots/maintenance-12)): [Plates with a 2.5 missing today](docs/screenshots/maintenance-12/android-412-workout-plates-not-today.png) · [The target line glowing under its target](docs/screenshots/maintenance-12/android-412-workout-target-glow.png) · [Energy after, in words](docs/screenshots/maintenance-12/android-412-finish-energy-words.png) · [The Location control](docs/screenshots/maintenance-12/android-412-today-location-control.png) · [The check-in, in words](docs/screenshots/maintenance-12/android-412-today-checkin-words.png) · [How a custom exercise loads](docs/screenshots/maintenance-12/android-412-library-custom-load.png).

Maintenance 11, captured by Playwright from the deployed build `cc3d466` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-11](docs/screenshots/maintenance-11)): [Skip set at zero reps](docs/screenshots/maintenance-11/android-412-workout-skip-set-label.png) · [Skipped the rest, logged set kept](docs/screenshots/maintenance-11/android-412-workout-skip-rest.png) · [A finished exercise opened from Whole workout](docs/screenshots/maintenance-11/android-412-workout-viewing.png) · [Skip today greyed with its reason](docs/screenshots/maintenance-11/android-412-workout-skip-greyed.png).

Maintenance 10, captured by Playwright from the deployed build `25908c0` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ with the database stood in for at the network layer (see [docs/screenshots/maintenance-10](docs/screenshots/maintenance-10)): [Token written again from the phone's copy](docs/screenshots/maintenance-10/android-412-settings-cloud-token-restored.png) · [Both copies gone](docs/screenshots/maintenance-10/android-412-settings-cloud-token-missing.png) · [Token log on the Storage card](docs/screenshots/maintenance-10/android-412-settings-storage-token-log.png).

Maintenance 4, captured by Playwright from the deployed build `13da3d1` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-4](docs/screenshots/maintenance-4)): [Plan](docs/screenshots/maintenance-4/android-412-plan.png) · [Today](docs/screenshots/maintenance-4/android-412-today.png) · [Combined preview sheet](docs/screenshots/maintenance-4/preview-sheet.png).

Maintenance 1, captured by Playwright from the deployed build `223c767` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/maintenance-1](docs/screenshots/maintenance-1)): [Stall route on the coach card](docs/screenshots/maintenance-1/android-412-today-coach-stall-route.png) · [After the first step](docs/screenshots/maintenance-1/android-412-today-coach-stall-applied.png) · [Quiet coach line](docs/screenshots/maintenance-1/android-412-today-coach-card.png) · [Combined preview sheet](docs/screenshots/maintenance-1/preview-sheet.png).

Phase 8, captured by Playwright from the deployed build `5691ed7` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/phase-8](docs/screenshots/phase-8)): [Settings with backups, automatic backups, and storage check](docs/screenshots/phase-8/android-412-settings-data-safety.png) · [Legacy import preview](docs/screenshots/phase-8/android-412-settings-legacy-preview.png) · [Import preview](docs/screenshots/phase-8/android-412-settings-import-preview.png) · [Combined preview sheet](docs/screenshots/phase-8/preview-sheet.png); the full set is in the folder.

Phase 7, captured by Playwright from the deployed build `584a5b8` at https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (see [docs/screenshots/phase-7](docs/screenshots/phase-7)).

- Combined preview sheet: [preview-sheet.png](docs/screenshots/phase-7/preview-sheet.png)
- Android 412 px (Pixel 7): [Progress after a workout](docs/screenshots/phase-7/android-412-progress-after-workout.png) · [History detail](docs/screenshots/phase-7/android-412-progress-history-detail.png) · [Progress with explained scores](docs/screenshots/phase-7/android-412-progress-scores.png) · [Plan with the week and a saved workout](docs/screenshots/phase-7/android-412-plan-week-and-saved.png) · [Completion with records, recovery, and next targets](docs/screenshots/phase-7/android-412-workout-completion.png) · [Adaptive Coach card](docs/screenshots/phase-7/android-412-today-coach-card.png) · [Readiness check-in](docs/screenshots/phase-7/android-412-today-readiness-check-in.png) · [Active workout start](docs/screenshots/phase-7/android-412-workout-active-start.png) · [How to sheet with Your GIF](docs/screenshots/phase-7/android-412-workout-how-to-sheet.png) · [Your own GIF on the exercise](docs/screenshots/phase-7/android-412-workout-own-gif.png) · [Set logger](docs/screenshots/phase-7/android-412-workout-set-logger.png) · [Rest timer](docs/screenshots/phase-7/android-412-workout-rest-timer.png) · [Superset card](docs/screenshots/phase-7/android-412-workout-superset.png) · [Calibration overlay](docs/screenshots/phase-7/android-412-calibration-overlay.png) · [Today, Default time](docs/screenshots/phase-7/android-412-today.png) · [Today full page](docs/screenshots/phase-7/android-412-today-full.png) · [Workout preview](docs/screenshots/phase-7/android-412-workout.png) · [Library](docs/screenshots/phase-7/android-412-library.png) · [Progress](docs/screenshots/phase-7/android-412-progress.png) · [Plan](docs/screenshots/phase-7/android-412-plan.png) · [Settings](docs/screenshots/phase-7/android-412-settings.png)
- Android 360 px: [Today](docs/screenshots/phase-7/android-360-today.png) · [Workout](docs/screenshots/phase-7/android-360-workout.png) · [Progress](docs/screenshots/phase-7/android-360-progress.png) · [Plan](docs/screenshots/phase-7/android-360-plan.png) · [Settings](docs/screenshots/phase-7/android-360-settings.png)
- Desktop 1280 px: [Today](docs/screenshots/phase-7/desktop-today.png) · [Workout](docs/screenshots/phase-7/desktop-workout.png) · [Progress](docs/screenshots/phase-7/desktop-progress.png) · [Plan](docs/screenshots/phase-7/desktop-plan.png) · [Settings](docs/screenshots/phase-7/desktop-settings.png)

Phase 7: [docs/screenshots/phase-7](docs/screenshots/phase-7) · Phase 6: [docs/screenshots/phase-6](docs/screenshots/phase-6) · Phase 5: [docs/screenshots/phase-5](docs/screenshots/phase-5) · Phase 4: [docs/screenshots/phase-4](docs/screenshots/phase-4) · Phase 3: [docs/screenshots/phase-3](docs/screenshots/phase-3) · Phase 2: [docs/screenshots/phase-2](docs/screenshots/phase-2) · Phase 1: [docs/screenshots/phase-1](docs/screenshots/phase-1) · Phase 0: [docs/screenshots/phase-0](docs/screenshots/phase-0).

## Next concrete action

Build Maintenance 24 (round F, the rebuilds and the coach: the owner's items 33, 34, and 35) and
ship it through the gate to a review issue. Maintenance 21 (issue #22) still waits for the owner's
review.
