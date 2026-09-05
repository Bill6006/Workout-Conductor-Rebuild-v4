# Maintenance 1: coaching by experience, and stall routes

The plan's eight phases are complete. This round came from the owner's request to make the
coach smarter without adding buttons: the coach now reads the experience level chosen in
Settings, stays quiet about the obvious past beginner level, and diagnoses a stalled lift by
exposures at the prescribed effort, then walks a saved route of one-tap steps.

## Delivered

- **Coaching policy by experience** (`src/engine/coach/experience.ts`). Beginner: explained
  cards with three reasons and the footer, the "follow today's plan" card when nothing outranks
  the plan, and every progression nudge. Intermediate and advanced: two reasons, no footer, one
  quiet line instead of an all-clear card, and no card that merely restates a target ("load
  goes up", "ready for more load", "aim one rep higher", superset readouts). Deloads, resets,
  extra-set offers, safety, recovery, and stalls still speak to everyone.
- **Progression by experience** (`src/engine/progression/progression.ts`). Strength roles:
  beginners and intermediates add load after one clean session (floor cleared with reps in
  reserve); advanced lifters after two in a row, with no tolerance under the prescribed RIR.
  Double progression: advanced lifters need two sessions at the top of the range before load
  moves; one more rep per set comes first. The "Why this target" line says which policy held.
- **Stall detection by exposure** (`src/engine/strategy/plateau.ts`). An exposure is one
  session with completed working sets of a lift. A stall is the newest N exposures (3 beginner,
  4 otherwise) with no better estimated max than the oldest of them, at the prescribed effort
  (sets ending within half a rep of the target RIR). Sets ending far from failure are diagnosed
  as undershooting instead, with the next load step on offer; missed reps stay with the
  progression engine's deload rules; a session at the top of the range is progression's job.
- **Coach routes.** A stalled lift opens a route: shift the rep range, swap for a variation,
  short deload, add a set. The card shows the whole route with the current step marked, one
  reason line, and the step as its one action. Tapping records the step; after two more
  exposures without a better max the next step is offered; the moment the max moves the route
  closes. Routes live in the meta store, are backed up, and survive restore.
- **Surfaces unchanged.** The one gold card, the "Why this target" list, and the existing
  recalibration triggers carry everything. No new buttons. Nothing is applied without a tap.

## Verification

- Unit: policy, progression under each policy, stall detection and route reconciliation,
  conductor filtering and route actions, the card's quiet state, and route persistence in the
  store across a reload.
- Browser: the coach card in brief and explained tones; a stall built from an imported older
  export shows the route and its one-tap step, and the step changes today's session.
- Totals and the deployed build are in `PROJECT_STATUS.md`.

## How to check on the phone

1. Settings: set experience to Advanced. Today's coach card becomes one quiet line when nothing
   outranks the plan, and never says "add weight" when the target already says so.
2. Import an older export with four sessions of the same bench load at the prescribed effort
   (the browser spec's fixture shape is in `docs/backup-and-restore.md`). Today shows "Barbell
   Bench Press has stalled for 4 exposures at the prescribed effort", the route, and one step.
3. Tap the step: the bench target changes for this session and the route remembers it.

## Decisions and notes

- Stall thresholds and progression cadence are policy constants in one file, so they can be
  tuned without touching the engines.
- A route step is recorded when tapped, even if the sheet it opens is then cancelled; the next
  two exposures decide whether the step counted.
