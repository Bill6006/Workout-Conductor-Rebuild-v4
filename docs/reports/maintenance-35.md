# Maintenance 35: Life Mirror's daily check-in (item 48)

Built on 2026-10-31 on the owner's word, after Maintenance 34 shipped: "keep it OFF until explicitly
enabled; read only the approved daily check-in signals; keep Workout-specific soreness, pain/joints,
illness, and available-time questions; never read unrelated/private Life Mirror content." It is part 3
of the approved proposal (`docs/proposals/week-model-readiness-time.md`), on the inspection
`docs/proposals/item-48-life-mirror-check-in.md`, and the settled row: "item 48 supplies sleep,
stress and mood when available". YELLOW: waiting for the owner's consolidated phone review.

## What it does

- **A switch, off.** Settings, **Life Mirror**: "Use Life Mirror's check-in", off until the lifter
  turns it on, kept like every meta record. With it off, nothing is read, not one call to the cloud.
- **The read path: the shared cloud database, read-only.** When the check-in opens with nothing told
  today, and only with the switch on, a token, and the cloud copy at Life Mirror's own database (its
  address is fixed), one query reads today's Life Mirror check-ins. Before 04:00 nothing is read:
  Life Mirror's evening is still the day before's. The check-in waits three seconds at most; a later
  read changes nothing on it.
- **Only the approved readings leave the database.** The query takes energy, mood, stress, the
  night's hours and quality, and motivation out of each check-in's body in the database itself, with
  its block and times, each only of its type (a whole number, or text); Life Mirror's notes, extras
  and every other answer stay where they are, never fetched, cached, logged, synced or shown. A value
  off its 1-5 scale, a block it does not know, or a body that is not JSON is none. Nothing is ever
  written to Life Mirror's rows.
- **What it fills in:** energy from today's latest check-in, the night and motivation from this
  morning's only, stress and mood from today's latest. Each value filled in is labelled "From Life
  Mirror, 7:40 AM" and changed with one tap; a value the lifter taps is theirs, its label gone.
- **Stress and mood, Life Mirror's own:** this app never asks them. Where Life Mirror gave them, the
  check-in shows them in Life Mirror's words (stress Loose to Crushing, mood Heavy to Bright), each
  labelled and changeable; with the switch off, a check-in told carries neither.
- **What it never says:** soreness, pain and joints, illness and time today are asked here, always.
- **Missing or stale:** the check-in asks as it always has, without a word.
- **Kept:** each value's source with the check-in (`fromLifeMirror`, each source read alone), and
  Life Mirror's stress and mood, optional fields an older copy reads past.

## The night, stress and mood (docs/research/readiness-and-soreness.md, item 48)

- **The night** on this app's sleep scale: the hours up to 7 (under 5 Poor, 5-6 Short, 6-7 Okay,
  7 or more Good), Great only for a deep night of 7 hours or more, a broken or rough night a step
  lower, the quality alone without the hours. The direction is the evidence's (Craven 2022), the
  steps judgement.
- **Stress and mood** join energy, sleep and motivation against the lifter's own four weeks, never
  the scale's middle: this app never asks them, and a person's own baseline is what the evidence
  compares against. Stress is worse above its usual. As the others, two items clearly worse lower
  what the app expects of the first sets, never the plan. "Feeling good" needs them at their middle
  or better.
- **Motivation** from Life Mirror is "the pull to do things", a weak hint: low on its own it never
  keeps the reserve check off the day.

## Not taken

- **Opening Life Mirror's on-phone database** (the inspection's rejected path): it could create,
  upgrade or block Life Mirror's own.
- **Reading each body whole and dropping the rest** (the inspection's first read): the query takes
  out the approved readings in the database, so the private parts never reach the phone.
- **A disclosure line in Life Mirror:** Life Mirror's own workstream; this work never edits it.

## Review

One bounded adversarial review of the diff from Maintenance 34's commit, with probes against the fake
cloud and real SQLite: no HIGH, one MEDIUM, nine LOW. Each was fixed, with a test and a revert entry;
a re-read of the fixes found the summary line the first finding named still to do, now done.

1. **MEDIUM: stress and mood acted unseen.** Life Mirror's stress and mood went with the check-in
   and could lower what the app expected of the day, but the sheet never showed them, and "Update
   check-in" sent them again even with the switch off. Now they are shown in Life Mirror's words
   wherever it gave them, labelled and changeable, and Today's summary names them; with the switch
   off a check-in told carries neither. (U12-U17, U22, U23)
2. **LOW: "Feeling good" beside a crushing stress.** Until five saved check-ins carry them, stress
   and mood never counted. "Feeling good" now needs stress at its middle or lighter and mood at its
   middle or better. (R1, R2)
3. **LOW: a late read changed a value already seen.** The check-in waits three seconds at most, and
   reads nothing when a check-in has been told today. (U18-U21)
4. **LOW: Life Mirror's motivation alone kept the reserve check off.** It never acts alone, as the
   evidence note says. (R3)
5. **LOW: one source that did not read dropped every source.** Each is read alone, and one a later
   copy adds is left out alone. (V2, V4, V5)
6. **LOW: the query kept the private parts out only for Life Mirror's shapes of today.** An object
   at a reading's place left the database as its JSON text, and `true` read as 1. Each value now
   leaves it only of its type. (I10)
7. **LOW: a tap matching Life Mirror's value was told as Life Mirror's.** Any tap makes a value the
   lifter's own. (U11)
8. **LOW: the read healed a lost copy of the token without the restart that follows.** It restarts
   the walk of the cloud copy, as the app's opening does. (L10)
9. **LOW, judgement: over 8 hours read as a Great night.** 7 hours or more is Good, Great only for
   a deep night of 7 or more; Life Mirror's own "good" is toward 7 to 8 hours. (P7-P9)
10. **LOW, tests: the day-rule tests ran in no other zone,** and four failed in Pacific/Kiritimati,
    where the tests' clock is before 04:00. They run at 09:00 there, and in both zones of
    `scripts/test-zones.mjs`.

Left as designed: an address written differently counts as another database (item 48 stays off,
the safe side), and the switch goes with the cloud copy like every setting kept there.

## Reverts

`tools/reverts/mutate-item48.py`, 64 entries (`table_item48.txt`), all caught on the final code:
the question put to the database (I), what it fills in (P), stress and mood in the check-in (M),
what a check-in with Life Mirror's says and keeps off the day (R), the switch and the read (L), the
stored fields (V), and the sheet, the screens and the wait (U).

- **The run on the code after the review's fixes: 63 of 64 caught.** The one other, I7 (the read
  keeps whole numbers only), was masked by the query's new type check, which keeps a fraction in the
  database; a test with a client that answers rows directly reaches it now, and catches it.
- **The older tables:** the six entries whose anchor lies on a line item 48 changed, or that run a
  test file it changed, run again on the final code: M27 2 (47c, R47-9) and M33 4 (C2, C3, C5,
  V27), all caught. M33's C3 re-anchored onto the check-in's line as item 48 left it.
- Every table's anchors are found. The complete run of every table waits for the consolidated
  phone review, as the revert README says.

## Verification

- **Local**, `npm run verify` on the final code (`a4d9d0d`; `d11fe71` after it changes only the CI
  time limit): lint and types clean; unit 3,841 passed + 5
  skipped by design (640 files); the day rules in two more zones, 71 + 71; the privacy scan,
  1,223 files; the build checked; the browser suite 431 passed + 14 skipped by design, two of
  round M's tests on the 360 px project stopped by an aborted page load (`net::ERR_ABORTED`) and
  passed 3 of 3 alone, and the 10 PWA tests that wait on them passed after them: 443 passed + 14
  skipped by design.
- **CI:** the branch's run 41223045092, success. The first, 41220854546, stopped at the 25-minute limit
  set in Phase 0, on a runner slower than usual (unit tests 8 minutes, not 5); the limit is 40
  minutes now (`d11fe71`). Deploy Pages run 41224835430, success.
- **Live:** the marker reads `d11fe71`. Live suite from the owner's machine: 438 passed + 19 skipped by design, none failed.

## Review on the phone

1. Settings, **Life Mirror**: "Use Life Mirror's check-in" is off. Open Today's check-in: it asks as
   it always has.
2. Turn it on, after a Life Mirror check-in this morning: Today's check-in shows your energy, sleep
   and motivation from it, and its stress and mood, each "From Life Mirror" with the time; soreness,
   joints, illness and time are asked. Change one: its label goes.
3. Apply it: Today's summary names the stress and mood with the rest ("... motivation 3/5 · stress
   2/5 · mood 4/5.", your own numbers).
