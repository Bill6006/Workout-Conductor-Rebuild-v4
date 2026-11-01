"""The cross-place report's fix (2026-11-01, outside the rounds): back in front the app reads the
time at once, and today's plan takes the place of the day before's on any tab, so a Home edit never
seems to change the Gym's plan. Revert each part alone, run its tests, expect a failure, restore.
Prints KILLED (a test failed) or SURVIVED (every test still passed).

  python mutate-cross-place.py --repo=PATH            run every entry in a copy of the repository
  python mutate-cross-place.py --repo=PATH X1 X3      run the entries whose names start with these
  python mutate-cross-place.py --repo=PATH --check    only check that every anchor is found once

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

CLOCK = "src/core/time/clock.ts"
APP = "src/app/App.tsx"
STORE = "src/core/state/appStore.ts"

T_CLOCK = "src/core/time/clock.test.tsx"
T_DAY = "src/app/dayRefresh.screens.test.tsx"
T_HOME = "src/core/state/homeEditGymPlan.store.test.ts"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # Back in front, the time is read again at once (the owner's report of 2026-11-01).
    ("X1 the clock reads the time when the page shows again", CLOCK,
     "      document.addEventListener('visibilitychange', tick);\n", "", [T_CLOCK, T_DAY], None),
    ("X2 ... on pageshow", CLOCK,
     "      window.addEventListener('pageshow', tick);\n", "", [T_CLOCK], None),
    ("X3 ... and on focus", CLOCK,
     "      window.addEventListener('focus', tick);\n", "", [T_CLOCK], None),
    # Today's plan is the device's day's on every tab.
    ("X4 the app puts today's plan in place of the day before's on any tab", APP,
     "      <DayRefresh />\n", "", [T_DAY], None),
    ("X5 ... at the day's change", APP,
     "  }, [store, day]);\n", "  }, [store]);\n", [T_DAY], None),
    # The review: "Longer would help" is kept while today's own place holds, not every place.
    ("X6 the offer kept while the place it reads holds", STORE,
     "      this.state.coachSwitches,\n      this.currentLocation(),\n",
     "      this.state.coachSwitches,\n      this.state.locations,\n", [T_HOME], None),
    # The owner's regression guards the rule the report doubted: a place's save rebuilds today's
    # plan only where it is today's place.
    ("X7 a save of another place leaves today's plan alone", STORE,
     "      isCurrent &&\n", "      true &&\n", [T_HOME], None),
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
