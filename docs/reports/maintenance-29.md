# Maintenance 29: round K, the workout's small comforts

Built on 2026-10-11 on the owner's word: "Proceed through ALL remaining already-agreed items", without
pausing at review gates, which stay YELLOW. Round K is the second of five: items 7, 8, 10 and 14,
each as the owner approved it on 2026-09-24 (proposed in the Round E report, 2026-09-22). None is a
training rule, so none needed research.

## 7. Vibration alongside the rest sounds

**As agreed:** "Vibration alongside the rest sounds, one switch for both."

**Found:** the rest timer buzzed once when a rest ended, and a hold's timer when a hold ran out, but
only while the Workout tab was on screen, and with no switch: the sounds' switch did not reach them.

**Delivered:**

- A short buzz with each of the three last ticks and a double buzz with the end tone, laid with the
  sounds from any tab and stopped the moment the rest is adjusted, paused or skipped. A hold's
  countdown has the same, on its own.
- One switch for both: Settings, "Rest timer sounds and vibration", on as before. Off, neither
  plays. The setting is the one stored before, so a phone keeps its choice.
- The timers no longer buzz on their own.
- A phone buzzes only while the app is in view, after a tap; an iPhone's browser does not at all,
  and there nothing happens. The background notification, where allowed, is unchanged.

## 8. The screen stays on during a workout

**As agreed:** "Screen wake lock during a workout."

**Delivered:** while a workout runs the screen stays on, on any tab of the app. Paused or finished,
it may sleep again, and so it may once the workout is left half an hour with nothing logged, as the
app already calls a workout left open; the next set logged keeps it on again. The browser lets the lock go whenever the app leaves the screen, and the app
takes it again on its return. A phone that refuses it (a low battery) only means the screen may dim,
as before. The barcode at the desk and a hold counting down keep their own.

## 10. The Default time line, only when it says more

**As agreed:** "Hide the 'Default time' line when the dropdown already says it."

**Delivered:** under the length dropdown, which says "Default: N min", the line "Default time:
about N min." no longer repeats it. It still shows whenever it says something the dropdown does not:

- a length chosen, or an end time ("Fitted to 30 min: about 29 min.");
- a plan running over ("It may run a few minutes over.");
- the plan's own minutes, should they ever part from the dropdown's (at the Default every rebuild
  sets both).

## 14. The phone's Back closes a sheet

**As agreed:** the phone's Back button closes any open sheet, as it already closed the barcode.

**Found:** Back with a sheet open left the screen under it, sheet and all: only the barcode's own
views (Maintenance 26) closed on Back.

**Delivered:**

- Every sheet, and the barcode on full screen, now closes on Back, and the screen under it stays.
- Each holds a place of its own in the history, added from the tap that opened it, as the barcode's
  views have since Maintenance 26; two open at once close one Back at a time.
- A sheet closed any other way (its X, Escape, the backdrop, a Save) gives its place back, so the next
  Back leaves the screen as usual and is never spent on a sheet already gone. A place left under a
  page a sheet's link opened ("Manage places" from the place sheet on Today) is stepped past the same
  way.
- A sheet that follows another at once, as finishing a workout goes from one to the next, takes over
  the place the first left, and nothing the first left behind closes the second.
- Escape, on a keyboard, closes the sheet on top only, as Back does: two open no longer both
  closed on one Escape.

## Review

An adversarial reviewer reproduced every finding in tests of its own; each was checked against the
code before it was fixed, and each fix has a test caught by its revert.

- Items 7, 8 and 10 held:
  - the buzz pattern is right for any time left;
  - it stops on a skip, a pause, a change and a finish, and is silent with the switch off;
  - a hold has its own;
  - a phone that cannot buzz is safe;
  - no lock is held for a plan not started, a pause or a finished workout, and the lock is taken
    again on the app's return;
  - the line under the dropdown shows only what it adds.
- **Item 14, MEDIUM, fixed: a Back spent on nothing.** "Manage places" in the place sheet on Today
  opens the Plan tab from inside the sheet. The place the sheet held stayed under Plan's, and the
  second Back from Plan did nothing visible. Such a place is now stepped past.
- **Item 14, the design changed after the review.** The first design kept one place in the history for
  every open sheet, and put it back after Back closed the top one. Chrome can skip, on Back, a place a
  page adds without a tap, and that put-back has none. The built design gives each sheet its own place
  from the tap that opens it, as the barcode's views had when the owner passed them on the phone
  (Maintenance 26). The races the first design solved stay solved: the app takes its own steps back
  after the render and counts them, and a sheet opened in the moment takes the place over or waits.
- **LOW, fixed:**
  - a sheet whose screen keeps it open after Back now keeps a place;
  - the screen of a workout left open half an hour may sleep (item 8).
- **Test gaps, closed:**
  - a sheet opened while the app's step back is truly on its way;
  - the rest timer buzzing on its own;
  - the lock taken again on the app's return;
  - the switch off in the browser;
  - an extra buzz no longer passes.
- **Found in the browser runs:** the app takes a closed sheet's place back a moment after it closes,
  and the browser fixes where that step lands as the app takes it. A page opened within those few
  milliseconds is undone by it. No hand is that fast, and the app itself opens a page in the same
  tap that closes a sheet (a link), which the step reads and leaves alone; the browser tests now wait
  for a closed sheet's place to be given back before they go elsewhere, as a hand would.
- **Kept as limits** (below): a reload with a sheet open, and a Back pressed, or a page opened by
  code, in the instant the app takes a place back.

The run of the earlier rounds' reverts against this round's code found one test that Maintenance 28
had blinded. Round I's check that a field from a newer copy of the app is kept used `pace`, which
Maintenance 28 made a field of this copy. It now uses a field no copy writes, and its revert is
caught again. Six of Maintenance 26's entries were moved to the code Maintenance 28 changed.

## Known limits

- A phone that reloads the app while a sheet is open (a pull to refresh, a tab Android brought back)
  keeps the sheet's place in the history: the first Back after it may do nothing visible.
- A Back pressed in the very instant the app takes a closed sheet's place back can be taken as the
  app's own step and do nothing; a page opened by code in that instant would be undone by the step.
  The app opens none that way.
- On the phone, to check in the review: Chrome's own handling of places added in the same tap as
  another screen (Start at a place whose barcode shows at Start, then Back once: only the barcode
  closes).

## The complete revert run

Each rule this round built, and each fix the review asked for, was reverted on its own in a copy of
the repository and its tests run (`mutate-m29.py`, 32 entries: 11 for item 7, 4 for item 8, 4 for
item 10 and 13 for item 14). Every revert is caught. One entry was dropped as no longer a rule:
giving back every place a closed sheet left in one step, which the check after each step back now
makes a speed-up rather than a rule.

The earlier rounds' tables were run against this round's code, so that nothing built since blinds
a test of theirs:

- Round I's (`mutate-m27.py`, 193 entries): 192 caught at once. The one survivor was the test that
  Maintenance 28 blinded (above); mended, it is caught.
- Maintenance 26's (`mutate-m26.py --all`, 1199 entries): six were moved to the code Maintenance 28
  changed, and all 1199 are caught on this round's code. One, the update prompt's reload, read "no
  tests" under the run's load and was caught when run alone.
- Run again on Maintenance 30's code, this round's own revert 14m (the check after the app's own
  step back lands) passed. Its test relied on jsdom delivering the step back before the app's next
  timer, the reverse of a phone. Maintenance 30 made the test hold the step back as a phone does.

## Verification

`npm run verify`, run alone on 2026-10-11, passed:

- lint and type check;
- unit tests: 2373 passed, 5 skipped by design (253 files), and the day rules' tests again in New York
  and fourteen hours east of UTC, 22 each;
- the privacy scan (776 files, nothing found) and the build check;
- the browser suite: 408 passed, 14 skipped by design.

The unit tests also pass in UTC, as the CI runner runs them (2373 passed).

**Live on 2026-10-11:** `dbd1726`, deployed by Deploy Pages run 38119197463 (success), and the build
marker on the live site reads it. The browser suite against the live site: 404 passed, 18 skipped by
design. A first run, during the owner's internet outage, failed only on name lookups
(`ERR_NAME_NOT_RESOLVED`) and was run again.

## Review on the phone

At the owner's word (2026-10-11), no review gate pauses the agreed work. This round's checks are in
the one consolidated phone review given once every agreed item is live.
