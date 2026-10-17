# Maintenance 30: round L, the weights a place has

Built on 2026-10-11 on the owner's word: "Proceed through ALL remaining already-agreed items", without
pausing at review gates, which stay YELLOW. Round L is the third of five rounds: items 6, 30 and 31,
each as the owner agreed it. Item 31 is a training rule, so it was researched first
(`docs/research/loaded-bodyweight-moves.md`); items 6 and 30 are not.

## 6. The Weights tab, and the weights of each place in Settings

**As agreed:** "Name the Plates tab 'Weights' on machines and dumbbells, with weights per place in
Settings."

**Delivered:**

- The tab under each exercise is **Plates** on a bar, and on a machine set to plates (item 30). It
  is **Weights** on a machine's pin stack and on dumbbells or kettlebells.
- A move with no load (a step-up, a bench dip) has no such tab. With a weight typed on it, the tab
  shows the weight held ("Bodyweight plus 20 lb"), with nothing for the place to set. Its
  "Bodyweight" hint under the weight dial is plain words, not a button that opened an empty box.
- Found while building it: a step-up's only equipment is a bench, which the catalog reads as a
  machine, and three things followed from that, all mended:
  - the line under the logger read a weight on it as a pin ("Pin the stack at 20 lb");
  - its weight moved by a machine's 10 lb, so a carried 25 lb landed on 20;
  - a stack an older copy saved for it narrowed the weight held, with no way left to see it.

  It now reads "Bodyweight plus 20 lb", moves by 5 lb, and no stack applies to it. A band keeps its
  own line ("Band tension; note the band colour").

- Settings has a new row under the places, **Weights at your places**. For each place it shows:
  - the plates on its rack;
  - its dumbbells;
  - each of its machines, one at a time from a list: its pin stack, or, on a machine that comes
    both ways, its plates.

  Each change is saved for that place at once, exactly as from a workout's tab, which still sets
  them too. A plate missing for one workout only stays the workout's to mark.

- The sections follow the place's own equipment. Home's dumbbells, bench, pull-up bar and bands
  show its dumbbells only. A move done there another way puts no rack or machine in the list: a
  reverse curl with dumbbells, a face pull with a band. A place with kettlebells and no dumbbells
  says Kettlebells; one with both says both, as they share one record, in Settings and on a
  workout's tab alike.
- A Settings change made in another row just before a weights change (Units and body, say) no
  longer puts the place's old weights back as it saves: each place is written one change at a
  time, and those rows never write a place's weights.

## 30. A machine on its pin stack or on plates

**As agreed:** "a per-machine pin-stack vs plate-loaded switch, starting with a review of which
machines come both ways (his gym's Leg Press Calf Raise takes plates; the editor offers only a
stack)".

**The review of the catalog's machines.** These come both ways:

- the leg press, and the calf raise done on it;
- the hack squat;
- the chest press and the shoulder press;
- the lat pulldown;
- the leg extension and the leg curl;
- the preacher curl;
- the standing calf raise machine (item 31).

These come with a stack only: the cable station's moves (fly, lateral raise, row, pulldown,
pushdown, curl, crunch, Pallof press, face pull) and the pec deck, both ways round.

**Delivered:**

- A machine that comes both ways has a switch on its tab and in Settings: **Pin stack** or
  **Plates**. It starts on the pin stack, as before.
- The switch is the machine's, as asked: the leg press and the calf raise done on it switch
  together, and a change to its plates is the machine's too. A machine of the lifter's own (a
  custom exercise on a machine) has the switch as well: the lifter knows how theirs is loaded.
- Set to plates:
  - it starts with the plates the place keeps on its rack, and its own plates can then be changed;
  - its weight is the plates loaded on it, the same on each side, with the sled not counted;
  - the tab becomes Plates and reads "45, 25 each side · 140 lb";
  - its targets land only on weights its plates make, and move as a bar's do;
  - a plate missing today is left out, as on a bar.
- Back on the pin stack, each exercise gets back the pin stack it had before the switch, on any
  day: its plates record keeps it.
- Nothing new is stored in a way an older copy of the app cannot read. A machine's own record
  holding plates is a shape the app already stored for a bar's rack. The kept pin stack is one
  added field, which an older copy drops.

## 31. Weighted versions of bodyweight moves

**As agreed:** "weighted versions of bodyweight moves at the gym (a dumbbell reverse lunge, a
standing calf raise machine)".

**Delivered** (the evidence, the rule and the reasons: `docs/research/loaded-bodyweight-moves.md`):

- Three exercises join the Library (86 now):
  - the Dumbbell Reverse Lunge;
  - the Dumbbell Bulgarian Split Squat, because the lower day picks the Bulgarian split squat at
    both the gym and at home;
  - the Standing Calf Raise Machine, with its machine as new equipment a place can list.

  Each has its own How to steps. Until a demonstration of its own is found, each shows its
  movement's diagram (`docs/media-license-register.md`).

- A bodyweight move keeps its place while bodyweight still fits its reps.
- It is outgrown when a set at bodyweight goes one rep past the top of its range at the planned
  reserve, or when the lifter adds a weight to it. The plan then uses its loaded version wherever
  the place has one: the gym, and home when it has dumbbells and a bench.
- It stays outgrown through sets at bodyweight inside the range, which the plan's own range stops
  at its top: a hotel's bodyweight split squats done as planned never undo the gym's dumbbell ones.
  It comes back only when no set at bodyweight reaches the bottom of its range.
- A calf raise on two legs is loaded wherever a loaded calf raise is, from the first workout.
- "Why this workout" says so once at each place, until the loaded version is done there. For
  example: "Dumbbell Bulgarian Split Squat in place of the Bulgarian Split Squat: at bodyweight you
  went past the top of its reps, so it is loaded now."
- The lifter's own choices stand:
  - a favourite still wins its slot;
  - a swap back, kept, keeps the bodyweight move;
  - a swap away to another exercise, kept, stands as before, and takes the loaded versions of the
    move away with it;
  - where no loaded version is, a weight typed on the bodyweight move keeps carrying forward there,
    as agreed in Maintenance 21.
- Before the rule, adding the loaded split squat alone would have put it on every lower day,
  outgrown or not, since it ranks above the bodyweight one. The rule keeps bodyweight first until it
  is outgrown.

## Review

An adversarial reviewer reproduced each finding with a failing test of its own. Each was checked
against the code before it was fixed. Each fix has a test, and the revert of each fix is caught.

- **HIGH, fixed: a machine switched to plates lost its pin stack.** The stack came back only while
  the editor stayed open. Closing the tab between sets, picking another machine in Settings, or
  reopening the app and then switching back left the machine with no stack. The plates record now
  keeps the stack.
- **MEDIUM, fixed: a weights change undone by a Settings save waiting behind it.** A change in Units
  and body waits 450 ms to save, with every place as it was. A plate tapped in that time was put
  back. Fixed as described under item 6.
- **MEDIUM, fixed: a kept swap away from an outgrown move stopped applying.** With the split squat
  outgrown and a kept swap to the reverse lunge (after a sore knee, say), the plan gave the dumbbell
  split squat: the movement swapped away, loaded. The swap now holds, and takes the loaded versions
  with it.
- **MEDIUM, fixed: one hotel workout undid the gym's loaded version.** The rule read only the
  latest bodyweight workout, and following the plan's range there was enough to bring bodyweight
  back. It now stays outgrown until bodyweight falls short of the range's bottom (item 31 above).
- **MEDIUM, kept as designed, with the reason: a calf raise the lifter loads by hand is loaded at
  the gym.** The reviewer read the build's first wording ("the plan leaves that move as it is") as
  a promise. The owner asked for weighted versions at the gym because bodyweight was too light, and
  Maintenance 21 promised only that a typed weight carries forward, which it still does wherever the
  bodyweight move is planned. A weight typed on the bodyweight move now counts as outgrowing it. The
  rule's wording and the evidence document say so.
- **LOW, fixed:**
  - "Why this workout" said "in place of" twice for an entry a kept swap put in. It claimed the
    rule replaced a calf raise the lifter dislikes. A lifter who trains at home between gym
    workouts heard it at every gym workout. It now speaks only of an entry the rule put in, where
    the bodyweight move could stand, once at each place.
  - The standing calf raise machine was missing from the three hand-kept lists that mark machines:
    the station (so no reserve check on it), a gym's own equipment, and a custom exercise's load.
    All three now read the equipment list itself.
  - A band move with a number on the dial read "Bodyweight plus 20 lb".
  - The "Bodyweight" hint opened an empty box with no tab to close it.
  - A machine switch that could not be saved said nothing.
  - A stack an older copy saved for a step-up still narrowed its weight, with no way to clear it.
  - A place with kettlebells only was shown a "Dumbbells" section.
- **A design risk, built: the switch is the machine's.** The leg press and the calf raise on it were
  two switches; they are now one, as the owner's words asked ("a per-machine switch").
- **Design risks, kept as limits** (below): a machine's history is not marked as stack or plates,
  and a gym saved before this round does not list the new calf machine until it is ticked.

**The re-check of these fixes** found seven more, each shown by a failing test, all fixed with
tests and reverts:

- **MEDIUM:** the swap fix also kept out the loaded version of a move swapped away, even where the
  lifter made it a favourite or the lift to push. Only the swap's own exercise is kept out now, as
  before the round; the bodyweight move it replaces stays the plan's own pick, so the swap applies.
- **MEDIUM:** the coach's "fewer reps over more sets, or swap in" for a bodyweight move short of its
  range named its loaded version, the same move made heavier, because the catalog listed it first.
  The lists keep their old order, the loaded version last, and the coach never names it there.
- **MEDIUM:** a workout's tab named the dumbbells' record, which the kettlebells share, by the lift.
  At the gym, a kettlebell swing's sizes saved as "Kettlebells" were every dumbbell lift's too. It
  is named for the place now ("Dumbbells and kettlebells at Gym"), and so is its summary line.
- **LOW:**
  - Settings dropped an edit waiting to save from the screen when a weight was set below it, and
    an edit made on top of the screen then lost it.
  - A plate taken off the leg press stayed on the calf raise done on it.
  - The limit above said a custom machine switches on its own; it had no switch at all.
  - The Weights panel opened again at every render once the hint had been tapped, so Notes could
    not stay open on that card. This dates from Maintenance 25.

**A third pass** over those fixes found three more, and a race, each shown by a failing test; all
fixed with tests and reverts:

- **MEDIUM:** with only the swap's own exercise kept out, the loaded version of a move swapped away
  could still fill the slot's next best (the swap-in already in today's plan) or the coach's extra
  work. A loaded version now waits until its bodyweight move loads, wherever that move is: swapped
  away, disliked, or in another slot. A favourite still wins outright.
- **LOW:** the coach no longer named the Leg Press Calf Raise for a standing calf raise short of its
  range, as it did before the round. It is a loaded version, but its load lifts no bodyweight and
  can be set lighter; only the versions that add to bodyweight are skipped there.
- **LOW:** a lifter's own move on the cable station or the pec deck was offered Plates. Only one on
  a machine that comes both ways is.
- **The race:** a place's deletion and a weights save made at once could bring the place back.
  Settings' gym switch sits beside the new Weights row. The deletion now waits its turn with the
  place writes.

**A fourth pass** over the third pass's fixes found three more, each shown by a failing test; all
fixed with tests and reverts:

- **MEDIUM:** the wait was a shift in the ranking, not a bar. Where the other moves were ruled
  out, the loaded version was the slot's only candidate and was planned anyway, its bodyweight move
  never outgrown: a sore knee with the reverse lunge and the step-up disliked got the dumbbell
  reverse lunge, and a lifter who dislikes every bodyweight lunge got the dumbbell split squat. A
  loaded version now waits as no candidate at all, so such a slot is as before the round: empty
  when every move is ruled out, or the plan's own pick where a kept swap cannot apply. One the
  lifter chose stands: a favourite, a kept swap's own exercise, the lift to push.
- **LOW:** a kept swap from the split squat to its own loaded version, which the swap sheet offers,
  held that loaded version down in the coach's extra work, which offered a Romanian deadlift
  instead. A kept swap's own exercise is the lifter's choice there now. The fix first proposed,
  counting such a swap as no swap away, was checked and not built: the plan then put a different
  loaded version in place of the one chosen (the leg-press calf raise for a swap to the calf
  machine) and dropped the swap's line. The plan still judges its own picks as if no swap were
  kept, and the swap puts its own exercise in.
- **LOW:** a lifter's own move took the Pin stack / Plates switch only when its machine's chip was
  tapped first. Any of its chips counts now.
- **The race, once more:** setup run again without the Gym could see the Gym written back by a
  weights save still under way. Setup's place writes now wait their turn, as a deletion on Settings
  does.

**A fifth pass** over those fixes found three more, each shown by a failing test; all fixed with
tests and reverts:

- **LOW:** setup checked what it began from before its turn among the place writes, so a weights
  save under way when Finish was tapped landed after the check, and setup put the Gym it began from
  over it. The check and setup's writes now take one turn: such a save lands first, and setup,
  seeing the Gym changed since it began, writes nothing, as it always does then.
- **LOW:** a kept swap back to a bodyweight move (the leg-press calf raise for the standing calf
  raise) was moved down in the coach's extra work, which offered the calf machine. The coach never
  moves an exercise the lifter chose.
- **LOW:** Settings listed a lifter's own machine only when its machine chip was tapped first, while
  its workout tab took either order. It is listed either way now.
- **A deload week, from the same pass:** the lift to push stayed clear of the wait while its push was
  paused, so a deload day with a kept swap away from the split squat planned the loaded split squat
  instead of the swap. The lift to push stands only on a day its push runs.

**A sixth pass** over those fixes found two more, each shown by a failing test; both fixed with
tests and reverts:

- **LOW:** with a bodyweight move and its loaded version both favourites (the standing calf raise
  and its machine), the coach's extra work named the bodyweight move the plan had just called too
  light. A favourite moves in the coach's extra work as it does in the plan.
- **LOW:** Settings listed a lifter's own move at a place through any equipment the place has. A
  machine saved with no chips put a Machines section at Home; a move saved with the bench chip alone
  put a Dumbbells section where there are none. A lifter's own move is listed only through a chip
  there that gives the load it was saved with, in any order.
- **A test made true to a phone,** from the same pass: the setup race test reached its result only
  because the test clock stood still. On a clock that moves, as a phone's does, the weights save
  stamps the Gym anew, and setup, seeing it changed since it began, writes nothing. A test of that
  is added; the revert of the fix is caught by both.

**A seventh pass** found two more, each shown by a failing test; both fixed with tests and reverts:

- **LOW:** a kept swap back to a bodyweight move held only where the plan's own pick was the
  exercise swapped out. The calf raise swapped back to from the calf machine gave way to the
  leg-press calf raise on a day the plan picked that one, while the coach named the bodyweight
  raise. A swap back, kept, now keeps the bodyweight move against every loaded version of it, in the
  plan and the coach alike, as the round's rule says. The fifth pass's exemption in the coach is no
  longer needed and is gone, so a bodyweight move swapped to from anything else (the split squat for
  the dumbbell reverse lunge) moves in the coach's extra work as it does in the plan.
- **LOW:** a lifter's own move saved with the squat rack chip alone put a Plates section at a place
  with a rack and no barbell. A bar's plates come only with a bar's chip.

**An eighth pass** found three more, all in that swap back and all on the calf raise, the one
bodyweight move with two loaded versions. Each was shown by a failing test; all fixed with tests and
reverts:

- **LOW:** keeping the plan's own pick on an entry the swap back put in (the leg-press calf raise,
  kept for four weeks) left the swap back in place, so the next lower day put the bodyweight raise
  back. Keeping the plan's own pick now ends a swap back that covers it, as it ends a kept swap of
  it (Maintenance 22).
- **LOW:** the swap back replaced a favourite loaded calf raise the lifter had never swapped away,
  and said it was "the swap you chose to keep". A swap back never covers a favourite.
- **LOW:** beside a kept swap of the calf machine to an exercise a place lacks (a Smith calf raise
  at a gym without a Smith machine), the calf machine was left uncovered there, and the coach named
  it again. The swaps the lifter keeps come first and the swap back after them: for each exercise
  the plan takes the first swap that applies.

From the same pass: with a swap back to the bodyweight calf raise kept, the coach's "fewer reps
over more sets" for a calf raise short of its range no longer adds "or swap in Leg Press Calf
Raise", which the lifter's swap back keeps out. A swap from the leg-press calf raise to the
bodyweight raise kept it out before the round too.

**A ninth pass** found one more, shown by a failing test; fixed with a test and reverts:

- **LOW:** keeping a favourite loaded calf raise, the plan's own pick, ended every swap back to the
  calf raise, those that never stood in for the favourite included. A swap back covers the loaded
  versions the plan and the coach let it cover, the same for the store.

How a swap back ends, from the same pass: keeping, for four weeks, a loaded calf raise the swap back
stood in for ends the swap back, at every place. A kept swap is stored whole, so it cannot keep the
bodyweight raise for one loaded version and not another. Undo, straight after, brings it back.

**A tenth pass** over that fix found nothing new: the review ends here.

The run of the earlier rounds' reverts against this round's code found one Round K test that its
own last change had blinded. Its revert (the check after the app's own step back lands) was caught
in Round K's final revert run. It passed on the committed code, because jsdom delivers the step back
before the app's next timer, the reverse of a phone. The test now holds the step back for 20 ms, as
a phone does, and the revert is caught in three runs of three.

## Known limits

- **A machine's history is one list wherever it is done, and is not marked as stack or plates.**
  A weight logged on a pin stack is read as plates after a switch, or at another place where the
  machine takes plates; the sled is not counted. Two stack machines of different makes were already
  read the same way. The first set on plates is a measurement, and the session's adjustments take it
  from there; switching a machine you have logged for a while deserves a lighter first set.
- **A gym saved before this round does not list the new Standing calf raise machine.** A place's
  equipment is the lifter's own list. Tick it under Places if your gym has one. An older copy of
  the app, still open somewhere, drops it from the list if it edits that place's equipment.
- **The switch covers the exercises the catalog knows are done on the same machine.** That is
  only the leg press and its calf raise. A machine of the lifter's own has a switch of its own,
  apart from a catalog machine it shares.
- **A lifter's own machine saved without a machine chip** (the equipment list had none for it) has
  its pin stack on its workout tab only. Settings lists a lifter's own move at a place only through
  a chip there that gives its load, so that a place's sections stay its own equipment's.

## Proposed (not built; the owner's decision)

- **A move's load at a place where it is done another way.** Each catalog move takes its load from
  its first equipment. A move a place does another way keeps that load. A face pull done with a
  band at home is planned in pounds, with a pin-stack line. A reverse curl done with dumbbells at
  home is planned as an EZ bar, its tab reading Plates. Its history is also shared between the two
  ways. This was found while building item 6, and it was so before this round. Fixing it would
  change how such a move progresses across places, so it is the owner's call.
- **A loaded calf raise at home.** The default home has no loaded calf raise: the evidence's
  options are a one-leg raise or a dumbbell raise, and the catalog has neither.

## The complete revert run

Each rule this round built, and each fix the ten review passes asked for, was reverted on its own in
a copy of the repository and its tests run (`mutate-m30.py`, 121 entries). Every revert is caught
on the final code. Two entries were caught only after a test was named or added: one whose own test
the fifth pass had removed (F1b, now caught by the kept-swap test that already guarded it), and the
seventh pass's entries for a swap back, which needed tests where another calf raise could come
next. The fifth pass's rule that the coach never moves a kept swap back was replaced in the seventh
by the swap back's own reach, and its entry with it.

The earlier rounds' tables were run against this round's final code, so that nothing built since
blinds a test of theirs:

- Round K's (`mutate-m29.py`, 32 entries): 32 caught.
- Round J's (`mutate-m28.py --utc`, 83 entries, the tests in UTC and then the day rules in two
  zones, as CI runs them): 83 caught.
- Round I's (`mutate-m27.py`, 193 entries): 193 caught. One entry moved with the code (R44-18, a
  kept swap never brings back the lift that gives way, now in the loop over an exercise's swaps).
  Its three calendar-day entries are caught only where the device is away from UTC, as on the
  owner's machine; this cloud machine runs in UTC, so they were run in New York time.
- Maintenance 26's (`mutate-m26.py --all`, 1199 entries, the tables of Maintenance 23 to 26):
  sixteen of Maintenance 25's entries were moved to the code this round changed (the plate editor,
  a place's barcode, setup's place writes), and every anchor is found. The whole run, which takes
  hours, goes once more before the consolidated phone review.

## Verification

VERIFY

## Review on the phone

At the owner's word (2026-10-11), no review gate pauses the agreed work. This round's checks are in
the one consolidated phone review given once every agreed item is live.
