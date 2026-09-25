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
   muscle goes later, and lower-back work last (Gentil 2017; Mannarino 2021). How much a main
   lift's secondary muscles count, and what a circuit does, were settled from the evidence below.
3. Only when every isolation exercise is out and the session still runs over does a main lift
   give way, as today.
4. Default-length sessions are unchanged.

## What was built (Maintenance 24)

- The rule above, in the generator (`leaveOutRank`), for the row cap and the fit to time, in a
  fresh plan and in every rebuild. A main lift's sets count in full for its primary muscles and
  at half for its secondary ones, and an isolation exercise goes the sooner the more its
  least-trained muscle already gets (settled below). Core work always counts as the day's only
  work for the core, since squats bracing it are not core training. A row ranks as its best-kept
  exercise. A circuit shrinks to a pair before it goes whole (settled below).
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
  rear-delt fly and curl pair goes, and the hammer curl stays: the chin-ups train the biceps in
  full and the rows half, the rows give the rear delts half a set a set, and the hammer curl's
  forearms get the least, half a set for each chin-up set.
- Measured across 2,700 plans at 15, 30 and 45 minutes (the gym, home, and dumbbells to 15, 20 or
  30 lb; five templates; four goals; default lengths of 45, 60 and 75 minutes; techniques on and
  off), against the order before: 1,344 changed. In 666 the plan keeps more main lifts. In 48 it
  keeps one fewer, all at 15 minutes at the light dumbbells, where the old order kept two main
  lifts that ran over: two presses, 2.4 or 2.6 minutes over, in 24, and a goblet squat with a
  dumbbell bench press on the full-body day, 1.6 over, in the other 24.
- Point 4: a fresh plan at a default length of 60 or 75 minutes changed in none of 600. A default
  of 45 minutes is a 45-minute session, so it follows this rule like choosing 45 (88 of those 300
  plans changed).
- Time: "Even the leanest version runs about N min over" shows when a plan runs more than a minute
  over. No fresh plan at 15, 30 or 45 minutes does now, against 216 at 15 minutes with the old
  order. Across 480 rebuilds (a session shortened while not started, with its main lift pinned,
  under way, or one set in), none runs over where the old order fit, and 69 of the 81 that ran
  over with it no longer do. The other 12 are a goblet squat under way at the light dumbbells that
  alone needs 1.2 to 1.9 minutes more than the minutes left; the old order ran up to 10.6 over.

## Settled from the evidence (2026-09-25)

The owner asked that both open questions be decided by the best available evidence rather than
by preference, with the evidence and its limits written down. Every source was checked on PubMed
(E-utilities) on 2026-09-25.

### How much a main lift's secondary muscles count

- The strongest evidence: a meta-regression of 67 studies (2,058 participants) compared three ways
  of counting sets that train a muscle indirectly: in full, at half, or not at all. Counting them
  at half predicted growth and strength best. Gains rose with volume, with diminishing returns
  (Pelland, Remmert, Robinson, Hinson and Zourdos, 2026, Sports Medicine, PMID 41343037).
- A review of the biomechanics and muscle activation reached the same direction: a multi-joint
  set cannot be assumed to count one-for-one for every limb muscle it involves (Schoenfeld, Grgic,
  Haun, Itagaki and Helms, 2019, Sports, PMID 31336594).
- Exercise by exercise, where trials exist:
  - Biceps from rows: curls grew the elbow flexors about twice as much as dumbbell rows (11.1%
    against 5.2% in 8 weeks, randomized within subjects) (Mannarino et al., 2021, Journal of
    Strength and Conditioning Research, PMID 31268995). That is about half, as counted.
  - The bench press grew the chest, front delts and triceps, the chest most, and the side delts
    least (10 weeks, randomized, MRI) (Lanza et al., 2024, Journal of Bodywork and Movement
    Therapies, PMID 39593465). The catalog already lists no side-delt work for a bench press.
  - Hamstrings from squats and hip thrusts: full or half squats grew the quadriceps, adductors and
    glutes but not the hamstrings (10 weeks, randomized, MRI) (Kubo, Ikebukuro and Yata, 2019,
    European Journal of Applied Physiology, PMID 31230110), and back squats and hip thrusts grew
    the hamstrings little or not at all (9 weeks, randomized, MRI) (Plotkin et al., 2023,
    Frontiers in Physiology, PMID 37877099).
- The rule built: a main lift's set counts one set for its primary muscles, half a set for its
  secondary ones (the same half the weekly volume already used, `INDIRECT_SET_WEIGHT`), and
  nothing for the hamstrings in a squat (back squat, leg press, Smith squat) or a hip thrust or
  glute bridge (`mainLiftSets`). An isolation exercise then stays the longer the less work its
  least-trained muscle gets from the day's main lifts (`leaveOutRank`: one over one plus that
  work), since more sets bring less the more a muscle already has (Pelland 2026). The day's only
  work for a muscle stays as long as core work; the lowest value still breaks a tie.
- Uncertainty: half a set is an average across muscles and exercises; the true share differs by
  muscle and exercise, and trials exist for only a few pairs. The catalog's primary and secondary
  labels decide which share applies; a chin-up, for example, lists the biceps as primary, and no
  trial has compared chin-ups with curls. Lunges and split squats list the hamstrings as
  secondary, and no trial has measured their hamstrings, so they count half. The weekly volume
  still counts a squat's hamstrings at half (Proposed). The comparison is within the session:
  which exercises a plan picks still follows the week's volume.

### A circuit on a short session

- Pairing moves (supersets) keeps the repetitions and the volume load in a shorter session, with
  similar long-term strength and growth, across 19 studies (313 participants) (Zhang, Weakley, Li,
  Li and García-Ramos, 2025, Sports Medicine, systematic review and meta-analysis, PMID 39903375).
  That holds for moves on different muscles: in its subgroup analysis, pairs of opposing muscles
  allowed more repetitions than straight sets, and pairs of similar movements lost volume load.
  In a 10-week randomized trial, supersets nearly halved session time, with similar changes in
  body composition and slightly smaller strength gains in two pulling lifts (Iversen, Eide,
  Unhjem and Fimland, 2024, Journal of Strength and Conditioning Research, PMID 39072654).
- Time-efficient training favors supersets and similar methods, which roughly halve training time
  while keeping the volume (Iversen 2021, above). The 2026 position stand of the American College
  of Sports Medicine, an overview of 137 systematic reviews (more than 30,000 participants), found
  that set structure did not consistently change outcomes, while growth rose with volume (Currier
  et al., 2026, Medicine and Science in Sports and Exercise, PMID 41843416).
- The rule built: a circuit's three moves shrink to a pair before the circuit goes whole
  (`shrinkCircuit`). The move the order leaves out first goes, the one the day's main lifts train
  most, and can come back on its own; the two left run as a pair, the smallest group that still
  alternates moves. A pair that still does not fit follows the rules for pairs: it goes whole, and
  a move from it can come back on its own. Why a pair rather than one move: pairing costs no
  measurable adaptation and keeps more sets in the same minutes, and with diminishing returns the
  first sets a muscle gets bring the most. The app pairs only moves that share no primary muscle,
  and a circuit's three moves always train different muscles, since each template gives them
  different muscles, so the pair left does too. None of 20,980 shrinks checked across every coach
  focus, nor of 135,132 with each circuit move and each two of them disliked (every place,
  template, goal, program style, rest setting and experience), left a pair on one muscle. The
  shrink itself does not check it (Proposed).
- Uncertainty: the superset evidence is mostly for pairs, much of it short-term; three-move
  circuits are less studied, and no trial has compared shrinking a circuit with dropping it. The
  benefit rests on the volume dose-response and on pairs keeping their volume in less time.
- Measured: at 30 minutes the pair itself seldom fits, so a circuit usually ends as its best-kept
  move on its own, now the lateral raise on push and upper days, since the side delts get only
  half a set from the shoulder press, where the fly or the pushdown came back before. With an
  exact end time the pair often fits: in 231 of 1,248 shrunk circuits checked across end times,
  places, rest settings and program styles, the pair stays in the plan.
- Against the plans before these two decisions: 426 of the 2,700 short plans and 72 of the 300
  with a 45-minute default keep different isolation moves; none changed its main lifts or its
  number of moves, and none runs more than a minute over. Default lengths of 60 and 75 minutes
  are unchanged (0 of 600). Of the 480 rebuilds, 90 changed, and the same 12 run over.
