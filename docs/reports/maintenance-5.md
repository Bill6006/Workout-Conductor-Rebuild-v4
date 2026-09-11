# Maintenance 5: the numbers you lift

Round one of the owner's second list, requested on 2026-09-11: where the first weight comes
from, and a weight line that always says what to load.

## Delivered

- **A max you enter.** A lift with no history of its own carries one small lime link beside
  "First time logged": "Know your max?". It opens a sheet that takes a recent set you did (weight
  and reps, converted with Epley) or a one-rep max, shows the first target it would set, and
  saves with one tap. Saving re-targets that lift's unlogged sets in today's session, ramps
  included, through the recalibration engine with the usual change banner. "Not now" brings the
  link back in a week; "Don't ask for this lift" keeps it away for good; a logged working set
  hides it because the running estimate takes over. The link only returns after a break of
  three weeks or more. Entered maxes live in the meta store and are in every backup.
- **A starting estimate from you.** Settings' units card now takes optional age and sex beside
  bodyweight, kept on this device only. With a bodyweight, every first-time lift starts from a
  reference max per movement pattern and load type, scaled by experience, sex, and age, at
  85 percent of the load it implies, and "Why this target" says exactly which numbers it used.
- **Never below the bar.** A barbell, EZ-bar, trap-bar, or Smith lift never targets, ramps,
  or drops below its empty bar. With no bodyweight and no max, a first-time bar lift starts at
  the empty bar and says so; a stack or dumbbell move still asks for the weight.
- **Family estimates convert between load types.** A dumbbell per hand is no longer treated
  as a barbell: 60 lb per hand on a dumbbell press now stands in as about 190 lb on the bench,
  not 60. That is the mechanism behind the 15 lb barbell bench press in the owner's screenshot.
- **The line under the weight says what to load.** "Step 5" is gone. The logger reads "Target
  155 lb", "Warm-up 80 lb", "Drop 125 lb", or "Bodyweight", and the arrow buttons carry the
  increment in their labels instead.
- **Two prefill defects fixed on the way.** Ramp and drop sets prefilled with a second discount
  of a load the engine had already scaled (a 10 lb ramp target showed a 5 lb dial), and the
  first working set after the ramps prefilled with the last ramp's weight. Ramp and drop sets
  now prefill as prescribed; a working set follows the last logged working set, else its
  target. The logger also re-keys when its set's target changes, so an entered max updates the
  dial, not only the line under it.
- **In-session autoregulation moves from the weight actually lifted.** The performance trigger
  built the next load from the planned target; a lifter starting at the bar who logged 135 lb
  would have been sent to 50 lb. It now moves from the logged weight and stays above the bar.
- **No re-test is scheduled**, by evidence: reps-in-reserve estimates track a true max well in
  trained lifters, autoregulated loading matches or beats percentage-of-max loading over a
  training block, and a tested max goes stale within weeks for newer lifters while the running
  estimate updates every session. Details in `docs/progression-engine.md`.
- **Surfaces.** One link on first-time cards, one sheet behind it, two optional fields in
  Settings. Nothing is applied without a tap.

## Verification

- Unit: reference ratios, age and sex factors, the body estimate and its evidence line, the
  empty-bar floor, load-type conversion, the entered-max record (Epley, units, snooze, tolerant
  parsing), the progression engine's start modes (entered max, estimate, bar, none) and the
  converted family estimate, the store saving a max, re-targeting the preview, surviving a
  reload, leaving logged sets alone, and snoozing the offer, the card link, and the logger's
  weight line.
- Browser (`e2e/startingLoads.spec.ts`, all three device projects): the preview and the card
  show the empty bar on a first-time bench press, the weight line reads "Warm-up 45 lb" then
  "Target 45 lb", entering 185 × 5 previews and sets a 155 lb first target with the banner and
  the evidence line, the link disappears; "Not now" hides the link across a reload; bodyweight,
  age, and sex in Settings give the bench a 120 lb starting target with its evidence line.

## How to check on the phone

1. Today: a first-time bar lift now shows a load in its row (for example "4 × 45 × 4-6"). Start
   the workout: the card reads "Ramp set · 45 lb", the dial shows 45, and the line under it says
   "Warm-up 45 lb".
2. Tap "Know your max?" beside "First time logged". Enter a recent set you did, watch the first
   target preview update, tap Save: the banner says the first target was set from your max, the
   card and the dial follow, and "Why this target" explains it. "Not now" keeps the link away
   for a week.
3. Settings, "Units and body": enter bodyweight, age, and sex. Back on Today the first-time
   lifts carry estimated starting loads and "Why this target" names the numbers used.
