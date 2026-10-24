# Cloud handoff: Workout Conductor v4

_Prepared 2026-10-17 on the owner's request, from the local machine's state. Read `CLAUDE.md`
first; it holds the rules. This file holds the state and the steps._

## 1. The exact stopping point

### Checkpoint, 2026-10-24 20:15 UTC (supersedes the states below)

- **Round M**: local `0fe4cb9` (unchanged; diff: `docs/handoff/round-m-wip/round-m.diff`). Its
  twentieth review is running on `0fe4cb9` (tests to come in
  `/home/user/wc4-m-review/src/review-m31s/`; the brief is saved in the session scratchpad,
  `m31s/brief20.txt`).
- **Round N**: local `905ce7f`, rebased onto Round M's `0fe4cb9` (backup of the old head:
  `backup/round-n-25fd689`; `docs/handoff/round-n-wip/round-n.diff` is now against `0fe4cb9`). The
  tenth pass is complete: a max with reps set by hand at another range keeps the day's mark at the
  back-offs' load (the next top set steps from the top set); every replay of the back-offs is capped
  at the top set as lifted, or as planned once its log is taken back; the session's feedback reads
  only back-offs lifted at the drop's load (`backOffMiss` with `backOffAt`), as the drop's correction
  does; reps set by hand keep their reserve only in the same place on the lift (`HandReps.tier`); a
  lift picked up again drops the back-offs' weight set by hand. The M32 table at 228 entries, every
  one run caught. Its eleventh review is running on `905ce7f` (tests to come in
  `/home/user/wc4-n-review/src/review-m32k/`).
- **Maintenance 33**: local `53c2796`, rebased onto Round N's `905ce7f` (backup of the old head:
  `backup/round-o-065e13c`; `docs/handoff/round-o-wip/round-o.diff` is now against `905ce7f`). One
  adaptation on the rebase: Round M's new coach test reads the fatigue with two arguments, as
  Maintenance 33's score takes no check-in. Next: its full suite, then its second review on
  `53c2796` (brief saved in the session scratchpad, `m33b/brief.txt`; tests to come in
  `/home/user/wc4-o-review/src/review-m33b/`).

### Checkpoint, 2026-10-24 20:05 UTC (supersedes the states below)

- **Round M**: local `0fe4cb9` (diff on `2595631`: `docs/handoff/round-m-wip/round-m.diff`). The
  nineteenth pass is complete: four findings fixed at the shared level. A lift swapped away today
  is judged as a slot's own pick only where a kept swap has a lift in its place (so the kept swap
  applies), and never comes back by itself when the swap-in cannot join; a lift put back in another
  place stays on the day's list (a swap back where the plan had it takes it off); every coach offer
  reads the day's list through one helper (`dayExclusions`); the mark of a plan emptied keeps the
  layout emptied (`emptiedLayout`, optional with a catch), and the generator itself lays that layout
  out empty wherever it finds a lift (`GenerationConstraints.emptiedLayout`), for every rebuild and
  for a later plan the same day (`ensureSession` keeps the mark for the same offer). The review's
  tests moved into place; new store tests for the later plan, a reload and another place; the M31
  table at 285 entries, every one run caught. Full suite before the last tests: 2910 passed.
  Report: the nineteenth pass written, `TWENTIETH_PASS` placeholder, two known limits added. Next:
  the twentieth review on `0fe4cb9`.
- **Round N**: local `25fd689` on Round M's old `0f8d10f`; next: rebase onto `0fe4cb9`, then the
  tenth review's five findings (tests in `/home/user/wc4-n-review/src/review-m32j/`, report saved
  in the session scratchpad): (1) MEDIUM, a max with reps set by hand at another range drops the
  day's `atBackOffs` mark (keep `mainLiftTarget(...).straight` in the other-range branch of
  `fittedFrom`); (2) the hand-weight replay in `backOffsAsPlanned` is not capped at the top set
  (`top: null`); (3) `sessionFeedback` calls `backOffMiss` without `backOffAt`; (4) after that max
  the first straight set keeps the old top set's reserve (`withReps` restores each set's old
  reserve); (5) the generator's pick-up (`reopened`) keeps `manual.backOffs`.
- **Maintenance 33**: local `065e13c` on Round N's `25fd689` (diff:
  `docs/handoff/round-o-wip/round-o.diff`). The first review's thirteen findings are fixed: every
  reading that sets a lift's session against another's (the fatigue drift, a first set against the
  rested sessions, the learned windows) reads each set against what it asked
  (`src/engine/recovery/againstAsked.ts`: the same ask as lifted, a changed ask with reps in the
  range as asked); any illness keeps a workout under way at the head cold's floor; no drop-set
  offer or "too soon" card where the day forbids them; one day context for every reader of the
  windows (`dayRecovery`); the schedule line is the card's footnote; "Lighter" keeps every load;
  stale ease marks go while it is in force; the learned page names the "too soon" Not now; item
  43's day rule for the reserve check is back; the pain gate is said beside "Hurts, protect it".
  The M33 table at 80 entries, every one run caught. Next: rebase onto Round N's new head, then
  its second review.
- **Not ours**: the launcher icon and PWA install are the Life Mirror builder's (the owner,
  2026-10-24): nothing about them is to be done in this work.

### Checkpoint, 2026-10-24 17:00 UTC (supersedes the states below)

- **Round M**: `0f8d10f`; its nineteenth review is running (tests to come in
  `/home/user/wc4-m-review/src/review-m31s/`).
- **Round N**: local `25fd689`, rebased onto Round M's `0f8d10f` (backup of the old base:
  `backup/round-n-34dc615`); `docs/handoff/round-n-wip/round-n.diff` is now against `0f8d10f`. The
  ninth pass is complete: the weight set by hand recorded as the top set's or the back-offs' own
  when it is set (`manual.backOffs`), every replay of the back-offs starting from it; a max with
  reps set by hand at another range read as every plan reads a straight day; a saved session keeps
  the load the drop gave its back-offs (`backOffAt`), the drop's correction reading only back-offs
  lifted at it; in a style without the structure every straight session counts toward leaving it,
  decided in the shared top-set reader. Tests moved into place, the M32 table at 221 entries, every
  one run caught. Full suite: 3119 passed, 5 skipped. Its tenth review is running (tests to come in
  `/home/user/wc4-n-review/src/review-m32j/`).
- **Maintenance 33**: `cebcffb`, next: rebase onto Round N's `25fd689`, then its thirteen findings
  (tests in `/home/user/wc4-o-review/src/review-m33a/`). Planned: a fever under way keeps at least
  the head cold's hold; the coach offers no drop set and no "too soon" card on an illness day; the
  first-set read and the fatigue drift read a set against what it asked, the plan's own load step
  and a deload no fall; the lighter option keeps the loads, as its words say; item 43's approved
  day rule for the reserve check restored; the Plan screen and the hard start read the resets and
  the day's check-in; the schedule line a footnote; the learned page's Not now line.

### Checkpoint, 2026-10-24 16:30 UTC (supersedes the states below)

- **Round M**: local `0f8d10f` (diff on `2595631`: `docs/handoff/round-m-wip/round-m.diff`). The
  eighteenth pass is complete: seven findings fixed at the shared level (a plan marked emptied
  only by the lifter's hand, `emptied`, read by every rebuild, the way back and a later plan the
  same day; closed slots in the day's settings, `closedSlots`, on any day off the plan; lifts
  swapped away kept out of every pick and of what comes in for comfort or pain, `swappedAway`,
  the lifter free to put one back; "Hurts" brings back no lift it replaced). Two tries reverted
  because they broke Maintenance 25's approved behaviour (a swap back turns nothing away; a lift a
  sore joint only moderately stresses may come back, now a known limit). The review's tests moved
  into place, new tests for every new rule, the M31 table at 270 entries, every one run caught (Y2
  retired: equivalent since the ninth review's slot for a muscle a lift misses; say so in the
  report's revert section). M27 and M30 re-anchored. Full suite: 2900 passed, 5 skipped. The
  nineteenth review is running on `0f8d10f` (tests to come in `src/review-m31s/` of
  `/home/user/wc4-m-review`). Next: its findings; then the full M31 run, the cross-round tables,
  browser suite, verify, ship.
- **Round N**: `34dc615`. Ninth review done: five findings, tests in
  `/home/user/wc4-n-review/src/review-m32i/` (13 failing): a hand weight on the top set blocks the
  back-offs' replay (store `backOffsAsPlanned`'s early return); the top set's correction replays
  over a weight the back-offs took by hand; a max with reps set by hand at another range ignores
  `straightAfterTop`; the drop's self-correction reads back-offs lifted at another load; the known
  limit understates the hold for a lift with secondary days (fix the wording). Planned fix for the
  first two: record whose the hand weight is when it is set (top set or back-offs). Rebase onto
  Round M's `0f8d10f` first.
- **Maintenance 33**: `cebcffb`. First review done: thirteen findings, tests in
  `/home/user/wc4-o-review/src/review-m33a/` (15 failing); one HIGH (a fever under way after a
  head cold gives the full-effort plan back). Finding 13 restores item 43's approved day rule (no
  reserve check after a low or sore check-in). Rebase onto Round N's final first.

### Checkpoint, 2026-10-24 15:25 UTC (supersedes the states below)

- **Rounds M and N**: unchanged (`4cb40d7`, `34dc615`); their eighteenth and ninth reviews running.
- **Maintenance 33**: local `cebcffb` (on `34dc615`). Its revert table is complete for now: 51
  entries, every one caught (two left out as equivalent, with the reasons in the table), with new
  tests for the rest day on Today, a log grown in place, the completion line's muscles, the
  hard-work rule and an untargeted session's pairing. Its first adversarial review is running in
  `/home/user/wc4-o-review` (tests to come in `src/review-m33a/`). Next: the three reviews'
  findings; then ship Round M, Round N and Maintenance 33 in order, each after a clean pass, its
  full revert run, verify and the live checks.

### Checkpoint, 2026-10-24 15:05 UTC (supersedes the states below)

- **Rounds M and N**: unchanged (`4cb40d7`, `34dc615`); their eighteenth and ninth reviews running.
- **Maintenance 33**: local `9f2c2b9` (on `34dc615`). Full suite on the rebased code: 3139 passed
  (the two failures since carried over). The M33 revert table is begun (`tools/reverts/table_m33.txt`,
  49 entries, every anchor found): the first 36 ran, all caught or covered since (the big dose's cap
  retired as equivalent; tests sharpened for the synergist's half weight, the rested baseline, the
  hard-work rule and the untargeted pairing); a run of those and the second batch is under way in
  `/home/user/wc4-revert-o`. The re-anchored M27, M31 and M32 entries are all caught. Next: the
  rest of the M33 table (the illness rest day on Today, the shown cards in the store, the schedule
  card's cache, the recovery index's signature), then its reviews.

### Checkpoint, 2026-10-24 15:00 UTC, later the same hour (supersedes the states below)

- **Round M**: `4cb40d7`; its eighteenth review is running.
- **Round N**: `34dc615` (on Round M's `4cb40d7`): full suite 3072 passed, 5 skipped; its ninth
  review is running.
- **Maintenance 33**: local `d0200b2`, now rebased onto Round N's `34dc615`
  (`docs/handoff/round-o-wip/round-o.diff` is against `34dc615`; backup of the old base:
  `backup/round-o-301141b`). Since the last checkpoint: the trigger registry counts the lighter
  option; the e2e check-in test on the new rules and a fever-or-aches rest-day e2e; the report's
  draft (`docs/reports/maintenance-33.md`); the M27, M28, M31 and M32 tables re-anchored to its
  code (M28's two day-count entries retired); Round N's five-day and refit tests carried on its
  signals. Next: the full suite on the rebased code, run the re-anchored entries (R44-1e, R19, V4,
  N35, N42, N43, N46, N158, N202, N208), the M33 table, its reviews.

### Checkpoint, 2026-10-24 15:35 UTC (supersedes the states below)

- **Round M**: unchanged since 14:50 (`4cb40d7`); the eighteenth review is running.
- **Round N**: local `34dc615`, now rebased onto Round M's `4cb40d7` (backup of the old base:
  `backup/round-n-23f37ce`); `docs/handoff/round-n-wip/round-n.diff` is now against `4cb40d7`. The
  eighth pass is complete: the review's tests moved into place, the M32 table at 207 entries with
  every entry caught (one equivalent entry for the undo's replay left out, with the reason), the
  report's eighth pass and known limits. Full suite before the rebase: 3049 passed, 5 skipped; after
  it, running. Next: a ninth review on the rebased code.
- **Maintenance 33**: local `c8927be`, diff on Round N's old `abb5566` (rebase it onto Round N's
  latest before shipping). Since 14:50: the older coach and strategy tests moved to the new rules,
  and the learned page's recovery section (each muscle's window its own sessions moved, and its
  reset). Full suite running. Next: the e2e coach test and an illness e2e, the cross-round revert
  tables, the report and docs, the M33 table, reviews.

### Checkpoint, 2026-10-24 14:50 UTC (supersedes the states below)

- **Round M**: local `4cb40d7`, diff on `2595631`. The seventeenth pass is complete: H75, H76 and
  H85 have tests, H18 mutates both holds, and every entry this pass touched is caught (248 entries).
  The eighteenth review is running on `4cb40d7` (tests to come in `src/review-m31r/` of its
  worktree). Next: its findings, then the full M31 run, cross-round tables, browser suite, verify,
  ship.
- **Round N**: local `db12411`, diff on `532aba6`. All six eighth-review findings fixed; the twelve
  review tests pass (still in `src/review-m32h/`, to move into place with table entries): leaving
  the structure (main days only, or none in three), a hand weight kept through corrections, a max
  with reps set by hand (the plan's range reads as the plan does; another range its own straight
  target, read past the marked days), the day's fatigue read off the whole log, back-offs replayed
  from the logs as corrected. The five-day test is spaced from the old fatigue score's days in a row
  (a known limit until Maintenance 33). Next: the full unit suite, the tests moved, M32 table
  entries, the report's eighth pass, then rebase onto Round M's final and a ninth review.
- **Maintenance 33**: local `0b84dfa`, diff on `abb5566`. The fatigue score now reads each lift's
  estimated max against what its sets asked (a load planned lighter and lifted as asked is no fall),
  sessions saved without targets as before. Eight older coach and strategy tests still expect the
  pre-33 rules (the "too soon" card now leads where their histories train a muscle every two days;
  days in a row no longer score): move them to the new rules. Then the rest of its list below.

### Checkpoint, 2026-10-24 14:20 UTC (supersedes the states below)

Saved before a usage limit. Each round's work in progress is one diff in `docs/handoff/`, and in
its local worktree when the container survives (`/home/user/wc4-m`, `wc4-n`, `wc4-o`).

- **Round M** (`docs/handoff/round-m-wip/round-m.diff`, `git apply` on `2595631`; local
  `485f7dd`). The seventeenth review found seven (one MEDIUM, six LOW), all fixed with tests: the
  way back from the full session finds an emptied catch-up so (`constraints.emptied`, the offer's
  key); a place stop picks up past a stand-in stopped with nothing in; the one-set rule on any day
  off the plan in the generator (`offPlan`); a lift leaving by the lifter's hand takes the lift it
  stood in for with it (`keepSwappedAway`); a left-out slot closes off the plan (`CatchUpSlot.closed`,
  and `scopeFor` keeps the slots while one is closed); every rebuild holds kept lifts to the offer's
  dose (`holdToOffer`); the sheet's one-set reason with nothing ranked; a stand-in named past the
  plan's names before the change. Full unit suite passed (2866, 5 skipped) before the last tests.
  The M31 table has 248 entries, every anchor found; its run caught all but four. **Next:** H75 needs
  a test of the way back after the offer changed (laid out afresh, not emptied); H76 one of the way
  back at a place with no lift for the offer (a bare home plans the split's day, which stays); H85
  one of a comfort left-out on a day of the plan (home with dumbbells: the lift swapped away does not
  come back at the next rebuild); H18 is now covered twice (`holdToOffer` and `settleKept`): make it
  mutate both `heldIn` lines (a list of pairs). Re-run those entries, then the eighteenth review,
  then the full M31 run, the cross-round tables (M30, M29, M28 `--utc`, M27), the browser suite,
  verify, ship. The report has the seventeenth pass and a placeholder `EIGHTEENTH_PASS`.
- **Round N** (`docs/handoff/round-n-wip/round-n.diff`, on Round M's previous `532aba6`; local
  `3a96226`). The eighth review found six (1 HIGH, 3 MEDIUM, 2 LOW); their failing tests are in
  `src/review-m32h/`. Begun: `pastBackOffDays` leaves the structure only past two main days run
  straight, or three sessions with no main day (`MAIN_ROLE`). The HIGH test still fails because the
  old fatigue score's estimated-max drift reads a lift planned lighter later in a session (the
  shoulder press after three pressing lifts) as a fall, so Fridays read high. The owner's word
  (2026-10-24): fix that in Maintenance 33's shared fatigue model, not with a legacy patch. **Next:**
  finish the eight findings (3: a corrected back-off keeps a weight set by hand, and an undo too; 4:
  a max with reps set by hand reads past the marked days; 5: a refit reads fatigue from the full
  log; 6: back-off replays read the log as corrected), rebase onto Round M's final, review again.
- **Maintenance 33** (`docs/handoff/round-o-wip/round-o.diff`, on Round N's `abb5566`; local
  `371d61e`). Done since the last checkpoint: the schedule card reads the moved week with the same
  "too soon" check and says the days (`tooSoonAhead`, cached per hour); the recovery index read once
  per log (learned windows and rested baselines kept with it: about 1.3 s to 40 ms on 400 sessions);
  the hard-start reading honours the learned reset. The approved proposal's "reorder the split across
  those days" is held for the owner's final review: it changes the split rotation the same proposal
  keeps unchanged, and no reordering avoids an overlap on the default four-day split. **Next:** the
  fatigue drift fix above (a set's estimated max read against what its target asked, so a load
  planned lighter is no fall), the learned page's windows, the e2e coach test, the cross-round
  tables, docs, the M33 table, reviews.

### Resumed on the owner's word, 2026-10-23 (supersedes the states below)

- **The app icon** (the owner's request of 2026-10-23) is fixed and live: `6ff6f34`, Deploy Pages
  run 39947121487. The owner's SVG wrappers of 2026-10-22 embedded the new artwork as base64 WebP
  text cut short, so the header logo showed a broken image. Every icon is now rendered from
  `assets/app-icon.png` (the artwork exactly as provided) by `npm run icons`, which checks each
  file; CI renders them before every build. Locally, run it with
  `ICONS_CHROMIUM=/opt/pw-browsers/chromium npm run icons`.
- **Round M** sits on `main` (`2595631`) in its worktree and in
  `docs/handoff/round-m-wip/round-m.diff` (`git apply` it on `2595631`). Sixteen review passes
  found twenty, twelve, seven, three, two, three, four, three, three, two, four, seven, eight, eight,
  nine and seven issues, each shown by a failing test and fixed (one LOW kept as a known limit, with
  the reason). The sixteenth's: a catch-up the lifter emptied stays so through every rebuild but one
  built whole for a changed offer, the store's preview built again too; a joint ticked in the
  check-in empties a catch-up as a lift set aside does; one rule says when the day is off the plan,
  a second workout with nothing behind included (its swap checks, its empty plan, its comfort pick,
  its one-set rule); the swap sheet says a finished lift is done though nothing ranks, and gives the
  lift's own one-set reason; off the plan, a lift stopped with nothing to come in owes nothing more;
  a new lift takes no name a lift left out still had. A seventeenth pass is checking them. The M31
  table has 226 entries, every anchor found, every entry changed since its last full run caught; the
  full unit suite passed (2847, 5 skipped). The report is written up to the sixteenth pass. Next: the
  seventeenth pass, the full M31 run and the cross-round tables (M30, M29, M28 `--utc`, M27) on the
  final code, the browser suite again, verify, ship.
- **Round N** (item 11, a top set plus back-offs) is rebased onto Round M's latest (`532aba6`) in
  its own worktree, and saved in `docs/handoff/round-n-wip/round-n.diff` (`git apply` it on Round
  M's diff applied to `2595631`). Seven review passes found twelve, ten, eleven, six, seven, six and
  six issues, each shown by a failing test and fixed, and the revert runs' new tests two more. The
  seventh's: a lift has left the structure once its sessions since its last top set pass two, its
  own sessions at another range among them (on Undulating every heavy day read the same old top
  set); a max entered reads the lift's own straight target as every plan does; a back-off corrected
  replays the ones after it; a lift picked up again keeps each logged back-off's step; a break is
  measured from every session of the lift; the fatigue's drift and the Progress trend read the top
  sets alone. Its M32 table has 200 entries, every anchor found, the seventh pass's entries caught;
  the full unit suite passed on Round M's latest (3037, 5 skipped). Its report is written up to the
  seventh pass. An eighth pass is checking it. Then its review passes until clean, verify, ship, once
  Round M is live. The lift to push keeps item 44's straight sets by default: a question for the
  owner's final review.
- **Maintenance 33** (the recovery and readiness core) is under way in a local worktree on Round N,
  and saved in `docs/handoff/round-o-wip/round-o.diff` (`git apply` it on Round N's diff). Built so
  far, with tests: the sourced rules table (`src/engine/rules/ruleTable.ts`, every number with its
  basis and source); the per-muscle recovery model (`src/engine/recovery/recovery.ts`: windows from
  each muscle's last hard work, by how close its sets went to failure and the body region,
  lengthened by a large dose, a new lift, long-length work and a short night, and shifted within
  bounds by what the lifter's own first sets show); the "too soon" check; the check-in read against
  the lifter's own four weeks (`src/engine/readiness/checkIn.ts`: two items clearly worse, or two
  short nights running, lower what the day's first sets are expected to do, never the plan; soreness
  alone never counts); the illness gate (above the neck: every set 2 or more short of failure; fever
  or aches all over: a rest day, Today's Start hidden, "Finish here" under way) and its answer on the
  check-in sheet; the fatigue score without day counts or check-ins ("Recovery is behind" on hard
  ratings alone); every existing test moved to the new rules. Next: the "too soon" card and its
  one-tap lighter option with the card limits (1 a day, 3 a week, Not now for the week), the
  first-set check, the per-muscle balance on the Plan screen, the completion's window line, the
  schedule card on the same check, the learned page's windows, the docs, the revert table and the
  reviews. Its design follows the approved proposal (`docs/proposals/week-model-readiness-time.md`,
  parts 2, 4 and 5, decisions 1, 2 and 5) and the research in `docs/research/recovery-time-course.md`
  and `docs/research/readiness-and-soreness.md`.

### Paused again on the owner's word, 2026-10-17 (superseded above)

The owner asked for a pause ("running out of credits"). `main` and the live build are `03a1bef`
(Round L, live). Round M is saved in `docs/handoff/round-m-wip/round-m.diff`, one diff against
`03a1bef`, with its report brought up to the first review's fixes.

**Stopped at the pause, and how to restart each:**

1. **The M31 revert run** (`mutate-m31.py --utc`, 103 entries): stopped after 32 entries, all 32
   caught, none survived. Restart it whole on a copy of `main` with the diff applied:
   `python3 tools/reverts/mutate-m31.py --repo=COPY --utc`. Every entry must end KILLED.
2. **The second review pass** of the first review's fixes: stopped as it began, with nothing found
   or written. Start a fresh reviewer on the fixes (`git diff` of the review's tests commit against
   the latest), with the decisions listed below as taken; each finding needs a failing test, and
   the reviewer changes no product code.

**Then, in order:** the browser suite on Round M's build (today's real date decides whether the
catch-up shows: specs that seed a recent workout may need `takeFullSessionIfOffered` from
`e2e/helpers.ts`); fill REVIEW, LIMITS, REVERTS and VERIFY in `docs/reports/maintenance-31.md`;
verify; squash onto `main`; deploy; the status and report docs.

### Resumed on the owner's word, 2026-10-17 (superseded by the pause above)

- **Round L** is live: squashed onto `main` as `0f4b9bd` and deployed by Deploy Pages run
  39076937311 (success). The live marker and the live suite wait for the host (below). Ten review passes; the tenth found nothing new. Revert tables on
  the final code (`71b0eb3`): M30 121 of 121, M29 32 of 32, M28 83 of 83 (`--utc`), M27 193 of 193
  (its R44-19 entries in New York time). CI on `71b0eb3` (run 39073083667): every step passed, the
  browser suite 417 passed and 14 skipped by design. The cloud machine's Chromium cannot play the
  MP4 clips, so locally the 19 clip tests fail; CI is the authority for them.
- **The live host is blocked from the cloud machine** (`403 host_not_allowed`). The deploy is
  checked through the GitHub API; the live marker and the live suite wait until the environment's
  network policy allows `bill6006.github.io`, or run on the owner's machine.
- **Round M** is in progress on the branch `claude/workout-conductor-round-l-26i4o9`: its
  `docs/handoff/round-m-wip/round-m.diff`, left out of `main`, is one diff against `03a1bef`
  (`main`). Apply it with `git apply` on `main`. It holds the code, its tests, the report draft,
  its revert table (103 entries), and the first review's fixes, each finding's test moved into the
  proper test file.
  - The first review's findings and the calls made on them (each stated in the report):
    - a catch-up is the next app length below the Default (product judgement);
    - the lift to push, the probe set, the extra set and drop sets are off in a catch-up and a
      second workout (`offPlan`), as are swap-ins that work a resting muscle;
    - each muscle's sets are budgeted across the session's slots;
    - a second workout's remainder is read from today's own session, and a muscle trained in the
      48 hours before today takes nothing more;
    - a workout begun today counts only once a working set of it is done;
    - a second workout in a deload week still goes easy on what was done;
    - the coach's fewer-reps narrowing stays; keeping a covered loaded version ends the swap back
      everywhere (documented);
    - S6: a new lifter on a day not ticked is told so in one line too.
  - All twenty are fixed, with S1 and S1b (a profile save re-reads the day's offer), C1 (no coach
    offer adds work off plan), R4 (no swap brings in a resting muscle's lift), T1 (the day note
    when only remainders went in) and S6 (the line on a day not ticked with no catch-up). Code the
    fixes made dead is gone: the template's shared-slot sets (the budget sets them), the push's
    resting check (off the plan it never goes in), an empty-limit guard.
  - Next: the M31 table's run with `--utc`; a second review pass until clean; the browser suite on
    Round M's build; verify; ship.

### Paused on the owner's word, 2026-10-17 (supersedes the state below)

The cloud session paused here ("I am running out of credits; pause at your next checkpoint").
Nothing is merged to `main` or deployed: `main` and the live build are still `dbd1726`.

- **Round L** is on `claude/workout-conductor-round-l-26i4o9`. Review passes four to seven are
  fixed, each finding shown first by a failing test: `1424451`, `0610421`, `3755e6b`, `b327173`
  and `8a7a9f1`. The docs are in `df97203`.
  - The M30 revert table catches 113 of 113 on `8a7a9f1`.
  - The earlier rounds' tables, on `0610421`:
    - M29: 32 of 32;
    - M28: 83 of 83, run with `--utc`, as CI runs;
    - M27: 193 of 193. Its three R44-19 calendar-day entries are caught only away from UTC; run
      them with `TZ=America/New_York`.
  - Re-run on `8a7a9f1`, the M27 and M28 entries in files changed since then: 32 of 32.
  - CI on `8a7a9f1` (run 39055259582) was still in its browser step when the session paused.
- **Round L, what is left:**
  1. The eighth review pass, on `git diff 3755e6b 8a7a9f1 -- src/`, was stopped part-way. Run it
     again, and fix and re-check until a pass finds nothing new.
  2. Fill `EIGHTH_PASS`, `REVERTS` and `VERIFY` in `maintenance-30.md`, and `TOTALS` and
     `RECHECK_LINE` in `PROJECT_STATUS.md`.
  3. Then section 2, steps 7 to 10: verify, squash onto `main`, deploy, live checks, docs commit.
  4. Leave `docs/handoff/round-m-wip/` out of the squash.
- **Round M** (items 12 and 32, and the week model) is built in `docs/handoff/round-m-wip/round-m.diff`.
  It is one diff against `8a7a9f1`; apply it with `git apply`. It holds:
  - the code, the tests and `e2e/roundM.spec.ts`;
  - its revert table, 72 entries (`tools/reverts/mutate-m31.py`), anchors checked, not yet run.
    Run it with `--utc`.
  - the report draft, `docs/reports/maintenance-31.md`.

  Its unit tests pass. What is left: the full browser suite on its build. Specs that seed a workout
  in the last 14 days meet the catch-up on a day the default schedule does not tick. Specs that
  finish a workout and come back to Today meet the second workout. Then its revert table, review
  passes, verify and ship, as for every round.
- **Then** sections 3 to 9 as written: Round N (item 11), the readiness core, time intelligence,
  item 48 (switch off), the schedule watch, and the presets question to the owner.

**Background work stopped at the pause, and how to restart each** (none left results to keep):

1. **The eighth review pass** (a subagent), stopped part-way with nothing reported.
   - Start a fresh reviewer on `git diff 3755e6b 8a7a9f1 -- src/`, plus the moving-clock test in
     `b327173`.
   - Focus areas, as briefed:
     - the swap-back expansion's reach (`withSwapsBack`): a swap back next to another swap from the
       same loaded versions; a swap back to a move that does not fit or is disliked; a push day or
       a deload day; stopping a swap; the store's swap checks; recalibrate's `withSwapLines`; the
       coach's swap offer that uses `swappedOutIds`;
     - whether removing the coach's exemption reopens the fifth pass's finding;
     - the rack-chip change for older custom moves;
     - any revert entry blinded.
   - Each finding needs a failing test. The reviewer changes no product code.
2. **The full browser suite on Round M's build**, stopped part-way with no results. After applying
   the diff:
   - run `npm run build`;
   - run the suite with the local wrapper described below.
3. **Not stopped, external:** CI run 39055259582 on `8a7a9f1`. Read its result through the GitHub
   tools before going on.

**Local set-up that does not survive a reclaimed container** (recreate it):

- **The browser tests.** Playwright cannot download its own Chromium here. Run them through a
  small config outside the repository that imports `playwright.config.ts` and adds
  `launchOptions.executablePath = '/opt/pw-browsers/chromium'` to each project (Chromium 141). CI
  runs the real config; it is the authoritative browser run.
- **The revert copies.** Each is an rsync copy of the repository with its own `npm ci`, at
  `../wc4-revert` (see `tools/reverts/README.md`). Exclude `node_modules`, `.git` and `.claude`.
  A second copy can symlink the first's `node_modules`.
- **Round M's worktree.** Make a local branch from `8a7a9f1`, then `git apply` the diff.

**Verify it before changing anything:**

```bash
git fetch origin
git log --oneline -1 origin/main                     # dbd1726 Maintenance 29, round K: items 7, 8, 10 and 14
git log --oneline -4 origin/cloud/round-l-handoff    # the handoff commits, f490dda (WIP), dbd1726
B=https://bill6006.github.io/Workout-Conductor-Rebuild-v4/
JS=$(curl -s "$B" | grep -o 'assets/index-[^"]*\.js' | head -1)
curl -s "$B$JS" | grep -o 'shortCommit:.\{0,10\}'     # live build: dbd1726
```

If `origin/main` has moved past `dbd1726`, or the branch differs, stop and work out why before
going on: someone else has worked since. The live-build check needs network access to
`bill6006.github.io` (section 9). If it is blocked, say so, and go on with Round L, which needs no
live check until it ships.

| What | Where | State |
|---|---|---|
| Round K (Maintenance 29: items 7, 8, 10, 14) | `main` at `dbd1726` | **Live** (Deploy Pages run 38119197463). The live suite passed 404, with 18 skipped by design. YELLOW until the owner's phone review. |
| Round K's live-result docs | in `f490dda` (`maintenance-29.md`, `PROJECT_STATUS.md`) | Written, not shipped. They ship with Round L, as planned. |
| Round L (Maintenance 30: items 6, 30, 31) | branch `cloud/round-l-handoff`, commit `f490dda` | **Built, not shipped.** Three review passes done and fixed. The fourth pass has **three open findings** (section 2). Not merged, not deployed. |
| This handoff (`CLAUDE.md`, `docs/handoff/`, `docs/proposals/`, six `docs/research/` reports, `tools/reverts/`) | the commits after `f490dda` on the same branch | Docs and tools only. No product code. |

`f490dda` is the Round L working tree exactly as it stood when work stopped on 2026-10-11, unchanged.
It holds the code and tests for 6/30/31, `e2e/roundL.spec.ts`,
`docs/research/loaded-bodyweight-moves.md`, the report draft `docs/reports/maintenance-30.md`, and
the status edits.

**Checks that passed. Don't repeat them unless the code they cover changes:**

- **On `f490dda`'s tree** (2026-10-17, Windows):
  - lint and type check clean;
  - `vitest run`: 2467 passed, 5 skipped (261 files, 1 skipped);
  - `node scripts/test-zones.mjs`: the day rules' tests, 22 passed in each of its two zones;
  - privacy scan: 0 findings;
  - build and verify-build: passed (JS 1233.5 KB raw, 361.3 KB gzip).
- **CI on this branch** (run 39042884292, on `27a7f9e`, whose product code is `f490dda`'s):
  - every step passed up to the browser tests (lint, type check, unit with the zone runs, build,
    privacy scan, verify-build);
  - **the browser tests failed: 405 passed, 3 failed, 1 flaky, 14 skipped.** This is the Linux
    baseline: Round L's e2e had not been run since its second and third review passes.
  - **The 3 failures** are one test in all three projects: `e2e/roundL.spec.ts:14` ("a machine set
    to plates at the gym stays so, and Home shows its dumbbells only"). Line 23 still expects
    "Dumbbells at Gym". Since the second review pass, the hand-weights section is named for the
    place's equipment (`HAND_NAMES` / `handWeightsAt` in `loading.ts`). The default gym has
    kettlebells, so it reads "Dumbbells and kettlebells at Gym". The test is almost certainly out of
    date rather than the app: confirm against that fix's intent (`maintenance-30.md`, Review), then
    update it and check the rest of the test.
  - **The flaky one:** `e2e/swaps.spec.ts:44` on android-412 timed out waiting for the bench press
    entry, then passed on retry. Run it repeatedly (`--repeat-each=5`) to rule out a Round L
    regression before calling it load.
- **Revert runs** (`tools/reverts/README.md`):
  - M30: 87/87 caught on the code after the third review pass.
  - M29 32/32, M28 83/83 and M27 193/193 caught on the Round L code after its second pass.
  - M26 `--all`: 1199/1199 on the M29 code.
- **Round K's live suite** (404 passed) and Round K's own revert table: done. Not needed again.

## 2. Finish Round L, in this order

0. **Make the browser tests green on the WIP.** Fix the stale expectation in `e2e/roundL.spec.ts`
   and check `swaps.spec.ts:44` (section 1, CI). Run `npx playwright test e2e/roundL.spec.ts` after
   `npm run build`; if Playwright can't install here, push the branch and read CI.
1. **Port the fourth pass's failing tests** from `docs/handoff/recheck4/*.txt` into `src/`. Drop the
   `.txt` and fix the relative imports (they were written for `src/recheck4/`). Confirm each fails on
   `f490dda` for the reason its comment gives; the baseline cases in them must pass.
2. **Fix the three findings:**
   1. **MEDIUM. `loadedVersionShift` (the −40) is no bar.** When a slot's only candidate left is a
      loaded version, it is planned while its bodyweight move was never outgrown. Examples: a sore
      knee with the reverse lunge and step-up disliked; every bodyweight lunge disliked; a kept swap
      away from the split squat with the other lunges disliked.
      - Fix: bar a loaded version outright while its bodyweight move does not load (`loadsNow` is
        false).
      - Exceptions: it is a favourite, the kept swap's own `to`, or the lift to push.
      - "Never empties a slot" then falls back as before the round: the plan's own pick stays.
   2. **LOW. A kept swap from B to B's own loaded version** (for example the split squat to the
      dumbbell split squat, now offered by the swap sheet) puts B in `swappedAway`. The chosen loaded
      version is then pushed down in the coach's extra work. Fix: leave out of `swappedAway` any swap
      whose `to` is in `LOADED_VERSIONS[from]`.
   3. **LOW. `comesBothWays` reads only `equipment[0][0]`** for a lifter's own move. The custom
      sheet saves its chips in tap order, so "Barbell + Hack squat" has the switch only when Hack
      squat was tapped first. Fix: match any item of the first equipment group against
      `bothWaysMachines()`.
   4. **Optional, if cheap:** setup's Gym deletion (in `appStore.ts`, near the setup flow) still runs
      outside the place-write queue. Run it through `afterPlaceWrites` like `deleteLocation`.
3. **Revert entries.** Add one per fix to `tools/reverts/table_m30.txt`, then run
   `python3 tools/reverts/table_m30.py`. Run the whole M30 table on the final code (it is short);
   every entry must end KILLED.
4. **A fifth review pass,** adversarial, on those fixes only. Fix whatever it shows, with a failing
   test first, and repeat until a pass finds nothing new.
5. **Cross-round reverts on the final code:**
   - M29 (32), M28 (83) and M27 (193). Every entry must be caught; mend any test the round blinded.
   - Re-anchor the four M26 entries listed in `tools/reverts/README.md`.
   - Run M26 `--all` at least once before the final consolidated phone review.
6. **Fill the placeholders:**
   - In `docs/reports/maintenance-30.md`: add the fourth and fifth passes to Review; write `REVERTS`
     and `VERIFY` in the style of `maintenance-29.md`.
   - In `PROJECT_STATUS.md`: `TOTALS` (the Test totals row) and `RECHECK_LINE` (the re-check's
     result).
   - Then reconcile the status (section 5).
7. **Verify.** Run `npm run build`, then `npm run verify`, alone.
8. **Ship.** Squash the branch onto `main` as one Round L commit (`git merge --squash`), with the
   message in `docs/handoff/round-l-commit-message.txt` plus a line for the fourth and fifth passes
   and the handoff docs. Then push `main`.
9. **Watch Deploy Pages,** then check the live marker carries the new commit (section 1's `curl`
   line).
10. **Run the live suite:**
    `E2E_BASE_URL=https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ npx playwright test`.
    A run of name-lookup errors is the network, not the app: run it again.
11. **A docs commit** with the live results (report and status), `[skip ci]`, using explicit paths:
    `git commit -m "…" -- docs/reports/maintenance-30.md PROJECT_STATUS.md`.

Keep the branch `cloud/round-l-handoff` after the merge; it is the record of the handoff.

## 3. Then the approved queue, in order

Every item goes through the owner's cycle (2026-10-11), and the work does not pause at review
gates:
1. research where training is involved;
2. preserve all approved behaviour;
3. build;
4. adversarial review, with the fixes re-checked until a pass finds nothing new;
5. tests and a revert table where every entry is caught;
6. `npm run verify`;
7. commit, push, deploy;
8. the live marker and live suite;
9. the report and status docs;
10. the phone-review list kept exact.

| # | Round | What | Spec and evidence |
|---|---|---|---|
| 1 | M (Maintenance 31) | Items **12** (a catch-up on an unplanned day) and **32** (a second workout the same day), building the **week model** they need | `docs/handoff/round-m-design-notes.md`; `docs/research/catch-up-and-second-workout.md`; `docs/proposals/week-model-readiness-time.md` parts 1 and 5 |
| 2 | N (Maintenance 32) | Item **11**: top set plus back-off sets | `docs/research/top-set-back-offs.md` (Recommended default design); its seven questions are answered in the cloud prompt |
| 3 | Maintenance 33 | **Recovery and readiness core**: per-muscle recovery estimates, the first-set check, the illness and pain gates, replacing the day-count fatigue rule; the schedule card on the same check | proposal parts 2 and 4; `docs/research/recovery-time-course.md`, `readiness-and-soreness.md` |
| 4 | Maintenance 34 | **Time intelligence**: the forecast at real lengths, carrying the need forward, the "longer would help" suggestion with cooldowns, the honest goals-versus-time check | proposal part 2; `docs/research/training-dose-and-time.md`, `coaching-nudges-and-cooldowns.md` |
| 5 | Maintenance 35 | **Item 48**: Life Mirror's check-in, read-only from the shared database, behind a switch | proposal part 3; `docs/proposals/item-48-life-mirror-check-in.md` |
| 6 | Maintenance 36 | **Schedule watch** (it needs 8+ weeks of data after a move, so it switches on last) | proposal part 2; `docs/research/recovery-time-course.md` (Schedule watch) |
| 7 | where the owner places it | **Custom equipment presets**: newly approved, but **not defined anywhere in this repository** or in any record available here | The owner's definition in the cloud prompt. Without one, ask the owner about this item alone and carry on with the rest. |

Round numbers after N are a suggestion; keep one maintenance report per round. The proposal's
numbers live in one sourced table (proposal part 2): add it as a data module with each value's source
and evidence status, not as scattered constants.

**Not approved, so don't build:**
- the Maintenance 30 Proposed items (a move's load at a place that does it another way; a loaded calf
  raise at home);
- Maintenance 25's two Proposed storage protections;
- Maintenance 21's Proposed 28;
- anything else marked Proposed in the reports.

**Before declaring the queue done,** reconcile it: every item in this table, every item in
`PROJECT_STATUS.md`'s "Agreed and waiting", and the cloud prompt's list must be live, or named with
the reason it is not.

## 4. Approved behaviour to keep

- **Round L's decisions** (in `maintenance-30.md`):
  - A weight typed on a bodyweight move counts as outgrowing it (item 31's intent; Maintenance 21
    promised only carry-forward).
  - Outgrown is sticky: it goes back only when no bodyweight set reaches the bottom of the range.
  - A loaded version waits until its bodyweight move loads, wherever that move is. A favourite still
    wins outright.
  - The Pin stack / Plates switch is per machine (the leg press and its calf raise together). The
    plates record keeps `stack`.
  - Place writes are queued, deletions included. The Settings autosave keeps the loading as stored,
    and its stamps ignore `loading` and `updatedAt`.
  - Hand weights are named by the place ("Dumbbells and kettlebells at Gym").
  - A lifter's own move gets the switch only on a machine that comes both ways.
  - The coach skips only the loaded versions in `ADDS_TO_BODYWEIGHT` when a bodyweight move falls
    short.
- **Round M's settled questions** (`round-m-design-notes.md`):
  - catch-up sets: 3 per behind muscle, 2 for a beginner;
  - "behind" means a projected shortfall over the Monday-to-Sunday week;
  - the 48-hour rule after a catch-up is unchanged;
  - item 32's remainder rule at 3+ RIR;
  - a beginner's muscles trained today sit out.
- **Today's readiness check-in** (`ReadinessSheet.tsx`) is approved behaviour. It changes only under
  decision 1 of the proposal (the cloud prompt carries the owner's answer).
- **Stored data** and **privacy:** see `CLAUDE.md`.

## 5. Status corrections the next status commit must make

`PROJECT_STATUS.md` (in `f490dda`) predates the owner's 2026-10-11 and 2026-10-17 words:
- **"Not approved (2026-10-09): 48"** is out of date. Item 48 came back in scope on 2026-10-11 and is
  approved for this run. Move it to Agreed.
- **"Agreed and waiting"** lists only 11, 12 and 32. Add the recovery and readiness core, time
  intelligence, item 48, the schedule watch and the custom equipment presets.
- **The rows written for Round L's own commit** ("Latest commit … (this commit)", "Work in
  progress") become true only when Round L ships. Re-read them at that commit.
- **"Waiting for the owner's phone acceptance"** gains each round as it ships.

## 6. The owner's phone review (all YELLOW; never mark GREEN)

The exact list is `PROJECT_STATUS.md`, "Waiting for the owner's phone acceptance":
- Maintenance 30, 29, 28 and 27;
- Maintenance 25 (issue #26), which has one decision of the owner's still open: the gym barcode in
  the cloud copy. It is not the cloud session's to decide;
- Phase 8 (steps 12 to 19 on the installed app);
- the older open review issues (Maintenance 21, 17, 16, 15, 14, 11, 10, 9, 8, 5, 4).

Add every new round as it ships. When the whole approved queue is live, write **one consolidated,
shortest-possible phone review**. It closes all of these without repeating tests the owner already
passed (Maintenance 26 is GREEN). Only the owner can check:
- the real phone and the installed app's update;
- vibration and the screen staying on;
- the gym barcode;
- item 48 against their real Life Mirror check-ins.

## 7. Life Mirror (item 48)

- Everything item 48 needs from Life Mirror is in `docs/proposals/item-48-life-mirror-check-in.md`:
  the readings and their ids, scales, blocks, the day format, the synced row shape, and the missing
  and stale rules.
- **Don't attach Life Mirror's repositories to the cloud session.** Its public repository has its own
  `CLAUDE.md`, whose rules would load into this session, and an attached repository can be pushed to.
  - If a fact is truly missing, ask the owner.
  - Never use `Bill6006/life-mirror-private`.
  - Never edit, commit to or push to either repository.
  - Never read or copy Life Mirror's private fields: notes, day context, extras.
- **Tests** use synthetic Life Mirror rows in the fake cloud (`src/test/fakeCloud.ts`). The fake must
  refuse what the live table refuses (`body` NOT NULL; deletions carry `'{}'`).
- The disclosure line in Life Mirror is Life Mirror's own workstream. Name it as pending in the final
  report; don't make it.

## 8. Secrets and connections

| Capability | Needed in the cloud? | Secret or variable | How to tell it is missing |
|---|---|---|---|
| Install, lint, type check, unit, build, privacy scan, e2e | No secret | none | n/a |
| Push a branch or `main` | The cloud session's GitHub access to this repository | none in the repo (the session's own connection) | `git push --dry-run origin HEAD` fails with an auth error or 403: stop and report |
| Deploy | No secret: `pages.yml` deploys on a push to `main` with the workflow's own token | none | the Deploy Pages run fails: read its log |
| Watch Actions runs | Optional | the session's GitHub connection. In cloud sessions `gh pr` and `gh issue` (GraphQL) are refused; use REST, `gh api repos/Bill6006/Workout-Conductor-Rebuild-v4/actions/runs?branch=main&per_page=3` | the call fails: poll the live marker with `curl` instead |
| Live checks (marker, live suite) | Network access to `bill6006.github.io`, which the default "Trusted" network level does **not** allow | none | `curl -sI https://bill6006.github.io/Workout-Conductor-Rebuild-v4/` answers 403 with `x-deny-reason: host_not_allowed`: ask the owner to allow the host (section 9). Never report a live check as passed without it |
| The owner's Turso database (cloud copy, item 48) | **Never in the cloud.** The token lives only on the owner's phone, in the app's IndexedDB | **none: never create a `TURSO_*` variable, never ask for the token** | n/a: every cloud-copy and item 48 test runs on `src/test/fakeCloud.ts` |
| PubMed checks for research | Optional network access to `eutils.ncbi.nlm.nih.gov` | none (no API key needed at this rate) | `curl` fails: use web search if available, or mark the claim unverified |

## 9. The cloud environment

From Claude Code's cloud documentation as read on 2026-10-17. Probe anything that matters rather
than trusting this list.

- **Machine:** Ubuntu 24.04 on x86_64, about 4 vCPU and 16 GB of memory. Node 22 is preinstalled and
  on PATH (`.nvmrc` asks for 22). Run `npm ci`.
- **Network.** The default level, "Trusted", allows package registries and GitHub (GitHub goes
  through its own proxy at every level). It does not allow:
  - `bill6006.github.io`: the live marker and the live suite;
  - the Playwright browser download (`cdn.playwright.dev`, `playwright.download.prss.microsoft.com`,
    `playwright.azureedge.net`): local e2e;
  - `eutils.ncbi.nlm.nih.gov`: PubMed checks.

  The owner allows them in the environment's settings: Network access → Custom, with those hosts
  listed and "Also include default list of common package managers" ticked. A blocked request
  answers 403 with `x-deny-reason: host_not_allowed`.
- **Playwright.** Run `npx playwright install --with-deps chromium`. If the download stays blocked,
  push to a non-`main` branch: CI runs the whole check, e2e included, without deploying.
- **Command time limits.** A foreground command times out after 2 minutes by default, 10 at most.
  Run `npm run verify`, the unit suite and every revert table in the background, with output to a
  log file, and read the log. Split M26 `--all` (1199 entries, hours) by name prefixes, and use
  `--resume=`.
- **Idle and reclaim.** The machine pauses after a few idle minutes and can be replaced. Background
  work and uncommitted changes don't survive a replacement. Commit work in progress at each step and
  push it to the working branch, never to `main` before it ships. Each push costs a CI run, and on
  `main` a deploy, so batch them sensibly.
- **Time zones:** the machine may run in UTC. Local-day rules are covered by
  `node scripts/test-zones.mjs`, part of `npm run test:unit`.
- **Load:** heavy suites can pass their 15 s time-outs under parallel load, all the more on 4 vCPU.
  Read the error text before calling a test red, and run verify and the revert runs one at a time.
- **Not available in the cloud:**
  - the owner's phone, the installed app, real data and the gym barcode;
  - the local scratchpad (raw abstracts, logs);
  - the local memory notes. This file and `CLAUDE.md` replace them.
- **The Windows-only notes don't apply:** the push's TLS setting, directory junctions, CRLF.

## 10. Where things are

- **Status:** `PROJECT_STATUS.md`. **Rounds:** `docs/reports/maintenance-NN.md` (Review, Known
  limits, Proposed, The complete revert run, Verification, Review on the phone).
- **Engine and data docs:** `docs/workout-engine.md`, `docs/data-model.md`,
  `docs/progression-engine.md`, `docs/recalibration-engine.md`, `docs/cloud-copy.md`,
  `docs/privacy-rules.md`.
- **Round L code:**
  - `src/engine/workoutGenerator/loadedVersions.ts` (`LOADED_VERSIONS`, `ADDS_TO_BODYWEIGHT`,
    `loadsNow`, `loadedVersionShift`, `outgrownMoves`);
  - `src/engine/loading/loading.ts` (`comesBothWays`, `bothWaysMachines`, `machinePlatesFor`,
    `handWeightsAt`, `describeSpec`);
  - `src/engine/plateMath/plateMath.ts`;
  - `src/core/state/appStore.ts` (`afterPlaceWrites`, `writePlace`, `saveLoadings`, `saveLocation`,
    `deleteLocation`);
  - `src/features/profile/useProfileEditor.ts`;
  - `src/features/settings/PlaceWeights.tsx`;
  - `src/features/workout/LoadingEditor.tsx`, `EntryPanels.tsx`, `ActiveWorkoutScreen.tsx`;
  - `src/engine/workoutGenerator/generate.ts`;
  - `src/engine/coach/coachConductor.ts`.
- **Round L tests:**
  - `loadedVersions.test.ts`, `swapTakesLoaded.test.ts`, `machinePlates.test.ts`,
    `placeWrites.test.ts`, `calfFewerReps.test.ts`, `fewerRepsLoaded.test.ts`;
  - `weightsTab.test.tsx`, `machinePlates.screens.test.tsx`, `customCableSwitch.test.tsx`;
  - `e2e/roundL.spec.ts`.
- **This handoff:**
  - `docs/handoff/` (this file, `round-l-commit-message.txt`, `round-m-design-notes.md`,
    `recheck4/`);
  - `docs/proposals/`;
  - the six research reports added to `docs/research/`;
  - `tools/reverts/`.

## 11. Lessons this project paid for

- **The re-check:** re-check a review's fixes until a pass finds nothing new. Each fix is tested
  against its own revert.
- **A green baseline:** a revert's kill means nothing if its test already failed. Run the tests
  green first.
- **Old tests:** a new rule can blind an old test. That is why the earlier rounds' tables run again
  on every round's code.
- **Proving a test:** a test passing without its fix proves nothing. Make it fail without the fix
  (Round L's race test holds the save's second `getDatabase` call 50 ms to do so).
- **jsdom timing:** jsdom delivers `popstate` before the app's next timer, unlike a phone. Tests of
  the Back button hold the step back (Round K's 14m).
- **Async state:** an `await` inside a state literal goes stale. Gather the async reads first, then
  build the literal synchronously.
- **Strict fakes:** a fake store must be as strict as the live one. A fake once took a NULL body the
  live table refused, and uploads stopped for ten hours.
- **Stored data:** a stored schema must share the engine's lists, never a copy. Never overwrite a
  record that fails to parse.
- **Time zones:** a UTC runner can't see a local-day rule; `test-zones.mjs` exists for that. A
  snapshot of local times breaks on the UTC runner.
- **Snapshots:** a renamed `describe` writes new snapshots silently. Run `vitest --ci` or diff them
  before trusting the green.
- **Git:** a `git rm` stays staged into the next commit. Commit docs with explicit paths.
- **Exit codes:** a pipeline's exit code is the last stage's. Read the summary line and its counts,
  not the exit code of `… | tail`.
- **Before shipping:** open every screenshot or capture, and read the live text with real-shaped
  data.
