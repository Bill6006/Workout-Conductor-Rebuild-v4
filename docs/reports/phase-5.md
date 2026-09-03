# Phase 5 report: Active Workout, Logging, and Superset Experience

_Gate: YELLOW, awaiting the owner's review on Android._

## Delivered

- **Premium active workout screen** (`src/features/workout/ActiveWorkoutScreen.tsx`). Title, the
  one workout-length dropdown (usable mid-workout), elapsed time, estimated time left, working-set
  progress, Pause and Resume, End early, the recalibration summary with Undo, the rest timer, the
  current exercise with its set target and previous performance, the set rows and logger, an
  "Up next" card, and a collapsed whole-workout list. Compact panels and sheets keep everything
  else off the main path.
- **Reusable Set Logger** (`src/components/SetLogger/SetLogger.tsx`). Three large value dials
  (weight, reps, RIR) prefilled from the last set of the same exercise or the target, one large
  chevron above and below each, tap-to-type on the Android numeric keyboard, and one dominant
  thumb-reach Log button. A normal set is one tap. The design rationale, tap counts, and width and
  zoom results are in `docs/mobile-test-report.md`.
- **Inline completed-set editing.** Tap any logged value and the same logger opens in place of
  that row with Save, Cancel, and Remove; the current set stays where it is. Undo for the last set
  is one tap. Completed sets keep their check mark in the list.
- **Set Options and Why.** The exercise Options sheet carries the session-only actions from
  Phase 4 (swap, pin, busy, uncomfortable, skip, hurts) plus Sets and order: add or remove a
  working set, add a ramp set, skip ramp sets, set a rep range, move up or down, split a superset.
  Every one runs through the Recalibration Engine (five new local triggers, 23 in total).
  The "Why this workout" explanation stays on Today; the target line on every card says what the
  set is for.
- **Rest timer** (`src/components/RestTimer/RestTimer.tsx`). Starts after logging with the
  programmed rest, −15 s / +15 s and Skip, shows the next set target, keeps counting across screen
  changes and backgrounding (absolute end time), freezes while paused, shows a clear done state,
  vibrates once where allowed, and never plays a sound. It never blocks editing.
- **Demonstrations and instructions** in the "How to" panel: the demonstration, previous
  performance, setup and execution steps, breathing, and the user's own cues.
- **Alternatives and one-exercise replacement** from the Options sheet during the workout, through
  the engine's replace trigger; only that exercise changes.
- **Combined two-move superset card** (`src/components/SupersetGroup/SupersetGroup.tsx`). Both
  moves together, a round counter, a round table with every logged value for A1 and A2, and the
  member cards under it with the active member highlighted. Rounds run A1 then A2 with no rest
  between them and the block rest after the round. Circuits use the same card.
- **Separate durable records for both superset moves.** The saved workout has one entry per
  exercise; superset members share a block id and kind and keep their own targets, drafts,
  replacements, and logged sets.
- **One readable Active Workout List row per superset** on Today, Workout, and the whole-workout
  list.
- **Completed superset-round editing.** Tap any round value to correct it in place; no round or
  timer is added.
- **Final-superset completion authority.** The set sequence ends exactly when the final round ends;
  the completion prompt follows and no member is ever shown as if another exercise remained.
- **Drop-set presentation.** A drop set is its own row and target ("strip about 20% and go"), logged
  with no rest before it, and prefilled at about 80% of the working weight.
- **Warm-up Add/Skip and logging.** Ramp sets are flagged rows with their own Log button, "Skip
  ramp sets" in one tap, "+ Ramp set" in Options, and they never count toward working totals,
  volume, or progression.
- **Per-exercise notes and cue memory.** The Notes panel saves notes and cues per exercise with a
  verified write into the user's custom content; they show on every future workout and in backups.
- **Plate Math** (`src/engine/plateMath/plateMath.ts`). Plates per side from the bar weight and a
  standard inventory, follows the weight in the logger live, per-hand clarification for dumbbells
  and kettlebells, and stack or bodyweight notes.
- **Custom exercise and custom-media display.** Custom exercises are registered into the catalog
  lookups after hydration and resolve everywhere; the Library gains a compact creator (name,
  primary muscle, pattern, equipment, optional photo or short video up to 3 MB kept on the device);
  user media shows in place of the placeholder demonstration and stays separate from production
  media.
- **Workout pause and resume.** Pause freezes the clock and the rest timer; resume continues
  exactly, and a break of 20 minutes or more recalculates the remaining workout with a light
  re-warm-up (Phase 4 engine path, now live).
- **Workout completion.** Finish (or End early) asks for a quick rating (too easy / right / too
  hard, pain, energy after, note), saves the record once with a verified write, and shows the
  summary: duration versus planned, exercises, sets (plus ramp sets), volume, muscles trained,
  skipped work, substitutions, highlights, and a short next-workout implication. Done generates the
  next session from the new history, so the template rotates.
- **Mobile layout at 360 px and 150 percent zoom.** Verified in the browser suite at 275 px
  (412 px at 150 % zoom), 360 px, 412 px, and desktop; no horizontal overflow, logger usable.

## Verification

- Lint and type-check clean; privacy scan 0 findings; verify-build passed (phase 5 in both
  places).
- Unit: 208 tests across 33 files. New: set sequence (straight, superset rounds,
  drop sets, progress), plate math, the five editing triggers, the store's active workout (start,
  programmed rests, superset switching, finish with one record per exercise, correction, delete,
  undo, skip, pause and resume with the long-interruption recalibration, reps far from target,
  notes, active session surviving a new day, custom exercises and media), and the Set Logger
  component (one-tap log, nudge and type, edit mode, disabled and cooldown).
- Browser: 75 tests passed + 8 skipped by design on Android 412 px, Android 360 px, desktop,
  and the PWA project, locally and against the live URL. New flows: one-tap logging with the rest
  timer and inline correction, pause and resume, early finish with rating and the completion
  summary, the next session rotating after Done; superset rounds with both moves together and no
  rest between them; notes, Plate Math, and an active session surviving a reload; 275 px and
  360 px layout.

## How to check on the phone

1. On Today, tap **Start Workout**. Skip or log the ramp sets, then tap **Log set** once for a
   normal set. Watch the rest timer; try −15 s, +15 s, and Skip.
2. Tap a logged value to correct it in place; tap **Undo** on the last set.
3. Open **How to**, **Notes** (save a cue), **Plates** (type a weight first), and **Options** (add a
   set, change the rep range, swap an exercise).
4. Reach the superset: both moves in one card, log A1 then A2, then rest. Tap a round value to
   edit it.
5. Pause, switch tabs, come back, Resume.
6. Finish (or End early), rate the session, read the summary, tap Done: the next session is
   generated from your history.
7. Library: add a custom exercise with a photo; it shows your media.

## Decisions and notes

- Personal records, strength progression, and the weekly-volume effect lines on the completion
  summary arrive with Phases 6 and 7 as the plan sequences them; the summary already reserves the
  space and the record carries everything they need.
- The rating is asked before the single durable write so the record is saved once, verified.
- The logger's chevrons are deliberately large and low-contrast; the values and the Log button
  dominate. There is no keypad and no grid of equally weighted buttons.
