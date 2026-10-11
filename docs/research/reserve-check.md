# How well the lifter judges reps in reserve (the owner's item 43)

Agreed on 2026-10-09 ("All is approved except for number 48"), built in Maintenance 27 (round I),
first in the owner's order (2026-10-10). The agreed text: "Learn how well the lifter judges reps in
reserve: opt-in, the last set of one machine or isolation lift every few weeks goes to failure and
the app learns the typical error (Halperin et al., 2022); off under Lean-down and Foundation, which
take nothing to failure. Whether and how it uses sets to failure, how often, and on which exercises
is settled from the evidence first." The proposal behind it said why: "Every adjustment and stall
rule depends on that guess."

Every paper below was checked on PubMed (E-utilities) on 2026-10-10, with the open full text read
where there was one.

## The problem

Every rule that reads a logged set reads the reserve the lifter judged: how hard a set was decides
the next load (progression), whether a lift has stalled or is being undershot (stall routes),
whether today's next sets come down (in-session adjustment), how tired the lifter is (fatigue drift)
and whether the start was bad (item 42). If a lifter's judgement is off, all of them are off the same
way, and nothing in the app could tell.

## What the research says

### How far off lifters are

- On average lifters judge about one rep fewer than they have left: 0.95 reps (95% CI 0.17 to 1.73).
  Judgements are better near failure and in sets of fewer reps: the error grows by about 0.06 reps per
  rep up to twelve reps to failure, and by about 0.47 per rep past twelve (Halperin, Malleron,
  Zalcman, Behm and Emanuel, 2022, Sports Medicine, systematic review and meta-analysis, PMID
  34542869). Its 1.45-rep standard deviation is the spread between people making one prediction each:
  it mixes a person's own lean with that set's noise.
- Trained lifters near failure on the bench press were close: -0.17 ± 1.00 reps raw (Refalo and
  colleagues, 2024, PMID 37967832). On squat sets of about sixteen reps the error was 2.05 ± 1.73 reps
  at a call of one in reserve (Zourdos and colleagues, 2021, PMID 30747900). On machines, neither
  exercise, sex nor experience changed accuracy (Remmert and colleagues, 2023, PMID 37036795). A design
  that hid the purpose found about two reps of underprediction (Armes and colleagues, 2020, PMID
  33424678).

### Whether practice helps

- Over six weekly sessions of sets to failure, the average error fell by 0.8 to 2.3 reps, in younger
  and older adults alike (Wiedenmann and colleagues, 2026, PMID 42632893). Accuracy also improved over
  eight weeks of training in another trial (Hermann and colleagues, 2025, PMID 40249908).
- Experienced lifters did not improve over six weeks (Remmert 2023, PMID 37436724; Hackett 2023, PMID
  36730216; Hackett 2018, PMID 29337829).

### Whether a lifter's own error can be learned

- No study reports the spread of one person's error from set to set. One found a person's error highly
  repeatable from day to day (ICC 0.98), but only in very high-rep sets with blood-flow restriction
  (Grant and colleagues, 2025, PMID 40644671).

### What sets to failure cost

- Training to failure adds no strength and little or no muscle against the same volume short of it,
  and does no harm (Grgic and colleagues, 2022, PMID 33497853; Vieira and colleagues, 2021, PMID
  33555822; Refalo and colleagues, 2023, PMID 36334240; Robinson and colleagues, 2024, PMID 38970765;
  the 2026 ACSM position stand, PMID 41843416). A check is for the information, not for growth.
- It costs more fatigue, muscle damage and discomfort, recovered within 24 to 48 hours, and more with
  more failure sets and more reps per set (Vieira and colleagues, 2022, PMID 34881412; Morán-Navarro
  and colleagues, 2017, PMID 28965198; Pareja-Blanco and colleagues, 2020, PMID 30036284; Refalo and
  colleagues, 2023, PMID 36752989).
- After a set to failure, the next set got about 70% of the reps (Nuzzo and colleagues, 2024, PMID
  38781472): a last set costs no later set.
- 90.4% of weight-training injuries seen in US emergency rooms involved free weights, 65.5% of them a
  dropped weight (Kerr and colleagues, 2010, PMID 20139328). These are counts, not rates.
- Blood pressure at failure averaged 255/190 mmHg even on a one-arm curl (MacDougall and colleagues,
  1985, PMID 3980383); the 2026 ACSM stand calls failure possibly inadvisable for older adults.

### How research measures it

The lifter calls the reps they think are left at a point in the set, then, without racking, goes on to
momentary failure: a rep they cannot finish without a break in form (Steele and colleagues' definition;
Zourdos 2021, Remmert 2023, Refalo 2024, Wiedenmann 2026, Hermann 2025). The reps after the call are
the true reserve there.

## What the app does

Each rule says what it rests on: the evidence, the arithmetic, or a judgement.

1. **Opt-in.** Settings > Programming: "Check how well I judge reps in reserve", off by default, with a
   plain caution to leave it off with high blood pressure or a heart condition, or if the lift hurts
   (MacDougall 1985; ACSM 2026). Off, and not offered, under Lean-down and Foundation (agreed; both
   take nothing to failure).
2. **Which lift.** A one-joint lift on a machine or a cable stack, counted in reps, not a corrective
   or warm-up move: no free weights, no multi-joint lift (Kerr 2010; small muscle mass and lower blood
   pressure, MacDougall 1985). In the catalogue that is thirteen lifts, such as the cable curl, the
   leg extension and curl, the pec deck and the triceps pushdown.
3. **Which set.** Its last working set (Nuzzo 2024b: no later set of it loses reps), one a session at
   most (a check logged stays the day's one check: a set added after it is no second set to
   failure), in a straight set or a superset (not a circuit, whose short rests a set to failure would
   hold up), where the bottom of the set's range plus its reserve is thirteen reps or fewer
   (Halperin 2022: the error grows fast past twelve).
4. **Which day.** None in a deload week, after a low or sore check-in, on a hard-start day (item 42),
   or in the first session back after three weeks or more: a day the plan is easing (Vieira 2022;
   Morán-Navarro 2017). A judgement.
5. **Which of today's lifts.** First, one whose reading would pair with a recent one for its own
   curve (item 41); else the lift done most often lately, so one lift gathers the readings; else the
   first in the plan. A judgement.
6. **How often.** Weekly until five readings, then one every four weeks; the learning starts again
   after six weeks without a reading or a change of style. The agreed text said "every few weeks" and
   left how often to the evidence: practice narrows the error over about six weekly sessions
   (Wiedenmann 2026), and five readings make a usable estimate (below). Four weeks is the low end of
   the research's four to six, to keep item 41's data recent.
7. **The set.** The card says "the last to failure" in its set list, and the set in front says: "Reserve
   check: lift to your usual stop and judge the reps left, then keep going without racking until you
   cannot finish a rep with good form (a burn is not failure)." The logger asks the reps at the stop,
   the reserve judged there, and the reps in all. Two switches: "It stalled before my usual stop" (its
   reps are the reps in all, nothing in reserve: no judgement to check, but still reps to failure
   for item 41; a slip in those reps is asked about as any set's, and Keep names those reps; none in
   all is a skip, which reads nothing and says no reading) and "I stopped before failure (pain, form
   or anything else)" (it counts for nothing). A set takes one switch or the other, never both.
   The set is logged as at the stop, so every rule reads it as a normal set and never as a grind or a
   miss; the reps in all are kept beside it, with the plan's style.
8. **What a reading says.** Said at once: "You judged 1 left at 12 and did 15 in all: 3 were left, 2
   reps more than you judged." A reading that cannot count (fewer reps in all than at the stop, or
   past twenty in all) is said to count for nothing, never read out.
9. **The estimate.** A normal model drawn toward the population: the lifter's error starts at 0.95 reps
   (Halperin 2022) with a person spread of 1.0 and a reading spread of 1.0 (together about 1.41,
   Halperin's 1.45; how it splits is unknown, a modelling choice). Four readings narrow it to 0.45
   reps (1 divided by the square root of 5), the research's 0.4 to 0.5 after four to six. It uses the
   latest eight readings (practice moves the error), and none past twenty reps in all (judgement and
   the curve past 60% of a max are unsettled).
10. **What it changes.** From four readings, and while the lifter's checks scatter less than two reps,
    and while the checks are on, the rules read a logged reserve through the error, in whole reps and
    never more than two (judgements): progression, the stall routes, in-session adjustment, fatigue
    drift, the hard start, every rebuild of the plan and the finished workout's next targets. Only on
    lifts like the ones checked (one-joint machine and cable lifts) and in the reps the readings span,
    by the reps the lifter believed each had (the reps at the stop plus the reserve judged), widened
    by one: whether an error carries to free weights or compound lifts is untested, so it is not
    carried there. A lift's first sets are read as its others are, which is untested too: the checks
    are always a last set. A check set's own reserve is the one it measured, with or without an
    estimate in force and with the checks on or off: the reps in all past its stop, none where it
    stalled early. "Why this target" and the stall card quote the reserve as logged, with what the
    rules read it as. Turning the checks on or off builds today's plan again, if not begun, with the
    log the switch gives. The log itself, its exports and its copies keep what was logged.
11. **What the lifter sees.** The reading after each check, and on the page of what the app has
    learned (item 47) the estimate, what it changes while the checks are on, why it reads nothing
    when it does not (the checks off, too few checks, checks that scatter, a reset since the last
    one, or a change of style since), with a reset that starts the learning again.

## Uncertainty

- No study separates a person's lean from set-to-set noise, so the model's split of 1.45 into 1.0 and
  1.0 is a choice; a lifter whose noise is larger needs more readings than four for the same
  confidence, which the scatter rule partly covers.
- Whether reading reserve through a measured error improves training has never been tested. The case
  for it is the proposal's: the rules assume the judgement is right, and a measured, steady lean makes
  every one of them misread the set.
- Whether an error learned on machine and cable lifts carries to free weights or compound lifts is
  untested, so it is not carried there; whether it holds on a lift's fresh first sets, as the app
  reads them, is untested too.
- A logged prediction may anchor where a lifter stops (Halperin 2022): the check asks the judgement at
  the lifter's usual stop, the number they would have logged anyway.
- Beginners' accuracy is disputed; the check is open to them because the practice studies found the
  largest gains there.

## Sources

Halperin 2022 (PMID 34542869); Refalo 2024 (37967832); Zourdos 2021 (30747900); Remmert 2023, machines
(37036795); Armes 2020 (33424678); Wiedenmann 2026 (42632893); Hermann 2025 (40249908); Remmert 2023
(37436724); Hackett 2023 (36730216); Hackett 2018 (29337829); Grant 2025 (40644671); Grgic 2022
(33497853); Vieira 2021 (33555822); Refalo 2023 (36334240); Robinson 2024 (38970765); ACSM 2026
(41843416); Vieira 2022 (34881412); Morán-Navarro 2017 (28965198); Pareja-Blanco 2020 (30036284);
Refalo 2023b (36752989); Nuzzo 2024b (38781472); Kerr 2010 (20139328); MacDougall 1985 (3980383);
Zourdos 2016, the reserve scale (26049792). Hughes 2020 (PMID 33337690) was retracted for data
fabrication and is not used.
