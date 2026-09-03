# Phase 3 report - Workout Generation and Duration Engine

Status: **YELLOW** (awaiting the owner's Android review). Only the owner can mark this GREEN.

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

## Delivered

- **Hybrid strength and hypertrophy generation** (`src/engine/workoutGenerator/generate.ts`):
  five session templates (Push + arms, Pull + arms, Lower body, Upper body, Full body) chosen from
  muscle priorities, goals, frequency, and recent sessions; every slot filled from the catalog
  through the conflict engine with preference, familiarity, joint-stress, and setup-time scoring.
- **Weekly-volume and recent-exposure logic** (`src/engine/volume/weeklyVolume.ts`): direct and
  indirect sets over the last 7 days, days since each muscle and exercise, templates used in the
  last 14 days, goal weights, weekly targets, and muscle priorities (goal × freshness + deficit).
- **Progression roles** (`src/engine/progression/roles.ts`): primary / secondary strength,
  primary / secondary hypertrophy, isolation, specialization, corrective, finisher; each with sets,
  rep range, RIR, and rest, adjusted by programming style and rest style. Rep ranges differ by
  role and exercise; no tempo prescriptions.
- **The duration dropdown** (`src/components/DurationSelector`): one control with 15 min, 30 min,
  45 min, and Default time, visible on Today above the session. Changing it rebuilds the session
  immediately. The choice is remembered for the current workout only; the Default length is the
  typical workout length from Settings.
- **15 / 30 / 45 / Default generation with time estimation and fitting**
  (`src/engine/duration/duration.ts` + generator): general warm-up budget per length, per-block
  time model, row caps per length, rests shortened toward realistic floors, sets trimmed from the
  lowest-value work first, whole rows dropped last, the main lift never dropped, every step
  explained, and an honest "may run a few minutes over" when even the leanest plan does.
- **Warm-up planning**: general warm-up minutes plus ramp sets on the main lifts, flagged
  `warmup` so they never count as working sets.
- **Smart supersets** as two-move blocks with one readable canonical row
  (`A1 Cable Fly + A2 Lateral Raise`), only when the conflict engine allows the pair and the
  moves train different muscles.
- **Optional intelligent drop sets**: one drop set on a drop-set-safe isolation move when the
  session is shorter than Default or the muscle is under half its weekly target, never on a
  priority lift, and never if it breaks the time target.
- **Optional circuits**: isolation work becomes a 2-3 round circuit only when circuits are on,
  the template is not strength-priority, and the target is 30 min or less.
- **Workout explanation**: summary, reasons (goal, priority muscles with evidence, place, main
  lift, history state, techniques), fitting steps, time breakdown, confidence.
- **Visible on the phone**: Today shows the generated session with the dropdown, estimate, priority
  muscles, warm-up note, block rows (superset and circuit rows grouped), tap-through to the
  exercise sheet with alternatives ranked against the session; the Workout tab shows the Active
  Workout List preview with one row per block. The synthetic demo is deleted.
- `WorkoutRecord` schema for history (Phase 5 writes it) and `history` in app state.

## Verification

| Check                        | Result                |
| ---------------------------- | --------------------- |
| `npm run lint` / `typecheck` | clean                 |
| `npm run test:unit`          | filled in at the gate |
| `npm run build`              | filled in at the gate |
| `npm run privacy-scan`       | filled in at the gate |
| `npm run test:e2e` (local)   | filled in at the gate |
| Against the live URL         | filled in at the gate |
| Screenshots                  | filled in at the gate |

## Decisions and notes

- Duration fitting keeps the highest-value work: it pairs first, shortens rests second, trims
  sets third, and drops whole rows last; paired rows outrank their weakest member because they
  save time.
- Templates rotate away from the last two sessions and priorities drop for muscles trained in
  the last day, so the same profile gets a different, sensible session the day after.
- Load targets (`targetWeight`) stay null until the progression engine in Phase 6.
- Recalibration of a started workout (locked completed work, overlay, change summary, End-by
  time) is Phase 4; today the dropdown regenerates the not-yet-started session.

## Next

Owner review on Android at the permanent link. On `GREEN - NEXT PHASE`, Phase 4 starts: the
central recalibration engine with its trigger registry, calibration overlay, partial
recalibration, completed-work locking, rollback, change summary, and location / equipment /
pain / recovery recalculation.
