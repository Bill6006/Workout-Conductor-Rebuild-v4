# Maintenance 11: the logger's defects, round A

Started on 2026-09-18 from the owner's own screenshots during three sessions on the phone: the
wrong plates named for a working set, an exercise that refused to be skipped once a warm-up was
logged, a drop set heavier than the sets before it, a skip that could only be found by accident,
a workout list that could not be opened, a failed save shown as raw error text, and an update
held back during the one moment a broken save most needs it.

## What was found

- **The plate line and the dial followed different rules.** The dial takes a carried-over draft
  only after a working set is logged and the target otherwise. The plate line took any draft,
  a warm-up's included, ahead of the target. After a 70 lb ramp the dial read 120 and the line
  described 70: 10 and 2.5 a side instead of 25, 10 and 2.5.
- **Any logged set blocked a skip.** Skipping removes the exercise, and the guard that protects
  logged work saw the warm-up about to disappear and refused the whole rebuild. The guard was
  right; asking it to remove logged work was wrong.
- **A drop set's load was fixed at accept time, from the plan, rounded upward.** With a planned
  10 lb, a fifth off is 8, and rounding to the step gave 10 again, above the 5 lb actually
  lifted. Every path that rebuilds an entry keeps the drop row, so the row was never the defect;
  its load was.
- **A skip was a hidden gesture.** Zero reps records a skip and always did, but the button kept
  saying Log set, so the outcome was only learned after the tap.
- **A failed save spoke in the browser's words.** "Failed to execute 'transaction' on
  'IDBDatabase': The database connection is closing."
- **Updates were withheld during a workout**, so a session with a broken save could not receive
  the fix for its save.

## Delivered

- **One rule for the dial and the plate line.** The line reads the dial's own starting value,
  or the weight the dial has been turned to, or with no set in front of you the last working
  weight logged there. A warm-up or drop set no longer leaves a draft at all, so only a working
  set can prefill the next one. The dial's live value is cleared when a set is logged, so the
  next set starts from its own rule.
- **Skipping keeps what you did.** With nothing logged the engine removes the exercise as
  before. With something logged the logged sets stay, the remaining sets are recorded as
  skipped, the session moves on, and the engine is never asked to remove anything, so the
  protection is untouched. Recording the remainder as skipped rather than erasing it keeps the
  evidence the fatigue work needs: the record shows the exercise was cut short. Once every set
  is logged, Skip today is greyed out with the reason instead of failing after the tap.
- **A drop set takes its load from the set actually lifted.** It carries no load until the last
  working set is logged; then it takes a fifth off, rounded down to the exercise's step, and at
  least one step under the working weight when a lighter step exists. Accepting a drop set
  after the working sets are already logged settles it at once.
- **The button says Skip.** With the reps at zero the primary button reads Skip set, Skip
  warm-up set, or Save as skipped, before the tap.
- **The Whole workout list opens any exercise.** Tapping a row shows that exercise's card with
  its logged sets editable, under a line that says which one is showing and offers the way back
  to the current set. Tapping the current row returns to it.
- **A failed save says what happened.** In plain words, on the screen, with what to do and the
  assurance that nothing was lost, and a Try again that reopens the save. The browser closing
  the database, storage that will not open, a write that did not read back, and a full phone
  each have their own sentence.
- **The update offer stays during a workout.** It says the session is kept on this device and
  carries on after the reload, which it does: the session lives in local storage and the rest
  timer keeps an absolute end time. Nothing is ever applied without the tap.
- **Surfaces.** No new buttons. One notice line above the card when viewing another exercise,
  one reason line under a greyed Skip today, one banner when a save fails.

## Verification

- Unit: the drop weight rule; an accepted drop set carrying no load until the last working set
  and then a step below it, surviving a resume; a warm-up leaving no draft and a working set
  leaving one; skipping with nothing logged, with a warm-up logged, and with every set logged;
  the button's label at zero reps in log, warm-up and edit modes; every failure sentence; the
  update offer staying during a workout and still doing nothing until the tap.
- Browser (`e2e/loggerFixes.spec.ts`, all three device projects): after the ramp sets the plate
  line's total equals the working set's dial; reps turned to zero read Skip set and log a
  skipped row; Skip today after one logged ramp keeps it and raises no failure; the Whole
  workout row opens the finished exercise, whose Skip today is greyed with its reason; Back
  returns to the current set.

## How to check on the phone

1. Workout: log a ramp set, then look at the working set. The plate line names the plates for
   the number on the dial.
2. Turn the reps down to zero: the green button reads Skip set.
3. Log a ramp, open Options, tap Skip today: the ramp stays, the rest show as skipped, no red
   box.
4. Open Whole workout and tap a finished exercise: its card opens for editing, with a line
   offering the way back.
5. Accept a drop set from the coach and finish the working sets: the drop set's weight is below
   the last one you lifted.
