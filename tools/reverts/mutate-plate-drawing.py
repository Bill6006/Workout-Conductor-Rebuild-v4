"""The plate drawing (the owner, 2026-11-20, outside the rounds): the plates and the bar as the
owner's reference draws them, measured from the picture. Revert each part alone, run its tests,
expect a failure, restore. Prints KILLED (a test failed) or SURVIVED (every test still passed).

  python mutate-plate-drawing.py --repo=PATH            run every entry in a copy of the repository
  python mutate-plate-drawing.py --repo=PATH D1 D10     run the entries whose names start with these
  python mutate-plate-drawing.py --repo=PATH --check    only check that every anchor is found once

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

LOOK = "src/components/PlateStack/plateLook.ts"
STACK = "src/components/PlateStack/PlateStack.tsx"

T_STACK = "src/components/PlateStack/PlateStack.test.tsx"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # The plates as the owner's reference draws them (2026-11-20), measured from the picture.
    ("D1 the change plates alike at 77 px, as the reference draws them", LOOK,
     "    '2.5': { height: 77, ...PLATE, ...GREEN },\n",
     "    '2.5': { height: 35, ...PLATE, ...GREEN },\n", [T_STACK], None),
    ("D2 ... the 5 the same", LOOK,
     "    '5': { height: 77, ...PLATE, ...BLUE },\n",
     "    '5': { height: 41, ...PLATE, ...BLUE },\n", [T_STACK], None),
    ("D3 the 10 lb at 112 px", LOOK,
     "    '10': { height: 112, ...PLATE, ...WHITE },\n",
     "    '10': { height: 51, ...PLATE, ...WHITE },\n", [T_STACK], None),
    ("D4 the plates above it up to 150 px, so a heavy bar keeps the card short", LOOK,
     "    '45': { height: 150, ...PLATE, ...BLUE },\n",
     "    '45': { height: 192, ...PLATE, ...BLUE },\n", [T_STACK], None),
    ("D5 a heavier plate never the shorter", LOOK,
     "    '20': { height: 150, ...PLATE, ...BLUE },\n",
     "    '20': { height: 152, ...PLATE, ...BLUE },\n", [T_STACK], None),
    ("D6 the 2.5 green, as the reference", LOOK,
     "    '2.5': { height: 77, ...PLATE, ...GREEN },\n",
     "    '2.5': { height: 77, ...PLATE, ...CHROME },\n", [T_STACK], None),
    ("D7 ... the 5 blue", LOOK,
     "    '5': { height: 77, ...PLATE, ...BLUE },\n",
     "    '5': { height: 77, ...PLATE, ...RED },\n", [T_STACK], None),
    ("D8 the reference's green, measured", LOOK,
     "const GREEN = { top: '#3f9d56', fill: '#337a3c',",
     "const GREEN = { top: '#3f9d56', fill: '#2ea55a',", [T_STACK], None),
    ("D9 a black number on the white plate", LOOK,
     "bottom: '#c7c8ca', ink: '#000000' };",
     "bottom: '#c7c8ca', ink: '#9ca3af' };", [T_STACK], None),
    ("D10 each plate lit from the top", LOOK,
     "  return `linear-gradient(180deg, ${look.top} 0%, ${look.fill} 50%, ${look.bottom} 100%)`;\n",
     "  return look.fill;\n", [T_STACK], None),
    ("D11 ... on the drawing", STACK,
     "    '--plate-fill': plateFill(look),\n", "    '--plate-fill': look.fill,\n", [T_STACK], None),
    ("D12 every plate the reference's thickness", LOOK,
     "const PLATE = { width: 34, font: 17.5 };", "const PLATE = { width: 25, font: 17.5 };",
     [T_STACK], None),
    ("D13 ... its number the reference's size", LOOK,
     "const PLATE = { width: 34, font: 17.5 };", "const PLATE = { width: 34, font: 12 };",
     [T_STACK], None),
    ("D14 the 1.25 kg wider for its longer number", LOOK,
     "    '1.25': { height: 77, width: 40, font: 15, ...CHROME },\n",
     "    '1.25': { height: 77, width: 34, font: 15, ...CHROME },\n", [T_STACK], None),
    ("D15 six of the reference's plates on the sleeve", STACK,
     "const SLEEVE_ROOM = 224;", "const SLEEVE_ROOM = 196;", [T_STACK], None),
    ("D16 the sleeve's end and the collar's hairlines kept clear, no more", STACK,
     "const SLEEVE_END = 14;", "const SLEEVE_END = 18;", [T_STACK], None),
    ("D17 the small drawing's 45 at 40 px, as tall as before", STACK,
     "const COMPACT_SCALE = 40 / 150;", "const COMPACT_SCALE = 0.3;", [T_STACK], None),
    ("D18 ... its plates a little wider than their numbers", STACK,
     "Math.round(look.width * 0.45)", "Math.round(look.width * 0.62)", [T_STACK], None),
    # The review: the 2.5 kg seen on the dark bar, every colour pinned, the room counted exactly.
    ("D19 the 2.5 kg red, as competition change plates are", LOOK,
     "    '2.5': { height: 77, ...PLATE, ...RED },\n",
     "    '2.5': { height: 77, ...PLATE, ...CHROME },\n", [T_STACK], None),
    ("D20 the 35 lb yellow", LOOK,
     "    '35': { height: 140, ...PLATE, ...YELLOW },\n",
     "    '35': { height: 140, ...PLATE, ...GREEN },\n", [T_STACK], None),
    ("D21 a hairline between each two plates, not after the last", STACK,
     "    Math.max(0, perSide.length - 1);\n", "    perSide.length;\n", [T_STACK], None),
    ("D22 the bar's weight and its least ends kept clear of the plates", STACK,
     "collar.offsetWidth - (weight.offsetWidth + BAR_ENDS);",
     "collar.offsetWidth - weight.offsetWidth;", [T_STACK], None),
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
