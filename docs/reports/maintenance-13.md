# Maintenance 13: session context, round C

Started on 2026-09-18 after Maintenance 12 went GREEN. Four items from the owner's list: the
backup reminder that kept asking for an export he no longer needs, targets for later exercises
that were worked out as though he walked in fresh, warm-up ramps decided per exercise without
asking what the session had already done, and a first target of "enter the weight" for a lift
never done while lifts he has done said plenty about his strength.

## What was found

- **The backup reminder did not know about the cloud copy.** The coach card asked for an export
  from the third workout on, and every fortnight after, while every workout was already in the
  owner's own database.
- **Targets for later exercises ignored the session.** They were computed when the session was
  generated, before anything was lifted, so an incline press after a full bench session got the
  same number as an incline press done first. Exercise order is one of the better supported
  acute findings: whatever is trained later performs worse, typically by five to fifteen
  percent depending on what came before.
- **The obvious fix would double count.** A target read from a logged set already carries the
  fatigue of that day: last time's incline number was itself recorded after a bench session.
  Subtracting fatigue from a number that includes it would drift targets down forever.
- **Ramps were decided per exercise.** A flat press, an incline press, and a shoulder press each
  got a full ramp, and a first-time bar lift at the empty bar got two ramps at the working
  weight itself.
- **A lift never done started from bodyweight or a blank**, though the lifter's other lifts say
  how strong they are against the same reference table.

## Delivered

- **The backup reminder goes quiet while the cloud copy is on and current.** Current means the
  token is set, nothing is waiting to be sent, the last sync succeeded, and there was one. The
  moment the copy is off or stale, the reminder returns as before.
- **Session context** (`src/engine/recovery/sessionContext.ts`). Before each exercise the engine
  measures the overlapping work that comes before it today: working sets already logged, sets
  still planned, each weighted by how much the two exercises share (a primary muscle fully, the
  same group by half), with skipped sets carrying nothing. The same measure is taken on the day
  the target came from, read from the saved record. The load moves by the difference: three
  more overlapping sets than the reference day is a step down, six is two, three fewer is a
  step up only when the reference day was clean. A day in the usual order changes nothing, so
  nothing drifts. The reason is on the card.
- **A long break makes what follows a fresher start.** Twenty minutes without a set, which is
  the same threshold the app already used for a long interruption: the work before it counts
  half toward the fatigue carried into what follows, the ramps come back, and the exercise in
  front gets one light ramp set before its remaining working sets. A location change part way
  through rebuilds the rest at the new place, on the same context.
- **Ramps decided from the whole session.** A warm-up does two jobs: raising tissue temperature,
  which the first exercise already did, and rehearsing the movement at the load, which is about
  the nervous system and the joint angle. Only the second survives into later exercises. So the
  first heavy compound keeps its full ramp; a later exercise on the same pattern gets none
  unless it is markedly heavier; a later exercise on the same muscles at a new angle gets one
  light set; the first exercise to load a cold joint gets a full ramp; a long break puts the full
  ramp back.
- **Never at the working weight.** A ramp sits at least a step under the working weight, never
  under the bar, each heavier than the last. When nothing lighter exists, as at the empty bar,
  there is no ramp. Ramps follow a weight set by hand too.
- **The cross-exercise estimate** (`src/engine/progression/crossEstimate.ts`). For a lift never
  done, each lift with history, or a max entered by hand, gives an estimated max; divided by
  that lift's reference ratio it says how strong the lifter is against the table, and the new
  lift's ratio turns it back into a max. Lifts on the same muscles weigh most, recent ones more
  than old. It comes before the bodyweight estimate and needs no bodyweight; the card says which
  lift it came from.
- **Surfaces.** Nothing new to tap. The reasons appear in Why this target and in the
  recalibration summary after a long break.

## Verification

- Unit: overlap weights; preceding work with sets done, coming, and skipped, and the half weight
  before a long break; the same measure in a saved record; the step rule; the target unchanged
  in the usual order and moved a step either way; the estimate from one lift, from several, from
  an entered max, and its absence without history or for a bodyweight move; ramps full on a
  cold pattern, none on a trained one unless markedly heavier, one on warm muscles, full again
  after a break, none at the empty bar; ramp weights under the working weight and rising; the
  generator giving the first compound its ramp and later presses at most one; resuming after a
  long break adding one light ramp before the next working set; the backup reminder quiet only
  while the cloud copy is current.
- Browser (`e2e/sessionContext.spec.ts`, all three device projects): no ramp at the empty bar;
  with a max the ramps arrive under the target; the next press gets at most one; every other
  pressing lift's first target names the bench it came from.

## Follow-up from the owner's first look (2026-09-18)

Two things from the phone, both older than this round, fixed under the same gate.

- **An offer the lifter took kept coming back.** The coach said triceps was under its weekly
  target and offered "Add a set to Dumbbell Bench Press". The evidence behind that offer is two
  weeks of history, which a tap does not change, and nothing recorded that the offer had been
  taken. So the same button returned after every recalibration, each tap added another set, and
  the main lift reached fifteen. Now the session remembers every offer taken
  (`session.coachAccepted`, keyed by where the offer came from and what it said) and the coach
  does not make it twice; a route step keeps its own record as before. An exercise whose sets
  were already changed today is never offered another set by any signal. And whatever asks, one
  exercise stops at eight working sets (`MAX_WORKING_SETS`), with the reason in the summary.
- **The extra set went to the wrong place.** The offer took the first exercise that trains the
  muscle, which was the heavy press that opens the session: the costliest place to add a set and
  the least direct for triceps. It now goes on direct work for the muscle, an exercise that
  leads with it before one that only includes it, isolation before compound, and never on the
  strength lifts at the top. With nothing direct today it offers two sets of an accessory when
  there is room, or the next session leading with the muscle.
- **The set list took half the screen when opened.** Every set still to come had its own
  two-line row. A run of identical sets is now one row ("Sets 2-4"), the warm-up tags are gone
  because the name already says Ramp, rows that only inform are slimmer while rows you can tap
  keep their height, and Show fewer folds the ramps back as well. The same state that took
  seven rows now takes four.

- **Found by the live run: removing the token could be undone by a sync still in flight.** A
  sync reads the token when it starts and wrote "on" when it finished, even if the token had
  been removed in between, so the card could flip back to on with no token behind it. Saving or
  removing the token now bumps an epoch, and an attempt that started before the change drops its
  result. A held sync in the unit suite proves it: the test fails without the guard.

## How to check on the phone

1. Start a workout with no max entered: the bench begins at Set 1, no ramp at 45.
2. Enter a max: two ramps appear, both under the target.
3. Open the incline press's How to: its target came from your bench.
4. Do a session, leave the gym, come back after twenty minutes: one light ramp on the exercise
   in front, and the rest of the session starts fresher.
5. With the cloud copy on and synced, the backup card stays away.
