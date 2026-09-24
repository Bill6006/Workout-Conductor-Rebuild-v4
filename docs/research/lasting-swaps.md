# A swap kept for a few weeks (the owner's item 23)

Agreed on 2026-09-23 ("Proposed are approved"). Built in Maintenance 22.

## The problem

A swap in the exercise sheet lasted one workout. The next workout picked the plan's own exercise
again, so a lifter who wanted a different lift for a while (a pulldown while chin-ups stall, a
machine in place of a barbell lift) had to swap it every time. The coach even suggested "swap in
Lat Pulldown for a few weeks", but nothing could keep a swap that long.

## What the research says

Both checked on PubMed (E-utilities) on 2026-09-23.

- Changing exercises in a planned way can help, and changing them too often can hold gains back.
  A systematic review of eight studies found that some degree of systematic variation seems to
  enhance regional muscle growth and maximise strength, while excessive, random variation may
  compromise gains; it advises against a high frequency of change (Kassiano, Nunes, Costa,
  Ribeiro, Schoenfeld and Cyrino, 2022, Journal of Strength and Conditioning Research,
  PMID 35438660).
- Changing exercises every session made no difference to muscle thickness or strength over eight
  weeks in trained men, and training felt more motivating (Baz-Valle, Schoenfeld, Torres-Unda,
  Santos-Concejero and Balsalobre-Fernández, 2019, PLoS One, PMID 31881066). Motivation is a
  good reason to allow a swap; the review above is the reason not to churn.

## The design that follows

1. In the exercise sheet, above the alternatives, a switch: "Keep it for the next 4 weeks". Off by
   default, so a plain swap stays a one-workout swap.
2. Kept, the plan picks the exercise swapped in wherever it would have picked the one swapped out,
   as long as it fits the place; where it does not fit, the plan's own pick stands. It never puts
   an exercise in twice.
3. Four weeks is a judgement within the review's finding: long enough to progress on the new
   exercise, short enough that the plan's own pick comes back. No study set the number.
4. The Plan tab shows each kept swap with its end date and a Stop button. Undo on the swap takes
   the kept part back too. A swap of a swapped-in exercise moves the kept swap to the latest pick;
   a swap back to the original ends it.
5. Kept in the `meta` store as `lasting-swaps`, so it is backed up and travels with the cloud copy.
   An exercise that no longer exists, or a swap past its end, reads as none.
