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

`triggers.ts` lists all 25 triggers with a label, a default scope, and the short list of things
the overlay shows while the engine works.

| Trigger         | Default scope | What it does                                                                                                                                                                                                                                                               |
| --------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| duration        | full          | Rebuilds for 15, 30, 45, or Default time. Partial once anything is logged or locked.                                                                                                                                                                                       |
| location        | full          | Rebuilds for the place switched to; unavailable exercises go automatically.                                                                                                                                                                                                |
| equipment       | full          | Rebuilds after the current place's equipment was edited.                                                                                                                                                                                                                   |
| equipment-busy  | local         | Marks the station busy for this session and substitutes every remaining exercise that needs it.                                                                                                                                                                            |
| replace         | local         | Swaps one exercise for an accepted alternative and locks it.                                                                                                                                                                                                               |
| skip            | local         | Removes one row and remembers the exercise for this session.                                                                                                                                                                                                               |
| pain            | local         | Adds a session pain joint, replaces stressful exercises with gentler ones, removes what cannot be replaced.                                                                                                                                                                |
| uncomfortable   | local         | Swaps one exercise for the best alternative and avoids it this session.                                                                                                                                                                                                    |
| pin             | local         | Locks or unlocks one row against drops and swaps.                                                                                                                                                                                                                          |
| performance     | local         | In-session autoregulation: the reps and RIR just logged move the remaining sets' load a step, or shift their rep targets when there is no load.                                                                                                                            |
| target-weight   | local         | Sets the target weight on the remaining working sets.                                                                                                                                                                                                                      |
| technique       | full          | Supersets, drop sets, or circuits toggled in Settings.                                                                                                                                                                                                                     |
| profile         | full          | Goals, schedule, limitations, preferences, style, or rest style changed.                                                                                                                                                                                                   |
| readiness       | partial       | Energy, soreness, sleep, motivation, joint discomfort, time pressure.                                                                                                                                                                                                      |
| resume          | partial       | Back after a long interruption: remaining time recounted, light re-warm-up.                                                                                                                                                                                                |
| finish-early    | partial       | Keeps logged work and the current exercise, drops the rest.                                                                                                                                                                                                                |
| intensity       | partial       | Harder or easier for the remaining work.                                                                                                                                                                                                                                   |
| end-by          | partial       | Exact end time: a hard cap with no tolerance.                                                                                                                                                                                                                              |
| sets            | local         | Adds or removes one working set of an exercise (never a logged one).                                                                                                                                                                                                       |
| add-warmup      | local         | Adds a light ramp set; ramp sets never count as working sets.                                                                                                                                                                                                              |
| rep-range       | local         | Sets the rep target on the remaining working sets.                                                                                                                                                                                                                         |
| reorder         | local         | Moves an unstarted row up or down; started work keeps its place.                                                                                                                                                                                                           |
| split-superset  | local         | Turns an unstarted superset into straight sets.                                                                                                                                                                                                                            |
| drop-set        | local         | Adds or removes an optional drop set (only when the move is drop-set safe; a logged one stays).                                                                                                                                                                            |
| loading         | partial       | A record of what the place can load was saved, or a plate went missing for the session: every unlogged, non-manual entry's targets are re-fitted onto the weights the place has (Maintenance 12).                                                                          |
| (every rebuild) | -             | Since Maintenance 13 every target computed during a rebuild reads the session context: the overlapping work before the entry today against the day its target came from, and the ramps it deserves; `resume` after a long break adds one light ramp to the entry in front. |
| rest-adjust     | local         | Changes the rest for the remaining sets of one exercise (30 s to 5 min).                                                                                                                                                                                                   |

## Scope

- **local**: one exercise changes; every other entry is byte-for-byte identical. Never widened.
- **partial**: the remaining workout is rebuilt around kept entries. A full trigger becomes
  partial as soon as any set is logged or any entry is locked.
- **full**: nothing has started and nothing is locked, so the generator runs again with the
  session's constraints applied.

## Locking rules

Never changed: logged sets, their weights, reps, and RIR. An entry with logged sets is
_frozen_: never trimmed, dropped, re-paired, or moved. One exception since Maintenance 19: logged
work that cannot go on here, its equipment not at the new place, is _closed_. It ends at its
logged sets, which stay as the history they are, and its slot takes a replacement that fits the
place for the working sets it still owed. Since Maintenance 21's review the closed entry keeps that
count (`stopped.owed`), because its unlogged sets are gone after the first close: every later
rebuild (a new length, another place, coming back from a pause) gives the slot a stand-in for the
owed sets again, right after the stopped entry. A stand-in that is kept (started, or the exercise
under way) carries the slot on its own, wherever it sits in the list; a stand-in stopped in turn
hands on only what it still owed. An entry closed by a copy from before the count is known by
having no working set left, and owes a whole prescription. The stand-in, not the stopped lift,
is the session's main lift for the time fit. Before this, the first move was right and any later
rebuild dropped the stand-in or moved it to the end of the list. Entries that are pinned, explicitly
selected, accepted alternatives, or the current exercise are _locked_: never dropped or swapped,
and their sets are kept unless the exact-end mode is on. A locked pick that can no longer be
performed (the place changed, a joint now hurts) is unlocked and rebuilt, because keeping it would
be pretending.

Partial rebuilds reuse the generator (`generateWorkout` with `constraints`): kept entries return
to their template slots, pairings whose members are all kept survive, the remaining budget is the
target minus elapsed time, warm-up is skipped once started, and logged sets cost no time in the
estimate. The fitting loop then works only on new entries. A candidate is kept out only by a
block it takes part in (`blocksCandidate`): an exercise logged at the gym does not fit Home, and
that never stops Home filling the rest of the session. Before Maintenance 19 it did, and a move
from the gym to Home left only what had been logged.

Swaps (Maintenance 22). An entry with nothing logged takes the new exercise whole, and its
`replacedFrom` keeps the plan's own pick through further swaps. A started entry (a set logged or
skipped) stops at its logged sets, which stay under the exercise they were done on, and the new
exercise follows it as a stand-in: a new id in the same slot, `replacedFrom` set, locked when the
lifter chose it or the entry was locked, carrying the working sets still owed and targeted as its
own lift after today's work, under a deload week and today's fatigue like any pick
(`targetedSets`). Before, the entry was renamed and kept the old exercise's targets and filed the
logged sets under the new name. A stopped entry records why (`stopped.why`: `place`, `swap`, or
`skip` when the stand-in carrying its sets was skipped; a skip keeps the count it stopped at and
owes nothing more). Swapping to the stopped exercise a stand-in took over from (`stoppedBefore`:
the same slot, or `replacedFrom` for an entry with no slot; the swap sheet offers it) reopens it
(`swapBack`) instead of adding it twice. In a pairing whose rounds have not started the stand-in
takes the stopped member's place; once rounds are under way their sets no longer line up, so the
pairing splits into straight blocks (`endPairing`), and so does a pairing whose stand-in stops on a
swap back. A rebuild
reopens only a stop the place made, when it fits again and no other kept entry of its slot is the
lifter's own pick (locked or pinned) or under way (frozen); a stand-in kept only because it was the
current exercise gives way. Skipping a stand-in skips the sets it carried. Loads changes, maxes
and Uncomfortable leave a stopped entry alone, and a set, warm-up, rep-range, drop-set, weight,
rest, pin or busy-equipment change on it is refused (its sheet shows what happened in place of its
actions). The diff reads a stand-in, and an entry picked up again, as one `replaced` change and
counts none of the moved sets as trimmed. The saved workout files a stopped entry as swapped,
not skipped, unless the exercise carrying its sets was skipped too. Undo is offered only while
every set logged so far keeps its place, on the same exercise, in the workout Undo would bring
back (`undoAvailable`, the same rule the engine applies to every change); otherwise putting that
workout back would lose or misfile a set. The coach aims its offers only at entries still to do,
never at a stopped one.

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

## In-session autoregulation (`src/engine/recalibration/autoregulate.ts`)

After every logged working set with sets still to come, a pure decision reads the set's reps,
its reps in reserve, and the earlier sets of the same exercise this session:

- Clearly easy (top of the range with two or more reps in reserve beyond the target), far past
  the top (three or more reps over), or two sets in a row past the top: the remaining sets go up
  one load step. Without a load, their rep targets rise by two.
- A grind under the floor (nothing in reserve) or far under it (three or more reps short): the
  remaining sets come down one load step, or their rep targets fall by two.
- Anything else, including one missed floor with reps in reserve, changes nothing.

The store turns the decision into a `performance` recalibration of that exercise's remaining
sets only, and the summary line says which set and why ("Set 1: 6 reps with 4 in reserve
against a target of 2: the next 3 sets go up 5 lb."). Done sets never change.
