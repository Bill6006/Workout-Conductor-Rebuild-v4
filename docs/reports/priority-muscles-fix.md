# "Priority muscles today" names today's muscles (2026-11-01)

Fixed on 2026-11-01 on the owner's word, outside the rounds and after Maintenance 38. YELLOW:
waiting for the owner's phone review, like every round since 2026-10-11.

## The report

**Seen in passing** in Maintenance 38's phone steps: on a lower day, "Why this workout" said
"Priority muscles today: Biceps: goal priority, not trained yet this cycle, 0 of 13 weekly sets;
Triceps: ...; Chest: ...", and the chips under the day's title read Biceps, Triceps, Chest, Front
delts. The day trained none of them.

**The owner asked** whether that was intended (the weekly catch-up, time intelligence) or the week's
top priorities shown whatever the session trains, and what the label meant. The answer: the second.
The line came with the generator in Phase 3 (2026-09-03), as the evidence for the day's session,
which was then picked from the same ranking: every muscle by its goal weight, how fresh it is and
how far it is from its weekly sets. Even then the session with the top muscles could lose to the
rotation, and since then the split's order, a session kept through a rebuild, and a catch-up or a
second workout pick it too. The catch-up and time intelligence never fed the line. On a new
profile with bigger arms as a goal, the biceps and triceps lead at 2.43 and eight muscles tie at
2.1, the tie broken by the alphabet: the chest and the front delts were on the lower day's line and
chips by name alone, beside quads that scored the same.

**The owner, 2026-11-01:** "I approve that fix": the line and the chips name only the muscles
today's session trains, in the week's own order.

## The fix

- **One rule:** `src/engine/workout/todaysPriorities.ts`, `prioritiesToday`. Today's priority
  muscles are the week's ranking kept to the muscles a lift in the plan works directly, with a
  working set: a muscle a lift only touches (the biceps in a row) is not one; a stopped lift's
  logged sets are; a lift with its ramp sets alone is not yet. The ranking itself is unchanged and
  still goes with the plan whole (`musclePriorities`): it picks the day's session where nothing
  else does, ranks the lifts a short session cuts first, and places the drop set.
- **The line:** the first three of today's, as before in its words; none on a plan with nothing in
  it (a catch-up emptied and laid out again).
- **After a change:** every change on Today goes through the engine's `refresh`, which now writes
  the line again from the plan as the change leaves it, as the catch-up's and the main lift's lines
  are: a lift skipped takes its muscles off once no lift left trains them, and a line that comes
  back goes before the place's line.
- **The chips and the line on Today:** read from the plan and the day's log on the screen (the
  review, below): today's first four, and the line's first three.
- **Plan** keeps the week's view under its own name, "Priority this week".

## Tests

- `src/engine/workout/todaysPriorities.test.ts`: on a new profile's lower day, the line names the
  glutes, hamstrings and quads, and the chips add the abs, while the week's ranking leads with the
  biceps and triceps; an upper day still leads with them; a row names the lats and the upper back,
  never the biceps it only touches; ramp sets alone name nothing, nor a lift this copy does not
  know; an emptied plan has no line; the line's place on a change.
- `src/core/state/priorityMusclesToday.store.test.ts`: on Maintenance 38's lower Monday, the
  hamstring lifts skipped one by one take the hamstrings off the line and the chips.
- `src/features/today/WorkoutPreviewCard.test.tsx`: the chips on a lower day; a plan holding the
  old line shows today's, beside chips that agree; sets skipped take the hamstrings off both.
- `src/features/today/priorityMusclesToday.screens.test.tsx`: on Today, under way, every set of the
  hamstring lifts skipped takes them off the chips and the line.
- `src/engine/workout/todaysPriorities.test.ts`, with the day's log: a set skipped trains nothing,
  a set logged does, and a lift stopped whose logged set was taken back trains nothing.

## Review

One bounded adversarial review read the first build with probes: two MEDIUM and three LOW, all
fixed.

1. **MEDIUM, a copy saved:** a copy leaves out a lift stopped at its logged sets but kept the line
   that counted it. Loaded, its line named the biceps (a chin-up stopped after one set, its sets
   given to a lat pulldown) while its chips did not.
2. **MEDIUM, copies saved before the fix:** loaded, they showed the week's top three on a lower day
   again, the very line the owner asked to fix.
3. **LOW, a session stored before the fix:** on the day of the update, its old line stood until a
   change.
4. **LOW, the day's log:** the rule read the plan's sets, not the log. The hamstring lifts skipped
   once the workout began still named the hamstrings, and so did a lift stopped whose logged set
   was taken back.
5. **LOW, a revert entry:** M31's H28 had lost its anchor to the line it reverts. It is
   re-anchored, and caught.

**The fix for 1 to 4:** what the lifter sees is read on the screen. Today's card reads the line and
the chips alike from the plan and the day's log in front of it, whatever text a copy, a stored
session or a change left in the plan. With the log, a working set trains where it was logged, or
where it is still to come on a lift that goes on: never a set skipped, nor one a stopped lift will
not do. The plan's own line is still written at generation and after each change, for the plan
as a record; nothing else reads it.

## Reverts

`tools/reverts/mutate-priority-muscles.py`: 21 entries, each the revert of one part alone, all
caught: 13 for the first build, 8 for the review's fixes. Of the earlier tables, the entries on or
near the lines it changed, or running a test file it changed: M25 and M26's 8, M29's 4, M31's G10
and H28, and M38's G3, all caught. H28 and M25's 39i (through M26's `REANCHORED`) moved with the
lines they revert. Every runner finds every anchor.

## Verification

- `npm run verify` on the final code: lint, type check, unit tests (3997 passed + 5 skipped
  by design, 661 files, and the day rules in two more zones), the build, the privacy
  scan, verify-build, and the browser suite (443 passed + 14 skipped by design). The unit
  tests again in UTC: 3997 passed + 5 skipped by design.
- The phone steps below, walked as written by a scratch spec on a local build, at 412 and 360 px.
- CI on the branch, run 41309376641: green.
- Deploy Pages run 41311081269: the live marker reads `e3f7acf`. The live suite from the
  owner's machine: 438 passed + 19 skipped by design, none failed. The phone steps on the live build: passed at 412 and 360 px.

## Review on the phone

In a Chrome Incognito tab at the live URL, tap **Use defaults and skip setup**, then, as for
Maintenance 38, Settings, **Schedule**: 3 sessions a week, ticked on today and every other day
after it, every other day off.

1. **Today**: the lower day. The chips under its title read Glutes, Hamstrings, Quads, Abs. Under
   **Why this workout**: "Priority muscles today: Glutes: ..., Hamstrings: ..., Quads: ...", and no
   biceps or triceps.
2. **Plan**, **Priority this week**: the biceps and the triceps, as before.

Close the Incognito tab: everything in it goes.
