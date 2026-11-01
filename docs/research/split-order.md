# The split's order across the lifter's days

_Research for Maintenance 38, 2026-10-31. EB = evidence-based, PJ = product judgement._

The owner's decision, 2026-10-31: "Split reordering should NOT be an owner preference question. Use
the best available research and Workout Conductor's existing recovery/readiness model to decide
automatically. Keep my available training days fixed and reorder the split only when another order
is meaningfully better for recovery, performance, frequency, and my goals. If no ordering is clearly
better, keep the current split."

It settles Maintenance 33's one open question, which was its to settle. The approved proposal
(`docs/proposals/week-model-readiness-time.md`) asked the schedule card to "first reorder the split
across those days" before suggesting a moved day, while it also kept the split rotation unchanged.

## The question

With the days fixed and the sessions the split's rotation gives, does their order across the days
matter, and when is another order better?

## What the evidence says

1. **No trial compares orders of the same sessions over the same days.** PubMed searches on
   2026-10-31 for the order or sequencing of resistance-training sessions and splits found none. The
   two hits were a contest-preparation case report and a study of concurrent strength and endurance
   order (26696792, 24378658).
2. **What an order changes is the time between sessions that train the same muscle, and that time
   matters muscle by muscle.** Fatigue stays in the muscles trained: a meta-analysis found no
   non-local effect on strength (Behm et al. 2021, 33818751).
3. **Consecutive days are not a problem in themselves.** Gains were equal on consecutive and
   non-consecutive days (da Silva Carvalho et al. 2018, 27682004; Yang et al. 2018, 29967584), and on
   six or three days a week (Saric et al. 2019, 30363041).
4. **How long a muscle's performance stays down depends on how hard its last session was.**
   - Sets to failure slowed the recovery of velocity and jump height by up to 24 to 48 hours over
     the same volume stopped short of failure (Morán-Navarro et al. 2017, 28965198).
   - Sets closer to failure left more fatigue at 24 and 48 hours (Refalo et al. 2023, 36752989).
   - Volume weighed more than load (Bartolomei et al. 2017, 28447186; Pareja-Blanco et al. 2019,
     30836680).

   These are the windows the app already uses (`docs/research/recovery-time-course.md`): about 24 h
   after sets three or more reps short of failure, 36 to 48 h at one or two short, 48 h (upper body)
   to 72 h (lower-body compounds) at failure, and longer after a big dose.
5. **At equal weekly sets, how often a muscle is trained, and the kind of split, hardly change
   gains** (Schoenfeld et al. 2019, 30558493; Ramos-Campo et al. 2024, 38595233). Weekly sets are
   what count, so an order may only be taken where it keeps each muscle's sessions and its sets. That
   is not automatic: each plan adapts to the days before it, and the rotation picks each session
   from what was done (the probes below).

**So:** an order matters only where it brings a muscle's hard work back inside its own window,
where that muscle's performance is still down. The app's "too soon" check reads exactly that
(Maintenance 33): hard planned work (a set to failure, or three or more sets at two in reserve or
closer) before three quarters of the window has run. It is the check the coach's "too soon" card
and the schedule card read.

## The rule, as built

- **The days stay fixed** (the owner): the week ahead's days as the plan has them, each at the length
  the lifter trains it, today at its own. They are fixed only where the schedule ticks no more days
  than its sessions a week. With more, the lifter picks which to train, and no order is read: read
  over the first days ticked, an order gave Wednesday the upper day Monday had, and the week trained
  no lower day (the review).
- **The sessions stay the rotation's:** the same templates in another order.
- **Each order is read by the "too soon" check:** on every day of the week ahead, the muscles the
  plan would work hard well inside their windows (recovery and performance, EB windows, PJ share).
  The first day after the week is read too, with the session the rotation gives it, but only as a
  guard: no order may make it worse. The rotation keeps its own place (below), so that session is
  the same in every order, and an order that moves the week round can crowd it.
- **Meaningfully better** (PJ): no muscle comes back too soon more often, and at least one less often.
  Removing one such day is the same threshold the app uses to warn the lifter, so it counts. A
  trade, sparing one muscle by crowding another, never counts.
- **Of several better orders:** the one that spares the goal's muscles most (the goal's weights, as
  the plan weighs priorities), then the one that moves the fewest days.
- **Confirmed:** the week is built in that order. It must read better too, give every muscle at
  least the sessions the rotation's week gives it (frequency, EB above), and give no muscle fewer
  sets where that leaves it short of its weekly target (goals: the targets are the goal's own, so
  sets beyond them are no loss to it; PJ). Else the next of the three best is built, and with none
  confirmed the rotation's order stands. Building the week again catches what reading each session
  at its own day misses, because each plan adapts to the days before it.
- **Held for its week:** once a session of an order is trained, the order holds through its days, so
  each session it moved is trained on the day it gave it. Each workout keeps the order it was trained
  in. A day gone by untrained, a session the order did not give the day, days the plan no longer
  has, or a schedule saved with other days or another number of sessions a week end it, and the next
  order is read afresh (the re-check: saved mid-week for other days, a held order gave the week the
  upper day twice and no lower day).
- **The rotation keeps its own days:** a week trained through in an order is read by the rotation as
  if each session had fallen on the day the rotation gave it, so the order changes the day a session
  falls on, never which sessions the weeks after hold. Recovery, the loads and the lifts still read
  what was done, when it was done. Every reading of the week ahead plans the days of an order as
  trained in it, the week's need, the catch-up offer and the lift to push's weekly cap among them, as
  Plan does (the re-check: the week model planned another Saturday after an order's last day).
- **What holds:** a coach focus holds today's session, which the lifter took for today. A deload that
  holds any day of the week ahead keeps the rotation's order, because its sessions are lighter than
  the plans the order is read from. A day off the plan (a catch-up or a second workout) is not one of
  the days ordered.
- **Today's length:** the order is read with today at its own length, and again when today's plan
  is built at another before it is begun (a length picked, a check-in short on time). On a later day
  of an order held, the order stands at any length.
- **Said where it acts:** "Why this workout" names the session today's stands in for and the muscles
  it spares, those kept out of their windows the whole week and those brought back on fewer days.
  Plan says it under the week.

## What a probe of the rule found

The rule was run across every set of two to six weekdays, at as many sessions as days. Each was run
for three profiles (the defaults, a strength goal, a beginner), from a Monday and from a Thursday,
and on an empty history and on two weeks of following the plan: 1,428 weeks in all.

- **The rotation's week had a "too soon" day in 1,002 of them.**
- **298 were reordered (21%).** In 46, today's session was the one that changed. In 8 the order
  brings some muscle back too soon on fewer days without sparing any, and says so.
- **The defaults (Monday, Tuesday, Thursday and Friday, four sessions) keep the rotation's order in
  13 of the 14 weeks read** (each weekday as today, on an empty history and on two weeks followed).
  Three of the four sessions train the arms, so in the usual week no order keeps them out of their
  windows on both pairs of days running. This is the case Maintenance 33's question named. The one
  reorder is a new lifter's first week from a Friday: the rotation's Thursday push day would work
  the biceps 48 h after Tuesday's pull day, and swapping the two spares them.
- **A typical reorder:** Monday, Tuesday and Thursday ran upper, lower, full body, so Thursday worked
  the legs inside the window Tuesday's lower day set. Lower, upper, full body spares them.
- **The first version counted a better day after the week as a reason too.** That reordered 644
  weeks, some with nothing too soon in the week at all. As a guard only, it took the count from 492
  to 426: 66 orders that spared this week by crowding the next were refused.
- **The reading of an order matched the app's own "too soon" check on every one of the 1,428 weeks,**
  and the slowest decision took 81 ms on this computer.
- **The first build confirmed an order on the "too soon" check alone.** Built again in the order, a
  week could give a muscle fewer sessions or sets (the review: side delts went from two sessions to
  one). Those are refused now, and with the day after read as below, 298 of the 426 remain.

## What the weeks trained in it showed

A week read once is not the weeks trained. The rule was also run day by day: each training day
planned in the order the rule read that day, then done as planned, over sixteen weeks, against the
same weeks in the rotation's own order. That covered every set of two to five weekdays at as many
sessions, for the defaults and a strength goal, from a Monday and from a Thursday: 448 schedules.

- **Read afresh each day, the first build pushed the same session on week after week.** Over six
  weeks it halved the days a muscle was worked hard too soon (2,856 to 1,432), but in 126 of the 208
  schedules it reordered some muscle had fewer sets, and a strength lifter on Monday and Wednesday
  trained no lower day at all (quads 56 to 24 sets).
- **Held for its week,** the same session could no longer be pushed on, but over sixteen weeks some
  muscle still lost three to five sessions in 21 schedules. The rotation picks each session from
  what was done, so an order changed which sessions the weeks after held.
- **The day after the week was first read as if the week began again.** With the rotation in its own
  place, the session that day is the rotation's next, and the days trained showed it: a strength
  lifter's lower day moved to Monday left Wednesday's full body 48 h after it, the quads, hamstrings
  and glutes worked hard too soon every third week, where the rotation's order had the glutes alone.
  Read with the rotation's next session, that order is refused.
- **As built,** 158 schedules were reordered at some point. All 158 had fewer days a muscle was
  worked hard too soon (7,521 to 4,677 in all). Over the sixteen weeks no muscle had any session
  fewer in 121, one fewer in 31, two fewer in 5 and three fewer in 1, the forearms of a strength
  lifter on five days (15 to 12), which have few direct sessions. One fewer is what a session falling
  past the sixteenth week gives. What remains is each plan adapting to the days before it, which
  changes the lifts and sets a little.

## Uncertainty

- **No trial tests the order itself.** The rule rests on the recovery evidence and on the app's
  windows, some of whose sizes are judgement (`recovery-time-course.md`).
- **The windows are starting estimates,** moved by what the lifter's own sessions teach (Maintenance
  33).
- **Planned sessions are read at their targets' reserve,** and the sets the lifter actually does may
  go harder or easier. An order held for its week is not read again until its week is done.
- **The week is the seven days ahead.** What lies past it is only guarded, through the first day
  after it.
- **A lift new to the lifter again** (back after months off) is read, session by session, at the day
  the rotation gave its session, so a better order can be missed there; the week built in the order
  is read exactly, so a worse one is never taken (the review, a known limit).
- **The weeks trained were simulated,** every set done at its target. What a lifter does differently
  changes the plans after it, as any day does.
- **Two known limits (the re-check):** a change of time zone can move a workout's local day off its
  order's day, so its week is read as trained, a one-off shift in the rotation. On a day already
  trained, the first day after the week is read a day past the real next session, so the guard does
  nothing for that evening's second-workout offer.
