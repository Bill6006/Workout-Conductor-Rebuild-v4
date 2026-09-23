# Maintenance 19: round A, what happens mid-workout

Shipped on 2026-09-22 on the owner's GREEN for Maintenance 18 and go for the next phase. Round A
is the owner's items 6, 5 and 4, with Proposed 13, which the plan included in Round A.

## 6. Changing place mid-workout replaces the rest instead of deleting it

**From the owner:** a session started at the gym, finished at home: "anything tricep related just
thrown off completely. And just leaves me with the bicep curls."

**Found:** the rebuild keeps what was logged, which is right. But each exercise it tried for the
rest of the session was checked together with the logged ones, and a barbell lift logged at the
gym does not fit Home. That failure counted against every candidate, so every one was refused and
the rest of the session was deleted: "No elbow extension option fits Home" with Home full of
options. It struck any unstarted exercise, on any change of equipment.

**Delivered:**

- A candidate is kept out only by a conflict it is part of. What was logged stays in the session
  and never blocks a replacement.
- An exercise started at the gym that Home cannot equip ends at its logged sets, which stay as the
  history they are, and a Home exercise for the same movement takes the working sets it still
  owed, right after it (Barbell Bench Press, one set logged, then Dumbbell Bench Press for the
  three it owed).
- A rest running when the session is rebuilt now names what comes next in the rebuilt session,
  not the set it named before (found on the phone-size run).

## 5. Weights your plates can make

**From the owner:** "(5 lb short)" was confusing mid-set; with no 2.5s the app should work with the
plates there are, change the weight and the reps as needed, and show exactly what to load.

**Found:** the target was set while the 2.5s were there; marking them missing re-fitted every
exercise not yet started but skipped one already started, so the Shrug kept asking for 100 while
the plate line, drawn fresh, found 95 and called the rest a shortfall. The dial started the next
set from the last set's weight (100), and its arrows moved 10 from there, to 90 or 110, so 95
could not even be dialled. And a bar's weights were a grid from the bar, which is only right when
every plate is a multiple of the smallest.

**Delivered:**

- A bar loads exactly what its plates make: every total, worked out from the plates on the rack,
  so a rack of odd plates never gets a target it cannot build.
- A target the plates cannot make comes down to the weight under it that they make, and the reps
  go up to keep the effort (the estimated max held where it was: one to three reps).
- One line by the target says so and why: "No 2.5s today: 95 instead of 100, two extra reps.", or
  "The plates here make 95, not 100 lb: two extra reps." when the rack never has them. It is also
  in Why this target.
- A started exercise is re-fitted too. Its logged sets are never touched; the sets still to come
  move, and move back to what was asked once the plate is back.
- The dial starts from the re-fitted target, and its arrows step between weights the plates make
  (95, 105), from wherever it stands.
- The plate line says what to load: "Bar 45 + 45, 10 each side · 155 lb". "(5 lb short)" is gone;
  a weight typed that the plates cannot make reads "The plates here make 95 or 105, not 100 lb".
- A rebuild mid-session (a length change, say) takes today's missing plates into account.

## 4. Not now on a safety card

**Found:** safety cards are never put away for days, so a real warning cannot vanish for a week,
but Not now still showed on them and did nothing at all.

**Delivered:** Not now on a safety card sets that worry aside for the rest of this workout, the
same worry about another exercise with it. A new one (another joint) still shows, and the next
workout starts clean, so it comes back if the evidence still says so.

## Proposed 13. Up next follows the next unfinished set

**Found:** Up next showed the next row in the list; a rebuild can leave a finished row after the
current one.

**Delivered:** Up next names the exercise of the next set not yet done.

## Verification

- Unit: the owner's move reproduced (a gym session with two exercises logged, then Home): the rest
  is filled from Home, every muscle it trained still trained, no "option fits" line; a bench press
  started at the gym ends at its logged sets with a Home press after it for the sets it owed, ids
  unique; logged work that fits Home is untouched. Both fail on the old engine. The candidate rule
  on its own. The plate line and exact combinations (50 a side from 45s and 25s is two 25s); a
  bar's totals with and without 2.5s and on an odd rack; the rack fit (95 for 100 with two more
  reps, the plates named, one to three reps and never past twenty); the owner's Shrug case: a set
  logged at 100, the 2.5s missing, the sets to come at 95 with two more reps, logged set untouched,
  then back to 100 when the plate returns. The dial's carried weight dropped. A safety card set
  aside for the workout, a new joint still shown, the next workout clean, and never a decline.
  Up next skipping a finished row. The rest's next set after a move.
- Browser (`e2e/midWorkout.spec.ts`, all three device projects): a set of bench press at the gym,
  then Home: the bench press row is done, the current exercise is a Home one, nothing deleted, no
  "option fits Home", the rest names the new next set, and Up next is not done. A 160 lb bench
  target, one set logged, the 2.5s marked missing: target 155 with "No 2.5s today: 155 instead of
  160, one extra rep.", the dial at 155, "Bar 45 + 45, 10 each side · 155 lb", no "short", the
  arrows 165 then 145; the 2.5s back: 160 and no line. A shoulder pain area: the "Watch your
  shoulder" card, Not now, gone after a reload and on the workout screen.

## Review

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

1. Start at the Gym, log a set or two, then on Today change Location to Home. The logged work
   stays, and the rest of the session is there with Home exercises.
2. On a bar lift, open Plates and tap the 2.5 (missing today). The target comes down to what the
   plates make, with a line under the dials saying so, and the plate line says what to load.
3. On a safety card (a pain warning), tap Not now: it stays away for this workout.
