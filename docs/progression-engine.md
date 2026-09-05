# Progression engine, fatigue, strategy, and the Adaptive Coach

Four pure modules turn actual completed records into the next targets and one coaching surface.
None of them changes a workout by itself; every change is a tap that runs through the
Recalibration Engine.

## Progression engine (`src/engine/progression/progression.ts`)

`performanceHistory(history, exercise)` reads the completed working sets of an exercise from the
saved records, newest first. Warm-ups and skipped sets never count. When the exact exercise has no
history, exercises in the same progression family stand in, marked `viaFamily`, so an accepted
alternative keeps its lineage.

`recommendNextTarget` returns the load, rep range, RIR, a mode, evidence lines, a session count,
and a confidence:

| Situation (from the last sessions)                                 | Mode                                      | Load               |
| ------------------------------------------------------------------ | ----------------------------------------- | ------------------ |
| Nothing logged for the exercise or its family                      | `start`                                   | none; user enters  |
| Strength role, every set cleared the floor with reps in reserve    | `weight`                                  | + one increment    |
| Strength role, floor cleared but little in reserve, or a set under | `maintain`                                | same               |
| Hypertrophy or isolation, every set at the top of the range        | `weight`                                  | + one increment    |
| Hypertrophy or isolation, every set inside the range               | `reps`                                    | same, one more rep |
| One session under the floor                                        | `maintain`                                | same               |
| Two sessions in a row under the floor                              | `deload`                                  | −10 %              |
| Three sessions in a row under the floor                            | `regress`                                 | −15 %              |
| Fatigue high (from `interpretFatigue`)                             | `maintain`                                | same               |
| Two sessions at the top of the range (hypertrophy)                 | `setsAdvice` = 1 (offered, never applied) |

Increments come from the equipment: 5 lb or 2.5 kg on bars, 5 lb or 2 kg per dumbbell, 10 lb or
5 kg on stacks. `applyProgression` writes the load and reps into the working sets, calculated ramp
loads into the warm-up sets (60 %; 50 % and 75 %), and about 80 % into a drop set, and leaves any
value the user set by hand (`entry.manual`) untouched. The generator and every substitution call
it, so every card shows a load and a "Why this target".

## Fatigue (`src/engine/recovery/fatigue.ts`)

Sessions in the last 7 days, consecutive training days, how far logged reps in reserve drifted
below the targets over the last two sessions, "too hard" and pain ratings in the last three, and
today's check-in combine into `fresh`, `normal`, `elevated`, or `high` with evidence lines. High
fatigue holds loads in the progression engine and puts recovery first on the coach.

## Multi-session strategy (`src/engine/strategy/strategy.ts`)

`analyzeStrategy` looks at the last twelve qualifying sessions on demand and never diagnoses from
one poor set or one poor session:

- **Load plateau**: three sessions at the same load while hitting the top of the range → add
  weight; two sessions under the floor at the same load → micro-deload.
- **Rep plateau**: reps fading by two or more from the first to the last set in two of three
  sessions → increase rest; best reps flat over three sessions inside the range → add reps.
- **Fatigue**: fatigue high with top-set estimates down 5 % → micro-deload; high alone → hold.
- **Recovery**: three or more days in a row, or two of three sessions rated too hard → hold.
- **Exercise fit**: replaced or skipped in two of its last three appearances → open alternatives.
- **Coverage**: a goal-priority muscle under half its weekly target two weeks running → adjust
  volume.

`sessionFeedback` grades a saved session exercise by exercise (progressed, on target, short) and
adds the rating's implication; it shows on the completion surface as "Coach".

## Coach Conductor (`src/engine/coach/coachConductor.ts`)

Every system contributes signals; the conductor resolves them by fixed priority:
safety/form > save/storage > recovery/fatigue > plateau > progression > exercise fit > weekly
coverage > rest > tips. Within a domain, severity then confidence decide. The winner becomes the
one gold Adaptive Coach card (`src/components/AdaptiveCoach/AdaptiveCoachCard.tsx`) with a
headline, up to three Why lines, and at most one action. A major action (a micro-deload) needs a
second tap to confirm. The card says how many signals were checked and never applies anything.

Evidence uses actual completed records and logged sets only; the logger's unlogged values and the
next round of a superset are never evidence. Superset coaching reads both moves and lists what was
actually logged this session. Evidence is duration- and readiness-aware through the fatigue signal
and the session's length choice; when recovery comes first, the action is the existing 45-minute
length, not a separate mode.

Actions map to existing systems: recalibration triggers (target weight, rep range, sets, rest
adjust, drop set, duration), the rest timer, the readiness check-in, the alternatives sheet, or a
backup export.

## Coaching policy by experience (`src/engine/coach/experience.ts`)

The experience level chosen in Settings sets a policy the coach, the progression engine, and
the stall detector all read:

| Policy                                                                                                   | Beginner    | Intermediate   | Advanced       |
| -------------------------------------------------------------------------------------------------------- | ----------- | -------------- | -------------- |
| Tone / reasons shown                                                                                     | explain / 3 | brief / 2      | brief / 2      |
| "Follow today's plan" card when nothing outranks the plan                                                | yes         | one quiet line | one quiet line |
| Signals that restate a target (load goes up, ready for more load, aim one rep higher, superset readouts) | shown       | hidden         | hidden         |
| Strength roles: clean sessions before load moves                                                         | 1           | 1              | 2              |
| Reserve tolerance under the prescribed RIR                                                               | 0.5         | 0.5            | 0              |
| Double progression: top-of-range sessions before load moves                                              | 1           | 1              | 2              |
| Exposures without a better max before a stall                                                            | 3           | 4              | 4              |
| Exposures a route step gets before the next                                                              | 2           | 2              | 2              |

Deloads, resets, extra-set offers, safety, recovery, coverage, and stalls speak to every level.

## Stall detection and coach routes (`src/engine/strategy/plateau.ts`)

- An exposure is one session with completed working sets of a lift; the estimated max is the
  best set's Epley estimate.
- A stall is the newest N exposures with no estimated max more than 1 percent above the oldest
  of them, at the prescribed effort (average RIR within half a rep of the target). Sets ending
  1.5 reps or more above the target RIR in at least half the exposures are diagnosed as
  undershooting instead, and the next load step is offered. Two or more exposures under the rep
  floor are left to the deload rules, and a latest exposure at the top of the range is left to
  progression.
- A stalled lift opens a route: shift the rep range (strength range to hypertrophy range or
  back), swap for a variation (the alternatives sheet), short deload (10 percent, second tap),
  add a working set. The card shows the route with the current step marked and offers that step
  as its one action; tapping records the step. After the policy's exposures without a better
  max the next step is offered; when the max moves the route closes; after the last step the
  card asks for a different exercise for the pattern.
- Routes are one record (`coach-routes`) in the meta store, backed up with everything else.
