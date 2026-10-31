# Maintenance 36: the schedule watch

Built on 2026-10-31 on the owner's word, after item 48 shipped. It is part 2 of the approved proposal
(`docs/proposals/week-model-readiness-time.md`): "Watch after a move. Compare the weeks after a
schedule change with the weeks before. If it's clearly worse than normal week-to-week noise, show
one card with the old schedule one tap away. If not, stay silent." The revision set its numbers:
"Four weeks against four weeks can detect about a 5% drop, but only if it shows in two or more lifts
and persists after a few easier days", declines only. It rests on
`docs/research/recovery-time-course.md` (Schedule watch, As built); every number is in the rules
table (`src/engine/rules/ruleTable.ts`, `watch...`), each marked research or judgement with its
source. YELLOW: waiting for the owner's consolidated phone review.

## What it does

- **A change is kept.** Each change of the sessions a week or the days, from Settings or the coach's
  card, keeps one record: when, the schedule before, the schedule after, and when that one was set.
  Two changes within a week are one change, and one undone within the week is none. The record is a
  meta record, copied to the cloud like the rest; one that does not read is never written over, and
  the watch says nothing. A schedule set again since without a record of its own leaves it nothing
  to compare.
- **What it reads:** the compound lifts' first working set of each session, read as a max. Where the
  plan asked the same range and reserve, sets are compared as lifted, so a load the plan lowered
  after missed sets reads as the fall it is; where it asked another range or reserve (a deload
  week, a new split's range), each is read against what it asked. Days ill or after a short night
  are left out.
- **The four weeks after the change against the weeks before**, read once when they are over: the
  lifts together must be clearly under, beyond week-to-week noise (4% a session, or the lift's own
  spread from ten sessions, never less), and two or more must each be under by more than their own
  noise (about 5% at four sessions a side).
- **Then fresh sets:** each of those lifts' first set after the four weeks that came three days or
  more after its muscles last had hard sets, together still under beyond their noise. A fall that
  clears after easier days is a hard stretch passing, not the schedule. Nothing is said in the first
  four weeks, or after eight.
- **The card**, before a workout starts, under the owner's card limits and below a same-day recovery
  card: "Barbell Bench Press and Back Squat down since the schedule changed", about how far each
  fell, that they are still down after easier days, and under the card, never cut, the schedule
  before, with **Go back to it**. The tap puts that schedule back, and the way back is a change the
  watch leaves alone. Not now keeps it away for that change.
- **Settings, Coaching:** "After a schedule change", on until turned off, beside the other three.

## Measured

In simulation (`src/engine/planning/scheduleWatch.simulation.test.ts`), seeded lifters with the
research's noise, 4% a session, the watch read every day from week 4 to week 8:

- **No real change:** a false card for 0 to 1.2% of 500 lifters, on upper and lower body twice a
  week, full body three times, each lift once a week, a fifth of the noise shared by the day, a
  stalled lifter and a 1% a month trend. Before the review's fixes the reviewer's simulation of a
  default rotation was told a false fall 44% of the time.
- **A lasting fall:** 8% in every lift found for 99.7 to 100% of 300 lifters, 8% in the
  upper-body lifts alone 98%, and 6% twice a week 98%.
- The test runs each on a hundred lifters, held to 3% or fewer false cards and 90% or more falls
  found.

## Not taken

- **A stall check:** it needs 8-12 weeks (the research), and the approved proposal watches declines
  only.
- **Matching the time of day** (the research: "compare the same time of day"): a change that moves
  the sessions from evenings to mornings can read as a fall.
- **A lifter's own spread under 4%:** a steady spread is never trusted to make the watch quicker to
  speak.

## Review

One bounded adversarial review of the change from main, with simulations of the watch under the
research's own noise: three HIGH, two MEDIUM, eight LOW. All fixed with tests and revert entries,
and each fix run again against the reviewer's own probe: every probe that showed a fault now fails
on the fixed code, and the simulations give the numbers under Measured.

1. **HIGH: far more false cards than "clearly worse than normal week-to-week noise" allows.** Each
   lift was tested alone, any two sufficed, and the watch read every day: in simulation the default
   rotation (twenty lifts, each once a week) was told a false fall 44% of the time, upper and lower
   body 24%. Now only compound lifts are read, the four weeks after the change are read once, the
   lifts together must fall beyond the noise of their mean before two or more count each, and
   persistence comes from fresh sets after those four weeks; the simulation is a test now.
   (W6, W10, W21-W26)
2. **HIGH: a lasting fall the plan absorbed went unseen.** After two missed sessions the plan
   lowers the load 10%; sets then lifted as asked read as no fall, however far the max had dropped.
   Now sets the plan asked the same range and reserve of are compared as lifted; only another range
   or reserve is read against what it asked. (W15, W16)
3. **HIGH: "still under after easier days" was not read in time.** Every easier set since the
   change counted, so a dip over by its third week still made a card saying it was still there. Now
   the first easier sets after the four weeks decide it. (W23-W26)
4. **MEDIUM: Not now came undone when one of the card's lifts recovered,** as the card's source
   named its lifts. Now it holds for the change: what the card offers, the schedule before, is the
   same. (C7, C8)
5. **MEDIUM: an intermediate or advanced lifter never saw the schedule the card goes back to:** two
   Why lines cut it. Now it is under the card, never cut. (C5)
6. **LOW: the card could take the day's one new card from a same-day "too soon" card,** on an
   alphabetical tie. Now it ranks below a same-day recovery card. (C6)
7. **LOW: the noise counted every set, not the ones that paired with a set before.** Now only those
   that pair. (W8, W14)
8. **LOW: a schedule set again since without a record, and later set back, fooled the watch into
   reading the old change.** Now the record keeps when its schedule was set, and the watch reads it
   only while that holds. (W5, R6)
9. **LOW: words and rules out of step:** "three days" written out where the rules hold it, "a
   change of your days" where the sessions a week count too, the research's 10 reps where the
   first-set reading takes 12. Now in step.
10. **LOW: easier days counted from a session's end,** so one past midnight moved a day. Now from
    the day it began, as the app counts a workout's day. (E3)
11. **LOW: a missing flag read as a change to watch.** Now as one left alone, the quiet side. (V2)
12. **LOW, latent: the workout screen dropped the way back's flag.** The card never shows there, but
    it now passes the flag on, as Today does.
13. **LOW: the research's "compare the same time of day" was neither built nor said.** Now under
    Not taken.

Before the review, the lifter's own spread was added (the research: "after about 10 sessions, use
the person's own SD around their trend"), never under 4%, so a noisy lifter is not told a fall the
noise made.

## Reverts

`tools/reverts/mutate-m36.py`, 58 entries (`table_m36.txt`), all caught on the final code: when it
reads (W2-W5), what it reads (W6, W8-W12), how a fall is measured (W13-W20), what makes a finding
(W21-W26), the days of easier work (E), the record a change keeps (R), the stored record (V), the
store (S), the card (C), and the screens (U, X).

- **The first run, on the code after the review's fixes: 57 of 60 caught.** Of the three others, two
  were guards others already hold, now gone from the code: nothing in the first four weeks (W1: the
  watch speaks only on sets after them) and four sessions a side (W7: four that pair holds it). The
  third, X1, showed that no test read a switches record kept before the watch: one does now, and it
  reads the watch on.
- **The second run, on the final code: 58 of 58.**
- **The older tables:** the nine entries whose anchor lies on a line Maintenance 36 changed, or that
  run a test file it changed, run again on the final code: item 48's L6, M27's 47c, R47-9, R46-10b
  and R46-10c, M33's W16 (with `--utc`), and M34's U6 and U7, all caught. Checking every table's
  anchors found three gone with the code, each re-anchored and caught: M27's 46j (the move passes
  the way back on), M34's G13 (the card limits hold the watch's card too) and X1 (the switches'
  defaults).
- Every table's anchors are found. The complete run of every table waits for the consolidated
  phone review, as the revert README says.

## Verification

- **Local**, `npm run verify` on the final code (`8a4292d`): lint and types clean; unit 3,881 passed + 5
  skipped by design (645 files); the day rules in two more zones, 96 + 96; the privacy scan, 1,233
  files; the build checked; the browser suite 443 passed + 14 skipped by design.
- **CI:** the branch's run 41237890112, success, on a slow runner (unit tests 8 minutes, the browser
  suite 15) inside the 40-minute limit; Deploy Pages run 41239957729, success.
- **Live:** the marker reads `8a4292d`. Live suite from the owner's machine: 438 passed + 19 skipped by design; one storage test on the 360 px project missed a line of the cloud card once after a page load and passed 3 of 3 alone, and the 10 PWA tests that wait on it were run after it (5 passed, 5 skipped by design).

## Review on the phone

The card needs four weeks of training after a change of the days and a clear fall in two lifts, so
there is nothing to make it show on the phone, and no schedule needs changing for the review; the
card itself is in the tests (`src/features/today/scheduleWatchCard.screens.test.tsx`).

1. Settings, **Coaching**: "After a schedule change" is on, with its line under it. Turn it off and
   on again: it stays as turned.
