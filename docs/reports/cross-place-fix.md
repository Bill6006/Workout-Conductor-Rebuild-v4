# A Home edit and the Gym's plan (2026-11-01)

Fixed on 2026-11-01 from the owner's report, outside the rounds and after the priority-muscles fix.
YELLOW: waiting for the owner's phone review, like every round since 2026-10-11.

## The report

**As reported:** Home had adjustable dumbbells alone. The owner added an adjustable bench, a pull-up
bar and resistance bands, and left the Gym as it was. Back on Today, still at the Gym, the Gym's
workout had changed: Barbell Row, Chin-Up, Rear Delt Fly, Hammer Curl, Overhead Triceps Extension,
Dumbbell Shrug and an EZ-Bar Curl drop set (61 min) became Barbell Row, Chin-Up, Rear Delt Fly, EZ-Bar
Curl, Cable Triceps Pushdown, Barbell Shrug and Dumbbell Curl (60 min). The coach's "Chin-Up: short
of 6 reps 3 sessions running" ("4 sets of 3-5 today") gave way to "No signal outranks the plan
today · fatigue normal".

**The owner's expectations:** a Home edit must not change a Gym workout unless a shared training
input changed; equipment is scoped to the selected place; an unchanged plan built again from the
same inputs is the same plan; a valid coach recommendation is never lost to an unrelated Home
edit; the root cause fixed, with a regression test that starts from Home's adjustable dumbbells
alone.

## What was found

- **Places are scoped.** The day's plan is built from the current place alone, and so is the
  coach's card. Saving a place that is not the current one never builds the plan again: it only
  keeps the plan's key in step (`syncSessionKey`), and the key holds the current place, not the
  others.
- **Tested on the same day:** through Plan's place editor and through Settings' save of the places,
  with the cloud copy on (a sync with nothing to bring back), two hours on, and back on Today. The
  Gym's plan, its constraints and its coach card stayed exactly as they were.
- **The one way it happens.** A plan from an earlier day still on screen is replaced at the next
  save, any save, a Home edit included (`leaveEarlierDay`). Today notices a new day from a minute's
  clock, and that clock's timer waits while the app is in the background. Back in front the next
  morning, Today could show the day before's plan, and the day before's coach card, until the
  timer ran or a save came first.
- **The report's two plans fit it.** The plan after is exactly a fresh pull day at the Gym here,
  the plan before carries the picks a day's log made, and the chin-up's card goes with the plan
  it was read from.

## The fix

- **The time is read again at once when the app comes back to the front**
  (`src/core/time/clock.ts`): the page shown again, a page restored, the window focused.
- **Today's plan is the device's day's on every tab** (`src/app/App.tsx`, `DayRefresh`): at a new
  day, or back in front on one, today's plan takes the day before's place at once, never at the
  next save.
- Nothing else changes: a save of a place that is not the current one still leaves today's plan
  alone.

## Tests

- `src/core/state/homeEditGymPlan.store.test.ts`, the owner's regression as asked:
  - Home with adjustable dumbbells alone, and three weeks trained at the Gym (synthetic: each
    chin-up set two reps short of its floor);
  - today a pull day at the Gym, with the coach's "Chin-Up: short of 6 reps 4 sessions running"
    ("4 sets of 3-5 today");
  - two hours on, Home gains the bench, the pull-up bar and the bands;
  - back on Today, the plan, its constraints and the card are exactly as they were.
- `src/app/dayRefresh.screens.test.tsx`: the day before's plan on screen, on Plan. The next
  morning, back in front, today's plan takes its place at once, and a Home edit then leaves it as
  it is.
- `src/core/time/clock.test.tsx`: the time read again on focus, on a page restored and on a page
  shown again.

## Review

One bounded adversarial review, with probes, found no other way a Home edit changes today's Gym
plan or its coach card, and no regression in the fix. It found two LOW, both fixed:

1. **"Longer would help" kept on every place:** the store kept the offer while every place held,
   though it reads only today's. An edit of Home worked it out again at a later hour: an offer came
   on the Gym plan the edit never changed, and its showing used up one of the week's two. It is
   kept now while today's place holds.
2. **The regression test's two hours** came from New York's clock. In UTC, the CI's zone, the Home
   edit came at the plan's own instant, and a rebuild would have gone unseen. The test now adds two
   hours to the instant.

Checked and sound, among others:
- a cloud sync that brought records back and reloaded the store;
- the app reopened over the same data;
- a deload week, a lasting swap, and Home's weights saved;
- Settings' autosave;
- the coach's card limits;
- the plan refreshed on every tab, which leaves a workout under way, setup, the restoring screen
  and Settings' draft alone.

## Reverts

`tools/reverts/mutate-cross-place.py`: 7 entries, each the revert of one part alone, all caught:
the clock's three, the app's two, the offer kept on today's place, and the rule the report doubted
(a save of another place leaves today's plan alone), which the owner's regression test now guards.
Of the earlier tables, M34's SL5 sits on a line it changed: it moved with it, and is caught. Every
runner finds every anchor.

## Verification

- `npm run verify` on the final code: lint, type check, unit tests (4001 passed + 5 skipped
  by design, 664 files, and the day rules in two more zones), the build, the privacy
  scan, verify-build, and the browser suite (443 passed + 14 skipped by design). The unit
  tests again in UTC: 4001 passed + 5 skipped by design.
- The phone steps below, walked as written by a scratch spec on a local build, at 412 and 360 px.
- CI on the branch, run 41320536977: green.
- Deploy Pages run 41322817267: the live marker reads `375eb5f`. The live suite from the
  owner's machine: 438 passed + 19 skipped by design, none failed. The phone steps on the live build: passed at 412 and 360 px.

## Review on the phone

In a Chrome Incognito tab at the live URL, tap **Use defaults and skip setup**: the tab has its own
empty storage and no cloud token, so nothing here reaches your own places or plan.

1. **Today**, at the Gym: note the lifts, the minutes and the coach's card.
2. **Plan**, **Where you train**, **Edit** on Home: take off the adjustable bench, the pull-up bar
   and the resistance bands, and **Save place**. Back on **Today**: the Gym's lifts, minutes and
   card are exactly as in step 1.
3. **Edit** Home again, put the three back, **Save place**: back on **Today**, still exactly as in
   step 1.

Close the Incognito tab: everything in it goes.

**As it comes up:** the first time you open the app from the background on a new day, Today shows
the new day's date and plan straight away.
