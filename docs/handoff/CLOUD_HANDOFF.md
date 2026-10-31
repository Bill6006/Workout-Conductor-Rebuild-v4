# Cloud handoff: Workout Conductor v4

_Prepared 2026-10-17 on the owner's request, from the local machine's state. Read `CLAUDE.md`
first; it holds the rules. This file holds the state and the steps._

## 1. The exact stopping point

### Later on 2026-10-31, from the owner's machine (supersedes the states below)

On the owner's word ("Begin Maintenance 34 and then continue through the remaining approved
Workout Conductor work ... For EACH chunk: reconcile against current main; build it; test it; run one
bounded adversarial review; fix genuine findings; complete/re-anchor its revert coverage; run full
local verification and browser tests; get CI green; deploy it live; verify the live build; update
the reports/status; then move to the next approved chunk"). Two of the owner's reports came
first:

- **Live: `73ddfff`, the harder-variation fix** (`docs/reports/harder-variation-fix.md`): Deploy
  Pages run 41198579203; the live marker reads `73ddfff`. Live suite from the owner's machine: 438 passed + 19 skipped by design; one storage test on the 360 px phone failed once on a navigation race and passed 3 of 3 alone.
- **Next, the catch-up decision** (the owner: the app chooses the day's one workout; no Full session,
  Catch-up instead or Go easy instead on Today): built, reviewed, reverted and verified on the local
  branch `local/catch-up-decision`; its report waits at `docs/reports/catch-up-decision.md` with it.
- **Then Maintenance 34** (time intelligence), built on the local branch `local/m34-wip` (never
  pushed: work in progress), then item 48, the schedule watch, custom equipment presets, and the
  final reconciliation with one consolidated phone review.
- **Custom equipment presets, as the owner defined them (2026-10-31):** Home and Full gym stay built
  in and protected (no rename, no delete); unlimited custom presets, each a name and any combination
  of supported equipment, shown beside Home and Full gym when a place is set up or edited, and
  renamed, edited or deleted freely; a preset is a template: applying it copies its equipment into
  the place, and a later edit or delete never changes a place that used it; presets persist and sync
  by the same safe path as the rest; every place keeps its own weights, pin stack or plates, and
  linked machines.

### Shipped from the owner's machine, 2026-10-31 (superseded)

On the owner's word (2026-10-30) the local builder took over Rounds M and N and Maintenance 33
from the cloud session. Their saved patches (`round-m/n/o.diff` on
`claude/workout-conductor-round-l-26i4o9` at `c683a87`, a branch nothing here changed) were made
commits on `main` as it stood (`068413e`, with the install button and the fourth artwork's icons),
in that order, then given the ship gate the owner set:

- one fresh adversarial review of each round, every finding fixed with tests (each report's "fresh
  review before shipping");
- every revert table re-anchored and run on the final code, every entry caught (Maintenance 31's
  report, "The complete revert run");
- the complete `npm run verify`, the browser suite with its clip tests among it, and the browser
  suite in UTC on a day the schedule does not tick, as CI meets it; CI green on the branch
  `local/rounds-m-n-33`;
- then `main` fast-forwarded to it, deployed, and checked live from this machine.

State:

- **Live**: `4da3258`, deployed by Deploy Pages run 41162608914 (success); the live marker reads
  `4da3258`, and the live suite is in `PROJECT_STATUS.md`.
- **Maintenance 34 is not started on `main`.** Its work so far is only the cloud branch's
  `docs/handoff/round-p-wip/round-p.diff` (local `7f06db9` there, paused on the owner's word). It
  applies with `git apply --3way` onto the new `main`, with one conflict in
  `src/engine/planning/weekModel.ts`: Round M's fresh review gave the week model the coach focus
  and the lasting swaps (F1), beside Maintenance 34's own lines there. Do not start or continue it
  until the owner confirms Rounds M and N and Maintenance 33 live and says to go on.
- **The cloud branch's three reviews** (Round M's twenty-eighth, Round N's seventeenth, Maintenance
  33's sixth) were not run again: the owner's gate replaced them with one fresh review per round.
- **Seen on the way, written up as known limits** in Maintenance 31's report: the week model reads
  no deload week; and "Uncomfortable" on a lift whose muscles have one set left only through a set
  added by hand says no comfortable alternative fits, where the reason is the muscles' sets.

### Resumed on the owner's word, 2026-10-17 (superseded)

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
  `docs/handoff/round-m-wip/round-m.diff`, left out of `main`, is one diff against `11ef050`, whose
  `src/` is the same as `main` after the squash. Apply it with `git apply` on `main`. It holds the code, its tests, the report draft, its revert table (72 entries), the
  first review's 23 failing tests in `src/review-m31/`, and part one of their fixes.
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
  - Left to fix, in the worktree since: S1 and S1b (a profile save re-reads the day's offer), C1
    (no coach offer adds work off plan), R4 (no swap brings in a resting muscle's lift), T1 (the
    day note when only remainders went in), S6 (the line on a day not ticked with no catch-up).
  - Then: update the M31 table (anchors moved, an entry for each fix) and run it with `--utc`; a
    second review pass until clean; the browser suite; verify; ship.

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
