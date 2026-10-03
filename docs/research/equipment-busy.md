# Equipment busy (the owner's item 37)

Asked for on 2026-09-25 and built in Maintenance 25 (round G). The owner: "When I tap Equipment
busy, temporarily move that exercise later in today's workout. After I complete the next exercise,
offer the busy exercise again. If I tap Equipment busy again, move it later again. Keep doing this
until it reaches the end of the remaining workout. At the end, Equipment busy becomes disabled. ...
Do not silently remove the exercise just because the equipment is temporarily occupied."

## What it did

Equipment busy marked the lift's equipment busy for the rest of the workout and swapped the lift
for an alternative, or left it out when none fitted ("Left out X: nothing safe fits right now.").
Every other lift that needed that equipment went the same way. Tried on each of the 101 lifts of the
default plans at the gym, at home and at dumbbells to 20 lb, it left the lift out 52 times and
swapped it 49 times, and other lifts changed in 60 of them; at home one tap turned every dumbbell
lift into band or bodyweight moves.

## What the research says

Both papers were checked on PubMed (E-utilities) on 2026-09-25.

- **Order and strength.** A meta-analysis of 11 trials found strength gains largest in the
  exercises done at the beginning of a session, and muscle growth similar in either order (Nunes,
  Grgic, Cunha, Ribeiro, Schoenfeld, de Salles and Cyrino, 2021, European Journal of Sport Science,
  PMID 32077380).
- **Order and reps.** A review found an exercise gets more reps over its sets when it comes early
  in a session, whatever the size of the muscles it trains (Simão, de Salles, Figueiredo, Dias and
  Willardson, 2012, Sports Medicine, PMID 22292516).

So moving a lift later costs a little of that lift's performance today, where leaving it out loses
all of its work; and growth does not depend on the order.

## The design that follows

1. Equipment busy moves the lift's row behind the next row that still has a set to do. Nothing is
   swapped or left out, and no equipment is marked busy for later changes.
2. The lift and the rows it passed take targets for their new places, by the rule the plan already
   uses for the work done before a lift today (session context): behind two pressing lifts, a bench
   press asks one step less, and says so. A lift under way keeps its sets. Since the review, the
   work done before a lift counts the sets already logged on lifts that now come after it: a bench
   moved with two sets done leaves the incline press that passed it no fresher than on the day its
   target was set, so it takes no step up. Every lift keeps the ramps it has, one added by hand too.
3. When the row in front is done, the busy lift leads again, and Equipment busy can move it again.
4. Once no row after it has a set to do, Equipment busy is off, and the sheet says: "Nothing after
   it is left to do, so there is nothing to move it behind: do it now, skip it today, or finish the
   workout." (On Today: "... do it when it comes up, or skip it today."). A lift with every set done
   is off too. The engine and both screens read one rule for this (`postponeRefusal`). Skip today
   and finishing work as they always have.
5. The move holds for the day: a change that builds the plan again (a check-in, a new length,
   harder or easier, a technique switched) puts the lift back behind the lifts it gave way to, where
   the rebuilt plan has both. A new place lets it go: the equipment was busy at the place left.
6. The plan's lines on the order stay true after a move: the summary names the lift that now comes
   first, and the main lift "leads" only while it does ("X is the primary strength lift, with full
   rests and warm-up ramp sets."). A pair or circuit moved is named by its lifts.
7. A session saved before this round kept a list of busy equipment that took lifts out of every
   rebuild. Nothing reads that list now.

## Uncertainty

- A new place plans the order afresh (point 5), so a lift moved there for busy equipment can come
  back in front; Equipment busy moves it again.
- A pair moves as a pair, even when only one of its moves needs the busy equipment.
