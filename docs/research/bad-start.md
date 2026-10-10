# A bad start carries over to the rest of the workout (the owner's item 42)

Approved on 2026-10-09 for Maintenance 26 (round H), with the owner's condition: "validate when poor
early-workout performance is strong enough to adjust the rest of the session, without overreacting
to normal variation." The proposal said: if the first two lifts both fall well short at the planned
effort, the lifts still to come get the low check-in's treatment (a set fewer, a rep more in
reserve), with a line saying why.

## What the app does today

- In-session autoregulation (Maintenance 2, `autoregulate.ts`) moves the remaining sets of the lift
  just logged: down a load step after a grind under the floor (nothing in reserve) or a set three or
  more reps under it. It never touches another lift.
- The check-in (Maintenance 24, `docs/research/effort-setting.md`) is the only signal that changes
  every lift not begun: a low one takes a set and adds a rep in reserve, through every rebuild.
- So a lifter having a poor day who does not check in gets the full planned volume on every lift
  still to come, whatever the first lifts showed.

## What the research says

Every paper was checked on PubMed (E-utilities) on 2026-10-09.

- **Normal day-to-day variation in the max.** Across 32 studies (1,595 people), a one-rep max
  retested on another day varied by a median coefficient of variation of 4.2% (0.5 to 12.1%), with
  no systematic change between trials (Grgic, Lazinica, Schoenfeld and Pedisic, 2020, Sports
  Medicine - Open, systematic review, PMID 32681399).
- **Normal day-to-day variation in reps.** In 24 trained lifters, reps to failure on the bench press
  retested a week later had a standard error of measurement of 0.7 reps at 90% of the max and 1.1
  reps at 70% (Mitter, Csapo, Bauer and Tschan, 2022, PLoS One, PMID 35511896). A lift a rep or two
  short of its usual reps is ordinary variation; three or more is about three times it.
- **How well lifters judge reps in reserve.** Across 12 studies (414 people), lifters guessed about
  one rep fewer than they had left (0.95, 95% CI 0.17 to 1.73), with very wide differences between
  studies (a standard deviation of 1.45 reps), and guessed better near failure and in later sets.
  The error grew little with the reps to failure up to twelve (0.06 reps for each) and fast past
  twelve (0.47 reps for each) (Halperin and colleagues, 2022, Sports Medicine, scoping review and
  meta-analysis, PMID 34542869). A shortfall read from logged reps and reserve carries that error
  too, and past twelve reps three reps of it is ordinary.
- **Adjusting to the day.** Adjusting the load to how the lifter performs builds the max at least
  as well as a fixed plan (Zhang and colleagues, 2021, Frontiers in Physiology, meta-analysis of 8
  studies in trained athletes, PMID 33776802; Hickmott, Chilibeck, Shaw and Butcher, 2022, Sports
  Medicine - Open, meta-analysis of 15 studies, PMID 35038063, no difference in the max between
  autoregulated and percentage-based loads). Hickmott found that stopping sets earlier (less fatigue
  per set) favoured the max and gave slightly less muscle than going further.
- **What a set fewer costs.** Strength and muscle size held for up to 32 weeks on one session a week
  and one set per exercise, as long as the load stayed (Spiering, Mujika, Sharp and Foulis, 2021,
  Journal of Strength and Conditioning Research, narrative review, PMID 33629972; Bickel, Cross and
  Bamman, 2011, Medicine and Science in Sports and Exercise, PMID 21131862). A set fewer on one poor
  day costs little.
- **A rep more in reserve.** Strength gains were similar across a wide range of reps in reserve,
  while muscle growth rose as sets ended closer to failure (Robinson and colleagues, 2024, Sports
  Medicine, meta-regressions, PMID 38970765, already cited in `effort-setting.md`). On a poor day the
  extra rep in reserve costs a little muscle stimulus and little strength.
- **What a rep in reserve is.** The scale the app uses counts reps in reserve as the reps the
  lifter could still have done at that load (Zourdos and colleagues, 2016, Journal of Strength and
  Conditioning Research, PMID 26049792, already cited in `effort.ts`). At the same load, stopping a
  rep sooner leaves a rep more in reserve by that meaning; a lighter load at the same reps does too,
  by the load and reps rule the plan's targets are read with (Epley).
- **Does one lift's poor day predict the next lift's?** No study tested it directly. Whole-body
  causes lower performance across tasks: sleeping six hours or less lowered exercise performance
  by about 7.6% on average, strength included, mostly for sessions later in the day (Craven,
  McCartney, Desbrow and Sabapathy, 2022, Sports Medicine, meta-analysis, PMID 35708888). A lift can
  also fall short for its own reasons (its setup, a sore joint, the work before it), so one lift is
  weak evidence about the day; two different lifts are better evidence.

## The design that follows

1. **A lift falls well short** when its first working set today, lifted at or under its target
   weight, shows a capacity (reps plus the reserve logged) at least three reps under what the
   target asked (the bottom of its range plus its reserve). Three reps is about three times the
   day-to-day error of reps to failure (Mitter 2022) and, at the reps judged, 7 to 9% of the max
   (Epley), about twice its day-to-day variation (Grgic 2020: 4.2%). This is stricter than
   in-session autoregulation (which also acts on a grind one rep under the floor), because this
   changes the rest of the workout, not one lift.
   - **What the target asked is the plan's:** the bottom of its range plus the reserve the plan sets
     for the lift's role (`prescribeFor`), without any the day's settings added, whenever they were
     applied (an easier day, a low check-in, the hard start's own): a rep more in reserve often
     leaves the load where it was, rounded, and then the lifter's capacity at that load is what the
     plan expected. A set asking less reserve than the plan (a harder day) is read as it asks: that
     only makes a shortfall smaller. Either way the smaller of the two (the re-check: a set kept
     from before a check-in carried that check-in's reserve). The plan's reserve is the one it
     asked when the set was logged, kept with the set (`planRir`): a style changed since does not
     read the set again (the third pass).
   - **Only sets asked for twelve reps to failure or fewer are judged** (that bottom plus that
     reserve). Past twelve, the reserve is misjudged by about half a rep more for every rep
     (Halperin 2022), and three reps there is about 6% of the max: within what a lifter misjudges
     and the max varies. A lift at 15-20, or at 10-12 with three in reserve, is not read (the review
     of item 42 and its re-check).
2. **Only the first working set of a lift counts.** Later sets carry that lift's own fatigue, which
   autoregulation already handles; the first set is the cleanest reading of the day.
3. **Only targets the lifter's own logs set.** A first target from an estimate, a return after a
   break, a hold, or a set with no reserve logged says nothing about the day. A set lifted heavier
   than its target is no evidence either, nor a target an entered max raised: a max past the log
   asks more than the lift has shown (the re-check, `fromMax` on the target), nor one a saved
   workout brought from the day it was saved (the third pass, `saved` on the target), nor one read
   from another rep range: a lift at bodyweight new to today's range is read from the last it did
   (the fourth pass, `otherRange` on the target).
   - **A target set by hand when the set was logged** is the lifter's own choice, not what the app
     expected. The set says so as it is logged (`byHand`); a target set by hand after it changes
     only the sets still to come, so the set still counts (the review: lowering the weight after a
     bad first set, the natural reaction, took the very evidence away). A skipped set filled in
     later is judged by how it is filled in, and timed when it is (the re-check and the third
     pass: one skipped first took the place of a lift begun after it).
   - **A target read from a session that fell short** on its first working set is not read: under
     its floor, or as far short of what the plan asks as this rule reads (`missed` on the target,
     one rule for both, `shortfall.ts`), against the plan's reserve, so a day asked harder or easier
     neither makes nor breaks the mark (the fourth pass). Falling short again says little about today. The session is
     the target's own, at today's range, and a last set tired at the end of it is no miss. At
     bodyweight a target never comes down after misses, and a lift taken to failure at its floor
     under a style that asks three in reserve holds its load, so without this either would read as
     a bad start every session (the review; the re-check: the first rule read the newest session at
     any range, and any set under the floor; the third pass: a beginner on Foundation).
4. **Two lifts, the first two that can be judged, one for each place in the plan.** One lift can
   fall short for its own reasons; two separate lifts both three reps short is unlikely from
   ordinary variation alone. This is a judgement, not a tested threshold: no study sets the number
   of lifts. A stand-in swapped in after its lift began (the same place, or what it replaced) is no
   second lift: a swap often has the same cause, a sore joint (the review).
5. **The treatment is the low check-in's,** a set fewer and a rep more in reserve on every lift not
   begun, and the line says why (on the lift too, first among its reasons in Options). It is a
   layer over the plan (the sixth pass): every change to the workout is made to the plan under it,
   and the ease is laid again over what the change leaves, so a new length, a pause, an end time, a
   place, a swap or a lift the coach adds neither loses the ease nor eases a lift twice. What each
   eased lift had is kept on it (`eased`, with the exercise it was for and, since the ninth pass,
   its own settings: its rest, ramps and drop set, and what was set by hand), so the start no
   longer falling short gives a lift not begun exactly that back, and a plan fitted to an end time
   comes back fitted.
   Nothing is picked again, added or fitted to the time for the ease itself: the plan under it was
   fitted, and the eased plan only runs shorter. A lift is begun once anything of it is logged,
   its ramps skipped included; a block with one begun keeps its sets.
   - **A lift under way keeps the ease for good** (the eighth pass): once a change is made while
     its block is under way, its record is kept and never given back, not by "Back to plan" and not
     after an undo of its sets, while the lift stays in the plan (a check-in or a new length that
     builds the rest again may pick its place anew where it is neither pinned nor in front, as for
     any lift to come), so the changes it has had since (a weight or count set by hand, a check-in, a swap
     around it) stand. A set logged and undone before any change ran leaves the record the plan it
     was, and the lift takes it back with the rest: nothing has passed it by (the twelfth pass took
     back the eleventh's keeping on every undo, which held a set logged by mistake out of "Back to
     plan"). Its sets undone, it
     is fitted in place by new weights, its record with it, so a copy saved after has the plan at
     the weights there, and a check-in or a max leaves it as it is, as they leave a lift under way:
     a max says the lift is under way, and its card offers none (the ninth and tenth passes:
     fitted afresh, it lost the ease's reserve and its words; a max was said to keep "the weight
     set for today"; a copy had the last place's weights). Swapped in place, nothing of it logged,
     it hands its place on as it stands: what comes in is planned at the lift's plan under the
     day's settings and eased as the layer eases a lift to come, to the count the lift showed, with
     the reason said, kept for good as on the lift, and the plan kept on it for a saved copy. A
     count set by hand comes in as set, its rep in reserve laid and kept the same way; a lift marked
     under way before the hard start hands the mark on, so no ease lands on what comes in (the
     eleventh to fifteenth passes: what came in was eased again, took the plan's count unsaid, came
     in at the plan's reserve, undid an end time's trim, took an ease its lift was kept from, and
     was half-eased where its own plan asks another reserve or under "Make it harder"). A lift under way before the hard start
     keeps its sets too: an undo of them never brings the ease on
     unsaid while that hard start stands. The mark that keeps them keeps nothing else: such a lift
     takes a check-in, new weights and a max as any lift does (the tenth pass: it kept the plan's
     sets through a low check-in). When the hard start comes off, the mark goes, and a hard start
     told later eases that lift where nothing of it is logged (the ninth pass: it was never eased
     again). (The seventh pass gave such a lift
     the plan back after an undo; the eighth found that plan stale, put back over weights and
     counts the lifter had set, and its own Undo and failures caught in loops.)
   - **A lift stopped while eased** (swapped once begun, or at a place that cannot equip it) owes
     what it shows still to come, eased or set by hand, and what stands in for it keeps that count:
     the ease takes no set from it, only adds its rep in reserve, and "Back to plan" gives that rep
     back, never a set, the lift having been under way. It reads the day's settings from the
     settings themselves, never from the eased sets of the lift it stands in for (the fifteenth
     pass: under "Make it harder" it took the ease's rep twice). What stands in for a lift stopped before
     the hard start keeps its count too. (The seventh pass owed the plan's sets so a stand-in was
     not eased twice; the ninth found that the floor on the stand-in's few sets then took nothing,
     so the set the ease took came back unsaid, a count set by hand lost a set, and a lift done
     under the ease got a one-set stand-in at a new place.) A lift swapped in place keeps no record
     of the exercise it was, and a record of another exercise is dropped, never put back on this
     one.
   - **Not laid on a lift under way:** sets that join one (a swap back to a lift begun, a lift
     picked up again at a place) come as the plan has them.
   - **With a check-in, the larger of each part, never both:** after a sore check-in (a set fewer)
     the hard start adds only the rep in reserve; after a low one (both) it adds nothing, and the
     low check-in's own treatment stands, before the hard start or after it, as it does on any day.
     Where that treatment's rep in reserve moves no load (a set at twelve reps and reserve or more,
     the plan's rule), the set keeps its reps: the hard start's own ease would take one off (the
     seventh pass; Proposed for the check-in in the Maintenance 26 report). "Make it harder" or
     "easier" still stacks as before; autoregulation keeps working on each lift.
   - **A set comes off only above the floor a check-in keeps** (three on a main strength lift, two
     on any other, `setFloor`, the plan's own rule), and never off a count the lifter set, the
     coach offered or a stopped lift handed on. The fifth pass took a set down to one, below what a
     low check-in keeps, and any later rebuild then gave it back.
   - **A rep more in reserve, never heavier.** Each set keeps its reps on the load the place makes
     nearest the plan's own rule for a rep more in reserve, where that load is lighter. Where no
     lighter load is near (a high-rep set, whose load that rule reads to twelve reps and reserve, or
     a light load on a coarse step), the set keeps its load and does a rep fewer, a rep more in
     reserve by the scale's own meaning (Zourdos 2016). The fifth pass re-targeted each lift from
     the whole session, and an eased plan's lighter work before a lift made some lifts heavier; a
     set kept at its load and reps with a rep more in reserve asked more of the lifter, not less.
   - **What stays:** a hold's seconds and load, as the plan keeps them; a set pushed past what the
     weights here make keeps its load and does a rep fewer (a lighter load stands in for less of
     the load asked); a weight set by hand keeps its load, and reps set by hand their reps, so a
     set with both, or with reps set by hand and no lighter load near, takes no rep in reserve; a
     reserve already at four stays there, as the plan's does; a pair or circuit under way keeps its
     sets, as a lift under way does; a count the coach offered stays, pinned or not.
   - (The third pass eased in place without a record and gave back too much; the fourth rebuilt
     the rest as a check-in does, and the fifth found that adding work and dropping the lifter's own
     choices on a set log no one tapped for; the fifth's in-place ease, with a record, was lost to
     every rebuild after it and could ease a lift twice.)
6. **Undone or corrected,** the reading is taken again: a set undone or corrected so the start no
   longer falls short brings the planned sets back. "Back to plan" is said only when nothing else
   of the day's settings stays (a sore check-in, harder or easier); otherwise "Your start no longer
   falls short", and that today's other settings stay. A check-in during the workout that feels
   good says the rest stays eased for the hard start, never "full workout kept" (the review): when
   nothing changed, "the rest stays eased for the hard start"; when the plan changed (the hard
   start's own ease in place of a low check-in's, or the low check-in's in place of it), "the rest
   eased for the hard start", with what changed (the seventh pass: the first said nothing changed
   while reps came back).
   - **Sets added or taken by hand** count from what the lifter sees, the ease included, and that
     count stays when the ease comes off, with the plan's own loads and reserve; no tap passes the
     most sets a lift carries (the sixth pass: the count came back over the lifter's own, past it).
   - **Fewer reps over more sets** (the coach's offer) adds its set to what shows, as a set added
     by hand does (the seventh pass: two came).
   - **A saved copy** of the workout keeps the plan under the ease, every lift as the plan had it,
     its own settings too, and no marks: the ease was the day's, and a saved workout is a plan for
     another (the sixth and seventh passes: marks carried into a saved workout made the next day's
     lifts look eased already, then the eased sets and the hard start's line went in without
     them). It is counted as it loads, a lift stopped on the day gone and its sets with what stood
     in for it, and timed, warmed up and summed up whole for its own length, not for the minutes a
     rebuild under way left (the ninth pass: "about 38 min, 8 over" a 30 min left, with no
     warm-up). Its lines name only the lifts it holds, its own first lift first, and a fit to
     another length (the minutes left, an end time) leaves no fitting step in it (the tenth pass:
     it named first a lift finished before a place change, which a copy leaves out). What stood in
     for a lift stopped under the ease keeps the count the ease left.
7. **The lifter's Undo stands.** Undo on the hard start's change (or on "Back to plan") is the
   lifter's choice: the start's reading is kept with the session (`startDeclined`), and the change
   does not come back on the next set while the start reads the same. A change that could not be
   made is not tried again on every later set for the same reading (the review: both came straight
   back). Both are kept with the session (`startDeclined`, `startFailed`), so the next workout reads
   its own start (the re-check: a failure outlived its workout); a change worked out on a workout
   discarded meanwhile gives the plan that follows nothing (the third and fourth passes), and a
   plan not yet started that is made again meanwhile (a workout pulled in from another device) has
   the change worked out again on it, once; one aimed at one of its lifts is left, its lifts being
   picked again (the sixth pass: the old plan's result was written over the new one), and says so
   (the seventh pass: it was left without a word); the lifts in either order are one reading (the
   third pass: a first set
   deleted and logged again brought an undone change back). A change waiting behind another (the
   store runs one at a time) reads the start again when its turn comes, and does nothing when the
   workout already matches it, or the lifter took that change back.
8. **Told with the set that brought it on.** When the same set also moved its own lift's next sets
   (in-session autoregulation), the hard start's line says that too ("Also from this set: ..."),
   and Undo takes both back: one tap, one line, one Undo; only when nothing else ran between them
   (the third pass). When that change failed, its error stays in view, and the start is read on the
   next set (the third pass).

## Uncertainty

- No trial tested carrying a shortfall from early lifts to later ones; the rule rests on what
  normal variation is (Grgic 2020, Mitter 2022) and on what a set fewer and a rep more in reserve
  cost (Spiering 2021, Robinson 2024), both small.
- Reps in reserve are the lifter's own judgement, about a rep low on average (Halperin 2022): a
  logged capacity tends to read about a rep under the true one, which makes a shortfall look about
  a rep larger than it was. That error makes the rule fire more often, not less. The three-rep
  threshold leaves room for it, the targets come from sets logged with the same habit, and what
  firing costs is small (a set fewer, a rep more in reserve).
- The work before a lift today lowers its first set; the target already accounts for that work
  (session context, Maintenance 13), so a shortfall measured against it is beyond what the order
  explains.
- Twelve reps to failure as the most judged follows Halperin 2022's split of the evidence (twelve
  or fewer, more than twelve); the error grows by degrees, not at a step.
- A target rounded to the weights at hand can ask a little more or less than the plan's estimate
  (half a load step); three reps leaves room for that too.
- In a deload week the plan adds a rep in reserve and lightens the load; the reading asks the
  plan's ordinary reserve, so it reads a deload's first sets a rep easier than they were asked, and
  at the lighter load they rarely fall short.
- A set's `byHand` follows the lift's hand-set target when the set is logged: a set skipped before
  a hand-set change and filled in after it, or one undone and logged again after it, reads as set
  by hand and is left out. That only makes a hard start less likely.
- A rep fewer at the same load and a lighter load at the same reps are the same rep in reserve by
  the scale's meaning; no study compares them on a day like this. A rep fewer leaves the session's
  logged range a rep under the plan's, which the next session reads as the same range (two reps
  apart or less, Maintenance 15); at bodyweight a lift short of that lower floor reads as from
  another range, and the next target says to log what is done.
- The set floors are the check-in's own (Maintenance 24): a judgement of the plan, not a tested
  threshold.
- A session saved before this round carries none of these marks: a workout under way as the update
  arrives is read once without them.
