# Maintenance 15: programming styles chosen by the goals, round E

Started on 2026-09-18 on the owner's go, the last round of his third list: more research-based
programming styles, with his goals and settings choosing the style. Two corrections from him
while it was being built shaped it: no time-efficient style, because the workout-length dropdown
already is that control; and serious styles with the research behind them, fat loss included,
with the goals choosing automatically.

## What was found

- **Three styles, and the lifter had to know the answer in advance.** Hybrid, Hypertrophy focus,
  Strength focus, picked by hand. His own example: goals about size, style on Hybrid, and no way
  to know the research points elsewhere.
- **The research tells few things apart.** The 2026 ACSM position stand, an overview of 137
  systematic reviews, found that few prescription variables change outcomes at all: heavy loads
  done first for strength, weekly sets for size. Failure, set structure, tempo, and periodization
  did not consistently matter. So the honest list is short, and each style has to earn its place.
- **A rep range could change and the weight did not.** The progression engine carried last
  session's weight into whatever range was asked next. It already happened whenever the same
  lift appeared in a different role (fives one day, eights the next, same weight), and any style
  that rotates rep ranges would have hit it every session.
- **The profile syncs, and an older copy of the app rejects a value it does not know.** It
  validates the style as a strict list of three; anything else makes it throw the profile out
  and ask for setup again, which would then overwrite the good profile in the cloud copy.

## Delivered

- **Seven styles, each with its research.** Hybrid, Hypertrophy focus, Strength focus, and four
  new ones: **Undulating** (the main lifts rotate heavy, moderate, and light), **Lean-down**
  (losing fat: keep the muscle and strength), **Light weights** (limited weights or sore joints),
  and **Foundation** (new to lifting). Each has one line in the chooser, an evidence grade
  (Strong, Moderate, or Mixed), and its sources. Twenty-five studies, every one looked up on
  PubMed and its abstract read before a claim was written; `docs/research/programming-styles.md`
  has them all with DOIs.
- **Auto: the goals choose.** One new option at the top of Programming style. It reads the
  profile only, in a fixed order: a beginner gets Foundation; Losing fat gets Lean-down; strength
  with a size goal gets Hybrid; strength alone gets Strength focus; size goals alone get
  Hypertrophy focus. Settings says which rule decided in a sentence, names the setting that would
  change the answer, and folds the research under one line. Today shows "Auto · Hypertrophy
  focus", and Why this workout says the style was picked from the goals.
- **Losing fat is one switch in Goals.** It is a direction, not a muscle priority, so it sits
  beside the goals instead of replacing one. Under Auto it changes how every set is done.
- **Lean-down says what lifting can and cannot do.** The heavy lift stays heavy and the sets
  stay where they are, because a deficit blunts muscle gain but not strength and more sets kept
  no more muscle. Nothing is taken to failure: no zero-reserve finisher, no drop set planned or
  offered, and the coach stops offering extra sets. The diet does the rest, and the app says so.
- **Auto never reads the training log.** A choice that moved with every good or bad week would
  change the plan under his feet. What the log can say comes through the coach with one tap:
  two or more lifts stalled at a fixed rep range brings "Rotate the rep ranges", with the
  research and the fact that it is mixed both on the card.
- **Nothing is switched silently.** His profile keeps its style. The gold card says once where
  his goals point ("Your goals point to Hypertrophy focus, not Hybrid", or a quieter tip when
  they already agree), with one action: Let my goals choose. Not now uses the usual memory. A
  style picked by hand, or Auto already on, is never second-guessed, and no style offer is made
  while a workout is under way.
- **The weight follows the reps.** A logged session now counts toward today's target only when
  it was run at about the same rep range. Each range progresses from its own sessions; a range
  the lift has never been run at starts from 95% of what the latest estimated max implies, and
  the evidence line says so. A break is measured from the lift's last session at any range. A
  lift that stays at one range behaves exactly as before.
- **A stall is read within one rep range too.** The stall detector compared estimated maxes
  across ranges, and an estimate read from fives differs by a few percent from one read from
  fifteens. A lift that rotates its ranges is now judged on the sessions run at the newest one,
  so a light day neither fakes a stall nor hides one. Found by reading my own new style against
  the existing coach, not by a test; two tests pin it now.
- **Stored so an older copy of the app still works.** The choice rides in a new optional field
  and the original field always keeps the nearest original style. Both new fields read a value
  from a newer copy of the app as unset instead of failing the profile.
- **Surfaces.** One new option and four new styles in an existing control, one folded panel
  under it, one switch in Goals, one coach card. No new screen, no new button on the workout.

## Left out, and why

- **A time-efficient style**: the workout-length dropdown is that control (owner, 2026-09-18).
- **Power and muscular-endurance styles**: the research distinguishes them, but no goal in the
  app would select them and the catalog has no jumps, throws, or Olympic lifts.
- **Top set and back-off sets**: every working set of an entry shares one target in the
  engines; that is a larger change than this round.

## Verification

- Unit: the catalog covers every style with sourced claims; the Auto rules in order, with
  sources that exist; the three original styles pinned exactly as they were; Light weights,
  Foundation, and Lean-down prescriptions; undulating zones per lift and their rotation with
  the log; the rep-range rule (a new range, each range its own reference, misses counted within
  a range, the cap's two-rep shift, a stale reference, a break measured across ranges, and no
  change for a lift at one range); generated workouts under each style, drop sets included; the
  store rebuilding the plan on a style change and following Losing fat under Auto; the original
  field staying readable by an older copy; a value from a newer copy reading as unset; the coach
  offers, their ranks, their silence once a workout starts, and no extra set while losing fat;
  the Settings control and the Losing fat switch.
- Browser (`e2e/styles.spec.ts`, all three device projects): Auto picks Hypertrophy focus for
  the default goals and says why; the research opens; Today names it; Losing fat moves Auto to
  Lean-down and a reload reads it back; a style picked by hand stands and shows Mixed evidence;
  a profile rewritten as one from before this round gets the coach card, one tap sets Auto, and
  the card does not return.

## Review

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

1. Today: the gold card should say where your goals point. Tap **Let my goals choose**. The
   Style line under What the conductor knows reads "Auto ·" and the style.
2. Settings, Programming style: Auto is first. Under the list, the panel says what Auto picked
   and why; tap **The research** for the studies.
3. Settings, Goals: turn on **Losing fat right now**. The panel changes to Lean-down. Turn it
   off again unless you are cutting.
4. Pick Undulating by hand for a session if you want to see the rotation: the first lift's reps
   change each time it comes up, and its weight moves with them.
