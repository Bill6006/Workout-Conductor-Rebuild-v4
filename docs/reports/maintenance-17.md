# Maintenance 17: a workout in progress survives the app reopening (hotfix)

Shipped on 2026-09-22 on the owner's go, ahead of everything else on the list, because it
loses logged work.

## What happened

The owner trained at the gym, drove home, and opened the app to finish. The workout was gone:
the Workout tab showed a fresh Pull + arms with Start Workout, and History had nothing for the
day. He had not cancelled it.

## What was found

- **A workout in progress is kept in one place on the phone** and read back whenever the app
  opens. The reader checks it against a list of what a stored workout may contain.
- **That list had fallen behind the engine.** Each exercise stores a note on how its target was
  worked out. Two kinds of note were added on 2026-09-05 (Maintenance 2): a target estimated
  from a related lift or a different rep range, and a return after three weeks or more off. The
  reader's list was copied by hand and never got them.
- **So any workout carrying one of those notes could not be read back,** and the app then did
  what it does when nothing is stored: it made a fresh workout, and saved it over the old one.
  Nothing went wrong while the app stayed open; it happened the moment the phone closed and
  reopened it (the app killed in the background, swiped away, or reloaded by an update).
- **Maintenance 15 made the estimated kind of note common:** a lift run at a rep range it has
  not been run at lately now gets one. That is most likely why it struck now.
- **The workout could not be recovered.** A workout in progress lives only on the phone, in that
  one place, and the fresh one was written over it. Only finished workouts reach the cloud copy
  and the automatic backups.

## Delivered

- **One list, used by both.** The ways a target can be worked out are one list in the engine
  (`PROGRESSION_MODES` in `engine/workout/types.ts`); the reader validates against that same
  list, so the two cannot drift apart again.
- **A note the reader cannot follow costs the note, not the workout.** If a stored workout ever
  carries a target note this copy of the app does not know (one written by a newer copy, for
  example), that note is dropped and everything else, the logged sets included, reads back.
- **Nothing is written over in silence any more.** If a stored workout still cannot be read back
  and it may hold work (it was started or finished, has sets logged, or is too damaged to tell),
  it is moved aside first to its own place on the phone (the newest three are kept), and the app
  says so once, on whichever tab it opens to: "A workout couldn't be reopened. Its N logged sets
  are kept on this phone so they can be restored." A preview with nothing logged is simply
  replaced, as before. Cleanup never removes the kept copies; its Kept list in Settings,
  Storage names them.

## For the owner

Today's gym session cannot be brought back; the plan will not count it. If you remember what
you did, re-log it: open Workout, swap to the exercises you did, log the sets you remember, and
end early. From this build on, a workout in progress comes back with its logged sets however
the app is closed.

## Verification

- Unit: every way a target can be worked out round-trips through the stored session; nine
  generated sessions (every length, both places, four styles, a month off, a new rep range)
  reopen exactly as they were, and together they include both kinds of note the old reader
  refused; an unknown note is dropped with the logged sets intact; the keep-aside cases
  (nothing stored, readable, unreadable with sets, damaged text, a plain preview, only the
  newest three). Three of these fail on the old reader and pass on the fix.
- Store: the owner's case end to end: a history whose first lift is back after a month off, the
  workout started, a set logged, the app opened again: the same workout, active, with the set.
  And a stored workout that cannot be read back: kept, named once, a fresh preview beside it,
  still kept after the next opening, and listed by cleanup.
- Browser (`e2e/sessionReopen.spec.ts`, all three device projects): a workout whose stored copy
  carries a return comes back after a reload with its logged set; a damaged stored workout
  brings up the notice with its three sets, stays kept after it is put away and the app reloads.

## Review

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

1. Start a workout and log a set or two.
2. Close the app completely (swipe it away) and open it again: the workout is still there, at
   the set you were on, with the sets you logged.
