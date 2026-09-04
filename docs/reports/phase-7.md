# Phase 7 report: Progress, Plan, Coverage, PRs, and Session Summary

_Gate: YELLOW, awaiting the owner's review on Android._

## Delivered

- **Workout history** on Progress: every saved workout newest first with duration, sets, volume,
  and a record badge; each opens in full with every set as logged (ramp and drop sets marked),
  substitutions, rating, records, pain, and the exercise notes saved for each lift.
- **Muscle volume and weekly coverage**: direct and indirect sets in the last 7 days per muscle
  against the goal-derived weekly target, with priority muscles first and a 70 to 130 percent
  target band; solid marks for direct work, striped for indirect, the band outlined.
- **Priority-muscle target bands** on Progress (all muscles) and on Plan (priority muscles).
- **Estimated strength**: Epley one-rep-max estimates from the best completed working set per
  lift, reps capped at 12, confidence from the session count.
- **Exercise progress and ranking**: sessions, best set, latest estimate, trend against the oldest
  of the last four sessions, swaps and skips; most productive and often-replaced lists; a
  per-lift sheet with every session and its notes.
- **Personal-record detection and compact badges** (`src/engine/scoring/personalRecords.ts`):
  weight, reps at a weight, session volume, and first top-of-range completion at the best load,
  detected when a workout is saved and stored on the record. The first session of a lift is its
  baseline. Compact "Weight PR" and "Rep PR" badges appear on the exercise card during the
  workout; records show on the completion surface, in history, and on Progress.
- **Consistency**: sessions per calendar week over eight weeks against the planned frequency,
  average since the first session, and the streak of weeks with training.
- **Duration efficiency**: actual against planned minutes and working sets per ten minutes.
- **Weekly planning** on Plan: the next planned sessions on the available days, each what the
  generator would build that morning, rotated as if logged; recovery balance per muscle
  (recovering, ready, fresh).
- **Saved workouts**: save today's session by name (database version 3, `savedWorkouts` store,
  included in backups), then load it later as a fresh preview session that still recalibrates.
- **Explanation panels** with definition, supporting data, sample count, and confidence on every
  score (`ScorePanel`). Sparse data reads as low or no confidence.
- **Session Summary** now shows completed work, personal records, muscles trained, a recovery
  note, substitutions, next targets for every trained lift from the progression engine, and the
  next focus from the updated muscle priorities, alongside the coach feedback from Phase 6.
- **Exercise notes** visible from history and the per-lift progress sheet.

## Verification

- Lint and type-check clean; privacy scan 0 findings; verify-build passed (phase 7 in both
  places).
- Unit: 244 tests across 41 files. New: personal records (baseline, all four kinds,
  warm-ups and incomplete sets ignored, live badges, recent list), analytics (consistency
  buckets, coverage bands, exercise progress, estimated strength, rankings, efficiency, pain
  patterns, technique usage, confidence), weekly plan (available days, rotation, today skipped
  once logged, recovery balance), and the store (save, persist, load, delete; backup and restore;
  records detected on the second session with next targets, focus, and recovery note).
- Browser: 88 tests passed + 8 skipped by design on Android 412 px, Android
  360 px, desktop, and the PWA project, locally and against the live URL. New flows: the session
  summary's next targets and focus, Progress with explained scores and a history sheet showing
  the logged set, and Plan with the week, weekly targets, recovery balance, and a saved workout
  that survives a reload and loads as today's session.

## How to check on the phone

1. Finish a workout: the summary ends with records (none on a first session), recovery, focus,
   and next targets.
2. Progress: read the week's sessions and the eight-week bars, the muscle volume bands, estimated
   strength, exercise progress, records, efficiency, and history. Open "How this is calculated"
   on any card and tap a history row for every set.
3. Plan: the upcoming sessions, priority-muscle targets, recovery balance, and Saved workouts.
   Save today's workout, reload, and tap Use.
4. Beat a lift next time: the card shows "Weight PR" as you log, and the summary lists it.

## Review-gate fix (YELLOW - FIX)

The owner reviewed the active workout on the phone and asked for four things: the
demonstration visible on every exercise card right away, a tempo and a visual cue per exercise,
the set list collapsed so it stops taking most of the screen, and something useful in the empty
right-hand column of each set row.

- Every exercise card now carries the demonstration thumbnail at the top right, labelled "How
  to"; tapping it opens the full animated demonstration and details. The How to panel keeps the
  larger demonstration.
- A tempo line follows the set's job (strength 2-1-X, hypertrophy 3-0-1, isolation 2-1-2, ramp
  and drop sets 2-0-1) with a plain reason, plus a one-line form cue taken from the exercise's
  own first execution step. Tempo is guidance and never changes what is logged.
- The set list shows logged rows and the current row; sets still to come collapse into one line
  ("4 more sets · 4-6 reps @ RIR 2 · 1 ramp") that expands on tap and collapses again.
- The right-hand column now carries the current set's target load (or "log below" before a
  weight is known) and, when expanded, each upcoming set's load and rest.

A second look on the phone asked for less text after the tempo, no equipment list under the
target, a bigger demonstration, and a use for the space under it:

- The tempo is now a chip under the demonstration ("Tempo 2-1-X"); tapping it reveals the
  reason and the form cue, and tapping again hides them.
- The equipment line is gone from the card; the header keeps only the target line and last
  time's numbers. Equipment stays in the How to panel and the details sheet.
- The demonstration grew from 72 × 54 to 96 × 72 with the tempo chip filling the space under it.

A third look asked for the empty space under "last time" to carry a neat tempo bar, and for
tempo to be evidence-based rather than conventional:

- Tempo is now modelled as phases in seconds (lower, hold, lift, squeeze; X is as fast as you
  can) with lower-pause-lift-squeeze notation, and every choice carries its evidence (Schoenfeld,
  Ogborn and Krieger 2015; Behm and Sale 1993; Wilk, Zajac and Tufano 2021; Roig et al. 2009;
  Schoenfeld and Contreras 2016; Schoenfeld et al. 2018). See `docs/tempo-guidance.md`.
- A one-rep tempo bar fills that space: segments sized by their seconds with a marker sweeping
  at the real pace; it stops under reduced motion. Tapping the bar or the chip opens the reason,
  the cue, and the evidence lines.

## Decisions and notes

- Charts are plain HTML marks: one series, one hue, thin marks with rounded data ends, recessive
  guides, a title tooltip on every mark, and the numbers in the score panel's list, so nothing
  depends on colour alone.
- Analysis is never stored; every score is recomputed from the records on demand.
- The database moved to version 3 for the `savedWorkouts` store; the upgrade only adds the store
  and the version-collision recovery from Phase 3 still applies.
