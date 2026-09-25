# What gives way when a short session runs over (the owner's item 33)

Agreed on 2026-09-24, with the recommendation below, on the condition that research backs it;
to be built in a coming round.

## The problem

Round E made sets at light dumbbells longer: a muscle-building set well short of its load runs to
its planned reserve, often 25-30 reps. At home with dumbbells that stop at 20 lb, a 30 or 45
minute session then runs over, and the time fit leaves a whole exercise out. Today it picks by a
rule that keeps paired moves first on short sessions, so on the pull day at 30 minutes it leaves
out Chin-Up while two 25-30 rep shrug sets stay. Default-length sessions keep every exercise and
run up to 5 minutes longer.

## What the research says

Every paper was checked on PubMed (E-utilities) on 2026-09-24.

- When time is short, multi-joint exercises come first. A review of time-efficient training
  recommends prioritizing multi-joint exercises, with at least one leg press, one upper-body pull
  (a pull-up, for example) and one upper-body push. It also finds sets of 15-40 reps effective
  when taken to failure (Iversen, Norum, Schoenfeld and Fimland, 2021, Sports Medicine, narrative
  review, PMID 34125411).
- Adding single-joint exercises to multi-joint training added no arm size or strength, in
  untrained men over 10 weeks (Gentil et al., 2013, Applied Physiology, Nutrition, and
  Metabolism, randomized trial, PMID 23537028) and in trained men over 8 weeks (de França et al.,
  2015, same journal, randomized trial, PMID 26244600).
- A review of 23 studies found no extra upper-limb gains from single-joint work on top of
  multi-joint work. Single-joint work may be needed for the lower back and to correct imbalances
  (Gentil, Fisher and Steele, 2017, Sports Medicine, review, PMID 27677913).
- The other side: in one trial, curls grew the elbow flexors more than dumbbell rows did (11%
  against 5% in 8 weeks, untrained men, one arm each) (Mannarino et al., 2021, Journal of
  Strength and Conditioning Research, PMID 31268995). An isolation exercise can matter for a
  muscle the main lifts barely train.
- Left out on purpose: a 2020 study of recreational bodybuilders on the same question (Barbalho
  et al., European Journal of Sport Science, PMID 31072272) has been retracted.

## The design that follows

1. When a session at the length chosen cannot fit every exercise, the main lifts stay
   (multi-joint: presses, rows, pull-ups and chin-ups, squats, hinges) and an isolation exercise
   gives way first (Iversen 2021; Gentil 2013; de França 2015; Gentil 2017).
2. Among isolation exercises, one whose muscles the day's kept main lifts already train goes
   first, such as a curl on a day with chin-ups and rows. One that is the day's only work for its
   muscle goes later, and lower-back work last (Gentil 2017; Mannarino 2021).
3. Only when every isolation exercise is out and the session still runs over does a main lift
   give way, as today.
4. Default-length sessions are unchanged.

## What was built (Maintenance 24)

- The rule above, in the generator (`leaveOutRank`), for the row cap and the fit to time, in a
  fresh plan and in every rebuild. A main lift's secondary muscles count as trained, as in the
  design's own example (rows and chin-ups train the biceps), and core work always counts as the
  day's only work for the core, since squats bracing it are not core training. A row ranks as its
  highest-ranked exercise.
- Point 3, down to two exercises: a row that still does not fit goes, and a move left out that
  fits in its place comes in, the one this order keeps longest first, tried with its rest cut as
  far as the fit cuts rests (never longer than its own), then at fewer sets, down to two. So once
  no isolation move is left, a main lift gives way, to a move that fits where one does: at 15
  minutes at the gym an upper day keeps Barbell Bench Press and a Chin-Up in place of the barbell
  row, and at a home with dumbbells to 20 lb a push day keeps Dumbbell Bench Press and two sets of
  Dumbbell Curl in place of the incline press. With nothing that fits, the main lift stays alone
  and takes back the sets the fit trimmed while they fit, since the time is then that lift's: a
  session shortened to 15 minutes with the bench press under way keeps the bench press alone, as
  the old order did with supersets on (with them off it kept two presses, 4.2 to 5.7 minutes
  over); a workout started at 15 minutes that moves home 4 minutes in keeps the dumbbell bench
  press alone at its 4 sets. With an exact end time the rows go one by one, and the lifts left
  take back their trimmed sets the same way.
- When rows left out, by the row cap or for time, leave minutes unused, their moves come back on
  their own while they fit, the one this order keeps longest first, each tried the same way.
- The owner's case: the 30-minute pull day at home with dumbbells to 20 lb now keeps Chin-Up. The
  hammer curl goes first, then the curl and rear-delt pair, and the curl comes back on its own.
- Measured across 2,700 plans at 15, 30 and 45 minutes (the gym, home, and dumbbells to 15, 20 or
  30 lb; five templates; four goals; default lengths of 45, 60 and 75 minutes; techniques on and
  off), against the order before: 1,128 changed. In 666 the plan keeps more main lifts. In 48 it
  keeps one fewer, all at 15 minutes at the light dumbbells, where the old order kept two main
  lifts that ran over: two presses, 2.4 or 2.6 minutes over, in 24, and a goblet squat with a
  dumbbell bench press on the full-body day, 1.6 over, in the other 24.
- Point 4: a fresh plan at a default length of 60 or 75 minutes changed in none of 600. A default
  of 45 minutes is a 45-minute session, so it follows this rule like choosing 45 (40 of those 300
  plans changed).
- Time: "Even the leanest version runs about N min over" shows when a plan runs more than a minute
  over. No fresh plan at 15, 30 or 45 minutes does now, against 216 at 15 minutes with the old
  order. Across 480 rebuilds (a session shortened while not started, with its main lift pinned,
  under way, or one set in), none runs over where the old order fit, and 69 of the 81 that ran
  over with it no longer do. The other 12 are a goblet squat under way at the light dumbbells that
  alone needs 1.2 to 1.9 minutes more than the minutes left; the old order ran up to 10.6 over.
