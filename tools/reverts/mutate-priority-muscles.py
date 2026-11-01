"""The priority-muscles fix's mutation checks (2026-11-01, outside the rounds): "Priority muscles
today" and Today's chips name only the muscles today's session trains, in the week's order. Revert
each part alone, run its tests, expect a failure, restore. Prints KILLED (a test failed) or
SURVIVED (every test still passed).

  python mutate-priority-muscles.py --repo=PATH            run every entry in a copy of the repository
  python mutate-priority-muscles.py --repo=PATH P1 P3      run the entries whose names start with these
  python mutate-priority-muscles.py --repo=PATH --check    only check that every anchor is found once

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

HELPER = "src/engine/workout/todaysPriorities.ts"
GEN = "src/engine/workoutGenerator/generate.ts"
RECAL = "src/engine/recalibration/recalibrate.ts"
CARD = "src/features/today/WorkoutPreviewCard.tsx"
TODAY = "src/features/today/TodayScreen.tsx"

T_HELPER = "src/engine/workout/todaysPriorities.test.ts"
T_STORE = "src/core/state/priorityMusclesToday.store.test.ts"
T_CARD = "src/features/today/WorkoutPreviewCard.test.tsx"
T_SCREENS = "src/features/today/priorityMusclesToday.screens.test.tsx"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # Today's priority muscles are the week's ranking kept to the muscles today's session trains
    # (the owner, 2026-11-01).
    ("P1 today's are the muscles today's session trains", HELPER,
     "  return priorities.filter((priority) => trained.has(priority.muscle));\n",
     "  return [...priorities];\n", [T_HELPER, T_STORE, T_CARD], None),
    ("P2 ... with a working set", HELPER,
     "      if (set.kind !== 'working') return false;\n", "", [T_HELPER], None),
    ("P3 ... worked directly, never only touched", HELPER,
     "getExercise(entry.exerciseId)?.primaryMuscles ?? []",
     "[...(getExercise(entry.exerciseId)?.primaryMuscles ?? []), ...(getExercise(entry.exerciseId)?.secondaryMuscles ?? [])]",
     [T_HELPER], None),
    ("P4 ... a lift this copy does not know names none, and breaks nothing", HELPER,
     "getExercise(entry.exerciseId)?.primaryMuscles ?? []",
     "getExercise(entry.exerciseId)!.primaryMuscles", [T_HELPER], None),
    ("P5 the line names the first three", HELPER,
     "  const today = prioritiesToday(priorities, blocks, log).slice(0, 3);\n",
     "  const today = prioritiesToday(priorities, blocks, log).slice(0, 4);\n", [T_HELPER], None),
    ("P6 ... and none where the plan trains no muscle", HELPER,
     "  return today.length > 0\n", "  return today.length >= 0\n", [T_HELPER], None),
    ("P7 the generator writes today's line", GEN,
     "  const prioritiesLine = priorityLine(priorities, blocks);\n",
     "  const prioritiesLine = `Priority muscles today: ${priorities.slice(0, 3).map((priority) => priority.reason).join('; ')}.`;\n",
     [T_HELPER, T_CARD], None),
    ("P8 ... and none where it trains no muscle", GEN,
     "    ...(prioritiesLine ? [prioritiesLine] : []),\n", "    prioritiesLine as string,\n",
     [T_HELPER], None),
    ("P9 a change leaves the line as it leaves the plan", RECAL,
     "    reasons: withPriorityLine(\n"
     "      offPlan ? withCatchUpLines(reasons, spec, workout.blocks) : reasons,\n"
     "      priorityLine(workout.musclePriorities, workout.blocks),\n    ),\n",
     "    reasons: offPlan ? withCatchUpLines(reasons, spec, workout.blocks) : reasons,\n",
     [T_STORE], None),
    ("P10 ... in place of the line before", HELPER,
     "      : reasons.map((reason, index) => (index === at ? line : reason));\n",
     "      : [...reasons.filter((_, index) => index !== at), line];\n", [T_HELPER], None),
    ("P11 ... none where the plan trains no muscle now", HELPER,
     "      ? reasons.filter((_, index) => index !== at)\n", "      ? [...reasons]\n",
     [T_HELPER], None),
    ("P12 ... and before the place's line where there was none", HELPER,
     "  const before = place < 0 ? reasons.length : place;\n",
     "  const before = reasons.length;\n", [T_HELPER], None),
    ("P13 the chips name today's", CARD,
     "        {priorities.slice(0, 4).map((priority) => (\n",
     "        {workout.musclePriorities.slice(0, 4).map((priority) => (\n", [T_CARD], None),
    # The review: what the lifter sees is read from the plan and the log on the screen.
    ("P14 the card's line read from the plan on the screen, never the text saved", CARD,
     "  const reasons = withPriorityLine(\n    workout.explanation.reasons,\n"
     "    priorityLine(workout.musclePriorities, workout.blocks, log),\n  );\n",
     "  const reasons = workout.explanation.reasons;\n", [T_CARD, T_SCREENS], None),
    ("P15 the chips read with the day's log", CARD,
     "  const priorities = prioritiesToday(workout.musclePriorities, workout.blocks, log);\n",
     "  const priorities = prioritiesToday(workout.musclePriorities, workout.blocks);\n",
     [T_CARD, T_SCREENS], None),
    ("P16 ... and the line", CARD,
     "    priorityLine(workout.musclePriorities, workout.blocks, log),\n",
     "    priorityLine(workout.musclePriorities, workout.blocks),\n", [T_CARD, T_SCREENS], None),
    ("P17 Today hands the card the sets done or skipped", TODAY,
     "        done={done}\n", "", [T_SCREENS], None),
    ("P18 a set skipped trains nothing", HELPER,
     "(!log.done.has(key) && entry.stopped === undefined)",
     "(entry.stopped === undefined)", [T_HELPER, T_CARD, T_SCREENS], None),
    ("P19 ... nor one a stopped lift will not do", HELPER,
     "(!log.done.has(key) && entry.stopped === undefined)", "(!log.done.has(key))",
     [T_HELPER], None),
    ("P20 ... a set logged trains", HELPER,
     "      return log.logged.has(key) || (", "      return (", [T_HELPER], None),
    ("P21 ... and without a log, every working set", HELPER,
     "      if (!log) return true;\n", "      if (!log) return false;\n",
     [T_HELPER, T_STORE, T_CARD], None),
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
