# Maintenance 12: what the place can load, round B

Started on 2026-09-18 from the owner's sessions on the phone: a machine whose stack does not
have the weight the target names, a rack with no 2.5 lb plates on the day, a target that went up
without the dial saying so, a Location line that did not look like the control it is, a check-in
that asked for energy as a number, a preferred squat machine that the generator kept passing
over, and a custom exercise that could not say whether it loads from a pin, a bar, or a pair of
dumbbells.

## What was found

- **The engines knew one step per load kind and nothing about the place.** Every target was
  rounded to a fixed increment: 5 lb for a bar, 2.5 or 5 for dumbbells, 5 or 10 for a stack. A
  stack that runs 10 to 100 by tens and then by twenties, a set of dumbbells that stops at 50, or
  a rack missing its 2.5s produced targets that could not be loaded, and the logger nudged the
  dial through weights that did not exist.
- **There was no ceiling.** Progression kept adding weight to a dumbbell exercise past the
  heaviest pair on the rack, with no other lever offered.
- **The dial and the target line were silent about each other.** When the plan raised the weight
  the dial started at the new number, but a dial carried from the last set sat under the target
  with nothing to draw the eye.
- **Plate math assumed the full inventory.** The plate line asked for a 2.5 the rack did not
  have that day, so 120 read as 25, 10 and 2.5 a side when the choice was really 115 or 125.
- **A preferred exercise only earned points.** Fifteen points toward a slot did not beat a
  higher suitability, so the machine the owner wanted for squats was passed over.
- **The Location line was styled as text**, with the border and background of a button
  stripped, so nothing said it could be tapped.
- **Energy after the workout and the check-in used 1 to 5**, which the owner cannot read
  himself onto.
- **A custom exercise took its load kind from nowhere**, so its targets moved by the default
  step whatever the machine.

## Delivered

- **A loading engine** (`src/engine/loading/loading.ts`). Each place records what it can load
  under three keys: a stack per machine exercise, one dumbbell record shared by every dumbbell
  and kettlebell exercise, and the plates on the rack per side. Stacks and dumbbells are one or
  two ranges with a step, expanded to the exact list of weights; the rack is a list of plates.
  From the record and the exercise the engine derives the available weights, the real step, the
  heaviest weight, and the plates per side. A place with nothing recorded behaves exactly as
  before.
- **Every target lands on a weight that exists here.** Progression, the drop-set trigger, the
  in-session performance nudge, and the recalibration engine all fit their result to the place:
  snapped down onto the list of weights, or onto the grid the rack can make. Manual weights are
  never touched. A new `loading` trigger re-fits every unlogged entry when a record is saved
  during a workout.
- **A ceiling with a plan.** When the target would pass the heaviest weight the place has, the
  load holds there and the reps go up by two instead, with the reason on the card. The coach
  card names it once, offers a harder variation while the reps have room, or an extra set once
  they reach the ceiling; the alternatives list favours variations that are still heavy at the
  weights you have; the tempo cue slows the lowering and adds a pause so every rep counts.
- **Plates hosts the record.** On a bar the panel shows the rack's plates for the place as
  chips, and a Not today row for a plate missing this session only: tap the 2.5 and every bar
  target moves onto the 10 lb grid until the workout ends. On a machine or a dumbbell exercise
  the panel shows the record for this place and a Record it button that takes one or two ranges
  and a step. Nothing is applied without the Save tap, and the record is saved per place.
- **The dial nudges through real weights.** With a record the plus and minus move through the
  place's list, not a fixed step; without one they move by the real step for the bar. When the
  target is not on the list the line says the nearest weight that is.
- **The target line glows gold** while the dial sits below the target on a working set you have
  not touched, four pulses then still, in the theme's gold. It stops as soon as the dial moves.
  Reduced-motion settings turn the pulse off. The line is also the quiet way into Plates: a tap
  opens the panel where the place's weights are recorded.
- **Preferred exercises win their slot, your own machines included.** A preferred exercise that
  fits a slot takes it outright; the score only orders the rest, and preferred ones among
  themselves. Custom exercises now take part in every lookup the engines use, by pattern, by
  muscle, and by name, so a machine added through the creator and marked Preferred is picked
  for its slot before the session is built.
- **A step the place cannot make is never rounded away in silence.** When the next target,
  snapped onto the weights a place has, would land back on the weight it moved from, the load
  holds there and the reps go up by two, with the next real weight named in the reason. The
  generator fits the first preview to the place exactly as recalibration does.
- **A custom exercise says how it loads.** The creator has a How it loads choice: from the
  equipment, a machine stack, a bar with plates, dumbbells, a kettlebell, bodyweight, or a band.
  Left on automatic, the equipment decides.
- **The Location control keeps its border** and a gold chevron, so it reads as the control it
  is.
- **Energy after and the check-in ask in words.** Energy runs Drained, Low, Okay, Good, Full;
  soreness None to Wrecked; sleep Poor to Great; motivation None to Fired up. The number behind
  each word is unchanged, so every engine reads what it always did.
- **Surfaces.** No new buttons on the workout screen. The Plates panel gained its record; the
  creator gained one select; the check-in and finish sheets changed their labels.

## Verification

- Unit: custom exercises in the pattern, muscle, and name lookups and a preferred custom machine
  taking its slot; the generator fitting and capping the first preview; a swallowed step holding
  the load and pushing the reps while a reachable step passes; range expansion, snapping, nudging, the bar's step from the smallest plate, fitting with
  and without a floor; a recorded set of dumbbells snapping and capping every dumbbell target in
  a live session with reps pushed and the place's record queued for the cloud copy; a missing
  plate putting every bar target on the rack's grid for the session only; forgetting a record
  restoring the usual step; the dial nudging through a stack and naming the nearest weight; the
  pulse on an untouched dial under its target and never on a ramp, an edit, or once the dial
  moves; the target line's tap; the record editor's ranges, its validation, the rack chips and
  Not today; the coach's capped signal with each of its two actions and its silence when an
  extra set is already offered; the tempo cue at the ceiling; the load kind from equipment and
  the creator's own answer; the energy and check-in words handing back the numbers.
- Browser (`e2e/loadingRound.spec.ts`, all three device projects): the 2.5 chip moves the bar's
  step to 10 and the plate line stops asking for it, and turning the chip off restores the step;
  after a set logged light the target line glows and opens Plates on a tap, then stops when the
  dial moves; the finish asks for energy in words; the Location control has a border, a
  pointer, and a chevron, and the check-in offers words; the custom exercise creator offers How
  it loads.

## How to check on the phone

1. Workout, Barbell Bench Press: open Plates, tap 2.5 under Not today. The dial's step becomes
   10 and the plate line no longer names a 2.5.
2. Leg curl or any machine: open Plates, tap Record it, enter the stack's ranges, Save for the
   gym. The target lands on a weight the stack has; the plus and minus move through the stack.
3. Dumbbells: record the pairs once. When the plan would pass the heaviest pair the card says
   so, the reps go up instead, and the coach offers a harder variation.
4. Log a working set lighter than its target: on the next set the target line glows gold until
   you touch the dial. Tap it to open Plates.
5. Today: the Location line has a border and a gold chevron. Tap the check-in: words, not
   numbers. Finish a workout: energy in words.
6. Settings, Exercise library, Add: the How it loads choice.
