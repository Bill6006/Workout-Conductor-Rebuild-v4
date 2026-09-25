# "Make it harder" and "Make it easier" through a rebuild (the owner's item 34)

Agreed on 2026-09-24, on the condition that research backs it; to be built in a coming round.

## The problem

"Make it harder" adds a working set to each exercise still to come and asks for one rep less in
reserve; "Make it easier" does the reverse. The app remembers the setting, but only the button
itself applies it. A change of workout length or of place, a check-in, coming back after a long
break, or a change to the equipment, the techniques or the profile rebuilds the rest of the
workout at normal difficulty, without saying so. The next tap can then seem to do nothing:
Easier leaves the workout as it is, since it only cancels the Harder the rebuild had already
dropped.

## What the research says

Every paper was checked on PubMed (E-utilities) on 2026-09-24.

- More weekly sets bring more muscle and more strength, with diminishing returns, more so for
  strength (Pelland et al., 2026, Sports Medicine, meta-regressions, PMID 41343037; Schoenfeld,
  Ogborn and Krieger, 2017, Journal of Sports Sciences, systematic review and meta-analysis, PMID
  27433992).
- Sets that end closer to failure bring more muscle growth, and strength changes little
  (Robinson et al., 2024, Sports Medicine, meta-regressions, PMID 38970765). Going all the way to
  failure adds only a trivial amount, and the relationship may not be a straight line (Refalo et
  al., 2023, Sports Medicine, systematic review and meta-analysis, PMID 36334240). One rep closer
  is a modest change, not a large one.
- Adjusting the day's effort to how the lifter feels (autoregulation) builds maximum strength at
  least as well as a fixed plan. It did better in a meta-analysis of 8 studies in trained athletes
  (Zhang et al., 2021, Frontiers in Physiology, PMID 33776802), and every autoregulation method
  improved maximum strength in a review of 14 studies (Larsen, Kristiansen and van den Tillaar,
  2021, PeerJ, systematic review, PMID 33520457).

No study tests keeping a setting through a rebuild; that part is the app doing what the lifter
asked. The research says the setting changes what the session does, so losing it quietly changes
the session.

## The design that follows

1. Every rebuild of the rest of the workout applies the harder or easier setting in force, as the
   button does: one set more or fewer on each exercise still to come, and one rep less or more in
   reserve, within the limit the button already keeps (a core stability move keeps its 2 in
   reserve).
2. A check-in's own adjustment applies on top of the setting.
3. The fit to time still comes last, so a shorter session trims sets as it does today.
