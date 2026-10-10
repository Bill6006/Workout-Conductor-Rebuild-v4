# Each lift's own reps-to-weight curve (the owner's item 41): validated, not shipped

Approved on 2026-10-09 for Maintenance 26 (round H), with the owner's condition: "validate how the
personal reps-to-load curve should be learned and bounded." The proposal said: every target uses
one formula for everyone; people differ; once a lift has sets in two rep ranges, fit the lifter's
own curve, so a new rep range, a return after a break, or a back-off set starts at a weight that
suits them.

**Status: not shipped.** It was built, reviewed twice and tested by simulation. From the sets the
app logs, a lift's own curve cannot be learned well enough to beat the one curve everyone gets:
where it changed a target, the change was more often wrong than right, and most of what it got
right came from two corrections to the population's rule, not from the lifter's own curve. The
code was removed before release; every target is worked out as it was in Maintenance 25. What
would work instead is under "What could work instead" (Proposed, not Agreed).

## What the app does (unchanged)

- One curve for everyone and every lift, Epley's: a set of `w` for `r` reps reads as a max of
  `w × (1 + r / 30)`, and a target of `R` reps at a reserve asks `max ÷ (1 + (R + reserve) / 30)`.
  The rules count reps up to twelve both ways (`estimateOneRepMax`, `exactLoadFromEstimate`); a
  recent set entered on the max sheet counts up to thirty (Maintenance 25).
- A target is converted from an estimate in these places: a return after three weeks or more
  (90%, 85% after six), a new rep range (95% of what the latest estimate implies, Maintenance 15),
  a max entered on the sheet, a new variation from its family's estimate, and a first target from
  other lifts or the body. Each uses the one curve.
- Above twelve reps the curve stops: a target of 15-20 reps at 2 in reserve is asked as if it were
  12, so a range high above the reps a lift was trained at starts heavy, and in-session
  autoregulation brings it down.

## What the research says

Every paper was checked on PubMed (E-utilities) on 2026-10-09.

- **People differ, in proportion.** Across 269 studies (952 tests to failure, 7,289 people), the reps
  possible at a share of the max averaged about 5 at 90%, 10 at 80%, 15 at 70% and 20 at 60%. The
  spread between people was about 2.5 reps at 80% and 4.4 at 60%: about a quarter of the mean at
  both, so people differ roughly in proportion to the reps (Nuzzo, Pinto, Nosaka and Steele, 2024,
  Sports Medicine, meta-regression, PMID 37792272).
- **Lifts differ.** Trained and untrained men did more reps in the squat than in the bench press or
  the curl at 60% of the max, with much smaller differences at 80 and 90%; training status mattered
  little (Shimano and colleagues, 2006, Journal of Strength and Conditioning Research, PMID
  17194239). A curve belongs to a lift, not to a person.
- **Training background shifts the curve.** On the leg press, endurance runners did 39.9 reps at 70%
  of the max against weightlifters' 17.9, and 19.8 against 11.8 at 80%, with no clear difference at
  90% (Richens and Cleather, 2014, Biology of Sport, PMID 24899782).
- **A personal curve is stable when it is measured.** In 24 trained lifters, reps to failure at 90,
  80 and 70% of the bench press max, retested a week later, had a standard error of 0.7 to 1.1
  reps; the simple linear and two-parameter exponential models gave the most stable personal
  parameters across the two tests (Mitter, Csapo, Bauer and Tschan, 2022, PLoS One, PMID
  35511896). Those were sets taken to failure, in a lab, at loads 10% apart.
- **Linear rules hold best over few reps.** Predicting the max from 5, 10 and 20 repetition maximums
  worked well, best from 5; the load fell non-linearly as the reps rose, and the authors advise no
  more than 10 reps in a linear equation (Reynolds, Gordon and Robergs, 2006, Journal of Strength
  and Conditioning Research, PMID 16937972).
- **The app sees reserve as judged, not reps to failure.** Lifters guessed about one rep fewer than
  they had left (0.95, 95% CI 0.17 to 1.73), with wide differences between studies (a standard
  deviation of 1.45 reps), better near failure, worse past twelve reps (Halperin and colleagues,
  2022, Sports Medicine, PMID 34542869).
- **The max moves from day to day.** A max retested on another day varies by a median 4.2%
  (Grgic, Lazinica, Schoenfeld and Pedisic, 2020, Sports Medicine - Open, PMID 32681399).

## What was built

Epley's shape with the lift's own constant `k` in place of 30: a set reads as `w × (1 + r / k)`
and a target asks `max ÷ (1 + R / k)`. A different `k` scales the reps the lifter gets at every
share of the max by `k / 30`, which is how people differ in Nuzzo 2024. It was learned from the
lift's own sessions only (lifts differ, Shimano 2006): each session's first working set of up to
twelve reps with a reserve logged of three or less, read as reps to failure (reps plus reserve);
pairs of sessions at two rep ranges at most fourteen days apart, the heavier at least a tenth
heavier and four or more reps to failure shorter; each pair's own `k` kept only inside 16-44 (about
two of Nuzzo's between-person spreads either way); at least two sessions on each side; the median
drawn toward 30 until the lift's own data outweighed it; and read only as far as the lifter's own
sets went (reps past twelve, up to the reach of its lighter sessions). It was used where the app
turns an estimate into a target on the same lift (a return after a break, a new rep range, a max
entered on a lift with logged sets) and shown, with one line, only where it changed the target.

## What the validation found

Two independent reviews, each with its own seeded simulation: honest lifters training twice a week
for ten weeks, 1,000 per case, with the day-to-day variation of the max (Grgic 2020: 4.2%) and a
rep of error in the reserve they log (Halperin 2022), which decides both when they stop and what
they log. Each lifter's own right weight for a target is known in a simulation, so a target can be
scored against it.

1. **The first version learned curves from noise.** Lifters training one rep range (8-12 at 2 in
   reserve, the usual double progression) got a curve in 836 of 1,000 cases, 834 of them at the
   upper bound: two sessions at nearly the same weight a few reps apart read as a lifter who gets
   far more reps than most. The pair rules above (a tenth's load gap, each pair inside the bounds,
   sessions rather than pairs counted) were added; after them no lifter training one rep range got
   a curve.
2. **The second version learned only part of the difference, and claimed some that were not
   there.** Lifters alternating 4-6 at 2 and 10-12 at 1, whose own constants were 18, 24, 30, 36
   and 42, read medians of 26.0, 28.4, 30.8, 31.8 and 32.3: a fifth to a third of the way from 30
   to the truth. Of 1,000 lifters exactly on the population curve, 93 were told at some point in
   ten weeks that they get more or fewer reps than most (153 in twenty weeks). In a realistic mix
   of lifters (constants spread about a quarter around 30, as Nuzzo 2024 found), 14% of those
   claims pointed the wrong way, and only 81 of the 841 lifters whose constant truly sat six or
   more from 30 (the line's own threshold) were told.
3. **Where it changed a target, it moved it the wrong way more often than the right way.** Scored
   against each lifter's own right weight:

   | Target                                 | Changed by the curve                              | When it was changed                                                                      |
   | -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
   | A return to 10-12 reps at 1 in reserve | 25-37% of lifters with a curve, at every constant | further from the right weight in 94-99%                                                  |
   | A return to 1-3 reps at 2 in reserve   |                                                   | constant 18: 216 closer, 6 further; 36: 22 closer, 80 further; 42: 24 closer, 68 further |
   | A return to 15-20 reps at 1 in reserve |                                                   | closer in 91-99%                                                                         |

   The 15-20 gain came from counting reps past twelve, not from the lifter's own constant: a
   lifter exactly on the population curve gained the same way. On the 10-12 return the loss came
   from the same reach meeting the rules' convention of reading a set's max from its reps alone
   while a target is asked at reps plus reserve: the cap of twelve used to cancel that mismatch. A
   lifter exactly on the population curve got a curve of 30 that moved their return from 165 lb
   (their own right weight about 163) to 160.

4. **The app's own rep ranges are too close together to learn from.** A lifter alternating 4-6 at
   2 in reserve and 6-10 at 1 asks about three reps to failure apart, under the four a pair needs:
   lifters with no noise never got a curve, and 12-32% got one from noise alone, which said nothing
   about their real constant.
5. **The best variant tried was a correction to everyone's rule.** Reading a set's max from its
   reps plus the reserve logged (as the fit did) brought targets of 1-3, 6-10 and 10-12 reps closer
   on average at every constant tried, including lifters exactly on the population curve (a 10-12
   return off by 7.7 lb, against 9.2 for the population's rule and 10.3 for the curve as built),
   but 15-20 further than the curve as built (16.7 lb against 14.0). What it fixed was the
   population's rule, not a personal curve.
6. **It was slow.** A target took 5.8 to 43.7 ms with the curve against 0.3 to 0.5 ms without, for
   500 to 3,000 logged sessions; a workout of seven lifts with curves took 80 ms against 8 at 1,500
   sessions. That could have been fixed; it bought nothing.

## Why it is not shipped

The difference the curve tries to learn is about a quarter of the reps between one lifter and
another (Nuzzo 2024). Each reading it learns from carries about a rep of error in the judged
reserve (Halperin 2022), the max moves about 4% between the sessions it compares (Grgic 2020), and
the app's rep ranges sit only three or four reps to failure apart. A pair of sessions a tenth apart
in load reads `k` to within about ten either way; several pairs, to within about five: about the
whole spread between lifters. Bounds strict enough to stop false curves leave most real ones near
30, and the rest of the change the curve makes comes from side effects. The owner's condition was
that no number becomes a rule without evidence; here the evidence says the rule cannot be learned
from these data. Targets keep the population curve.

## What could work instead (Proposed, not Agreed)

1. **High-rep targets, for everyone.** The rules count reps up to twelve, so a target of 15-20 reps
   is asked as if it were twelve and starts heavy. Epley's line through twenty reps sits close to
   Nuzzo 2024's averages (60% of the max for about 20 reps; Epley 60%), where the cap at twelve asks
   about 71%. Counting a target's reps past twelve, up to twenty, would start those ranges nearer
   the right weight; reading a logged set past twelve would stay as it is (Reynolds 2006, Halperin
   2022). It needs its own check of the evidence and a simulation before it is built.
2. **A set's reserve in its max, for everyone.** The rules read a set's max from its reps alone and
   ask a target at reps plus reserve, so a target converted from an estimate (a return, a new rep
   range) comes out lighter than the sets it came from. Counting the logged reserve brought targets
   closer on average at every constant simulated, except at 15-20 reps. The logged reserve is about
   a rep low (Halperin 2022), so this belongs after item 43.
3. **Each lift's own curve, after item 43.** Item 43 (Agreed, waiting) checks the lifter's reserve
   against occasional sets taken to failure. A set to failure reads reps to failure directly, with
   no judged reserve: the largest error the curve fought. Mitter 2022 found personal parameters
   stable when measured that way. The curve could then be learned from sets to failure at two loads
   well apart, simulated again with that data, and shipped only if it brings targets closer than
   the population curve does.

## Uncertainty

- The simulated lifters follow Epley's shape with their own constant. Real curves differ in shape
  too (Richens and Cleather 2014: runners differed far more at 70% than at 90%), which one
  constant cannot follow; that makes a personal curve harder to learn, not easier.
- The noise is the literature's average (a median 4.2% day to day; a rep of reserve). A lifter who
  judges reserve precisely could be learned from logged sets, but the app cannot tell who that is
  until item 43 calibrates it.
- The simulations are the reviewers' (seeded, 1,000 lifters a case); no study has tested a learned
  personal curve in an app, and none was needed to see that this one moved targets the wrong way.
