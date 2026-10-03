# A recent set and a known max (the owner's item 36)

Seen on the live app on 2026-09-25 and built in Maintenance 25 (round G). The owner: "changing the
entered weight can still leave me with what appears to be the same target." Both ways of entering a
max were traced through the real engine before anything was changed.

## What the trace found

Both paths end in one stored estimated max: "A recent set" is turned into one with Epley, "I know
my max" is kept as typed. From there the save rebuilds the lift's target. Three things made the
target look stuck, and the sheet made it worse:

1. **The preview was a second copy of the rule.** The sheet worked out its own first target from
   the max, and left out what the save does after it: the weights at the place, a lift's logged
   sets, and the day's effort. At home with dumbbells to 20 lb, a max of 60 or 80 previewed 40 or
   55 lb × 6-10 reps; the plan put 20 lb × 26-30 either way. On a lift with logged sets, a max of
   185, 190 or 200 left the bench press at 160 while the sheet said 140 to 150.
2. **Reps past twelve counted as twelve.** A recent set of 20 lb × 15, × 20 or × 25 gave the same
   estimate (28), and the same target.
3. **An estimate rounded down onto the heaviest pair read as met.** The first target is 90% of what
   the estimate implies, rounded to a 5 lb step. An estimate asking 21.9 lb became 20, which
   dumbbells to 20 lb make, so the set kept its plain 6-10 reps: someone who had just done 20 reps
   at 20 lb was asked for 10 "at 1 in reserve". An estimate asking 22.6 became 25, over the pair,
   and the reps ran to 16-20. A small change in the entry flipped the plan.

At the gym with nothing logged, both paths worked and the preview matched the plan. Entered as a
recent set, a set gives a lighter first target than the same set logged (135 × 8: 120 lb against
135), by design: a first target is 90% of what an estimate implies.

The independent reviews of the first fix traced every other path an entered max takes and found
five more places where it was ignored, misread, or described wrongly:

4. **A strength lift at the heaviest weight a place has ignored every entry.** A strength set held
   far under its load got two extra reps at most, so the owner's main lift at home, the dumbbell
   bench press at 20 lb, planned 20 lb × 6-8 "at RIR 2" for sets of 20 × 15 to 20 × 30 and maxes
   of 40 to 100 alike. At about a third of the max, "RIR 2" was untrue: the set stopped some twenty
   reps short.
5. **The log and the entry were read by different rules.** Logged sets count reps up to twelve, a
   recent set up to thirty, so the same set of 100 × 20, logged and then entered, read as 140
   against 167 and moved the target two steps.
6. **A lift logged at another rep range ignored both inputs.** Its target is read from the log's
   estimate (mode `estimate`), a path the entered max never reached: a bench logged at 10-12 kept
   140 × 4-6 for a max of 120 or of 300.
7. **After three weeks away, a max set the start with no limit.** The sheet promised "two steps at
   most", and a max of 300 took a bench from 130 to 215.
8. **The sheet said "stays" when the reps moved.** The outcome was judged on the weight alone:
   at the heaviest pair, where a max moves only the reps, the preview read "Today's target stays
   20 lb × 25-29 reps" beside the engine's own line "up 2 steps toward it".

Smaller ones: a deload week lightened the load but not the estimate it was rounded from, so reps
went up at the heaviest pair in a deload week; the preview repeated lines from a max saved before;
the words for a lift with its weight set by hand promised a count the log then overrode; the
Options line showed a set saved before in the old reading; a saved set with no weight could
override a good max.

## What the research says

Every paper was checked on PubMed (E-utilities) on 2026-09-25.

- **Reps and load.** A meta-regression of 952 tests to failure in 7,289 people (269 studies)
  estimated the reps possible at each share of the one-rep max: about 5 at 90%, 10 at 80%, 15 at
  70%, 20 at 60%, 26 at 50% and 30 at 45%. The relation is curved, and people differ widely: the
  spread between people is about 2.5 reps at 80% and 4.4 at 60%, growing as loads get lighter
  (Nuzzo, Pinto, Nosaka and Steele, 2024, Sports Medicine, PMID 37792272). Epley's estimate stays
  within about 6% of those means from 5 to 20 reps, and beyond 20 it falls below them, by about 7%
  at 26 reps and 10% at 30: there it errs toward a lighter target.
- **Estimating a max from more reps.** In 70 men and women, the one-rep max was predicted well from
  5, 10 and 20 repetition maximums (R² 0.92 to 0.99 in multiple regression), 5 best; the load fell
  non-linearly as the reps rose, and the authors advise no more than 10 reps in a linear equation
  (Reynolds, Gordon and Robergs, 2006, Journal of Strength and Conditioning Research, PMID
  16937972). A 20-rep set still says a lot about strength; a cap at twelve throws that away.
- **Moving a load.** When a lifter beats the target by one or two reps, a 2-10% increase in load is
  recommended (American College of Sports Medicine position stand, 2009, Medicine and Science in
  Sports and Exercise, PMID 19204579). The engine already moves a lift with logged sets at most two
  steps toward a higher max, inside that range at the gym.
- **Light loads and effort.** In 25 untrained men, each leg trained knee extensions for 8 weeks
  under one of four conditions, volume equated: 30% or 80% of the max, to failure or not. At 30%,
  sets to failure (about 34 reps) grew the quadriceps 7.8%, as much as the heavy conditions, and
  sets stopped short (about 20 reps) grew them 2.8%, a change that was not significant. Strength
  rose about 16-18% at 30% either way, against about 33% at 80% (Lasevicius, Schoenfeld and
  colleagues, 2022, Journal of Strength and Conditioning Research, PMID 31895290). At a light load,
  effort is what trains the muscle; the load alone limits the strength gain, whatever the effort.
- **Time away.** A meta-analysis of 103 studies found that stopping resistance training lowers
  maximal force (standardised mean difference -0.46) and submaximal strength (-0.62), more the
  longer the break (Bosquet, Berryman, Dupuy and colleagues, 2013, Scandinavian Journal of Medicine
  and Science in Sports, PMID 23347054). After weeks away, a lower max is a plausible report of
  strength lost, not a slip.

## The design that follows

1. **The preview is the save's own result.** The sheet asks the store what saving would do; the
   store runs the save's rebuild on the session as it stands, saves nothing, and returns the lift's
   first working set and the engine's words: "First target: 20 lb × 8-12 reps at RIR 1. Held at the
   heaviest weight here (20 lb): the reps go up instead." With logged sets it says whether the max
   moved the target ("Your max of 260 lb, entered after you began this lift last time, says more
   than your logged sets: up 2 steps toward it.") or left it ("your logged sets already say as much
   as this max"), and on a lift under way that the max counts from the next session. This replaces
   Maintenance 23's choice to preview, at the heaviest pair, the load a set stands in for beside
   the range: the preview now shows the weight and reps the plan asks, from the same set.
2. **A recent set counts its reps up to thirty**, as far as the rules take a light set to its
   reserve (Maintenance 23, `docs/research/lighter-loads.md`). A set entered before this is read by
   the same rule from the set it was saved with.
3. **An estimate rounded down onto the heaviest weight a place has, that asked for more than it, is
   held there with the reps up a little**, as any target over the heaviest weight by less than 10%
   is: two more at most. Targets over the heaviest weight after rounding are fitted as before.
4. **A max on a lift with logged sets follows the rule it had**: it counts only when newer than the
   last session and 2.5% or more above what the logged sets say, and moves the target at most two
   steps. A lower max leaves the target: the logged sets are the better evidence. The preview now
   says which of these happened. After the reviews:
   - **The log is read as the entry is** for this comparison: the last session's best set, every
     rep counted up to thirty. The same set logged and entered says the same and moves nothing.
     The rules that set a target from the log keep their own reading.
   - **A target read from the log's estimate at another rep range counts a max the same way**:
     two steps at most toward one that says more, none for one that says less.
   - **After three weeks or more away, a lower max counts too**, since the break may have cost
     strength (Bosquet 2013): the start is the lighter of the max's and the logged sets'. One that
     says more moves the logged start two steps at most, as the sheet says.
5. **A strength set well short of its load runs to its reserve, as a muscle-building set does.**
   This revises point 2 of the rule agreed on 2026-09-23 (docs/research/lighter-loads.md): at a
   third of the max, only the effort trains the muscle, and the strength gain is the same either
   way (Lasevicius 2022), so an easy set labelled "RIR 2" gave nothing and said something untrue.
   The dumbbell bench at 20 lb now plans 4-6 reps for a recent set of 20 × 10, 6-8 for 20 × 15,
   13-15 for 20 × 20, 22-24 for a max of 40 and 28-30 for a max of 60 or more, each at RIR 2. Such
   a set takes its own tempo, not the slower one of the heaviest weight: its reps bring the effort.
   A strength set within a tenth of its load keeps two extra reps and the slower tempo.
6. **"Stays" means the whole target stays**: its weight, reps and reserve. A move of any of them is
   "Today's target: ...", and the save's headline says the target moved toward the max.
7. **The smaller fixes**: a deload week lightens the estimate with the load; the preview shows the
   engine's lines only when the max set the target now; a lift with its weight set by hand says
   "Sets of it you log today count instead of this max"; Options reads a saved set by today's rule;
   a saved set with no weight or no reps gives no max, and the saved estimate stands.

## Measured

Fresh plans against the Maintenance 24 build (`4addd33`): 3,600 of them, every combination of three
technique settings (pairs on; pairs and circuits on; everything off), five places (the gym, home,
dumbbells to 15, 20 or 30 lb), five templates, four goals, default lengths of 45, 60 and 75 minutes,
and 15, 30, 45 minutes and the default. 2,016 changed, all at dumbbells to 15, 20 or 30 lb (720, 720
and 576 plans); the gym and the full set at home are as they were. Of those, 547 changed only their
loads or reps, 432 a set count, and 1,037 leave out a move the old build kept: the strength lifts
run to their effort now, and their longer sets take the minutes. Most often the curl (348 plans),
then Chin-Up (144, every one a 15-minute pull or upper day at dumbbells to 15 or 20 lb, where the
row alone now fills the minutes). None runs more than a minute over.

Rebuilds (a new length, from 15 to 45 minutes, on a plan fresh, begun, one set in, or with the main
lift pinned; four places, five templates, two technique settings): 480, of which 240 changed, all at
dumbbells to 15 or 20 lb. 42 more than before run over by more than a minute, up to 5.2: each a
15-minute rebuild of a session begun or with the main lift pinned, where the main lift alone at its
fewest sets no longer fits the minutes left. The plan says so ("Runs about 5 min over 15 min"), as a
main lift that cannot shrink always has (docs/workout-engine.md).

At home with dumbbells to 20 lb, an incline press entered as a recent set of 20 × 15, 20 × 20 and
20 × 25 plans 6-10, 8-12 and 16-20 reps at 20 lb, where all three planned 6-10; 30 × 10 and 40 × 8
plan 16-20 and 26-30.

## Uncertainty

- The meta-regression's tables are means across people; a lifter can sit several reps either side.
  The 90% first target and the two-step limit are the margin, and the first logged set takes over.
- A recent set is read as taken to failure. A set that was not reads as weaker than it was: safe,
  but the first target runs light.
- Past thirty reps a set is read as thirty, and at the heaviest pair the reps stop at thirty: a max
  far above what the pair can make gives the same 26-30 reps, and the line says so.
- The target moves in the weight steps a place has. Two entries whose estimates round to the same
  load give the same target: on the dumbbell bench at 20 lb, recent sets of 20 × 20 and 20 × 25 both
  ask 25 lb and both give 13-15 reps, and on the incline one more rep can move the reps by several
  where the estimate crosses a step (20 × 21 gives 8-12, 20 × 22 gives 16-20). Reading the load
  between steps would need a stored load off the steps, which the sets that remember what they
  stood in for do not keep.
- A light place's strength lift now takes minutes the old easy sets did not, so short sessions there
  keep fewer moves (see Measured). Fewer hard sets are the better trade at a light load (Lasevicius
  2022); the order that decides what goes is the one agreed in Maintenance 24.
- The 10% line between a small push and a run to the reserve is Maintenance 23's judgement; no
  study set it.
