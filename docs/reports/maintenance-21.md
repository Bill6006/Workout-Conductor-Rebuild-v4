# Maintenance 21: round C, the coach card and quick fixes

Built on 2026-09-23 on the owner's GREEN for Maintenance 20 and go for the next phase. Round C
is the owner's items 15 to 20, which the owner agreed on 2026-09-23 after asking why a leg-day
workout showed "Chin-Up is stalling at bodyweight", and whether anything besides reps should
change when the plates fall short.

## 15. The coach talks only about the workout on the screen

**Found:** the coach's notes from the last weeks (a stall, "stalling at bodyweight", "keeps
getting swapped") were shown whatever today's workout was. On a leg day the one coach card was
about Chin-Ups, with nothing to tap, and because stall notes rank above the other cards it held
the spot for the whole workout.

**Delivered:** a note about one lift shows only when that lift is in the workout on the screen,
from the preview on Today to the finished workout. It waits for a day that has the lift and
comes back then, with its button. Notes about the whole day, week or programme (fatigue, a
backup, the week's coverage, the programme style) are unchanged.

## 16. Not now on every coach card

**Found:** Not now sat inside the button row, so a card with nothing to tap could not be put
away.

**Delivered:** every card has Not now. On a card with nothing to tap it sets that note aside for
this workout, the same way a safety card works since Maintenance 19: it stays away when the app
is opened again, it is never remembered for days, and it does not hide the next real offer
about the same lift. A change big enough to ask for a second tap ("Confirm: …") now asks it
only on the card it was started on: if another card comes up first, that card starts from its
own first tap, and the first card, when it comes back, asks for both taps again.

## 17. Advice that works without weight

**Found:** a lift done at bodyweight that fell short of its reps was told to take 10% off, in
the coach card ("A 10% micro-deload rebuilds the reps") and in its own Why this target ("Missed
the floor twice in a row: micro-deload 10% and win the reps back."), though there is no weight
to take off. Two related defects came up while mapping the code, under the same rule:

- with bench press history, a Push-Up got a target of about 150 lb added ("Bodyweight plus 150
  lb"), because the bench's estimate passed to it unchanged;
- a bodyweight set logged as 0 lb counted as a load, so two short sessions read "Chin-Up:
  micro-deload to 5 lb", a raise called a deload.

**Delivered:**

- Short of the bottom of the range twice in a row at bodyweight, the target stays the same and
  says why: "Short of 6 reps twice in a row: try fewer reps over more sets." Nothing is lowered,
  so the coach never calls it a deload.
- On a day with that lift, the coach card reads "Chin-Up: short of 6 reps twice in a row", with
  your last session and "Do fewer reps over more sets, or swap in Lat Pulldown for a few weeks."
  Its one button, "4 sets of 3-5 today", moves the same work into one more set of fewer reps,
  and the session's length follows; a ramp set on that lift takes the same fewer reps, and so
  does one added later (from the sets still to come), so the warm-up never asks for more than
  the work. Lat Pulldown is named
  only where it fits the place (not at Home) and is not already in the workout; the swap itself
  is yours to make in Options.
- "Twice in a row" means twice short of today's floor: a session that missed a higher floor of
  its own (after "Aim one rep higher", or one raised mid-session) but reached today's does not
  count, and a session that reached today's floor is not called a miss.
- The advice is about today's range only. When today asks a different range from the one that
  was missed (a strength week at 3-6 after misses at 6-12), there is no card, and the target
  reads "Last time was a different rep range: log what you do today and the target follows."
- An offer you declined or set aside does not block the next lift's: in the first build of this
  round, a declined "Add the set" on an earlier lift hid the chin-up card for a week. The same
  lift is not offered the next thing instead, so declining its extra set never brings back
  another set in a different card.
- The first time a bodyweight lift is logged it reads "log what you do", not "enter the
  weight"; the summary's next target reads "Chin-Up: bodyweight × 6-12", not "log a weight".
- A 0 on a bodyweight lift is the bodyweight, not a load.
- One test decides "no weight" everywhere: a lift with no load reference. That covers Bench Dip
  and Step-Up too, whose only listed equipment is a bench; until a weight is logged on them they
  read "Bodyweight" under the weight dial and "log what you do" the first time, like a chin-up.
- A family estimate passes only between lifts measured the same way: a bench press gives a
  Push-Up no weight to add, and a Lat Pulldown swapped in for chin-ups starts from its own
  first-target rules (your bodyweight and other lifts), not from the chin-ups.
- The coach's history notes never tell a bodyweight lift to add 5 lb or take 10% off.

## 18. The fast lift at the heaviest weight a place has

**Delivered:** at the heaviest weight a place has, a strength set reads 3-1-X-0: lower for 3,
pause 1, then drive up as fast as you can. Other sets keep 3-1-1-0. The time estimate is the
same, five seconds a rep.

## 19. The research behind a slower lowering

**Delivered:** the note behind the controlled lowering now cites the review that tested lowering
speed: Amdi and King, 2025 (Journal of Sports Sciences, PMID 40692176). A slower lowering made
no clear difference to muscle growth and gave the same or a little more strength in trained
lifters. It cited Roig et al., 2009 before, a review of training that only lowers the weight,
which does not test lowering speed.

## 20. Hints under the dials that fit

**Delivered:** on a ramp set the hints read "Target 4-6" and "Easy, RIR 5"; on a drop set "Aim
8-12". The set's head ("Ramp 1 of 2", "Drop set"), the weight line and the button already say
which kind of set it is. Any hint that is still too long (large text, a superset's narrower
dials, a wider font) wraps onto a second line instead of being cut off.

## A finished workout

**Found in review:** once a workout was over, the coach could still offer taps that change it.
None did anything, and one did harm: a stall-route step tapped on a finished workout was recorded
as applied though nothing changed, so the card then said the step was in place and the route
later moved on to the next step. That one predates this round.

**Delivered:** a finished workout gets no tap that would change it: none of the day's offers
("4 sets of 3-5 today", "Add the set", the heaviest-weight offer), no route or load step, no
swap and no check-in. A note about the week keeps its "Lead the next session with …" focus,
which still applies, unless that focus is already set.

## Review

Three adversarial passes ran on this round's code before it shipped. The first (three lenses,
each finding checked by a skeptic) confirmed seven findings, five distinct. An independent
re-check of the fixed code found two of those fixes incomplete and three more defects, and a
second re-check of those fixes found three more small ones and a wording slip. All are fixed,
and each fix has a test that was run against the code without the fix and failed:

- the fewer-reps advice and its button now use today's floor, and the run counts sessions short
  of today's floor (it could offer "4 sets of 1-2" on a strength week, or "9-11" as fewer reps);
- no stale taps on a finished workout (above);
- a pending "Confirm:" never carries to another card, nor comes back armed;
- a lift with no weight never gets a ramp above its working sets, whether the ramp was already
  there or added later;
- one test for "no weight" everywhere (Bench Dip and Step-Up included);
- an offer you put away no longer holds the day's one offer place, and one lift gets one offer;
- a ramp added mid-exercise reads the sets still to come, not a finished one;
- a finished workout never re-offers a focus that is already set.

Worth knowing: a 0 typed on a bodyweight lift is now saved as no weight. For someone who has only
ever logged bodyweight lifts, the "No weights logged yet" line under a working set therefore
stays until a real weight is logged; before, typing 0 cleared it. Anyone with a weighted lift in
their history is unaffected.

## Verification

- Unit: a stalled bench press, a strategy note and a "keeps getting swapped" note never reach a
  day without the lift, in every state, and come back with their step on a day with it; Not now
  on a card with nothing to tap sets it aside for the workout, records no decline, survives the
  session being saved, and leaves the next step's offer; the card renders Not now without a
  button and never on the quiet or all-clear card. Bodyweight: short twice and three times, once,
  a 0 read as bodyweight, a loaded lift still deloaded, the first-time words, a Push-Up after
  bench, a Lat Pulldown after bodyweight and weighted chin-ups, Pull-Up still sharing weighted
  chin-ups, the history notes; the coach card, its wording at the gym and at Home, never
  "micro-deload" from an older saved plan, and never once started or set by hand; the one tap
  through the store, with the session length re-estimated; a 0 logged kept as bodyweight; the
  summary's next target. Tempo: 3-1-X-0 for strength at the cap, 3-1-1-0 for the rest, five
  seconds either way; the lowering note's source and lead. Hints: the ramp, drop and hold wording.
- Browser (`e2e/coachAndHints.spec.ts` and `e2e/coach.spec.ts`, all three device projects): a
  stalled bench press card gone from a plan without the bench and back with it; two short
  chin-up sessions, Chin-Up swapped in from the swap list, the card, its button and the new
  sets; the 3-1-X-0 chip with the Amdi and King note; the ramp hints not cut off at 360 and 412
  px, also at 130% text in a wide font; Not now on the applied stall step, gone after a reload.
- Review fixes: every confirmed finding has its own test, and each of those tests was run against
  the code with its fix reverted and failed, then passed with the fix back.
- Totals: unit 704 passed (140 files); typecheck, lint, formatting and the privacy scan clean
  (572 files, 0 findings). Browser, all projects, locally: 267 passed and 14 skipped by design,
  none failed. Deployed as `5c2aee6` (Deploy Pages run 35877979861) and run against the live
  URL: 267 passed and 14 skipped by design; one cloud-copy test, not part of this round, missed a
  line of text once and passed when run again.

## Fix from the owner's review: the Smith machine at Home

**Found on the owner's phone:** a Smith Machine Squat started at the gym (its warm-up logged),
then the place changed to Home. Today read "Smith Machine Squat · 0 × · 1 warm-up · Smith
machine" and had no squat Home can do. Home has no Smith machine, and the app knew it.

**Cause (Maintenance 19, not this round):** the first move worked. The squat stopped at its
warm-up and a Goblet Squat took its sets, right after it. But the stop deleted the unlogged sets
it was counting, so any later rebuild counted nothing owed and dropped the Goblet Squat. The
same code also pushed a second kept exercise of one slot to the end of the list. Switching Home,
Gym, Home reproduces the owner's list set for set, and so do a change of length and a long pause.
Skipping the warm-up instead of logging it ends the same way. The build before this round did the
same.

**Delivered (the part the owner called critical for the next workout):** a stopped exercise keeps
the number of sets it still owed (a new optional field on the saved plan, dropped if unreadable),
and every later rebuild gives those sets to an exercise that fits the place, right after the
stopped one. A stand-in already started, or under way, stays where it is and no second one
joins it. A stand-in stopped in turn hands on only what it still owed. A workout stopped by the
older code, with no count written, gets its stand-in back at its next rebuild (a change of place
or length, or coming back from a pause of 20 minutes or more), which is the case on the owner's
phone. The stand-in, not the stopped lift, is protected as the main lift when time
is short.

**Not done yet, by the owner's word ("don't do all of the bullet points just yet"):** back at a
place that has the machine, the stopped exercise picks up where it left off (today a stand-in
carries on there); the stopped exercise still reads "0 × · 1 warm-up" instead of saying it
stopped. Both stay Proposed (item 28). Worth knowing: after any rebuild the workout goes to the
first set not yet done, in list order, so a stand-in that comes back while another exercise is
under way comes first. Maintenance 19's first move already worked that way.

**Verification:** the owner's steps through the store (the warm-up logged, and skipped): Home,
Gym, Home; a new length and back; a 25-minute pause; the app reopened; a damaged note; a plan
stopped by the older code. On the engine: the count written at the stop, a stand-in through four
changes after the ramps only and after a working set, a stand-in under way kept in place, one
moved above the stopped lift, a stand-in stopped in turn at a bands-only place, and the older
code's plan repaired. In the browser (all three device projects): a set at the gym, then Home, Gym
and Home: the stand-in stays right after the bench press. All of these fail on the code before the
fix, and each part of the fix, reverted on its own, fails at least one of them. Totals after the fix: unit 717
passed (141 files); browser 270 passed and 14 skipped by design locally (four active-workout load
timeouts in the gate passed when that file was rerun one test at a time) and against the live URL,
none failed. Deployed as `4bce35a` (Deploy Pages run 35894585947).

## Review

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

1. On a day without chin-ups, the coach card is about that day's workout, never Chin-Ups.
2. On a day with chin-ups, after two sessions short of the bottom of the range: "Chin-Up: short
   of 6 reps twice in a row", with "N sets of 3-5 today" and Not now. Nothing says 10%.
3. Any coach card, including one with no button, has Not now.
4. A ramp set's hints read "Target 4-6" and "Easy, RIR 5", nothing cut off.
5. Start an exercise at the gym, log a set of it, change the place to Home, then change something
   again (back to Gym and Home, or the length): a Home exercise stays right after the stopped
   one, with the sets it still owed.
