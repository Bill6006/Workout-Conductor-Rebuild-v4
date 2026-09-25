# Sets well short of their target weight (the owner's item 21)

Agreed on 2026-09-23; built in Maintenance 23 (round E).

## The problem

When the weights at a place cannot make a set's target (a missing plate, or dumbbells that stop
short), the app takes the nearest weight under it and adds reps that keep the effort the same:
one to three more (`extraRepsFor` in `src/engine/progression/progression.ts`). At the heaviest
weight a place has, it adds up to two. When the weights are well short, more than about 10%
lighter (mostly light dumbbells at home), three extra reps can leave a muscle-building set with
far more reps in reserve than planned: an easy set, not the planned one.

## What the research says

Both papers were checked on PubMed (E-utilities) on 2026-09-24.

- Muscle grows about as much with light loads as with heavy ones when the sets are hard enough.
  A meta-analysis of 21 trials compared low loads (60% of the one-rep max or less) with high
  loads, every set taken to momentary failure. Muscle growth was similar; one-rep-max strength
  favoured the heavy loads (Schoenfeld, Grgic, Ogborn and Krieger, 2017, Journal of Strength and
  Conditioning Research, systematic review and meta-analysis, PMID 28834797).
- How close a set ends to failure matters for muscle, and much less for strength. Across a series
  of exploratory meta-regressions, muscle growth increased as sets ended closer to failure, while
  strength gains were similar across a wide range of reps in reserve. The authors ask for caution:
  the reps in reserve were estimated from the studies' descriptions (Robinson, Pelland, Remmert,
  Refalo, Jukic, Steele and Zourdos, 2024, Sports Medicine, PMID 38970765).

## The design that follows

1. A muscle-building set (any role but a strength one) whose load is more than 10% under the one
   asked for runs to its planned reps in reserve. The reps it is given follow the effort (the same
   estimated-max match as before, no longer stopped at three, and never past 30), and the line by
   the target says so. For 8-12 reps asked at 50 lb where the dumbbells here make 40: "The weights
   here make 40, not 50 lb: about 10 more reps, to 2 in reserve." At the heaviest weight a place
   has, the same rule gives "Held at the heaviest weight here (40 lb): about 10 more reps, to 2 in
   reserve."
2. A strength set keeps the old rule, one to three extra reps: its strength follows the load, and
   a lighter day barely matters to it (Schoenfeld 2017; Robinson 2024).
3. A set 10% light or less keeps the old rule too: the few extra reps already keep the effort.
4. The 10% line is a judgement that applies these findings; no study set it.
