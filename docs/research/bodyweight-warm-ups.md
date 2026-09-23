# Warm-ups on lifts done at bodyweight (the owner's item 22)

Agreed on 2026-09-23: "whatever research suggests, that is what I agree on". Not built yet.

## The problem

A bodyweight lift the catalog counts as a main compound (Chin-Up, Pull-Up, Dip) gets one warm-up ("ramp") set
in a workout of 30 minutes or less and two in a longer one, each asking for the working range at
RIR 5 ("Target 6-12", "Easy, RIR 5"). A weighted lift's ramp is the same move with less weight.
At bodyweight nothing can come off, so the "warm-up" is a full set at the working load, easy only
for someone good for 11-17 reps. For a lifter doing 5, 4, 4 it is a hard set before the sets
that count. Round C (Maintenance 21) only kept it from asking for more reps than the working sets.

## What the research says

Every paper below was checked on PubMed (E-utilities) on 2026-09-23. None tested a chin-up or
pull-up warm-up; the findings are about warm-ups for resistance exercise in general.

- A warm-up specific to the exercise is the part worth keeping. A review of time-efficient
  training advises restricting the warm-up to exercise-specific warm-ups (Iversen, Norum,
  Schoenfeld and Fimland, 2021, Sports Medicine, narrative review, PMID 34125411).
- Heavier and shorter beats lighter and longer. In trained men, a warm-up of 5 reps at 80% of
  the 10-rep max gave more total training volume in the session than 10 reps at 60% or 15 reps
  at 40% (Viveiros et al., 2024, Journal of Bodywork and Movement Therapies, crossover,
  PMID 39593476). A systematic review of upper-body warm-ups found strong evidence that
  high-load dynamic warm-ups enhance strength and power (McCrary, Ackermann and Halaki, 2015,
  British Journal of Sports Medicine, PMID 25694615).
- A warm-up set that tires the muscle costs reps. In older trained women, a specific warm-up
  set lowered repetitions on two upper-body lifts (triceps pushdown, preacher curl) compared
  with no warm-up (Lisboa et al., 2024, Aging Clinical and Experimental Research, crossover,
  PMID 39725788).
- For sets taken to failure at 80% of the max, the kind of warm-up (none, specific, aerobic or
  both) made no difference to the reps done (Ribeiro et al., 2014, Perceptual and Motor Skills,
  crossover, PMID 25153744). For a heavy, low-rep effort, a general warm-up added to the
  specific one raised leg-press 1RM by 8.4% (Abad et al., 2011, Journal of Strength and
  Conditioning Research, PMID 21544000); the app's general warm-up stays as it is.

## The design that follows

At bodyweight the load is already the working load, so the one thing left to set is how many
reps. The evidence points to few reps, well short of failure, in one set:

1. A lift with no load reference (`hasNoLoad`) gets at most one warm-up set, never two.
2. That set asks for a few easy reps at bodyweight: about a third to a half of the bottom of the
   working range (2-3 before sets of 6-12; 1 before sets of 3-6), never more than the working
   sets ask. This is a judgement that applies the studies' principle; no study set this number.
3. Its hints say it plainly (a few easy reps, stopping well short), not "Target 6-12, RIR 5".
4. Unchanged: no warm-up when an earlier exercise today already worked the same movement,
   "Skip warm-up sets" stays, and warm-up sets never count as work.
