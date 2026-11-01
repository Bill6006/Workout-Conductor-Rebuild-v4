# Maintenance 38: the split's order across the days

Built on 2026-10-31 and 2026-11-01 on the owner's decision of 2026-10-31: "Split reordering should
NOT be an owner preference question. Use the best available research and Workout Conductor's
existing recovery/readiness model to decide automatically. Keep my available training days fixed
and reorder the split only when another order is meaningfully better for recovery, performance,
frequency, and my goals. If no ordering is clearly better, keep the current split." It settles
Maintenance 33's one question for the owner. The research is `docs/research/split-order.md`.
YELLOW: waiting for the owner's phone review.

With it, the owner settled Maintenance 25's: "Keep the gym barcode phone-only. There is no need to
put it in the cloud unless a future feature genuinely requires cross-device access." Nothing
changes in the app for that one; the barcode stays on the phone, as it was.

## What it does

- **The days stay yours:** the week ahead's days, as the schedule ticks them, each at the length you
  train it. Nothing is moved to another day. Where you tick more days than your sessions a week, you
  pick which to train, and the split keeps its own order.
- **The sessions stay the split's:** the same sessions the rotation gives the week, in another order.
- **An order is taken only when it is meaningfully better for recovery:** the app's own "too soon"
  check reads every order of the week's sessions, day by day: the muscles a session would work hard
  well inside their recovery windows, where their performance is still down. Another order wins only
  when no muscle comes back too soon more often and at least one less often, and the first day after
  the week, with the session the rotation gives it, is no worse.
- **Frequency and your goals:** built in the order, the week must give every muscle at least its
  sessions in the rotation's week, and no muscle fewer sets where that leaves it short of its weekly
  target. Each session adapts to the days before it, so the same sessions in another order are not
  always the same sets.
- **Your goals rank the orders:** the three that leave the goal's muscles least worked hard too soon
  are built in full in turn, of two as good the one that moves fewer days first, and the first that
  holds up is taken.
- **Held for its week:** once you train a session of an order, it holds through its days, so a
  session it moved is trained on the day it gave it. Each workout keeps the order it was trained in.
  A day of it missed, another session on one of its days, or a save of other days or another number
  of sessions a week ends it.
- **The split keeps its place:** after a week trained in an order, the rotation reads that week's
  sessions on the days it gave them, so the weeks after hold the same sessions they would have.
- **Today's length:** the order is read with today at its own length. A length picked, or a check-in
  short on time, before you start reads it again, and can change today's session back to the
  rotation's. On a later day of an order held, it stands at any length.
- **Said where it acts:** Today's **Why this workout** says "Lower body today in place of Upper
  body: in this order the quads, hamstrings and glutes are not worked hard again inside their
  recovery windows in the week ahead." Plan says it under the week. A muscle brought back inside its
  window on fewer days is said so: "worked hard again inside its recovery window on fewer days".
- **What holds:** a coach focus holds today's session. A deload on any day of the week ahead keeps
  the rotation's order. A catch-up or a second workout is no day of the order.
- **The schedule card:** where it offers the days you train, it reads them in their own best order,
  with your coach focus and lasting swaps.
- **"Longer would help"** reads the week in the order, and offers nothing where the longer session
  would read the week in another order.
- **The lift to push** reads the days ahead in the order: its "the next session has its own place"
  check, and its weekly cap, with the days after the order's week in the rotation's own days.
- **Saved copies** keep no line of the order: a copy loaded on another day says nothing of it.

The default week (Monday, Tuesday, Thursday and Friday, four sessions) keeps the rotation's order in
13 of the 14 weeks read, each weekday as today, new or after two weeks followed. Three of its four
sessions train the arms, so in the usual week no order keeps them out of their windows on both pairs
of days running. The one reorder is a new lifter's first week from a Friday, whose Thursday push day
would work the biceps 48 h after Tuesday's pull day.

## What the weeks showed

Across 1,428 weeks read once (every two to six days, three profiles, two starting days, two
histories), 298 were reordered. Planned and trained day by day for sixteen weeks against the same
weeks in the rotation's order (448 schedules of two to five days, two profiles, two starting days),
158 were reordered at some point. All 158 had fewer days a muscle was worked hard too soon: 7,521
to 4,677 in all. Over the sixteen weeks no muscle had a session fewer in 121; one fewer in 31, what
a session falling past the sixteenth week gives; two in 5 and three in 1, the forearms of a
strength lifter on five days, which have few direct sessions.

## Not taken

- **Moving a session to another day:** the owner keeps the days fixed.
- **Other sessions than the rotation's:** an order is the same sessions.
- **An order that trades:** sparing one muscle by bringing another back too soon is never better.
- **An order read afresh each day:** it pushed the same session on week after week (below).
- **A day after the week as a reason:** it only guards.

## Review

One bounded adversarial review read the first build with probes: two HIGH, six MEDIUM and two LOW.
Each is fixed, but for one LOW kept as a known limit:

1. **HIGH, more days ticked than sessions:** the order was read over the first days ticked, and the
   week trained could lose a session (Monday to Friday ticked, three sessions trained on Monday,
   Wednesday and Friday: no lower day). No order is read there now.
2. **HIGH, today's length:** the order was read with today at the Default and kept at another length
   (at 15 minutes the kept order was worse than the rotation's in 64 of 1,278 readings). It is read
   at today's length, and again at every rebuild before the start that builds today at another (a
   length picked, a check-in short on time), the week's need with it.
3. **MEDIUM, frequency and goals:** the confirmation read only "too soon", so built in the order a
   muscle could lose sessions or sets (side delts from two sessions to one, and from 6 sets to 4.5
   of 10). Those orders are refused now.
4. **MEDIUM, the lift to push:** its "the next session has its own place" check read tomorrow from the
   rotation, not the order. It reads the order now.
5. **MEDIUM, the line:** Plan called muscles still worked hard too soon on one day spared. The lines
   now name the muscles spared the whole week, and those on fewer days, apart.
6. **MEDIUM, a deload from tomorrow:** today stayed reordered against plans the deload makes
   lighter. No order is read while a deload holds any day of the week ahead. Planning or cancelling
   one makes today's plan again where the order is at stake; otherwise Maintenance 24's rule holds,
   and a deload after today leaves today's plan as it is.
7. **MEDIUM, the schedule card:** it read the moved week without the coach focus or the lasting
   swaps. It reads them now.
8. **MEDIUM/LOW, saved copies:** a copy kept the order's Why line. It is dropped on save and on load.
9. **LOW, kept as a known limit:** the estimate reads a lift new to the lifter again (months off) at
   the rotation's session, so a better order can be missed there. The week built in the order is
   read exactly, so a worse one is never taken.
10. **LOW:** a doc comment on the wrong type. Moved.

The review's two leads: the emptied catch-up offer was read in the session's old order (it reads the
fresh one now); a lasting swap taken mid-day keeps today's order (today's session is the lifter's
then, and the next day reads the week with the swap).

### What testing the fixes found

Run day by day over weeks, the fixed rule still failed the owner's "frequency, and my goals":

- **Read afresh each day,** an order pushed the same session on week after week. Over six weeks, in
  126 of 208 schedules some muscle had fewer sets, and a strength lifter on Monday and Wednesday
  trained no lower day at all (quads 56 to 24 sets). An order trained in now holds for its week.
- **Held,** some muscle still lost three to five sessions over sixteen weeks in 21 schedules. The
  rotation picks each session from what was done, so an order changed which sessions the weeks
  after held. The rotation now reads a week trained through in an order on its own days.
- **The day after the week** was read as if the week began again. With the rotation in its own
  place, that day is the rotation's next session: an order that moved a strength lifter's lower day
  to Monday left Wednesday's full body 48 h after it every third week. It is read with the
  rotation's next session now.

### The re-check

One re-check of the fixed build, with probes, found one HIGH and one MEDIUM. Both are fixed:

1. **HIGH, the days saved mid-week:** an order held for its week outlived a save of other days. On
   Monday, Thursday and Saturday, with Monday trained in the order (the lower day in place of the
   upper day), a save on Tuesday of Tuesday, Thursday and Saturday kept it: Plan showed the upper day
   twice and no lower day, and Thursday said "in place of Lower body" where the rotation's Thursday
   was the full body. An order now keeps the schedule it was read for, the days ticked and the
   sessions a week, and holds only while that is the schedule. Read afresh, that week is the
   rotation's. The same days ticked in another order still hold it.
2. **MEDIUM, the days after an order's week:** the week model, which today's week's need and the
   catch-up offer are read from, planned the days after an order's last day as if its week had not
   been trained in it, where Plan reads them in the rotation's own days. On Monday, Wednesday and
   Saturday, on Monday the 21st, the last day of the order read on the 16th, it planned another
   Saturday, 16 muscles apart. The lift to push's weekly cap read the days ahead the same way. Every
   planned record of a day of an order keeps the order now, as a workout trained in it does. On
   Monday, Thursday, Saturday and Sunday with the bench press pushed, Thursday the 24th's extra had
   lost a set and the pushdown two to a cap read with Sunday as a push day; Plan's Sunday is a pull
   day, and the extra keeps its three sets.
3. **Two LOW leads, kept as known limits:** a change of time zone can move a workout's local day off
   its order's day, so its week is read as trained (a one-off shift in the rotation). And on a day
   already trained, the first day after the week is read a day past the real next session, so the
   guard does nothing for that evening's second-workout offer.

## Reverts

`tools/reverts/mutate-m38.py`: 98 entries, each the revert of one rule or one fix alone, run in a
copy of the repository. On the final code all 98 are caught.

- **The first build's run** caught 41 of 46. The five left alive (G5, O6, ST5, ST9, ST10) were rules
  no test reached; each got one.
- **After the review's fixes and the hold,** 75 of 90. Three of the 15 left alive were code that
  could never act (O17, ST6 and ST14 as they then were), and it went. The rest got tests, three of
  them only on the last run:
  - G11, a week re-dated only once trained through in its order, needed a week of an order with a
    day missed: Monday, Tuesday and Friday, the Tuesdays of the 8th and the 15th missed.
  - ST10, the order a preview made again takes, decides only whether the week's need is read again,
    since a change of length before the start is always built whole. Its test now checks the
    week's need.
  - ST16 was caught by a wiring test its list had not named.
- **The re-check** added eleven: the schedule an order was read for (K1 to K4, K3b, SS4 and SS5) and
  the order on every planned record (K5 to K8). B1, B2, P6 and RC1 moved with the code into one
  helper.
- **The older tables:** 156 entries of earlier rounds sit on or near a line this round changed, or
  run a test file it changed. All are caught but one: M31's X13, the day's first workout counting a
  lift that works a muscle only secondarily at half, which no test reached any longer, on main's
  code too (the whole suite, 3,986 tests, passed with it reverted). A test of the first workout's
  sets now catches it. M27's R44-4 moved with the line it reverts, and every runner finds every
  anchor on the final code.

## Verification

- `npm run verify` on the final code: lint, type check, unit tests (3,987 passed + 5 skipped by
  design, 658 files, and the day rules in two more zones), the build, the privacy scan,
  verify-build, and the browser suite (443 passed + 14 skipped by design). The unit tests again in
  UTC: 3,987 passed + 5 skipped by design.
- The phone steps below, walked as written by a scratch spec on a local build, at 412 and 360 px.
- The two simulations behind the numbers above, run again on the final code: the same numbers.
- CI on the branch, run 41284915536: green, unit 3987 passed + 5 skipped by design,
  the browser suite 443 passed + 14 skipped by design.
- Deploy Pages run 41286697850: the live marker reads `615d663`. The live suite from the owner's
  machine: 438 passed + 19 skipped by design, none failed. The phone steps on the live build: passed at 412 and 360 px.

**Seen in passing, LOW, older than this round, and left as it is for the owner's word:** Why this
workout's "Priority muscles today" names the week's top three priorities whatever today's session
is, so a lower day lists the biceps, the triceps and the chest. An order that puts a lower day where
the rotation had an upper day shows it on a day it did not before. _Fixed on the owner's word of
2026-11-01: the priority-muscles fix (`docs/reports/priority-muscles-fix.md`)._

## Review on the phone

In a Chrome Incognito tab at the live URL, tap **Use defaults and skip setup**: the tab has its own
empty storage and no cloud token, so nothing here reaches your own plan or history.

1. Settings, **Schedule**: 3 sessions a week, ticked on today and every other day after it (today,
   the day after tomorrow and two days after that), every other day off.
2. **Today**: the lower day. Under **Why this workout**: "Lower body today in place of Upper body: in
   this order the quads, hamstrings and glutes are not worked hard again inside their recovery
   windows in the week ahead."
3. **Plan**: lower, upper and full body, in that order, and under the week: "In this order the
   quads, hamstrings and glutes are not worked hard again inside their recovery windows."

Close the Incognito tab: everything in it goes. Nothing to check for the gym barcode: it stays on
the phone, as it was.
