# Maintenance 33: the recovery and readiness core

Built on 2026-10-23 and 2026-10-24 on the owner's word to build the whole agreed queue, round by
round, to live, without pausing at review gates, which stay YELLOW. It is part 4 of the approved
proposal (`docs/proposals/week-model-readiness-time.md`) with the owner's decisions 1, 2 and 5, and
rests on `docs/research/recovery-time-course.md` and `docs/research/readiness-and-soreness.md`.
Every number is in the sourced rules table (`src/engine/rules/ruleTable.ts`), each marked research
or judgement with its source.

## Recovery judged per muscle

Fatigue stays in the trained muscles (Behm 2021), and consecutive days are no problem in themselves,
so each muscle gets a window from its last hard work (`src/engine/recovery/recovery.ts`):

| Hardest sets for the muscle           | Upper body | Lower-body compound |
| ------------------------------------- | ---------- | ------------------- |
| 3 or more reps in reserve             | 24 h       | 24 h                |
| 1 to 2 in reserve                     | 36 h       | 48 h                |
| To failure, or a long set a rep short | 48 h       | 72 h                |

- **Lengthened by** six or more hard sets for the muscle (24 h more, up to 72 h upper and 96 h
  lower), a lift new to the lifter or back after six months (24 h), and long-length work such as
  Romanian deadlifts (12 h). A synergist's sets count half.
- **The whole-body layer:** a short night on today's check-in, or three or more hard days running
  with today's energy low, lengthens every window by 12 h.
- **Learned within bounds:** after five sessions back early and five rested, a muscle whose early
  first sets hold within 2% of its rested ones recovers half a day sooner, and one 5% or more under
  them half a day later; never under 12 h nor past 96 h, nor under half or over half again its
  estimate (one already past 96 h is never lengthened). Each first set is read against what it
  asked (below, "Every set against what it asked"). Days ill or after a short night are left out.
  The learned page shows each muscle its sessions moved, with a reset.
- **Soreness never moves a window** (Nosaka 2002): it tracks lost strength poorly.

The windows are read where recovery is said: the Plan screen's balance (recovering with the hours
left, ready, fresh), the completion screen (each muscle's own window from that session), the hard
start's reading (a muscle inside its window lowers what its first set is expected to do by a step),
the "too soon" card and the schedule card, each with the same day's context (today's check-in and
what the lifter reset). The history is read once for each log: the learned windows and the rested
sessions' first sets are kept with it (about 1.3 s to 40 ms on 400 sessions, and nothing at all
while the log is the same).

## "Too soon" (decision 2)

- It fires only for hard planned work well inside a muscle's window (under three quarters of it):
  a set planned to failure, or three or more working sets at two in reserve or closer, by lifts that
  work it directly. Light work is never flagged.
- Or when the first set confirms it: a lift's first working set 8% or more under its rested
  sessions (the median against its last three to five rested first sets, each read against what it
  asked), 10.5% after a check-in that lowers the day, while the muscle is inside its window. The
  card says the hours when that set was lifted.
- A warning with a one-tap lighter option: a set fewer and a rep more in reserve on that muscle's
  lifts still to come, at the same loads, a rep fewer (proposal part 2: "keep the load and add a rep
  in reserve or drop a set"; Robinson 2024); never a block, never eased by itself. A hard start's
  ease is as approved (item 42).
- None on a fever's rest day: there is no workout to lighten.
- "Not now" skips that muscle until the week ends (decision 5); new coaching cards come at most one
  a day and three a week, kept on the device.

## Readiness (decision 1)

- Today's check-in is read against the lifter's own four weeks (five or more check-ins), else the
  scale's middle: two items clearly worse, or two short nights running, lower what the day's first
  sets are expected to do, never the plan. Soreness alone never counts. "Feeling good" is said only
  when every answer is at the middle or better.
- **Illness:** above the neck, every set keeps two or more reps in reserve, no top set to failure and
  no drop set (the coach offers none); fever or aches all over, a rest day: Today hides Start, and a
  workout under way offers "Finish here", keeping at least the head cold's floor on what is left.
- **The reserve check** (item 43) keeps its approved day rule: none after a low or sore check-in as
  item 43 read one (energy, sleep or motivation at 2 or under, soreness at 4 or over), nor on a day
  the check-in lowers, nor with any illness.
- **The pain gate,** exercise by exercise: "Hurts, protect it" stops the exercise for pain-free work
  (item 45), and the sheet says the gate beside it: "Sharp, sudden or rising pain: stop and protect
  it. Known pain at 5 out of 10 or less that settles by the next morning is fine to train with."
  (Thomeé 1997; Silbernagel 2007).

## Fatigue

The fatigue score keeps no day counts and no check-ins: hard ratings, sets closer to failure than
planned, long rests and falling performance, read session to session with every set against what
it asked.

## Every set against what it asked

Every reading that sets a lift's session against another's to see a fall reads each set against
what it asked (`src/engine/recovery/againstAsked.ts`): the fatigue's drift, a first set against
the rested sessions, and what a muscle's sessions teach of its window.

- **The same ask:** the sets are set against each other as lifted, so fewer reps are a fall.
- **An ask the plan changed** (a load step, a deload, a lift later in a session, a day at the
  back-offs' load, a day's reserve): each set is read against its own, reps anywhere in its range
  at its load being as asked, as the progression reads them. The plan's own change, lifted as
  asked, is never a fall; a set short of its range, with less reserve than asked, or lighter, is.
- **No target saved:** read as lifted, and set only against another such.

So the plan's load step after the reps climbed its range is no fall in the fatigue score, nor a
deload's first set lifted as asked in "too soon", nor a later lift planned lighter (the eighth review
of round N). Their words say so: "Lifts fell 7.5% against what their sets asked over the last two
sessions", in the fatigue's evidence and the deload advice alike.

## The schedule card on the same check

The card that moves the schedule to the days the lifter trains (item 46) reads the moved week with
the "too soon" check: the plan built for those days, each lifted at its targets' reserve, and says
under the card, at every experience level, the days whose plan would work a muscle hard again when
it may not have recovered, and that the coach offers a lighter option those days. It never refuses
the move.

## Questions for the owner

- **Reordering the split across the days.** The approved proposal asks the schedule card to reorder
  the split across the lifter's days before suggesting a moved day, and also keeps the split
  rotation unchanged; on the default four-day split no reordering avoids an overlap (two upper days
  share the arms). The card says the days; reordering waits for the owner's word.

## How it is kept

- Every new stored field is optional with a catch: the session's lighter muscles, the shown cards
  in the meta store, the recovery reset.
- Synthetic data only in every test.

## Review

The round was reviewed adversarially, each finding shown first by a failing test, fixed, and its
revert added to the table.

**The first pass** (on the build) found thirteen: one HIGH, eight MEDIUM, four LOW.

- HIGH: a fever told under way after a head cold read as taking the head cold back: every set still
  to come went back to the plan's reserve and the drop set came back ("Planned effort back").
- MEDIUM: the coach offered a drop set on a head-cold day, and the tap failed; on a fever's rest day
  the "too soon" card still offered to lighten the workout, spending the day's one new card; in a
  deload week a first set lifted as asked read 11% under the rested sessions; the Plan screen's
  recovery balance forgot a reset of the learned windows; the hard start's window step forgot
  today's check-in; the schedule card's recovery line was cut from the card for intermediate and
  advanced lifters; "Lighter keeps the loads", said the card, while the tap took them down; the
  plan's own load step after the reps climbed its range, lifted as asked, read 10% down in the
  fatigue score.
- LOW: an undo after "Lighter" on a lift under way put its back-offs back at their un-eased load; a
  lift begun and undone while "Lighter" was in force kept a mark that shut it out of "Lighter" for
  its own muscle and of a hard start; the learned page listed a "too soon" Not now as an unnamed
  offer, back a week after the tap, for good; the reserve check came back after a "Wrecked" or a
  single "Exhausted" check-in.
- Fixed at the shared model: every set is read against what it asked wherever sessions are set
  against each other (above), and every reader of today's windows reads the same day's context. Any
  illness keeps a workout under way at the head cold's floor at least; the coach offers no drop set
  and no "too soon" card where the day forbids them; the schedule card's line is under the card;
  "Lighter" keeps every load, so an undo leaves its back-offs as they were; a mark with nothing to
  keep goes while "Lighter" is in force, as without it; the learned page names the offer, says it is
  back with the new week, and lists it only until then; item 43's day rule is back. From the
  review's notes: the card raised by a first set says the hours when it was lifted, and the pain
  gate is said beside "Hurts, protect it".

**The second pass** found twelve: one HIGH, five MEDIUM, six LOW. Eleven were in the build before
the first pass's fixes; one part of one came with them.

- HIGH: an illness told under way left the lift in progress at its own reserve, a finisher to
  failure, beside "every set 2 or more short of failure for the head cold".
- MEDIUM: a check-in told after a hard start re-judged it, and the next set took the ease away just
  after the words said it stays (the windows' part came with the first pass's day context); a load
  step after reps past the top of the range, lifted as asked, read as a fall; the completion read
  the windows without the session's check-in; a fever's rest day still offered sets to add; the
  day's reserve check landed on a lift "Lighter" had eased.
- LOW: "Lighter" was lost when the preview was made again, and after a swap and a swap back under
  way; "too soon" read today's first set as logged against rested sessions read through the reserve
  check's estimate; a reserve check taken to failure set its muscle's window as a set short of it;
  the Plan screen read yesterday's check-in while yesterday's finished workout was still on screen;
  the long-length lifts missed the dumbbell Romanian deadlift and the cable overhead extension.
- Fixed: any illness holds every set still to come at its floor, a lift under way's too, at its
  load, as "Lighter" eases one. A set past what it asked reads as asked, no more. A check-in told
  with a hard start in force leaves the start's reading as it was (`checkInAfterStart`, optional
  with a catch). One day context (`dayRecovery`) for every reader of the windows, the completion
  with its session's check-in, and a check-in is the day's its session was made on. A rest day adds
  no work. The reserve check never lands on a lift the plan eases. "Lighter" is a choice of the day
  through a preview made again and comes back eased on a lift swapped back. Today's sets are read as
  the rules read the log (`readLoggedReserve`; the estimate kept beside the read log). A reserve
  check taken to failure reads as a set to failure. The long-length lifts include every implement
  of the lifts the research names. The schedule card's line names Monday too in its test week: the
  dumbbell Romanian deadlift now lengthens the hamstrings' and glutes' windows.

**The third pass** found ten: two MEDIUM, eight LOW. Five came with the second pass's fixes (the
illness's floor, the swap back's record, the rest day's filter, the mark of a check-in told under
a hard start, and the day's context past midnight); the rest were in the build, unfiled.

- MEDIUM: an illness taken back left the lift under way at the illness's floor, its top set never
  lifted at the illness's reserve, under "Planned effort back"; a workout saved after "Lighter", a
  swap and a swap back kept the bench press with its top set alone, "Lighter today" among its
  reasons, where the same steps without "Lighter" kept its back-offs.
- LOW: on a fever's rest day the coach still offered changes to today's workout (a load step, a
  workout fitted shorter); with a hard start in force, "Lighter" was lost on a swap back; with
  "Lighter" in force, a first set three reps short of what it asked read as two, so the hard start
  was missed; the mark of a check-in told under a hard start outlived the hard start; the
  reserve-check estimate kept beside the read log went stale when the app, left open, read the log
  again at a new day; a workout that ran past midnight had one window on the completion screen and
  another on Plan, and the coach's "too soon" and the hard start read the evening's check-in as
  today's; the learned page's recovery read the log as logged, not as the rules read it; the
  long-length lifts missed the cable fly.
- Fixed: the day's floor lies over the plan as a layer, as the hard start's ease does: each set it
  holds keeps what it was (`floored`, optional with a catch), every change is made under it and the
  floor laid again after, so an illness taken back gives a lift under way its sets back, a drop set
  too, and a set logged under it keeps its record. The record "Lighter" keeps for a lift under way
  stops with it and comes back with it (`stopped.record`, optional with a catch, one this copy
  cannot read dropped alone); with none kept, the lift swapped back records what it owes as the plan
  has it, as many sets as the stand-in's record had still to come. A rest day offers nothing that
  changes today's workout. A swap back keeps "Lighter" with a hard start in force. The hard start
  reads a set eased at its load against the plan's ask. The mark goes with the hard start. The read
  log and its estimate are read again together, and the hard start reads the estimate kept. Every
  reader of the windows reads the check-in of the session's day (`madeAt`): the completion, Plan,
  the coach's "too soon" and the hard start. The learned page reads the log as the rules do. The
  cable fly is long-length work; the band fly and the pec deck are not, by judgement (a band's pull
  falls toward the stretch, and a pec deck's cam sets how much of its load reaches it).
- Not taken: "too soon" ignores the day's planned reserve check (a set taken to failure), since
  reading it would change the check's approved day rule.

**The fourth pass** found seven: two MEDIUM, five LOW. Three came with the third pass's fixes (the
rest day's filter, the floor's record in a saved copy, the day's context past midnight); the rest
were in the build, unfiled.

- MEDIUM: a fever told under way no longer offered "Finish here", nor "End and save it", the rest
  day's filter holding back the way out of the workout with the changes to it; and the illness's gate
  was lost when the day moved to another plan: a saved workout loaded, a workout discarded or the
  completion closed gave a plan with no check-in, Start back on a fever's rest day and a head cold's
  floor gone.
- LOW: a copy saved under a head cold kept the floor's record, so a change to another lift gave the
  first its plan back; a check-in told past midnight on a workout made the evening before was read by
  no reader of the day; "Lighter" taken before the top set came back twice after a swap back, and
  was lost on a lift picked up again at a place; a check-in told again under a head cold said "the
  planned effort back" for a plan that kept its floor.
- Fixed: a rest day drops what changes today's workout, never the way out of it. Every plan of the
  day keeps the day's check-in, as told on it, at the time it was told (`withDayCheckIn`): a saved
  workout loaded, a workout discarded, the completion closed, a workout landing from another device;
  one told another day is none of today's. A check-in is the day's it was told (`checkInAt`,
  optional with a catch, and `checkInDayOf` for every reader). A saved copy is the plan under the
  floor as under the ease. A swap back works out what the lift owes from the plan's own top set where
  the ease changed the one it shows, and eases it once; a lift picked up again at a place under
  "Lighter" comes back eased as it went, with the record of the plan its stop kept. The check-in's
  words read the plan with the day's floor laid again.
- The revert run caught 32 of the 33 new and affected entries, once tests through the store, the
  coach and the Plan screen caught the readers of the check-in's time (Z41 to Z44); Z32 is retired
  as equivalent (below), its call removed.

**The fifth pass** found eight: two MEDIUM and six LOW. Three are regressions of the fourth pass (the
check-in carried to a second workout, "Lighter" picked up at a place, the words on a loaded copy);
the rest were in the build. About 100,000 random store actions over 2,040 seeded sequences (every
kind of check-in, sets logged, short and undone, Undo, discards, finishing and closing, saves and
loads, swaps, "Lighter", places, workouts from another device, midnight) found the floor held
everywhere but the first finding's class, and the check-in on every later plan of the day.

- MEDIUM: a set taken back ("Undo last set", or Delete in its correction) after a head cold was told
  came back to do below the floor, the top set at 1 in reserve, a drop set at 0, until some later
  change laid the floor again (since the second pass's floor on a lift under way); and a check-in told
  once was saved with every workout of its day, so the lifter's own baseline counted it once for each
  (four told read as five: "Checked in: energy, sleep and motivation under your usual" for answers at
  the scale's middle, "Feeling good: full workout kept" against it), and one low check-in on a day of
  two workouts counted two of the last three for the deload's signs (the fourth pass).
- LOW: "Lighter" taken before the top set came back eased twice after a trip home and back, the
  back-offs 180 × 2-4 at 4 for 3-5 at 3 (the fourth pass's pick-up); a saved workout loaded on a day
  checked in was changed by the check-in under 'Loaded "Mine".' alone (the fourth pass); a copy saved
  after "Lighter" and then a swap or a place was a set short; "Lighter" taken after a swap or a place
  took no set off what stood in, a set more for the chest than the other order, and the lift back at
  the gym owed it too; a copy saved on a head-cold day before the start kept the head cold for good;
  and "Lighter" was lost when a workout from another device, a discard or a copy loaded made the plan
  again (all older).
- Fixed: a log taken back outside the engine lays the day's floor again (`floorLaidAgain`). A record
  keeps when its check-in was told (`checkInAt`, optional with a catch), and the readers of check-ins
  as told count one check-in once (`oncePerCheckIn`): the baseline and the deload's low check-ins.
  "Lighter" laid on a lift picked up again gives its back-offs the reps and reserve of the plan's own
  top set, as a swap back does, and takes its set where no ease took one before the stop, as on a
  lift under way. A check-in carried onto a loaded copy says what it changed. "Lighter" takes a set
  off a stand-in, its floor the slot's, unless an ease took one from the lift it took over; a copy
  gives what stood in for a lift "Lighter" eased under way the sets the ease took, as the lift's
  record of the plan holds them (marked the lighter option's: a hard start's copy keeps what its
  ease left, item 42's known limit). A copy saved before the start on a day an illness holds is the plan the check-in makes
  without the illness. "Lighter" holds on every plan of the day, as the check-in does.
- The revert run caught all 25 new and affected entries: 22 new (Z45 to Z66) and 3 beside them
  (V12, Z29 re-anchored, Z36), once a test of "Lighter" on the incline press, four sets over its
  floor, stopped at a bare place and picked up again (Z54), and one of a hard start with a lift
  under way before it swapped (Z59) were added. The pass first gave the copy its sets by topping up
  the stand-in's own record; that record is the plan under today's ease, which every change is made
  on, so the swap back owed the set "Lighter" took for good, and the copy now gives the slot its
  sets back itself (Z56, Z57, Z66).

## Known limits

- **The windows are estimates.** People differ widely (Damas 2016: the same session left some at
  82% strength and others at 42%); the learned shift moves them only within bounds.
- **The days ahead have no check-in.** The schedule card's check reads the planned days without the
  whole-body layer, at each planned day's time today.
- **A drop set is not read as hard work,** planned or logged: a muscle's window and "too soon" read
  its working sets.
- **Reps within the range at a changed ask are as asked.** Where the plan changed what it asked, a
  session that did fewer reps than the one before, yet stayed in its range, reads no fall; at the
  same ask it does.
- **The pain gate has no scale.** The app asks no pain score; the known-pain line is said, never
  checked.
- **A sore joint told once counts for each workout of its day** in the Progress screen's pain areas:
  they count the sessions trained with it, as they count a pain reported in each.
- **A hard start's copy keeps what its ease left** where a lift under it was swapped or moved
  (item 42's known limit); "Lighter"'s gives the plan back.

## The complete revert run

REVERTS

Retired in the reviews: V4 and W6 (the third review: the rest day's early return said what the
rest-day filter says, and the filter is Z11's and Z12's now); Z32 (the fourth: the hard start's words
read with the day's floor laid again are the words read without it in every reachable case, a hard
start taken naming only what it eased and one taken back the eased lifts it gives back, so the call
went).

## Verification

VERIFY

## Review on the phone

At the owner's word (2026-10-11), no review gate pauses the agreed work. This round's checks are in
the one consolidated phone review given once every agreed item is live.
