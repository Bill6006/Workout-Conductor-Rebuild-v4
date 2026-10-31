"""The catch-up decision's mutation checks (2026-10-31, outside the rounds): the app chooses the
day's one workout, never the lifter. Revert each part alone, run its tests, expect a failure,
restore. Prints KILLED (a test failed) or SURVIVED (every test still passed).

  python mutate-catch-up-decision.py --repo=PATH            run every entry in a copy of the repository
  python mutate-catch-up-decision.py --repo=PATH D1 D3      run the entries whose names start with these
  python mutate-catch-up-decision.py --repo=PATH --check    only check that every anchor is found once

The table below is data: nothing in it runs.
"""
import os
import pathlib
import re
import subprocess
import sys

# The repository this runner sits in (tools/reverts/ -> the root). Run it in a copy instead, with
# --repo=PATH; see tools/reverts/README.md.
ROOT = pathlib.Path(__file__).resolve().parents[2] if "__file__" in globals() else pathlib.Path.cwd()
for _flag in sys.argv[1:]:
    if _flag.startswith("--repo="):
        ROOT = pathlib.Path(_flag.split("=", 1)[1])

NOTE = "src/features/today/dayNote.ts"
TODAY = "src/features/today/TodayScreen.tsx"
STORE = "src/core/state/appStore.ts"
PLAN = "src/features/plan/PlanScreen.tsx"

T_NOTE = "src/features/today/dayNote.test.tsx"
T_NOTE_SCREEN = "src/features/today/dayNote.screens.test.tsx"
T_CHOSEN = "src/core/state/catchUpChosen.store.test.ts"
T_CATCH_UP = "src/core/state/catchUp.store.test.ts"
T_EMPTY_SECOND = "src/core/state/emptySecondOnAnotherDay.store.test.ts"
T_EMPTY_COPY = "src/core/state/emptyCopyFullSessionWayBack.store.test.ts"
T_COPY_HOLDS = "src/core/state/copyFullSessionChoiceHolds.store.test.ts"
T_COPY_READ = "src/core/state/copyFullSessionOfferReadAgain.store.test.ts"
T_SECOND_EMPTIED = "src/features/today/secondEmptiedNote.test.ts"
T_MARKS = "src/core/state/emptyCopyEndsMark.store.test.ts"
T_CHECKED_COPY = "src/core/state/savedCopyEmptiedByCheckIn.store.test.ts"
T_PLAN_USE = "src/features/plan/savedCopyUse.screens.test.tsx"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # Today asks nothing: no button chooses the day's kind (the owner, 2026-10-31).
    ("D1 Today wires no choice of kind to the day's line", TODAY,
     "            : note\n              ? { text: note.text }\n              : null",
     "            : note\n              ? {\n                  text: note.text,\n                  actionLabel: 'Full session',\n                  onAction: () => void store.setFullSession(true),\n                }\n              : null",
     [T_NOTE_SCREEN], None),
    ("D2 a catch-up's line offers no full session", NOTE,
     "        text: `Not one of your training days: a ${session.workout.duration.estimatedMinutes}-minute catch-up for what is behind this week.`,\n      };",
     "        text: `Not one of your training days: a ${session.workout.duration.estimatedMinutes}-minute catch-up for what is behind this week.`,\n        action: { label: 'Full session', full: true },\n      } as DayNote;",
     [T_NOTE, T_CHOSEN, T_CATCH_UP], None),
    ("D3 the full session taken offers no catch-up back", NOTE,
     "    if (full) return { text: 'Not one of your training days.' };",
     "    if (full)\n      return { text: 'Not one of your training days.', action: { label: 'Catch-up instead', full: false } } as DayNote;",
     [T_CATCH_UP, T_COPY_HOLDS], None),
    ("D4 a second workout taken in full offers no easy one back", NOTE,
     "  if (full) return { text: 'You trained today.' };",
     "  if (full)\n    return { text: 'You trained today.', action: { label: 'Go easy instead', full: false } } as DayNote;",
     [T_NOTE, T_CATCH_UP], None),
    ("D5 nothing more for today offers no full session", NOTE,
     "  return { text: `You trained today${nothingBehind}: nothing more for today.` };\n}",
     "  return {\n    text: `You trained today${nothingBehind}: nothing more for today.`,\n    action: { label: 'Full session', full: true },\n  } as DayNote;\n}",
     [T_NOTE, T_SECOND_EMPTIED], None),
    # A copy with nothing to start today, the day's check-in laid on it, is never loaded: today's plan
    # stays, untouched. (D6, an early refusal of a copy with no lift, went: this one check covers it.)
    ("D7 a copy with nothing to start stands in for nothing, the day's check-in laid on", STORE,
     "    if (allEntries(checked.workout.blocks).length === 0) return 'empty';\n", "",
     [T_CHECKED_COPY, T_PLAN_USE, T_EMPTY_SECOND, T_EMPTY_COPY, T_COPY_HOLDS, T_COPY_READ, T_MARKS],
     None),
    ("D8 the Plan screen gives a copy with no exercise no Use", PLAN,
     "                  {state.session?.status === 'preview' &&\n                  allEntries(saved.workout.blocks).length > 0 ? (",
     "                  {state.session?.status === 'preview' ? (",
     [T_PLAN_USE], None),
    ("D9 ... and says today's plan stays where a copy stands in for nothing", PLAN,
     "                        else if (loaded === 'empty') {\n                          toast.show(\n                            `Nothing in \"${saved.name}\" is left for today: today's plan stays.`,\n                            'info',\n                          );\n                        }\n",
     "", [T_PLAN_USE], None),
    ("D10 ... never Loaded for a copy refused", PLAN,
     "                        if (loaded === 'loaded') toast.show(`Loaded \"${saved.name}\"`, 'success');",
     "                        if (loaded !== null) toast.show(`Loaded \"${saved.name}\"`, 'success');",
     [T_PLAN_USE], None),
]


def apply(original, old, new, nth):
    pairs = old if isinstance(old, list) else [(old, new)]
    mutated = original
    for part_old, part_new in pairs:
        count = mutated.count(part_old)
        if (nth is None and count != 1) or (nth is not None and count <= nth):
            return None, f"ANCHOR x{count}"
        at = -1
        for _ in range((nth or 0) + 1):
            at = mutated.index(part_old, at + 1)
        mutated = mutated[:at] + part_new + mutated[at + len(part_old):]
    return mutated, None


args = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
check = "--check" in sys.argv
utc = "--utc" in sys.argv
results = []
for name, rel, old, new, tests, nth in MUTATIONS:
    if args and not any(name.startswith(prefix) for prefix in args):
        continue
    path = ROOT / rel
    original = path.read_bytes().decode("utf-8")
    mutated, bad = apply(original, old, new, nth)
    if bad:
        results.append((name, bad, ""))
        print(f"{bad:9} {name}", flush=True)
        continue
    if check:
        continue
    try:
        path.write_bytes(mutated.encode("utf-8"))
        env = dict(os.environ, TZ="UTC") if utc else None
        run = subprocess.run(
            "npx vitest run " + " ".join(tests),
            shell=True, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
            env=env,
        )
        out = run.stdout + run.stderr
        summary = re.search(r"Tests\s+(.*)", out)
        line = summary.group(1).strip() if summary else "no summary (compile error?)"
        # A compile error, or a failure that is only a time-out, is no catch (as
        # mutate-install-icon.py reads it): WRONG FAILURE, to run again alone or mend.
        asserted = re.search(r"AssertionError|TestingLibraryElementError|expected .* to ", out)
        # A test file that did not load (a syntax error) is a failed file with no test failed.
        files = re.search(r"Test Files\s+(.*)", out)
        unloaded = files is not None and "failed" in files.group(1) and "failed" not in line
        wrong = (
            summary is None
            or unloaded
            or (re.search(r"Test timed out", out) is not None and not asserted)
        )
        killed = "failed" in line and not wrong
        if utc:
            # As the CI runner: the tests in UTC, then the day rules' tests in two zones.
            zones = subprocess.run(
                "node scripts/test-zones.mjs",
                shell=True, cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                errors="replace", env=env,
            )
            line = f"UTC: {line}; zones: {'failed' if zones.returncode != 0 else 'passed'}"
            zones_out = zones.stdout + zones.stderr
            zones_asserted = re.search(
                r"AssertionError|TestingLibraryElementError|expected .* to ", zones_out
            )
            if zones.returncode != 0 and not killed and not wrong:
                if zones_asserted:
                    killed = True
                else:
                    wrong = True
        verdict = "WRONG FAILURE" if wrong else "KILLED" if killed else "SURVIVED"
        results.append((name, verdict, line))
    finally:
        path.write_bytes(original.encode("utf-8"))
    print(f"{results[-1][1]:9} {name}: {results[-1][2]}", flush=True)

if check:
    print(f"anchors checked: {len(MUTATIONS)} entries, {len(results)} not found")
    sys.exit(0)
print("\n==== summary")
for name, verdict, line in results:
    print(f"{verdict:9} {name}  [{line}]")
survived = [r for r in results if r[1] != "KILLED"]
print(f"\n{len(results) - len(survived)} killed, {len(survived)} not killed")
