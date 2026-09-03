# Workout engine

`src/engine/workoutGenerator/generate.ts` is the pure, deterministic generator. Given the profile,
the current place, the workout history, the date, and the workout-length choice, it returns a
`GeneratedWorkout` (see `src/engine/workout/types.ts`): title, goal, duration facts, muscle
priorities, blocks, warm-up plan, explanation, confidence, compromises, and recalibration metadata.

## Inputs to decisions

| Input                       | Owner                               | Effect                                                                                                                                                                                            |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goals and style             | `src/engine/volume/weeklyVolume.ts` | Goal weights per muscle (priority muscles up to 1.6), weekly set targets, template choice                                                                                                         |
| Workout history             | `weeklyVolume.ts`                   | Direct and indirect sets in the last 7 days, days since each muscle and exercise, templates in the last 14 days                                                                                   |
| Muscle priorities           | `computeMusclePriorities`           | goal weight × freshness (trained within a day: 0.4, 2 days: 0.85, 4+ days: 1.1) + weekly deficit                                                                                                  |
| Template                    | `chooseTemplate`                    | Push + arms, Pull + arms, Lower body, Upper body, Full body; average priority of the muscles covered, minus a rotation penalty for templates used in the last two sessions, plus a strength bonus |
| Place and limitations       | conflict engine                     | Every slot pick and every pairing must pass `checkExerciseFit` and `checkWorkoutConflicts`                                                                                                        |
| Preferences and familiarity | `pickForSlot`                       | Preferred exercises rank first; exercises done in the last three weeks get continuity, ones done yesterday are avoided                                                                            |
| Progression role            | `src/engine/progression/roles.ts`   | Sets, rep range, RIR, and rest per role and style; warm-up ramp sets per exercise and length                                                                                                      |
| Workout length              | `src/engine/duration/duration.ts`   | Target minutes, general warm-up budget, time estimate used by fitting and display                                                                                                                 |
| Techniques                  | generator                           | Supersets pair isolation moves with different muscles; circuits replace isolation work on short hypertrophy sessions; one optional drop set on a safe isolation move                              |

## Duration fitting

The Default session is built first from the template. For any target the engine then:

1. forms a circuit when circuits are on, the template is not strength-priority, and the target is 30 min or less;
2. pairs isolation moves into two-move superset blocks (at most two pairs) when supersets are on and the conflict engine allows the pair;
3. caps the number of list rows (15 min: 3, 30 min: 5, 45 min: 6, Default: 8), dropping the lowest-value row first; paired rows are worth more than their weakest member because they save time, and the main lift is never dropped;
4. while the estimate exceeds the target by more than a minute: shortens rests toward the floors (strength 120 s, hypertrophy 60 s, isolation 45 s), trims one set from the lowest-value exercise (main lift keeps at least three working sets), then drops the lowest-value row;
5. adds one drop set on the last drop-set-safe isolation move when drop sets are on and either the session is shorter than Default or that muscle is under half its weekly target, unless it would break the time target.

Every step is recorded in `explanation.fittingSteps` and shown under "Why this workout". When
even the leanest plan runs over, `duration.overByMinutes` is set and the card says the session
may run a few minutes over (the End-by-exact-time mode arrives with recalibration in Phase 4).

## Time estimation

`estimateWorkout` adds the general warm-up, each block's work (45 s strength sets, 40 s
hypertrophy, 35 s isolation, 25 s ramp sets, 20 s drop sets), the programmed rests (none after
the last set of a block), and setup plus transition time from the catalog. Supersets pay one rest
per round and a 15 s switch; circuits pay one rest per round and 12 s per switch.

## Data model notes

- A superset block has exactly two entries and one label, for example
  `A1 Cable Fly + A2 Lateral Raise`; the Workout tab shows one row per block.
- Every set carries `kind`: `warmup`, `working`, or `drop`. Warm-up sets never count toward
  working totals, progression, or PRs.
- `WorkoutRecord` (`src/core/validation/workoutRecord.ts`) is the history shape the volume logic
  reads; Phase 5 logging writes it.
- The workout-length choice lives in app state for the current workout only; the Default length
  is the profile's typical workout length, editable in Settings.
