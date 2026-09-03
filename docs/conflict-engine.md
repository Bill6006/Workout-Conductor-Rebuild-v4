# Conflict engine

`src/engine/conflicts/conflictEngine.ts` is the one reusable conflict-detection system. Every
generated workout, superset pairing, and alternatives list passes through it. It reasons over the
structured catalog metadata (muscles, movement pattern, equipment groups, station, grip, joint
stress, limitation flags, suitability), never over exercise names.

## Entry points

| Function                                          | Scope                                   | What it checks                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkExerciseFit(exercise, context)`             | one exercise vs. the user and the place | equipment at the location (`equipment` / `location`), limitation flags (`limitation`), joint stress on flagged joints (`joint-stress`, high blocks, moderate warns), disliked ids (`limitation`)                                                                                                                                            |
| `checkWorkoutConflicts(exercises, context, sets)` | a whole selection                       | everything above per exercise, duplicate exercises, three or more of one pattern (`duplicate-pattern`), four or more direct hits on one muscle (`muscle-overlap`), two heavy compounds on one muscle (`recovery`), two high-stress moves on one joint, two primary-strength lifts of one pattern (`progression-role`), time budget (`time`) |
| `checkSupersetPair(first, second, context)`       | one two-move block                      | same exercise twice, a lift that must stay solo (`superset`), two demanding compounds (`superset`), both grip-heavy (`grip`), same scarce station or costly transitions (`station`), shared high joint stress, shared primary muscle between compounds (`muscle-overlap`), plus fit for both                                                |
| `estimateExerciseMinutes(exercise, planned)`      | time                                    | setup time plus sets × (work + rest)                                                                                                                                                                                                                                                                                                        |

Every conflict has a `kind`, a `severity` (`block` or `warn`), the `exerciseIds` involved, and a
plain-language `message`. `isBlocked(conflicts)` is the single question callers ask.

## Context

`ConflictContext` carries the available equipment (a `Set` of catalog equipment ids), the
location name, the profile's limitations, the disliked exercise ids (names resolved through the
catalog aliases), and an optional time budget. `buildConflictContext(profile, location)` in
`src/engine/conflicts/context.ts` builds it from app state.

Profile limitations map to catalog metadata like this:

| Profile choice              | Catalog signal                                  | Result                                    |
| --------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Avoid barbell squats        | flag `barbell-squat`                            | block                                     |
| Avoid overhead pressing     | flag `overhead`                                 | block                                     |
| Avoid behind-the-neck moves | flag `behind-neck`                              | block                                     |
| Avoid dips                  | flag `dip`                                      | block                                     |
| Avoid wide-grip pressing    | flag `wide-grip`                                | block                                     |
| Knee pain                   | flag `deep-knee-flexion`, `jointStress.knee`    | block flag and high stress, warn moderate |
| Lower-back pain             | flag `spinal-loading`, `jointStress.lower-back` | block flag and high stress, warn moderate |
| Any other pain area         | `jointStress.<joint>`                           | block high, warn moderate                 |

## Who calls it

- The synthetic demo (`src/features/today/demo/demoWorkout.ts`) filters every slot pick and the
  superset pairing through it, and reports warnings as compromises.
- The alternative ranking (`src/engine/alternatives/rankAlternatives.ts`) excludes any candidate
  with a blocking fit conflict or a blocking superset conflict with the partner, and carries
  warnings into the candidate.
- The library shows a "Not here" badge for exercises blocked at the current place.
- Phase 3 generation and Phase 4 recalibration validate every workout with
  `checkWorkoutConflicts` before it is shown.
