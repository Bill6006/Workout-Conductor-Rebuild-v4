# The final polish: two LOW fixes (2026-11-02)

Fixed on the owner's word of 2026-11-02: the two LOW items the final reconciliation had left for it,
"one final bounded polish/accuracy fix", outside the rounds. YELLOW: waiting for the owner's phone
review, like every round since 2026-10-11.

## 1. Why this workout after a swap

**As reported:** after a lift is swapped on Today, Why this workout can still say the lift swapped
out "leads as the primary strength lift", though the plan no longer holds it.

**Confirmed:** on the live build (`375eb5f`), the bench press swapped for the dumbbells on Today, Why
this workout still read "Barbell Bench Press leads as the primary strength lift with full rests and
warm-up ramp sets." After each change the lines on what leads were made true of the plan again
only while the lift they named was in it; a line whose lift had gone was kept as it was
(`keepOrderLines`, Maintenance 25).

**The fix:** one rule, `withOrderLines` (`src/engine/workoutGenerator/orderLines.ts`), read wherever
the lines are made or shown:
- The main lift's line names the main lift as a build picks it, among the lifts still to do: the
  first in the main lift's role, never the week's extra; in a plan built with none in that role (a
  catch-up, a second workout), the first lift, as the build does. After a swap, that is the lift
  swapped in; once begun, the lift carrying the sets of one swapped out.
- A main lift stopped keeps its line while nothing else carries that work: it is still the day's,
  on the screen.
- The lift to push's line shows only while its lift is still to do.
- On the screen a line with no lift to name is left out; in the plan as saved it is kept as it
  was, so a swap back finds it again.
- It runs after every change to the plan, and on the card as it draws, so a session saved by the
  build before shows the plan on the screen too.
- Which workout is chosen, and how it is built, is unchanged: only the lines are read again.

## 2. Settings' "Learned from your log"

**As reported:** the row's summary named the habit, each lift's curve, reserve, pain patterns and
declined offers, and left out Your pace and Your recovery, both on the page it opens.

**Confirmed:** the summary was a fixed string beside the page's own list of seven sections. On the
live build at 360 px it also took three lines where the row shows two, so its end was cut off.

**The fix:** one list (`SECTIONS` in `src/engine/learned/learned.ts`) builds the page and the row's
summary: "Pace, recovery, habit, lift curves, reserve, pain and declined offers", every section in
the page's order. The short names keep it within the row's two lines at 360 and 412 px, in a wide
font too; "each with a reset" made way for them (the page says it of each section). Nothing the app
learns has changed. Known limit: with the phone's text at 130 % in a wide font at 360 px, its end is
cut, as the row clamps every summary to two lines.

## Tests

- `src/engine/workoutGenerator/orderLines.test.ts`: the rule on its own. A plan as built is left as
  it is; a swap names the lift swapped in and keeps every other line; a stand-in once begun; the
  week's extra passed over; a stopped main lift kept; a lift taken out with no other in its role,
  off the screen and kept in the plan as saved; never one lift twice; the lift to push's line once
  its lift is swapped out or stopped; a catch-up built with no lift in the main lift's role, swapped
  and swapped back.
- `src/core/state/whyAfterSwap.store.test.ts`, the regression as asked: the bench press swapped on
  Today, gone from the plan, and Why this workout naming the dumbbells; the same lines once saved and
  opened again, and once built again at another length; a second swap, and a swap back; and with a
  lift to push, a swap and a swap back leaving every line as built.
- `src/features/today/whyAfterSwap.screens.test.tsx`: a session as the build before saved it, its
  line still on the lift swapped out, opened again on Today: Why this workout names the lift on the
  screen. And the lift to push swapped out after a set: no line names it to lead.
- `src/engine/learned/learned.test.ts` and `src/features/settings/learnedSummary.screens.test.tsx`:
  the row names all seven sections in the page's order, and the page shows them.
- `e2e/zoom.spec.ts`: the row's summary shown whole at each phone width, in a wide font too.

## Review

One bounded adversarial review, with probes and sweeps: 448 plans as built, at Home and the Gym, at
four lengths and seven profiles (the lift to push and the week's extra among them), and 502 swaps
with swaps back and 692 changes after them (busy equipment, a reorder, a length, a place, comfort,
pain, a skip, harder). It found three, all fixed with tests:

1. **MEDIUM, the lift to push swapped out once begun.** Its line still said it led ("Barbell Bench
   Press leads: the lift you are pushing to 225 lb goes first ...") beside the line naming the
   dumbbells carrying its sets; the week's extra the same. The line now shows only while its lift is
   still to do, as a build of that plan shows it.
2. **MEDIUM, a catch-up or a second workout built with no lift in the main lift's role.** Its line
   ("Lateral Raise leads as the isolation lift ...") stayed on a lift swapped out once begun, and
   went for good on a swap made before. The line now follows the first lift, as the build does.
3. **LOW, from this fix's first version: a swap and a swap back lost a line for good** (the lift to
   push's, or a catch-up's only one), though the plan was the one built. The plan as saved now keeps
   a line its lift has left, for the screen to leave out, so a swap back finds it again.

The review's probes, run again on the final code, show each of the three fixed. Its sweeps, run
again on the final code, report nothing wrong: the 448 plans as built show every line as built; after
the 502 swaps and the 692 changes after them, no line on the screen names a lift the plan no longer
holds, says a lift leads that does not come first, or leads beside another, and no plan shows two
lines on its main lift; and every swap back gives back every line as built.
Checked and sound: a kept swap, Undo, the app opened again, a place change, which workout is
chosen, and the summary (accurate, and alone in naming the learned systems).

## Reverts

`tools/reverts/mutate-final-polish.py`: 16 entries, each the revert of one part alone, all caught.
Of the earlier tables, M33's P4 and the priority-muscles fix's P14 sat on lines this fix rewrote:
both moved with them and are caught, and the other entries on its changed lines (M27's 11, the
priority-muscles fix's P15 and P16) were run again and are caught. Every runner finds every anchor.

## Verification

- `npm run verify` on the final code: lint, type check, unit tests (4018 passed + 5 skipped
  by design, 668 files, and the day rules in two more zones), the build, the privacy
  scan, verify-build, and the browser suite (446 passed + 14 skipped by design).
- The phone steps below, walked as written by a scratch spec on a local build, at 412 and 360 px. On
  the build before (`375eb5f`) the same spec fails at step 2: the barbell bench press still
  named to lead after the swap.
- CI on the branch, run 44849731347: green.
- Deploy Pages run 44852421061: the live marker reads `6138e89`. The live suite from the
  owner's machine: 435 passed + 14 skipped by design; one test timed out loading the live page and passed on its own re-run. The phone steps on the live build: passed at 412 and 360 px.

## Review on the phone

In a Chrome Incognito tab at the live URL, tap **Use defaults and skip setup**: the tab has its own
empty storage and no cloud token, so nothing here reaches your own plan or history.

1. **Today**, at the Gym: open **Why this workout**. One line names the main lift, "... leads as
   the primary strength lift with full rests and warm-up ramp sets." (on a push day, the barbell
   bench press).
2. Tap that lift on Today, and in its sheet pick one of the lifts offered (**Use ... instead**). Why
   this workout now names the lift swapped in, "... leads as the primary strength lift ...", and no
   line names the lift swapped out as leading.
3. Reload the page: Why this workout says the same.
4. **Settings**, **What the app has learned**: the row reads "Pace, recovery, habit, lift curves,
   reserve, pain and declined offers", none of it cut off. Open it: Your pace and Your recovery are
   on the page, with the other five.

Close the Incognito tab: everything in it goes.
