"""The harder-variation fix's mutation checks (2026-10-31, outside the rounds): revert each part of
the fix alone, run its tests, expect a failure, restore. Prints KILLED (a test failed) or SURVIVED
(every test still passed).

  python mutate-harder-variation.py --repo=PATH            run every entry in a copy of the repository
  python mutate-harder-variation.py --repo=PATH H1 H3      run the entries whose names start with these
  python mutate-harder-variation.py --repo=PATH --check    only check that every anchor is found once

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

COACH = "src/engine/coach/coachConductor.ts"
LIST = "src/engine/alternatives/entryAlternatives.ts"

T_HARDER = "src/engine/coach/coachConductor.harderVariation.test.ts"
T_LOADING = "src/engine/coach/coachConductor.loading.test.ts"
T_SCREEN = "src/features/today/harderVariation.screens.test.tsx"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # The coach offers a harder variation only where the lift's sheet lists one.
    ("H1 the button only where the sheet has a harder variation", COACH,
     "      const harder =\n        !repsAtCeiling &&\n        block !== undefined &&\n",
     "      const harder =\n        !repsAtCeiling &&\n        true ||\n        block !== undefined &&\n",
     [T_HARDER, T_SCREEN], None),
    ("H2 no card at all with no lever to offer", COACH,
     "      if (repsAtCeiling || harder) {", "      if (true) {", [T_HARDER, T_SCREEN], None),
    ("H3 a variation is the same movement", LIST,
     "      candidate.exercise.movementPattern === current.movementPattern &&\n", "", [T_HARDER], None),
    ("H4 harder: heavier per pound than the lift", LIST,
     "      ratio < cap.currentRatio - 1e-6", "      ratio !== cap.currentRatio", [T_HARDER], None),
    ("H5 only for a lift held at the heaviest weight here", LIST,
     "  if (!entry.progression?.capped) return undefined;\n", "", [T_HARDER], None),
    ("H6 the sheet ranks harder variations first for a held lift", LIST,
     "        ...(cap ? { capLimited: cap } : {}),\n", "", [T_HARDER, T_SCREEN], None),
    ("H7 the coach reads the sheet's own list: the day's pain and place", COACH,
     "          constraints: input.constraints,\n          completed: input.completed,\n          history: input.history,\n          now: input.now,\n          ...(input.routes ? { coachRoutes: input.routes } : {}),\n        }).length > 0;",
     "          constraints: { ...input.constraints, avoidExerciseIds: [], painJoints: [] },\n          completed: input.completed,\n          history: input.history,\n          now: input.now,\n          ...(input.routes ? { coachRoutes: input.routes } : {}),\n        }).length > 0;",
     [T_HARDER], None),
    ("H8 the coach reads the place the plan trains at", COACH,
     "          profile: input.profile,\n          location: input.location,\n          workout: input.workout,\n          block,\n",
     "          profile: input.profile,\n          location: undefined,\n          workout: input.workout,\n          block,\n",
     [T_HARDER, T_LOADING], None),
    ("H9 the list leaves out what today's plan has already", LIST,
     "          (other) => other.id !== entry.id && !stoppedBefore(workout.blocks, entry).includes(other),",
     "          (other) => false,", [T_HARDER], None),
    ("H10 the reps at the top read so, sets set by hand too", COACH,
     "            atCeiling\n              ? 'The reps are already at the top of the range.'\n",
     "            repsAtCeiling\n              ? 'The reps are already at the top of the range.'\n",
     [T_HARDER], None),
    ("H11 the set is offered at the top of the reps", COACH,
     "      const repsAtCeiling = atCeiling && !entry.manual?.sets;",
     "      const repsAtCeiling = false;", [T_HARDER, T_LOADING], None),
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
