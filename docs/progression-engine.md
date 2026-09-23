# Progression engine, fatigue, strategy, and the Adaptive Coach

Four pure modules turn actual completed records into the next targets and one coaching surface.
None of them changes a workout by itself; every change is a tap that runs through the
Recalibration Engine.

## Progression engine (`src/engine/progression/progression.ts`)

`performanceHistory(history, exercise)` reads the completed working sets of an exercise from the
saved records, newest first. Warm-ups and skipped sets never count. When the exact exercise has no
history, exercises in the same progression family stand in, marked `viaFamily`, so an accepted
alternative keeps its lineage.

`recommendNextTarget` returns the load, rep range, RIR, a mode, evidence lines, a session count,
and a confidence:

| Situation (from the last sessions)                                 | Mode                                      | Load                                                       |
| ------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------- |
| Nothing logged for the exercise or its family                      | `start`                                   | entered max, else body estimate, else empty bar, else none |
| Strength role, every set cleared the floor with reps in reserve    | `weight`                                  | + one increment                                            |
| Strength role, floor cleared but little in reserve, or a set under | `maintain`                                | same                                                       |
| Hypertrophy or isolation, every set at the top of the range        | `weight`                                  | + one increment                                            |
| Hypertrophy or isolation, every set inside the range               | `reps`                                    | same, one more rep                                         |
| One session under the floor                                        | `maintain`                                | same                                                       |
| Two sessions in a row under the floor                              | `deload`                                  | −10 %                                                      |
| Three sessions in a row under the floor                            | `regress`                                 | −15 %                                                      |
| Fatigue high (from `interpretFatigue`)                             | `maintain`                                | same                                                       |
| Two sessions at the top of the range (hypertrophy)                 | `setsAdvice` = 1 (offered, never applied) |

Increments come from the equipment: 5 lb or 2.5 kg on bars, 5 lb or 2 kg per dumbbell, 10 lb or
5 kg on stacks. `applyProgression` writes the load and reps into the working sets, calculated ramp
loads into the warm-up sets (60 %; 50 % and 75 %), and about 80 % into a drop set, and leaves any
value the user set by hand (`entry.manual`) untouched. Its `floor` argument is the empty bar for
bar lifts: no ramp, drop, or working load goes under it. The generator and every substitution
call it, so every card shows a load and a "Why this target".

## Fatigue (`src/engine/recovery/fatigue.ts`)

Sessions in the last 7 days, consecutive training days, how far logged reps in reserve drifted
below the targets over the last two sessions, "too hard" and pain ratings in the last three, and
today's check-in combine into `fresh`, `normal`, `elevated`, or `high` with evidence lines. High
fatigue holds loads in the progression engine and puts recovery first on the coach.

## Multi-session strategy (`src/engine/strategy/strategy.ts`)

`analyzeStrategy` looks at the last twelve qualifying sessions on demand and never diagnoses from
one poor set or one poor session:

- **Load plateau**: three sessions at the same load while hitting the top of the range → add
  weight; two sessions under the floor at the same load → micro-deload.
- **Rep plateau**: reps fading by two or more from the first to the last set in two of three
  sessions → increase rest; best reps flat over three sessions inside the range → add reps.
- **Fatigue**: fatigue high with top-set estimates down 5 % → micro-deload; high alone → hold.
- **Recovery**: three or more days in a row, or two of three sessions rated too hard → hold.
- **Exercise fit**: replaced or skipped in two of its last three appearances → open alternatives.
- **Coverage**: a goal-priority muscle under half its weekly target two weeks running → adjust
  volume.

`sessionFeedback` grades a saved session exercise by exercise (progressed, on target, short) and
adds the rating's implication; it shows on the completion surface as "Coach".

## Coach Conductor (`src/engine/coach/coachConductor.ts`)

Every system contributes signals; the conductor resolves them by fixed priority:
safety/form > save/storage > recovery/fatigue > plateau > progression > exercise fit > weekly
coverage > rest > tips. Within a domain, severity then confidence decide. The winner becomes the
one gold Adaptive Coach card (`src/components/AdaptiveCoach/AdaptiveCoachCard.tsx`) with a
headline, up to three Why lines, and at most one action. A major action (a micro-deload) needs a
second tap to confirm. The card says how many signals were checked and never applies anything.

Evidence uses actual completed records and logged sets only; the logger's unlogged values and the
next round of a superset are never evidence. Superset coaching reads both moves and lists what was
actually logged this session. Evidence is duration- and readiness-aware through the fatigue signal
and the session's length choice; when recovery comes first, the action is the existing 45-minute
length, not a separate mode.

Actions map to existing systems: recalibration triggers (target weight, rep range, sets, rest
adjust, drop set, duration, add exercise), the rest timer, the readiness check-in, the
alternatives sheet, a backup export, or a coach focus for the next session.

Every card ends in a tap or a must-know. Cards that only restated a target or a fact are gone:
the superset readout lives on the superset card, the logging tip sits under the first working
set until a weight is logged, and a coverage note with nothing to tap never reaches the card.
Two kinds of card carry no action on purpose: a lowered load (micro-deload or reset), whose
change is already in the plan and whose card says why, and a safety notice with no safe swap.
The profile pain-area watch offers a swap; an extra set on offer offers "Add the set".

## Coverage that acts or stays quiet (`coverageSignals`, `src/engine/planning/focus.ts`)

The coverage card fires only once half the week's planned sessions are done, for a muscle still
under 40 percent of its weekly target with nothing for it today, and only when no session still
to come this week reaches it: the generator's own week plan (`planWeek`) says which muscles
each coming session trains, week-aware selection included. With four minutes of room or more
today, its one tap adds two sets of the best accessory for the muscle (`pickAccessoryFor`: fits
the place and the limits, isolation and hypertrophy-friendly first, low joint stress) through
the `add-exercise` trigger, locked and placed after the plan. Without room, the tap sets a coach
focus (meta record `coach-focus`, seven days, backed up): the next session's template choice
and picks favour the muscle, its accessories lead, and "Why this workout" says so. A saved
session that trains the muscle clears the focus; the Plan tab shows the focus with a Clear
button. Plural muscle names read "are".

## Coaching policy by experience (`src/engine/coach/experience.ts`)

The experience level chosen in Settings sets a policy the coach, the progression engine, and
the stall detector all read:

| Policy                                                                  | Beginner    | Intermediate   | Advanced       |
| ----------------------------------------------------------------------- | ----------- | -------------- | -------------- |
| Tone / reasons shown                                                    | explain / 3 | brief / 2      | brief / 2      |
| "Follow today's plan" card when nothing outranks the plan               | yes         | one quiet line | one quiet line |
| Signals that restate a target (ready for more load, aim one rep higher) | shown       | hidden         | hidden         |
| Strength roles: clean sessions before load moves                        | 1           | 1              | 2              |
| Reserve tolerance under the prescribed RIR                              | 0.5         | 0.5            | 0              |
| Double progression: top-of-range sessions before load moves             | 1           | 1              | 2              |
| Exposures without a better max before a stall                           | 3           | 4              | 4              |
| Exposures a route step gets before the next                             | 2           | 2              | 2              |

Deloads, resets, extra-set offers, safety, recovery, coverage, and stalls speak to every level.

## Stall detection and coach routes (`src/engine/strategy/plateau.ts`)

- An exposure is one session with completed working sets of a lift; the estimated max is the
  best set's Epley estimate.
- A stall is the newest N exposures with no estimated max more than 1 percent above the oldest
  of them, at the prescribed effort (average RIR within half a rep of the target). Sets ending
  1.5 reps or more above the target RIR in at least half the exposures are diagnosed as
  undershooting instead, and the next load step is offered. Two or more exposures under the rep
  floor are left to the deload rules, and a latest exposure at the top of the range is left to
  progression.
- A stalled lift opens a route: shift the rep range (strength range to hypertrophy range or
  back), swap for a variation (the alternatives sheet), short deload (10 percent, second tap),
  add a working set. The card shows the route with the current step marked and offers that step
  as its one action; tapping records the step. After the policy's exposures without a better
  max the next step is offered; when the max moves the route closes; after the last step the
  card asks for a different exercise for the pattern.
- Routes are one record (`coach-routes`) in the meta store, backed up with everything else.

## Targets from the estimated max (`recommendNextTarget`)

Every completed set carries an Epley estimate of the one-rep max. Two cases start from that
estimate instead of the last load:

- **Back from a break.** Twenty-one days or more since the lift's last session: the target is
  90 percent of the load the estimate implies for the top of the rep range at the prescribed
  RIR; forty-two days or more, 85 percent. Mode `return`.
- **A new variation.** No history for the exact exercise but history in its progression family:
  90 percent of the load implied by the family's estimate. Mode `estimate`. Logging a set
  replaces the estimate with real numbers.

Warm-up ramps stay proportional to the working load, so they follow the estimate too.

## Where the first weight comes from (`src/engine/progression/startingLoad.ts`, `maxes.ts`)

A lift with no history of its own takes its first target from the first of these that exists:

1. **A max the lifter entered** (`StrengthMaxes`, meta record `strength-maxes`, backed up). One
   small "Know your max?" link on the card of a lift in `start`, `estimate`, or `return` mode
   opens a sheet that takes a recent set (weight and reps, turned into an estimated max with Epley, reps capped at twelve) or a known one-rep max, and
   shows the first target it would set. The first target is 90 percent of the load the max
   implies for the top of the rep range at the prescribed RIR. Saving fires the `max` trigger,
   which re-targets that lift's unlogged, untouched entries in today's session and recalculates
   their ramps; entries with a logged working set are left alone and the next session starts
   from the max. "Not now" hides the link for seven days; "Don't ask for this lift" hides it
   for good; a logged working set hides it because the running estimate takes over. After a
   break of twenty-one days or more, a max entered since the last session is used at 90 percent
   (mode `return`).
2. **A starting estimate from the body** (`estimateStartingMax`). With a bodyweight in
   Settings, the reference max is a fraction of bodyweight per movement pattern and load type
   (bars by pattern; dumbbells per hand at 0.4 of the bar figure; stacks at 0.9; machines,
   single-bell moves, and heavier bars from a per-exercise table), scaled by experience (0.6,
   1, 1.3), sex (women 0.6 for upper-body patterns and 0.7 for lower-body ones; unspecified
   0.8 and 0.85), and age (1 under 35, then 0.92, 0.84, 0.76, and 0.68 by decade). The first
   target is 85 percent of the load that estimate implies. The ratios are conservative
   reference points in the spirit of published norms such as the ACSM bench press and leg press
   tables, not standards: the first logged set replaces them, and in-session autoregulation
   corrects the remaining sets.
3. **The empty bar** for bar lifts (`barWeightFor`: 45 lb or 20 kg for a barbell, and the
   catalog's EZ-bar, trap-bar, and Smith weights), with an evidence line that says so and a
   nudge to add bodyweight in Settings.
4. **Nothing** for stacks, dumbbells, and bodyweight moves without a bodyweight: the lifter
   enters the weight, as before.

Two rules apply everywhere. A bar lift never targets, ramps, or drops below the empty bar
(`floorTarget`, and the `floor` argument of `applyProgression`). A family estimate converts
between load types by the same reference ratios (`convertEstimate`), so 60 lb per hand on a
dumbbell press stands in as about 190 lb on the barbell, not 60. The in-session performance
trigger moves the next sets from the weight actually lifted, not from the planned target, so a
lifter who starts at the bar and logs 135 lb is not sent to 50 lb.

No re-test is scheduled. Reps-in-reserve estimates track a true max well in trained lifters
(Zourdos et al., 2016; Helms et al., 2016), autoregulated loading matches or beats
percentage-of-max loading over a training block (Helms et al., 2018; Graham and Cleather,
2021), and a tested max goes stale within weeks for newer lifters while the running estimate
updates every session. The link only returns after a long break.

The set logger's line under the weight always says what to load: "Target 155 lb", "Warm-up
80 lb", "Drop 125 lb", or "Bodyweight"; ramp and drop sets prefill with the load the engine
already scaled rather than a second discount of it.

## Learning from overrides (`src/engine/progression/overrides.ts`)

Saved sets keep the suggested load next to the logged one. When the first working set of a lift
was logged at least half a step above the suggestion in three of the last four sessions, the
next target steps up one more step and says so; three of four below, it steps down. Only the
ordinary modes follow the habit (load up, reps up, hold, double progression); deloads, resets,
returns from a break, and estimates do not.

## Declined offers (`recordDecline`, `isDeclined` in the coach conductor)

"Not now" on the coach card records the offer by its source and lift in the meta store. A
declined offer stays away for seven days; declined twice, it stays away until the record is
cleared by a restore. Safety signals are never put away for days; since Maintenance 19, Not now
on one sets its concern aside for this workout (`setAsideKey`, kept in `session.coachAccepted`):
the same worry about another exercise stays quiet with it, a new one still shows, and the next
workout starts clean.

## Fatigue signals beyond the session count (`src/engine/recovery/fatigue.ts`)

Fatigue now also reads the saved check-ins as a trend (low energy or sleep, or soreness, in two of
the last three), rests that ran long between logged sets in the last two sessions (a sign of
grinding), and performance drift, the average change of each lift's estimated max from its
previous exposure to its newest. Each adds to the same score, so the levels fresh, normal,
elevated, and high keep their meaning.

## Deload week (`src/engine/planning/deload.ts`)

A deload week is recommended on the Plan tab when the last fortnight held six or more sessions,
fatigue is elevated or high, and at least one sign says the body is not keeping up: maxes
slipping, sets running closer to failure than planned, hard ratings, or poor check-ins. "Plan
it" saves the week (the next available training day plus seven days) in the meta store. While it
runs, every generated session carries one set fewer per exercise, one more rep in reserve, and
loads ten percent lighter, and "Why this workout" says so. Cancel removes it. A planned week that
has passed is dropped on load.

## What the place can load (`src/engine/loading/loading.ts`, Maintenance 12)

Each location records what it can load under three keys: a stack per machine exercise (the
exercise id), one `dumbbells` record shared by every dumbbell and kettlebell exercise, and
`plates` per side for the rack. Stacks and dumbbells are one or two ranges `{ from, to, step }`,
expanded to the exact weights; the rack is a list of plates. `loadingFor(locationLoading,
sessionLoading, exercise, units)` derives `available` (the list; for a bar, every total its
plates make on it, Maintenance 19), `step` (the real increment: the smallest gap on the stack or
between dumbbells, or twice the smallest plate the rack has today), `cap` (the heaviest weight, or
null), `perSide` for plate math, and for a bar `usual` (the totals with today's missing plates
back) and `missingToday`. `fitWeight` snaps a target down onto the list, never below a floor;
`nudge` moves the dial through real weights. A place with nothing recorded behaves as before.

A bar's totals come from `sideWeights` in `plateMath.ts`: every side weight the plates make,
taking as many of each as needed, so a rack of odd plates loads exactly what it can (45s and 25s
make 145, two 25s a side, but never 115). `platesFor` finds the fewest plates for one side, and
the plate line says what to load: "Bar 45 + 45, 10 each side · 155 lb". A weight the plates
cannot make names the two they can, "The plates here make 95 or 105, not 100 lb"; there is no
shortfall in brackets any more.

Progression fits every target through `applyProgression(..., loading)`. When the target would
pass the cap, `capTarget` holds the load there and raises the rep range by two
(`NextTarget.capped`, copied to `EntryProgression.capped`) with the reason in the evidence. The
coach names it once (`source: 'capped'`), offering a harder variation while the reps have room or
an extra set at the ceiling; `rankAlternatives` adds 12 points to candidates whose starting ratio
is below the current one (`signals.capLimited`); `tempoCue(..., { capped: true })` slows the
lowering and adds a pause. Manual weights are never re-fitted. A `loading` recalibration trigger
re-fits every unlogged, non-manual entry when a record is saved during a workout, and
`session.loading.missingPlates` is a session-only note that widens the bar's step without
touching the place. The generator's `pickForSlot` now gives a preferred exercise that fits the
slot the slot outright; the score orders the rest. Custom exercises take part in `exercisesByPattern`,
`exercisesByMuscle`, and `findExerciseByName`, so a custom machine marked Preferred is picked for
its slot. The generator fits the first preview through the same `capTarget` and
`applyProgression(..., loading)` path. `NextTarget.from` records the weight a target moved from;
when a target snapped onto the place's list would land on or under `from`, `capTarget` holds the
load and raises the reps by two, naming the next real weight, instead of rounding the increase
away in silence.

Maintenance 19: a target the weights here cannot make is never passed through. `rackFit` takes it
down to the weight under it that they make and adds the reps that keep the effort, the estimated
max held where it was (Epley; one to three reps, never past twenty), and `capTarget` writes the
line into the evidence and `NextTarget.rack` (copied to `EntryProgression.rack`): "No 2.5s today:
95 instead of 100, two extra reps." when a plate missing today is the reason, naming the plates
whose return would make it, or "The plates here make 95, not 100 lb: two extra reps." when the
rack never does. The logger shows the line by the target. The `loading` trigger now re-fits a
started exercise too: its logged sets stay as they are, its sets still to come land on what the
weights make, and a load the weights changed goes back to the one asked for once they make it
again. Weights carried from the last set that the plates cannot make are dropped before the
rebuild, so the dial starts from the refitted target, and a rebuild mid-session takes today's
missing plates into account (`GenerationConstraints.sessionLoading`).

## Session context (`src/engine/recovery/sessionContext.ts`, Maintenance 13)

Whatever is trained later in a session performs worse, but a target read from a logged set
already carries that day's fatigue, so the rule is never "later means lighter". Before each
exercise, `precedingWorkToday` measures the overlapping work that comes before it: working sets
logged, sets still planned, weighted by `overlapWeight` (a shared primary muscle 1, the same
group 0.5), skipped sets nothing, and anything before a long break (`LONG_BREAK_MINUTES`, 20)
half. `precedingWorkInRecord` takes the same measure on the day the target came from
(`NextTarget.reference`, the record id kept on every `PerformancePoint`). `fatigueSteps` turns
the difference into load steps: +3 sets is a step down, +6 two, -3 a step up only when the
reference day was clean. `recommendNextTarget` applies it when `session.precedingSets` is given;
the generator and every recalibration site pass it (`GenerationConstraints.completedSets`
carries the logged sets and their times). The `resume` trigger also adds one light ramp before
the next working set of the entry in front (`rampBack`).

Ramps (`rampSetsFor` in `roles.ts`) read a `RampContext`: the first heavy compound of a cold
pattern keeps its full ramp; a later exercise on the same pattern gets none unless markedly
heavier (`MARKEDLY_HEAVIER`, 1.25x); the same muscles at a new angle one; a long break puts the
full ramp back. `rampRoom` counts the grid loads under the working weight, so the empty bar
earns no ramp, and `rampWeights` keeps every ramp at least a step under the working weight,
never under the bar, and rising. A target weight set by hand recomputes its pending ramps.

For a lift never done, `estimateFromOtherLifts` (`crossEstimate.ts`) scales each known lift's
estimated max (history within 180 days, or an entered max) through the reference ratios of
`startingLoad.ts`, weighting lifts on the same muscles most and recent ones more; it comes before
the bodyweight estimate and needs no bodyweight.

## Offers taken, and where an extra set goes (Maintenance 13 follow-up)

Many offers rest on weeks of history that a tap does not change, so the session remembers each
offer taken: `session.coachAccepted` holds `acceptKey(signal)` (source, exercise, headline) and
`conductCoach` drops any signal whose key is there (`isAccepted`). The screens record it once the
recalibration succeeds; an action that belongs to a route is left to the route's own record.
Offers that add a set skip any entry with `manual.sets`, so they never stack. The
`adjust-volume` recommendation picks direct work: not started, sets untouched, never a strength
role, an exercise that leads with the muscle before one that includes it, isolation before
compound; with nothing direct it offers an accessory (`accessoryActionFor`) or a focus for the
next session. The `sets` trigger refuses to go past `MAX_WORKING_SETS` (8) and says why.

## A max on a lift with history (`withEnteredMax`, Maintenance 14 follow-up)

An entered max sets the first target of a lift without its own history, as before. On a lift
with logged sets the log is the better evidence, so `withEnteredMax` lets a max count only while
`enteredAt` is later than the last logged session and the max is at least `ENTERED_MAX_MARGIN`
(2.5 percent) above the log's estimate. Then the target moves toward what the max implies at
`ENTERED_WITH_HISTORY_FRACTION` (0.95, a little less careful than a first target because the
movement is known), by `ENTERED_MAX_STEPS` (two) at most, with the reason in the evidence. The
next logged session is newer than the max, so the log takes over again without anything being
cleared. The pipeline is `withSessionFatigue(withEnteredMax(recommendBiasedTarget(...)))`. The
max can be entered or updated from the exercise's Options at any time.

## Programming styles and the rep-range rule (`src/engine/planning/styles.ts`, `styleAdvice.ts`, Maintenance 15)

- **Seven styles.** `prescribe(exercise, role, profile, context?)` shapes every role from the
  style: Hybrid, Hypertrophy focus, and Strength focus exactly as before; Undulating rotates the
  lifts that carry a session (primary and secondary strength, primary hypertrophy) through
  heavy, moderate, and light zones, one zone per logged session of that lift
  (`zoneForCount`, `loggedSessionsOf`); Lean-down is Hybrid with nothing taken to failure;
  Light weights puts every loaded lift at `lightRange` (top of its usual range up, never past
  25); Foundation keeps a new lifter on moderate loads, fewer sets, and reps in reserve.
  `prescribeFor` adds the style and the zone from the profile and the log; the generator, the
  recalibration engine, and the completion summary all call it.
- **Auto.** `adviseStyle(profile)` reads experience, `goals.bodyweight`, and the two goals in a
  fixed order and returns the style, the reason in a sentence, and the sources. `resolveStyle`
  is the pick, or what Auto comes to. It never reads the log, so the plan does not move with a
  good or bad week.
- **The coach's two style offers** (`styleSignals`, preview only): a profile without
  `programStyle` is told once where its goals point, with one action that sets Auto; two or
  more lifts stalled at the prescribed effort under Hybrid or Strength focus bring "Rotate the
  rep ranges", with the research and its limits in the two lines every experience level sees.
  `allowsFailure` keeps Lean-down and Foundation free of drop sets, planned or offered, and
  Lean-down free of the extra-set offer.
- **A weight belongs to the rep range it was lifted at** (`recommendBaseTarget`). Sessions
  whose target range tops sit within `SAME_ZONE_REPS` (2) of today's are the reference; with
  none, or with one older than `ZONE_REFERENCE_DAYS` (42) behind newer sessions at other ranges,
  the load is `ZONE_FRACTION` (95%) of what the latest estimated max implies, in `estimate`
  mode. A break is measured from the latest session at any range.
- **A stall is read within one rep range** (`sameZoneAsLatest`, used by `detectStalls`). An
  estimated max read from fives and one read from fifteens differ by a few percent for the same
  lifter, so a lift that rotates its ranges is judged on the sessions run at the newest one: a
  light day neither fakes a stall nor hides one. A lift at one range is judged exactly as before.
- **Storage.** `programStyle` and `goals.bodyweight` are optional and read an unknown value as
  unset. `trainingStyle` always keeps the nearest original style (`legacyStyleFor`,
  `alignLegacyStyle` in the store), so a copy of the app from before this round still reads a
  synced profile.
- The research, study by study: `docs/research/programming-styles.md`.

## Holds (`withHoldSeconds`, `isHold`, Maintenance 20)

- **What a hold is.** A catalog exercise with `measure: 'seconds'` (Plank, Farmer Carry). The
  field defaults to `'reps'`, so every other exercise and every custom one reads as before. A
  hold's seconds are stored in the existing reps fields (`LoggedSet.reps`, whole seconds, up to
  200), so older records and other devices read them unchanged.
- **The target.** `targetReps` is `[today's seconds, top of the range]`; the top never moves, so
  the rep-range zone rule still sees one range. The first time, today's seconds are the bottom of
  the range. After a session in which every set reached the target, the next is five seconds past
  the shortest hold, rounded down to five (`HOLD_STEP_SECONDS`), never past the top; a set short
  of it keeps the target. At the top on every set, a bodyweight hold is ready for a harder
  variation (`maintain`), and a loaded carry takes the weight the load rule gives (`weight`) and
  starts again from the bottom. Until then a carry keeps the load it was lifted at, whatever the
  role's load rule said. Only the hold's own sessions count: a related exercise's reps are not
  seconds. No extra set is offered on a hold. A long break (`RETURN_AFTER_DAYS`) starts again
  from the bottom, a carry a step lighter; high fatigue repeats the target. When the place has
  nothing heavier than the load it was held at (`settleHold`, in `capTarget` and at the end of
  `recommendNextTarget`), a hold at the top stays at the full seconds; a rack that skips a step
  takes the next real weight, from the bottom.
- **Kept out of the weight maths.** `toPoint` gives a hold no estimated max, so plateau, stall
  routes, the return and zone estimates, `withEnteredMax` and Progress's strength rows pass it
  by. `knownLifts` (cross-lift estimates), personal records, volume (completion and Progress),
  fatigue drift, strategy insights and the coach's rep cards (reps fell, aim higher, capped) skip
  holds by `isHold`/`holdById`. The max sheet is never offered for one. Autoregulation does not
  run on a hold's sets, and `lightRange` keeps a hold's own range.
- **Time.** `workSecondsFor(entry, set, hold)` counts a hold as its seconds plus the set overhead,
  not reps at a tempo; `remainingMinutes` takes away the part of a running hold already counted.
- **The countdown.** `WorkoutSession.hold` (`HoldState`) holds an absolute `endsAt`, frozen into
  `pausedRemaining` by a pause and re-armed by resume, and `held` once stopped early.
  `heldSeconds` is the seconds finished with: `held`, or the full length once `endsAt` passes.
  Start ends a running rest; a log, skip, undo or finish clears it; a rebuild keeps it only while
  its entry is still a hold (`holdStillFits`). The stored field reads an unknown shape as none.

## Pain from the rating (`src/engine/recovery/painReport.ts`, Maintenance 20)

- The rating keeps an optional `joint` beside `pain`. `lastPainReport(history)` reads the
  newest saved workout (by `completedAt ?? startedAt`); with pain and a joint, it is the report,
  however long ago, until a later workout answers it again. Pain without a joint names nothing.
  `painNextLine` promises the coach's flag only for a joint some exercise loads at moderate or
  high stress.
- The coach (`RATING_PAIN_SOURCE`) names the first remaining, unstarted exercise with moderate or
  high stress on that joint, with the source line first ("Sep 12, Push + arms: shoulder."), and
  offers the swap. Not on a finished workout, and not when the same joint is marked as hurting
  today, whose card already covers it.
- The accessory picker treats the joint as a pain joint, and `rankAlternatives` leaves out high
  stress on it and ranks moderate stress 12 lower, with the reason in words.
