# Workout engine

`src/engine/workoutGenerator/generate.ts` is the pure, deterministic generator. Given the profile,
the current place, the workout history, the date, and the workout-length choice, it returns a
`GeneratedWorkout` (see `src/engine/workout/types.ts`): title, goal, duration facts, muscle
priorities, blocks, warm-up plan, explanation, confidence, compromises, and recalibration metadata.

## Inputs to decisions

| Input                       | Owner                               | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goals and style             | `src/engine/volume/weeklyVolume.ts` | Goal weights per muscle (priority muscles up to 1.6), weekly set targets, template choice. One rule: the goal decides where the weekly volume goes, the programming style decides how each set is done. More overall size leads with legs, back, and chest; Strength progress adds Full body to the rotation; the retired Balanced choice reads as Build muscle. The style is the lifter's pick or what Auto comes to from the goals, experience, and the Losing fat switch (`resolveStyle`, Maintenance 15); Foundation trains full-body and upper/lower sessions whatever the weekly frequency |
| Workout history             | `weeklyVolume.ts`                   | Direct and indirect sets in the last 7 days, days since each muscle and exercise, templates in the last 14 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Muscle priorities           | `computeMusclePriorities`           | goal weight × freshness (trained within a day: 0.4, 2 days: 0.85, 4+ days: 1.1) + weekly deficit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Template                    | `chooseTemplate`                    | Push + arms, Pull + arms, Lower body, Upper body, Full body; average priority of the muscles covered, minus a rotation penalty for templates used in the last two sessions, plus a strength bonus                                                                                                                                                                                                                                                                                                                                                                                                |
| Place and limitations       | conflict engine                     | Every slot pick and every pairing must pass `checkExerciseFit` and `checkWorkoutConflicts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Preferences and familiarity | `pickForSlot`                       | Preferred exercises rank first; exercises done in the last three weeks get continuity, ones done yesterday are avoided                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Progression role            | `src/engine/progression/roles.ts`   | Sets, rep range, RIR, and rest per role and style; warm-up ramp sets per exercise and length                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Workout length              | `src/engine/duration/duration.ts`   | Target minutes, general warm-up budget, time estimate used by fitting and display                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Techniques                  | generator                           | Supersets pair isolation moves with different muscles; circuits replace isolation work on short hypertrophy sessions; one optional drop set on a safe isolation move                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Duration fitting

The Default session is built first from the template. For any target the engine then:

1. forms a circuit when circuits are on, the template is not strength-priority, and the target is 30 min or less;
2. pairs isolation moves into two-move superset blocks (at most two pairs) when supersets are on and the conflict engine allows the pair;
3. caps the number of list rows (15 min: 3, 30 min: 5, 45 min: 6, Default: 8), dropping the lowest-value row first; paired rows are worth more than their weakest member because they save time, and the main lift is never dropped;
4. while the estimate exceeds the target by more than a minute: shortens rests toward the floors (strength 120 s, hypertrophy 60 s, isolation 45 s), trims one set from the lowest-value exercise (main lift keeps at least three working sets), then drops the lowest-value row;
   then, when a dropped row left minutes unused, keeps its best move on its own at the sets already trimmed if that fits (rows go whole, so the last one out can leave a gap far bigger than the overrun it cured); asked to make the session harder, the fit may take back an added set but never one the plan already had;
5. adds one drop set on the last drop-set-safe isolation move when drop sets are on and either the session is shorter than Default or that muscle is under half its weekly target, unless it would break the time target.

Every step is recorded in `explanation.fittingSteps` and shown under "Why this workout". When
even the leanest plan runs over, `duration.overByMinutes` is set and the card says the session
may run a few minutes over (the End-by-exact-time mode arrives with recalibration in Phase 4).

## Time estimation

The estimate is the timeline the workout screen itself runs, so a plan that says 45 minutes takes
45 minutes when its own guidance is followed (Maintenance 16). `estimateSeconds` walks the same set
order (`blockSequence`) and applies the same rest rule (`restBetween` in `workout/sequence.ts`)
as the rest timer, which makes the two impossible to disagree; a test checks, for generated
sessions at every length and at every point through them, that the estimate's rest equals the sum
of the rests the timer would show.

- **A set** is timed at the middle of its rep range and the tempo the app coaches for its job
  (`REP_SECONDS`: 4 s a rep for strength and hypertrophy, 5 s for isolation and for a lift held at
  the heaviest weight a place has, 3 s for ramp and drop sets), plus getting into position
  (`SET_OVERHEAD_SECONDS`). A test holds these to `features/workout/tempo.ts`, the pace the tempo
  bar runs at. Longer sets take longer: a Light weights session is honestly longer per set.
- **Rest** is every rest the timer will show: the set's own rest after every set, including after
  the last set of an exercise (the timer runs it while the lifter walks to the next one), none
  before or after a drop set, a 15 s (superset) or 12 s (circuit) switch inside a paired round,
  the round rest after it, and nothing after the final set of the day.
- **Set-up** comes from the catalog and counts only where it outlasts the rest that led to it.
- **The general warm-up** is added on top (`generalWarmupMinutes`).

`remainingMinutes` is the workout screen's Left: the remaining timeline, plus the general warm-up
less the clock until the first set is logged, plus what is left of a rest in progress. So the
length on the dropdown is the clock plus Left.

## Data model notes

- A superset block has exactly two entries and one label, for example
  `A1 Cable Fly + A2 Lateral Raise`; the Workout tab shows one row per block.
- Every set carries `kind`: `warmup`, `working`, or `drop`. Warm-up sets never count toward
  working totals, progression, or PRs.
- `WorkoutRecord` (`src/core/validation/workoutRecord.ts`) is the history shape the volume logic
  reads; Phase 5 logging writes it.
- The workout-length choice lives in app state for the current workout only. The Default option
  shows the complete generated session's length (for example "Default: 50 min"); the planning
  budget behind it is the profile's typical workout length, editable in Settings.

## Week-aware selection (Maintenance 4)

The template choice counts muscles trained in the last two days against a template and muscles
behind their weekly target for it, on top of priority weights and rotation. Within a template,
candidates whose primary muscles are behind score a little higher, and after the anchor lift the
straight accessories for behind muscles are ordered first (never during a recalibration that
keeps logged work). "Why this workout" says which muscles have had time to recover, which sit out
because they trained in the last two days, which muscles the accessories lead with, and, during a
planned deload week, what the week changes.
