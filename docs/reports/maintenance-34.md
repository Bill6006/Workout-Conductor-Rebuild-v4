# Maintenance 34: time intelligence

Built on 2026-10-31 on the owner's word ("Begin Maintenance 34 ... Use the successful local M/N/33
process"), after the harder-variation fix and the catch-up decision shipped, from the cloud
session's saved work where it still held. It is part 2 of the approved proposal
(`docs/proposals/week-model-readiness-time.md`): "the forecast at real lengths, carrying the need
forward, the 'longer would help' suggestion with cooldowns, and the honest goals-versus-time check",
with the owner's decisions of the same day on what the suggestion learns. It rests on
`docs/research/training-dose-and-time.md` and `docs/research/coaching-nudges-and-cooldowns.md`.
Every number is in the sourced rules table (`src/engine/rules/ruleTable.ts`), each marked research
or judgement with its source. YELLOW: waiting for the owner's consolidated phone review.

## The owner's decisions kept (2026-10-31)

- Realistic forecasting of the week's sessions; today's chosen length always overrides forecasts
  and anything learned.
- Carry forward missed training needs, not exact exercises; protect needs repeatedly lost to short
  sessions; rebalance later workouts.
- A meaningful "longer would help" suggestion with cooldowns, and one that learns: taken and trained
  longer is evidence of time available; "Not now" is the shorter session chosen for that occasion;
  never a lasting reading from one answer; a pattern over time.
- Honest goals-versus-time coaching.

## The forecast at real lengths

- **Each weekday's expected length** is read from the lifter's own sessions on that weekday in the
  last four weeks (the dose report's rolling window; judgement): the median of the latest three, the
  latest of two, or the one; the Default with none (another weekday's length says little about this
  one). A day counts once, by its first session trained.
- **Today's own plan** counts at the length it has now: the lifter's choice stands at once.
- The week model and the coach's week ahead (`plannedWorkouts`: the "a later session will cover it"
  check, and the Plan screen) plan each day to come at its expected length, and today at today's.
- Lengths only forecast the week; goals never bend to them (proposal part 4).

## Carrying the need forward

- **A muscle's need** is what today owes it once the week's sessions after today are counted at their
  expected lengths (`todaysNeedOf`): its target, less what is done, less what the days after deliver.
  Worked out when a day of the plan's plan is made, and kept with the session, so every rebuild
  carries it.
- **Filled where today's plan already trains the muscle**, by a set more on a lift that works it
  directly: accessories first, never more than two over a lift's own sets, never any muscle the lift
  works directly over 11 sets today (Remmert 2025, a preprint: judgement), and **only into room the
  length leaves**: the plan's own sets are never displaced.
- **Every prime mover of the lift is read**, not the muscle the set is for alone: none on a lift that
  works a muscle still inside its recovery window (Maintenance 33) or one the lifter went lighter on.
- **Not carried** on a catch-up or a second workout (built from the week already), in a deload week,
  on a day of high fatigue or of an illness, under "Make it easier" or a hard start. The lift to push
  (item 44) keeps to its own sets; a lift kept (begun, locked, pinned or set by hand), in a circuit or
  with a drop set takes none.
- **Checked after every change**: where a check-in, "Lighter" or a hard start holds a muscle back, its
  lifts' carried sets still to do come off, never one logged, and the change says so; when the time
  runs short, carried sets go first, a pinned lift's too, before anything of the plan's own.
- **Expiry**: the week.
- The lift's reasons say it: "A set more for the chest, which this week is short of."

## What keeps getting cut

The proposal: "Store what the time fit left out of each workout. A muscle cut last time is protected
next time. If a muscle is cut twice running, trim a set from an already well-covered muscle instead
... Rotate which isolation move goes, so no muscle loses every short day."

- Each plan keeps the muscles of the lifts its time fit left out (`fitCut`): a lift that works one
  directly gone, and the muscle left with fewer direct sets. A set trimmed is no cut. The saved
  workout keeps them.
- The next plan of the same day of the split, within each rank of its leave-out order (the main
  lifts still stay), leaves out first what works muscles not cut last time, then those cut once,
  then those cut twice running. It is a tie-break: it rotates which move goes where two of one rank
  compete, at lengths that leave moves out (30 minutes in the probes); at 15 the main lifts take
  every row. The need carried forward is what protects the week's training.

## "Longer would help"

The proposal: "an inline suggestion, never a question. It sits next to the length control: '45 min
would close most of this week's chest gap · Use 45 min'. When it appears: only if a priority muscle
is projected below your goal's range, today's split trains it, recovery allows, and fatigue isn't
high."

- **Shown** on Today's plan before it starts, on a day of the plan (no catch-up, second workout,
  deload week or illness), fatigue not high, for a muscle the goals weight up, outside its recovery
  window, that the week leaves under its target with today's plan as it stands, where the next
  length up closes at least half of what it is short (judgement: "most of"). The next length is
  worked out by the rebuild its tap runs: what the line promises is what the tap gives.
- **Its words**: "45 min would close most of this week's chest gap", or "would close this week's
  chest gap" where it closes all of it; **Use 45 min** and **Not now**.
- **Cooldowns** (the research gives the direction, every number is judgement): on one day at most,
  all that day, and on two days in seven; gone once the workout starts; nothing more once taken that
  day; "Not now" skips its muscles until the week ends (decision 5).
- **What it learns** (the owner's decisions): the latest four answers of the last eight weeks, two of
  a kind at least, the newer kind where two tie: taken and trained past halfway to the length taken
  reads as time available; taken and trained less, as the time running short; "Not now", or the
  length taken back down, as the shorter session chosen, each read by the day the workout began.
  Choosing the shorter session rests the suggestion two weeks; time running short rests it four;
  time available rests nothing. One answer never makes a pattern, one suggestion has one answer,
  and nothing learned ever sets a length.

## The honest goals-versus-time check

- **The floor**: about 4 hard sets a week for a muscle (Schoenfeld 2017; Iversen 2021).
- **Read over whole weeks**: the last three completed, each with a session (a week away is a break,
  not a short week: Coleman 2024, Hwang 2017); the muscles the goals weight up, or the major muscles
  where none is; **only where the weeks' sessions ran shorter than the Default** (judgement: at full
  length, time is not what held the muscles back).
- **One card** on Today's plan before it starts, held to the card limits (one new card a day, three a
  week): "Biceps and triceps under 4 sets a week for 3 weeks", why "About 4 hard sets a week is the
  least that grows a muscle. Your weeks held about 2 sessions of 30 min.", and what the suggestion
  learned where it has ("When a longer session was offered, you chose the shorter one."), with
  **Adjust time** (Settings, the schedule) and **Not now**.
- **Again only on a material change** (Nahum-Shani 2018): Not now keeps the reading; the card comes
  back when the muscles change or the weeks' minutes move by a quarter or more, never because time
  passed.

## Settings: the kinds of coaching

A **Coaching** group with three switches, each on until turned off: "Too soon" warnings, "Longer would
help", Goals and time. They are kept like every meta record, and copied to the cloud.

## Not taken

- **A planned week below the floor flagged at once** (the dose report's suggestion): the approved
  proposal flags only after three weeks.
- **The cloud draft's "taps as a record of spare time, nothing else learns from them"**: overridden by
  the owner's decision of 2026-10-31, above.
- **Two "Not now" in a row resting the suggestion a week**: two "Not now" are the pattern of choosing
  the shorter session, which rests it two weeks.

## Questions for the owner

None: the approved proposal and the owner's decisions of 2026-10-31 cover each part.

## Review

The first runs of the tests, and of the revert table, found these before the review:

- **The need was lost on every rebuild.** A length changed, a swap or a check-in rebuilt the plan
  from a copy of its constraints that left the need out; and a plan made again after new history
  kept the old figures. Both fixed, with tests (a rebuild carries it; a deload week planned the same
  day carries none).
- **"What keeps getting cut" spared nothing.** A muscle counted as cut where the fit trimmed even one
  of its sets: at 15 and 30 minutes that named 8 or 9 muscles every time, so the order ranked them
  all alike. A muscle is cut now where the fit left out a lift that works it directly (the proposal:
  "Store what the time fit left out"), and the rank in the set trims went: the fit trims every lift
  to its fewest sets before it leaves one out, so no trim order changed a plan.
- **51 of 127 revert entries survived the first run.** Tests that looked like they covered a rule
  never reached it: the default lifter's plan, fitted to its 60 minutes, leaves room for one set, so
  the caps never bound; the cut test asked for "no fewer" where a revert gave as many. The tests now
  use a lifter whose 90-minute Default leaves room, and say what each rule does. Four checks went
  with no case to meet them (a lift begun, locked, pinned or set by hand reaches the generator only as
  a kept lift, which one check covers).

One fresh adversarial review, with probes of its own. Its findings, each checked against the code:

- **HIGH, fixed: the need's set worked muscles the day held back.** The checks read only the muscle
  the set was for: a set for the chest went on the bench press with the triceps inside their
  recovery window, gone "Lighter", or past 11 sets. Every prime mover of a lift is read now: none
  inside its window or gone lighter, none past 11 sets with it (a synergist's half set is no part of
  the cap). The rebuild passes the muscles gone lighter, so their room goes to the rest.
- **MEDIUM, fixed: the check was read only when the plan was built.** A check-in that lengthened a
  window, or "Lighter", changed nothing built: the carried set stayed, and "Lighter" took its set from
  the carried one. Every change now checks the sets the need gave: where the day holds a lift's
  muscle back, its carried sets still to do come off, never one logged, and the change says "Sets for
  what this week is short of wait for another day." "Lighter" on a lift under way takes its carried
  sets first, then a set of its own.
- **MEDIUM, fixed: carried sets on a pinned lift pushed the plan's own sets out.** A pinned lift is
  never trimmed: taken down to 45 minutes, it kept its carried sets while the bench press lost a set
  and the pushdown went. The fit now takes carried sets first, on any lift, before anything of the
  plan's own; under a head cold they come off a pinned lift as off any.
- **MEDIUM, fixed: the lift to push took carried sets** (item 44: it keeps to its own sets). It takes
  none.
- **MEDIUM, fixed: "what keeps getting cut" read another day of the split.** The latest two sessions
  of any day were read, so on a split the day between ended every run. It reads the same day of the
  split now. It is a tie-break inside the leave-out order's ranks, and the main lifts still stay: in
  the probes it changed the next plan where two moves of one rank competed (at home, a full-body day
  of 30 minutes; an upper day of 30 at the gym, the curl back on Saturday after Thursday left it
  out), and nothing at 15 minutes (two rows, both main lifts) or at 45 (nothing left out). The need
  carried forward is what protects the week's training; this only rotates which move goes.
- **LOW, fixed: a suggestion answered could come back from another copy and be answered twice,**
  making a pattern of one occasion. One suggestion has one answer, and a copy merged drops a pending
  one either copy answered.
- **LOW, fixed: the schedule card offered the lighter option with the "too soon" card switched off.**
  The line says the days alone then.
- **LOW, fixed: a suggestion taken before midnight and trained past it went unanswered.** It is read
  by the day the workout began.
- **LOW, fixed: the Plan screen's week, and the coach's, planned today at the Default.** Today runs
  at today's length there too.
- **Not reproduced, closed anyway: a second suggestion after a take** would have put the first's
  answer aside. Nothing more is offered while today's take waits.

## Reverts

`tools/reverts/mutate-m34.py`, 136 entries (`table_m34.txt`), all caught on the final code: the
forecast (L, W), the need carried and its checks (C, RV, R, S, H), what keeps getting cut (K), the
suggestion and its answers (O, A, V, SL, LW), the honest card and the coach's lines (G, LW9), and
Settings and the screens (X1, U).

- **The first run, on the code as built: 76 of 127 caught.** The 51 others were settled one by one:
  tests that reach the rule (a lifter whose Default leaves room, the lower day for the main lift's
  order, a full-body day at home for the cut, the record a check-in or "Lighter" reads), or the code
  gone with no case to meet it (four carry checks the kept-lift check covers, C10, C11, C13 and C15;
  the trim's cut rank, K4). Four guards stay with no case to meet them and are out of the table:
  a circuit and a lone top set never meet a set carried (C7, C9), and the two records always read
  (SL12, SL13).
- **The second run, after the review's fixes: 130 of 137 caught.** The seven others were settled:
  W5 and W8 (each simulated day keeps what its fit cut) by a direct test of the two records; C19
  (accessories first) on the lower day, where the main lift's muscles have room; H4 by the lighter
  option's record of a lift under way; SL3 (high fatigue) with squats, which work no muscle the
  suggestion is for; LW5 (nothing more while today's take waits) with the length put back down; and
  R2, the rebuild's own hard-start check, went: the check after every change takes off what a hard
  start's day holds. The six, and the entries the change of the rebuild touched, caught again on the
  final code: 12 of 12.
- **The older tables:** every entry whose anchor lies on a line Maintenance 34 changed, or that runs
  a test file it changed, run again on the final code from a green baseline: M23 to M26 5, M27 7,
  M28 6, M30 1, M31 22, M32 2 and M33 6, all caught (M28, M31 and M33 with `--utc`).
  Re-anchored onto the moved code: M31's F1 and W8, M33's Z42 and Z35, M28's 4aa2 and 4aa3. Round
  M's coach-focus and superset-order tests moved a week on, where the need's sets had changed their
  week; M31's F1, F2, F4 and F5 are caught by them again.
- Every table's anchors are found. The complete run of every table waits for the consolidated
  phone review, as the revert README says.

## Verification

- **Local**, `npm run verify` on the final code (`6531357`): lint and types clean; unit 3,799 passed + 5
  skipped by design (632 files); the day rules in two more zones, 52 + 52; the privacy scan,
  1,208 files; the build checked; the browser suite 443 passed + 14 skipped by
  design.
- **CI:** the branch's run 41209993802, success; Deploy Pages run 41212353087, success.
- **Live:** the marker reads `6531357`. Live suite from the owner's machine: 438 passed + 19 skipped by design, none failed.

## Review on the phone

1. On a day your schedule ticks, before you start: where the week is short of your goals' muscles,
   a line under the length reads "45 min would close most of this week's biceps gap" (or the
   length and the muscles it names), with **Use 45 min** and **Not now**. Tap **Use 45 min**: the
   length changes and the line goes. It shows on two days in seven at most, all that day.
2. A lift whose reasons start "A set more for the …, which this week is short of.": the week's need
   carried into the room the length leaves. Pick a shorter length: those sets go first, and the
   plan's own stay.
3. Settings, **Coaching**: "Too soon" warnings, "Longer would help" and Goals and time, each on.
   Turn "Longer would help" off: the line in step 1 no longer shows.
4. After three weeks of short sessions with your goals' muscles under 4 sets a week: a card
   "… under 4 sets a week for 3 weeks"; **Adjust time** opens Settings at the schedule.
