# Maintenance 22: round D, swaps you can trust

Built on 2026-09-23 on the owner's word: "Proposed are approved. Please proceed with the next
phase/round. Make sure to keep thing intelligent." Round D is the owner's items 29, 28 and 23, the
three about swapping an exercise, in the order recommended: 29 first, because it could ask for a
barbell's weight on each dumbbell. Maintenance 21 stays YELLOW until the owner reviews it.

## 29. A swap once sets are logged

**Found, at the owner's gym:** a set of the bodyweight Standing Calf Raise was logged, then the
Leg Press Calf Raise swapped in, and every set after that asked for no weight ("Enter a weight").
Swapped in fresh, the Leg Press Calf Raise gets a target of about 140 lb. The cause was in the
engine since Phase 4: a swap re-targeted only an exercise with nothing logged. One with a set
logged (or skipped) was renamed and kept the old exercise's targets for the sets still to come,
so a Barbell Bench Press at 100 lb swapped for dumbbells after one set asked for 100 lb in each
hand (about 40 fresh). The sets already logged were filed under the new name too, so the
barbell's 100 lb would have read as a dumbbell weight in the history.

**Delivered:**

- A started exercise stops at what it logged, and those sets stay under its own name.
- The new exercise follows it right after, for the working sets still to come, with its own
  target: from its own history, allowing for the work already done today, landing on weights the
  place has. Ramp sets follow the usual rules, so a second pressing movement after the first gets
  none unless it is markedly heavier.
- Its dial starts from its own target, never from the weight typed on the exercise before it.
- Swapping back to the exercise that stopped picks it up again for the sets still owed, instead of
  putting it in twice.
- An exercise with every set done has nothing left to swap, and says so.
- Undo of the swap is offered until a set is logged on the new exercise; after that it would lose
  the set, so it is not offered.
- In a superset whose rounds have not started, the new exercise takes the stopped one's place and
  the pairing goes on. Once rounds are under way the two moves' sets no longer line up, so the
  pairing ends and each move runs its own sets.
- The summary reads as one swap ("Swapped Barbell Bench Press for Dumbbell Bench Press."), the new
  exercise is tagged Swapped, and nothing reads as trimmed.

## 28. The rest of the Smith machine fix

**Delivered:**

- A stopped exercise says so on Today: "Stopped: 1 of 4 sets done", or "Stopped before its working
  sets" when only its warm-up was done, in place of "0 × · 1 warm-up · 2.5 min rest · Smith
  machine". It no longer carries the Main lift badge; the exercise carrying its sets does.
- Back at a place that has the machine, an exercise the place stopped picks up again for the sets
  still owed, and a stand-in with nothing logged gives way. One already started stays. An
  exercise swapped out (by the lifter, for busy equipment, or for a joint that hurts) stays
  stopped until it is swapped back from its stand-in's sheet.
- A workout stopped by the older code, with no count written, picks up again or gets its stand-in
  at its next rebuild.

## 23. A swap kept for a few weeks

**Delivered:** above the alternatives in the exercise sheet, a switch "Keep it for the next 4
weeks", off by default. Kept, the plan picks the exercise swapped in wherever it would have picked
the one swapped out, as long as it fits the place; elsewhere the plan's own pick stands, and an
exercise is never in twice. Where the one swapped in is already in the workout, the next best goes
in. The exercise swapped out is not offered by the coach either. The workout's explanation says
when a kept swap was used. The Plan tab lists each kept swap with its end date and Stop. Undo on
the swap takes the kept part back too; a later change's Undo does not. The reasoning and sources are in `docs/research/lasting-swaps.md`:
changing exercises in a planned way can help, and changing them too often can hold gains back
(Kassiano et al., 2022, PMID 35438660), so a kept swap lasts a block of weeks, not a session.

## Review

Two independent reviews ran on the first build of the round, one on the engine and one on the
store, screens and saved data. Each finding was proved with a test that failed; all are fixed, and
each fix has a test that fails when that fix alone is taken back out.

Engine:

- A swap kept for weeks let the exercise swapped out back in through a second slot of the same
  kind (a pull day's second curl). It stays out of the whole plan now.
- A stopped exercise could pick up again after the lifter's own choice: after its stand-in was
  skipped, pinned and unpinned, or swapped in for a joint that hurts. An exercise now records why
  it stopped, and only a stop the place made picks up again; skipping a stand-in skips the sets
  it carried too.
- A lift the coach had added, swapped out for busy equipment, lost its sets at the next rebuild;
  the stand-in now keeps the lift's lock.
- A change of weights or a new max gave a stopped exercise its sets back. Both leave it alone.
- Uncomfortable on an exercise with every working set done announced a replacement that never
  came and dropped its drop set. It now says the exercise is done.
- A stand-in ignored a deload week and the day's fatigue. It follows both, like every exercise
  the plan picks.
- Swapping back could not be reached from the app: the swap list left out every exercise already
  in the workout, the stopped one included. The list now offers the exercise a stand-in took over
  from, and only that one, so the work of another slot never moves onto it.
- A swap back read as sets trimmed. It reads as one swap.

Store, screens and saved data:

- Undo after a swap of a swap, after the app was reopened, after a change that failed, or the
  moment the swap landed could leave the kept swaps wrong. The swap now saves the kept swaps as
  they were with the workout Undo returns to, and Undo puts them back.
- The keep switch stayed on the next time the sheet opened, even after Undo. It resets.
- A stopped exercise counted a skipped set as done. Only logged sets count.
- Keeping a swap that could not be saved failed silently. It says so, and nothing is kept.
- Kept on an exercise already swapped in once today, a swap was saved for that one and would
  never have applied. It is saved for the plan's own pick, which the switch names.

## Second review

An independent re-check of those fixes found eight more, each proved with a test that failed. All
are fixed. Each fix has a test that fails when that fix alone is reverted. The screen part was
checked end to end the same way.

- A kept swap let the exercise swapped out back in when the one swapped in was already in the
  workout, either picked on its own or kept from before a rebuild. It stays out now. Its slot
  takes the next best, and the explanation says so ("Incline Barbell Bench Press in place of
  Incline Dumbbell Press, which you swapped out.").
- Undo on a swap put back every kept swap as it was before, which revived one stopped on the Plan
  tab since. Undo now takes back only what that swap changed.
- Skipping the exercise that took over a stopped one made the stopped one read "Stopped: 1 of 1
  sets done". It keeps its count ("1 of 4").
- An exercise swapped out after only its warm-up was saved in the history as skipped, and the
  strategy counted a swapped exercise twice in one workout, which halved how often it seemed to be
  swapped. Both are counted as swaps, once a workout.
- The coach could suggest adding an exercise the lifter had swapped out for weeks. It no longer
  does.
- Swapping back inside a superset left the exercise that stopped still paired. It leaves the
  pairing.
- The swap list could offer back an exercise stopped in another slot. It offers only the one
  stopped in the same slot.
- A stopped exercise still offered its changes (sets, rest, pin, busy equipment and the rest), and
  a change could give it sets back. The engine refuses them. The sheet shows one line in their
  place: "Stopped: 1 of 4 sets done. Dumbbell Bench Press took over the rest."

## Third review

A third independent review found eight more, each proved with a failing test. All are fixed,
and each fix has a test that fails without it. The screen parts were checked end to end.

- Undo on a swap, after a set was logged on the new exercise, put back a workout without that
  exercise. The set was lost, and every change after that failed. Undo is not offered once a
  set is logged on an exercise the change brought in, and the same goes for an exercise the coach
  added.
- On a day with two curls, keeping EZ-Bar Curl swapped for Cable Curl made "Why this workout" say
  the second curl slot's usual Dumbbell Curl was "in place of EZ-Bar Curl". The plan now judges
  each slot's own pick as if no swap were kept.
- A kept swap was named in "Why this workout" even when a short workout left the exercise out.
- An exercise whose replacement was then skipped was saved as neither skipped nor swapped. It is
  saved as skipped.
- The coach's fewer-reps card could suggest the very exercise the lifter had swapped out for
  weeks. Any card whose button would change a stopped exercise is no longer offered, since the
  engine would refuse the tap.
- After a chain of swaps across two slots, the keep switch could name the wrong exercise, and
  skipping one exercise could mark another slot's stopped exercise as skipped. Both stay within
  the exercise's own slot.
- Keeping a swap on an exercise that a kept swap had put in ran only to the first swap's end
  date. It runs four weeks from when it is kept, as the switch says.
- Two kept swaps saved at nearly the same moment could each undo the other's save. The saves now
  wait their turn.

## Fourth review

A fourth independent review found seven more. Four were in the third round's fixes. This round
fixes each one where it starts rather than where it shows, and each fix has a test that fails
without it.

- Undo could still misfile or lose a set, for instance a set lifted on an exercise swapped before
  it started, a set a change added, or a set given back when a place was left and returned to.
  Undo is offered only while every set logged so far keeps its place, on the same exercise, in
  the workout Undo would bring back. That is the engine's own rule for every change.
- When a kept swap's save failed while the lifter did something else (kept another swap, pressed
  Stop, pressed Undo), the Plan tab and the saved list could disagree, and a message could say
  "The swap is made" after the swap was undone. Now the failed keep alone is taken back and the
  list is saved again. Nothing is said when the swap was already undone. The message no longer
  says "Try again from its sheet", which the sheet does not offer.
- After a rebuild (a new length, say) that kept a swapped-in exercise, the false "which you
  swapped out" line came back. It no longer does, and the kept swap's own line now stays.
- The third round's generator fix could put two heavy hinge lifts in one plan, for instance a
  kept swap of Back Squat to Trap Bar Deadlift next to the Romanian Deadlift. Such a plan blocked
  every later change. An exercise the plan would pick now has to fit the plan as it actually is.
- The third round's coach fix dropped a whole card when its button aimed at a stopped exercise,
  including a safety card. The coach now aims every offer at an exercise still to do, so the card
  moves to the next one.
- A stopped exercise's row counted a set deleted from it as done. It counts the sets logged.

## Fifth review

A fifth independent review found five more, each proved with a failing test. All are fixed, and
each fix has a test that fails without it.

- Undo after a new workout length could save a warm-up as a working set, or the reverse, because
  the new length moved where the warm-ups end. Undo now also checks that each logged set is the
  same kind of set in the workout it would bring back.
- A kept swap whose exercise could not join the day (Front Squat kept for Leg Extension, on a day
  led by Back Squat) left the slot empty, and "Why this workout" said no knee-extension exercise
  fits the Gym. When nothing else fits, the plan's own pick now stays. A kept swap applies where it
  fits, as the switch says.
- When saves kept failing, the Plan tab could show a kept swap that was never saved, or the
  reverse. Kept swaps are now changed one at a time: each is saved first and only then shown.
  When a save fails, the Plan tab shows what is actually saved, and a message comes only when
  something the lifter asked for was not saved.
- "Why this workout" could still name a kept swap after its exercise was swapped out for today,
  or after the swap was stopped during a workout, and after a rebuild at Home it could credit a
  kept swap for a pick the plan made on its own. Each exercise a kept swap puts in now records
  what it stands in for, and the lines are worked out from the workout itself at every change.

## Sixth review

A sixth independent review found eight. The six a lifter could reach are fixed, each with a test
that fails without it. The other two are listed under known limits.

- A keep made on the exercise a kept swap had put in (its next best, when the kept swap's own
  exercise was already in the day) was saved for that exercise, not for the plan's own pick, so it
  never applied and the exercise swapped out came back. It is now saved for the plan's own pick,
  and keeping the plan's own pick back ends the kept swap.
- Moved mid-workout to a place without the kept swap's equipment, the stopped exercise's stand-in
  could not be the plan's own pick (a Push-Up led instead of the Barbell Bench Press). It can now.
- "Why this workout" could name a stopped swap after Undo or in a saved workout loaded after the
  Stop, and lost a true line after swapping back to the kept swap's exercise. The lines are made
  true at every change, Undo, and loaded workout.
- A reload of the saved data (after a cloud sync) at the moment a keep was saved could hide that
  keep from the Plan tab. It no longer does.
- Undo was still offered on a finished workout, whose record is already saved. It is not.

## Final review

A last, narrower review of the sixth round's fixes found three more. All are fixed, and each fix
has a test that fails without it.

- After Undo of a swap kept on a kept swap's exercise, "Why this workout" was worked out before
  the kept swaps were put back, so its line was wrong or missing. The lines are now made true
  again whenever the kept swaps change.
- The sixth round's fix made a swap for today record the kept swap's own pick, so the finish
  summary said "Barbell Bench Press became Machine Chest Press" for a day whose plan had the
  Dumbbell Bench Press. A swap for today records what today's plan had. The kept swap's own pick
  is kept on the entry for the keep switch alone.
- A workout saved on a day an exercise stopped came back stopped when used on another day. It
  loads fresh: the stopped exercise leaves, and the exercise that took over does all the sets.

## Known limits

- If a kept swap's save fails its check and the read-back that follows fails too (two storage
  failures in a row), the app says the keep could not be saved although it may have been; it
  then shows on the Plan tab after a reopen, where Stop ends it.
- If saving a keep takes longer than undoing the swap, reopening the sheet and making the same
  swap again for today only, the keep can stay. Saves take milliseconds.

## Verification

- The gate (`npm run verify`) on the round's code passed: lint, type check, 827 unit tests (147
  files), build, the privacy scan (584 files, no findings), the build check, and the browser suite
  (279 passed, 14 skipped by design, none failed).
- Every fix from the seven reviews was also taken out on its own to watch its test fail. The
  screen fixes were checked the same way in the browser.
- Build `95fe897` was deployed by Deploy Pages run 35949230067. The live bundle carries the build
  and the new text.
- The browser suite against the live URL: 279 passed, 14 skipped by design, none failed. The swaps
  tests were run again against the live URL after their screenshots were improved (a bodyweight,
  so the dumbbells show their own weight; toasts cleared first; each sheet caught fully open): 9
  passed.
- Screenshots: `docs/screenshots/maintenance-22`.

## Review on the phone

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

1. Log a set of an exercise, then swap it from its sheet. The logged set stays with it (Today reads
   "Stopped: 1 of N sets done"), and the new exercise follows with its own target. Tap the stopped
   exercise: its sheet says which exercise took over, with nothing to change on it.
2. Swap back to the first exercise: it picks up again, and it is not in the workout twice.
3. In a sheet, turn on "Keep it for the next 4 weeks" and swap. The Plan tab shows it with its end
   date; Stop ends it.
