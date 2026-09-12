# Maintenance 8: session polish

Round three of the owner's second list, started on 2026-09-12 after Maintenance 7 went GREEN:
the skimmable tempo detail and the Location sheet on Today.

## Delivered

- **The tempo detail reads in a glance.** The tap on the tempo chip now opens four labelled
  rows, each one line: Tempo, Cue, Effort, Rest. The research sits behind one "Why: the
  research" disclosure, closed by default. Each research line carries a bold two-word lead
  ("Rep speed.", "Lowering.", "Effort scale.", "Rest.") so the eye can skip; the duplicate
  ramp-set line is gone (the tempo and the effort guidance each explained ramp sets); "X is as
  fast as you can" appears only when the tempo has an X; the rest-style line appears only when
  the profile's rest style is not Standard. Same information, about a third of the height.
- **Location in a sheet, not a tab change.** The Location control on Today opens a bottom
  sheet listing every saved place with today's marked. One tap switches: the profile saves, the
  preview rebuilds for that place's equipment through the existing location recalibration with
  its banner, and Settings shows the same choice because it is the same stored place. A
  "Manage places on the Plan tab" link at the bottom is the only way into editing equipment.
- **A lean active card** (added after the owner's first look at the live build). The card said
  the same thing three times: a target line in the header, a "now" row in the set list, and the
  logger. Now the logger alone names the set, as "Set 2 of 3", and the header's target line is
  gone. The set list drops the "now" row, folds finished ramps into one line that opens on tap,
  and keeps each finished working set as its own editable line. The phase legend under the tempo
  bar goes, because the tempo chip already carries it. "Last time" and the role live behind How
  to, so the header keeps that line only when the "Know your max?" offer is on it. About half
  the height, with the eye landing on the logger.
- **A zero-rep log is a skip.** Logging a set with zero reps recorded it as a real set of zero,
  which showed as "0 lb x 0 @ RIR 0" with a tick and fed the engines. It now records as skipped
  with no weight, and in-session autoregulation never sees it.
- **A regression caught by the owner, and fixed.** Hiding the phase legend left its reference
  empty, and the bar's animation required both the fill and the legend before it would start,
  so the fill stopped moving on every card. Only the fill is required now, and a test covers
  the no-legend case. Two more from the same round went with it: a skipped set could become
  the next set's prefill, and the set row's dead current-state styling is gone.
- **Surfaces.** No new buttons: the same tempo chip and the same Location control, one sheet
  behind the latter. Nothing is applied without a tap.

## Verification

- Unit: the evidence lines (leads, the dropped duplicate, the rest-style rule); the card's four
  rows and the closed disclosure; the set list with no repeated current row, folded ramps that
  open on tap and carry Undo, and editable finished working lines; a zero-rep log recorded as a
  skip that never triggers autoregulation.
- Browser (`e2e/sessionPolish.spec.ts`, all three device projects): four rows in order, no
  "X" phrase on a tempo without one, the research hidden until opened, one ramp line, no
  rest-style line at the Standard style; the Location sheet switches to Home without leaving
  Today, the banner reads "Rebuilt for Home", and the choice survives a reload. Accessibility
  and zoom sweeps still pass with the new markup.

## How to check on the phone

1. Workout, tap the tempo chip: four rows, then "Why: the research" folded. Open it: short
   bold leads on every line.
2. Today, tap Location: the sheet lists your places with today's marked. Tap Home: the preview
   rebuilds on the same tab and the banner says so. Settings, "Places", shows Home too.
3. Workout, mid-exercise: the card names the set once, in the logger. Finished ramps sit on one
   line that opens on tap; finished working sets stay one line each and still open the editor.
