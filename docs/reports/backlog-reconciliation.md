# The approved backlog, reconciled

Written on 2026-10-31, step 5 of the owner's order of the same day: "5. Final reconciliation of
the approved backlog and consolidated phone review." The handoff's rule for it
(`docs/handoff/CLOUD_HANDOFF.md`, section 3): every item in its queue, every item in
`PROJECT_STATUS.md`'s "Agreed and waiting" and every item in the owner's cloud prompt must be live,
or named with the reason it is not.

**The result: every agreed item is live, and none is waiting.** The live build, `e3f7acf`,
carries all of them. Updated on 2026-11-01: the owner settled both things to settle on
2026-10-31, and the split's order is live in Maintenance 38. Every round below stays YELLOW until
the owner's one phone review
(`docs/reports/consolidated-phone-review.md`). None is GREEN without the owner's word.

## The owner's order of 2026-10-31

Two of the owner's reports came first, each built and shipped before step 1: the harder-variation
fix (`73ddfff`, Deploy Pages run 41198579203) and the catch-up decision (`1152a15`, run
41204102489). Then, each chunk was reviewed, reverted, verified and shipped live before the next:

| # | The owner's step | Built as | Live | Deploy Pages run | Report |
|---|---|---|---|---|---|
| 1 | Maintenance 34, time intelligence | Maintenance 34 | `6531357` | 41212353087 | `maintenance-34.md` |
| 2 | Life Mirror integration / Item 48 | Maintenance 35, behind a switch that stays off | `d11fe71` | 41224835430 | `maintenance-35.md` |
| 3 | Schedule Watch | Maintenance 36 | `8a4292d` | 41239957729 | `maintenance-36.md` |
| 4 | Custom equipment presets | Maintenance 37, to the owner's definition | `696d587` | 41246882231 | `maintenance-37.md` |
| 5 | Final reconciliation and consolidated phone review | This report and `consolidated-phone-review.md` | docs only | none | this file |

## The handoff's queue

Section 3 of the handoff (2026-10-17) lists seven rows. All seven are live:

| # | Round | What | Live | Report |
|---|---|---|---|---|
| 1 | M (Maintenance 31) | Items 12 (a catch-up on a day not ticked) and 32 (a second workout the same day), and the week model they need | `4da3258` | `maintenance-31.md` |
| 2 | N (Maintenance 32) | Item 11: a top set plus back-off sets | `4da3258` | `maintenance-32.md` |
| 3 | Maintenance 33 | The recovery and readiness core | `4da3258` | `maintenance-33.md` |
| 4 | Maintenance 34 | Time intelligence | `6531357` | `maintenance-34.md` |
| 5 | Maintenance 35 | Item 48: Life Mirror's check-in, read-only, behind a switch | `d11fe71` | `maintenance-35.md` |
| 6 | Maintenance 36 | The schedule watch | `8a4292d` | `maintenance-36.md` |
| 7 | Maintenance 37 | Custom equipment presets: the owner defined them on 2026-10-31 | `696d587` | `maintenance-37.md` |
| 8 | Maintenance 38 | The split's order across the days: the owner decided it on 2026-10-31 | `615d663` | `maintenance-38.md` |

Rows 1 to 3 shipped together from the owner's machine on 2026-10-31 (Deploy Pages run
41162608914). The cloud prompt's answers are kept in the reports of the rounds that build them:
the proposal's five decisions and item 11's seven questions.

## Every item agreed since 2026-10-09

| Items | Round | First live in | Gate |
|---|---|---|---|
| 40, 42 and 50 | Maintenance 26 (round H) | `43d50e6` | GREEN (the owner, 2026-10-10) |
| 43, 41, 44, 45, 46, 47 and 49 | Maintenance 27 (round I) | `8081df3` | YELLOW |
| 1, 3 and 4 | Maintenance 28 (round J) | `0eaa9c5` | YELLOW |
| 7, 8, 10 and 14 | Maintenance 29 (round K) | `dbd1726` | YELLOW |
| 6, 30 and 31 | Maintenance 30 (round L) | `0f4b9bd` | YELLOW |
| 12 and 32, with the week model | Maintenance 31 (round M) | `4da3258` | YELLOW |
| 11 | Maintenance 32 (round N) | `4da3258` | YELLOW |
| The recovery and readiness core | Maintenance 33 | `4da3258` | YELLOW |
| The install button and the launcher icon (the owner, 2026-10-24) | `install-and-launcher-icon.md` | `719af67`; the fourth artwork `f70a6c1` | YELLOW |
| The harder-variation fix (the owner, 2026-10-31) | `harder-variation-fix.md` | `73ddfff` | YELLOW |
| The app chooses the day's workout (the owner, 2026-10-31) | `catch-up-decision.md` | `1152a15` | YELLOW |
| Time intelligence | Maintenance 34 | `6531357` | YELLOW |
| 48 | Maintenance 35 | `d11fe71` | YELLOW |
| The schedule watch | Maintenance 36 | `8a4292d` | YELLOW |
| Custom equipment presets | Maintenance 37 | `696d587` | YELLOW |

Item 41 was left out of Maintenance 26. On the owner's word that day ("Then build item 41
immediately after 43"), it was built in Maintenance 27, so it is live. Item 48 was not approved on 2026-10-09,
came back in scope on 2026-10-11, and is live in Maintenance 35.

## Open items: none

Nothing agreed is waiting to be built.

## Things to settle: none

The owner settled both on 2026-10-31:

1. **Reordering the split across the days** (Maintenance 33, Questions for the owner):
   "Split reordering should NOT be an owner preference question. Use the best available research and Workout Conductor's existing recovery/readiness model to decide automatically. Keep my available training days fixed and reorder the split only when another order is meaningfully better for recovery, performance, frequency, and my goals. If no ordering is clearly better, keep the current split." Built in Maintenance 38 (`maintenance-38.md`), live in `615d663`.
2. **The gym barcode in the cloud copy** (Maintenance 25, Things to settle):
   "Keep the gym barcode phone-only. There is no need to put it in the cloud unless a future feature genuinely requires cross-device access." It stays on the phone, as it was.

**Pending outside this repository:** the disclosure line in Life Mirror for item 48. That is Life
Mirror's own workstream, and this work never edits Life Mirror.

## Proposed, not agreed, so not built

These are suggestions from the rounds' research and reviews. Each waits for the owner to ask for it:

- **Maintenance 30:**
  - a move's load at a place that does it another way (a face pull with a band at home is planned
    in pounds);
  - a loaded calf raise at home.
- **Maintenance 25:** the two storage protections, both for a later round by the owner's decision
  of 2026-10-03:
  - send a refused batch row by row;
  - keep a second copy of the unsent queue in local storage.
- **Maintenance 24 to 28:** the rest of each report's Proposed section.
- **Maintenance 34 to 37 and the catch-up decision:** each "Not taken" section gives what that round
  chose not to build, and why.

**Seen in passing while the phone review was written, and in Maintenance 38.** All three are LOW
and older than these rounds. The first two are left as they are for the owner's word; the owner
had the third fixed on 2026-11-01:

- **The summary of Settings' "Learned from your log" row** names "Your habit, each lift's curve,
  how you judge reserve, pain patterns and offers declined". It leaves out Your pace (Maintenance
  28) and Your recovery (Maintenance 33), though both are on the page it opens.
- **After a lift is swapped on Today,** Why this workout still says the lift swapped out "leads as
  the primary strength lift". The line is kept as it was once its lift is gone from the plan, so it
  then names a lift the plan no longer holds.
- **Why this workout's "Priority muscles today"** names the week's top three priorities whatever
  today's session is, so a lower day lists the biceps, the triceps and the chest (seen in
  Maintenance 38, whose orders can put a lower day where the rotation had an upper day). Fixed:
  the priority-muscles fix (`priority-muscles-fix.md`), live in `e3f7acf`.

**A correction to the handoff's list:** "Maintenance 21's Proposed 28" was built in Maintenance 22,
section 28, which is GREEN. A stopped exercise says so on Today and picks up again back at a place
that has its machine. Nothing of it is left to propose.
