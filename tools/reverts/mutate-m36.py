"""Maintenance 36's mutation checks (2026-10-31): the schedule watch. Revert each part alone, run
its tests, expect a failure, restore. Prints KILLED (a test failed) or SURVIVED (every test still
passed).

  python mutate-m36.py --repo=PATH            run every entry in a copy of the repository
  python mutate-m36.py --repo=PATH W1 S3      run the entries whose names start with these
  python mutate-m36.py --repo=PATH --check    only check that every anchor is found once
  python mutate-m36.py --repo=PATH --utc      run the tests in UTC, then the day rules' zones

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

WATCH = "src/engine/planning/scheduleWatch.ts"
READS = "src/engine/recovery/recovery.ts"
MOVE = "src/core/validation/scheduleMove.ts"
STORE = "src/core/state/appStore.ts"
COACH = "src/engine/coach/coachConductor.ts"
USE_COACH = "src/features/coach/useCoach.ts"
TODAY = "src/features/today/TodayScreen.tsx"
SWITCHES = "src/core/validation/coachSwitches.ts"
ROWS = "src/features/settings/CoachSwitchesRows.tsx"

T_WATCH = "src/engine/planning/scheduleWatch.test.ts"
T_COACH = "src/engine/coach/coachConductor.scheduleWatch.test.ts"
T_STORE = "src/core/state/scheduleMove.store.test.ts"
T_CARD = "src/features/today/scheduleWatchCard.screens.test.tsx"
T_SWITCHES = "src/features/settings/coachSwitches.screens.test.tsx"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # The watch: when it reads.
    # W1 (nothing in the first four weeks) went from the code: the watch speaks only on sets after
    # those weeks, so before them it says nothing either way.
    ("W2 ... nor after eight", WATCH,
     "  if (end - at > RULES.watchLongestDays.value * DAY_MS) return null;\n", "", [T_WATCH], None),
    ("W3 a change it leaves alone is not read", WATCH,
     "  if (move === null || !move.watched || scheduleMoved(move.to, current)) return null;\n",
     "  if (move === null || scheduleMoved(move.to, current)) return null;\n", [T_WATCH], None),
    ("W4 ... nor once the schedule is another", WATCH,
     "  if (move === null || !move.watched || scheduleMoved(move.to, current)) return null;\n",
     "  if (move === null || !move.watched) return null;\n", [T_WATCH], None),
    ("W5 ... nor one set again since without a record", WATCH,
     "  if ((move.since ?? null) !== (current.since ?? null)) return null;\n", "", [T_WATCH], None),

    # What it reads.
    ("W6 compound lifts only", WATCH,
     "    if (getExercise(exerciseId)?.compound !== true) continue;\n", "", [T_WATCH], None),
    # W7 (four sessions a side) went from the code: four that pair (W8) holds it.
    ("W8 four sessions of a lift that pair, on each side", WATCH,
     "    if (read === null || read.after < least || read.before < least) continue;\n",
     "    if (read === null) continue;\n", [T_WATCH], None),
    ("W9 the weeks before run to eight where four hold too few", WATCH,
     "  return near.length >= RULES.watchSessions.value ? near : within(RULES.watchLongestDays.value);\n",
     "  return near;\n", [T_WATCH], None),
    ("W10 the four weeks after, read once", WATCH,
     "      return time > at && time <= blockEnd;\n", "      return time > at && time <= end;\n",
     [T_WATCH], None),
    ("W11 a break longer than strength holds leaves the lift out", WATCH,
     "    if (brokenOff([...before, ...after])) continue;\n", "", [T_WATCH], None),
    ("W12 days ill or after a short night are left out", READS,
     "    if (offDay(record)) continue;\n", "", [T_WATCH], None),

    # How a fall is measured.
    ("W13 the fall measured", WATCH,
     "    : { fall: 1 - Math.exp(sum / count), after: pairedAfter.size, before: pairedBefore.size };\n",
     "    : { fall: 0, after: pairedAfter.size, before: pairedBefore.size };\n", [T_WATCH, T_COACH], None),
    ("W14 ... with the sets that paired", WATCH, "      pairedAfter.add(at);\n", "", [T_WATCH], None),
    ("W15 a set the plan asked another reserve of, against what each asked", WATCH,
     "      const share = watchShare(read, earlier);\n",
     "      const share = read.lifted / earlier.lifted;\n", [T_WATCH], None),
    ("W16 a load the plan lowered at the same range and reserve, as lifted", WATCH,
     "  if (read.ask === null || shapeOf(read.ask) === shapeOf(earlier.ask as string)) {\n",
     "  if (read.ask === null || read.ask === earlier.ask) {\n", [T_WATCH], None),
    ("W17 the lift's own spread", WATCH,
     "    const error = sessionError(before);\n", "    const error = RULES.watchError.value;\n",
     [T_WATCH], None),
    ("W18 ... from ten sessions", WATCH,
     "  if (count < RULES.watchOwnSessions.value) return floor;\n", "  if (count < 3) return floor;\n",
     [T_WATCH], None),
    ("W19 ... never under 4%", WATCH,
     "  return Math.max(floor, Math.sqrt(squares / (count - 2)));\n",
     "  return Math.sqrt(squares / (count - 2));\n", [T_WATCH], None),
    ("W20 ... around the lift's trend", WATCH,
     "  const slope = across > 0 ? together / across : 0;\n", "  const slope = 0;\n", [T_WATCH], None),

    # What makes a finding.
    ("W21 the lifts together clearly under", WATCH,
     "  if (measured.length < RULES.watchLifts.value || !clearsTogether(measured)) return null;\n",
     "  if (measured.length < RULES.watchLifts.value) return null;\n", [T_WATCH], None),
    ("W22 two or more each clearly under", WATCH,
     "  const falling = measured.filter((lift) => lift.fall > RULES.watchZ.value * lift.noise);\n",
     "  const falling = measured.filter((lift) => lift.fall > 0);\n", [T_WATCH], None),
    ("W23 still under after easier days", WATCH,
     "  if (still.length < RULES.watchLifts.value || !clearsTogether(still)) return null;\n",
     "  if (still.length < RULES.watchLifts.value) return null;\n", [T_WATCH], None),
    ("W24 ... two lifts or more with such a set", WATCH,
     "  if (still.length < RULES.watchLifts.value || !clearsTogether(still)) return null;\n",
     "  if (still.length < 1 || !clearsTogether(still)) return null;\n", [T_WATCH], None),
    ("W25 ... the sets after three days without hard sets for the lift's muscles", WATCH,
     "      (read) => read.easierDays === null || read.easierDays >= RULES.watchEasierDays.value,\n",
     "      () => true,\n", [T_WATCH], None),
    ("W26 ... after the four weeks", WATCH,
     "        return time > blockEnd && time <= end;\n", "        return time > at && time <= end;\n",
     [T_WATCH], None),

    # The days of easier work before each set.
    ("E1 the days since the last hard work before the session", READS,
     "      if (item.time >= first.start) break;\n", "", [T_WATCH], None),
    ("E2 ... the latest of the lift's prime movers", READS,
     "      if (latest === null || item.time > latest.time)\n        latest = { time: item.time, at: item.record.startedAt };\n",
     "      if (latest === null)\n        latest = { time: item.time, at: item.record.startedAt };\n",
     [T_WATCH], None),
    ("E3 ... from the day that work's session began", READS,
     "        latest = { time: item.time, at: item.record.startedAt };\n",
     "        latest = { time: item.time, at: item.window.at };\n", [T_WATCH], None),

    # The record a change keeps.
    ("R1 the card's way back is never watched", WATCH,
     "  if (back) return { id: SCHEDULE_MOVE_ID, at: now, from: days(before), to, since, watched: false };\n",
     "", [T_WATCH, T_STORE, T_CARD], None),
    ("R2 a change within the week is the same change", WATCH,
     "    Date.parse(now) - Date.parse(saved.at) < RULES.watchMergeDays.value * DAY_MS\n", "    false\n",
     [T_WATCH], None),
    ("R3 ... and one undone within it is none", WATCH,
     "    return { ...saved, to, since, watched: scheduleMoved(saved.from, after) };\n",
     "    return { ...saved, to, since, watched: true };\n", [T_WATCH], None),
    ("R4 ... the first one's time and schedule standing", WATCH,
     "    return { ...saved, to, since, watched: scheduleMoved(saved.from, after) };\n",
     "    return { id: SCHEDULE_MOVE_ID, at: now, from: days(before), to, since, watched: true };\n",
     [T_WATCH], None),
    ("R5 ... a watched change only", WATCH, "    saved.watched &&\n", "", [T_WATCH], None),
    ("R6 when the schedule was set, kept", WATCH,
     "  const since = after.since ?? null;\n", "  const since = null;\n", [T_WATCH], None),

    # The stored record and what a change is.
    ("V1 a flag that does not read leaves the change alone", MOVE,
     "  watched: z.boolean().catch(false).default(false),\n",
     "  watched: z.boolean().catch(true).default(false),\n", [T_STORE], None),
    ("V2 ... and a missing one", MOVE,
     "  watched: z.boolean().catch(false).default(false),\n",
     "  watched: z.boolean().catch(false).default(true),\n", [T_STORE], None),
    ("V3 a change of the days alone is a change", MOVE,
     "  return before.weeklyFrequency !== after.weeklyFrequency || days(before) !== days(after);\n",
     "  return before.weeklyFrequency !== after.weeklyFrequency;\n", [T_STORE], None),
    ("V4 ... the same days in another order none", MOVE,
     "  const days = (schedule: ScheduleDays) => [...new Set(schedule.availableDays)].sort().join();\n",
     "  const days = (schedule: ScheduleDays) => schedule.availableDays.join();\n", [T_STORE], None),

    # The store.
    ("S1 every change of the sessions or the days keeps the record", STORE,
     "    if (previous && scheduleMoved(previous.schedule, next.schedule)) {\n", "    if (false) {\n",
     [T_STORE], None),
    ("S2 the coach's move passes the way back on", STORE,
     "          since: this.now(),\n        },\n      },\n      options,\n    );\n",
     "          since: this.now(),\n        },\n      },\n      {},\n    );\n", [T_STORE, T_CARD], None),
    ("S3 the record read back", STORE,
     "            ? parseScheduleMove(scheduleMoveRaw)\n", "            ? null\n", [T_STORE], None),
    ("S4 a record that does not read is never written over", STORE,
     "      if (raw !== undefined && saved === null) return;\n      const next = nextScheduleMove(",
     "      const next = nextScheduleMove(", [T_STORE], None),
    ("S5 the record kept in the meta store", STORE,
     "      await putVerified(db, 'meta', next, { now: this.now });\n      this.scheduleMoveVersion += 1;\n",
     "      this.scheduleMoveVersion += 1;\n", [T_STORE], None),
    ("S6 ... and in the state", STORE,
     "      this.setState({ scheduleMove: next });\n", "", [T_STORE], None),

    # The coach's card.
    ("C1 before a workout starts", COACH,
     "  if (input.status !== 'preview' || input.switches?.scheduleWatch === false) return [];\n",
     "  if (input.switches?.scheduleWatch === false) return [];\n", [T_COACH], None),
    ("C2 ... with its switch on", COACH,
     "  if (input.status !== 'preview' || input.switches?.scheduleWatch === false) return [];\n",
     "  if (input.status !== 'preview') return [];\n", [T_COACH], None),
    ("C3 the card gathered", COACH, "    ...scheduleWatchSignals(input),\n", "", [T_COACH, T_CARD], None),
    ("C4 its tap goes back", COACH,
     "        back: true,\n        label: 'Go back to it',\n", "        label: 'Go back to it',\n",
     [T_COACH, T_CARD], None),
    ("C5 the schedule before under the card, never cut", COACH,
     "      footnote: `The schedule before: ${plural(from.weeklyFrequency)} a week, on ${dayList(from.availableDays)}.`,\n",
     "", [T_COACH], None),
    ("C6 below a same-day recovery card", COACH,
     "      severity: 1,\n      source: `${WATCH_SOURCE}|${finding.at}`,\n",
     "      severity: 2,\n      source: `${WATCH_SOURCE}|${finding.at}`,\n", [T_COACH], None),
    ("C7 Not now keeps it away for that change", COACH,
     "      source: `${WATCH_SOURCE}|${finding.at}`,\n      untilNew: true,\n",
     "      source: `${WATCH_SOURCE}|${finding.at}`,\n", [T_COACH], None),
    ("C8 ... whatever lift falls or recovers since", COACH,
     "      source: `${WATCH_SOURCE}|${finding.at}`,\n",
     "      source: `${WATCH_SOURCE}|${finding.at}|${finding.lifts.length}`,\n", [T_COACH], None),
    ("C9 held to the owner's card limits", COACH,
     "export const NUDGE_SOURCES: readonly string[] = [TOO_SOON_SOURCE, GOALS_TIME_SOURCE, WATCH_SOURCE];\n",
     "export const NUDGE_SOURCES: readonly string[] = [TOO_SOON_SOURCE, GOALS_TIME_SOURCE];\n",
     [T_COACH], None),

    # The screens.
    ("U1 the record reaches the coach", USE_COACH,
     "    scheduleMove: parts.scheduleMove ?? null,\n", "    scheduleMove: null,\n", [T_CARD], None),
    ("U2 ... from the state", USE_COACH,
     "  const scheduleMove = useAppSelector((state) => state.scheduleMove);\n",
     "  const scheduleMove = null;\n", [T_CARD], None),
    ("U3 Today takes the way back", TODAY,
     "            action.back ? { back: true } : {},\n", "            {},\n", [T_CARD], None),
    ("X1 the switch on until turned off", SWITCHES,
     "  scheduleWatch: z.boolean().catch(true).default(true),\n",
     "  scheduleWatch: z.boolean().catch(false).default(false),\n", [T_SWITCHES, T_CARD], None),
    ("X2 ... and on by default", SWITCHES,
     "    scheduleWatch: true,\n", "    scheduleWatch: false,\n", [T_SWITCHES], None),
    ("X3 the switch in Settings", ROWS,
     "    label: 'After a schedule change',\n", "    label: '',\n", [T_SWITCHES], None),
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
