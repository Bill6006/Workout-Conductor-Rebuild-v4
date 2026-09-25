# "Make it harder" and "Make it easier" through a rebuild (the owner's item 34)

Agreed on 2026-09-24, on the condition that research backs it; to be built in a coming round.

**Correction (Maintenance 24):** no screen in the app sets "Make it harder" or "Make it easier".
The engine has had the setting since Phase 4 (the `intensity` trigger), but no button ever sent
it; this page, the proposal and Maintenance 23's phone steps wrongly spoke of a button. What a
lifter sees of this item today is the check-in: after a low check-in, the rest of the workout
has a set fewer on each exercise with one to spare and a rep more in reserve, and before this
round any later change (a new length, another place, coming back after a break) dropped that
without saying so.
The research below applies to the check-in as much as to the setting: it is the day's effort
adjusted to how the lifter feels.

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

## What was built (Maintenance 24)

- Every rebuild applies a check-in's own adjustment and the setting (`dayAdjust`): a change of
  length or place, the equipment, the techniques or the profile, a check-in, coming back after a
  long break, and the setting's own trigger. Harder and a low check-in together would leave the
  sets and the reserve as planned.
- A lift changed on its own keeps the effort it carries: its weights refitted, a max entered, a
  swap, a stand-in for a lift under way, and a lift picked up again. The effort counts only as far
  as the day's settings reach: a deload week's extra rep is part of the plain target, so a lift
  planned before the week cannot cancel it, and a setting since taken back does not stay on the
  lift.
- The exercise the coach adds takes the setting too, with the two sets it offered.
- A check-in back to fine brings the planned sets and effort back, and says so ("Planned sets and
  effort back"); with nothing left to bring back it says "Feeling good: nothing left to change."
- A check-in reaches the lift in front until its first set is logged, and a lift you pinned or
  swapped in, keeping their exercise: their sets and effort follow the day's settings, and the fit
  to time then trims them like any lift not begun, so a short session keeps its floors. A cut
  never adds a set to a lift the fit trimmed, a restore never takes one away, and a ramp added by
  hand stays. A lift under way, one the coach added, and one whose sets, reps or weight you set
  keep their sets.
- The check-in's words say what changed, both ways: "fewer sets", "an extra rep in reserve", or
  both; back to fine, "Planned sets and effort back", or only the part that came back; and sore
  after drained, "the planned effort back" with the sets still cut. Sets are named only where the
  day's settings moved them, never for the fit to time, and a sore joint is named only where a
  lift it rules out left the plan or stopped for it.
- A plan built again for today's inputs (a coach focus, a deload week, a kept swap stopped) keeps
  today's check-in and choices; a plan still on the screen from an earlier day keeps none of that
  day's.
