# Pain patterns over weeks (the owner's item 45)

Agreed text: "Pain patterns over weeks: a joint that keeps hurting after one exercise and not after
its alternative brings the four-week swap on offer, the pattern named; observational and
conservative, never a diagnosis."

**Status: built in Maintenance 27.** Every paper below was checked on PubMed (E-utilities) on
2026-10-10, author, year and journal matched; open full text was read where a passage was relied
on. Official guidance (FDA, NHS) was read at source the same day and is paraphrased. The counts in
the rules are judgements anchored to the evidence named, not study results.

## What it does

- **Each pain report keeps its exercise.** "Hurts, protect it" on an exercise during a workout
  saves which exercise it was, beside the joint (`painReports` on the saved workout), through every
  later change to the plan that day.
- **The coach looks back six weeks** for a joint that keeps hurting with one exercise and not with
  its alternative. On a day the exercise is in the plan, one card names the pattern and offers the
  four-week swap to the alternative, with "Not now" beside it.
- **The card describes, never concludes**: the joint, the exercise, the counts and the dates. It
  names no condition, claims no cause and promises nothing.
- **A line under it is always shown**, at every experience level (a brief card shows only two
  reasons): "a pattern in what you logged, not a diagnosis", then swelling, numbness or tingling,
  pain at night, or pain that is severe or getting worse are for a health professional to check,
  rather than a swap.
- **"Not now" keeps the card away until a new report** on that exercise and joint, and leaves its
  place: another pattern, or the last workout's pain card for the joint, can show.
- **Taken**, the swap runs four weeks as any kept swap, with its end date and Stop on Plan; the
  exercise then returns at 90% of its estimated max (the engine's return after 21 days away), and the
  same rule watches it again, afresh: the reports from before the swap no longer count, and it takes
  new ones to bring the card back.

## The evidence

- **Keep training; change the exercise.** Continuing a painful activity under a pain-monitoring
  model gave the same 12-month outcome as six weeks of rest from it (Silbernagel et al., 2007, PMID
  17307888, n = 38); across seven trials, exercise that allowed some pain was no worse than
  pain-free exercise (Smith et al., 2017, PMID 28596288). Most injured lifters change their
  training rather than stop: 81% altered it, 16% stopped (Strömbäck et al., 2018, PMID 29785405).
- **One report is noise; a repeated one is a signal.** 39% of athletes report a problem in an
  average week (Clarsen et al., 2013, PMID 23038786); a single complaint predicts poorly (AUC 0.51
  to 0.66, Gibson et al., 2025, PMID 40388120).
- **Soreness cannot explain a repeated pattern.** Muscle soreness after unaccustomed work comes 1 to
  5 days later (Armstrong, 1984, PMID 6392811), peaks at 48 to 72 hours (Hotfiel et al., 2018, PMID
  30537791), and a first bout protects against it for months (Nosaka et al., 2001, PMID 11528337).
  Two reports a week or more apart, made during or right after the session, are not one bout. A
  report made before a session (a check-in) can be soreness from the one before.
- **Four weeks is within what programmes use**: activity was modified for 4 weeks (Rathleff et al.,
  2019, PMID 31095417; 2020, PMID 32284945) to 6 (Silbernagel 2007; Sprague et al., 2021,
  PMID 33632313) before a graded return. No study compared swap lengths. The exercise should come
  back: avoidance feeds fear (Vlaeyen and Linton, 2000, PMID 10781906), graded exposure helps
  (López-de-Uralde-Villanueva et al., 2016, PMID 26235368).
- **The clinical thresholds need a 0 to 10 scale** (pain up to 5/10, settled by the next morning,
  not rising week to week; Silbernagel 2007; Habets et al., 2018, PMID 29249084). The app records
  pain as yes or no, so only "not rising week to week" carries over, as "keeps hurting over weeks".
- **Describe, never conclude.** The FDA's general wellness guidance (6 January 2026) covers
  logging and trending, and excludes naming diseases or conditions, diagnostic thresholds and
  prompts that direct treatment; a note that a health professional may help is allowed when it
  names nothing and calls nothing abnormal. Diagnostic labels raise how serious pain seems and the
  felt need for imaging or surgery (Zadro et al., 2021, PMID 33789444; O'Keeffe et al., 2022, PMID
  35616226).
- **Red flags are a clinician's tool**: most lack proven accuracy (Finucane et al., 2020, PMID
  32438853; Downie et al., 2013, PMID 24335669), so the app never screens for them. It shows static,
  symptom-based signs for when to get help, paraphrased from NHS pages.
- **No evidence for different thresholds by joint**: the same rule for every joint.

## The rules as built

`src/engine/recovery/painPattern.ts`; the card in `coachConductor.ts`.

**Which reports count, and for which exercise.**

- A report made on an exercise during the workout is that exercise's.
- One saved without its exercise (the end-of-workout rating's joint, or a report from a copy before
  item 45) counts for an exercise only when it was the one done that session loading the joint at
  moderate or high stress; with two or more, for none.
- A check-in's joint never counts for an exercise, though the workout keeps it among its pain
  joints. From item 45 on every workout saves its reports, an empty list too, so a pain joint
  beyond them is a check-in's, from any check-in that day (one updated later included); a workout
  saved before item 45 has no list, and its pain joints are read as its reports, less its last
  check-in's.
- A session with an exercise (the one in the pattern or its alternative): at least one completed
  working set of it, or a report made on it.
- Only sessions since the exercise's last break count: a lift away three weeks or more (the app's
  own break rule, in elapsed time as the engine reads it; a four-week swap is one) starts afresh,
  and one coming back today has none yet.
- A session counts on the day it began: one saved after midnight is its start's.

**A pattern**, all within the last 42 days (or since the lifter's reset, item 47):

1. The exercise puts moderate or high stress on the joint (catalog).
2. Two or more sessions with it carry a report at the joint, the first and last at least seven
   days apart on the device's calendar (Monday evening to the next Monday morning is a week).
3. At least half the sessions with it carry one.
4. The latest session with it carries one: a pain-free session ends the pattern.
5. An alternative has two or more sessions without the exercise, and no session with it reports the
   joint, by any route, check-in included. The alternative is an exercise swapped in for it, or a
   catalog substitution of the same movement.
6. The alternative puts no more stress on the joint and fits today's place.
7. No lasting swap of the exercise is running.

**Why 42 days**: three times the NHS's two-week self-care mark, the six-week modification phases
(Silbernagel 2007; Sprague 2021), and room for two reports a week apart and two alternative
sessions for someone who does the exercise once a week. Reports from just before a four-week swap
can still lie within 42 days when it ends (the review found it), so the break rule, not the window,
is what starts a returning exercise afresh.

**The card**: one at a time, on a day the exercise is still to do, the pattern with the most
reports first that has not been put away; while it shows, it stands in place of the "pain last
time" card for the same joint. For example:

> **Shoulder pain with Barbell Bench Press, not with Dumbbell Bench Press**
>
> - You noted shoulder pain in each of your last 3 sessions with Barbell Bench Press: Sep 12, Sep
>   19, Sep 26.
> - None in 2 sessions with Dumbbell Bench Press: Sep 15, Sep 22.
> - After 4 weeks Barbell Bench Press comes back at a lighter load. (A beginner's card only: a brief
>   card shows the first two.)
>
> A pattern in what you logged, not a diagnosis. Swelling, numbness or tingling, pain at night, or
> pain that is severe or getting worse: a health professional can check it, rather than a swap.
>
> [Use Dumbbell Bench Press for 4 weeks] [Not now]

**Not now** keeps it away until a new report on that exercise and joint: showing it again with
nothing new adds alarm and no information (Vlaeyen and Linton 2000). A safety card's usual Not now
lasts the workout; this one is an offer about weeks.

## Not built (beyond the agreed text)

From the research's proposals, for the owner to ask for if wanted:

- a line when the pain comes back within six weeks of the exercise's return ("If it keeps coming
  back, a health professional can help work out why");
- a note, with no swap, when the joint hurts with the alternative as well, or across exercises;
- an intensity choice on the pain question, so the 0 to 10 thresholds could run;
- a next-morning check, for the model's 24-hour rule;
- saving the side (left or right);
- joint-specific "when to get help" lines in the end-of-workout pain question.

## Uncertainty

- The counts (two reports a week apart, half the sessions, two clean alternative sessions, 42 days)
  are judgements; the evidence says only that single reports are noisy, soreness lasts days, and
  pain should not rise week to week.
- A pain-free alternative can never show the alternative is better: natural recovery and
  regression to the mean can give it. The wording stays observational whatever the counts.
- Attributing a report when two exercises loaded the joint is a convention (for none).
- Nearly all the pain-monitoring evidence comes from clinical groups, not healthy lifters.
- The FDA guidance is nonbinding and US-only; UK and EU rules were not reviewed. Not legal advice.

## References

PubMed, checked 2026-10-10:

- Armstrong. Med Sci Sports Exerc. 1984. PMID 6392811.
- Clarsen et al. Br J Sports Med. 2013. PMID 23038786.
- Downie et al. BMJ. 2013. PMID 24335669.
- Finucane et al. J Orthop Sports Phys Ther. 2020. PMID 32438853.
- Gibson et al. Mil Med. 2025. PMID 40388120.
- Habets et al. Sports Med. 2018. PMID 29249084.
- Hotfiel et al. Sportverletz Sportschaden. 2018. PMID 30537791.
- López-de-Uralde-Villanueva et al. Pain Med. 2016. PMID 26235368.
- Nosaka et al. Med Sci Sports Exerc. 2001. PMID 11528337.
- O'Keeffe et al. Eur J Pain. 2022. PMID 35616226.
- Rathleff et al. Am J Sports Med. 2019. PMID 31095417.
- Rathleff et al. Orthop J Sports Med. 2020. PMID 32284945.
- Silbernagel et al. Am J Sports Med. 2007. PMID 17307888.
- Smith et al. Br J Sports Med. 2017. PMID 28596288.
- Sprague et al. Pilot Feasibility Stud. 2021. PMID 33632313.
- Strömbäck et al. Orthop J Sports Med. 2018. PMID 29785405.
- Vlaeyen and Linton. Pain. 2000. PMID 10781906.
- Zadro et al. J Orthop Sports Phys Ther. 2021. PMID 33789444.

Official documents, read at source 2026-10-10:

- FDA. General Wellness: Policy for Low Risk Devices. 6 January 2026.
- NHS pages on joint, back, shoulder, knee, elbow and arm, hip and wrist pain.
