# Progress, plan, coverage, and personal records

Everything on the Progress and Plan tabs is computed on demand from the saved workout records.
No analysis snapshots are stored, and every score is shown with its definition, the data it
used, a sample count, a confidence, and a plain explanation (`ScorePanel`). Sparse data reads as
low or no confidence, never as a precise number.

## Scores (`src/engine/scoring/analytics.ts`)

| Score                       | Definition                                                                                                                                                                                                   | Samples               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| Consistency                 | Sessions with at least one completed working set per calendar week (Monday to Sunday) against the planned weekly frequency, over eight weeks; average since the first session; streak of weeks with training | sessions              |
| Muscle coverage             | Completed working sets in the last 7 days per muscle: direct 1, indirect 0.5, against the weekly target from the goals; band is 70 to 130 percent of the target; priority muscles first                      | sessions this week    |
| Estimated strength          | Epley on the best completed working set per exercise: weight × (1 + reps ÷ 30), reps capped at 12; confidence from the exercise's session count                                                              | sessions per exercise |
| Exercise progress           | Sessions, best set, latest e1RM, trend (latest against the oldest of the last four), times replaced or skipped                                                                                               | sessions per exercise |
| Rankings                    | Most productive: largest e1RM trend with at least three sessions; often replaced: swapped or skipped at least twice                                                                                          | derived               |
| Duration efficiency         | Actual against planned minutes and completed working sets per ten minutes over the last ten timed sessions                                                                                                   | timed sessions        |
| Technique usage and balance | Sessions using a superset or circuit, completed drop sets, and strength versus hypertrophy working sets by role, over the last twelve sessions                                                               | sessions              |
| Pain patterns               | Sessions in the last twelve where a joint was reported painful during the workout, in the check-in, or in the rating                                                                                         | sessions              |

Confidence: none for zero samples, low for one or two, medium for three to five, high for six or
more.

## Personal records (`src/engine/scoring/personalRecords.ts`)

Detected when a workout is saved and stored on the record. The first performance of an exercise
is its baseline, not a record. Warm-ups and incomplete sets never count. Kinds:

- **Weight**: heaviest completed working set beats every earlier one.
- **Reps at a weight**: more reps than ever before at a weight already used.
- **Volume**: session volume (weight × reps over working sets) beats the best session.
- **Top of range**: every set reached the top of its range at the best load for the first time.

During the workout, `liveSetRecords` gives compact feedback ("Weight PR", "Rep PR") on the
exercise card from the sets logged so far.

## Session summary (`buildCompletion`)

Completed duration against planned, exercises and sets completed, volume, muscles trained,
personal records, skipped work, substitutions, highlights, the rating, the coach's feedback, a
recovery note (48 hours for the muscles trained, plus rating and pain implications), next targets
from the progression engine for every trained lift, and the next focus from the updated muscle
priorities.

## Weekly plan (`src/engine/planning/weeklyPlan.ts`)

`planWeek` builds the next planned sessions on the available days: each day is what the
generator would produce that morning, and each planned session is fed back as if logged so the
rotation continues. `recoveryBalance` groups muscles into recovering (under 2 days since trained),
ready (2 to 4 days), and fresh.

## Saved workouts

A workout can be saved by name from the Plan tab into the `savedWorkouts` store (database
version 3) and travels with backups. Loading one starts a fresh preview session with a
"Loaded" summary; every change after that runs through the recalibration engine as usual.

## History

Every record is listed newest first with duration, sets, volume, and a record badge, and opens
in full: every set as logged (ramp and drop sets marked), substitutions, rating, records, pain,
and the exercise notes saved for each lift.
