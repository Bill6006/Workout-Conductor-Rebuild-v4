# The app chooses the day's workout (2026-10-31)

Changed on 2026-10-31 on the owner's word, outside the rounds and before Maintenance 34. It changes
Round M's approved default for item 12 ("offer the catch-up, with the full session one tap away"),
on the owner's own word. YELLOW: waiting for the owner's phone review, like every round since
2026-10-11.

## As asked

"Change Round M's catch-up behavior so the user does NOT choose between 'Catch-up' and 'Full
session.' Workout Conductor is supposed to make the programming decision. The user should only
need to provide practical constraints such as: workout time available today; current
location/equipment; readiness/pain/illness information when needed. [...] Treat catch-up as
internal planning logic, not a user-facing workout mode. [...] Remove the 'Catch-up instead' /
'Full session' decision from the normal Today experience. The user should see ONE recommended
workout and be able to trust that it is the app's best choice for their goals within the time and
location they supplied. Do not require the user to understand which workout type they need.
Preserve the underlying Round M week-model/catch-up intelligence. This is a decision/UX correction,
not removal of the feature. Add regression tests proving the app automatically chooses and
prioritizes the best session without requiring a catch-up/full-session toggle."

## What changed

- **Today asks nothing.** The day's line on a day off the schedule, or on a day already trained,
  says what the plan is and carries no button: no **Full session**, **Catch-up instead** or **Go
  easy instead**. The lifter gives the time, the place and the check-in; the app gives the one
  workout.
- **The choice is the app's, from the same intelligence.** Round M's week model and catch-up rules
  choose the plan, unchanged:
  - a day the schedule ticks: the day's own session;
  - a day it does not tick, for a lifter in training: the catch-up of what is behind this week (the
    sets done and still planned against each muscle's target), the muscle furthest behind first,
    each muscle's main lift first, a few sets each, none to failure, and no muscle trained in the
    last 48 hours. With nothing behind, the day's own session without the muscles still recovering;
  - a day already trained: the second workout, which leads with what was missed and gives a muscle
    trained today only what is left of one session, or none;
  - the length picked, the place, the check-in, pain and illness shape each as before.
- **A saved copy with nothing in it is not loaded.** Its "Full session" button was the only way out
  of an empty copy; now today's plan stays, and Today says `Nothing in "<name>" is left for today:
  today's plan stays.`
- **Kept for sessions saved before.** A session saved with the full session taken keeps it for its
  day; the engine's path for it stays, and no screen offers it.

## How each part of the ask is met

| The ask | Where |
|---|---|
| What training needs are most important today | The week model: each muscle's sets done and still planned against its target (Maintenance 31) |
| What is done, and what is projected later in the week | The same: the days still to come, planned as the app will build them |
| Missed and undertrained needs first, when appropriate | A day off the schedule: the catch-up, largest share short first; a day trained: the second workout leads with what was missed |
| Important normal-session work kept when it stays the priority | A day the schedule ticks keeps its own session |
| Normal and catch-up work combined when that is better | On a day trained, the second workout: what was missed, then what is left of the day's work. On a day the schedule ticks, the week's missing sets carried into the room the length leaves: Maintenance 34, next |
| Recovery, fatigue, pain, equipment and the time picked | As before: the 48-hour rule, the check-in, pain and illness, the place's equipment, the time fit |

## Not taken: an off day filled to the length picked

Built and dropped the same day: on a day off the schedule, the time a catch-up leaves given to
"fresh" muscles (none trained in the last 48 hours, none the next session trains within two days).
It changed the catch-up's own plans and broke 109 Round M tests that pin reviewed rules: a length
picked adds no lift to a catch-up, a kept lift stays alone in its slot, a plan the lifter emptied
stays empty. The owner asked to preserve Round M's intelligence, and the evidence gives such sets
little: weekly sets per muscle drive gains, so a catch-up is worth the sets it adds; sets beyond a
muscle's target add less, and near-failure work on an off day can crowd the next session
(`docs/research/catch-up-and-second-workout.md`). An off-day catch-up may so be shorter than the
length picked; Today says its minutes. A change the owner can still ask for.

## Tests

- `src/core/state/catchUpChosen.store.test.ts` (4), the regression tests asked for, through the
  store with no tap of kind: a day not ticked gets the catch-up, the muscle furthest behind first,
  every lift for what is behind, none for the chest and triceps trained yesterday, none to failure,
  and a line with no button; at 30 min it stays the catch-up, within the length, what is furthest
  behind kept; a day ticked gets its own session and no line; a day trained gets the second workout,
  the bench press done that morning not in it again.
- On screen (`src/features/today/dayNote.screens.test.tsx`) and in the browser (`e2e/roundM.spec.ts`):
  the catch-up's one line, its heading, Start, and no button to choose the kind, after a reload too.
- About 20 Round M test files: each check of the removed buttons now checks there are none; the
  copies with no lift now leave today's plan in place (`emptyCopyFullSessionWayBack`,
  `emptySecondOnAnotherDay`, `copyFullSessionChoiceHolds`, `copyFullSessionOfferReadAgain`).

## Review

One fresh adversarial review, read-only. It found no screen left that chooses a workout's kind:
nothing outside the tests calls the full session. Its findings, each checked against the code:

- **HIGH, fixed: three browser tests on a day off the schedule.** A helper took "Full session" for
  tests of the day's usual plan (the coach's fewer reps, two chin-up cases); with no button it did
  nothing, and on a Wednesday, Saturday or Sunday those tests met the catch-up and failed. They now
  tick today on the saved profile, and the helper is gone.
- **MEDIUM, fixed: a copy the day's check-in empties.** A saved copy with a lift passed the check,
  then the day's check-in, laid on after, ruled the lift out: today's plan was replaced by nothing,
  with no button. The check-in is laid on first; a copy with nothing to start stands in for nothing
  and today's plan stays untouched (a store test, and the Plan screen's).
- **MEDIUM, kept by decision: pain or skips that empty a day off the plan.** A catch-up the lifter's
  own changes empty (skips, "Uncomfortable", "Hurts", a joint told at the check-in) stays empty for
  the day, as Round M reviewed it, now with no "Full session" beside it. Kept: the catch-up is the
  app's choice for a day off the schedule, missing a session costs little (Coleman 2024, 38274324;
  Hwang 2017, 28328712), training through pain is never the plan, and the split's own day there would
  crowd the next scheduled session. A catch-up the place cannot build at all still plans the day's own
  session, as before. Undo takes a change back. The owner can ask for the day's own session instead.
- **LOW, fixed: "Loaded" for a copy refused.** The Plan screen now says `Nothing in "<name>" is left
  for today: today's plan stays.` instead, leaves the session as it was (no new headline beside an
  old Undo), and gives a copy with no exercise no **Use**.
- **LOW, kept: a session saved before the change with the full session taken** keeps it for that
  day, with no way back to the catch-up; the next day plans afresh.
- **LOW, fixed: tests whose premise had gone.** The copies with no lift are now refused where they
  were loaded, and their tests say so; titles that still promised the full session say what happens;
  the regression tests pin the order of what is behind, both muscles the bench press works resting,
  the remainder of a muscle trained today, and what was missed leading, with no condition that could
  skip them.
- **LOW, fixed: stale text.** The research report's first default for item 12 says the owner's word
  superseded it; the status page's line goes with this report.

## Reverts

`tools/reverts/mutate-catch-up-decision.py`, 9 entries (`table_catch_up_decision.txt`), all caught
on the final code: Today wires no choice to the day's line; the catch-up's, the full session's, the
second workout's and the nothing-more lines carry no button; a copy with nothing to start, the day's
check-in laid on it, stands in for nothing; and the Plan screen gives a copy with no exercise no Use,
says today's plan stays, and never "Loaded" for a copy refused. The load's early refusal of a copy
with no lift went in the run: the refusal after the check-in covers it (D6 into D7).

Every older entry that runs a changed test, mutates a changed screen file, or reaches the store's
load of a saved workout, run again on the change from a green unit baseline (3,668 passed): M23 to
M26 58, M27 2, M28 8, M29 4, M31 111, M32 2 and M33 14, all caught but these, each settled:

- **Retired, the owner having withdrawn the button:** M31's T1, T2 and T3 (the line's button, the
  catch-up's way back, the button taking the session it names), R17 and R18 ("Go easy instead", and
  the full session a tap away from nothing more for today), and H208, H212 and H213 (the full session
  taken from a loaded copy, which no screen can take now). The change's own D1 to D5 guard the
  button's absence.
- **Re-tested:** H196 and H197 (a loaded copy's marks of its own offer) on the copies with lifts their
  rules still hold for, the twenty-third and twenty-fifth reviews' own tests; H207 on a new day-note
  case, a loaded copy, none of the day's offer, left with no lift. All caught.
- **Re-anchored:** M33's Z25 (a saved workout loaded takes the day's check-in), onto the load's new
  line. Caught.
- **M33's Z44** (the Plan screen reads the check-in's day) survived on this machine and is caught in
  UTC (`--utc`), as CI runs: its test's "past midnight" is a UTC midnight. No fault of this change.

Every table's anchors are found.

## Verification

- **Local**, `npm run verify` on the change (`c8e706c`; rebased onto the harder-variation fix's
  docs as `1152a15`, the code unchanged): lint and types clean; unit 3,669 passed + 5 skipped by
  design (618 files); the day rules in two more zones, 38 + 38; the privacy scan, 1,183 files; the
  build checked; the browser suite 443 passed + 14 skipped by design, on a Saturday, a day the
  default schedule does not tick.
- **CI:** the branch's run 41202506540, success; Deploy Pages run 41204102489, success.
- **Live:** the marker reads `1152a15`. Live suite from the owner's machine: 438 passed + 19 skipped by design; two coach tests on the desktop project timed out once under load (a page load and a click) and passed 3 of 3 alone, and the 10 PWA tests that wait on them were run after them (5 passed, 5 skipped by design).

## Review on the phone

1. On a day your schedule does not tick, after training this week: Today shows the catch-up with
   one line, "Not one of your training days: a N-minute catch-up for what is behind this week.",
   and no button to choose another kind of workout. Change the length or the place: it stays the
   app's one workout.
2. After a workout today, open Today again: the second workout, "You trained today: ...", with no
   button.
