# Maintenance 26: round H, intelligence the owner approved

Built on 2026-10-09 on the owner's word: "All is approved except for number 48. Please proceed with
the plan". Round H is the first three of the approved items: 40, numbers that look like slips are
asked about before they steer a target; 41, each lift's own reps-to-weight curve; and 42, a bad
start to a workout carries over to the lifts still to come. Item 50 joined it the same day from the
owner's phone, to be done last: "I don't need pause feature at all for any of the exercises, but I
should at least be able to either tap on the media itself or Tap a button to upload my own gif."
Items 43 to 47 and 49 are agreed and wait for their own rounds; 48 was not approved.

The owner set a condition on every approved item the same day: before it is built, its training
and physiology behaviour is checked against the best available evidence (systematic reviews,
meta-analyses, controlled trials, position stands), a number in the proposal is not a rule unless
the evidence backs it, and the evidence, the uncertainty and the reason for each final rule are
written down; product and screen choices follow ordinary judgement. The research for this round is
in `docs/research/slip-checks.md`, `docs/research/personal-curves.md` and
`docs/research/bad-start.md`; every paper cited was checked on PubMed.

**Item 41 is not in this release.** It was built, reviewed twice and tested by simulation, and the
evidence said a lift's own curve cannot be learned well enough from the sets the app logs: where it
changed a target, it was more often wrong than right. Its code was removed; targets are worked out
as in Maintenance 25. The section below says why, and what could work instead.

## 40. Numbers that look like slips are asked about once

**Found:** nothing questioned a typed number. 2250 for 225 on the max sheet saved with one tap and
set the lift's first target at 90% of what it implied (held at the heaviest weight the place has);
1850 for 185 in the set logger went into the history, where its estimated max fed the next target,
the records, Progress and the stall rules; a bodyweight of 1800 set every target that starts from
the body.

**Delivered:**

- A typed number far past anything real is asked about once, never refused, in the set logger, on
  the max sheet and for bodyweight (Settings and setup). The question names the number and what it
  was compared with. "Change it" goes back to the number, stands where the button pressed stood and
  takes the focus; in the set logger the other button, which keeps the number ("Log 1850 lb × 5"),
  answers only once its question has shown for about half a second, so quick taps never keep a
  slip. A screen reader reads the question once, and both buttons carry it.
- A number kept once is not asked about again: a set logged today as heavy and of as many reps
  covers a new one, and a weight the lift has lifted before is not asked about for what it weighs.
  A correction may be spared by the set it corrects, never held to it: within one and a half times
  of it, it is not asked about again, and a set logged a digit short and corrected is judged as if
  typed new. The app's own target, and the empty bar, are never asked about.
- A weight, or the max it implies, is compared with the lift's own best: its logged sets, today's
  working sets so far, and the max saved for it, whichever says most, all read as the max sheet
  reads a set (every rep up to thirty); past one and a half times that, it is asked about. With
  none of those, its family's estimate (from family lifts that carry a load) at two and a half
  times, what the lifter's other lifts suggest (each at its best) at three and a half, or the
  starting estimate from the body at three and a half, whichever allows most: the body's is low
  by design, an ordinary beginner's first set reads up to about 3.2 times it, and a tenfold slip of
  a cautious first set from about 3.6. A hold is compared by its load; weight added to the body (a
  chin-up, a dip) with the bodyweight, as the whole weight moved.
- Past what almost anyone loads (1000 lb on a bar or stack, 2000 lb on a sled, 250 lb per dumbbell
  or added to the body; 450, 900 and 115 kg), heavier than the weights at the place make (until the
  lift is logged that heavy there), or as much added as the lifter weighs on an upper-body lift:
  asked about too.
- Lighter than the empty bar ("13" for 135) is asked about on any set of the day; a lighter bar of
  the lifter's own (a fixed barbell, a 15 kg bar) is asked about once, then read from the log.
  Otherwise a lower weight or max is never asked about: it is plausible after a break and only makes
  targets lighter.
- Reps far past the range (three times its top and fifteen over) are asked about on a working set
  that is no hold, unless the lift has logged as many before: sixty calf raises are asked about
  once.
- Bodyweight is asked about outside 30 to 300 kg, or a quarter away from the one confirmed (read in
  the units shown, and not when that one is itself out of the range); a plausible number the typing
  pauses on is confirmed, as Settings saves it. While it asks, the save keeps the last plausible
  bodyweight the typing paused on, never an emptied field; a held number a units switch makes plausible
  goes in with the new units; one left unanswered is said in a message that names the bodyweight
  that stands, as Settings closes or setup finishes. More than a profile keeps (1000) offers only
  "Change it".
- The max sheet takes a recent set of up to 30 reps, as its field says, and refuses more.

## 41. Each lift's own reps-to-weight curve: validated, not shipped

**Found:** every target turns an estimate into a load with one formula for everyone and every lift
(Epley), counting reps up to twelve; people differ by about a quarter in the reps they get at a
share of their max (Nuzzo and colleagues, 2024), and lifts differ (Shimano and colleagues, 2006).

**Not shipped.** On the owner's condition ("validate how the personal reps-to-load curve should be
learned and bounded"), the curve was built (Epley's shape with each lift's own constant, learned
from pairs of sessions at two rep ranges), reviewed twice, and scored in two independent seeded
simulations against each simulated lifter's own right weight. The full record is in
`docs/research/personal-curves.md`. In short:

- **It cannot be learned precisely enough from logged sets.** Each reading carries about a rep of
  error in the judged reserve (Halperin and colleagues, 2022), and the max moves about 4% between
  sessions (Grgic and colleagues, 2020), against a difference between lifters of about a quarter of
  the reps. Under that noise the learned curve went only a fifth to a third of the way to a
  lifter's own, and 93 of 1,000 simulated lifters exactly like most were told at some point in ten
  weeks that they get more or fewer reps than most.
- **Where it changed a target, it was more often wrong than right.** On a return to 10-12 reps,
  94-99% of the targets it changed moved further from the lifter's own right weight; heavy returns
  were mixed (better for lifters who get fewer reps than most, worse for those who get more). Only
  15-20-rep targets came out better, because the curve counted reps past twelve, which helps every
  lifter, not because it knew the lifter.
- **It learned from noise.** The first version gave curves to 836 of 1,000 lifters who train one
  rep range; fixed, it still found the app's own pair of rep ranges (4-6 and 6-10) too close
  together to learn from, so curves there came from noise alone.

What could work instead is under Proposed: two corrections to everyone's rule, and each lift's own
curve once item 43 gives sets to failure to learn from. Whether item 41 stays agreed for that is
under Things to settle.

## 42. A bad start carries over

**Found:** in-session autoregulation moves only the lift just logged; a lifter having a poor day who
did not check in got the full planned volume on every lift still to come, whatever the first lifts
showed.

**Delivered:**

- When the first working sets of the first two lifts that can be judged both fall three or more
  reps short of what their targets asked (reps plus the reserve logged, against the bottom of the
  range plus the plan's reserve), the lifts still to come take a set fewer and a rep more in
  reserve, with a line saying why ("Eased for a hard start (Barbell Bench Press and Barbell Row
  fell well short; fewer sets with an extra rep in reserve)"). The ease is a layer over the plan:
  every later change is made to the plan under it and the ease laid again, and what each lift had
  is kept, so the start no longer falling short gives exactly that back. A set comes off only above
  the floor a check-in keeps, never off a count set by hand or offered by the coach; a rep more in
  reserve is a load the place makes about a rep lighter, or the same load a rep fewer, never
  heavier. With a check-in it takes the larger of each part, never both.
- Judged: a target the lifter's own logs set (not an estimate, nor one an entered max raised, a
  saved workout brought or another rep range gave), at or under its weight, asked for twelve reps to failure or fewer at the
  plan's reserve as it stood when the set was logged, set by the app when the set was logged, read
  from a session whose first working set did not fall short of the plan itself, one lift for each
  place in the plan. A reserve the day's settings added (a check-in, easier, the hard start's own) is never
  counted against a set, whenever it was added.
- An undo or a correction reads the start again; "Back to plan" only when nothing else of the day's
  settings stays. The lifter's Undo of the change stands while the start reads the same, in
  whatever order its lifts are logged again; a change that could not be made is not tried again for
  the same reading in that workout; a change waiting behind another reads the start again when its
  turn comes. When the same set moved its own lift's next sets too, the line says that as well, and
  Undo takes both back; when that change failed, its error stays in view.

## 50. No Pause, and the lifter's own GIF from How to

**Found:** the owner's capture showed How to on Ab Wheel Rollout, a diagram, with Pause over its
label and no way to set their own GIF: How to had none, only the exercise's Options and its
Library page did.

**Delivered:**

- No demonstration has a Pause: How to keeps Slow on a clip, and the card's hold and pause mark that
  Pause brought are gone. Under reduced motion every demonstration starts still with Play; a play the
  browser refuses or stops (a data or battery saver) offers Play too. A pause the browser makes as
  the app goes to the background is not taken for a refusal: back in the app, the clip plays on.
- In How to, a tap on the demonstration itself, or on "Your GIF" under it, opens the phone's picker
  for a GIF, photo or short video; Replace and Remove follow, and a replacement shows at once on the
  card and in How to. The focus stays on the button used, or comes back to it after the save; a
  save on one exercise holds only that exercise's buttons.
- Play stands at the top corner over a diagram or a picture of the lifter's own, clear of a
  diagram's label; the buttons over and under a demonstration are a thumb's height (44 px), and
  "Your GIF" stays on one line. Each exercise's demonstration is its own: a Play pressed on one
  starts no other.
- A licensed clip always plays with its credit, also after a diagram stood in for it while it
  loaded (a fault from Maintenance 25 the re-check found).

## Review

Four independent reviews read the round, one per item, each trying the code with probes of its
own; every finding was checked against the code before it was fixed, and each fix has a test that
fails when that fix alone is taken back out.

- **Item 40** (three faults, six risks): a double tap or a second Enter on the max sheet saved a
  slip unread; a held bodyweight could be left shown, unsaved and unasked (a field emptied on the
  way and saved, or a units switch); max sheet reps over thirty were read as thirty; a heavier set
  kept once was asked about again on every later set; holds read their seconds as reps; a max lower
  than one saved was asked about; added weight on a bodyweight lift and a weight under the empty bar
  went through unasked; a units switch made a re-typed bodyweight look like a slip; the wording of
  the ceiling, of per hand, and of Keep past what a profile keeps; Cancel hidden while an edit
  asked; and one browser check that proved nothing (a rest hidden at once).
- **Item 41** (five faults, three risks): the curve learned from noise: a lifter at one rep range
  with ordinary day-to-day variation got a curve 836 times in 1,000, nearly all at the bound of 44;
  an entered recent set was cut off at the curve's reach; the line credited the reach to the curve's
  constant and could say "fewer" at 30; it could appear twice, or be missing where the curve moved
  the target; pairs were counted, not sessions; a pushed set fed the fit. The curve was redesigned;
  the re-check then scored its targets, and it was withdrawn (above).
- **Item 42** (four faults, three risks): Undo of the change came back on the next set; a lift done
  at bodyweight that falls short every session read as a bad start every session; a target set by
  hand after the first set took that lift out of the reading after the fact; a check-in said "full
  workout kept" while the rest stayed eased; the three-rep rule was applied past twelve reps, where
  reserve is misjudged (Halperin 2022), and against a reserve the day's settings had added; a
  stand-in counted as a second lift; a failed rebuild was tried again on every set.
- **Item 50** (eleven findings): a replacement did not show until the app was opened again; Play
  that went away dropped the focus to the page; a refusal of one video held others still; Try again
  stood over a diagram's label; the picture's button had no name of what it showed; a pause the
  browser made could leave a clip stopped with nothing to start it; the overlay buttons were 34 px;
  "Your GIF" could wrap; and the notes and comments that still spoke of Pause.

## Re-check

A second independent review of each item read the fixed code with fresh probes, a browser at
375 px and, for item 41, a simulation of its targets.

- **Item 40** (four faults, four risks, six nits): a weight under one lifted earlier that day
  skipped every check, the empty bar's too ("13" after 135); a push-up's added weight or a band's
  tension was read as a related lift's max; after a units switch a held slip deleted the saved
  bodyweight while the message said it was not changed; a units switch dropped the quarter rule; a
  quick tap could land on the logger's keep button; a lighter bar of the lifter's own was asked
  about on every first set; one light set on a related lift outweighed the body's estimate; reps
  questions had no memory (sixty calf raises asked about on every set); setup asked again about a
  kept bodyweight after Back and Next; correcting only a set's reserve asked again; a question could
  show mid-typing; step-ups and bench dips had a bar's ceiling; a screen reader read the buttons
  with the question. All fixed; "per hand" for one implement held in both hands is Proposed.
- **Item 41** (two faults, four risks, three nits, a wrong figure in the note, and the simulation
  of its targets): withdrawn, above.
- **Item 42** (five faults, two risks, three nits): a set was judged at the day's settings when it
  was logged, not at what its own target carried, so a set kept from before a check-in read wrong
  both ways; a target an entered max raised was judged; the rule about last time read the newest
  session at any rep range, and any set under the floor (a tired last set kept a lift out); a change
  that failed outlived its workout; a skipped set filled in later lost its "set by hand" mark; a
  change queued behind another ran on a stale reading ("your check-in still eases the rest" with no
  check-in); "Feeling good: nothing left to change" while the rest stayed eased; the overlay's title
  when other settings stay; and twelve reps judged on the range's bottom alone. All fixed.
- **Item 50** (two faults, two risks, seven nits): a pause the browser makes as the page hides
  could be read as a refusal; the focus fell to the page after a pick or a Remove; a licensed clip
  could play without its credit (above); a data read running across a pick hid the new GIF until the
  next read; Play's press was not kept per picture; a large picture was held twice per screen after
  a read; after Play over a picture a second Enter opened the file chooser; a browser check measured
  the wrong box; wording that still spoke of Pause; the buttons under a picture were 34 px; and the
  "no Pause" checks could not fail. All fixed.

## Third pass

A third independent review of each item read the fixed code again, with fresh probes.

- **Item 40** (two faults, four risks, three nits): a correction of a kept set was asked about
  again, its own numbers not counted; a weight lifted earlier that day covered any reps, so a reps
  slip on the max sheet saved unasked; a kept number was asked about again at the first set of every
  session (the ceiling, the place's weights, as much as the lifter weighs); a question asked again
  within the wait was ready early; the "as much as you weigh" question and the 250 lb ceiling met
  ordinary lower-body loads (a glute bridge); a saved bodyweight that was itself a slip made its
  correction the question; a number Settings saved at a pause was put back by a later question, and
  the message said the bodyweight was not changed; ordinary first sets of beginners read 2.7 to 3
  times the body's estimate and were asked about; a set past twenty reps was dropped. All fixed; a
  units switch keeping the number as typed is a known limit, as before this round.
- **Item 42** (two faults, three risks, six nits): an Undo of the hard start came back after a first
  set was deleted and logged again; a beginner style that asks three in reserve, lifted to failure
  at the floor, read as a hard start every session; the hard start's rebuild added an exercise for
  the time it freed, or swapped one (eased in place in this pass; the fourth pass took that back);
  a loaded saved workout's targets were read as today's; the
  plan's reserve was read again after a style change; a skipped set filled in later kept the time it
  was skipped; the hard start hid a failed change of the same set; a queued run ignored an Undo; a
  failure could be written to the next plan; the line could take back a change made between; the
  overlay said "A hard start" when the start no longer fell short. All fixed; the set-by-hand mark
  following the lift's own, and sessions from before this update, are known limits.
- **Item 50** (two faults, one risk, six nits): a read of the data begun during a pick could hide
  the picture just saved; a removed GIF came back for a moment on the next pick; the focus fell to
  the page after Remove when another exercise also had a picture; a save on one exercise held
  another's buttons; a Play pressed on one demonstration moved the next exercise's, and fetched its
  clip; a still that loaded after a removal kept the diagram's label and lost its credit; a
  replacement of the same size made at the same moment did not show (tests only); the focus ring of
  a picture's frame was clipped; and wording that still spoke of Pause. All fixed.

## Fourth pass

A fourth independent review of each item read the third pass's fixes.

- **Item 40** (two faults, two risks, four nits): a set logged a digit short and corrected was held
  to its old number ("best 6 lb per hand × 10"); weight added on the lower body had lost the
  dumbbell's ceiling, so a tenfold slip went unasked; at five times the body's estimate, a heavy
  beginner's tenfold slip went unasked (now three and a half: measured, real first sets read up to
  3.2 times it and those slips from 3.6); an emptied field could become the bodyweight a question
  went back to; the logged best and the number typed were read with different rep caps; a number
  Settings saved at a pause was not the one confirmed; two copied constants. All fixed; the units
  switch keeping the number as typed stays a known limit.
- **Item 42** (one fault, two risks, three nits): easing the rest in place, the third pass's fix,
  gave back on "Back to plan" sets the time had taken (past an end time too), left lifts set by
  hand, added by the coach or standing in as they were, and changed a lift's set count label. It
  is taken back: the hard start rebuilds as a low check-in does (the fifth pass changed this
  again: see below). Also: a lift at bodyweight new to today's range was judged; the
  mark for a session that fell short read that day's settings, not the plan's; a change worked out
  on a workout discarded meanwhile was given to the plan that followed. All fixed.
- **Item 50** (two risks, two nits): a removal and a pick at once, or a read of the data between a
  count and its write, left the count off and a picture hidden (writes now go one at a time, each
  counting what the database holds); a save on one exercise could free another's; a failed Remove
  left the focus on Replace; a Maintenance 25 note still spoke of Pause. All fixed.

## Fifth pass

A fifth independent review of each item read the fourth pass's fixes.

- **Item 40** (three faults, three nits): at three and a half times the body's estimate, a light
  beginner's prefilled first target (never under the empty bar or a load step) was asked about; a
  kept set corrected by a rep, a step or to a lighter reading was asked about again; setup
  confirmed a bodyweight on a pause it had not saved; a kept slip spared a different weight in its
  own correction. All fixed: the set's own target sets the least an estimate's limit can be, a
  correction is spared within one and a half times its own reading, and only Settings, which saves
  at a pause, confirms one. A tenfold slip landing exactly on a ceiling (25 lb added as 250) on a
  lift done at bodyweight with nothing logged is a known limit.
- **Item 42** (three faults, one risk, two nits): the check-in's own rebuild, back since the fourth
  pass, added work for the time the clock left (an exercise, a superset, a drop set to failure),
  worded the time fit's removals as the hard start's or "Back to plan", and dropped the lifter's own
  choices (a weight or count set by hand, an order, a rest) on a set log no one tapped for; a plan
  not yet started lost a change made again during it; a workout finished during a change took it.
  The hard start now eases the lifts still to come where it stands, keeping what it took on each
  and giving exactly that back; the guard on a change's result keeps a plan not yet started's.
- **Item 50** (one fault, two risks, one nit): a removal that failed after its delete landed left a
  picture that no Remove could take away, and any failed write left the screen as it was; the focus
  could miss Remove when the browser drew before the buttons were enabled again; the queue held the
  last picked file in memory. All fixed: every media write ends by counting the database and reading
  each picture again, a removal of one already gone brings the screen up to date, and the save's own
  end gives the focus back.

## Sixth pass

A sixth independent review read the fifth pass's fixes.

- **Item 40** (one fault, two nits): with no bodyweight saved and nothing related logged, the set's
  own target alone made a limit, so on the default profile a real first set was asked about against
  "a max of about 0 lb"; setup called a bodyweight typed and left "saved"; a known-limit line no
  longer held. Fixed: with no estimate nothing is asked by one (the target only raises a limit),
  setup says "the bodyweight you entered", and the line is amended.
- **Item 42** (five faults, four risks, two nits): the in-place ease re-targeted each lift from the
  whole session, so some eased lifts came out heavier and "Back to plan" missed the plan's weights;
  a rebuild after it (a new length, a pause) eased the lifts again with no record, so an undo and the
  same short sets eased them twice; after a sore check-in it took a second set; a count set by hand
  after it came back overridden, once past the most sets a lift carries; it took sets below the
  floor a low check-in keeps; its marks went into saved workouts; a lift the coach added during it
  kept its extra rep; the way back could run past an end time; a plan not yet started, made again
  during a change, took the old plan's result; a superset counted a drop set as a round. The hard
  start is now a layer over the plan, with each rule above built in (item 42 and
  `docs/research/bad-start.md`). A block's rounds count its working sets alone: since Maintenance
  24 a straight lift with a drop set showed a set more after any change.
- **Item 50** (one fault, one risk, one nit): a removal that failed after the picture went left the
  focus on the page; a count that failed after a first pick verified written hid the picture; a
  failed read of a picture went unhandled. Fixed: the focus goes to the bar when the picture went, a
  picture verified written counts as one at least, and a failed read keeps what is shown.

## Seventh pass

A seventh independent review read the sixth pass's fixes.

- **Item 40** (one fault, two nits): with no bodyweight saved, a lift's first target read from the
  lifter's other lifts (a curl's from the bench) had no estimate behind it in the check, so a
  tenfold slip of it (650 for 65) went in unasked, on the max sheet too; setup named an older
  bodyweight while a newer one stood, and after a units switch a converted figure was named as
  saved; "a max of about 0" could still show. Fixed: what the other lifts suggest is a third
  estimate, as the first target reads it; a pause confirms in setup too, as the bodyweight
  entered; the question names the bodyweight as it was confirmed, with what it comes to; an
  estimate that rounds to nothing is none.
- **Item 42** (five faults, four risks, four nits): a check-in after a hard start was said to leave
  the rest as eased while a low check-in's own treatment brought reps back, its rep in reserve
  moving no load on high-rep sets; Skip said "about 0 min saved" (and, with no hard start, counted
  the time since the workout began); a stand-in for a lift begun during the ease was eased twice
  and not given back; a lift swapped in a pair under way kept the old exercise's record, and a
  later change put its targets on the new one; more paths counted a drop set as a round (since
  Maintenance 24); a saved copy kept the eased sets and the hard start's line; "fewer reps over
  more sets" added two to what showed; an undo that left a lift eased with no hard start changed it
  unsaid at a later change; a change left on a plan made again was dropped without a word; an
  unpin let the ease take a set the coach offered. Fixed: the words name what changed; Skip times
  the lift as the plan shows it; a lift stopped owes the plan's sets; a swap keeps no record, and a
  record knows its exercise; every path counts working sets alone; a saved copy keeps the plan
  under the ease; the coach's set counts from what shows; an undo that leaves the ease out of step
  brings the plan back at once, said (taken out in the eighth pass); a change left says so, and Skip says it was not made; the
  coach's lifts are known by having no place in the plan. The low check-in's own treatment stands,
  as it always has (Proposed below).
- **Item 50** (two faults, one risk): a Remove that failed after taking the picture, with another
  picture kept, left the focus on the page once the picture went, and showed an error; a removal
  followed by a failed read left the removed picture showing; the pick buttons read a ref in
  render, which the lint gate refuses. Fixed: a removal that fails reads again, and a picture gone
  is removed, said so, the focus on the bar; a failed read is tried once more a moment later; the
  buttons read the ref in the click.

## Eighth pass

An eighth independent review read the seventh pass's fixes.

- **Item 40** (one fault, two risks, one nit): a bodyweight a units switch let in was not
  confirmed, so the next change was judged against the older one; the other lifts' estimate read
  each lift's newest session, so a light day on one made a real first set on another look like a
  slip; a max entered months before overrode the logs since, in first targets too, against the
  engine's own rule for a lift's own max; a bodyweight kept out of the range still estimated "about
  2 lb". Fixed: a number let in is confirmed; the check reads each other lift at its best, and a
  max entered where it is higher; a max stands for a first target only when entered after that
  lift's logs; a bodyweight out of the range estimates nothing.
- **Item 50** (one risk, two nits): a removal or a pick whose check failed after it landed was
  decided by each screen's own read, which could disagree (an error over a picture saved, a
  removed one still showing); the storage's own words reached the lifter. Fixed: the store reads
  once more and says what the write did, telling every screen when a picture is gone; the words
  are plain.
- **Item 42** (four faults, four risks, three nits): the settle the seventh pass added for an undo
  could block a real "Back to plan" once undone, did not run where the start's change had been
  taken back, left the sets that came back out of its words, and would have tried a failure on
  every set; records kept on lifts under way went stale, so a later give-back put the plan back
  over a weight or count the lifter had set; a lift begun before the hard start was eased unsaid
  after an undo; pairs said fewer rounds than they ran (since Maintenance 24); a saved copy said
  only the minutes left. Fixed by taking the settle out: a lift under way keeps the ease for good,
  its record never given back, and one under way before the hard start keeps its sets; a count set
  by hand stands when a lift stops; pairs count the rounds they run; a saved copy is timed as a
  whole plan. Sets that join a lift under way, and a lift swapped in a pair under way, are known
  limits.

## Ninth pass

A ninth independent review read the eighth pass's fixes, one reviewer for items 40 and 50 and one
for item 42.

- **Item 40** (two risks, three nits): one set of many reps on another lift, read with no cap,
  held the other lifts' ceiling up for 180 days, so a tenfold slip went unasked; a max entered more
  than 180 days before counted as entered that day once the logs after it had aged out, a max of no
  readable date counted as the newest, and one entered mid-workout counted for the lift's own
  target but not for other lifts' first targets; a bodyweight kept out of the range still judged
  weight added to the body ("as much as you weigh (18 lb)"). Fixed: the ceiling reads every set's
  reps up to thirty, as the check reads the set typed; a max counts only within the 180 days,
  weighed by its own age, and stands against a lift's logs when entered after the lift last began,
  as the lift's own target reads it; a bodyweight out of the range judges nothing.
- **Item 50** (four nits): a read of the data after a removal could bring the removed picture back
  while reads failed; the mark that let a removed picture go also hid one another window picked
  after, or one that landed though neither its check nor the store could read it back; a file the
  browser could not read showed the browser's own words. Fixed: a picture read before its removal
  is let go for good, and one read after shows; the words are plain.
- **Item 42** (two faults, two risks, two nits): a copy saved after a rebuild under way was timed
  against the minutes left, with no warm-up ("about 38 min, 8 over"), and counted lifts stopped on
  the day that loading drops; a lift stopped under the ease owed its stand-in the plan's sets, so
  the set the ease took came back unsaid, a count set by hand lost a set, and a lift done under the
  ease got a one-set stand-in at a new place; a mark on a lift begun before the hard start outlived
  "Back to plan" and kept a later hard start off it; a lift that was under way, its sets undone,
  was refitted half-eased by new weights, a check-in or a max; a copy put the plan's sets back
  under settings made since (a drop set's badge with no drop set, one rest shown and another
  timed). Fixed: a stopped lift owes what it shows, and what stands in for it keeps that count;
  the marks go with the hard start; a lift that was under way is fitted in place and otherwise left
  as it is; a lift's record keeps its own settings; a copy is counted as it loads and timed for its
  own length.

## Tenth pass

A tenth independent review read the ninth pass's fixes, again one reviewer for items 40 and 50 and
one for item 42.

- **Item 40** (one fault, three risks, a nit): an entered max above a lift's logs, weighed by its
  own age as a ceiling, made a lift trained the day before weigh as months old and lowered the
  ceiling, so a set the logs alone allowed was asked about; a long set still read uncapped for a
  first target; a max dated ahead counted as the newest, here and on the lift's own target; a set
  logged at no weight read as a max of nothing; an older workout's late set times moved when a
  lift began. Fixed: a max never weighs as older than the logs it stands over; a first target
  reads every rep up to thirty, a single as lifted; a date more than a day ahead is no date; a
  load of nothing is no max; the lift began in its newest workout.
- **Item 50** (one fault): a sheet the workout keeps shut held the picture it had read, and a pick
  or a read of the data took the removal's mark off, so the sheet opened again showed the removed
  picture. Fixed: a mark is never taken off; it lets go only what was read before it, and no
  render shows that.
- **Item 42** (one fault, two low faults, a rare fault, two nits): the ninth pass's rule for a lift
  that was under way also caught a lift that only carried a mark, so a lift begun before the hard
  start lost a check-in and a max, and a max on a lift keeping the ease said it kept "the weight
  set for today"; a copy saved after new weights gave back the last place's; a copy named first a
  lift it did not hold, and kept fitting steps of the minutes left; a lift stopped lost the ease
  it kept, so picked up again it could be eased twice. Fixed: only a lift that took the ease keeps
  it; a max says it is under way, and its card offers none; the record follows new weights; a
  copy names only what it holds and keeps no fit of another length; a lift stopped keeps the ease
  it kept.

## Eleventh pass

An eleventh independent review read the tenth pass's fixes.

- **Item 40** (no fault; a risk and nits): a max entered fresh over a lift's old logs, or on a lift
  never logged, could still lower the other lifts' ceiling, which weighs the lifts together; a max
  dated ahead was read as dated with no clock given. Fixed: the check takes the higher of the
  ceiling with and without the maxes; with no clock given, the real one.
- **Item 50** (one fault): a sheet kept shut held the picture it last read, so a picture replaced
  meanwhile showed for a moment when it opened again. Fixed: a sheet kept shut keeps reading the
  exercise it last showed.
- **Item 42** (four faults, a nit): the tenth pass's keeping of the ease on a lift stopped gave a
  copy the plan's sets on top of a stand-in's after a swap back, at the weights of a place left;
  a lift keeping the ease, its set undone and swapped in place, was eased again; whether a lift
  kept the ease after an undo hung on whether any change ran while its set was logged; a record's
  ramps changed by a refit were not said in its settings. Fixed: a lift stopped drops its record
  again (the case the tenth pass kept it for is a known limit); a swap in place is planned at the
  plan's count, or the count set by hand, and eased once; the store keeps a lift under way the
  moment a set of it is undone (taken back in the twelfth pass); a refitted record's settings
  follow its ramps and drop set.

## Twelfth pass

A twelfth review read the eleventh pass's fixes: items 40 and 50 clean; in item 42, two faults and
a design risk.

- The swap in place used the plan's count in a pair under way too, where the ease is not laid
  again, so the set and reserve the ease took came back unsaid, and the pair's rounds went stale.
  Fixed: only in a block with nothing logged (made exact in the thirteenth pass).
- Keeping the ease on every undo held out of "Back to plan" a lift whose set was logged by mistake
  and undone at once, which has nothing a change passed by. Taken back: a record is kept when a
  change is made while its lift is under way, as before; the eleventh review's two outcomes for
  the same taps are this rule.
- A swap in place after a check-in made while the lift was under way, its set undone, is a known
  limit; a clock that cannot be read is now no clock.

## Thirteenth pass

A thirteenth review read the twelfth pass's fixes, item 42 alone: the undo works as described; the
swap in place had two faults.

- In a block with nothing logged but no ease to lay (the hard start taken off, or a check-in that
  already takes the set), the swap still came in at the plan's count, so a set came back unsaid
  and the block's rounds went stale; in a pair under way it kept the ease's count, so a saved copy
  kept the ease's too. Fixed by one rule: where the ease is laid on what comes in, it comes in at
  the plan's count and the ease takes it once; anywhere else it keeps the count the lift showed,
  and the plan's count is kept on it, so a saved copy gives the plan back.
- Docs that still said the ease is kept once a block is begun now say once a change is made while
  it is begun.

## Fourteenth pass

A fourteenth review read the thirteenth pass's swap rule: what came in where the ease was not laid
again kept the eased count but came in at the plan's reserve, with no reason said; where it was
laid again, an end time's trim was undone; and a lift marked under way before the hard start lost
its mark, so the ease landed on what came in. Fixed by one simpler rule in place of both branches:
a lift keeping the ease hands its place on as it stands, what comes in taking the count, the rep in
reserve and the reason the lift showed, kept for good as on the lift, with the plan kept for a saved
copy; a mark is handed on too.

## Fifteenth pass

A fifteenth review read that rule: what came in was matched to the lift's own reserve, so where its
own plan asks another (an undulating lift on another zone) or under "Make it harder" it came in
half-eased, kept so for good; a count set by hand skipped the rule and lost its rep in reserve where
the layer lays none; stand-ins and swaps back read the day's settings off eased sets, so under
"Make it harder" the ease's rep was taken twice; and the reason credited the hard start with a set
an end time trimmed. Fixed: what comes in is planned under the day's settings, read from the
settings themselves for a lift keeping the ease, and eased as the layer eases a lift to come (a test
holds every swap to the layer's own on the same lift, every style, harder and an undulating zone);
a count set by hand takes the same path at its own count; the reason counts only the sets the ease
took.

## Sixteenth pass

A sixteenth review read the fifteenth pass's fixes. One fault: with a low check-in in force, what
came in said "Eased for a hard start: ." over a set the check-in took; fixed, the line is said only
where the ease itself did something. "Make it harder" or "easier" changed while an eased lift is
under way reaches a stand-in a step apart from the plain day's; no screen sends either, so it is a
known limit. And "kept for good" holds while the lift stays in the plan: a check-in or a new length
that builds the rest again may pick a place anew where its lift is neither pinned nor in front, as
for any lift to come, which the docs now say.

## Known limits

- **No Pause (WCAG 2.2.2).** Motion that starts by itself and runs past five seconds should have a
  way to pause it. The owner asked for none; the phone's own reduced-motion setting keeps every
  demonstration still, with Play, and the card's loop runs only for the exercise in front.
- **A units switch does not convert the saved bodyweight** (as before this round): switching pounds
  to kilograms keeps the number as it was typed. Within one visit to the editor the question reads
  the confirmed bodyweight in the new units; opened again, the number kept is read as it stands, and
  the bodyweight typed anew is asked about once. A logged set keeps no units either, so a lift's
  first set after a switch may be asked about once.
- **Reps in reserve are not asked about:** a slip there moves the next target by one step at most.
- **The hard start reads sets asked for twelve reps to failure or fewer:** a lift at 15-20, at 10-12
  with three in reserve, or a "Light weights" day is never read.
- **A check-in that takes a set refills its time,** as before this round: the plan is fitted to
  the length chosen, so an exercise may come back. A hard start's ease never does: the plan under it was
  fitted, and the eased plan only runs shorter (Proposed for the check-in below).
- **An eased set with no lighter load near** keeps its load and does a rep fewer: its range is
  logged a rep under the plan's, which the next session reads as the same range.
- **A low check-in with a hard start in force** keeps the check-in's own treatment: where its rep
  in reserve moves no load (a set at twelve reps and reserve or more), the set keeps its reps
  (Proposed for the check-in below).
- **A ramp added by hand to an eased lift** takes the plan's reps, a rep over its eased sets'.
- **A lift under way keeps the ease for good:** once a change is made while its block is begun,
  neither "Back to plan" nor an undo of its sets gives it the plan back. What stands in for it, when it is swapped or stopped
  at a place, keeps the count the ease left, in the workout and in a copy saved after; only a lift
  not begun gets its set back.
- **Sets that join a lift under way** (a swap back, a lift picked up again at a place) come as the
  plan has them.
- **What comes in for a lift keeping the ease, swapped in place,** keeps the ease for good as that
  lift did: Back to plan leaves it, its card offers no max, and a max entered on it says it is
  under way.
- **"Kept for good" holds while the lift stays in the plan:** a check-in or a new length that
  builds the rest again may pick its place anew where it is neither pinned nor in front, as for any
  lift to come; what comes in then is eased, or not, as the layer eases a lift to come.
- **"Make it harder" or "easier" changed while an eased lift is under way** reaches what stands in
  for it, or a lift picked up again, a step apart from the plain day's. No screen sends either.
- **A tenfold slip landing on a ceiling** (25 lb added typed as 250) passes on a lift done at
  bodyweight with nothing logged when no bodyweight is saved, or on the lower body (a step-up, a
  split squat, a glute bridge); with a bodyweight saved, a chin-up or a dip asks it. A bodyweight
  kept out of the range is read as none: weight added to the body is then held only to what
  almost anyone adds.
- **A pair member's rest changed under the ease** comes back in a saved copy at the plan's own,
  the pair's changed rest staying: the rest shown and the rest timed agree.
- **A lift stopped under the ease and picked up again** (swapped away and back, or at a place and
  back), its set then undone, and the hard start taken off and told again, may take the ease a
  second time, a set more off and a rep more in reserve: the record it kept goes when it stops, as
  a record kept on gave a copy too many sets.
- **A lift swapped in place after a change of the day's settings while it was under way** (a
  check-in, harder or easier), its sets then undone, is planned at the count the plan had before
  that change.
- **A copy saved after new weights or a new place** gives a lift under way back at those weights,
  with the drop set it had where the place now pushes its sets to effort.
- **A beginner who starts far below the body's estimate** may slip unasked on a lift never logged;
  one far above it is asked once.
- **Set by hand follows the lift:** a set skipped before its target was set by hand and filled in
  after, or undone and logged again after, reads as set by hand and is left out of the hard start.
- **A lighter bar of the lifter's own** is asked about once on each lift, and again when a set at
  it is corrected to another weight under the bar: the app records no bar.
- **"Per hand"** is said for a lift with one implement held in both hands (a goblet squat, a
  kettlebell swing, a dumbbell pullover), in the question as in the app's other labels.

## Things to settle

- **Item 41 after this round:** keep it agreed and build it after item 43, learning each lift's
  curve from the sets to failure item 43 adds and shipping it only if a new simulation shows it
  brings targets closer than the one curve does (my recommendation); or drop it.

## Proposed

My suggestions, not agreed:

- **High-rep targets, for everyone:** count a 15-20-rep target's reps past twelve, which the cap
  at twelve now starts too heavy (Nuzzo 2024: about 60% of the max for twenty reps; the cap asks
  about 71%), with its own check of the evidence and a simulation first.
- **A set's reserve in its max, for everyone,** after item 43: a target converted from an estimate (a
  return, a new rep range) now comes out lighter than the sets it came from; counting the logged
  reserve brought those targets closer in the simulation, and item 43 would correct the reserve
  first (it is about a rep low, Halperin 2022).
- **A low check-in keeps the time it frees,** as a hard start now does: fewer sets and a rep more
  in reserve where the lifts stand, with no exercise brought back to fill the length.
- **A check-in's extra rep in reserve where the load cannot move:** targets read loads to twelve
  reps and reserve, so on a high-rep set (or a load step too coarse) a check-in's rep in reserve
  keeps the load and the reps and asks more of the lifter, not less. The hard start's ease takes a
  rep off there; the check-in could too, with its own check of the evidence. With a hard start in
  force the two would then match exactly.
- **Convert the bodyweight when the units change** (and say so), so a switch never leaves 180 lb
  as 180 kg.
- **"Per hand" only where a lift uses one implement in each hand,** in the question and the app's
  other labels alike.
- **A setting to keep the card's demonstrations still,** for good (carried from Maintenance 25).
- **A fault found in passing, since Maintenance 22:** once the logged sets of a lift swapped out
  after it began (for comfort or a sore joint), or stopped at a place, are undone, the check of the
  plan refuses every change made to one lift ("on your disliked list", "needs equipment that is
  not available"), a hard start's among them; a new length still works. Undo and removing a set
  could keep such a lift stopped, or the check could pass over a lift stopped.
- **A fault found in passing, since Maintenance 25:** coming back after a break, a max entered is
  judged against the lift's newest session at today's rep range, not its newest session of any
  range as the break is timed, so with rotating ranges a max entered between two sessions can lower
  the first session back, or say it was "entered after you began this lift last time" when it was
  not (`liftBegan(history, latest ?? last)` would read it right).
- **A fault found in passing, since before Maintenance 26:** a sore joint marked on a lift begun,
  with nothing safe to swap in, removes it with its logged sets, so the change fails ("Logged sets
  … would have been lost, so nothing was changed"); it could stop the lift at its logged sets
  instead, as a swap once begun does.
- **A lift finished before a place change kept in a saved copy:** a copy leaves out a lift
  stopped with nothing owed, as loading a copy has since Maintenance 22, so a lift done in full at
  the gym is missing from a copy saved at home.
- **The custom exercise sheet's picture, said plainly and saved once:** when its picture fails to
  save, the sheet shows the storage's own words, and a second Save makes the exercise, already
  made, again. Its words could be plain, and a second Save could add the picture to the one made
  (found by the ninth review, outside this round).

## The complete revert run

Every fix of this round, taken out alone, must fail a test. Each has an entry in the revert table
that takes that fix alone back out and runs its tests, and the table keeps the three rounds before
this one: 1,199 entries, 330 from this round, 516 from Maintenance 25, 185 from Maintenance 24 and
168 from Maintenance 23. Eighty more are retired, 58 of them in this round: a later design replaced
the code each one took out, so there is nothing left to revert, and each names the entries that
guard what took its place. Of the 58, 37 are this round's own (item 42's ease rebuilt as a layer,
and later passes' rules that replaced earlier ones; three of them guarded lines no state a lifter
reaches can show), 19 are Maintenance 25's (17 guarded the Pause and the card's hold that item 50
took out), and 2 are Maintenance 23's (the max offer's rule, moved to its own file, where two of
this round's entries guard it).

The complete run on the final tree caught 1,196 of 1,200. Of the four it did not, three were fixes
no test reached: a picture of the lifter's own let go when the data holds none with no removal made
here, as after a restore (item 50); the Settings question naming the bodyweight saved, not one being
typed (item 40); and an estimate that rounds to nothing taken as none (item 40). Each now has its
test and fails it when taken out. The fourth guarded the record a swap drops, which every path now
writes afresh, so no test or lifter can see it; it is one of the three retired above. So all 1,199
are caught.

Each browser revert takes a fix out of a real build and runs its browser test. This round has nine:
the set logger asking about a slip, a hard start easing the lifts still to come, a tap on the
demonstration picking the lifter's own, How to setting it, a replacement showing at once, Play over
a picture standing at the top clear of a diagram's label, the buttons over and under a picture a
thumb's height, and "Your GIF" on one line. Maintenance 25's phone-review fix keeps seven of its
eleven; its four on the Pause's hold are retired with the Pause. Two of the sixteen passed their
test at first. "Your GIF" fits on one line at 412 px in any font, so its test now also measures it
in Verdana, where it breaks at 360 px without its rule. And the card's clip started by the app's
rule alone had lost its test with the Pause, so the test of the lifter's own GIF now checks that the
card's clip, back under How to after a Remove, stays still while How to's own plays. With the
sixteen of the rounds before (item 8's plates, item 7's clips, the gym barcode and the update path),
all 32 browser reverts fail their test on the final tree.

## Verification

The local gate (`npm run verify`) on the final tree: lint and type check clean; 2,008 unit tests in
211 files passed; the build, the privacy scan (707 text files, no findings) and the build check
passed; and the browser suite passed 384 tests, 14 skipped by design, none failed, on its first run.

The gate before it failed one browser test on all three screens: this round's own check that a hard
start eases the rest. Its setup still asked each lift for 2 in reserve. It was written before the
re-check of item 42 made the start read against the smaller of a target's reserve and the plan's,
and where the plan asks 1, five reps with none in reserve are two short, not three. So no hard start
was read, as the rule says. The test now asks for none in reserve, which is the smaller whatever the
style plans, and logs three short of it. Its browser revert had counted as caught while the test
failed for that reason of its own; run again on the passing test, it fails at the hard start's line,
and the browser reverts now check that each test passes without any revert first. The same test
could also reload the page in the moment after setup showed Today and before setup moved to Today's
route, which cancels the reload (about half the runs at 412 px once the test got that far): the
shared setup step now waits for the route. The app is unchanged.

The revert runs on the final tree: all 1,199 unit entries caught, and all 32 browser reverts (The
complete revert run, above).

Deployed as build `43d50e6` by Deploy Pages run 38037382932: its verify job passed, the browser
suite on the Linux runner included (384 passed, 14 skipped by design, none failed, no retries), and
so did the deploy. The live bundle carries the commit, and the marker reads "Build 43d50e6 ·
2026-10-10 08:21 UTC · Phase 8". Against the live URL: 380 passed, 18 skipped by design, none
failed, on the second run. On the first, four tests could not load the live page in time
(net::ERR_TIMED_OUT reaching github.io; one page was still opening at the 30-second limit), so the
eight installed-app and update tests, which run after the others, did not run. Run again on their
own, the four passed. The four skipped beyond the local run's 14 are the update tests, which need two
builds served locally.

## Review on the phone

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ , the release to check is build
`43d50e6` (Settings, About this app). Step 6 replaces Maintenance 25's step 8 (there is no Pause now).
Item 41 is not in this release, so it has no step.

**Item 40, numbers that look like slips**

1. Start a workout. On a lift you have logged before, tap the weight and type it with an extra zero
   (1850 for 185), then tap Log: a yellow box under the set asks about it, with "Log 1850 lb × 5"
   and "Change it" where Log stood. Tap Change it: the weight opens to type. Type the right weight
   and log it: no question.
2. On the next set, a few pounds heavier than you lifted (a real top set): no question.
3. Options, then your max, "I know my max": type 2250 and tap Save twice quickly. The question
   comes up and the second tap lands on "Change it": nothing is saved. Type 225 and save it.
4. Settings, Units & body: type 1800 as your bodyweight. After a moment it asks, offering only
   "Change it" (a bodyweight can be at most 1000). Type one a quarter away from yours: it asks,
   with "Keep".

**Item 42, a bad start**

5. Start a workout, and on each of the first two lifts log the first working set three reps short
   with nothing in reserve (for 6-10 at 2 in reserve: 5 reps at 0). After the second, the line at
   the top reads "Eased for a hard start (... fell well short; fewer sets with an extra rep in
   reserve)", and the lifts not begun show a set fewer. Tap Undo on that line: the plan comes back,
   and the next set you log does not bring the hard start back. (Undoing the second set instead
   says "Back to plan".)

**Item 50, How to without Pause, and your own GIF**

6. Open How to on the bench press: its video plays with Slow only, no Pause. Tap the video: the
   phone's picker opens; choose a GIF. It shows in How to and on the card, with Replace and Remove.
   Replace it with another: the new one shows at once. Remove: the video is back, looping on the
   card.
7. Open How to on Ab Wheel Rollout (a diagram): no Pause over its label; under it, "Diagram · tap
   it to use your own GIF" and "Your GIF" on one line.
8. With the phone set to remove animations (Settings, Accessibility): How to shows a still with
   Play (at the foot of a video's still; at the top corner over a diagram or a picture of your own);
   Play starts it.
9. With How to playing a video, switch to another app and back a few times, and lock and unlock the
   phone: the video plays on each time, with no Play over a stopped picture.
