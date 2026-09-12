# Maintenance 7: the coach

Round two of the owner's second list, started on 2026-09-12 after Maintenance 6 went GREEN:
goals under one rule, coverage that acts or stays quiet, and every coach card ending in a tap or
a must-know.

## Delivered

- **Goals under one rule.** The goal decides where the weekly volume goes; the programming style
  decides how each set is done. "Balanced development" was identical to "Build muscle" in every
  engine, so it is gone: five honest choices remain, and a stored profile or backup that still
  says Balanced reads as Build muscle on the way in. "Build muscle" now says "Even volume across
  every muscle". "More overall size" says "Legs, back, and chest lead" and does exactly that:
  chest joins the boost and the boost is strong enough to show on the Progress targets. "Strength
  progress" says "Squats, presses, and pulls lead every session", and when the programming style
  is not Strength focus the goal's hint line says where the lower reps and longer rests live.
  Nothing is applied for you.
- **Coverage that acts or stays quiet.** The old card fired for almost any muscle at the start of
  a week, on a 15 minute session, on leg day for biceps, and offered nothing. The new rule fires
  only once half the week's sessions are done, for a muscle still under 40 percent of its target
  with nothing for it today, and only when no session still to come this week reaches it, read
  from the generator's own week plan. With room today the one tap adds two sets of the best
  accessory for the muscle, placed after the plan with the usual change banner. Without room the
  tap sets a coach focus: the next session's template and picks favour the muscle, its
  accessories lead, "Why this workout" says so, the Plan tab shows it with a Clear button, and it
  clears itself once a saved session trains the muscle or after a week. "Rear delts are", not
  "is".
- **Every card ends in a tap or a must-know.** The profile pain-area watch offers "Swap". An
  extra set on offer offers "Add the set". The superset readout moved onto the superset card
  itself. The logging tip moved under the first working set until a weight is logged. The
  progression notes that only restated a target are gone; a lowered load (micro-deload or reset)
  stays as a must-know because the plan already changed and the card says why. A strategy
  coverage note with nothing to tap never reaches the card.
- **Surfaces.** One hint line under the primary goal, one line and one button on the Plan tab,
  one line on the superset card, one line under the first working set. Nothing is applied
  without a tap.

## Verification

- Unit: goal weights and targets for More overall size and the retired Balanced choice; goal
  normalization on parse and in the store; coverage quiet early in the week, acting with room
  (two sets of an accessory, plural grammar), acting without room (a focus), and quiet when a
  coming session reaches the muscle or a focus is set; the swap on a pain-area watch; the
  extra-set tap and the lowered-load must-know; no logging or superset signals; the
  add-exercise trigger (two locked sets after the plan, unique ids, refused twice); the
  generator's focus (template tips, the muscle trained, the explanation line); the store's focus
  (set, preview rebuilt, reload, cleared by a session that trains it, expiry, clear on request).
- Browser (`e2e/coachRound.spec.ts`, all three device projects): five goal choices and the
  Strength progress hint in Settings; the superset card's own logged-rounds line.

## How to check on the phone

1. Settings, "What you are training for": five goals, "Balanced development" gone. Pick
   "Strength progress": the hint under it points at Programming style. Pick "Build muscle": the
   hint returns to the rule.
2. Today or Workout, the coach card: no "under target, no change to today". When a coverage card
   does appear, later in a week, it carries "Add 2 sets of ..." or "Lead the next session with
   ...". After the focus tap, the Plan tab's recovery card shows the focus with Clear.
3. Workout, a superset: the line "Only logged rounds count; the next round starts from what you
   actually did" sits under the round counter.
