# Maintenance 2: in-session autoregulation, and targets from the estimated max

The second round of the owner's "smarter coach" list: the sets still to come react to the set
just logged, and the first session after a break or on a new variation starts from the
estimated max rather than from a stale or borrowed load.

## Delivered

- **In-session autoregulation** (`src/engine/recalibration/autoregulate.ts`). After every
  logged working set with sets still to come, the remaining sets of that exercise adjust from
  the reps and reps in reserve just logged and from the earlier sets this session: up one load
  step when the set was clearly easy, far past the top, or the second in a row past the top;
  down one step after a grind under the floor or a set far under it; rep targets shift instead
  when there is no load. One missed floor with reps in reserve changes nothing. Done sets never
  change, other exercises never change, and the summary line names the set and the reason.
- **Targets from the estimated max** (`src/engine/progression/progression.ts`). Back after
  twenty-one days or more, the target is 90 percent of the load the estimated max implies for
  the rep range at the prescribed RIR (85 percent after forty-two days). A new variation with
  family history starts at 90 percent of the family's estimate. Both say so in "Why this
  target", and warm-up ramps follow the working load as before.
- **Surfaces unchanged.** The recalibration summary, the set rows, and the "Why this target"
  list carry everything. No new buttons. Nothing is applied without a logged set or a tap.

## Verification

- Unit: the autoregulation decision table, the engine applying weight or rep plans, the store
  raising and lowering the next sets after an easy set and a grind, and the progression engine's
  return and estimate modes with exact loads.
- Browser: an easy first set raises the next sets and the summary says why, run locally and
  against the live URL.
- Totals and the deployed build are in `PROJECT_STATUS.md`.

## How to check on the phone

1. Start a workout, skip the warm-up, log the first working set at the top of the rep range
   with 4 in reserve. The summary says the next sets go up a step and the next row's target
   shows the new load.
2. Log a set under the floor with 0 in reserve. The next sets come down a step.
3. Leave a lift for three weeks (or import an older export dated four weeks back): its next
   target reads "back at 90% of the estimated max".
