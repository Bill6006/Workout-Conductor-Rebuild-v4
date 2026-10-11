# The week the lifter actually trains (the owner's item 46)

Agreed text: "Plan for the week the lifter actually trains: days trained other than the schedule for
several weeks bring one card to move the schedule, and the split follows the real number of days."

**Status: built in Maintenance 27.** Every study below was checked on PubMed (E-utilities) on
2026-10-10, its abstract read; the 2026 ACSM position stand, Baz-Valle et al. 2019 and Yang et al.
2018 were read in full through PubMed Central. The split at each number of days was measured with
the app's own generator before and after.

## What it does

- **The real week is read** from the last four complete Monday-to-Sunday weeks that had training,
  within eight, counting a day on the device's own calendar as trained when it has a completed
  working set (two workouts that day are one day).
- **One card**, when every one of those four weeks had fewer sessions than the schedule, or every
  one had more, or a day trained in three or more of them is not one of the schedule's days: "You
  train 2 days a week, not 4", with the four weeks, the schedule, and the schedule it would move to. One tap, "Move the
  schedule"; Not now keeps it away for a week, twice for good, as other offers.
- **The split follows on the tap**: the plan is rebuilt under the new number of days. From four
  days a week, the four-template rotation (five with a strength goal); at three or fewer, full body, upper and lower, as before
  this round; a new lifter (Foundation) keeps those three at any number. The card says the split
  follows only where the move changes it.
- **A move starts the reading afresh**: only weeks after the schedule was last set count, whether
  the card moved it or the lifter did in Settings.

## The evidence

- **Frequency and split hardly matter for size at equal weekly sets**: 25 studies (Schoenfeld,
  Grgic and Krieger, 2019, PMID 30558493, updating their 2016 analysis of 10, PMID 27102172, which
  had favoured twice a week); split against full body with volume equated, 14 studies, no
  difference in strength or size (Ramos-Campo et al., 2024, PMID 38595233). Hypertrophy did not
  differ between one day a week and more than five at equal volume (ACSM 2026, PMID 41843416, full
  text).
- **Strength rises somewhat with sessions a week**, mostly through the volume they carry (Grgic et
  al., 2018, PMID 29470825; Pelland et al., 2026, PMID 41343037), less in trained lifters (Cuthbert
  et al., 2021, PMID 33886099) and adults over 60 (Kneffel et al., 2021, PMID 32948100).
- **Every major muscle at least twice a week** is the 2026 ACSM stand's primary recommendation. At
  one or two days a week only full-body sessions give the big muscles that, and this round first
  made every such session full body. The review measured what that cost: the app's full-body
  template has no slot for calves, abs, side delts or upper chest, so over eight sessions at two a
  week they had no direct sets at all, and the coach's offer to lead with a muscle behind could not
  be met. The rotation of full body, upper and lower, as before this round, trains them all; with
  weekly sets matched, frequency and split matter little for size (above).
- **A plan matched to the person helps them keep at it**: individualising programmes matters more
  than meeting specific prescriptions (ACSM 2026, full text; Garber et al., 2011, PMID 21694556);
  intention and action diverge for nearly half of those who intend to be active (Rhodes and de
  Bruijn, 2013, PMID 23480428); choosing the order of the week's sessions cost nothing in trained men
  (Colquhoun et al., 2017, PMID 28129275). No trial has tested moving a lifter's planned days to the
  days they train.
- **Consecutive days need no rule**: three full-body sessions on consecutive days matched
  non-consecutive ones over 12 weeks (Yang et al., 2018, PMID 29967584; da Silva Carvalho and
  Rodrigues Santos, 2018, PMID 27682004); sets to failure slow recovery (Morán-Navarro et al., 2017,
  PMID 28965198), and the generator already steers muscles trained in the last two days out.

## The rules as built

`src/engine/planning/scheduleFit.ts`; the card in `coachConductor.ts`; the split in
`chooseTemplate` (`generate.ts`).

1. **A training day**: the local date a workout began, with a completed working set (one
   finished after midnight, or the next morning, counts on the day it was started).
2. **The weeks**: the last four complete Monday-to-Sunday weeks with at least one training day,
   within the last eight, after the schedule was last set. A week without training is a break, not
   a pattern. With fewer than four, nothing.
3. **Off in number**: all four weeks below the schedule's sessions a week, or all four above. The
   real number is their median, a half rounded toward the schedule (the cautious way); the card
   says it as it is, and the move keeps within the two to six sessions Settings offers ("the fewest
   the plan sets", "the most the plan sets"). Where that range cannot reach it, only the days can
   move.
4. **Off in days**: a weekday trained in three or more of the four weeks that the schedule does not
   have. A scheduled day left unused, with the sessions on days that vary from week to week, names
   no day to move to, so it brings no card (the review found the card named none, then guessed).
5. **The move**: the sessions a week to the real number when off in number; the days to those
   trained in three or more weeks, with the scheduled days that were used, then the most-trained
   others until there are as many days as sessions.
6. **No card** when the move would leave the schedule as it is, or would name fewer days than
   sessions.
7. **The weeks read** are the last four with training, a week off skipped, and the card says "Your
   last 4 weeks of training".

**Why four weeks**: no study says how many weeks make a pattern. Four whole weeks, every one on the
same side, is under a 1% chance for a lifter who misses a planned day in three weeks of ten at
random (0.3 to the fourth), against about 8% for three of four; habits took six weeks or more to
form (Kaushal and Rhodes, 2015, PMID 25851609); and the card is only an offer.

**When the split changes** is on the tap, not before: the item as it was proposed and agreed ("a
card would offer to move the schedule, and the split would follow your real number of days") and
the plan's rule since Maintenance 15 that nothing is switched silently.

## Also corrected

The Hypertrophy focus style's evidence said training a muscle twice a week beat once with volume
matched (Schoenfeld 2016). Its 2019 update and the 2026 ACSM stand found no meaningful difference;
the style's evidence in the app and `programming-styles.md` now say so. The `chooseTemplate`
comment rested the three-day pool on Rhea et al. 2003; the split (`splitFor`) now rests on
Schoenfeld 2019 and Ramos-Campo 2024: at equal weekly sets the split itself hardly matters.

## Uncertainty

- No trial has tested changing a lifter's planned days to match the days trained.
- The four weeks, the three-in-four regular day and the rounding are product judgements.
- The day of the week is read on the device's calendar here; the week plan's own weekday still
  reads UTC until the agreed item 1 ("use the local date everywhere") is built.

## References

- ACSM (Currier et al.). Med Sci Sports Exerc. 2026;58(4):851-872. PMID 41843416.
- Colquhoun et al. J Strength Cond Res. 2017. PMID 28129275.
- Cuthbert et al. Sports Med. 2021;51(9):1967-1982. PMID 33886099.
- da Silva Carvalho and Rodrigues Santos. J Sports Med Phys Fitness. 2018. PMID 27682004.
- Garber et al. Med Sci Sports Exerc. 2011. PMID 21694556.
- Grgic et al. Sports Med. 2018;48(5):1207-1220. PMID 29470825.
- Kaushal and Rhodes. J Behav Med. 2015. PMID 25851609.
- Kneffel et al. J Sports Sci. 2021;39(3):351-358. PMID 32948100.
- Morán-Navarro et al. Eur J Appl Physiol. 2017;117(12):2387-2399. PMID 28965198.
- Pelland et al. Sports Med. 2026;56(2):481-505. PMID 41343037.
- Ramos-Campo et al. J Strength Cond Res. 2024. PMID 38595233.
- Rhodes and de Bruijn. Br J Health Psychol. 2013. PMID 23480428.
- Schoenfeld, Grgic and Krieger. J Sports Sci. 2019;37(11):1286-1295. PMID 30558493.
- Schoenfeld, Ogborn and Krieger. Sports Med. 2016;46(11):1689-1697. PMID 27102172.
- Yang et al. Front Physiol. 2018. PMID 29967584.
