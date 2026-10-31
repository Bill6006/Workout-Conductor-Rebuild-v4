# "A harder variation" only where there is one (2026-10-31)

Fixed on 2026-10-31 from the owner's report, outside the rounds and before Maintenance 34. YELLOW:
waiting for the owner's phone review, like every round since 2026-10-11.

## The report

**As reported:** "For Dumbbell Row at Home, the Adaptive Coach offers 'A harder variation' because
50 lb is the heaviest available weight. But opening Dumbbell Row's alternatives says: 'No safe
alternative fits Home and your limitations.' Please verify the Coach only offers 'A harder
variation' when at least one valid harder alternative actually exists under the same place,
equipment, pain/limitation, and session rules used by the alternatives sheet. If none exists, do
not show a dead-end button. Continue using the appropriate available progression path instead,
such as reps and then another valid lever when needed. Fix at the shared/root logic level and add
a regression test."

**The cause.** The coach's card for a lift held at the heaviest weight a place has ("Dumbbell Row:
at the heaviest weight here (50 lb)") offered "A harder variation" whenever the lift's reps were
under their ceiling, and its button opened the lift's alternatives sheet. Nothing checked the sheet:
at a place, with limitations, where no alternative fitted, the button led to "No safe alternative
fits Home and your limitations." Two smaller faults sat beside it: the Today sheet and the workout's
sheet each built their list with code of their own, and only the workout's ranked the variations
that stay heavy with the weights a place has first; and at the rep ceiling with the lift's sets set
by hand, the card said "The reps go up instead, to 20 this session", which they could not.

## The fix

- **One list.** `src/engine/alternatives/entryAlternatives.ts` builds a lift's alternatives as the
  sheet shows them: every exercise that fits the place, the profile's limitations, the joints that
  hurt today and the lifts avoided today, the lift's superset, and the day's catch-up or second
  workout, ranked, cut to the sheet's six. The Today sheet, the workout's sheet and the coach all
  read it, so the coach never offers a way into the sheet that the sheet cannot fill. Today's sheet
  now ranks first, for a lift held at the heaviest weight here, the variations that stay heavy with
  what the place has, as the workout's did.
- **A harder variation.** One the sheet lists that is a variation of the lift, the same movement
  (as the plateau route already reads a variation), and heavier per pound: a lower load ratio than
  the lift's, as the ranking's own "still heavy with the weights you have" reads it. A rear delt fly
  is heavier per pound than a row, but no variation of it; for a curl at 20 lb, the incline curl
  counts, the hammer curl (the same ratio) and the reverse curl (a higher one) do not.
- **The card.** "A harder variation" only where the lift's sheet lists one. With none, the reps
  climb on as the lift's own line says ("Held at the heaviest weight here (50 lb): the reps go up
  instead"), and nothing is offered until they reach the top, where "Add a set" comes, as before. A
  lift whose sets were set by hand takes no set more, so at the top of its reps the harder variation
  is its one lever, where the sheet lists one. At the top the card says "The reps are already at the
  top of the range."

## Tests

- `src/engine/coach/coachConductor.harderVariation.test.ts` (10): the owner's case, Dumbbell Row
  held at 50 lb at a home where its sheet lists nothing: no card, no "alternatives" action; a sheet
  of other movements only (a rear delt fly): none; the default home, whose sheet lists the
  chest-supported row first with "still heavy with the weights you have": the card and its button;
  the variation already in today's plan, or avoided today: none; every joint that hurts today: the
  coach agrees with the sheet; a lift not held at the cap: nothing ranked as harder; the rep ceiling:
  "Add a set"; sets set by hand at the top: the variation, where listed; the curl's incline curl,
  never the hammer or reverse curl.
- `src/engine/coach/coachConductor.sheetButtons.test.ts` (16), from the review: a safety card's swap
  and a strategy's "Open alternatives" open the sheet where it lists something and are no button
  where it lists nothing (each sheet emptied page by page), the safety card then saying what to do;
  the plateau route done offers a different exercise only where one is listed; a barbell row held at
  135 lb counts no dumbbell or machine row as harder, and its sheet gives them no "still heavy"
  reason; the incline curl held at its heaviest has no harder curl; the trap-bar deadlift's
  conventional deadlift is offered with nothing hurting and not with the lower back sore; the
  chest-supported row is not offered when swapped away today or out for four weeks; at the top of the
  reps the set is the lever on a day of the plan, the harder variation while losing fat and on a day
  off the plan.
- `src/features/today/harderVariation.screens.test.tsx` (2): on Today, a lifter whose Dumbbell Row
  sits at 50 lb at home: the coach's "A harder variation" opens the row's sheet with Chest-Supported
  Row first; at a home with dumbbells only, no card offers it, every card seen down to the quiet line.
- `src/engine/coach/coachConductor.placeAndDeload.test.ts`: the deload week's hold now reads the curl,
  whose sheet lists the incline curl; at the light home the plateau route passes over the rep range
  and the variation (the incline press's sheet lists only an Arnold press) to the deload, and keeps
  the variation step for the dumbbell bench press, whose sheet lists push-ups.
- `src/engine/coach/coachConductor.loading.test.ts`: its two cases that offered the variation at no
  place now read the gym, whose sheet lists one.

## Review

One fresh adversarial review, read-only: no HIGH finding. It checked the coach against both
sheets input by input (profile, place, plan, constraints, sets done, routes, the lift's block) and
found the same list: the log as kept and as the rules read it rank alike, as the ranking reads no
reserve, and the six-lift cut and the catch-up's swap filter are shared. Its findings, each checked
against the code:

- **MEDIUM, fixed: the same dead end on the plateau route.** "Swap for a variation", "Pick a
  different exercise", a strategy's "Open alternatives" and the safety cards' swaps opened the sheet
  unchecked. A lift held at the heaviest weight is the case the route passes its rep range over in,
  so a stalled Dumbbell Row at a dumbbells-only home reached "Swap for a variation" over a sheet of a
  rear delt fly. Every button into a sheet is now offered only where the sheet lists something; the
  route passes over a variation the sheet lists none of, each step in turn, as it passes over a rep
  range or a deload the weights cannot give; a safety card with nothing to swap in says "Nothing here
  swaps in for it today: skip it, or stop the set if it bites."
- **MEDIUM, fixed: "harder" read load ratios across different weights.** A barbell row held at
  135 lb counted the dumbbell row as harder (a lower ratio), though for its lifter it is lighter
  (50 / 0.36 = 139 against 135 / 0.9 = 150). A harder variation is on the same weights now, the
  place's record they come from, and so is the ranking's "still heavy with the weights you have".
- **MEDIUM, fixed: lifts the coach's own rules keep out.** A lift swapped away today, or out for four
  weeks, could be the only harder variation counted (the nineteenth and twentieth reviews of round M
  fixed the same for the coverage and pain cards). The coach leaves them out; the sheet still lists
  them for the lifter's own hand.
- **LOW, fixed: the set at the top of the reps.** It was offered while losing fat, where the extra
  set's own offer holds sets back, and on a day off the plan, where it was then dropped. It is the
  lever only where the plan takes a set; elsewhere the harder variation, where listed.
- **LOW, fixed: cost.** Nothing is looked for in a deload week, where the card is held back anyway.
  The rest of the cost (the list built at each pass for a lift held at the cap and below its top)
  stays: the coach builds the week at each pass already.
- **LOW, not changed: two clocks.** The coach reads the minute clock, the sheets the moment they
  open; at a day's edge the 30-day familiarity bonus or the week's load can reorder a list. Rare, and
  a list reordered still lists the same lifts unless the cut at six moves.
- **LOW, fixed: two tests proved less than they said.** The screen test of no card now proves it saw
  every card, to the quiet line; the coach-against-sheet check under every joint is kept as the
  property it is, beside cases that pin each list.

## Reverts

`tools/reverts/mutate-harder-variation.py`, 24 entries (`table_harder_variation.txt`), all caught on
the final code: the button only where the sheet has a harder variation, no card with no lever, the
same movement, heavier per pound, a lift held at the cap only, the sheet's ranking for a held lift,
the coach reading the day's sore joints and the place, the list leaving out today's plan, the words
and the set at the top; and from the review, no set while losing fat or on a day off the plan, no
lift swapped away or out, the same weights for the list and the ranking, a button into a sheet only
where it lists something, a safety card's line, the route passing over a variation, each step in
turn, "Open alternatives" and "Pick a different exercise" gated.

Three runs found tests to add, each written and the entry run again until caught: H4 first (no
same-weights variation lighter per pound: the curl's case); then H4 again and H7, once the same-weights
rule and the coach's own exclusions had taken over their cases (the incline curl's, and the
trap-bar deadlift's with the lower back sore). The review's skip of the search in a deload week
made M24's 35q (the coach's hold-back of the card) unreachable: the skip went, and 35q is caught.

Every older entry that mutates a changed file or runs a changed test, run again on the fix's code
from a green unit baseline: M23 to M26 87 and 67, M27 26 and 22, M28 2 and 1, M30 6 and 2, M31 14 and
12, M32 6 and 2, M33 16 and 15 (the first commit, then the review's), and the 56 M23 to M26 entries
that run the deload test again once it was repaired: all caught. M24's 35k4 (a step passed over offers
the next one) is re-anchored onto the route's loop in `mutate-m26.py`. Every table's anchors are
found.

## Verification

- `npm run verify` on `73ddfff`, alone: lint, types, unit 3,661 passed and 5 skipped by design (615
  files), the day rules in two more zones (38 and 38), build, privacy scan, build check, and the
  browser suite 443 passed and 14 skipped by design.
- CI on the branch `fix/harder-variation`: run 41197215867, success.
- `main` fast-forwarded to `73ddfff`; Deploy Pages run 41198579203, success. The live bundle's marker
  reads `73ddfff`.
- Live suite from the owner's machine: 438 passed + 19 skipped by design; one storage test on the 360 px phone failed once on a navigation race and passed 3 of 3 alone.

## Review on the phone

On Today, where a lift sits at the heaviest weight the place has:

1. Where the Adaptive Coach offers **A harder variation**, tap it: the lift's sheet opens with the
   harder variation first, its reasons saying "still heavy with the weights you have".
2. Where the lift's sheet lists none (Dumbbell Row at home, held at 50 lb, with "No safe alternative
   fits Home and your limitations"), the coach shows no such card; the lift's own line says the reps
   go up instead.
