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
cleared by a restore. Safety signals are never put away.

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
sessionLoading, exercise, units)` derives `available` (the list, or null for a bar), `step` (the
real increment: the smallest gap on the stack or between dumbbells, or twice the smallest plate
the rack has today), `cap` (the heaviest weight, or null), and `perSide` for plate math.
`fitWeight` snaps a target down onto the list or onto the bar's grid, never below a floor;
`nudge` moves the dial through real weights. A place with nothing recorded behaves as before.

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
