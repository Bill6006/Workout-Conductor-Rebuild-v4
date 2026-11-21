"""The final polish (the owner, 2026-11-02, outside the rounds): Why this workout never names a
lift swapped out to lead, and Settings' "Learned from your log" row names every section of the page
it opens. Revert each part alone, run its tests, expect a failure, restore. Prints KILLED (a test
failed) or SURVIVED (every test still passed).

  python mutate-final-polish.py --repo=PATH            run every entry in a copy of the repository
  python mutate-final-polish.py --repo=PATH O1 L3      run the entries whose names start with these
  python mutate-final-polish.py --repo=PATH --check    only check that every anchor is found once

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

ORDER = "src/engine/workoutGenerator/orderLines.ts"
RECAL = "src/engine/recalibration/recalibrate.ts"
CARD = "src/features/today/WorkoutPreviewCard.tsx"
LEARNED = "src/engine/learned/learned.ts"
SETTINGS = "src/features/settings/SettingsScreen.tsx"

T_ORDER = "src/engine/workoutGenerator/orderLines.test.ts"
T_STORE = "src/core/state/whyAfterSwap.store.test.ts"
T_SCREENS = "src/features/today/whyAfterSwap.screens.test.tsx"
T_LEARNED = "src/engine/learned/learned.test.ts"
T_ROW = "src/features/settings/learnedSummary.screens.test.tsx"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # Why this workout never names a lift swapped out to lead (the owner, 2026-11-02).
    ("O1 the main lift's line names the lift in its place", ORDER,
     "      if (main && !reasons.some((other) => mainLiftName(other) === nameOf(main))) {\n"
     "        return [mainLiftLine(nameOf(main), main.role, main === first)];\n      }\n",
     "", [T_ORDER, T_STORE, T_SCREENS], None),
    ("O2 ... and goes from the screen with a lift taken out where no lift has its role", ORDER,
     "      return stopped || saved ? [line] : [];\n", "      return [line];\n", [T_ORDER], None),
    ("O3 ... never a second line on one lift", ORDER,
     " && !reasons.some((other) => mainLiftName(other) === nameOf(main))", "", [T_ORDER], None),
    ("O4 the main lift as a build picks it: a lift in the main lift's role", ORDER,
     "entry.role === 'primary-strength' && entry.push !== 'extra'", "entry.push !== 'extra'",
     [T_ORDER], None),
    ("O5 ... never the week's extra", ORDER,
     "entry.role === 'primary-strength' && entry.push !== 'extra'",
     "entry.role === 'primary-strength'", [T_ORDER], None),
    ("O6 the lift to push's line leaves the screen once its lift is swapped out or stopped", ORDER,
     "    return saved ? [line] : [];\n", "    return [line];\n", [T_ORDER, T_SCREENS], None),
    ("O7 every change's lines read from the plan it leaves", RECAL,
     "  const reasons = withOrderLines(workout.explanation.reasons, workout.blocks, true);\n",
     "  const reasons = workout.explanation.reasons;\n", [T_STORE], None),
    ("O8 the card reads them from the plan on the screen, a session saved before too", CARD,
     "    withOrderLines(workout.explanation.reasons, workout.blocks),\n",
     "    workout.explanation.reasons,\n", [T_SCREENS], None),
    # The review: a line with no lift to name stays in the plan as saved, for a swap back.
    ("O9 the plan as saved keeps a line its lift has left, for a swap back", RECAL,
     "withOrderLines(workout.explanation.reasons, workout.blocks, true)",
     "withOrderLines(workout.explanation.reasons, workout.blocks)", [T_STORE, T_ORDER], None),
    # The review: a plan built with none in the main lift's role (a catch-up, a second workout).
    ("O10 where the plan has none in the main lift's role, the line follows the first lift", ORDER,
     "      const main = STRONG_LINE.test(line) ? strong : first;\n",
     "      const main = strong;\n", [T_ORDER], None),
    ("O11 ... and a line on the main lift's role keeps to that role", ORDER,
     "      const main = STRONG_LINE.test(line) ? strong : first;\n",
     "      const main = first;\n", [T_ORDER], None),
    # Settings' learned row names every section of the page it opens.
    ("L1 the row's summary is read from the page's own list", SETTINGS,
     "                summary={learnedSummary()}\n",
     "                summary=\"Your habit, each lift's curve, how you judge reserve, pain patterns and offers declined, each with a reset\"\n",
     [T_ROW], None),
    ("L2 ... Your pace in it, for the page and the row", LEARNED,
     "  { name: 'pace', section: paceSection },\n", "", [T_LEARNED, T_ROW], None),
    ("L3 ... every name, the first two too", LEARNED,
     "names.slice(0, -1).join(', ')", "names.slice(2, -1).join(', ')", [T_LEARNED, T_ROW], None),
    ("L4 ... and the last", LEARNED,
     " and ${names.at(-1) ?? ''}`", "`", [T_LEARNED, T_ROW], None),
    ("L5 ... capitalised", LEARNED,
     "${list.charAt(0).toUpperCase()}${list.slice(1)}", "${list}", [T_LEARNED, T_ROW], None),
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
