# Phase 6 report: Adaptive Coach, Progression, Strategy, and Recovery

_Gate: YELLOW, awaiting the owner's review on Android._

## Delivered

- **Progression engine** (`src/engine/progression/progression.ts`, see
  `docs/progression-engine.md`). Next targets from actual completed records: last performance,
  rep-range position, RIR, failed reps, repeated success or underperformance, fatigue, goal and
  role, progression family, and equipment increments. Double progression for hypertrophy work,
  load progression for strength work, rep and set progression, exercise-level micro-deload after
  two misses, regression after three, maintain otherwise. One poor session is never punished.
  Every card now carries a load target; ramp sets get calculated loads; drop sets about 80 %.
- **Readiness and recovery adjustments.** The quick check-in (energy, soreness, sleep,
  motivation, joint discomfort, time pressure) on Today and on the active workout runs the
  readiness recalibration: fewer sets, an extra rep in reserve, gentler picks, or the existing
  45-minute length. A good day keeps the full workout.
- **Fatigue interpretation** (`src/engine/recovery/fatigue.ts`): session density, consecutive
  days, reps-in-reserve drift, hard and painful ratings, and the check-in produce fresh, normal,
  elevated, or high with evidence. High fatigue holds loads.
- **Performance recalibration** stays live during the workout (reps far from target), now on top
  of load targets.
- **Pain handling.** Session pain joints and pain ratings feed the coach's safety signal, are
  saved on the record, and drive the strategy's fit and recovery views.
- **Next-target recommendations** on every exercise card and in "Why this target" (How to panel).
- **Actual-completed-record truth.** Progression, fatigue, strategy, and the coach read only
  completed working sets from saved records and logged sets from the live session; warm-ups,
  skipped sets, and the logger's unlogged values never count.
- **Manual-edit protection.** A target weight, rep range, set count, or rest the user set by hand
  is flagged on the entry and never overwritten by the engines; the How-to panel says so.
- **One gold Adaptive Coach card** (`src/components/AdaptiveCoach/AdaptiveCoachCard.tsx`) on
  Today and on the active workout: one headline, up to three Why lines, at most one action, and a
  footer that says how many signals were checked. Nothing is applied without a tap; a major
  action (micro-deload) needs a second tap.
- **Coach Conductor priority arbitration** (`src/engine/coach/coachConductor.ts`): safety/form >
  save/storage > recovery/fatigue > plateau > progression > exercise fit > weekly coverage > rest >
  tips, then severity, then whether an action exists, then confidence.
- **One-action maximum and concise Why evidence.**
- **Two-move superset coaching.** When the current block is a superset, the coach reads both
  moves' evidence and today's logged rounds, and says so.
- **Incomplete-draft exclusion.** Drafts are prefills only; evidence comes from logged sets.
- **Duration- and readiness-aware evidence** through the fatigue signal and the session length;
  when recovery comes first the action is the existing 45-minute length, never a separate mode.
- **Multi-session strategy** (`src/engine/strategy/strategy.ts`): the last twelve qualifying
  sessions analysed on demand, no stored snapshots, at least two sessions per diagnosis.
- **Plateau diagnosis**: load, rep, fatigue, recovery, exercise fit, and coverage, each with
  hold, add reps, add weight, increase rest, micro-deload, adjust volume, or open alternatives.
- **Intelligent rest recommendations**: a strategy insight for exercises that fade late, and an
  in-session "Rest 30 s longer" when reps collapse with nothing in reserve.
- **Safe optional drop-set recommendations** when drop sets are enabled, the move is drop-set
  safe, the muscle still needs volume, and time allows; applied only on tap.
- **Session feedback** on the completion surface: exercise-by-exercise progressed, on target, or
  short, plus the rating's implication.
- Two new local triggers (drop set on or off, rest adjust), 25 in total; records carry target RIR,
  session pain joints, and the readiness snapshot.

## Verification

- Lint and type-check clean; privacy scan 0 findings; verify-build passed (phase 6 in both
  places).
- Unit: 230 tests across 37 files. New: progression modes (start, weight, reps,
  maintain, deload, regress, sets advice, fatigue hold, family continuity, load writing with
  manual protection), fatigue levels, every plateau kind plus the single-session guard and
  session feedback, and the conductor (priority order, safety over plateau, save over the rest,
  recovery ahead of plateaus with the 45-minute action, superset evidence from logged rounds
  only, in-session rest recommendation, drop-set tip).
- Browser: 84 tests passed + 8 skipped by design on Android 412 px, Android
  360 px, desktop, and the PWA project, locally and against the live URL. New flows: the single
  gold card with evidence and at most one action; a low check-in recalibrating the session and
  moving the coach to recovery; load targets and "Why this target" during the workout, then coach
  feedback on completion.

## How to check on the phone

1. Today: read the gold Adaptive Coach card. Tap **Check in**, set low energy and sleep and high
   soreness, apply: the session adjusts and the coach moves to recovery.
2. Start the workout: each card shows its load target; open **How to** for "Why this target".
3. Log a few sets, then finish: the summary ends with the coach's feedback lines.
4. Over the next sessions the coach will surface plateaus, rest advice, drop-set offers, and
   backup reminders as the records accumulate; every action is a tap.

## Decisions and notes

- Personal-record detection and the progress views arrive in Phase 7; the record now carries
  target RIR, pain joints, and readiness so PRs and analytics can be computed without migration.
- The coach never creates separate cards per system; the domains it checked are listed in the
  footer so the arbitration is visible.
