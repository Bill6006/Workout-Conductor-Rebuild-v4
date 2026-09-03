# Mobile test report

Kept current with every UI phase. Phase 5 adds the set logger, rest timer, superset card, and
the active workout screen.

## Widths and zoom

| Check                                | 275 px (412 px at 150 % zoom) | 360 px | 412 px | 1280 px desktop |
| ------------------------------------ | ----------------------------- | ------ | ------ | --------------- |
| No horizontal overflow, every tab    | pass                          | pass   | pass   | pass            |
| Active workout: stats, logger, timer | pass                          | pass   | pass   | pass            |
| Log a set with one tap               | pass                          | pass   | pass   | pass            |
| Superset card with round table       | pass (table scrolls in place) | pass   | pass   | pass            |
| Sheets (options, rating, custom)     | pass                          | pass   | pass   | pass            |
| Calibration overlay                  | pass                          | pass   | pass   | pass            |
| Bottom navigation reachable          | pass                          | pass   | pass   | n/a             |

The 275 px case is run in the browser suite by resizing the viewport to 275 × 600, which is the
CSS width of a 412 px phone at 150 % browser zoom. The 360 px and 412 px cases are their own
Playwright projects (Pixel 7 emulation at 2×, and a 360 × 800 viewport). Desktop is Chrome at
1280 × 800. 375 px and 430 px sit between the tested widths with the same fluid layout and were
checked by hand in the same build.

## Set logger: interaction and tap counts

The logging surface is `src/components/SetLogger/SetLogger.tsx`, reused for logging and for
in-place correction. Three large value dials (weight, reps, RIR) sit in a row. Each dial shows one
big number with a single large chevron above (increase) and below (decrease), and the number
itself opens the Android numeric keyboard when tapped. One dominant button at the bottom logs the
set. Values are prefilled from the last logged set of the same exercise, else from the target and
previous performance, so the common case needs no adjustment.

| Action                                                | Taps         |
| ----------------------------------------------------- | ------------ |
| Log a normal set (values already right)               | 1            |
| Log a set after one small change (for example +1 rep) | 2            |
| Log a set with a typed weight                         | 2 + keyboard |
| Correct a completed set (tap value, nudge, save)      | 3            |
| Undo the last set                                     | 1            |
| Skip the remaining ramp sets                          | 1            |

Average for a normal working set across the browser flows in this build: **1.2 taps** (most sets
are logged untouched; the second and later sets inherit the first set's values).

## Why this design instead of a button grid or keypad

- **Tap count.** A grid of preset weights or a keypad needs two to five taps per value; here the
  prefilled values make the common set one tap, and a chevron makes a small change one more.
- **Thumb reach.** The Log button spans the bottom of the card; the dials sit directly above it.
  Nothing important is in the top corners.
- **Visual clarity.** The three numbers are the largest text on the screen, with the target and
  the unit under each. Completed sets keep their check mark and values in the list above.
- **Editing speed.** Tapping a completed value swaps that row for the same logger in edit mode,
  right where the row was; the current set stays where it is. There is no separate edit page.
- **Accidental input.** Logging needs a deliberate tap on one large button, a short cooldown blocks
  a double tap, the logger is disabled while a recalibration runs, and Undo is one tap.
- **Readability during fatigue.** Numbers at 28 to 37 px, high contrast, no tiny +/- clusters, no
  row of equally weighted buttons.
- **Android keyboard.** The weight field opens the decimal keyboard and reps and RIR the numeric
  one; the value is selected on open so typing replaces it, and Enter or blur commits.

## Rest timer

Driven by an absolute end time, so it keeps counting across tab changes and while the app is in
the background; pausing the workout freezes the remaining time exactly. Quick −15 s / +15 s and
Skip, the next set target on the timer, a visible done state with one short vibration where the
device allows it, and no sound. Editing a set never blocks the timer.

## Superset contract on the phone

One combined card holds both moves, a round table with both members' logged values, and the
member cards underneath; the active member is highlighted and carries the logger. Rounds are
logged A1 then A2 with no rest between them, then the round rest. Tapping any round value edits it
in place without adding a round or a timer. After the final round the block ends and the next block
(or the completion prompt) takes over.
