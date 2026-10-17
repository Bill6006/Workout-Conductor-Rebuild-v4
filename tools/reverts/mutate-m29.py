"""Maintenance 29 mutation checks: revert each round K rule alone, run its tests, expect a failure,
restore. Prints KILLED (a test failed) or SURVIVED (every test still passed).

  python mutate-m29.py --repo=PATH            run every M29 entry in a copy of the repository
  python mutate-m29.py --repo=PATH 7a 14b     run the entries whose names start with these
  python mutate-m29.py --repo=PATH --check    only check that every anchor is found once
  python mutate-m29.py --repo=PATH --utc ...  as the CI runner: the tests in UTC, then the day
                                              rules' tests in two zones (scripts/test-zones.mjs)

The table below is data: nothing in it runs.
"""
import os
import pathlib
import re
import subprocess
import sys

# The repository this runner sits in (tools/reverts/ -> the root). Run it in a copy instead:
# from M26 on, --repo=PATH; see tools/reverts/README.md.
ROOT = pathlib.Path(__file__).resolve().parents[2] if "__file__" in globals() else pathlib.Path.cwd()
for _flag in sys.argv[1:]:
    if _flag.startswith("--repo="):
        ROOT = pathlib.Path(_flag.split("=", 1)[1])

ALERTS = "src/core/alerts/useWorkoutAlerts.ts"
BUZZ = "src/core/alerts/restBuzz.ts"
SETTINGS = "src/features/settings/AlertsCard.tsx"
APP = "src/app/App.tsx"
PREVIEW = "src/features/today/WorkoutPreviewCard.tsx"
SHEET = "src/components/Sheet/Sheet.tsx"
BACK = "src/components/Sheet/useBackCloses.ts"
OVERLAY = "src/features/barcode/BarcodeOverlay.tsx"
REST_TIMER = "src/components/RestTimer/RestTimer.tsx"

T_ALERTS = "src/core/alerts/useWorkoutAlerts.test.tsx"
T_BUZZ = "src/core/alerts/restBuzz.test.ts"
T_SETTINGS = "src/features/settings/AlertsCard.test.tsx"
T_WAKE = "src/app/wakeLock.test.tsx"
T_PREVIEW = "src/features/today/WorkoutPreviewCard.test.tsx"
T_APP = "src/app/App.test.tsx"
T_BACK = "src/components/Sheet/backCloses.test.tsx"
T_BARCODE = "src/features/barcode/BarcodeOverlay.test.tsx"
T_REST_TIMER = "src/components/RestTimer/RestTimer.test.tsx"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # Item 7: vibration alongside the rest sounds, one switch for both.
    ("7a the rest's buzzes are laid with its sounds", ALERTS,
     "        restBuzz.schedule(endsAt, remaining);\n", "", [T_ALERTS], None),
    ("7b and cancelled with them", ALERTS,
     "      restBuzz.cancel();\n", "", [T_ALERTS], None),
    ("7c a hold's buzzes are laid with its sounds", ALERTS,
     "        holdBuzz.schedule(holdEndsAt, remaining);\n", "", [T_ALERTS], None),
    ("7d and cancelled with them", ALERTS,
     "      holdBuzz.cancel();\n", "", [T_ALERTS], None),
    ("7e a short buzz with each tick", BUZZ,
     "const steps = cue.kind === 'tick' ? [TICK_BUZZ_MS] : DONE_BUZZ_MS;",
     "const steps = DONE_BUZZ_MS;", [T_BUZZ], None),
    ("7f each buzz on its own second", BUZZ,
     "pattern.push(Math.max(0, Math.round((next.inSeconds - cue.inSeconds) * 1000) - length));",
     "pattern.push(0);", [T_BUZZ], None),
    ("7g the pattern starts on the first tick", BUZZ,
     "    }, plan.startIn * 1000);", "    }, 0);", [T_BUZZ], None),
    ("7h a pattern buzzing stops with the rest", BUZZ,
     "    if (this.buzzing) this.send(0);\n", "", [T_BUZZ], None),
    ("7i laid once for each end", BUZZ,
     "    if (this.scheduledFor === endsAt) return;\n", "", [T_BUZZ], None),
    ("7j one switch says both", SETTINGS,
     'label="Rest timer sounds and vibration"', 'label="Rest timer sounds"', [T_SETTINGS], None),
    ("7k the rest timer leaves its buzz to the alerts", REST_TIMER,
     "  const fraction = rest.seconds > 0",
     "  if (done) navigator.vibrate?.([120, 60, 120]);\n  const fraction = rest.seconds > 0",
     [T_REST_TIMER], None),

    # Item 8: the screen stays on during a workout.
    ("8a the screen stays on while the workout runs", APP,
     "  useWakeLock(running && !leftOpen);", "  useWakeLock(false);", [T_WAKE], None),
    ("8b and may sleep once it is paused", APP,
     "  const running = state.session?.status === 'active';",
     "  const running = state.session?.status === 'active' || state.session?.status === 'paused';",
     [T_WAKE], None),
    ("8c or once it is left half an hour", APP,
     "  useWakeLock(running && !leftOpen);", "  useWakeLock(running);", [T_WAKE], None),
    ("8d and the next set keeps it on again", APP,
     "running && state.session ? lastActivityAt(state.session) : null;",
     "running && state.session ? state.session.completed.startedAt : null;", [T_WAKE], None),

    # Item 10: the Default time line, only when it says more than the dropdown.
    ("10a nothing the dropdown already says", PREVIEW,
     "      {sayEstimate ? (", "      {true ? (", [T_PREVIEW, T_APP], None),
    ("10b a plan changed since", PREVIEW,
     " || duration.estimatedMinutes !== defaultEstimatedMinutes;", ";", [T_PREVIEW], None),
    ("10c a plan running over", PREVIEW,
     "fitted || duration.overByMinutes > 1 || ", "fitted || ", [T_PREVIEW], None),
    ("10d a length chosen", PREVIEW,
     "  const sayEstimate =\n    fitted ||", "  const sayEstimate =\n    false ||", [T_PREVIEW], None),

    # Item 14: the phone's Back closes any open sheet.
    ("14a every sheet holds an entry", SHEET,
     "  const onTop = useBackCloses(onClose, open);\n", "  const onTop = () => true;\n", [T_BACK], None),
    ("14b Back closes the view whose entry it took", BACK,
     "  for (const view of taken) view.close();\n", "", [T_BACK], None),
    ("14c an entry for each view", BACK,
     "  window.history.pushState(stateWith([...views, view.id]), '');",
     "  window.history.replaceState(stateWith([...views, view.id]), '');", [T_BACK], None),
    ("14d a view closed otherwise gives its entry back", BACK,
     "    const left = leftOnTop(viewsNow());\n    if (left > 0) stepBack(left);",
     "    const left = leftOnTop(viewsNow());\n    void left;", [T_BACK], None),
    ("14e the app's own step back closes nothing", BACK,
     "  if (ownSteps > 0) {\n    // The app's own step back has landed.",
     "  if (false) {\n    // The app's own step back has landed.", [T_BACK], None),
    ("14f a view opened while a step is on its way waits for it", BACK,
     "  if (ownSteps > 0) {\n    waiting.push(view);\n    return;\n  }\n", "", [T_BACK], None),
    ("14g a view opened as another closes takes its entry over", BACK,
     "    window.history.replaceState(stateWith([...views.slice(0, -1), view.id]), '');\n    return;",
     "    window.history.pushState(stateWith([...views, view.id]), '');\n    return;", [T_BACK], None),
    ("14h entries left by views gone are stepped past", BACK,
     "  const left = leftOnTop(views);\n  if (left > 0) stepBack(left);", "", [T_BACK], None),
    # 14i (all left entries in one step) is no longer a rule: the landing check steps past any left
    # after the first step, so counting them one at a time ends in the same place.
    ("14j a view its parent keeps open holds an entry again", BACK,
     "      for (const view of taken) if (isOpen(view.id) && !viewsNow().includes(view.id)) place(view);",
     "      void taken;", [T_BACK], None),
    ("14k each view its own", BACK,
     "  const id = useId();", "  const id = 'view';", [T_BACK], None),
    ("14m views closed while a step is on its way give their entries back", BACK,
     "    const left = leftOnTop(landed);\n    if (left > 0) {\n      stepBack(left);\n      return;\n    }\n",
     "", [T_BACK], None),
    ("14n Escape closes the sheet on top only", SHEET,
     "      if (event.key === 'Escape' && onTop()) onCloseRef.current();",
     "      if (event.key === 'Escape') onCloseRef.current();", [T_BACK], None),
    ("14l the barcode on full screen holds its own", OVERLAY,
     "  useBackCloses(onClose);\n", "", [T_BARCODE], None),
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
        killed = "failed" in line or summary is None
        if utc:
            # As the CI runner: the tests in UTC, then the day rules' tests in two zones.
            zones = subprocess.run(
                "node scripts/test-zones.mjs",
                shell=True, cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                errors="replace", env=env,
            )
            line = f"UTC: {line}; zones: {'failed' if zones.returncode != 0 else 'passed'}"
            killed = killed or run.returncode != 0 or zones.returncode != 0
        results.append((name, "KILLED" if killed else "SURVIVED", line))
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
