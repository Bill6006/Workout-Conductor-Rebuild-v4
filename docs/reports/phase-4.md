# Phase 4 report: Central Recalibration Engine

_Gate: YELLOW, awaiting the owner's review on Android._

## Delivered

- **Centralized recalibration.** One pure engine, `src/engine/recalibration/recalibrate.ts`,
  owns every change to a generated workout. Screens send a typed trigger to the store; nothing
  in a component rebuilds, trims, or swaps anything. See `docs/recalibration-engine.md`.
- **Typed request.** Trigger, current workout, completed work (logged sets, elapsed time, current
  exercise), locked entries, requested length, place and equipment, profile (preferences and
  limitations), history, session constraints (busy stations, avoided moves, session pain joints,
  exact end time, readiness, intensity), reason, and timestamp.
- **Trigger registry.** All 18 triggers from the plan with a label, default scope, and the short
  list the overlay shows: duration, location, equipment, equipment busy, replace, skip, pain,
  uncomfortable, pin, reps far from target, target weight, technique toggles, profile,
  readiness, resume after a long interruption, finish early, harder or easier, end by exact time.
- **Scope decided by the engine.** Local (one exercise; everything else byte-for-byte
  identical), partial (remaining workout rebuilt around kept entries), full (nothing started and
  nothing locked). No unnecessary full rebuild for a local change.
- **Completed-work locking.** Logged sets are never changed; an entry with logged sets is frozen
  (never trimmed, dropped, re-paired, or moved). Pinned, explicitly selected, accepted
  alternatives, and the current exercise are locked against drops and swaps.
- **Partial recalibration through the generator.** `generateWorkout` accepts constraints: kept
  entries return to their template slots, surviving pairings are restored, the budget is the
  target minus elapsed time, warm-up is skipped once started, logged sets cost no time, and only
  new entries are fitted.
- **Duration recalibration during a workout.** Elapsed time subtracted, remaining locked work
  estimated, completed work preserved, current exercise kept, only future rows recalculated,
  change explained. When the requested length is impossible the plan says it may run over and
  the card offers **End by exact time**, a hard cap that never pretends impossible volume fits.
- **Equipment and location recalibration.** Switching the place on Plan, or editing the current
  place's equipment, rebuilds the session and removes unavailable exercises automatically.
- **Session-only Equipment Busy.** Marks the station busy for this session, substitutes every
  remaining exercise that needs it, and leaves the saved place untouched.
- **Pain and discomfort handling.** "Hurts, protect it" adds a session pain joint, replaces
  stressful exercises with gentler ones (or removes what cannot be replaced). "Uncomfortable"
  swaps in the best alternative and avoids the move for the session. Neither edits the profile.
- **Recovery recalibration.** Readiness (energy, soreness, sleep, motivation, joint discomfort,
  time pressure) becomes fewer sets, an extra rep in reserve, gentler picks, or a 45-minute
  session; a good day keeps the full workout. The check-in screen itself arrives in Phase 6 as
  the plan sequences it; the engine path is complete and tested now.
- **Remaining-session recalculation.** Resume after a long interruption, finish early, harder or
  easier, and reps far above or below target all recalculate only what is left.
- **Failure rollback.** Every result is validated (no duplicates, no empty rows, no lost logged
  sets, no blocked conflicts). Any failure returns the previous workout untouched; the store
  shows a readable error card and keeps the previous workout. Undo restores the workout and
  constraints from before the last recalibration.
- **Calibration overlay.** Shows at once, blocks stray taps, keeps the scroll position, names the
  trigger, lists what the engine evaluates, stays up for a brief 450 ms transition so a fast
  rebuild still reads as a change, and never adds a multi-second delay.
- **Change summary.** Compact headlines such as `Recalibrated to 15 min: 4 exercises removed,
1 superset added.`, `Rebuilt for Home: 3 exercises replaced.`, `Swapped Cable Fly for Pec
Deck.`, with details on demand, Undo, and subtle marks on changed rows (New, Swapped,
  Adjusted, Pinned, Your pick). Unchanged rows stay put.
- **Session persistence.** The session (workout, constraints, logged work, last summary,
  previous snapshot, recalibration log) is kept in localStorage under `wc.v1.session`, so a
  reload changes nothing; a new day, an edited profile, or new history starts fresh.
- **Recalibration log** on the Workout tab: every recalibration with its trigger, scope, and
  engine time in milliseconds.

## Verification

- Lint and type-check clean; privacy scan 0 findings; verify-build passed (phase 4 in both
  places).
- Unit: 192 tests across 29 files. The recalibration suite covers every item in the plan's
  recalibration test list: Default to 15, 15 to 30, 30 to 45, back to Default, changing duration
  before the workout, after one set, halfway through, changing location, equipment unavailable,
  selecting an alternative, skipping, reporting pain, disabling and enabling supersets,
  disabling drop sets, exceeding and missing target reps, plus readiness, resume, finish early,
  harder or easier, end by exact time, target weight, failure rollback, purity, scope rules, and
  the speed targets (local under 250 ms, full and partial under 700 ms; measured times are a few
  milliseconds).
- Store: session creation and persistence, calibration state transitions, a failing engine
  keeping the previous workout, undo, serialized concurrent triggers, place switch and technique
  toggles recalibrating through the profile save, units and notes not recalibrating, equipment
  edits, same-day reuse versus new-day refresh, exact end time.
- Browser: 62 tests passed + 6 skipped by design on Android 412 px, Android 360 px, desktop, and
  the PWA project. New flows: overlay then summary then undo; an alternative swapping one
  exercise and marking it; busy station, skip, and pain surviving a reload with the log on the
  Workout tab; switching the place on Plan.

## How to check on the phone

1. On Today, change **Workout length**. The calibration card appears, then the summary line under
   the estimate says what changed. Tap **Undo** to get the previous session back.
2. Tap any exercise. Under **This session only**: Pin, Equipment busy, Uncomfortable, Skip today,
   and "Hurts, protect it" with a joint picker. Each closes the sheet, recalibrates only what it
   touches, and tags the changed row.
3. In the same sheet, tap **Use** on an alternative to swap just that exercise; it is marked
   "Your pick" and survives later length changes.
4. On Plan, tap **Use** on another place: the session rebuilds for it and the summary says
   "Rebuilt for Home". Settings toggles for supersets, drop sets, and circuits recalibrate too.
5. Open the Workout tab for the recalibration log with scope and engine time.
6. Reload at any point: the session, its swaps, and its log are still there.

## Decisions and notes

- Readiness UI is deliberately left for Phase 6 (the plan places the check-in with the adaptive
  coach). The engine's readiness path is built and tested so Phase 6 only adds the screen.
- Active-workout triggers (reps far from target, resume, finish early, harder or easier) are
  built and tested at the engine and store level; the logging screens that fire them arrive in
  Phase 5.
- `?slowCalibration=1` on the URL holds the overlay for 2.5 s; it exists only so screenshots can
  show the calibration state. It changes nothing else.
- Cancellation is not offered: the engine completes synchronously in a few milliseconds, so
  there is never a moment where cancelling would be safe and useful.
