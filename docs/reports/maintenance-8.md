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
- **Surfaces.** No new buttons: the same tempo chip and the same Location control, one sheet
  behind the latter. Nothing is applied without a tap.

## Verification

- Unit: the evidence lines (leads, the dropped duplicate, the rest-style rule); the card's four
  rows and the closed disclosure.
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
