# Recalibration engine

One engine owns every change to a generated workout: `src/engine/recalibration/recalibrate.ts`.
Screens never rebuild, trim, or swap anything themselves. They send a typed trigger to the store,
the store builds a request, the engine returns either a new valid workout with a change summary
or a failure that keeps the previous workout.

## Request and result

`RecalibrationRequest` (`types.ts`) carries the trigger, the current workout, completed work
(logged sets, elapsed time, current exercise), extra locked entries, the requested length, the
profile, the place and its equipment, the history, the session-only constraints, a reason, and a
timestamp. The engine is pure: it never mutates the request.

`RecalibrationResult` is either:

- `ok: true` with the new workout, the length now in force, the updated constraints, the list of
  entry changes, a `ChangeSummary` (headline, details, counts), what was evaluated, and the
  engine time in milliseconds; or
- `ok: false` with a readable error and the previous, still valid workout. Keeping that workout
  is the rollback; nothing partial can exist because the engine works on a copy.

## Trigger registry

`triggers.ts` lists all 23 triggers with a label, a default scope, and the short list of things
the overlay shows while the engine works.

| Trigger        | Default scope | What it does                                                                                                |
| -------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| duration       | full          | Rebuilds for 15, 30, 45, or Default time. Partial once anything is logged or locked.                        |
| location       | full          | Rebuilds for the place switched to; unavailable exercises go automatically.                                 |
| equipment      | full          | Rebuilds after the current place's equipment was edited.                                                    |
| equipment-busy | local         | Marks the station busy for this session and substitutes every remaining exercise that needs it.             |
| replace        | local         | Swaps one exercise for an accepted alternative and locks it.                                                |
| skip           | local         | Removes one row and remembers the exercise for this session.                                                |
| pain           | local         | Adds a session pain joint, replaces stressful exercises with gentler ones, removes what cannot be replaced. |
| uncomfortable  | local         | Swaps one exercise for the best alternative and avoids it this session.                                     |
| pin            | local         | Locks or unlocks one row against drops and swaps.                                                           |
| performance    | local         | Reps far above or below target shift the next sets' rep targets.                                            |
| target-weight  | local         | Sets the target weight on the remaining working sets.                                                       |
| technique      | full          | Supersets, drop sets, or circuits toggled in Settings.                                                      |
| profile        | full          | Goals, schedule, limitations, preferences, style, or rest style changed.                                    |
| readiness      | partial       | Energy, soreness, sleep, motivation, joint discomfort, time pressure.                                       |
| resume         | partial       | Back after a long interruption: remaining time recounted, light re-warm-up.                                 |
| finish-early   | partial       | Keeps logged work and the current exercise, drops the rest.                                                 |
| intensity      | partial       | Harder or easier for the remaining work.                                                                    |
| end-by         | partial       | Exact end time: a hard cap with no tolerance.                                                               |
| sets           | local         | Adds or removes one working set of an exercise (never a logged one).                                        |
| add-warmup     | local         | Adds a light ramp set; ramp sets never count as working sets.                                               |
| rep-range      | local         | Sets the rep target on the remaining working sets.                                                          |
| reorder        | local         | Moves an unstarted row up or down; started work keeps its place.                                            |
| split-superset | local         | Turns an unstarted superset into straight sets.                                                             |

## Scope

- **local**: one exercise changes; every other entry is byte-for-byte identical. Never widened.
- **partial**: the remaining workout is rebuilt around kept entries. A full trigger becomes
  partial as soon as any set is logged or any entry is locked.
- **full**: nothing has started and nothing is locked, so the generator runs again with the
  session's constraints applied.

## Locking rules

Never changed: logged sets, their weights, reps, and RIR. An entry with logged sets is
_frozen_: never trimmed, dropped, re-paired, or moved. Entries that are pinned, explicitly
selected, accepted alternatives, or the current exercise are _locked_: never dropped or swapped,
and their sets are kept unless the exact-end mode is on. A locked pick that can no longer be
performed (the place changed, a joint now hurts) is unlocked and rebuilt, because keeping it would
be pretending.

Partial rebuilds reuse the generator (`generateWorkout` with `constraints`): kept entries return
to their template slots, pairings whose members are all kept survive, the remaining budget is the
target minus elapsed time, warm-up is skipped once started, and logged sets cost no time in the
estimate. The fitting loop then works only on new entries.

## Time rules

When the length changes mid-workout: elapsed time is subtracted, the time of the remaining locked
work is estimated, completed work is preserved, the current exercise stays, and only future rows
and sets are recalculated. If even the leanest plan runs over, the summary says so and the card
offers **End by exact time**, a hard cap that may trim remaining sets of locked entries and
drop future rows until the plan fits. It never pretends impossible volume fits.

## Change summary

`diff.ts` matches entries by id, so a swap in the same slot reads as "replaced". Counts cover
exercises removed, added, replaced, supersets added or removed, and sets trimmed. Headlines are
compact: `Recalibrated to 30 min: 2 exercises removed, 1 superset added.`,
`Rebuilt for Home: 3 exercises replaced.`, `Swapped Cable Fly for Pec Deck.`,
`Barbell + plates busy: 1 exercise replaced.`, `Protecting your shoulder: 2 exercises replaced.`

## Store and overlay

`AppStore.recalibrate` serializes triggers, shows the calibration state at once, yields a frame
so the overlay paints, runs the engine, keeps the overlay up for at least 450 ms so a fast rebuild
still reads as a change, then commits the session or shows the error state with the previous
workout untouched. The session (workout, constraints, completed work, last summary, previous
snapshot for Undo, and a log of the last eight recalibrations) lives in localStorage under
`wc.v1.session` and is reused while the day, profile, place, and history are unchanged.

`?slowCalibration=1` on the URL holds the overlay for 2.5 s. It exists for screenshots and demos
only.

## Performance

Measured in unit tests on every run: local changes complete in well under 250 ms and full or
partial rebuilds in well under 700 ms; typical engine times are a few milliseconds. No network is
involved anywhere.
