# Maintenance 27: round I, the approved learning items

Built on 2026-10-10 on the owner's word, in the owner's order: "1. Build item 43 first. 2. Then
build item 41 immediately after 43. 3. Then complete items 44, 45, 46, 47 and 49." On item 41: "build
the complete feature now, but do not let its personalized reps-to-load model influence an exercise
until the app has enough trustworthy calibration data from item 43 for that specific exercise.
Research and validate the activation threshold rather than using an arbitrary number."

Every training and physiology rule was checked against the best available evidence first
(systematic reviews, meta-analyses, controlled trials, position stands), every paper on PubMed; the
evidence, the uncertainty and the reason for each final rule are in `docs/research/`:
`reserve-check.md` (43), `personal-curves.md` (41), `push-lift.md` (44), `pain-patterns.md` (45),
`real-week.md` (46) and `accessory-variety.md` (49). Product and screen choices follow ordinary
judgement. New stored fields are all optional and dropped alone when unreadable; no stored list of
values was extended (`docs/data-model.md`).

## 43. How well you judge reps in reserve

**Delivered:**

- Opt-in: Settings, Programming, Reserve checks. Off under the styles that take nothing to failure
  (Lean-down, Foundation). The text says to leave it off with high blood pressure or a heart
  condition, or if the lift hurts.
- Now and then the last working set of one machine or cable isolation lift (thirteen in the
  catalogue) goes on past the usual stop to a rep that stalls: weekly until five checks, then every
  four weeks; never on a deload day, after a low or sore check-in, on a hard start, or in the first
  session back after three weeks. One a session at most.
- The logger asks the reps at the stop, the reserve judged there and the reps in all, with two
  switches: it stalled before the usual stop, or it was stopped for pain or form (counts for
  nothing). The reading is said at once ("You judged 1 left at 12 and did 15 in all: 3 were left,
  2 reps more than you judged").
- From four readings that agree, every rule that reads a logged reserve reads it through the
  lifter's typical error, in whole reps, never more than two, only on lifts like the ones checked
  and in the reps their readings span. The log itself keeps what was logged.

## 41. Each lift's own reps-to-weight curve, gated on item 43

**Delivered:**

- Learned only from item 43's sets to failure on that lift: pairs at least six reps apart within
  fourteen days, drawn toward the curve most people follow (Epley's constant 30).
- **The activation threshold was researched and validated, not chosen**: a simulation of 2,000
  lifters through the app's own code (true constants 30 ± 6, weekly gains, rep noise and a last-set
  loss the app cannot see) found where a curve is rarely worse than the rule and better on average.
  A lift's curve acts only when it is that sure (one spread at most 2.5) or clearly different from
  30 by two spreads; until then it moves nothing.
- Where it acts: a return after three weeks or more, and the first target of a new rep range,
  within the reps its checks spanned. It keeps the rule's own reading of the last set and changes
  only the shape between the last set's reps to failure and the target's, so at a constant of 30
  it gives exactly the rule's target. "Why this target" says so where it changes the target.

## 44. A lift to push

**Delivered:** Settings, A lift to push: a main lift, a target max, an optional date. The lift
leads every session it is in, and gets one extra session a week where the schedule has room:
never more than three sessions or ten sets in any seven days, never to failure, two calendar days
after its last session (three after a heavy one), never the day before a session that has its own
place, and never taking one of its muscles over twenty sets in any seven days the extra is in.
Other work for its muscles holds. Progress shows the pace toward the target once six weeks and ten
sessions give it meaning; the coach offers to end the push when it falls well short twice running
or its pace is flat, and a review every twelve weeks. A simulation of the app's own plan on eight
schedules and five lifts checks every rule on every run.

## 45. Pain patterns over weeks

**Delivered:** each in-session pain report keeps its exercise. A joint reported with one exercise
in at least two sessions a week apart, at least half its sessions and the latest, while its
alternative had two sessions without, brings one card: the joint, the exercise, the counts and the
dates, and the four-week swap on offer. It names no condition, claims no cause and promises
nothing; "A pattern in what you logged, not a diagnosis" and when to see a health professional
always show under it. Not now keeps it away until a new report.

## 46. The week you actually train

**Delivered:** four complete weeks of training all on one side of the schedule, or with a day
trained in three of them that the schedule does not have, bring one card to move the schedule
("You train 2 days a week, not 4"), with the weeks, the schedule and the move. One tap moves it, and
the plan's split follows where the number of days changes it.

## 47. What the app has learned

**Delivered:** Settings, What the app has learned: your pace (not learned yet), the habit of
lifting above or below the suggested weight, each lift's curve, how well you judge reserve, pain
patterns and declined offers; each with what it is read from and its evidence, and a reset that
asks once more. A reset deletes nothing logged: each learner reads only what is logged after it.

## 49. Variety for accessories

**Delivered:** no rotation on a timer: an accessory that is progressing stays. A stalled
accessory's route offers one named alternative as a four-week swap; an accessory flat for about
eight weeks after twelve in the plan gets one offer. Never a main lift, never within four weeks of
a change, never on a lift with a pain pattern, and the alternative is at least as good for growth.

## Review

Four adversarial reviews, one per group of items, read the built code and tried to break it. They
reported 43 faults; every one was confirmed against the code before it was fixed, and each fix has
a test that fails with the fix reverted. The fixes:

- **43 and 41:** a set added after a check made a second set to failure (the check now stays on the
  set it was logged on); a stalled check's slip question read the wrong number; a measured 0 in
  reserve was "corrected" to 2 (a check set now reads the reserve it measured); a reading that
  counts for nothing was read out as one; the curve applied its shape to the reserve the rule leaves
  out, a step light for a low curve; "Why this target" quoted the corrected reserve as logged; the
  learned page claimed a correction with the checks off; rebuilds and the finish screen read the
  log uncorrected.
- **44:** "Make it harder" sent the pushed lift to five sets or to failure; spacing in hours made
  Monday, Wednesday and Friday sessions an hour long read 47 hours apart, so the extra never came
  (now calendar days); the weekly cap looked only backward and rolling weeks reached 21-22 sets
  (it now plans the days after, and counts drop sets); a swapped extra came back as a second extra;
  the main lift fell behind accessories; the lift's place led even when the lift could not go in;
  "End the push" read falls from before the push and two Not nows silenced the flat-pace offer too;
  the pace's outlier could hide itself; a rebuild counted a kept extra twice; the twelve-week review
  blamed scatter when there were too few readings; a Light weights extra was called heavy.
- **45 and 46:** a later change to the plan erased the session's pain reports; a check-in's sore
  joint was counted as a report against an exercise; a pattern put away still took the card's
  place; the card came back the day a four-week swap ended, on the old reports (a lift back from
  three weeks away now starts afresh); pain on the alternative before a set was missed; "a week
  apart" was measured to the minute; two days a week made every session full body, which left
  calves, abs, side delts and upper chest untrained (full body, upper and lower rotate again, as
  before); a workout finished after midnight counted on the next day; the card could say "You
  train 2 days a week, not 2" or "You train on" with no day, and guessed days; a tap on the setting
  already chosen rebuilt the workout; card taps hid save failures.
- **47 and 49:** a reload during a reset could undo it, and a reset wrote away a field a newer copy
  had saved; the declined-offers list named offers by the coach's own codes and kept a pain card's
  stale line; one declined flat card hid every other; a flat card showed while a stall route was
  open; a deload week or a return from a break read as flat; the route's offer ignored the
  four-week spacing, a pain pattern and the day's own limits.

## Re-check

A second adversarial pass, one per group again, read the review's fixes and probed them in the
code. It found 28 more faults; each was confirmed against the code before it was fixed, and each fix
has a test that fails with the fix reverted (three in-session reads are the exception, below):

- **43 and 41:** Keep, on a check that stalled early, named the reps at the stop where the set
  commits the reps in all, and none in all did not read as a skip; both switches could be on at
  once; a check logged as a skip still said a reading; a check set read the reserve it measured only
  while an estimate was in force; turning the checks on or off left today's plan built on the old
  reading of the log; the stall card quoted the corrected reserve as if logged; the learned page
  said "nothing learned yet" after a change of style had started the learning again.
- **44:** the day's extra, swapped before it began, was named the main lift (the squat lost its
  protected place at 30 and 15 minutes); swapped for comfort or pain it was lost on the next
  rebuild; begun and swapped, it went last and was weighed again; a rebuild with it under way gave
  back the sets its cap had taken and could plan a drop set on its muscles; "Make it harder" could
  trim one of its sets while the squat took an added one, and "Make it easier" left it at three
  where a fresh one had two; the cap's line named a lift the time fit had left out; Foundation's
  extra was called heavy; where the lift could not go in, the plan still weighed it and could say a
  muscle was at its cap; a lasting swap into the pushed lift put it back the day after a session of
  it; the days ahead stepped 24 hours, so a clock change skipped a Sunday; a lift logged the same
  every session never read as flat, and a real step after it was set aside as a slip; under Light
  weights no reading ever came (the pushed lift is logged at 10 to 15 reps, past the 12 a reading
  takes) and the cards did not say why.
- **45 and 46:** a joint dropped from an updated check-in still counted as a report against an
  exercise (every workout now saves its reports, an empty list too); a pain session saved after
  midnight counted on the next day; the three-week break was read in calendar days where the engine
  reads elapsed time; a move capped at six sessions did not say so.
- **47 and 49:** a route's alternative could put more stress on a joint the lifter flagged; a
  four-week swap recorded its route step even when the swap was not kept; a reset could overwrite a
  field a newer copy had saved with the older one shown here; declining an offer dropped a decline
  a sync had just brought; one malformed decline broke the page that lists them; a save that landed
  but could not be read back left the page showing what was there before; with the checks off the
  page said "still learning" and claimed a correction.

The three in-session reads of a check set's measured reserve (the set's own adjustment, the sets
after it, the hard start's reading) are consistency only: a check set is a lift's last set, so the
first two can change nothing, and the third only when the lift's earlier sets were skipped. They
have no test of their own.

## Known limits

- Every rule's numbers that no study sets (four weeks of a schedule, twelve weeks for a flat
  accessory, 42 days for pain, the push's cap of twenty) are judgements anchored to the evidence
  named in each research doc, with their uncertainty there.
- Items 41, 45, 46 and 49 act only on weeks of logged data; they cannot be shown on the phone
  without it. Their behaviour is covered by the unit, simulation and browser tests.
- The week plan still reads UTC weekdays until agreed item 1 ("use the local date everywhere").
- The day's extra stopped where its lift cannot go (a move to a place without its equipment) stays
  at its logged sets on a move back; a lift in a place of the plan's own picks its sets up again.
- With a lift to push, the week ahead (Plan, and the coach's look at it) takes about three times
  as long to plan (about 20 to 30 ms on a desktop), since each day with an extra plans the days
  after it to weigh the cap.

## Proposed (not built)

Each research doc lists what the research proposed beyond the agreed text, for the owner to ask
for if wanted: the coach suggesting a push; a linear-log projection; Light weights pushed to the
strength range; pain intensity on a 0 to 10 scale and the side; a line when pain returns after a
swap; a "vary my accessories" setting; position tags in the catalogue. Two more from this round:
the week ahead planned without each extra's look at the days after (faster, but it could show an
extra the day itself then holds back), and "1 rep" where a line now says "1 reps" (older than this
round).

## The complete revert run

On the final tree, every fix was taken out alone and its tests run: the unit tests in a copy of the
repository, and each browser revert on a rebuilt app.

- This round's 193 unit reverts (the items as built, the review's fixes and the re-check's): 193
  caught. Two re-check reverts were retired, with the reason in the table, as able to change
  nothing reachable: the guard against the lift swapped away coming back, which the day's extra
  rule now covers, and a stopped extra counted as the day's extra, which only a place change can
  leave, where no extra is weighed either way. The three in-session reads of a check set's measured
  reserve have none (Re-check, above).
- Maintenance 23 to 26's 1,199 unit reverts, on this round's code: 1,199 caught. One was
  re-anchored: item 44 moved the code that 2d (harder keeps a lift's floor of reserve) takes out.
- The browser reverts of Maintenance 25 and 26: 32 of 32 caught.

## Verification

**The local gate** on the final tree (`npm run verify`): lint and types clean; 2,296 unit tests
passed in 241 files (5 skipped by design), and again with the clock in UTC as the runner has it;
the privacy scan read 759 files with no findings; the build check passed; 399 browser tests passed
and 14 skipped by design, none failed. They include the phone review's steps as written
(`e2e/roundIPhone.spec.ts`), so every line the steps quote was read from the app.

**Deployed:** TBD, with the checks against the live site.

## Review on the phone

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ , the release to check is build
TBD, named once deployed (Settings, About this app).

None of this needs real training, and none of it touches your log: steps 1 to 11 run in a Chrome
Incognito tab, which has its own empty storage and no cloud token. Open the live URL in one, set up
with gym access (any answers), and go in this order (the push first, before any workout: a lift
gives its place up the day after a session of it).

**Item 44, a lift to push**

1. Settings, Schedule: 2 sessions a week (each is full body, which has the bench press). Settings,
   A lift to push: Lift "Barbell Bench Press", then Target max 225. The row reads "Barbell Bench
   Press to 225 lb".
2. Today: the bench press is first, marked "Lift to push", and Why this workout says "Barbell Bench
   Press leads: the lift you are pushing to 225 lb goes first, where a lift gains most (Nunes et al.
   2021)."
3. Progress: "Barbell Bench Press to 225 lb", "No reading yet", and "A reading is its first working
   set each session, at 12 reps or fewer with 3 or fewer in reserve."

**Item 43, how well you judge reps in reserve**

4. Settings, Programming: turn on "Check how well I judge reps in reserve" (if it says your style
   takes nothing to failure, choose Hybrid first).
5. Today, Start workout. Log the sets as they come, as filled in (Log, then skip the rest), until a
   cable or machine lift whose set list ends "the last to failure" (Cable Triceps Pushdown, say). On
   its last set the logger says "Reserve check: ..." and asks the reps in all. Tick "It stalled before my usual stop",
   then "I stopped before failure": the first unticks; untick both. Log 12 reps at 1 in reserve with
   15 in all: it says "You judged 1 left at 12 and did 15 in all: 3 were left, 2 reps more than you
   judged."
6. Finish the workout and save it. Settings, Learned from your log: "How well you judge reps in
   reserve" says "Still learning: 1 check of the 4 it needs."
7. Item 41, each lift's own curve (it acts on a lift only after several checks at two rep ranges):
   on the same page, "Each lift's own reps-to-weight curve" says "Learning: not in use on any lift
   yet.", and names the lift checked as "not sure enough yet, from 1 set to failure". Then turn the
   checks off in Programming: the reserve part says "Reserve checks are off: nothing is read through
   your 1 check."

**Item 44 again, after a session**

8. Progress: "Building a baseline: 1 reading so far, 9 more sessions and 6 more weeks to go." and
   "Now about ... lb (estimated max)."
9. Settings, A lift to push: Lift "None". The bench press is no longer marked on Today.

**Item 47, what the app has learned**

10. Settings, Learned from your log: each part says what it has learned and why, or why not yet.
11. Under "How well you judge reps in reserve", tap "Start learning again": it asks once more
    ("Confirm: start learning again", or "Keep it"); confirm, and it says "Last reset" with today's
    date and time.

Close the Incognito tab: everything in it goes.

**Items 45, 46 and 49** need weeks of logged training (a pain pattern within 42 days, four weeks of
a schedule, an accessory twelve weeks in the plan), so they have no phone step; their cards are
covered by the unit, simulation and browser tests on synthetic weeks. On your own app nothing
changes unless you turn on reserve checks or set a lift to push; a card from items 45, 46 or 49
comes only when your log shows its pattern.
