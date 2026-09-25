# Tempo, effort, and rest guidance

Every exercise card shows a tempo chip, a one-rep tempo bar, and, behind a tap, the effort and
rest reasoning for the set at hand. All three are guidance: they follow the set's job, they are
shown with the evidence behind them, and they never change what is logged.

## Tempo

Notation is lower-pause-lift-squeeze in seconds; X means as fast as you can (modelled as one
second on the bar).

| Set                                             | Tempo   | Why                                                                          |
| ----------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| Strength role (main lift)                       | 2-1-X-0 | Lower for 2, pause 1 at the bottom, drive up with intent                     |
| Hypertrophy role                                | 3-0-1-0 | Lower for 3 under control, no pause, up smoothly                             |
| Isolation, finisher                             | 2-0-2-1 | Lower for 2, up for 2, squeeze the muscle for 1 at the top                   |
| Ramp (warm-up) set                              | 2-0-1-0 | Easy load, rehearse the working tempo                                        |
| Drop set                                        | 2-0-1-0 | Clean reps while the load comes down                                         |
| At the heaviest weight a place has, strength    | 3-1-X-0 | Lower for 3 and pause 1 so the same weight works harder; still drive up fast |
| At the heaviest weight a place has, other roles | 3-1-1-0 | Lower for 3, pause 1, make every rep count (not a set run to its effort)     |

- **Rep duration.** Rep durations from about 0.5 to 8 s produce similar hypertrophy; very slow
  reps (over 10 s) are inferior. Schoenfeld BJ, Ogborn DI, Krieger JW. Effect of repetition
  duration during resistance training on muscle hypertrophy: a systematic review and
  meta-analysis. Sports Medicine, 2015.
- **Intent on the lift.** The intent to move fast, even when the bar moves slowly, drives
  velocity-specific strength and power gains. Behm DG, Sale DG. Intended rather than actual
  movement velocity determines velocity-specific training response. Journal of Applied
  Physiology, 1993. Reviewed with tempo more broadly in Wilk M, Zajac A, Tufano JJ. The
  influence of movement tempo during resistance training on muscular strength and hypertrophy
  responses: a review. Sports Medicine, 2021.
- **Controlled lowering.** A longer lowering phase made no clear difference to muscle growth
  (g = 0.05, 90% CI -0.22 to 0.33, uncertain) and gave the same or greater strength gains in
  trained lifters (g = 0.33, 0.07 to 0.60) and in trials matched for the work done (g = 0.25,
  0.04 to 0.45), both with moderate certainty; a shorter lowering improved jump height, which the
  app does not train. The app's 2 to 3 s lowering keeps each rep controlled; it is not a claim
  that slower builds more muscle. Amdi CH, King A. The effect of eccentric phase duration on
  maximal strength, muscle hypertrophy and countermovement jump height: a systematic review and
  meta-analysis. Journal of Sports Sciences, 2025;43(20):2447-2464 (PMID 40692176). Until
  Maintenance 21 this line cited Roig et al., 2009, a review of lowering-only against lifting-only
  training, which does not test lowering speed.
- **Squeeze with attention.** An internal focus on the working muscle raises its activation and,
  over weeks of training, its growth, which is what a short top-position squeeze is for.
  Schoenfeld BJ, Contreras B. Attentional focus for maximizing muscle development: the
  mind-muscle connection. Strength and Conditioning Journal, 2016; Schoenfeld BJ, et al.
  Differential effects of attentional focus strategies during long-term resistance training.
  European Journal of Sport Science, 2018.
- **Pause at the bottom.** Removing the bounce so the muscle rather than the stretch reflex moves
  the load is coaching practice and the standard for judged presses; it is presented as practice,
  not as a trial result.

## Effort (reps in reserve)

RIR is reps in reserve: how many more clean reps you could have done. The scale tracks true
effort well in trained lifters. Zourdos MC, et al. Novel resistance training-specific rating of
perceived exertion scale measuring repetitions in reserve. Journal of Strength and Conditioning
Research, 2016; Helms ER, et al. Application of the repetitions in reserve-based rating of
perceived exertion scale for resistance training. Strength and Conditioning Journal, 2016.

| Set                          | Target | Why                                                                  |
| ---------------------------- | ------ | -------------------------------------------------------------------- |
| Strength roles               | RIR 2  | Strength gains do not need failure; 1 to 3 in reserve limits fatigue |
| Hypertrophy roles, isolation | RIR 1  | Growth improves a little closer to failure, so about one rep short   |
| Finisher, drop set           | RIR 0  | Low fatigue cost, so the last clean rep                              |
| Corrective, warm-up role     | RIR 3  | Quality over effort                                                  |
| Ramp (warm-up) set           | RIR 5  | A warm-up, far from failure, never a working set                     |

- Grgic J, et al. Effects of resistance training performed to repetition failure or non-failure
  on muscular strength and hypertrophy: a systematic review and meta-analysis. Journal of Sport
  and Health Science, 2022.
- Robinson ZP, et al. Exploring the dose-response relationship between estimated resistance
  training proximity to failure, strength gain, and muscle hypertrophy: a series of
  meta-regressions. Sports Medicine, 2024.
- Refalo MC, et al. Influence of resistance training proximity-to-failure on skeletal muscle
  hypertrophy: a systematic review with meta-analysis. Sports Medicine, 2023.
- Iversen VM, et al. No time to lift? Designing time-efficient training programs for strength and
  hypertrophy: a narrative review. Sports Medicine, 2021 (drop sets and pairings).

Readiness and the coach raise the target by one when fatigue is high; the RIR the user logs is
what the progression engine reads, never the target.

## Rest

| Set                            | Default rest                                          | Floor when fitted |
| ------------------------------ | ----------------------------------------------------- | ----------------- |
| Primary strength               | 2.5 min                                               | 2 min             |
| Secondary strength             | 2.25 min                                              | 2 min             |
| Primary hypertrophy (compound) | 2 min                                                 | 1 min             |
| Secondary hypertrophy          | 1.5 min                                               | 1 min             |
| Specialization                 | 1.25 min                                              | 1 min             |
| Isolation                      | 1 min                                                 | 45 s              |
| Finisher, corrective, warm-up  | 45 s                                                  | 45 s              |
| Superset round                 | 75 percent of the longer member's rest, at least 45 s | 45 s              |

The rest style in Settings scales every rest by 0.8, 1, or 1.2; floors never move. When a session
is fitted to less time, rests shorten toward the floors before sets are trimmed or rows dropped.

- **Strength needs full rests.** Compound strength sets need 2 min or more to recover force
  between sets; shorter rests cost reps and strength gains. Grgic J, et al. Effects of rest
  interval duration in resistance training on measures of muscular strength: a systematic
  review. Sports Medicine, 2018; Schoenfeld BJ, et al. Longer interset rest periods enhance
  muscle strength and hypertrophy in resistance-trained men. Journal of Strength and
  Conditioning Research, 2016.
- **Growth plateaus around 2 min.** About 2 min beats 1 min on compound lifts and the benefit
  levels off near 2 min. Schoenfeld et al., 2016; Singer A, et al. Give it a rest: a systematic
  review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle
  hypertrophy. Frontiers in Sports and Active Living, 2024; Grgic J, et al. The effects of short
  versus long inter-set rest intervals in resistance training on measures of muscle hypertrophy:
  a systematic review. European Journal of Sport Science, 2017.
- **Isolation recovers faster.** 60 to 90 s is enough for single-joint moves, and pairings with
  shorter rests are how a session fits less time without losing sets. Iversen et al., 2021.

## Where it appears

- The chip under the demonstration (`Tempo 2-1-X-0`) and the bar under "last time" open the
  reason, the form cue from the exercise's own first execution step, the effort and rest for this
  set, and the evidence lines.
- The bar moves like the weight: the fill drops at the lowering pace, pauses at the bottom for the
  hold, rises at the lifting pace, holds at the top for the squeeze, then repeats; the legend
  brightens as each phase plays. Everything stands still when the phone prefers reduced motion.
- Set rows say "easy, RIR 5" beside a ramp set and "last clean rep" for a drop set, and the
  logger's hints say the same in a few words ("Target 4-6", "Easy, RIR 5"; "Aim 8-12", "Last
  clean rep") that wrap rather than being cut off; the head ("Ramp 1 of 2", "Drop set") and the
  weight line say which kind of set it is (Maintenance 21).
- The How-to panel's "Why this target" list ends with the effort and rest evidence for the set.
- A hold (Plank, Farmer Carry) has no rep tempo and no reps in reserve: the card shows "Hold 30 s"
  where the bar would be, and its detail keeps the cue, the effort ("Good form: hold the position
  for the seconds, and stop when it slips") and the rest (Maintenance 20).

## Wording checked against the research (Maintenance 23)

A 3-second lowering builds muscle about as well as a faster one: reps lasting from about half a
second to 8 seconds build muscle about equally (Schoenfeld, Ogborn and Krieger, 2015), and the
meta-analysis of lowering speed found no clear difference (Amdi and King, 2025). The hypertrophy
reason therefore gives control, not a growth payoff: "lower for 3 under control, no pause, up
smoothly". The tempo itself is unchanged, so the time estimates are too. A muscle-building set
that the weights at a place pushed to its effort (more reps at a lighter load) keeps this tempo,
not the slower one of the heaviest weight: its reps bring the effort. A warm-up at bodyweight
reads "a few easy reps, rehearse the working tempo". The strength reason
already says what an X means ("drive up as fast as you can"), so the tempo row no longer adds "; X
is as fast as you can".

## The skimmable detail (Maintenance 8)

The tap on the tempo chip opens four labelled rows, each one line: Tempo (the notation and the
phase cue, which says what an X means: "drive up as fast as you can"), Cue (the form cue),
Effort (the RIR label and what it means for this set), and Rest (the length and why). The
research sits behind one "Why: the research" disclosure, closed by default. Its lines come from
`src/features/workout/evidence.ts`: each carries a two-word lead in bold, the duplicate ramp-set
line (the tempo and the effort guidance each explained ramp sets) is dropped, and the rest-style
line appears only when the profile's rest style is not Standard.
