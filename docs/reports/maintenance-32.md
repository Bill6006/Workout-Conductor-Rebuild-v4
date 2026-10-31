# Maintenance 32: round N, the main lift's top set and back-offs

Built on 2026-10-23 on the owner's word to build the whole agreed queue, round by round, to live,
without pausing at review gates, which stay YELLOW. Round N is item 11, a top set plus back-off
sets, a training rule: it rests on the research done for it (`docs/research/top-set-back-offs.md`)
and on the owner's answers to its questions.

## 11. A top set plus back-off sets

**As agreed** (the owner's answers):

- On by default for the main lift (primary strength) under Hybrid, Strength focus and Lean-down; off
  under Undulating and Hypertrophy focus. Secondary strength lifts stay on straight sets.
- The top set at 1 in reserve, Lean-down too; the back-offs 5% lighter than the top set, at the same
  reps, at 2 in reserve.
- Back-offs missed never hold back the top set's load step; they widen the drop.
- No extras in the workout: no second top set, no stop at an effort.

**Delivered:**

- The main lift's first working set is its top set: its strength range, at 1 in reserve, at the load
  the progression sets, the ramps leading up to it. The rest are back-offs at the same reps, 5%
  lighter, to the nearest weight the place has, never under the bar, at 2 in reserve. Today shows "1 × 190 ×
  4-6 @ RIR 1, then 3 × 180 @ RIR 2"; the Workout tab names "Top set" and "Back-off 1 of 3", says
  "top set: stop 1 clean rep short of failure; the back-offs follow it", and "Why this target" has a
  line on the back-offs, with the evidence.
- Straight sets as before: under Hypertrophy focus and Undulating (the owner), Light weights and
  Foundation (the research); on a secondary strength lift; on a lift with no weight to take off, or
  a hold; where the load is a guess or eased (a first target, an estimate, a return, a micro-deload,
  a reset, the coach's deload) or fatigue is high (the research). By judgement, also in a deload
  week, a catch-up and a second workout, where the day already holds every set to its reserve; on
  the lift to push, whose sets the push sets (a question below); and on a top set the place cannot
  load as asked. A day that runs the lift straight after a session on the structure, a day it is a
  secondary lift included, takes its back-offs' load, the drop off the load the top set would carry
  (as asked, where the place cannot make it), at the day's reserve.
- The day's effort moves every set: "Make it easier" takes the top set to 2 in reserve and the
  back-offs to 3; "harder" takes the back-offs to 1, the top set staying at 1, never failure.
- In the workout, the top set lifted at another load moves its back-offs with it, 5% under it as
  lifted, a step up after one clearly easy and down after a grind. The first back-off's logger
  starts from its own load and reserve. A weight set by hand before the top set is done is the top
  set's, the back-offs following at the drop; once it is done, the back-offs take it. A set added is
  a back-off. A correction to the top set moves its back-offs as the set logged right would have,
  and its log taken back (an undo, a delete, a correction to a skip) puts them back where the plan
  has them. The back-offs are never heavier than the top set as lifted. A lift picked up again, back
  at the gym or swapped back to, carries on its back-offs after its top set, as it was lifted, and
  takes its top set and back-offs before it; another lift standing in for it carries straight sets,
  having no top set of its own, and so does the day's extra, swapped.
- The progression reads the top set alone: the load steps up when the top set clears its floor at 1
  in reserve or more, a top set at no reserve holds it, and back-offs missed never hold it back. The
  estimated max, stalls, "Last time", the summary's best set and the session's feedback read the top
  set too. Progress lists every working set of a session, the back-offs too. Weekly volume, fatigue
  and every count of working sets count the back-offs as working sets.
- The drop is 5%, kept with the plan and with the workout saved; a saved workout loaded takes each
  lift's drop in force. When the back-offs miss their reserve by a rep or more on average two
  sessions running at the drop in force, the same way, it moves 4% for each rep missed: harder
  widens it, easier narrows it, within 0 to 20% (Helms et al. 2018's 2% per half a rep of RPE; the
  trials' range). A rep under the floor counts as a rep of reserve under none.

## How it is kept

- Three new stored fields, each optional and dropped alone when an older or damaged copy cannot read
  it, never the set, the exercise or the plan around it: a planned and a logged set's tier (`top` or
  `back-off`, the engine's own list), a planned entry's and a logged exercise's drop, and their mark
  of a straight day at the back-offs' load (`atBackOffs`). Both tiers stay working sets. A workout
  logged before has no tier, and every set of it is read as before; an older copy that drops the
  mark reads that day as a straight session of the lift's own.

## Review

The round was reviewed adversarially, each finding shown first by a failing test, fixed, and its
revert added to the table.

**The first pass** (on the build) found twelve: five MEDIUM, seven LOW.

- MEDIUM: a correction to the top set's load left its back-offs where the typo had put them (225 lb
  behind a 140 lb top set); the coach's deload of a stalled main lift ("Deload to 170 lb this week")
  kept a top set one rep short of failure, where every eased load runs straight; "Make it harder"
  moved no set of the main lift, its back-offs held at 2 by the top set's floor; a saved workout
  loaded after the lift's sessions had moved its drop ran the old drop and made it the one in force,
  throwing away what the sessions taught; Progress listed only a session's top set, and missed a
  session whose top set was skipped.
- LOW: a main lift stopped before its top set and picked up again came back on straight sets; a lift
  standing in for it after a change of place took a second top set in the same slot; the day's
  extra, once swapped, took a top set and back-offs ahead of the day's main lift at the next refit;
  a main lift cut to its top set alone lost the top set and the drop through a refit, so a set added
  after was a copy of the top set, and lost a day made easier; the list of changes said nothing when
  only the back-offs' load moved; the follow's headline said the sets come down when a heavier top
  set took them up; the top set, in front again after a back-off was logged, started from the
  back-off's load and reserve.
- Fixed: each as the round's rules have it. The revert run's new tests found one more, LOW: a top
  set alone carries a plain day and a harder one alike at its floor of 1, so "Make it harder" was
  lost when a set was added after it was lifted; a top set alone now reads the day's reserve as its
  own.

**The second pass** (on those fixes, and the build) found ten: three MEDIUM, seven LOW.

- MEDIUM: a day that runs a main lift straight after sessions on the structure (fatigue high, a
  catch-up, the lift to push) asked the top set's load of every set at a straight set's reserve,
  more than its reps allow (a low check-in took the bench press's back-offs from 185 to 190 lb); a
  top set's log taken back (an undo, a delete, a correction to a skip) and logged again as planned
  left the back-offs where the slip had put them; the completion's "Next time" said "(hold)" after
  every main-lift session lifted as asked.
- LOW: a lift picked up after its top set lost the load the top set was lifted at and the step its
  log gave the back-offs; a lift standing in for one stopped took a second top set through a refit
  or a max entered; a correction to the top set took no step and ran only for a changed load;
  back-off 2's logger started at a corrected top set's numbers; the list of changes said nothing of
  the loads when the structure came back on; "Why this target" said every set cleared the floor when
  only the top set was read; a clearly easy top set at a drop narrowed to nothing took the back-offs
  over it.
- Fixed: each as the round's rules have it. A straight day after the structure takes the back-offs'
  load (by judgement: the back-offs ran at a straight set's reserve, and a top set the lift steps up
  from is read at its own); the completion reads the next target as the next plan does. The revert
  run's new tests found one more, LOW: a refit on a day that runs the lift straight, with no effort
  setting, took the top set's load again; it takes the target as built.

**The third pass** (on those fixes, and the build) found eleven: one HIGH, one MEDIUM, nine LOW.

- HIGH: a strength lift that is the main lift one day and a secondary one another (the row on the
  pull and the upper day, the bench press on the upper and the full-body day), straight on its
  secondary day, asked the top set's load of every set at a straight set's reserve and called the
  top set, lifted as asked, "little in reserve: hold the load", every week in the default splits:
  the second pass's MEDIUM, through the role.
- MEDIUM: a top set the place cannot load as asked (dumbbells to 100 lb) ran every set at the
  heaviest weight there at a straight set's reserve, with the same words.
- LOW: a straight day after a session whose top set was skipped asked the top set's load; a top set
  skipped, then the lift swapped away and back or a set added after a top set alone, took the
  back-offs a step down as after a grind; a back-off's log taken back after a correction to the top
  set came back at the slip's load; a back-off logged clearly easy took the back-offs after it over
  the top set as lifted; the completion's "Next time" read the lift to push as a top set ("load up"
  where the plan holds); a lift picked up after its top set said "Straight sets today" over
  back-offs following it; a top set logged under the bar put the back-offs under it; the session's
  feedback said the drop would widen whenever one back-off fell short; a top set and back-offs with
  the same numbers folded into one row named "Top set".
- Fixed: each as the round's rules have it. A lift whose last session ran on the structure runs
  straight on any other day at its back-offs' load, the drop off the load its top set would carry
  (as asked, where the place cannot make it), reading the session its target is read from; a top set
  skipped is no top set lifted; a back-off's log taken back follows the top set as it stands; the
  back-offs are never over the top set as lifted, nor under the bar; the completion reads the lift
  to push on its own straight sets; a lift picked up keeps its top set's lines; the feedback says
  the drop widens only after back-offs a rep or more harder than asked on average; the set list
  folds only sets of one tier.

**The fourth pass** (on those fixes, and the build) found six: one HIGH, two MEDIUM, three LOW.

- HIGH: a lift that is the main lift one day and a secondary one another never progressed: its next
  main day read the straight day at the back-offs' load at the top set's reserve, and one step up
  from there was the top set it lifted last time, every week (the row at 160 lb for four weeks on
  the default split; the bench press at 195 on three days a week).
- MEDIUM: a max entered rebuilt a main lift through its own copy of the target, missing the third
  pass's two fixes; straight sets after a top set the place cannot load as asked kept the top set's
  pushed reps and its "Held at the heaviest weight here" line, so the back-offs' reps lifted at 95
  lb read as a miss.
- LOW: a back-off's log taken back put that one back but left the ones after it a step up, or
  dropped the step an earlier back-off's log still gave them; a saved copy with the top set's weight
  set by hand took the new drop on the entry and kept its back-offs at the old one; the feedback
  still said "a second session like it widens their drop" after the second.
- Fixed: a straight day at the back-offs' load is saved as one, and a lift's top set reads past such
  days as past its back-offs, back to its last session of its own; a straight day reads the top set
  through two such days running, past them the lift has left the structure (judgement: a style or a
  split changed) and its straight sessions are its own; a max entered reads the target as every plan
  does; straight sets after a capped top set take its asked reps and none of the place's line; a
  back-off's log taken back puts every back-off still to come where the top set as it stands puts
  them, each back-off still logged moving the ones after it as its log did; a saved copy's top set
  weight set by hand takes its back-offs to the drop in force, and a copy's straight sets are the
  lifter's own; the feedback says when the drop widens. The revert run's new tests found that two
  older tests passed a target read from no history; they ask the load itself now.

**The fifth pass** (on those fixes, and the build) found seven: one HIGH, three MEDIUM, three LOW.

- HIGH: a main lift straight several sessions running read the same old top set each time: the lift
  to push, set after two weeks on the structure, was asked 190 × 4-6 for five sessions over two weeks
  however it was lifted, and a top set the place cannot load (dumbbells to 100 lb) six. The cap of two
  such days was read only on a day the lift was secondary.
- MEDIUM: the lift to push's extra session and a lift swapped in after its place was begun ran
  straight at the back-offs' load unmarked, so the lift's next top set stepped from the back-offs'
  load (195 for 205 after a push ended); the coach's stalls counted the straight days at the
  back-offs' load, so a stall on the row came and went with the upper day and a route closed with
  nothing moved; a main day three weeks after its last top set, the lift trained on a straight day
  eight days before, read as back from a break and ran straight.
- LOW: the feedback graded a top set held where it was as "progressed" from the straight day before
  it; a straight day after a session whose top set was skipped, or after Hybrid turned Undulating
  (the heavy day reading the last top set through days at other ranges), asked the top set's load of
  every set at a straight set's reserve; the back-offs' load was rounded down, 205 giving 190 (7.3%,
  outside the tested 2-6%), where the research rounds to the equipment step.
- Fixed: a straight day reads the top set through two such days running at most, on a day the lift
  is main as on one it is secondary; the push's extra and a stand-in are saved as such days; a break
  is measured from the lift's newest session; whether the session a straight day's target reads ran
  on the structure, the target says, for any lift that has run on it; the back-offs' load is the
  nearest weight the place has, a half step up, never the top set's own while a drop is in force nor
  over it. What reads a lift's sessions over weeks reads its top sets alone: the coach's stalls, the
  feedback, and by the same rule, found beside them, the strategy's insights on the lift, the
  fatigue's drift in estimated maxes and the Progress trend, each of which read the upper day's
  lighter load as a fall. Tests that asked the load rounded down ask the nearest now.

**The sixth pass** (on those fixes, and the build) found six: one HIGH, one MEDIUM, four LOW.

- HIGH: the progression's own rules over sessions counted a straight day at the back-offs' load
  that fell between two top sets: the row's top set missed its floor every pull day, and each
  upper day lifted as asked broke the run of misses at one, so the micro-deload and the reset never
  came (165 lb asked four pull days running); for an advanced lifter, a grind and one clean top set
  stepped the load up, the upper day counted as the second clean session.
- MEDIUM: the coach's deload taken on a straight day at the back-offs' load kept the day's mark, so
  the next top set read past it and stepped up as if no deload was taken; so did a weight set by
  hand there.
- LOW: a correction of the top set after a back-off was logged took that back-off's step off the
  ones after it, and so did a delete of the top set's log; the completion's "Next time" put a
  straight day's back-offs' load to the pound (162 lb where the plan asks 160); a top set skipped,
  its back-offs done, made the next session read as back from a break; the coach's step on a
  straight day stepped from the top set's load and offered it on every set.
- Fixed: the top set reads past the lift's straight days at the back-offs' load wherever they fall,
  and so does the lift's own straight target (a micro-deload the top set's misses call for runs
  straight at the eased load), unless the newest run passes two; a break is measured from the
  lift's newest session, whatever the read passes over; a load set by hand or the coach's deload
  clears the day's mark; a correction or a delete of the top set's log replays each back-off still
  logged; the completion reads on the lift's own steps; a straight day steps from the back-offs'
  load off the last top set.

**The seventh pass** (on those fixes, and the build) found six: one HIGH, one MEDIUM, four LOW.

- HIGH: a lift that left the structure was never seen to have left when its own straight sessions
  at another range fell between its straight days at the back-offs' load: after Hybrid turned
  Undulating, every heavy day passed over the heavy day before and read the same old top set (195
  lb four times over five weeks); after a split went from four days to three, the row's upper day
  asked 165 six times running, then fell to 130 once the old top set was six weeks old. The sixth
  pass's newest run ended at the first session of the lift's own.
- MEDIUM: a max entered read the lift's own straight target off the whole history: the
  micro-deload the plan asked became the load missed twice, and a return after a break read the
  upper day's straight sets.
- LOW: a back-off corrected never moved the back-offs after it; a lift picked up again, swapped away
  and back or home and back, lost the step a logged back-off gave the ones after it; a break was
  measured past a straight day between two top sets, so a run of misses ended where there was no
  break; a session with the top set skipped and its back-offs done read as a fall in the fatigue's
  drift and the Progress trend.
- Fixed: the lift has left the structure once its sessions since its last top set pass two, its own
  sessions at another range among them; a max entered reads the lift's own straight target as every
  plan does; a back-off corrected replays the ones after it from the logs as corrected; a lift
  picked up again carries on its back-offs at the step each logged back-off gave them, read from its
  log as the top set's own is; a break is measured from every session of the lift; the fatigue's
  drift and the Progress trend read the top sets alone, never a session's back-offs.

**The eighth pass** found six: one HIGH, three MEDIUM, two LOW. Simulations of up to twelve weeks
over four schedules, deload weeks, catch-ups, second workouts and a style changed and back found
nothing else; no plan put a back-off over its top set.

- HIGH: a lift main once a week and trained twice more as a secondary lift left the structure after
  one tired main day (three sessions since its last top set), and from then on its top set stepped
  from its straight days at the back-offs' load: under Strength focus on five days the row's top
  set fell from 160 to 150 and held there for twelve weeks.
- MEDIUM: a deload week did the same to a lift trained twice in it with a secondary day before it
  (the known limit understated it), and the coach then reported a false stall; correcting a
  back-off, or taking its log back, put the back-offs still to come back at the top set's load, a
  weight set by hand thrown away (the correction a regression of the seventh pass); a max entered on
  a main lift with its reps set by hand read the whole history and built the lift straight.
- LOW: a refit read the day's fatigue off the history the top set reads, the lift's marked days
  taken out, where the plan reads the whole log; back-offs were replayed from the log as it stood
  before a correction, an undo or a delete.
- Fixed: a lift leaves the structure only past two of its main days run straight since its last top
  set, or after three sessions with none of its main days; its days as a secondary lift never take
  it out by themselves. A weight set by hand stays through corrections and logs taken back. A max
  with reps set by hand at the plan's range reads as the plan does, top set and all; at another
  range, its own straight target (as the fourth pass settled), read past the marked days. The day's
  fatigue is read off the whole log wherever the target reads past the marked days. Back-offs are
  replayed from the logs as corrected or left standing.

**The ninth pass** found five: four MEDIUM, one LOW. Simulations of ten to twelve weeks over six
styles and splits, with a realistic logger (top sets grinding or missing, back-offs off by a rep),
found nothing else; no plan put a back-off over its top set, or at it while a drop was in force.

- MEDIUM: with the top set's weight set by hand, a slip on the top set or a back-off, taken back
  (an undo, a delete, a correction), left the back-offs where the slip had put them (a regression of
  the eighth pass); with the back-offs' weight set by hand, a correction of the top set put them back
  at its drop; a max entered on a lift with its reps set by hand at another range read its last top
  set as a straight set ("little in reserve: hold the load"), the sets at the top set's load; the
  drop's correction read back-offs lifted at another load (a step lighter after a grinding top set,
  or a weight set by hand) as if lifted at the drop, and narrowed it to nothing.
- LOW: after a change to a style without the structure, a lift with secondary days between its main
  days held the old back-offs' load for five sessions over two and a half weeks, where the known
  limit says three.
- Fixed: the weight set by hand is recorded as the back-offs' own when the top set is done
  (`manual.backOffs`), else the top set's; the back-offs follow a top set's weight through every log
  taken back, and every replay of back-offs with their own weight starts from it, a correction of the
  top set included ("back-offs kept at 115 lb, the weight you set"). A max with reps set by hand at
  another range reads its straight day as every plan does, at the back-offs' load after a session on
  the structure. A saved session keeps the load the drop gave its back-offs off the top set as lifted
  (`backOffAt`), and the drop's correction reads only back-offs lifted at it. In a style without the
  structure every straight session counts toward leaving it, a lift's secondary days included; in
  one that runs it, only its main days do, so a tired main day still does not end it. Both new
  stored values are optional and dropped alone when unreadable.

**The tenth pass** found five: one MEDIUM, four LOW. Two store-driven simulations of six weeks,
four days a week, one changing styles twice, found nothing else.

- MEDIUM: a max entered on a lift with its reps set by hand at another range dropped the day's mark
  at the back-offs' load, so the next top set stepped from the back-offs' load (a regression of the
  ninth pass).
- LOW: a weight the back-offs took by hand, replayed after a log taken back, could go over the top
  set as lifted; the session's feedback promised a wider drop after back-offs lifted at the follow's
  step, which the drop's correction no longer reads (both regressions of the ninth pass); after that
  max, the first straight set kept the old top set's reserve (from before the pass); a lift picked
  up again back at the gym kept a weight its back-offs took by hand where it stopped.
- Fixed: the max reads the day's mark as every plan does; every replay of the back-offs is capped at
  the top set as lifted, or as planned once its log is taken back; the feedback reads only back-offs
  lifted at the drop's load, as the correction does; reps set by hand keep their reserve only in the
  same place on the lift, so a top set rebuilt straight takes the day's; a lift picked up again drops
  the back-offs' weight set by hand, as a swap back does.

**The eleventh pass** found eight, all LOW. Store-driven fuzzing of logs, skips, undo, deletes,
corrections, added sets, the coach's weight, home and back and swaps, and a store-driven simulation
of eight weeks in Hybrid, Strength focus and Lean-down, found nothing else.

- LOW: the code disagreed on what caps the back-offs with no top set lifted: a weight the back-offs
  took by hand, replayed after a log taken back with the top set skipped, fell to the skipped top
  set's plan (a regression of the tenth pass); a back-off's log taken back after the top set's own
  replayed the ones after it with no cap, over the top set; picked up again after a skipped top set,
  the back-offs lost the step a clearly easy back-off gave them. A top set logged again after its
  log was taken back dropped the steps the back-offs logged since gave, which a correction keeps; a
  set added after a grind kept the grind's load until a replay moved it; one clearly easy at a weight
  set by hand over the top set took the ones after it down to the top set's load, under words saying
  they go up; picked up again, a lift kept the mark of a weight set by hand, so its back-offs went
  unfitted to the plates left; a plate marked missing after the back-offs were lifted moved the
  saved session's drop load, so their miss went unread.
- Fixed: one rule caps the back-offs everywhere (`backOffCap`): the top set as lifted, one still to
  come as planned, none for a top set skipped. A cap never takes back-offs set by hand over it down
  after an easy one (`backOffStepped`), and the follow says when a step is held ("back-offs stay at
  145 lb, the weight you set"). A top set logged again replays the back-offs' logs as a correction
  does; a set added after a back-off takes the load its logs give it, as every replay does; a lift
  picked up again drops what was set by hand, as a swap back does (`withoutHandTargets`, one helper
  for both); the session records the drop's load as the top set is logged (`backOffAt` on the
  plan's entry), and the saved session keeps it.

**The twelfth pass** found ten: one MEDIUM, nine LOW, two of them regressions of the eleventh pass.
About 3,000 store-driven sequences of logs, skips, undo, deletes, corrections, the coach's weight or
deload, added and removed sets, effort, missing plates, rep ranges, home and back and swaps, and a
five-week store-driven simulation, found nothing else.

- MEDIUM: the coach's deload, taken after a skipped top set (the coach offers a weight while no set
  is lifted, a skip included), kept the structure on and recorded the load as nobody's, so an undo
  or a correction put the back-offs back at the drop off the top set's plan, and the saved session
  read as one at the drop for the drop's correction (from the first review's deload).
- LOW: a back-off lifted over the top set raised the cap for the ones after it, over the top set as
  lifted (a regression of the eleventh pass), while one lifted lighter under a weight set by hand
  took the ones after it down; a set added after a back-off came in at the drop's load and the top
  set's reps, beside back-offs at a weight or reps set by hand (a regression of the eleventh pass);
  a top set corrected to a skip capped the back-offs at its plan, where one skipped from the start
  caps none; the follow's words named the load before the replay of the back-offs logged; the
  saved session's drop load was worked out again on a correction of the top set's reps after a plate
  was marked missing, and lost on an Undo of a change made before the main lift; the plan's stored
  drop load had no schema line; a weight set by hand on the top set kept its back-offs out of the
  refit for a missing plate; a lift picked up again kept a stale load asked on its back-offs; and the
  refit fitted the back-offs as any set, lighter with reps added, while every replay took the drop
  onto the weights left, so the two disagreed, and a step held at a top set the place could no
  longer make asked for a load it could not make.
- Fixed: a deload after a skipped top set runs straight, as one before it does. Only a weight set
  by hand raises what caps the back-offs (`backOffStepped`'s `own`), through every step and replay;
  a back-off lifted over the cap by itself raises nothing. A set added keeps what the back-offs took
  by hand, their weight and their reps (`asBackOffs`' `hand`). A top set corrected to a skip caps as
  one skipped from the start (`backOffCap`). The follow names where the back-offs stand after the
  replay, and says a weight set by hand is kept only where they stand at it. A correction that keeps
  the top set's weight keeps the drop's load recorded, and so does an Undo of an earlier change;
  `backOffAt` has its schema line, dropped alone when unreadable. The back-offs take one rule
  wherever their load is worked out, the refit for the place's weights included: the drop off the
  top set as lifted, to the nearest weight the place has, at their own reps, never a stand-in's
  (item 11; the fifth review's nearest weight; the owner's "same reps"); a top set's weight set by
  hand stays as it is while its back-offs fit; a lift picked up again keeps no load asked on them;
  and a step held at the top set, or at its cap, lands on a weight the place has.

**The thirteenth pass** found eight: one MEDIUM, seven LOW, four of them regressions of the twelfth
pass and two gaps in rules it set. About 2,300 store-driven sequences of logs, corrections, skips,
undo, deletes, missing plates, added and removed sets, rep ranges, the coach's weight and deload,
effort and Undo of a change found nothing else in the round's reach.

- MEDIUM: reps set by hand were thrown away on back-offs standing in for a load: a rep range set
  after the top set, or before it and the top set then lifted at another load, gave the back-offs
  the plan's reps, the lift marked with reps set by hand (a regression of the twelfth pass).
- LOW: the follow called a clearly easy back-off's step up "a step down after a hard back-off" under
  a top set corrected heavier, a weight set by hand too; a refit gave every back-off still to come
  the load after the last back-off logged, where each moves only the ones after it (both
  regressions of the twelfth pass); back-offs fitted before the top set as stand-ins for its own load
  came back at it, two reps under its range, once the plates were back (older, made worse by the
  twelfth pass); a set added, and back-offs picked up again, took the reps a top set standing in
  added, and a deload after a skipped top set never reached the top set once the skip was taken back
  (gaps in the twelfth pass's rules); an Undo of a change put back back-offs worked out for an older
  state of the top set's log, over the top set as lifted; and a top set standing in for its load,
  lifted as shown, took no follow, so its back-offs stayed at its own load as lifted (both older).
- Fixed at the shared rule: a top set still to come gives its back-offs the drop off the load it
  asks, the one it stands in for where the weights here make less, never the stand-in's
  (`topSetLoad`); once lifted, the drop off it as lifted, each back-off logged moving the ones after
  it in turn (`owedBackOffLoads`), wherever their load is worked out: a refit, the follow, a replay, a
  set added, a lift picked up again, a saved copy, and an Undo, which takes back a change and never
  a log made since (`backOffsAsLogged`). A lift fitted in place fits its back-offs so, never as
  stand-ins. They take the top set's own reps, and reps set by hand are the lifter's (`ownRepsOf`).
  The follow runs for a top set lifted at another load than it asks, and names the back-offs' step
  by its own direction. A deload after a skipped top set reaches the skipped sets, so a skip taken
  back brings its set back at the deload, straight. Beside them: "fewer reps over more sets" after a
  lone top set adds a back-off at the drop, made as the sets trigger makes one, where it copied the
  top set's load and reserve.
- Not taken (rare orders, from the review's notes): see the known limits.

**The fourteenth pass** found six, all LOW: three regressions of the thirteenth pass and three
older. About 2,200 store-driven sequences, ramps, swaps away and back, trips home and back,
check-ins, lengths, "fewer reps over more sets" and Undo among them, and six-week simulations in
Hybrid, Strength focus and Lean-down found nothing else in the round's reach.

- LOW: a refit (the plates saved again, a rep range set) put the back-offs still to come back at the
  drop once the top set's log was taken back, the step a logged back-off gave the ones after it gone;
  the follow named the step of a back-off logged after the one in front, its own log taken back
  ("a step down after a hard back-off" over a step up); and a lift keeping a hard start's ease, under
  way before its top set, left its record at weights the place cannot make, so a copy saved after
  gave them back (all three regressions of the thirteenth pass). A top set standing in for its load,
  lifted at the load it stood in for, was read by a refit, a set added and a lift picked up again
  against the reps the stand-in added, so its back-offs went a step down where the workout had kept
  them; back-offs picked up again after reps set by hand on them took the reps a top set standing
  in added; and an Undo put a back-off whose skip was taken back since at the load it had while
  skipped (all older).
- Fixed: a top set still to come gives its back-offs the drop off the load it asks with each
  back-off still logged moving the ones after it, in the refit too, as every replay does. The follow
  names the step that put the back-off in front where it stands. A lift's record of its plan before
  a hard start's ease is fitted to the weights here as the lift is, on top set plus back-offs too.
  A top set's log is read as the workout reads it wherever the back-offs' load is worked out
  (`outcomeFor`: lifted at the load it stood in for, against the range asked). A lift picked up
  again drops the reps set by hand, so its back-offs take the top set's reps as the plan has them,
  never a stand-in's. An Undo puts every lift's back-offs where its logs as they stand put them,
  those of a lift with no log left too.
- The revert run caught all 24 new and affected entries (N278 re-anchored onto the Undo's replay of
  every lift on the structure).

**The fifteenth pass** found six: one MEDIUM, a gap in the fifth review's mark, and five LOW, one a
regression of the fourteenth pass and four older.

- MEDIUM: a main lift picked up again before its top set (swapped away and back, or home and back)
  on a day that now runs it straight (fatigue high after a check-in under way) came back straight
  at the back-offs' load, as the plan builds such a day, but unmarked, its drop kept: the session
  was saved as a straight session of the lift's own, so its next top set stepped from the back-offs'
  load (180 where the top set at 185 asks 190).
- LOW: an Undo of a change to another lift moved a hard start's eased back-offs (a regression of the
  fourteenth pass, whose Undo replays every lift on the structure): the ease put them set by set at
  140 under the eased top set's 150, where the drop off it, every replay's, puts them at 145, so a
  refit after the eased top set was lifted moved them too (older). A held step's reps (pushed where
  the place cannot make the load's step) stayed on the back-offs through a change of rack: the top
  set fitted again to 140 × 4-6 left them at 6-8. A top set logged again as it was, after its log
  was taken back, left its back-offs where the replay without it put them, the step a back-off
  logged since gave from reading it gone, and so did a back-off logged again before a later one whose
  step read it. A top set standing in, logged with no weight, gave its back-offs the drop off the
  stand-in's load (125 for 135), where every replay reads it at the load it asks. A step down on a
  rack whose smallest plates are 25 lb was held at one step, 50 lb on a 45 lb bar, a load no plate on
  it makes (all older).
- Fixed: a lift picked up again before its top set, straight at the back-offs' load where the day
  runs it so, is saved as such a day, as a swap saves it. A hard start eases a lift's back-offs off its top set as eased, each a rep more in reserve. A refit
  under a top set still to come gives its back-offs the top set's own reps. A top set logged again
  under back-offs logged since follows with their logs, a step of its own or none; a back-off logged
  before one logged since puts the ones after it where the logs now leave them, as a correction
  does. The follow reads a top set logged with no weight at the load it asks. A step's floor is the
  least load it lands on (`stepFloor`): the bar, and one step only where the place's weights are
  unknown, for a back-off's step, the back-offs' step off the top set and a straight set's alike (the
  last older than the round, under the same rule).
- The revert run caught all 38 new and affected entries: 15 new, 5 re-anchored onto the pass's code
  (N86, N119, N139, N263, N270) and 18 beside it. Two drafted entries went with the code they covered
  (the lift's drop on a straight day picked up again, which no reading of a straight day reads), and
  three needed a test of their own: a lift picked up after its top set marked no such day, a
  back-off's own follow said in its words, and back-offs a session stored as stand-ins given their
  reps back in a refit (N263, which the thirteenth pass had left with nothing to catch it).

**The sixteenth pass** found four: one MEDIUM, a regression of the fifteenth pass, and three LOW,
one a gap in its new ease of the back-offs and two older that its changes reach. About 13,000
store-driven sequences on racks with big steps, high fatigue before and during the workout, hard
starts and home dumbbells, under Hybrid, Strength focus and Lean-down, found nothing else.

- MEDIUM: a lift picked up again after the coach's deload, two sets of it lifted at 170, came back
  straight at the back-offs' load and was saved as such a day (the fifteenth pass's mark), so its
  next top set read past the deload and stepped up: 190 where the same deload without the pick-up
  gives 175 (the sixth review's rule, "a load set by hand or the coach's deload clears the day's
  mark").
- LOW: a hard start eased each back-off by a rep and then dropped it off the eased top set as well,
  90 × 3-5 under a top set at 4-6 (the fifteenth pass's ease, older at root); a lift begun straight
  on a day of high fatigue, its ramp alone done, came back straight once the day planned its top set
  again (the pick-up's gate read a drop a straight day has none of); and a set logged with no weight
  was read with none by the follow and at the load it asks by every replay, so a refit, a pick-up or
  a set added moved what the follow had left, a back-off took the back-offs after it off the top
  set's reps, and no drop's load was recorded (older).
- Fixed: a pick-up never marks a day the lifter made their own, a load set by hand or the coach's
  deload lifted before it stopped. A lift picked up again with no working set done is the day's as
  it plans it now, on top set plus back-offs where the day leaves it them, its drop with it. A hard
  start's back-offs are the plan's own, eased once: the drop off the top set as eased, at its reps,
  a rep more in reserve. On top set plus back-offs a set logged with no weight is read as lifted at
  the load it asks, by the follow and a refit's replay too, and the drop's load is recorded off it.
- The revert run caught all 24 new and affected entries: 13 new, 8 re-anchored onto the pass's code
  (N85, N86, N242, N294, N296, N297, N299, N310) and 3 beside it. Three needed a test of their own:
  a lift that regained its top set by a pick-up has its drop back, so a grind on the top set takes
  its back-offs a step down (N315, N316), and a top set standing in, logged with no weight, reads as
  clearing the top of the range it asks when the back-off after it follows (N320). The run also
  found a refit's replay reading a back-off logged with no weight with none, which took back the
  step its follow gave (fixed above; N323).

**The fresh review before shipping** (2026-10-30): one fresh, independent adversarial review of the
round as it stands with Round M and Maintenance 33 (see Maintenance 31's report). It found two, each
shown by failing tests, both fixed with tests and revert entries:

- MEDIUM: a lift picked up again after its top set, home and back or swapped away and back, gave
  its back-offs the top set's reps and reserve as they stood, so what changed the top set alone
  reached them. A head cold told with the lift under way holds the top set at 2 in reserve, a rep
  fewer, and the back-offs came back at 3-5 at 3, kept so after the illness went; "Make it easier"
  after the top set brought them back at 2 where the day asks 3; "easier" before the top set and
  "harder" after it, at 3 on a plain day. The back-offs now take the plan's own top set's reps (the
  floor's copy, where one holds it) at the day's back-off reserve, in the generator's pick-up and in
  a swap back alike: 2 on a plain day, 3 easier, 1 harder, as delivered.
- LOW: a drop its correction narrowed to 0% still read "0% lighter" in Why this target, and each
  back-off's effort line "lighter than the top set". Why this target now says the back-offs are at
  the top set's load there, and the effort line says "after the top set".
- The revert entries: N324 to N329, all caught; N103, N104, N275 and N293 are re-anchored. N330 and
  N331 carry Maintenance 26's BB1 and BB3, whose lines this round moved into `withoutHandTargets`.

## Known limits

- **Five days running, the old fatigue score reads Fridays high.** Before Maintenance 33 it scores
  days in a row and reads a lift planned lighter later in a session (a shoulder press after three
  pressing lifts) as a falling estimated max, so a main day at the end of five days can run straight
  for weeks and the lift leave the structure. Maintenance 33's fatigue model scores no days in a row
  and reads each estimated max against what its sets asked; this round's test of the rule is spaced
  so the old score does not decide it.

- **No trial compares the two structures directly.** Every close comparison found no difference in
  strength or size between them, so the structure is a way of organising the main lift's sets, not a
  gain (the research).
- **A rating errs by about a rep.** The drop moves only after two sessions running at it miss the
  same way.
- **A top set the place cannot load as asked** (a plate missing today, the heaviest weight there)
  puts the lift on straight sets that day; after a session on the structure, at the back-offs' load
  the top set as asked gives.
- **A lift that leaves the structure** (a style or a split changed) reads its last top set through
  two sessions run straight in a style without the structure, its secondary days included; after a
  split that leaves it no main day, through two sessions with none; while the style runs the
  structure, through two of its main days run straight: its first three such sessions after the
  change hold the back-offs' load, and the next reads its own straight sessions. The same holds for a lift main three or more times in one deload week: after it, it
  reads its last deload session as its own, as a lift on straight sets always has (the records do
  not say which sessions a deload week held).
- **The back-offs at the nearest weight** can land at last session's top set load where a step is
  about 5% of it (100 lb dumbbells): 5% under a 105 top set is 99.75, 100. A rack whose smallest plates
  make big steps can put them well under 5%: 95 under a top set at 135 on 45 and 25 lb plates, the
  nearest weight it has below the top set.
- **Rare orders.** A top set skipped after a back-off was logged moves nothing until the next replay
  of the back-offs; a set added after every back-off is done, the top set's log taken back, copies
  the last back-off's target; back-offs logged before the top set are replayed by a refit in the
  order of their sets, not as the workout took them; a set added under a top set still to come
  copies the target of the set before it as shown; a lift picked up again more than once is saved
  with the sets each pick-up gave it under one mark; a back-off's log taken back after a pick-up
  comes back with the reps it had.
- **Seen in the review, from before the round.** An Undo of a change of plates keeps the plates
  missing under the plan put back, for every lift; a set's log taken back gives back the reserve
  and the stand-in it had; "Harder" leaves a lift under way as it is, where a pick-up after it takes
  the day's reserve; a top set's log deleted after a change of plates can give back a target the
  place cannot make.
- **A lift picked up again after its top set** reads the step its back-offs took from the numbers
  logged, each logged back-off's own too; where the reserve check (item 43) reads such a set's
  reserve otherwise, the step can differ by one from the one the workout gave.

## Questions answered by a default

- **The lift to push** keeps item 44's own sets, straight, with its own target: the push already
  shapes every set of it. Say if it should take a top set and back-offs too.

## The complete revert run

Run with Round M and Maintenance 33, every table of Maintenance 23 to 33 together (the table and its
account are in Maintenance 31's report). This round's 322 entries are all caught. Four needed work:
N225 had drifted (Maintenance 33 moved the eased record's schema above the entry's, so its first
match was the record's line) and is re-anchored onto its own; N132 is caught by
`backOffs.heldStraight.test.ts`, now in its list; N133 and N156 passed because later reviews gave
their tests' case another path, and each has a test of the case that still reaches it: a straight
day of the lifter's own after a session on the structure, and a max that takes the top set past
the dumbbells there.

Retired in the reviews: N145 (the twelfth review: the step held at a weight the place has never
goes under the bar, so its clamp was removed); N280 (the thirteenth: a skipped top set's log has no
weight and no reading, so read as a set lifted it moves nothing; the rule stays written, and a test
of a back-off's log taken back under a skipped top set stands beside it).

## Verification

Run with Round M and Maintenance 33, on the three rounds' final code (`4da3258`): see Maintenance 31's
report, Verification.

## Review on the phone

At the owner's word (2026-10-11), no review gate pauses the agreed work. This round's checks are in
the one consolidated phone review given once every agreed item is live.
