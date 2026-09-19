# Maintenance 16: timing that adds up, and the card header's empty space

Started on 2026-09-19 from two things the owner sent from his phone during a workout. In his
words: "I just want to make sure that if the [duration] is saying 45 min that it is also
accounting for the time [it takes] to complete that set", and, looking at the top of the workout:
"time left 37, but 1:10 minutes = 38 or 39 if rounding up, definitely not 45". Then a screenshot
of the exercise card with the space under the tempo bar circled: "there is a big empty space
here."

He was right on all three counts.

## What was found

- **The numbers at the top did not add up.** The dropdown's "Default: 42 min" included a general
  warm-up allowance (5 minutes at that length). Left dropped that allowance the moment the workout
  started, while the clock started from zero. So at 1:10 the screen said 42 on the dropdown and
  37 left, and 1:10 plus 37 is not 42.
- **The plan did not count the rest between exercises.** After the last set of an exercise the
  rest timer runs that set's full rest, which is when the lifter walks to the next station. The
  estimate counted no rest there at all, only set-up time. About a minute short at every exercise
  change, five or six times a session.
- **A set's own time was a flat number.** 45 seconds for a strength set, 40 for hypertrophy, 35
  for isolation, whatever the reps. At the tempo the app itself coaches (its tempo bar runs at
  real pace), twelve isolation reps take over a minute, not 35 seconds, and a Light weights set
  of 20 to 25 reps takes about two. The answer to "does it account for the time to complete the
  set" was: yes, but by a number that did not look at the set.
- **A rest was counted that never runs.** The timer skips the rest before a drop set; the
  estimate counted it.
- **Together:** a session shown as 42 minutes came to about 50 by the app's own timers and tempo.
- **The exercise card's header had 25 to 50 px of dead space.** Measured, not eyeballed: the
  right-hand column (demonstration, How to, Tempo chip) was 131 px tall, the left (name, the max
  line, the tempo bar and its labels) 84 to 107 px depending on the length of the name. The Tempo
  chip was also saying what the labels under the bar already say (Lower 2s, Lift 1s is 2-0-1-0)
  and opening the same detail the bar opens.

## Delivered

- **One timeline, used twice.** The length estimate now walks the same set order and applies the
  same rest rule as the workout screen's rest timer (`restBetween`, shared by both), so the plan's
  minutes are the sum of what its timers will show. A test checks that, for generated sessions at
  every length, at two places, under three styles, and at every point through each session.
- **A set is timed at its reps and its tempo.** The middle of the rep range at the coached tempo
  (4 seconds a rep for strength and hypertrophy work, 5 for isolation and for a lift held at the
  heaviest weight a place has, 3 for ramp and drop sets), plus getting into position. A test
  holds these numbers to the tempo module, so the bar and the estimate cannot drift apart.
- **The rest between exercises counts in full**, and the next exercise's set-up counts only
  where it outlasts that rest, since the lifter sets up during it.
- **Left adds up with the clock.** Until the first set is logged the general warm-up is still
  ahead, less whatever the clock has run; a rest in progress counts for what is left of it. At
  any moment before the first set, the clock plus Left is the length on the dropdown.
- **The fitter uses the minutes it frees.** Rows are dropped whole, so with honest costs the last
  row out could leave a gap far bigger than the overrun it cured: a 15-minute session came out as
  one exercise and nine minutes. Now the best move of a dropped row is kept on its own when it
  fits. Fifteen minutes is the main lift plus one accessory, 14 minutes by the timers.
- **Harder never makes an exercise smaller.** With honest costs a full session has less slack, so
  "make it harder" could add sets to some exercises by trimming others below what the plan had.
  The fit may now take back an added set, never one the plan already had.
- **The card header.** The tempo notation sits at the end of the bar it abbreviates, and bar,
  labels, and notation are one tap target that opens the tempo detail as before. The right-hand
  column is the demonstration alone, centred when a long name makes the left column taller. At
  412 px the header went from 131 px to 113 px (98 px for a one-line name), and the left column
  now sets the height, so nothing is left empty. At 360 px the height is unchanged and the hole
  is gone.

## What changes for the lifter

- Sessions are the same sessions; their stated length is now honest. A Default session at a
  60-minute typical length reads about 56 to 58 minutes where it read about 42.
- Fixed lengths hold what honestly fits: 30 and 45 minutes keep their supersets with a set or two
  fewer on the accessories; 15 minutes is the main lift and one more move.
- Light weights sessions are fitted with their longer sets counted.
- Nothing about targets, progression, or logged history changes.

## Verification

- Unit: the estimate's rest equals the rest timer's, set by set, through six generated sessions;
  a set's time from its reps and tempo, ramp and drop sets and a capped lift at their own pace;
  the tempo module and the estimate agree on seconds per rep; set-up counted only where it
  outlasts the rest; Left at the start, through the warm-up, after the first set, and during a
  rest; the 15-minute session filled; harder keeping every exercise at least as big.
- Browser (`e2e/timing.spec.ts`, all three device projects): at the start of a workout the
  dropdown's minutes and Left agree to the minute; the first logged set takes the warm-up out of
  Left; the card's right-hand column holds one control and the text column fills the header; the
  notation opens the tempo detail.

## Review

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

1. Today: the length on the dropdown will read higher than it did for the same session. That is
   the honest number, not a longer workout.
2. Start the workout: Elapsed plus Left equals the dropdown's minutes. Log the first set and Left
   drops by the warm-up as well as the set.
3. The exercise card: the tempo notation is at the end of the bar; the space under the labels is
   gone. Tap the bar, the labels, or the notation for the tempo detail.
