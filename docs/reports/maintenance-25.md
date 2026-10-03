# Maintenance 25: round G, issues seen on the live app

Built on 2026-09-25 on the owner's word: "GREEN for Maintenance 24 ... Then start the next
maintenance round for these newly observed live-app issues". Round G is the owner's items 36 to
39: a recent set and a known max each reaching the target, Equipment busy moving a lift later
instead of removing it, the coach's added rest offered once, and no repeated lines under "Why this
workout". Two more joined it on 2026-09-26: 5, Settings, Plan and Progress as one layout, and 6,
the installed app's updates and Phase 8's acceptance; and two on 2026-10-02: 7, a real
demonstration and a plain How to for every exercise, and 8, the plates drawn on the bar with
Today and Default in place of Edit rack. Each of the four was reproduced on the build
then live (`4addd33`, the same app code as `4f63e3d`) before anything changed: in the engine for
all four, and in the browser against the live URL for 37 and 39; 5 was measured on the live build
at the phone's width, and 6 on two real builds served one after the other. The research is in
`docs/research/entered-maxes.md`, `docs/research/equipment-busy.md` and
`docs/research/rest-extension.md`.

## 36. A recent set and a known max reach the target

**Found:** both ways of entering a max end in one stored estimate and one rule, and the gym gave
what each should. Three things made the target look stuck, and the sheet made it worse. The
preview was a second copy of the target rule that left out the weights at the place and a lift's
logged sets: at home with dumbbells to 20 lb, a max of 60 or 80 previewed 40 or 55 lb × 6-10, and
the plan put 20 lb × 26-30 either way. A recent set's reps counted up to twelve only, so 20 × 15, ×
20 and × 25 gave one estimate. And a first target rounded down onto the heaviest pair read as met:
someone who had just done 20 reps at 20 lb was asked for 6-10 "at 1 in reserve".

The independent reviews of that fix traced the other paths and found five more:

- **The owner's main lift at home ignored every entry.** A strength set held far under its load got
  two extra reps at most, so the dumbbell bench press at 20 lb planned 20 lb × 6-8 "at RIR 2" for
  any recent set from 20 × 15 to 20 × 30 and any max from 40 to 100. At a third of the max that
  set stops some twenty reps short: the reserve it named was untrue.
- **The log and the entry were read by different rules** (reps to twelve against thirty): the same
  set of 100 × 20, logged and then entered, moved the bench two steps.
- **A lift logged at another rep range ignored both inputs** (its target read from the log's
  estimate): a max of 120 or of 300 left a bench logged at 10-12 at 140 × 4-6.
- **After three weeks away, a max set the start with no limit**, where the sheet promised two
  steps: a max of 300 took the bench from 130 to 215.
- **The sheet said "stays" when the reps moved**, judging the weight alone.

Smaller: a deload week lightened the load but not the estimate behind it, so the heaviest pair
added reps in a deload week; the preview repeated lines from a max saved before; the words for a
lift with its weight set by hand promised a count the log then overrode; Options showed a set saved
before in the old reading; a saved set with no weight could override a good max.

**Research:** reps at each share of the one-rep max from 952 tests in 7,289 people (Nuzzo et al.
2024, PMID 37792272): Epley stays within about 6% of the means up to 20 reps and errs low beyond;
a one-rep max is predicted well from 20-rep sets (Reynolds et al. 2006, PMID 16937972); a load
moves 2-10% at a time (ACSM 2009, PMID 19204579). At 30% of the max, sets stopped short of failure
grew no measurable muscle where sets to failure grew as much as heavy sets, and strength rose about
the same either way (Lasevicius et al. 2022, PMID 31895290). Stopping training lowers strength,
more the longer the break (meta-analysis of 103 studies, Bosquet et al. 2013, PMID 23347054).

**Delivered:**

- The preview is the save's own result: the store runs the save's rebuild on the session without
  saving, and the sheet shows the lift's weight and reps from it, with the engine's line for the
  heaviest weight here or the logged sets. It says "stays" only when the weight, reps and reserve
  all stay as the plan has them; any move reads "Today's target: ...". Its lines come from this
  save's rebuild, never from a max saved before. This replaces Maintenance 23's choice to preview
  the load a pushed set stands in for.
- The max is credited only with what it did: the save's rebuild runs once more without it, and
  "the target moved toward your max" is said only when the two differ. A target today's work
  before the lift moved since the plan was made reads "Today's target: ..." with the engine's
  line for that work and "Your logged sets already say as much as this max." (from the review:
  the max had been credited with that move).
- A lift taken lighter to win back missed reps (short of its floor two sessions running, or three)
  keeps that target whatever the max, and the sheet says so: "... stays 165 lb × 4-6 reps at RIR
  2: the lift is lighter today to win back missed reps, and a max does not change that." Options
  says it too. (From the review: it said "your logged sets already say as much as this max" for a
  max far above them.)
- A max the weights here cannot follow says so: at the heaviest pair with the most reps it asks,
  "... stays 20 lb × 26-30 reps at RIR 1: the max asks for more than the weights here make" (with
  reps set by hand, "... than the weights here and the reps you set allow"), and the save says the
  weights here hold the lift at this target. (From the second review: it said the logged sets
  already say as much, beside the engine's line that the max moved it up.) In a deload week, whose
  lighter loads can round a max's move away, it says "this deload week's lighter loads round it
  to the same weight", and the save that the deload week holds it. (From the third review: it
  blamed the weights here, which make the heavier weight.)
- A recent set counts its reps up to thirty; a set saved before is read the same way, on the sheet
  and in Options. A saved set with no weight or reps gives no max.
- **A strength set well short of its load runs to its reserve, as a muscle-building set does.**
  This revises point 2 of the rule agreed on 2026-09-23 (`docs/research/lighter-loads.md`), from
  the evidence above. The dumbbell bench at 20 lb now plans 4-6 reps for a recent set of 20 × 10,
  6-8 for 20 × 15, 13-15 for 20 × 20, 22-24 for a max of 40 and 28-30 for 60 or more, each at
  RIR 2; such a set takes its own tempo, not the slower one of the heaviest weight. Within a tenth
  of its load a strength set keeps two extra reps and the slower tempo.
- A max on a lift with logged sets counts only when newer than its last session and 2.5% above
  what the log says, the log read as the entry is (reps to thirty), and moves the target two steps
  at most, at today's range or at another; a lower max leaves the target. After three weeks or more
  away a lower max counts too (the start is the lighter of the two), and a higher one moves the
  logged start two steps at most.
- An estimate rounded down onto the heaviest weight a place has, that asked for more than it, is
  held there with two more reps at most; a deload week lightens that estimate with the load.

**Measured** (against the Maintenance 24 build): the gym and the full set at home plan as before.
At dumbbells to 15, 20 or 30 lb, 2,016 of 3,600 fresh plans changed: the strength lifts run to
their effort, and their longer sets take minutes the easy sets did not, so 1,037 plans keep one
move fewer (most often the curl; Chin-Up in 144 plans, all 15-minute pull or upper days at
dumbbells to 15 or 20 lb, where the row alone now fills the minutes). None runs more than a minute
over. Of 480 rebuilds, 240 changed, and 42 more than before run over by more than a minute (up to
5.2): 15-minute rebuilds of a session begun or with the main lift pinned, where the main lift alone
no longer fits the minutes left, and the plan says so.

## 37. Equipment busy moves a lift later, never out

**Found:** Equipment busy marked the equipment busy for the rest of the workout and swapped the
lift, or left it out ("Left out X: nothing safe fits right now."), and every other lift needing that
equipment with it. On the 101 lifts of the default plans at the gym, at home and at dumbbells to 20
lb, it left the lift out 52 times and swapped it 49 times, and other lifts changed in 60; at home
one tap turned every dumbbell lift into band or bodyweight moves.

The review of the first fix found more: the lift that passed a busy lift ignored the sets the busy
lift had already logged (an incline press moved in front of a bench with two sets done stepped up,
"fresher"); the button stayed on for a lift with every set done, which the engine then refused; a
ramp added by hand was dropped; a check-in or a new length put the lift back in front while its
equipment was still taken; a session saved before still took lifts out for its old busy list; "It
is the last exercise left" was untrue with earlier rows open, or before Start; and the plan still
said the moved lift led the session.

**Research:** strength gains are largest in the exercises done first, and growth is similar in
either order (Nunes et al. 2021, PMID 32077380); an exercise gets more reps early in a session
(Simão et al. 2012, PMID 22292516). Moved later, a lift keeps its work; left out, it loses it.

**Delivered:**

- Equipment busy moves the lift's row behind the next row with a set to do: "Barbell Bench Press
  moved after Incline Dumbbell Press: its equipment is busy. It comes up again once Incline Dumbbell
  Press is done." A pair is named by its lifts ("... the equipment for Band Fly is busy. They come up
  again once that pair is done."). Nothing is swapped or left out.
- The rows passed and the lift take targets for their new places by the plan's own rule for the
  work before a lift today, which now counts sets already logged on lifts that come after it: the
  incline press that passes a bench with two sets done takes no step up. A lift under way keeps its
  sets, and every lift keeps the ramps it has, one added by hand too.
- Once the row in front is done, the busy lift leads again and can be moved again.
- The move holds for the day: a check-in, a new length, harder or easier or a technique switched
  puts the lift back behind the lifts it gave way to. A new place lets it go.
- A swap keeps the move. A lift swapped in for the one the busy lift gave way to (by hand, for
  comfort, or for a sore joint) is the one it stays behind; a lift swapped in for the busy lift
  stays where that one was moved to, and so does the busy lift swapped back in. When a rebuild
  leaves out every lift it gave way to, it waits behind the next row with a set to do instead.
  (From the review: a swap let the busy lift lead again at the next check-in, its equipment still
  taken. From the sixth: the busy lift swapped back in, after it had stopped, came back in front;
  and one held under an old name lost its move when swapped.)
- Moved back in front by hand, the lift has its equipment again: the move lapses, and no rebuild
  puts it back behind. A move by hand that leaves it behind every lift it gave way to still to do
  keeps the move. (From the sixth review's tester: a finished row after it, which the move by hand
  never touched, ended the move.)
- The lift in front now has its equipment: its move ends, and the busy moves never move it, nor does
  Equipment busy on another lift but its partner in a pair or circuit, which moves the whole row
  (from the sixth review: a tap on another lift sent the lift under way to the end). A lift stopped
  earlier holds no move, even with the lifter back on it after a set of it is undone (from the
  seventh: once a busy move kept its lift's old names, a lift stopped under one of them, the lifter
  back on it, would have ended the move of the lift tapped). A lift moved while under way (its bench
  taken between sets) keeps its move through a rebuild. Skipping the lift it gave way to (or losing
  that lift to comfort or a sore joint) ends the move too, so the busy lift leads, as it does once
  that lift is done. A lift a rebuild brings back after a sore joint swapped it keeps the move, and
  one the rebuild pairs with the lift it gave way to is left as the pair runs. (From the second
  review: a check-in pulled a lift under way from the lifter, mid-set, after the lift it gave way to
  was skipped. From the third: a check-in put a lift moved between its sets back in front, its bench
  still taken.)
- Two lifts busy at once: Equipment busy on the lift that passed a busy one moves it behind the next
  row with a lift still to do, passing over every row waiting on it, directly or through another
  waiting lift (a row with one lift waiting waits whole), and each stays behind what it gave way to;
  the engine and both screens read the same rule. All the moves are read as one order of the rows:
  each row goes as early as its moves let it, the order stays as it was wherever no move asks
  otherwise, and every row whose work before it changed takes a target for its place. A lift done,
  or stopped, waits on nothing and holds nothing, and a lift that falls back behind the next row
  never goes behind one waiting on it. When the moves ask for a loop (rows each waiting on the next,
  which a rebuild's pairing can make), the moves holding back the loop's earliest row end; a row
  behind the loop keeps its move. A swap never leaves a lift waiting on itself: a name another lift
  takes by a swap (by hand, for comfort or for a sore joint) is that lift's, and another lift
  swapped to the busy lift's own name ends the move, unless the busy lift goes on under an old name
  still planned, which the move then follows. A rebuild changes no name, so a lift it brings back is
  held as before. Equipment busy replaces only the tapped lift's own move: another lift's move that
  knows the tapped lift by an old name keeps going without that name, and a busy move never takes a
  name a lift in the plan has. (From the third review: the second tap put the first busy lift back
  in front, each tap after that swapped the two while a free lift never came up, and after swaps a
  lift could lead as though paired with itself. From the fourth: the same with a pair, and a lift
  swapped in under the busy lift's old name taken for it. From the fifth: two lifts could each wait
  on the other, a lift with nothing left still held the row behind it, two alike rebuilds gave two
  orders, and a lift could still wait on itself; and, from its random-action tester run again on
  those fixes, a lift paired with the one tapped lost its move, a row whose lifts given way to were
  gone fell back past a lift just tapped, and a rebuild that brought back a lift under an old name
  could have it wait on itself. From the sixth: a tap could move nothing while saying it moved the
  lift, tap after tap, when a lift waited on the partner of a waiting lift; a finished lift given
  way to still held its row; and the row picked to go behind could stand ahead of a lift it waited
  on, so the tap was undone at once. From the seventh: a rebuild could leave a lift at the target
  the plan set for its own order once other lifts stood before it in the same place; Equipment busy
  on a lift swapped in for a sore joint forgot the busy lift's old name, so a rebuild could bring
  the old lift back first; and a tap could name a lift stopped earlier, a set of it undone, and move
  nothing. From the eighth: after a busy lift was swapped out and back and a rebuild brought the
  lift swapped in back as a pick of its own, Equipment busy on that pick took the other lift's move
  as its own and held that lift too: with the lifter on it the tap moved nothing, and otherwise it
  moved that lift as well.)
- A rebuild that keeps a move says the time its timers add up to, and "Runs about N min over" when
  it does; under way, against the minutes left ("Runs about 6 min over the 40 min left."). (From
  the review: 88 of 300 such rebuilds stated a time half a minute or more off, and 18 ran over
  with no line saying so. From the third: under way, a session set to run 20 minutes past its end
  said nothing. From the fourth: a check-in short on time measured against the old length. From
  the fifth: a return after a pause left out its own short warm-up.) The plan's summary says the
  exercises it has and those minutes after any change; once a set is logged the general warm-up is
  behind the lifter, and neither the summary nor a rebuild counts it, but for the short warm-up of
  a return after a pause.
- The button is off for a lift with every set done, or with nothing after it left to do, by one
  rule the engine and both screens read. It says: "Nothing after it is left to do, so there is
  nothing to move it behind: do it now, skip it today, or finish the workout." (on Today: "... do it
  when it comes up, or skip it today"). With only lifts waiting on it after it, it says so: "The
  exercises left after it are waiting for it, moved there for busy equipment, so there is nothing
  to move it behind: ..." (from the fourth review, where it said nothing was left). Skip today and
  finishing work as always.
- The plan's summary names the lift that now comes first, and the main lift "leads" only while it
  does. Nothing reads the old busy list any more.

## 38. The coach's longer rest is taken once

**Found:** "Add 30 s to this rest" added 30 s to the running rest and nothing else; the offer was
never marked as taken, so the same two sets raised it again and every tap added 30 s more (150,
180, 210, 240 s). With no rest running, a tap did nothing. The review of the first fix found the
offer still showing for up to a minute after the rest ended, a tap then pushing the timer past its
end, and the offer tied to the rest rather than to the set that fell short.

**Research:** longer rests keep more reps over several sets at 50-90% of the one-rep max (de Salles
et al. 2009, PMID 19691365; Willardson 2006, PMID 17194236); over two minutes serves trained
lifters' strength best (Grgic et al. 2018, PMID 28933024); growth gains little past 90 s (Singer et
al. 2024, PMID 39205815). A set that falls short after a longer rest is new evidence.

**Delivered:**

- The offer is about the set that fell short, and stands only while the rest before the lift's
  next set runs: after its own set, or in a pair or a circuit the rest after the round, which comes
  before the next set of every lift in it; it goes the moment that rest ends. A rest before another
  row's set is not one of them: a lift moved behind a row for busy equipment is offered nothing for
  the rest after that row, having rested through all of it. (From the review: the pair's second
  lift was never offered the longer rest, and a lift moved for busy equipment was, for the wrong
  rest.)
- A rest is lengthened once: when both lifts of a pair fall short in one round, one offer comes,
  and taken, it is longer for the whole round.
- Only each lift's set of the round the rest follows counts: a set skipped brings back no old drop,
  and an offer taken in an earlier round does not stand in for a new drop. (From the second
  review.)
- Taking it adds the 30 s, says so ("Added 30 s to this rest."), and marks it taken for that set in
  one change: the card goes, and a second tap adds nothing and says "Already added to this rest."
  A later set that falls short again can bring it back; a set undone and lifted again counts as a
  new set, and a rest started again (a partner's set in a pair undone and logged again) is a new
  rest, offered again. (From the third review: the new rest came with no offer, and the 30 s
  taken went with the undo.)
- A tap once the rest is over, or after a newer set, changes nothing and says: "That rest is over:
  the next set can start."

## 39. "Why this workout" says each line once

**Found:** the fit to time runs in passes: a notch of rest, then one set at a time. It logged every
pass as a line, so "Shortened rests toward the realistic minimum." showed up to four times, and
"Trimmed one set from X." twice when a lift lost two sets: repeated lines in 462 of 600 plans. The
list used each line as its React key, so a repeat gave two children one key. The review found the
same cause in three more places: a lift's "Why this target" named the empty bar once per step that
met it, and claimed steps down the bar cancelled; "What changed" could say a removal twice ("Left
out X." and "Left out X: nothing safe fits right now."); and a plan stored before the fix (a
session in progress, a saved workout) kept its repeated lines.

**Delivered:**

- The fit logs each step once (`FittingLog`): a step taken again counts on its first line. The
  rests line shows once; "Trimmed 2 sets from X." and "Gave X back 2 sets" count; other lines, keyed
  by their own words, cannot repeat. An independent review checked 1,920 plans with history and
  46,080 rebuilds: no step, reason, compromise or change line repeats.
- A step the empty bar cancels says nothing, and one it cuts short says the step the load took
  ("down a step", not "down two steps"), so the bar is named once at most and no line claims a
  step that never happened. (From the review: a cut step claimed its full size, and a lift logged
  under the bar and stepped up and down again named the bar twice.)
- "What changed" says a line once, and a removal with its reason where a note gives one.
- A plan stored before this is read back with its lines merged the same way: its fitting steps,
  reasons and compromises, and each lift's own lines.
- Every list drawn from text keys its lines apart (`keyedLines`): the plan's reasons, steps and
  compromises, the change summary, the coach's lines, a lift's evidence, guidance, setup, cues and
  common mistakes (which a custom exercise can repeat), and the other lists on the screens.

## 5. Settings, Plan and Progress, one layout

The owner, after the round began: Settings too long, Plan and Progress repeating each other; treat
the three tabs as one information-architecture and visual-design problem, and make them feel like a
finished consumer app.

**Found:** at the phone's width (412 px, the live build `4addd33`, a few weeks of made-up history)
Settings was 9,981 px tall, about twelve screens of fourteen full cards. The same things lived in
two places: the training days had an editor on Plan and in Settings, Schedule; the places had an
editor in Settings and the full manager on Plan; the muscle-coverage bars were on Plan and on
Progress; Progress listed each lift twice (Estimated strength, then Exercise progress); and every
screen's first lines were the build hash and the phase, which Diagnostics said again.

**Delivered:**

- **One home for each thing.** The days live with the schedule in Settings, and Plan shows them
  with "Change days ›" straight to that row (`#/settings/schedule`). The places live on Plan;
  Settings keeps the one-tap "I have gym access" switch and a row that links there. Every muscle's
  coverage lives on Progress; Plan says the week's priority muscles in a line with "Every muscle on
  Progress ›". Each lift is listed once on Progress, its trend and its estimated max together. The
  build and the phase live in Settings, About.
- **Settings as grouped rows.** Your training (goals, programming, schedule, preferences,
  limitations, units), Places, Alerts, Your data (cloud copy, export and import, automatic backups,
  storage, import from another app) and About (setup again, about this app). Each row shows its
  current value ("Intermediate · 4 a week · 60 min · Mon, Tue, Thu, Fri") and opens in place; the
  alerts' switches and gym access stay in view. The cloud copy row opens itself and reads "Needs a
  look" when the copy failed, and a setup link lands on that row open. The exercise library has a
  row of its own.
- **A link lands on its row, on screen.** "Change days ›", the coach's "Export a backup" (to Export
  and import), a setup link and every `#/settings/<row>` link open that row and bring it into
  view; "Where you train" lands on Plan's places card. Only the row a link names moves the page: a
  row opened because it needs a look opens where it is. A row closed keeps what was typed in it and
  a save under way, and a sheet opened from it stays on screen until it is closed itself. A sheet
  closed gives keyboard focus back to what opened it, one disabled while it worked included, where
  it still stands (the browser gives none to a button gone, hidden or disabled), and the page
  scrolls again only once the last open sheet is closed. (From the third review: focus jumped to
  the top of the page, and two sheets closed together left the page unable to scroll.)
- **The summaries say what is set:** Goals names "losing fat"; Programming says the techniques the
  switches allow ("allows supersets and drop sets"), since a style can still plan none; Limitations
  shows a note in the lifter's words; the cloud copy reads "On · waiting to be online" while the
  phone is offline, not "Needs a look", and removing the token clears an error from before it. A
  setup link that was not used says why on the cloud copy row ("The setup link was not used:
  Connect to the internet to set up a different database. This device still uses the database
  above."), which asks for a look and opens itself; no sync replaces that reason, and it lasts
  until the app is closed, or a token is saved or removed. (From the third review: on a device with
  a token the reason was replaced by the old database's status, so the copy seemed to have
  moved.)
- **Progress reads a set as the max sheet does.** Each lift's "~N lb max", its trend and each
  session's line on its sheet count every rep to thirty, so a set of 20 × 25 reads about 37 lb on
  Progress and on the max sheet alike, where Progress said 28; every weighed lift shows its max and
  its confidence, where six did, and counts all its sessions, where it stopped at eight. Its best
  is read from every session, and its sheet lists the newest eight with every other one a tap
  away. A hold, or a lift with no load reference (a pull-up, a band move), shows no max, as the max
  sheet takes none: 10 lb added to a pull-up is not its max. A best with no max is a set as it was
  lifted: the most load times reps (or seconds), then the most reps, in whichever session it came.
  The best with a max is the best over every session, not the latest, and the trend says where the
  lift is going now. The estimates' confidence is the middle lift's (the lower middle one), not the
  least-done one's. (From the third review: the sheet said "Sessions 10" beside 8 lines and missed
  a heavier set in the other two; a pull-up showed "~12 lb max"; a carry showed a set never lifted;
  one lift done once marked every estimate low. From the fourth: a best with no max read sets one
  way within a session and another across sessions.)
- **Lighter screens.** Settings is 1,807 px (82% shorter, about two screens), Plan 1,636 px (22%
  shorter) and Progress 3,346 px (18% shorter), measured before the review's fixes; see
  Verification for the final heights. Plan's recovery states read as three labelled rows, the
  labels in one column as wide as the widest in the phone's own font; its
  week card says "Today's session is done" when the only day set is today and done, never "No
  available days set". Progress shows the five newest workouts and the first twelve lifts, with
  every other one a tap away. The dark surfaces, the green accent and the type sizes are
  unchanged: the reviews found texts set smaller (a lift's max, the recovery labels, the priority
  muscles' names, About's phase name) and they are back at their sizes. Links and "Show more" are
  48 px tall.

Before and after, at 412 px, are in `docs/screenshots/maintenance-25/`.

## 6. Phase 8: the installed app, its updates, and acceptance

The owner: Phase 8 (data safety, optional migration, PWA, polish and acceptance) shows "YELLOW ·
awaiting Android review", and the installed Android app once showed an older build than the
deployed site.

**Found:** the app's service worker waits for a tap on Reload before a new release takes over (by
design: nothing takes over silently). But a browser looks for a new worker only when a page loads,
and an installed app on Android is mostly brought back from the background, not loaded: it could
sit on an old build for days without the offer ever appearing. "Later" also put the offer away
until the next cold start. The Pages site serves every file with `max-age=600`; the worker script
itself is fetched past that cache for an update check, so a deploy is found at the next check.

**Delivered:**

- The installed app looks for a release itself: when it comes back to the front, when the network
  comes back, and hourly while open. A release put off with Later is offered again the next time
  the app comes back, until the page loads again: whether it still waits, or already runs the
  app's worker (it took over with no page under it, or another page let it in). During a workout
  the offer says "Logged sets and timers are kept on this device and carry on after the reload."
  (a value on a dial not yet logged is not kept, and is not promised). (From the third review: put
  off after such a takeover, it was never offered again. From the fourth: on a page no worker ran
  yet, a release found again after its first install failed was never offered at all.)
- **Reload always ends on the new build.** The plugin listens for new workers only until it sees
  one it takes for another page's (found a minute or more after the page registered, or any after
  its first), and never sees a worker after it. A release found again after such a worker failed
  to install, say, it never offered, and its Reload handed that worker control without loading the
  page: the page stayed on the old build. Reload now loads the page
  once the new worker is in, as this page's worker or, on a page no worker runs yet, once it is
  active; with none waiting it loads the page at once. The app listens for new workers itself: a
  release is offered the moment it waits, and when another page of the app (a browser tab of the
  site, say) let it take over. Back online, the app looks for a release without bringing back one
  put off with Later. (From the reviews, which reproduced both: the owner's symptom, an installed
  app on an older build.)
- Four browser tests prove it on two real builds served one after the other on one origin, with
  Pages' own cache header (`e2e/pwaUpdate.spec.ts`, `scripts/pwa-update-server.mjs`). The app runs
  build A under its worker with a profile, a finished workout and a workout under way; B is
  deployed while it is in the background, and first shown not to be found by the browser alone;
  brought back, the app offers B, moves to it on Reload, and still has the profile, the history,
  and the workout under way with its set and its rest. A release put off with Later is offered
  again, and stays put off while the app stays in front. An app brought back more than a minute
  after it opened, whose first install of B fails midway, offers B the moment its second install
  waits; open in a second page too, Reload there lands on B, and the first page, left on A, is
  offered B at once, again after Later though nothing waits, and Reload lands on B. And on a first
  visit, before any worker runs the page, B takes over as soon as it is found; the page is offered
  B, again after Later, and Reload lands on B. Which fix each test holds is in the revert run
  below.
- The build is in Settings, About: `Build <sha> · <UTC time> · Phase 8`, with the storage facts and
  whether the app runs installed (standalone) or in a browser tab.
- Phase 8's gate stays YELLOW, awaiting the owner's review on the phone (below).

## 7. A real demonstration and a plain How to for every exercise

The owner: replace the placeholder visuals with clear demonstrations of each exercise's exact
variation, from sources whose terms allow it, kept with the app; motion for as many as possible,
and a still only after several reusable sources were checked; and a short How to for every
exercise (setup, two to four steps, key cues, what to avoid, how far where it matters) that
matches its demonstration and is checked against reliable sources.

**Delivered:**

- **72 of the 83 exercises show a demonstration of their own exact variation.** 57 are filmed
  clips: a short loop of the movement, silent, its end blended into its start so it plays on
  without a jump (24 from DVIDS, the U.S. military's public media hub, public domain; 24 from wger's
  exercise database, CC BY-SA 4.0; 9 from Wikimedia Commons: FitnessScape's clips, CC BY 3.0, the
  CDC's gym series, public domain, and the tutorials of Shim Eu-deum's channel, CC BY 3.0). 45 are
  cropped to the lifter; 3 show one camera's whole panel of a DVIDS split screen (the overhead
  press, the dumbbell row and the farmer carry); the CDC's chest press is cropped only of its
  film's black bars; and 8 keep the whole frame. 15 are loops of Everkinetic's licensed drawings
  of the start and the end of the movement (CC BY-SA 4.0), where no reusable film showed the exact
  variation clearly: Smith bench, cable fly, dumbbell fly, band fly, chin-up, straight-arm pulldown,
  dumbbell pullover, dumbbell shrug, reverse lunge, step-up, leg extension (the CDC's film of it,
  public domain, is 320 × 240 with talking and close-ups), leg press calf raise, reverse curl,
  cable pushdown and bench dip. Each clip was checked frame by frame against its exercise:
  equipment, position and path. Clips that showed a different variation were turned down (a
  45-degree incline bench for the 30-degree press, an assisted machine for the pull-up, a grip that
  could not be seen as underhand for the chin-up). FitnessScape's caption naming the exercise is
  cropped out of the pull-up and the leg raise; the bench press and the bent-over row keep it, as it
  sits over the lifter's area. No clip carried a channel logo.
- **11 keep a diagram of the movement,** each for a reason the licence register gives: band
  lateral raise, band pull-apart, chest-supported row, incline dumbbell curl, wrist curl, diamond
  push-up, dead bug, ab wheel rollout, cable crunch, Pallof press and, after the ninth review, the
  hack squat. Commons, wger, DVIDS and Everkinetic were each searched for every one, and the stock
  and exercise sites whose terms forbid reuse were ruled out (YouTube downloads, Pexels, Pixabay,
  MuscleWiki, ExerciseDB and others). Dead Bug's diagram lies on its back.
- **How to opens from the card** (its demonstration, or the How to button) as a sheet: the clip
  large, with Slow (half speed) and Pause, then Setup, Do it, Key cues, Avoid and, for 27 exercises,
  How far. The card stays as small as it was; why today's target is what it is moved to Options,
  beside the session's actions. Every How to was rewritten for someone who has never done the
  exercise and checked line by line against its sources (`docs/exercise-howto-sources.md`); seven
  were changed to match their demonstration (the cable fly's high pulleys, the band chest press's
  band wrapped across the back, the seated rear-delt fly, the pulldown with no thigh pad, the split
  squat's box and kettlebells, the inverted row in a Smith machine, the overhead cable extension's
  high pulley). Where a detail cannot change with the text, the demonstration says so under it,
  and the steps hold (a dumbbell row shown with a kettlebell, a hanging leg raise with straight
  legs, and the eight the ninth review found). The tempo chip's cue is now the exercise's first key
  cue, its first whole part when it is long.
- **Credit and terms:** under each demonstration its source and licence ("Video: Goulart, via wger ·
  CC BY-SA 4.0"), and "About this video" for the title, author, links and what was changed; DVIDS
  footage shows the notice DVIDS asks every user to show. Settings, About lists every credit.
  `docs/media-license-register.md` names each asset's original, author, licence and source, and why
  each of the eleven has none. The README and LICENSE say the demonstrations are not under the
  app's MIT licence, and `public/media/exercises/LICENSE.md` gives their licences beside them.
- **Phones and offline:** the 72 stills (0.75 MB in all) install with the app, so every
  demonstration shows offline at least as its first frame. A clip (15 to 169 kB, 65 kB on average;
  4.6 MB in all; kB and MB here are thousands and millions of bytes) is fetched the first time it
  plays and kept, so it plays offline after that; never played offline, the still stands in and
  says the video plays once online, and the clip is asked for again when the phone is back online.
  One that cannot load online says so, with Try again. A still that cannot load shows the movement's diagram, without the
  demonstration's credit. Every file is named by its content, so a clip corrected later reaches a
  phone that kept the old one. On the workout only the card of the exercise under way plays its
  clip, for five seconds, then its still; under reduced motion the card shows the still, and How
  to has Play.

**From the ninth review:**

- 24 of the 58 clips jumped where the loop started again: a handheld camera that had re-framed, or
  two different poses. Every clip was cut again so its last third of a second blends into its
  start, and the cut now fails any clip whose seam is more than twice its own largest normal step
  between frames (the worst is now 1.92). The band chest press and the hanging leg raise got new
  loops of one whole rep.
- The overhead press showed the bar end-on from the side, so it read as a dumbbell: it now uses the
  front camera. The Arnold press lost the dumbbells out of the top of the picture: it now uses the
  lower camera.
- The hack squat's clip showed a leg press on the hack machine: it was taken out, and the hack
  squat keeps a diagram.
- Eight demonstrations differed from their steps in a detail: a narrower grip (close-grip bench),
  handles starting at the shoulders (machine chest press), thighs to the chest (leg press), an arm
  a little above the shoulder (cable lateral raise), straight arms (pec deck), a forward lean with
  the hands low (cable fly), heels on a second bench (bench dip) and a deeper lowering (dumbbell
  pullover). A note under each says so, and the steps hold. Two steps changed instead: the
  straight-arm pulldown may stand tall, as its drawing does, and the lateral raise's stance follows
  its source.
- The diagrams said PLACEHOLDER, in the picture and under it: they are labelled as diagrams now.
  Dead Bug's diagram showed a plank; it has its own, lying on its back.
- A clip that failed while online said it would play once online: it now says it could not load.
  Under a diagram standing in for a still that failed, the demonstration's credit is not shown.
- Play under reduced motion dropped keyboard focus to the page: the button keeps it while the clip
  loads, then hands it to Pause.
- The card's clip looped for as long as the exercise ran, with no way to stop it (WCAG 2.2.2): it
  now moves for five seconds, then rests on its still; How to, a tap away, has Pause.
- A clip corrected later would never have reached a phone that had kept the old one, and the stills
  and the clips could disagree: every file is named by its content now. The phone's cache keeps up
  to 120 clips and drops the oldest past that; there is no age limit, so a replaced clip stays
  until then (the 57 clips fit well inside it).
- The README and LICENSE said MIT with no word on the demonstrations' own licences; they now do.
  The credit of Shim Eu-deum's clips names the channel as the Commons pages do. "Cropped to the
  lifter" and "one repetition" are said only where true.
- "Spotter" and "Rack the bar" are said in plain words, and a long tempo cue keeps its first whole
  part instead of stopping mid-sentence.
- Tests now hold twelve rules none held: the lifter's own steps, GIF and saved cues in How to, no
  clip fetched beside their own demonstration, a play the browser refuses, lazy row stills, a clip's
  state never shown for another, Key cues only where there are some, the credit's title, the cue's
  fallback to the first step, the DVIDS notice word for word, and each asset's licence and author
  against its register row.

**From the tenth review:**

- The blend at each loop's end stopped part-way: the last frame still held 9 to 35 % of the cut's
  final frame, which vanished as the loop began again, and in 21 of the 57 clips that was the
  biggest change in the loop. The blend is now made on whole frames and ends on the frame just
  before the first, so the step back to the start is the movement's own. Checked on every clip
  after encoding: the last frame is as true as a typical frame (at most 1.08 times its error; the
  blend's frames get twice the bits, as at the clip's own rate the encoder copied in part of the
  frame before, which still holds an eighth of the cut's end). At full resolution the wrap is
  still the loop's largest step in 14 of the 57 loops, by at most 1.4 times (2.4 for the plank,
  whose steps are under a luma level): the movement between those two frames, plus the encoder's
  noise starting afresh at the loop's first frame. No clip's camera shifts at the wrap.
- The hanging leg raise kept the orange bar of FitnessScape's caption at its right edge, blinking
  once a loop: cropped 20 pixels narrower, it is gone. The overhead press had a thin dark line down
  its right edge and the Arnold press one along its top, from the source's panels: both cropped
  away.
- In How to the diagram's loop and the lifter's own GIF or video could not be stopped, and on the
  card the lifter's own GIF moved for as long as the card showed, under reduced motion too (WCAG
  2.2.2). Everything that moves in How to now has Pause and starts paused under reduced motion, and
  the card's own GIF rests on its first frame after five seconds, as the clips do. A photo, which
  does not move, has no Pause.
- When Play under reduced motion could not load the clip, its button went and keyboard focus fell
  to the page. The button stays, as Try again, and keeps the focus; any clip that could not load
  offers Try again.
- A clip that could not load offline said it would play once online, but was asked for only once:
  it is now asked for again when the phone comes back online.
- The skull crusher still said "spotter": it says "a helper" now, and a test holds the plain words
  in every step.
- No test can play the clips themselves (the test browser has no H.264), so the checks run in
  the media cut, on every clip: the loop's last frame against what it should be, the wrap against
  the clip's own steps, and all four edges. Each was shown to catch the old files: a 14 to 27 %
  ghost in five of the old loops measured, the caption's bar in 53 of the old leg raise's 61
  frames, and the three edges below.

**From the re-check of those fixes:**

- Three clips kept a line from their source at an edge: the farmer carry and the dumbbell row a
  strip of the black divider between the source's camera panels down their left edge, and the
  CDC's chest press the film's black bars along its top and bottom. All three are framed off them
  now; the edge check flags three more edges, each the scene itself (a window frame, a rack's
  bars, window blinds).
- A moving WebP with a colour profile, an AVIF sequence and an SVG were taken for photos: no Pause
  in How to, and on the card the GIF never rested. A picture is now taken to move unless it is a
  photo format (JPEG, BMP) or its file says it holds one picture.
- Back online, the automatic retry took the Try again button away, and with it the keyboard focus;
  the button now stays through the retry, and the focus passes to Pause when the clip comes, if
  the button still holds it.
- A second re-check: a GIF was judged by its control extensions, which a frame need not have, and
  by the type it was given, so a moving GIF named .jpg (or a moving WebP named .png) was taken for
  a photo. A picture is now judged by its own bytes, a GIF by its frames.
- A first frame's still was freed on Play while still needed, so the next Pause showed a broken
  picture for a moment; it is kept until a still of another picture takes its place or the view
  closes.
- A focus hand-over outlived the lifter moving on: a clip that came later took the focus and
  scrolled the sheet back up. It is dropped when the focus leaves the button, and Pause takes the
  focus without scrolling. A third re-check found it still armed by a press in Safari (every iOS
  browser) and Firefox on a Mac, which press a button without focusing it, so no blur came: a
  press now hands the focus on only when the button held it.

## 8. The plates drawn on the bar, with Today and Default

The owner: show the plates as a stack on the bar, sizes easy to tell apart and each weight printed
on its plate, the total and the bar as a line under it, from the bar and the plates actually there,
the same wherever plates are worked out; and replace Edit rack / Done with Today and Default
always in view. On the first build they asked for a truer drawing (Changed after review).

**Delivered:**

- **One end of the bar, as it is loaded.** The sleeve on the left with the plates on it, the
  collar, then the knurled bar with its own weight printed on it ("45 lb", "20 kg"). Each plate is
  drawn edge-on in proportion to a real one: its height is the plate's diameter and its width its
  thickness, so the 45 lb plate is the biggest and the 10 lb plate tall and thin (17.7 and 10.3
  inches across). The small change plates are drawn thicker than they are, so their weight fits
  on them: the 2.5 lb plate is drawn thicker than the 5 and the 10, and the 1.25 kg as thick as
  the 20 kg. Each is shaded across its thickness and coloured by its weight (in pounds 45
  blue, 35 yellow, 25 green, 10 white, 5 red, 2.5 grey; in kilograms the competition colours), with
  its weight on its face. The heaviest plate sits against the collar and the change plates
  outermost, packed with little bare sleeve. Under it, the sum: "185 lb = 45 lb bar + 70 lb of
  plates each side". It is worked out from the exercise's bar (45 lb or 20 kg for a barbell, as
  before) and the plates the place keeps, less any missing today, and redraws the moment either
  changes. A weight these plates cannot make shows the nearest load under it and says so; the
  empty bar is drawn bare. When a side's plates would not fit on the sleeve, each size is drawn
  once with its count beside it ("×18"); the drawing measures the room its sleeve has, so on a
  narrow phone or in a wide font it does so sooner.
- **The same drawing in small under the set logger:** the sleeve, the plates and the collar, then
  "each side", in place of the line of text.
- **Today and Default,** always in view at the top of the plates, the one in use filled. Today is
  this workout only: tap a plate you cannot find ("No 2.5 today: the bar moves by 10 lb. Back next
  workout."). Default is the plates the place keeps, saved for it at once, with All plates to put
  every plate back. There is no Done: each tap applies at once. The plates to tap are plain
  numbered buttons on one row at 360 to 412 px (six in pounds, seven in kilograms, each 44 px
  tall), outlined, and struck through when off.

**Changed after review:** the owner's notes on the first build: the bar looked flat, the plates
like boxes, the 10 lb plate short and bulky, and the buttons were loud small plates that wrapped
to two rows. Redrawn against their reference picture: a narrow bar with a sleeve, a collar and
shading; plates in real proportions (the change plates widened for their weight) with the weight
on the face; the bar's own weight on the bar;
the heaviest plate against the collar; plain buttons on one row. Captured at 360 and 412 px and
compared with the reference before the review below.

**From the ninth review:**

- After a plate change moved the target, both drawings could still show the weight the dial had
  been turned to before it. With 165 turned on the dial over a target of 160, a 2.5 missing today
  took the target to 155 and the logger to 155, while the plates stayed those for 165. The weight
  turned on the dial now belongs to the logger it was turned on, so a new target starts both
  drawings from the logger's own value.
- A long side's count was printed over a short plate's weight. It now sits beside the plate.
- "1.25" ran past its plate at 360 px. Every plate is now wide enough for its weight, the small
  drawing's included, and none is shorter than its weight.
- With every plate missing today the note still said the bar moves by 5 lb. It now says "No plates
  today: the bar stays empty. Back next workout."
- Tests the review asked for: All plates offered in Default only, the buttons held while a tap
  saves, and the panel's notes for dumbbells, machines on their own and machines in a superset.

**From the tenth review:**

- The owner's first point could still happen: with 165 turned on the dial over a target of 160, a
  2.5 missing today took the target to 155, and finding it again took it back to 160, but both
  drawings showed 165 again while the logger showed 160. A logger that starts again now says its
  own value at once.
- "1.25" ran past its button at 360 px in a wide font, as the Linux test runner's is: a plate
  button is never narrower than its weight now, and the plates' browser test runs in a wide font.
- At 360 px the collar was drawn over the plate against it on the heaviest loads (540 to 625 lb,
  287.5 to 335 kg), half hiding its weight. The drawing measures the room its sleeve has and draws
  such a side once per size with its count; the browser test loads 625 lb and 335 kg at 360 and
  412 px and checks the collar stands clear.
- A number and its unit no longer part at a line's end in the caption ("157.5 / kg").

**From the re-check of those fixes:**

- Where the plates cannot make a weight, the caption's first part still split a number from its
  unit ("not 157.5 / lb", at 412 px in any font): plate math now writes every number with its unit
  kept together.
- Opening the Plates panel at 625 lb at 360 px drew one frame with the collar over the plates,
  before the drawing had measured its room: it now measures before it is painted.

## The gym barcode stays saved (persistence)

The owner, on 2026-10-02: the saved gym barcode does not stay saved and has to be added again
before workouts, though the app says nothing is waiting. Fix it where the data is kept, check
whether other settings share the path, account for the storage loss on the phone, and say what
the cloud copy and a restore cover.

**What was found.** The barcode was kept in one place: the phone's database (IndexedDB), never in
the cloud copy or a backup (Maintenance 18). Closing and reopening the app, a refresh, offline use
and an update all keep that database; a test that saves a barcode and opens the app again on a
fresh store and connection reads it back from the database, as it always did. What loses it is
the browser clearing the database. Chrome on Android does that to a site that has not asked to
keep its storage when the phone runs short of space, and it keeps the site's local storage: on
the owner's phone it cleared both this app's database and Life Mirror's. The app then healed the
token from its second copy, pulled everything from the cloud copy and showed "0 changes waiting",
which was true of the cloud copy. The barcode had no second copy, so it was gone. The app had
never asked the browser to keep its storage, except from a button in Settings.

**Delivered:**

- **The barcode is kept twice on the phone:** in the database and in local storage, which a
  clearing keeps. Each copy heals the other when the app opens, and a barcode the database lost
  comes back from local storage at its place, picture, code, switch and dates as they were. Local
  storage is small and shared by every app on bill6006.github.io, so a big picture is kept there
  as a smaller copy (at most 200,000 characters, about 150 KB of picture); where none can be made
  (a picture the phone cannot shrink, or the pictures' budget there already spent), the code read
  from the picture, which draws the barcode for the desk. It still never goes to the cloud copy or a
  backup. Removing a barcode, or deleting its place, removes both copies.
- **The app asks to keep its storage** each time it opens; an installed app is usually granted it
  without a prompt. Settings, Storage shows whether it is kept, and its button stays.
- **The cloud card says what the copy does not hold:** "Not in the copy: Gym barcode, with a
  second copy on this phone" (or "on this phone once" when it has none: a big picture with no
  code read that could not be shrunk, or no room left for it), and your own demonstrations, "in
  backups you export". "0 changes waiting"
  now means the phone and the cloud copy agree (below).
- **"Bringing your data back"** shows in place of setup on a phone with a cloud copy and an empty
  database, until its first walk of the copy is done. Offline, with a copy that cannot be
  reached, or after 20 s, it offers to set up anyway, and says that what is set up then is
  replaced by the cloud copy's records once it is reached.

**Other settings on the same path.** Profile settings, places with their equipment, loading and
plates, workouts, entered maxes, the coach's state, notes and cues, custom exercises and saved
workouts are in the cloud copy and in exported backups, and came back. The sound and notification
switches, the workout under way and the device's id are in local storage, which a clearing keeps.
The database address for a database of one's own lived only in the database; it now has a second
copy beside the token's. Your own demonstrations and the automatic backups are in the database
only (the demonstrations also travel in exported backups); the request to keep storage protects
them, and the cloud card names the demonstrations. Tracing the path found six more faults in what
happens after a clearing, all fixed with tests:

- A save made before the first pull after a clearing pushed on its own, before anything was
  pulled. Every sync now pulls first while the phone has never finished a pull, and a sync whose
  pull fails pushes nothing.
- A cleared phone keeps its device id, so the cloud copy's rows came back as its own, and the pull
  kept any record the phone held. Setup's defaults, saved before or during the pull, would then
  have been pushed over the owner's real profile and places (and a place setup left out deleted
  from the copy). The phone now records when its database was made; until its first walk since
  then is done, a row it wrote before that comes back over a record made since, including one
  made while the walk ran, and setup waits for the walk (above).
- A write the cloud copy refused, because it held a newer version, was taken off the queue as if
  sent, so the two disagreed while the card said nothing was waiting. The phone now takes the
  cloud's version, unless a change made here since waits to go, and keeps the change waiting
  while the cloud's version cannot be fetched.
- A restore queued a deletion, stamped with the current time, for every record the backup lacked,
  so restoring an older backup deleted later workouts from the cloud copy. A restore now never
  cuts the cloud copy back: the next sync brings back what the backup lacks and anything changed
  since, and the preview says so.
- A reload under way while a barcode was saved could take it off the screen until the next open.
- A write that failed while the app opened (a full disk) stopped it opening. And a healed token
  kept the cloud row at "Needs a look" for good; it settles once a sync has finished after it,
  and the Storage card's log keeps it.

Life Mirror's repair was checked against this app rather than copied: its ids here are text, not
counters, so no id floors are needed, and no store has a unique index for a pull to collide with.
The one twin hazard here, records with fixed ids such as the profile and Home and Gym, is the one
the database's birth date and the wait for the first walk now settle.

**From the tenth review** (an independent review that tried to lose, duplicate or split data
through every changed path; each fix has a test that fails without it):

- A barcode whose write back failed while the app opened (a full disk) was dropped from its
  second copy as well. It now stays there and shows, and the next open writes it back.
- Setup finished while the first pull was under way was pushed over the cloud's profile, and
  deleted from the copy a place it left out. Setup now waits for the walk, and a record made while
  a walk runs gives way to the walk's at its end.
- A write the cloud refused was dropped from the queue before the cloud's version was fetched; a
  failed fetch left the two apart for good. And a save made during that fetch was overwritten by
  the cloud's version. Both fixed, with each queued change now stamped so that two
  changes in the same millisecond are never taken for one.
- A restore made while a sync ran lost the whole walk it asked for, when the sync wrote its old
  place in the walk back. A restart now stands.
- Two windows open at once (the installed app and a browser tab): one opened before the other's
  change could bring a removed barcode back, or drop a new one, from the second copy. Each change
  now touches only its own barcode's entry.
- A big picture with no code read had no usable second copy while the card said it had one, and
  its smaller copy was thrown away at every open. The card now says when a barcode is kept once,
  and the smaller copy is kept against the database's barcode.
- Switching to another database and back woke the cleared-phone rule again and threw away changes
  made meanwhile. The rule now ends at the first walk, for good.
- A restore that failed and rolled back lost a deletion that was waiting to go, and the deleted
  record came back. The rollback now puts the waiting changes back exactly.
- Setup run again left the barcode of a place it removed, on the phone and in its second copy; a
  removal whose second copy could not be removed could come back. Both fixed.

**From the re-check of those fixes** (each fix taken out alone, to see a test fail; two did not,
and what they guarded was not yet safe):

- A big barcode picture saved while the app reloaded its data in the background (as it does after
  a sync brings changes) was taken for one the database had lost, and the second copy's stand-in,
  the code alone, was written over it: the picture was gone. A barcode removed during that reload
  could be written back into the second copy and return at the next clearing.
- Barcode changes and the reload's care of the second copy now take turns, and the reload reads
  the database itself rather than its earlier read. Across the installed app and a browser tab
  they take turns too, where the browser has Web Locks (Chrome does); where it has none, or
  refuses the lock, each window still keeps its own changes in order.
- An independent re-check of these fixes found that a change made from a window's out-of-date
  list could still overwrite newer data. In a window opened before a new picture was saved, the
  pop-up switch put the old picture back; in one opened before a removal, it brought the barcode
  back; turned while a Replace was being saved, it undid the Replace. A save there turned back on
  a switch another window had turned off, and deleting a place there left a barcode another
  window had saved. Each change now reads the barcode as stored, inside the lock; the switch is
  held while a change is being saved; deleting a place removes its barcode whether or not the
  window shows one.
- Turning the switch before a big picture's smaller copy was made left no usable second copy until
  the next open: the switch now makes it again. A test now holds the reload at its last read of
  the database, so taking the lock out fails it.
- A second re-check found more of the same kind. Deleting a place whose barcode could not be
  removed deleted the place and kept the barcode, with nothing left that could remove it; a
  window opened before another deleted a place could still save a barcode for it; and a switch
  turn that found nothing to change left the cloud card's line on the second copy as it was. A
  place and its barcode now go together under the barcode lock, the barcode first, so a refusal
  keeps both and Delete (or setup run again) is a real retry; a save checks that its place is
  still there; the catch-up brings the card's line along. The switch is held, not disabled,
  while a change is saved, so it keeps the keyboard focus through its own turn.
- A third re-check found the worst of them. Setup finished during the first walk after a clearing
  ("Set up anyway") deleted, with its place, the barcode of any place the walk had already brought
  back and setup did not list (any custom place; the Gym too with gym access off): the walk
  brought the place back, but never the barcode. Until that walk is done, setup now removes no
  place and no barcode.
- A fourth re-check found the same loss just after the walk: the wait ended a moment before the
  reload showed what came back, so setup flashed on screen, and a tap there ("Use defaults")
  deleted the places the walk had brought back, with their barcodes, and wrote setup's profile
  over the cloud copy's. The reload now ends the wait in the same step as it shows what came
  back. And setup no longer deletes places it never listed: it removes only what its own steps
  can remove, the Gym when gym access is switched off, and only a Gym the screen showed (a draft
  saved earlier, or the restore's moment, can no longer take a custom place). It never writes
  over a profile that came back while it was open; it shows that one instead.
- A fifth re-check found the paths around those. Setup that found the profile back kept its draft,
  and Run setup again later resumed it, and wrote the discarded answers over the restored data. A
  walk could end without the screen reloading: when the token was saved while it ran, when its
  push failed afterwards, or in another window; setup then showed over a phone whose data was
  back, and an edit there wrote over the cloud copy. A walk could end in the middle of setup, and
  deleting a place while the first walk was pending lost its barcode. Now setup runs in turn with
  the syncs, a first setup never writes over a profile already on the phone (and drops its
  draft), a draft is resumed only while the profile and places are as it began from, every window
  reloads at its next sync once a walk has ended since it last read the disk (and what a walk
  applied counts though a later step fails), and no place can be deleted until the first walk is
  done. So that setup never waits forever on a copy that does not answer, each request to the
  copy now gives up after 30 seconds (a push sent again changes nothing; a walk cut short keeps
  what it applied, and the screen shows it).
- A sixth re-check found setup run again, still open when the walk ended, writing the wizard's
  answers over what the walk had just brought back, in the cloud copy too, and saying it had
  saved. Setup now writes only over the data it began from: when the profile or a place has
  changed since it opened (the walk, or another window), Finish changes nothing, drops its draft,
  shows what is saved and says so. It found three smaller ones. In Settings, a deletion refused
  while the walk is pending blocked every later edit: the other changes are now saved first, and
  the place shows again. A window whose reload straddled another window's walk end never reloaded:
  the walk a screen shows is now read before its records. And a walk cut off part-way reported
  nothing applied, so the screen did not reload: what it applied now counts.
- A seventh re-check found the 30 seconds too short for a slow but working connection: a page of
  history that took longer failed every time, so a cleared phone's walk never ended and nothing
  was sent (fixed as the eighth re-check, below, settled it). Taps on Try again no longer queue a
  sync each for setup to wait through: a
  request made while another sync waits its turn joins it. In Settings, saving the profile before
  a deletion that was refused had moved the current place off a place still kept: deletions now
  come first, and when one is refused nothing else in that edit is saved; while a save runs, the
  screen shows the edit being saved, not the store half-way through it, and a toast says what was
  not saved when Settings was left meanwhile. A full disk could lose the count of what a walk
  applied, and setup left on screen after "changed while setup was open" (a profile this build
  cannot read) refused every Finish after: both fixed. Setup's answers are held while Finish
  saves, and making the connection to the copy is bounded like its requests.
- An eighth re-check found the seventh's first answer to a slow connection unsafe. That answer
  made the next attempt ask for less after a request ran out of time, and pages that small could
  stop a long walk at the pages' limit as if it were done, so setup's defaults went over the
  cloud copy; and a stall that had nothing to do with size shrank the pages for good. Pages and
  batches now keep their size: a sync's first request keeps the 30 seconds, so a copy that never
  answers still fails quickly, and once the copy has answered each page or batch may take five
  minutes. A walk that has not reached its end is never taken as done. It also found two Settings
  saves at once losing both edits while the screen said saved (saves now run one at a time), and
  setup left on screen after "changed while setup was open" starting from default places, which
  Finish then saved over the stored ones (it keeps the stored places now). The refusal's words no
  longer say "it" once Settings has closed.
- A ninth re-check found "Use defaults and skip setup" still saving the default places over the
  stored ones after "changed while setup was open": every way setup starts without a readable
  profile now starts from the places stored, a first setup included. It found the browser tests'
  stand-in no longer telling a deletion from a change after the deletion fix below (it now reads
  the row the way the live table does, and refuses what it refuses), a deletion stamped with the
  time it was sent rather than made, so one made offline could beat a later change on another
  device (it now carries the time it was made), and Sync now offline without the driver showing
  the driver's error rather than "offline".
- A tenth re-check found a first setup with no readable profile still writing its places over
  places that came back while it was open (with a profile this build cannot read): what setup
  starts from now counts the places stored even with no profile, so Finish says the data changed
  and starts again from them, and a draft saved before they came is not resumed. A record with no
  time of its own (a deload week, the coach's focus) went as of when it was sent, so after the
  deletion fix it could lose to a change made before it on another device: it now goes as of when
  it was made.
- An eleventh re-check found a first setup whose save failed part-way (an age typo, or a full
  disk) refusing the next Finish as if another had changed the data, and dropping the answers:
  setup wrote the places before the profile failed. Setup now checks everything it writes before
  its first write, the units step checks the age in words (13 to 100), and a save still cut off
  part-way starts setup from what it wrote, so Finish again goes through and a reopened setup
  resumes its answers.
- A twelfth re-check found that start taken from a fresh read of the disk, so a place another
  window wrote in that moment counted as setup's own, and Finish again could delete a Gym the
  wizard never showed; and a setup reopened without a reload not resuming. Setup now starts again
  from its own writes only (a place another window changed still makes Finish refuse; a profile
  changed in that moment is taken as setup's own, as in any Finish), and the screen shows the
  disk as the cut-off left it.
- A thirteenth re-check found a place whose write landed though its check failed not counted as
  setup's own, so Finish again refused and dropped the answers, and Use defaults after a cut-off
  keeping the Home setup had written and never making the Gym. Setup now takes the disk as its own
  when every place there is as it began or as setup meant to write it; Use defaults keeps the
  places the run began from; and the refusal no longer says setup changed nothing, since a cut-off
  run's writes stay.
- A fourteenth re-check found the cut-off's refresh of the profile shown leaving the plan unbuilt
  on Finish again and ending a first setup under an error, and three parts with no test of their
  own: the refresh now shows the places only, and each part is held by a test. A fifteenth
  re-check found that change held by no test of its own: two tests now hold it.
- **Deletions and the cloud copy (the owner's decision, 2026-10-03).** Life Mirror's session found
  that the cloud copy's table refuses a row with no body, and refuses a whole batch of changes
  when one row in it is refused: its own uploads stopped for about ten hours on 2026-10-02, and a
  clearing of the phone then lost what was waiting. This app sent each deletion with no body, in
  batches of up to 50, so its first queued deletion would have held back every upload after it,
  on every attempt. A deletion now carries an empty body, `'{}'`, which every reader (this app's
  and Life Mirror's) skips as a deletion. The test stand-in now refuses what the live table
  refuses, one refused row refusing its whole batch, and a test shows the old deletion refused
  there.

**Verified:** saving, then opening the app again on a fresh store and connection, with and
without local storage; the database cleared and local storage kept, with and without the cloud
copy; a big picture, with and without a smaller copy; removal and a deleted place staying gone;
the reload races; a cleared phone set up offline, and one whose first pull fails; a restore with
the cloud copy on; and, in Chromium, a second browser context made from the first one's local
storage alone, which brings the barcode back at Start and the places from a stand-in cloud copy.
Each fix has a test that fails when it alone is taken out (PBa to PBz, and PBz1 in the browser).

## Found while building

- **The longer rest in a pair.** The first version of the fix tied the offer to the rest after the
  lift's own set; in a pair the rest before the lift's next set follows its partner's, so the offer
  would have gone from every pair. Fixed before review, with a test.
- **One rule for the stand-in load.** Judging a push from the load before rounding everywhere at the
  heaviest weight changed what Maintenance 23's sets stand in for, and a lift under way came out
  differently when fitted again; the rule was narrowed to the one case the rounding hid.
- **A test that read the wall clock.** The coach's kept-swap test failed once the calendar passed
  four weeks after its fixed day: the coach reads the minute clock, and the swap had run out. Its
  clock is pinned to the test's day now, as the coach's rest test already was.

## Review

Independent reviews, in passes until one finds nothing new. Every finding was checked against the
code before it was fixed, and each fix has a test that fails when that fix alone is taken out
(the revert run below).

- **First pass, four reviews** (the Settings, Plan and Progress layout; the installed app's
  updates; a re-check of 36 to 39; the whole round): 42 findings. The ones that mattered most:
  Reload that did not load the new build once the plugin had stopped listening (the owner's
  symptom); a link to a Settings row that opened it off screen; the coach's "Export a backup"
  landing on a closed list; the cloud copy asking for a look while only offline; the pair's
  second lift never offered the longer rest; a busy move lost to a swap; a max credited with a
  move it did not make; Progress reading a set as a different max from the max sheet's.
- **Second pass, three reviews** of those fixes: 19 findings. The ones that mattered most: a
  check-in pulling a lift under way from the lifter after the lift it gave way to was skipped; an
  old page left on the old build after another page of the app took the release; a first Reload
  tap doing nothing on a page no worker runs; a sheet left invisible, still holding the page's
  scroll, when its row was closed behind it; the lift sheet on Progress still reading sessions the
  old way.
- **Third pass, three reviews** of those fixes: 12 findings. The ones that mattered most: a
  release put off after another page let it in, never offered again (the page stayed on the old
  build); a setup link's failure replaced by the old database's status; keyboard focus sent to
  the top of the page when a sheet closed; a second busy lift putting the first back in front; a
  check-in putting a lift moved between its sets back in front; the lift sheet counting ten
  sessions beside eight lines; the report claiming the browser tests held fixes that only unit
  tests held. Their notes, fixed too: a pull-up's added weight shown as its max, a carry's best
  set never lifted, one rarely done lift marking every estimate low, two sheets closed together
  locking the page, a recovery label past its column in a wide font.
- **Fourth pass, three reviews** of those fixes: 10 findings. The ones that mattered most: a pair
  waiting on a lift not passed over, so two busy rows still swapped with each tap; a lift swapped
  in under a busy lift's old name taken for it, so its move was lost; a check-in short on time
  measuring against the old length; a best with no max named by two different rules; a release
  never offered on a first visit after its first install failed. Three checks in the sheet's
  focus return (still on the page, not disabled, laid out) were found to do nothing in a browser
  (Chromium refuses focus to a button gone, disabled or hidden, as a probe showed), so they were
  taken out rather than tested.
- **Fifth pass, two reviews** of those fixes: 9 findings. The ones that mattered most: two lifts
  each waiting on the other after a busy tap; a finished lift still holding the row behind it; two
  alike rebuilds giving two orders; a lift waiting on itself; a return after a pause dropping its
  warm-up from the time; the revert run crediting a browser test with a fix it no longer held; a
  hard reload in a desktop browser offered the build it already ran. The fifth reviewer's
  random-action tester was then run on those fixes over 3,000 sessions (43,911 actions, 19,150
  busy taps). It found three more, fixed and tested (in section 37).
- **Sixth pass, one review** of those fixes: 8 findings. Five were Equipment busy bugs in rare
  combinations, one of them (and part of another) a regression from the fifth pass (a busy tap on
  another lift sent the lift under way to the end); the others were a return's warm-up left out of
  the time at the next small change (in Known limits), a sheet's focus fix that no test held (a test
  holds it now), and four lines of this report. The reviewer widened the tester to 6,000 sessions
  and to every action (a set undone, sets logged out of order, a set added to a finished lift, a
  technique switched, a pair split, an end time), and it showed the fifth pass's "finds none" held
  only for its first 3,000 sessions. Rather than patch each case, the busy moves now follow one
  rule, one order of the rows (in section 37), which also fixed a move lost to a move by hand that
  the widened tester found.
- **Seventh pass, two reviews** of those fixes, one trying to break the new order and one checking
  each fix's test and this report against the code: 3 bugs, a gap in the tests and the tester
  numbers. A rebuild could leave a lift at the target set for the plan's own order once other lifts
  stood before it in the same place (a regression from the sixth pass; the testers ran with no
  history, so no target could show it). Equipment busy on a lift swapped in for a sore joint forgot
  the busy lift's old name (older). After a set of a lift stopped earlier was undone, a tap could
  name that lift and move nothing; taking out the old move step, which the complete revert run had
  shown did nothing else, had made that worse. Six of the sixth pass's rules had no test of their
  own; each has one now.
- **Eighth pass, two reviews** of those fixes, the same two ways: one bug, a regression from the
  seventh pass. Equipment busy took the move of another lift that knew the tapped lift by an old
  name, so after a busy lift was swapped out and back and a rebuild brought the lift swapped in back
  as its own pick, a tap on that pick moved nothing, or moved the other lift too (25 of the 30 such
  flows the reviewer built; 6 of 6,000 tester sessions reached that state). Two of the seventh
  pass's rules (the fallback's first and next rows) and one of its guards had no test of their own;
  each has one now, and three lines of this report were wrong. The numbers below are from the code
  with all of that fixed.

Both testers were then run on the final code. The fifth reviewer's, over 6,000 sessions (87,954
actions, 38,262 busy taps): no lift waiting on itself or on a lift waiting on it, no move lost, no
finished lift holding a row, no tap where the button and the engine disagree; what it still finds
(12 times) is the pairing limit in Known limits. The sixth reviewer's, over 6,000 sessions (105,878
actions, 39,801 busy taps), now with a check that every busy tap the engine takes changes the order,
reports 91 cases, each a Known limit or as it should be: the pairing limit (25; seed 7723 among
them, where a check-in's pairing made the loop), moves ended because the lifter is on that lift or
another of its row (5) or because the moves made a loop (5), the names limit (one move), the
undone-set limit (34: a lift left ahead of one it waits on, or two moves asking opposite orders,
until a change sets the order) and 21 taps the engine refused after a set of a lift stopped earlier
today was undone (the older Undo item in Found in passing). In sessions with no Undo only the
pairing limit, those endings and the names limit remain. No busy tap moves nothing in these runs (58
before the seventh pass; the eighth review's own flows found one more way, fixed), and no move ends
because the lifter is back on a stopped lift (19 before the seventh pass).

**Items 7 and 8 and the barcode** came later in the round and were reviewed the same way:

- **Ninth pass, two reviews** of items 7 and 8 as first built. Their findings are in those
  sections, "From the ninth review": among them loops that jumped where they began again,
  demonstrations that differed from their steps, the card's motion with no way to stop it, and the
  plates still showing a weight turned before a plate change moved the target.
- **Tenth pass, two reviews.** One tried to lose, duplicate or split data through every changed
  path of the barcode and the cloud copy: 13 findings, in the persistence section. One checked the
  ninth pass's fixes to items 7 and 8: 9 findings and some wording, in those sections.
- **The revert run of those fixes** found two whose tests still passed with the fix taken out;
  each guarded a race not yet closed (the barcode lock, in the persistence section).
- **Three re-checks**, each of the fixes before it: 9 findings; then 6 and a wording; then 3 and a
  wording, the worst of them setup finished during the first walk after a clearing deleting a
  barcode that the walk could not bring back. Each is in its section, "From the re-check of those
  fixes".
- **A fourth re-check** of those fixes found the same loss again just after the walk, and two
  smaller ones (fixed, in the persistence section), and wording; its other finding is in Known
  limits.
- **A fifth re-check** found four more ways around them (a resumed draft, a walk ending without a
  reload, setup overlapping a walk's end, a place deleted mid-walk) and wording: fixed, in the
  persistence section and Known limits.
- **A sixth re-check** found setup run again, open across the walk's end, writing over what the
  walk had brought back; Finish waiting on a copy that never answered; and three smaller ones: all
  fixed, in the persistence section, with wording. A place sheet left open across the walk's end,
  older than this round, is in Known limits. It left three observations unprobed: a second window
  saving from an older view (in Known limits), a deletion let through while the walk is pending in
  a window that has no token when another has one, and setup in one window against a walk in
  another. A fourth, records taken back from a refused push going uncounted when a later batch
  fails, is closed by the same fix as the walk cut off part-way.
- **A seventh re-check** found the 30-second bound failing a slow but working connection for good,
  Settings moving the current place off a place whose deletion was refused, Finish waiting
  through every sync queued before it, a full disk losing a walk's count, and setup left on
  screen refusing every Finish: all fixed, in the persistence section, with wording. Older than
  this round and in Known limits: connecting a different database has no time limit.
- **An eighth re-check** found the seventh's smaller pages able to cut a long walk short as if done
  (setup's defaults then went over the copy) and to shrink for good after any stall, two Settings
  saves at once losing both edits, and setup left on screen saving default places over the
  stored ones: fixed, in the persistence section, by a longer bound for a sync's later requests
  in place of smaller pages, saves one at a time and setup keeping the stored places. A record
  skipped when two share a sync time and an id, older and in Proposed, was seen in SQLite.
- **A ninth re-check** found Use defaults saving default places after "changed while setup was
  open", the browser tests' stand-in misreading the new deletion, a deletion stamped with the time
  it was sent, and Sync now offline showing the driver's error: fixed, in the persistence section.
  Settings reopened during a save from before is in Known limits.
- **A tenth re-check** found a first setup with no readable profile writing over places that came
  back while it was open, and a record with no time of its own going as of when it was sent:
  fixed, in the persistence section. Setup over a bare Home with no Gym asking for equipment is in
  Known limits.
- **An eleventh re-check** found a first setup whose save failed part-way refusing the next Finish
  and dropping its answers, an age setup never checked, and two comments: fixed, in the persistence
  section. Records holding several entries, one row each, are in Known limits.
- **A twelfth re-check** found a cut-off setup taking another window's place for its own, a setup
  reopened without a reload not resuming, and three parts with no test of their own: fixed, in the
  persistence section, each now held by a test. Two answers setup never checks, older, are in
  Found in passing.
- **A thirteenth re-check** found a write that landed though its check failed not counted as
  setup's own, Use defaults after a cut-off never making the Gym, and wording: fixed, in the
  persistence section. A stale plan after a cut-off in the rebuild, and Use defaults after a
  reload, are in Known limits.
- **A fourteenth re-check** found the cut-off's profile refresh leaving the plan unbuilt and a
  first setup ending under an error, and three parts with no test: fixed, in the persistence
  section. Two rarer cut-off cases are in Known limits; an older one found in passing (Run setup
  again not rebuilding the plan for Home's equipment) is in Found in passing and Proposed.
- **A fifteenth re-check** found the fourteenth's change held by no test (two tests now hold it)
  and two rarer cut-off cases, documented in Known limits. It found nothing else, and no product
  code changed after it.

Each fix is in the item's section above, marked "From the review", "From the second review",
"From the third review", "From the fourth", "From the fifth", "From the sixth", "From the
seventh" or "From the eighth".
Checked and found sound along the way, among others: no horizontal overflow at 360 px with every
row open; headings, keyboard use and contrast of the rows (axe: no violations); the update checks'
cost (one uncached 6 KB request) and their silence while hidden or offline; a reload mid-workout
keeping the logged sets, the timers and the history; every PMID in the research notes against
PubMed; the privacy scan over every file to be committed.

## Known limits

- **A new place lets a busy move go.** The equipment was busy at the place left behind, so a change
  of place plans the order afresh; any other rebuild keeps the lift behind what it gave way to.
- **The engine's own lines read the log as its rules do,** reps counted to twelve: after sets past
  twelve reps, a line such as "back at 80% of the estimated max" can name a lower max than Progress
  and the max sheet, which count to thirty. The rules' reading was kept in item 36; Proposed below.
- **A cloud copy question in a closed row.** A save that finds a database already holding someone
  else's history asks before going on; asked after its row was closed, the question waits in the
  row until it is opened.
- **A pair moves as a pair,** even when only one of its moves needs the busy equipment.
- **Past thirty reps nothing more is asked.** At the heaviest pair the reps stop at thirty, so a max
  far above what the pair makes gives 26-30 reps whatever it is, and the line says so.
- **The target moves in the place's weight steps.** Two entries whose estimates round to the same
  load give the same target: on the dumbbell bench at 20 lb, recent sets of 20 × 20 and 20 × 25
  both ask 25 lb and both plan 13-15 reps; on the incline one more rep can move the reps by several
  where the estimate crosses a step (20 × 21 gives 8-12, 20 × 22 gives 16-20).
- **Hard sets at light dumbbells take time.** A strength lift run to its effort at a light place
  fills minutes the old easy sets did not: short sessions there keep fewer moves, and a 15-minute
  rebuild of a session begun with the main lift pinned or under way can run over, and says so.
- **A recent set is read as taken to failure.** One that was not reads as weaker than it was: the
  first target runs light until the first logged set takes over.
- **The fitting steps keep the fit's order.** A set trimmed can be given back later, or its lift
  left out, and both steps are said; a circuit's line names the rounds it started with.
- **The app finds a release when it looks.** It looks on coming back to the front, on reconnecting
  and hourly; a release deployed while the app stays in front with no network is found once it
  comes back online. The offer still waits for a tap on Reload.
- **Reload is per release, not per page.** With the app open twice (the installed app and a browser
  tab), Reload on one lets the release in for both. A page opened under the old worker where the
  plugin made the offer loads again by itself, as the plugin does, and any other page opened under
  it is offered the reload at once; a page no worker runs yet is offered it when it next comes
  back.
- **A page left on the old build** under the new worker runs until it loads again, offered the
  reload each time it comes back. The old build's barcode drawing leaves the worker's cache, so a
  gym barcode it has not drawn yet may show its photo instead (not seen failing: the browser's own
  cache still held it).
- **Offline after a failed sync.** Once a sync has failed, going offline keeps "Needs a look" until
  the next try (up to 15 minutes), which then reads the wait.
- **A busy lift waits on names.** A lift swapped in for the one it gave way to is waited on, by its
  name. Only a swap changes a name, so a lift a rebuild picks under a busy lift's old name is taken
  for it and held behind what the busy lift gave way to, and one a rebuild puts in the busy lift's
  place is not held. It is easy to reach: a busy lift swapped for one a shorter plan left out, then
  the full length again (the eighth review); it can make a loop and end a move (once in 6,000 random
  sessions). Equipment busy on such a lift moves that lift alone.
- **A busy tap can bring a third row first.** When the row the lift goes behind holds a lift moved
  earlier for busy equipment whose lifts given way to have since left the plan, that lift now leads,
  so it waits again behind the next row (its equipment may still be taken), and that row comes
  first; the headline names only the lift tapped. (From the eighth review: 56 of 6,000 random
  sessions.)
- **A rebuild can pair against a move.** A rebuild that pairs the busy lift with one lift of the
  row it gave way to lets it run ahead of the other lift of that row. One that pairs lifts whose
  moves then ask for a loop ends the moves holding back the loop's earliest row, so a lift can come
  up before one it gave way to. The same change made again can then give another order. A change
  that parts such a pair without setting the order (a skip, or a swap for comfort or a sore joint)
  leaves it until the next change that does.
- **An undone set moves no row.** Undo takes the set away, and a busy lift's wait on that lift
  comes back, but the order stays: the busy lift can stand in front of the lift it gave way to
  until a change that sets the order (Equipment busy, a swap by hand, a pair split, or a rebuild: a
  new length, harder or easier, a technique switched, an end time, a return after a pause, or a
  check-in that changes the plan). A set added or taken away, a check-in that keeps the plan, or
  Undo of a change leave it as it is, and a move by hand of any row then ends the move it finds
  unmet. Undo on a set of a lift stopped earlier today goes further: it takes that lift back into
  play (Found in passing).
- **A return's short warm-up** counts in the rebuild on return; a small change after it (a rest, a
  swap, Equipment busy, a set added) leaves it out of the time while the plan still lists it, so
  the time reads about 1.5 min short until the next rebuild. (From the sixth review.)
- **The time line is as of the last change.** "Runs about N min over the M min left" counts the
  minutes left when the plan last changed; a change that leaves the plan as it was keeps it.
- **Past an end time** the plan is fitted to five minutes, and the time line says "over the 5 min
  left".
- **A hard reload in a desktop browser** runs the newest build from the network; such a page is
  offered a later release by the plugin only, as before this round.
- **Focus with no opener left.** Where the button that opened a sheet is gone, hidden or disabled
  once it closes (the max saved from "Know your max?"), keyboard focus goes back to the page, and
  the next Tab can start again from its top.
- **Lists of fixed text** (the catalog's instructions, the research lines, the storage lines, the
  overlay's lines, the setup problems) use the same keys; they cannot repeat a line today, so their
  change has no revert.
- **Two bar lifts with both Plates panels open** can lose one Default tap made within about half
  a second of a tap on the other lift's panel (older than this round).
- **The barcode popup's buttons** are disabled while any of its changes is saved, so the keyboard
  focus falls to the page if it was on the button that saves ("Remove it", Replace, Add), for that
  moment (older than this round; the switch is held instead, since the re-checks).
- **A reload that read the places just before one was deleted** shows that place again until the
  next reload. A barcode saved for it is refused and an edit on Plan brings it back; making it the
  current place leaves the profile pointing at a place that is gone (older than this round). In
  the same way, a reload that read the profile or a place just before a change to it was saved
  shows the change undone until the next reload, and an edit made from that screen in Settings
  saves the older values with it (older than this round too; a reload follows a sync that brought
  something, the end of a walk, and setup's "changed while setup was open"; seen in a test, not on
  the phone).
- **Until the first walk after a clearing is done** (offline, or a cloud copy not yet reached, also
  on a new phone set up with the copy on), no place can be removed: setup leaves the Gym (and its
  barcode) when gym access is switched off, and Plan and Settings say to delete a place once the
  copy is reached. In Settings nothing else in an edit that includes such a deletion is saved:
  the screen shows what is stored, with the message (a toast when Settings was left while the
  edit waited), and later edits save as usual.
- **A setup run left part-way** is resumed only while the profile and places are as they were when
  it began, or as its own save cut off part-way left them; otherwise Run setup again starts from
  the answers now (older drafts, which do not say
  where they began, included).
- **Setup finished after the profile or a place changed while it was open** (a first setup in a
  second window, the cloud copy's walk, another window, or a Settings edit still saving when Run
  setup again was tapped) changes nothing: it shows what is saved and says so, and its answers are
  not kept.
- **Finish in setup waits for the sync under way and the one queued behind it** (later requests
  join that one), with the button reading "Saving…" and the answers held meanwhile. A copy that
  does not answer fails the sync's first request after 30 seconds; a slow one is waited for. A
  copy that answers and then stops part-way through a sync is given up after five minutes, so
  setup can wait that long, and twice as long when a second sync (Try again, or the phone coming
  back online) is queued behind it. A request given up on is not stopped: the browser finishes it
  in the background, and the next attempt asks again.
- **A setup whose save is cut off after the profile is written,** in the plan's rebuild, and then
  finished again leaves today's plan as it was built before setup until the next rebuild; and one
  reopened after a reload starts Use defaults from the places it had written (the thirteenth
  re-check; both need a failure inside the save).
- **A setup cut off part-way and reopened without a reload,** while another window changed the
  profile in that moment, or after setup's own profile write landed though its check failed,
  starts again from step 1 with the answers as they were, and its Finish says the data changed
  (the first attempt's answers are kept on disk; a reload shows them). And Use defaults after a cut-off that removed
  the Gym brings the Gym back without its barcode, which went with the removal the owner asked
  for (the fourteenth re-check; both need a failure inside the save).
- **A setup cut off after it removed the Gym** (gym access switched off) and before the profile
  is written leaves the current place pointing at the Gym: Today shows "Location: Not set" until a
  place is picked there or setup is finished (older than this round: setup removed the Gym first
  then too; found by the fifteenth re-check).
- **Records that hold several entries** (the entered maxes, the coach's routes and declined
  offers, the kept swaps) are one row each in the cloud copy: a change on one device replaces the
  other device's whole set, the later-made change winning (older than this round).
- **Setup over a Home with no equipment and no Gym** (allowed on Plan) asks for a piece of home
  equipment or gym access before it finishes, Use defaults included, as Run setup again always has.
- **Settings reopened while a save from before still runs** (left and opened again within the
  moment a deletion and its rebuild take) shows the store half-way through that save, and an edit
  made then is saved after it with the older values. Within one Settings screen saves run one at a
  time since the eighth re-check; before this round they were never held apart.
- **Connecting a different database** waits for that database's answer without a time limit, the
  card staying busy meanwhile (older than this round).
- **One row the cloud copy refuses still holds back the batch it is in,** and changes not yet sent
  are lost if the phone's database is cleared before they go (older than this round). The known
  cause of a refusal, a deletion with no body, is fixed; the other two protections are in
  Proposed, for a later round by the owner's decision.
- **Saved plates are not converted when units change.** A place's plates saved in pounds are read
  as kilograms after a switch, and the other way round (older than this round). Other stored
  weights are not converted either: the tenth review saw a fresh profile's bench show "Target 45
  kg" after a switch to kilograms. Seen in passing, outside items 7 and 8; not investigated in this
  round.
- **"Clear site data" removes both copies** of the barcode, as it does the token's: they are
  copies on one phone, not a backup. So does uninstalling the app's site data in the browser.
- **What is changed while waiting for the first walk** after a clearing ("Set up anyway", or
  offline) is replaced by the cloud copy's records once the walk is done: a max entered then, a
  kept swap or an edited place included. Setup waits for the walk so that this is rare. An edit
  begun before the walk ended and saved after it is the exception: it is saved over what came
  back, in the cloud copy too. A place sheet left open on Plan across the walk's end does this, as
  does a second window that has not synced since another window's walk (older than this round;
  found by the sixth re-check). A check of the stored version before such a save would end it; it
  is proposed for a later round.
- **A big picture with no code read** has no second copy when no smaller copy can be made of it
  or the pictures' budget in local storage (which every app on the origin shares) is spent; the
  cloud card then says "on this phone once" for it.
- **Two devices' clocks:** the cloud copy keeps the newer of two versions by their times, so a
  device whose clock runs ahead can win where it should not, and a phone takes such a version back.
- **A window of the previous build** that removes a barcode removes only the database's copy; this
  build then brings it back from its second copy at the next open.
- **A barcode brought back without its picture** shows its code, drawn; a picture too big for
  local storage keeps a smaller copy instead (a phone screenshot always fits once shrunk).
- **Your demonstrations and the automatic backups** live in the database only. The request to keep
  storage protects them; the demonstrations also travel in the backups you export.
- **A phone that clears its database before it opens this build** keeps nothing more than before:
  the barcode's second copy is written the first time this build opens.
- **The dial's value box** runs a few pixels wide for a weight such as 402.5 at 360 px; the number
  stays readable (older than this round).

## Things to settle

- **The gym barcode in the cloud copy?** It stays on the phone, by the rule set in Maintenance 18,
  now with a second copy that a clearing keeps. Putting it in the cloud copy (the owner's own
  database) would also bring it back after "Clear site data" or on a new phone. It would add
  every barcode picture to what Life Mirror's phone downloads from that database, though Life
  Mirror reads only workouts. Kept on the phone until the owner says otherwise.

Every training-science choice in this round was settled from the research above.

## Proposed

- **Move only the busy move of a pair,** splitting the pair for the session.
- **Keep an order set by hand through a rebuild,** as a lift moved for busy equipment now keeps its
  place.
- **"Not now" on a longer-rest card sets aside every rest card for seven days,** not only the one
  declined (from the item 38 review; it was so before this round).
- **List the fit's outcome rather than its steps:** a set trimmed and given back, or trimmed before
  its lift was left out, would read as nothing, or as the lift left out.
- **Judge every first target from its load before rounding.** At coarse steps an estimate's 90%
  can round up by most of a step (17.6 to 20 lb is 14%), undoing the margin; the same rule as the
  heaviest pair, in the other direction, would keep the margin with fewer reps.

- **One reading of a set for every estimate the app shows,** the engine's rules included: counted
  to twelve, a set of 20 × 25 reads 28 lb where the evidence (Nuzzo et al. 2024) puts it nearer 37,
  so a return after a break from high-rep sets starts lighter than the lifter's own estimate says.
  The evidence favours thirty; it changes targets, and item 36 kept the rules' reading, so it waits
  for the owner's word.
- **Keep keyboard focus inside an open sheet,** as it is for a tap: today Tab can reach the page
  behind the backdrop.
- **Rank a bodyweight lift's sets with the lifter's bodyweight in them:** by load times reps, 5 lb
  added for one rep outranks twenty at bodyweight.
- **Undo keeps a stopped lift stopped:** Undo on a set of a lift stopped earlier today would take
  the set away and leave the lifter on the lift they changed to, given the set back, rather than
  taking the stopped lift back into play (Found in passing below).
- **Count a return's short warm-up until the next set,** at a small change as at a rebuild (Known
  limits).
- **Let a place record its own bars** (a 35 lb or 15 kg bar, a lighter EZ bar): the plates are
  worked out from each exercise's usual bar, as the targets always have been, and a different bar
  would change targets too (item 8).
- **A filmed demonstration for the 15 drawing loops and the 10 diagrams,** as reusable film of their
  exact variation appears (item 7; the register keeps what was searched).
- **Swap the bench dip for a dip or a pushdown by default:** the How to keeps it, its depth capped
  where the upper arms are level with the floor or higher, but a 2022 study (McKenzie et al.) found
  it takes the shoulder to about the end of its range, more than bar or ring dips, and its authors
  advise against it in regular training. The catalog choice is the owner's (item 7).

- **Page the pull by store as well as time and id.** Two records of different kinds can share an
  id and a sync time (a custom exercise and its notes, sent in one batch); if a 500-row page ended
  between them, the second would be skipped. The eighth re-check saw it in SQLite with small
  pages; at 500 rows a page has to end exactly between the two (older than this round).
- **Rebuild today's plan after setup when it has not started,** so a change setup makes to the
  places (Home's equipment, say) reaches the plan as a change on Plan does.
- **Apply each pulled record in the transaction that checks it.** A save landing between the
  pull's check and its write is replaced by the cloud's version, and its queue entry then sends
  that version back. Read from the code, not seen.
- **Send a refused batch row by row** (the owner's decision, 2026-10-03: for a later round). When
  the cloud copy refuses a batch (a database error, not a lost connection), send its rows one at a
  time, keep only the refused row queued with its changes, and say so on the cloud card ("refused
  1; the rest went through"). Today one refused row holds back its batch on every attempt.
- **Keep a second copy of the unsent queue in local storage** (the owner's decision, 2026-10-03:
  for a later round), put back after a clearing. Changes not yet sent live only in the database,
  which the phone cleared four times in three hours on 2026-10-02 (the barcode has such a copy
  since this round; Life Mirror keeps one of its queue).

Found in passing by the reviews, older than this round and left as they are:

- **Undo on a set of a lift stopped earlier today** takes that lift back into play. After a lift
  under way is swapped (by hand, for comfort or for a sore joint), Undo on its last set (its row
  opened from Whole workout) sends the lifter back to the stopped lift, which the app still reads
  as stopped: Equipment busy on it is refused ("Barbell Bench Press has stopped: nothing is left
  to change on it."), and a later change can be refused while the button stays on: "Barbell Bench
  Press is on your disliked list." after a sore joint or comfort, "... is excluded by your
  limitations", or "Two primary-strength squat lifts compete for the same progression." when the
  lift swapped in was a squat. Found by the sixth review and its random tester (21 refused taps in
  6,000 sessions on the final code).
- **A rebuild places the lift in front by the plan's own rules,** so a check-in short on time can
  put the lift the lifter is on last; only the busy moves never move it. Found by the seventh
  review.
- **A swap leaves the lifts after it at their targets,** though the work before them changed with
  it (about 400 times in 6,000 random sessions with history). Found by the seventh review.
- **Comfort or a sore joint on a lift under way with no alternative** is refused: "Logged sets for
  X would have been lost, so nothing was changed." Found by the seventh review.
- **Run setup again that changes only Home's equipment,** with Home the current place, leaves
  today's plan as it was (setup writes the places directly, so the rebuild a change on Plan makes
  never runs). Found by the fourteenth re-check; older than this round.
- **More than 40 liked or disliked exercises** in setup shows the save's raw error at Finish
  (nothing is written since the eleventh re-check), and **an out-of-range age left in setup's field
  when the app closes** makes the saved run unreadable, so setup starts again from step 1. Found by
  the twelfth re-check.
- **Taking every day out of the schedule** shows the save's raw error ("Save failed: [ { ...") and
  keeps the old days; the day chips let the last day go. Keep one day at least, or say so plainly.
- **Today at 360 px** cuts the length control to "Default: 56 mi".
- **The "Intermediate" chip** runs 7 px past its edge at 360 px.
- **A lift only swapped out or skipped** shows "Best 0 reps" on its sheet on Progress.
- **A setup link that fails while a sync runs** can leave the card on "Syncing…" until the next sync
  (read from the code: the failed save moves the sync's epoch on).
- **On a first visit, Later tapped** within four seconds of "Ready to work offline" brings that
  toast back for its last seconds.
- **Escape closes every open sheet at once,** a sheet opened over another included.

## The complete revert run

Every fix of this round, taken out alone, must fail a test. Each has an entry in the revert table
that takes that fix alone back out and runs its tests, and the table keeps the two rounds before
this one: 840 entries, 485 from this round, 185 from Maintenance 24 and 170 from Maintenance 23.
Nineteen more are retired, 15 of this round's and 4 of Maintenance 23's: a later design replaced
the code each one took out, so there is nothing left to revert, and each names the entries that
guard what took its place. The complete run on the final tree caught all 840.

The update path's fixes, taken out one at a time from builds served as a release would be
(`e2e/pwaUpdate.spec.ts` against two real builds of each version), each fail a browser test:

- The app looking when it comes back (the prompt as it was before this round): the first test.
- The offer the moment a release waits: the third test (the release found again after a failed
  install is never offered).
- Reload loading the page once the new worker is in: the third test (Reload on the second page
  stays on the old build).
- Reload with nothing waiting: the third test (the page left behind stays on the old build).
- The offer to a page left behind by another page's Reload: the third test.
- A release offered before, offered again with nothing waiting: the third test and the fourth
  (the app's own offer, which it now makes on a first visit too).

Six are held by unit tests only, as none of the four browser tests reaches them: Reload on a page
no worker runs while another page holds the old worker (it loads once the release is active);
reconnecting (it looks without bringing back a release put off); a page loading once when both
signals of the new worker come; the offer on a page no worker runs of a release found again after
its first install failed; the plugin's own offer kept owed (the app makes one of its own in every
case the browser tests reach); and a page loaded past a running worker (a hard reload) left to the
plugin.

Nine more fixes are taken out the same way, from a real build, and each fails a browser test at
the step it guards: item 8's plate buttons on one row at 360 px, a change plate's weight inside its
plate, a long side's count beside its plate, a plate button never narrower than its label in a wide
font, and the collar clear of the last plate on a heavy side; item 7's stills installing with the
app, a clip kept the first time it plays, and a tall clip held to part of the screen; and the gym
barcode coming back after the browser clears the database. On the final tree, all 16 browser
reverts fail their test.

## Verification

The local gate (`npm run verify`) on the final tree: lint and type check clean; 1,648 unit tests in
198 files passed; the build, the privacy scan (683 text files, no findings) and the build check
passed; and the browser suite passed 362 tests, 14 skipped by design, none failed, on its first run.

The gate before it failed one browser test, the installed app's offline How to. After a reload,
Playwright's offline setting no longer reached the page: every request still failed, but
`navigator.onLine` read true, so the app gave its online wording ("could not load"), as it should
when online. The test now sets offline again after the reload and checks the flag first; the app is
unchanged. The whole browser suite then passed 362 tests, 14 skipped by design, none failed.

The revert runs on the final tree: all 840 unit entries caught, and all 16 browser reverts (The
complete revert run, above).

The clips' own checks, run on the 59 clips cut from film (the 57 that ship are byte for byte the
ones checked; the hack squat's was taken out after the ninth review, and the chin-up now loops
Everkinetic's drawings): every loop ends on the frame before its first; each clip's encoded last
frame differs from what was meant by no more than 1.08 times its median frame's encoding error;
every seam is within 1.69 times the clip's 95th-percentile step between frames; the leg raise's
caption bar is in none of its frames; and the overhead press's and the Arnold press's outer rows and
columns are as plain as the picture beside them.

Settings, Plan and Progress on the final build at 412 px, with the same synthetic history as the
captures before this round: 1,982, 1,765 and 3,488 px tall, where the build before it measured
9,981, 2,101 and 4,088 (80%, 16% and 15% shorter).

The checks on the live build follow once it is deployed.

## Review on the phone

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ , the release to check is this
round's build, named here once it is live (Settings, About this app).

**Round G**

1. Start a workout and, on the lift in front, tap Options, then Equipment busy: it moves behind the
   next exercise, and that one is in front. Do it: the busy lift is in front again. Tap Equipment
   busy again until nothing after it is left to do: the button is greyed out and says why; Skip
   today and finishing still work. Nothing is swapped out.
2. At home with dumbbells to 20 lb, open "Know your max?" (or Options, Your max) on the incline
   dumbbell press and enter a recent set of 20 × 15, then 20 × 20, then 20 × 25: the target
   changes (6-10, 8-12, 16-20 reps at 20 lb) and the preview says why. Save: the lift shows what
   the preview said.
3. When a set falls two reps short with nothing in reserve, the coach offers "Add 30 s to this
   rest": tap it once, and the rest gets 30 s and the card goes.
4. Pick 30 min: "Why this workout" says "Shortened rests toward the realistic minimum." once, and a
   lift that lost two sets reads "Trimmed 2 sets from ...".

**Settings, Plan and Progress**

5. Settings is about two and a half screens: each row shows its value and opens in place; "I have
   gym access" and the alert switches work without opening anything; Your data and About are at
   the bottom.
6. Plan, This week: your days with "Change days ›", which opens Settings with Schedule open and on
   screen; "Every muscle on Progress ›"; your places, which "Where you train" in Settings lands on.
7. Progress: each lift once, with its estimated max and confidence (a pull-up or a band move shows
   none); tap a lift for its newest eight sessions, the rest behind "Show N more"; the five newest
   workouts, and every other one behind the button under them.

**Demonstrations and plates**

8. Start a workout and tap the bench press's picture on its card (or How to under it): How to opens
   with the exercise's own video playing, silent, with Slow and Pause on it; under it Setup, Do it,
   Key cues and Avoid. Tap Slow, then Pause. "About this video" says who made it and on what terms.
   Close it: the card is as small as before, and its picture moves for five seconds, then rests.
   Open Options: "Why this target" is there now.
9. Open How to on two or three other exercises (Settings, Exercise library works too): each shows
   that exercise itself, the same equipment the steps describe, and the loop plays on without a
   jump where it starts again. A few show drawings instead of a video, and eleven show a diagram;
   where a video differs from the steps in a detail (the leg press goes deeper, for one), a line
   under it says so. On one with a diagram (Band pull-apart, say), Pause stops it and Play starts it
   again. Settings, About, Demonstration credits lists every one.
10. Turn on airplane mode: How to on an exercise you have already watched still plays; one you have
    not shows its first frame and says the video plays once you are online. Turn airplane mode off
    with that How to still open: within a few seconds the video starts by itself.
11. On a bar exercise with plates on it, tap Plates: one end of the bar is drawn as it is loaded,
    the heaviest plate against the collar, each plate with its weight on it, the bar's own weight
    on the bar, and the sum under it ("185 lb = 45 lb bar + 70 lb of plates each side"); the same
    drawing shows small under the set logger. Today is selected, and the plate buttons sit on one
    row: tap a plate you cannot find, and the drawing and the target change at once. Tap Default:
    these are the plates the place keeps; take one out and it stays out after closing the app. Tap
    the plate again (or All plates) to put it back. There is no Done to tap. Turn the dial up to
    600: every weight is still readable and the collar never covers a plate (a long side is drawn
    once per size, its count beside it).

**Phase 8 acceptance**

The installed app on the phone runs the build from before this round, which looks for a release
only when it is opened fresh. The first step moves it to this release that way; from then on it
also looks whenever it comes back to the front.

12. Close the installed app from the recent apps, then open it from its icon. If "New version
    available" appears, tap Reload.
13. Settings, About this app: "Build <this round's commit> · ... · Phase 8", and Display reads "Installed app
    (standalone)". The app shows no browser address bar.
14. Your profile, places, history (Progress) and settings are all as before.
15. The update path on return, the one that failed before. Leave the app in the background, not
    closed. Start a new release: on GitHub, Actions, Deploy Pages, Run workflow (branch main), or
    ask me to; it builds the same code with a new build time. When the run has finished (about 12
    minutes), switch back to the app from the recent apps: within a few seconds "New version
    available" appears. Tap Later: it goes. Switch away and back: it is offered again. Tap Reload:
    About shows the newer build time (its commit can be a later one that changed
    only documents), and everything in step 14 is unchanged.
16. The data-safety checks from Phase 8, now under Settings, Your data: in Export and import, tap
    Export Full Backup JSON (the file saves); open Automatic backups (up to three listed); in
    Storage and save check, tap Run save check (it passes), and "Protected" says Yes (the app now
    asks the browser to keep its storage each time it opens; if it says Not yet, tap "Keep data on
    this device"). Nothing needs importing for this.

**Phase 8 data safety: the gym barcode stays saved** (in the installed app)

17. Plan, Where you train, Barcode on the Gym row: keep the barcode there, or add it once more.
    Close the app fully (swipe it away), open it again, and tap Start Workout at the Gym: the
    barcode comes up. Turn on airplane mode, close and open the app again: it is still there. After
    the release in step 15 (Reload), it is still there.
18. Settings, Cloud copy: "Not in the copy" names the Gym barcode, "with a second copy on this
    phone". "0 changes waiting" now means the phone and the cloud copy agree.
19. If your goals, schedule or places ever looked reset to their defaults around the days the
    barcode went missing, say so: the cloud copy could then hold the defaults, and an exported
    backup or an automatic one can put yours back.

Reply **GREEN - NEXT PHASE**, **YELLOW - FIX: what is wrong**, or **RED - STOP** for the round,
and say separately whether Phase 8 is GREEN.
