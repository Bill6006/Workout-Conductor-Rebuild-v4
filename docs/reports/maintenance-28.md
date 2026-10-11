# Maintenance 28: round J, the date, training time and the lifter's own pace

Built on 2026-10-11 on the owner's word: "Proceed through ALL remaining already-agreed items: 1, 3,
4, 6, 7, 8, 10, 11, 12, 14, 30, 31 and 32", without pausing at review gates, which stay YELLOW. This
round is the first of five: items 1, 3 and 4, which share the clock. Each item's definition is the
one the owner approved (proposed on 2026-09-22, approved on 2026-09-24).

None of the three is a training rule: they measure, and they decide how much fits in a length. No
rest, rep or load the plan asks for changes.

## 1. The local date everywhere

**As agreed:** "use your local date everywhere the app works out what day it is", which fixes the
missing Today row and the week's weekdays off by one in the evening.

**Found:** besides the round I code, which already read the device's day, nine places still read the
UTC day. West of UTC, from the evening on, the app took it to be tomorrow:

- The week plan: weekdays and "today" by UTC, while the row labels were local.
- Today's plan: it was made again at 8 pm in New York as if a new day had begun, and the choices
  made for the day went with it.
- The deload week: it began at midnight UTC, 8 pm the evening before.
- The run of training days: fatigue counted UTC days.
- Progress, Consistency: its weeks ran Monday to Sunday in UTC.
- Dates shown: a saved workout's date, and the name a saved workout gets.
- The cloud copy's `day` column of a workout.

The review found five more: a push date read as passed from noon of its own day; an export file
named by the UTC time; a date alone in an old export read as midnight UTC; the first week of the
Consistency average taken from when the first workout finished; and data kept from before (a deload
week, a preview of the evening) still on UTC days.

**Delivered:**

- Every one of them reads the device's day, and a workout counts on the day it began, as round I
  settled.
- Elapsed time stays elapsed time: the 48 hours a muscle rests, the three-week break, the last seven
  days.
- What was kept from before reads as the same calendar days on the device:
  - a deload week begun at midnight UTC runs from midnight on the device that day, and is named so;
  - a preview made in the evening keeps that evening's choices, and does not carry them into the
    morning;
  - a workout dated by its day alone in an old export is that day, and imports once: its id is the
    one it had.
- The tests of the day rules also run in New York and in a zone fourteen hours ahead of UTC
  (`scripts/test-zones.mjs`, part of the unit tests), so the UTC test runner catches a rule that
  slips back to UTC days.

## 3. Training time, not the hours a workout was left open

**As agreed:** "record training time, not hours left open, so History and Duration efficiency are
honest". Two of the owner's workouts showed 1504 and 1111 minutes.

**Delivered:** a workout's training time is read from the log times of the sets done:

- the run-up to the first set, at most ten minutes (a general warm-up is at most five);
- each wait between sets, at most ten minutes (the longest rest a plan sets is three and a half);
- sets logged within a minute of one another were logged at one go, after they were done, so the
  wait before them counts up to ten minutes for each of them;
- a skip takes no time, whenever it was tapped;
- training ends with the last set, as the plan's own estimate does;
- never more than the workout's own clock, which already leaves pauses out.

History, the workout's detail, the completion summary and its Duration, and Duration efficiency all
show it. New workouts save it. Older ones are measured the same way from their sets, which have kept
their log times since Phase 5, so the 1504-minute workout now reads as the 47 minutes of sets it had.
A workout with no set times (an import) keeps its clock. The clock itself (`elapsedSeconds`) is kept
as it was.

## 4. Your own pace

**As agreed:** "Learn your own pace from finished workouts. This would need to ignore sessions like
the 1504-minute one."

**Delivered:**

- Each finished workout saves the plan's own estimate of the sets done (`estimatedSeconds`), with
  the general warm-up the workout started with.
- The pace is training time against that estimate: the middle of the latest eight workouts, from
  three on.
- Left out: a workout the plan put under ten minutes, or one more than twice or under half its
  estimate (a pause or a slip, never a pace). The middle reading also ignores a stray one.
- Plans are fitted to it, so a 45-minute plan takes this lifter about 45 minutes. It moves a plan no
  further than 1.5 times or 0.8 times.
- The pace decides how many sets and moves fit. The rests stay as the length sets them: they are
  shortened only while the plan overruns at its own pace.
- The plan's time line keeps the plan's own parts and shows the pace as one more: "5 min warm-up, 16
  min work, 27 min rest, 2 min setup, 10 min more at your pace".
- "Why this workout" says the pace as Settings does, once it moves the plan by 2% or more: "Fitted at
  your own pace: your workouts take about 20% longer than the plan's own estimate." Where the pace is
  further than plans go, it says so: "…, and plans move no further than 50% longer."
- The plan keeps the pace it was fitted to, and every later estimate of it reads that: a change that
  rebuilds nothing, the coach's room for more work, and Left on the workout screen. On Left, the
  sets still to come go at the pace, while a rest, a hold and the warm-up count down in real time.
- A saved plan loads at the pace as it reads that day. The week ahead, on the Plan tab and for the
  coach, is planned as today's plan is, with what the lifter reset.
- Settings, Learned from your log: "Your pace" says where it stands ("…, from the last 3 workouts it
  could read"), what it does to a plan, and has its reset ("Forget your pace").
- It learns from workouts finished from this version on: older ones have no estimate to read against.

## Review

Two adversarial reviewers, one for item 1 and one for items 3 and 4, each reproduced what they found
in tests of their own. Every finding below was checked against the code before it was fixed. Each
fix has a test, and each test was checked against the revert of its fix (The complete revert run).

**Items 3 and 4.** Ten defects and four suspicions:

- **HIGH, fixed: a slow pace shortened the plan's rests.** The fit cut rests before sets, so a pace of
  1.2 took the squat's rest from 150 to 120 seconds. The estimate was then read at those rests, so a
  lifter who kept their own rests read slower still, and the pace climbed to its bound. Now rests are
  cut only while the plan overruns at its own pace; the pace then trims sets and moves. A move the
  fit brings back on its own takes the floor rest the length gives it at any pace (Maintenance 24).
- **MEDIUM, fixed:**
  - After any rebuild under way, the estimate lost the general warm-up the lifter had done. The start
    now keeps it.
  - The completion card's Duration still showed the clock ("1504 min"). It now shows the training
    time.
  - A saved plan kept the pace it was saved at, even after "Forget your pace". It now loads at the
    pace as it reads that day.
- **LOW, fixed:**
  - A skip's log time counted as training.
  - The minute counted after the last set was in the training time but not in the estimate, so a
    lifter on the plan's time to the second read up to 7% slow.
  - "Why this workout" gave the bounded figure, Settings the lifter's own.
  - The learned page's wording was wrong in three states.
  - The time line scaled the warm-up and rests by the pace.
  - The week ahead ignored what was reset. That gap was there for round I's resets too, and is now
    closed for all of them.
- **Suspicions:**
  - Logging an exercise at a time read as fast: fixed (sets at one go).
  - Left fell faster than the clock in a rest: fixed (clocks count down in real time).
  - A reset during a workout, or arriving by sync: kept as a known limit.
  - A pause inside a long wait: kept as a known limit.

**Item 1.** No high or medium defect. Five low ones, all fixed: the old deload window named a day
late from twelve hours east of UTC, and run by UTC instants; the Consistency average's first week;
an evening preview kept from before, keyed by the UTC day; export names and dates alone in an old
export. One pre-existing defect it found was fixed too: a push date read as passed from noon of the
day itself. The coverage gap it named: on the UTC test runner the day rules' tests could not catch a
revert. That gap is closed by the zone runs.

## Known limits

- The pace reads the whole workout. A lifter who rests far longer than the plan sets is planned less
  work in a length, and the rest timer still shows the rest the plan sets.
- A reset made on another device, or during a workout, takes effect at the next plan built here, as
  round I's resets do.
- A pause inside a wait the clock did not otherwise cap can count up to ten minutes of training,
  when the same workout also had a long wait left unpaused. The record keeps no pause times to tell.
- A copy of the app not yet updated names a deload week planned by this version a day early east of
  UTC, until it updates.
- History shows when a workout finished; it counts on the day it began. A workout from Sunday 23:30
  to 00:40 reads as Monday's and counts in Sunday's week.
- Life Mirror reads a workout's minutes from its own clock (`elapsedSeconds`). The training time is
  in the workout's record for it to read (Proposed).

## Proposed (not built)

- Life Mirror reading `trainingSeconds` where a workout has it.

## The complete revert run

Each rule this round built, and each fix the review asked for, was reverted on its own in a copy of
the repository and its tests run (`mutate-m28.py`, 83 entries: 25 for item 1, 16 for item 3, 42 for
item 4 and the review's fixes). Every revert is caught:

- On this machine (New York), 82 of 83 were caught at once. The one survivor, the twelve-hour rule
  that names a deload window planned on another device, had no test of its own once a window kept
  from before was read on the device's days; a window planned five hours east of UTC now tests it,
  and its revert is caught.
- As the CI runner sees them (UTC, then the zone runs): all 25 item-1 reverts are caught. In UTC alone
  only 7 of them are; the zone runs catch all 25.
- Earlier rounds' entries were brought up to the moved code: the training-time caps, the pace as a
  part of the plan's time, and Left at the pace.

## Verification

`npm run verify`, run alone on 2026-10-11, passed:

- lint and type check;
- unit tests: 2351 passed, 5 skipped by design (249 files), and the day rules' tests again in New York
  and fourteen hours east of UTC, 22 each;
- the privacy scan (769 files, nothing found) and the build check;
- the browser suite: 399 passed, 14 skipped by design.

The unit tests also pass in UTC, as the CI runner runs them (2351 passed).

Live: `0eaa9c5`, deployed by Deploy Pages run 38112423439, whose own verify passed. The live bundle
carries the commit, and the browser suite against the live site passed: 395 passed, 18
skipped by design.

## Review on the phone

At the owner's word (2026-10-11), no review gate pauses the agreed work. This round's checks are in
the one consolidated phone review given once every agreed item is live.
