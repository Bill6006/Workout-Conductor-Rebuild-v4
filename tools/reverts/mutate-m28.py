"""Maintenance 28 mutation checks: revert each round J rule alone, run its tests, expect a failure,
restore. Prints KILLED (a test failed) or SURVIVED (every test still passed).

  python mutate-m28.py --repo=PATH            run every M28 entry in a copy of the repository
  python mutate-m28.py --repo=PATH 1a 3b      run the entries whose names start with these
  python mutate-m28.py --repo=PATH --check    only check that every anchor is found once
  python mutate-m28.py --repo=PATH --utc ...  as the CI runner: the tests in UTC, then the day
                                              rules' tests in two zones (scripts/test-zones.mjs)

The table below is data: nothing in it runs. The local-date entries are caught only where the
device is west or east of UTC (this machine runs America/New_York); in UTC they are no change.
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

WEEK = "src/engine/planning/weeklyPlan.ts"
DELOAD = "src/engine/planning/deload.ts"
FATIGUE = "src/engine/recovery/fatigue.ts"
ANALYTICS = "src/engine/scoring/analytics.ts"
STORE = "src/core/state/appStore.ts"
TODAY_HOOK = "src/features/today/useTodayWorkout.ts"
CLOUD = "src/core/cloud/model.ts"
TT = "src/engine/duration/trainingTime.ts"
DURATION = "src/engine/duration/duration.ts"
BUILDER = "src/core/state/workoutRecordBuilder.ts"
PROGRESS = "src/features/progress/ProgressScreen.tsx"
DETAIL = "src/features/progress/HistoryDetailSheet.tsx"
GEN = "src/engine/workoutGenerator/generate.ts"
RECAL = "src/engine/recalibration/recalibrate.ts"
COACH = "src/engine/coach/coachConductor.ts"
ACTIVE = "src/features/workout/ActiveWorkoutScreen.tsx"
LEARNED = "src/engine/learned/learned.ts"
LEARNED_UI = "src/features/settings/LearnedValues.tsx"
COMPLETION = "src/features/workout/WorkoutCompletion.tsx"
PLAN_SCREEN = "src/features/plan/PlanScreen.tsx"
USE_COACH = "src/features/coach/useCoach.ts"
PREVIEW = "src/features/today/WorkoutPreviewCard.tsx"
LOCAL_DATE = "src/core/time/localDate.ts"
PUSH_PACE = "src/engine/planning/pushPace.ts"
BACKUP = "src/core/backup/backup.ts"
LEGACY = "src/core/backup/legacyImport.ts"
SESSION = "src/core/state/session.ts"

T_LOCAL = "src/core/time/localDays.test.ts"
T_DELOAD = "src/engine/planning/deload.test.ts"
T_TODAY = "src/features/today/useTodayWorkout.localDay.test.tsx"
T_TT = "src/engine/duration/trainingTime.test.ts"
T_TT_STORE = "src/core/state/appStore.trainingTime.test.tsx"
T_PACE = "src/engine/duration/pace.plan.test.ts"
T_PACE_SCREEN = "src/features/workout/pace.screens.test.tsx"
T_WEEK_RESETS = "src/features/plan/weekResets.test.tsx"
T_BACKUP = "src/core/backup/backup.test.ts"

UTC_WEEKDAY = "(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const)[(new Date({}).getUTCDay() + 6) % 7]!"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # Item 1: the device's date everywhere the app works out what day it is.
    ("1a the week's weekday is the device's", WEEK,
     "    const weekday = localWeekday(date);",
     "    const weekday = " + UTC_WEEKDAY.format("date") + ";", [T_LOCAL], None),
    ("1b trained today by the device's day", WEEK,
     "localDayKey(record.startedAt) === localDayKey(now)",
     "record.startedAt.slice(0, 10) === now.slice(0, 10)", [T_LOCAL], None),
    ("1c the week steps calendar days", WEEK,
     "    const date = addLocalDays(now, offset);",
     "    const date = new Date(Date.parse(now) + offset * 86_400_000).toISOString();",
     [T_LOCAL], None),
    ("1d a deload day starts at the device's midnight", DELOAD,
     "  return startOfLocalDay(addLocalDays(iso, offsetDays));",
     "  return `${new Date(Date.parse(iso) + offsetDays * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`;",
     [T_DELOAD], None),
    ("1e a window planned in another zone names its own days", DELOAD,
     "  return `${format(dayOfBoundary(window.startsAt))} to ${format(lastDay)}`;",
     "  return `${format(window.startsAt)} to ${format(lastDay)}`;", [T_LOCAL, T_DELOAD], None),
    # 1f and 1g (a run of training days on the device's days) left with the fatigue score's day
    # counts in Maintenance 33; the whole-body layer's run of hard days is in the M33 table.
    ("1h Progress weeks start on the device's Monday", ANALYTICS,
     "  const day = (new Date(iso).getDay() + 6) % 7;\n  return startOfLocalDay(addLocalDays(iso, -day));",
     "  const date = new Date(iso);\n  const day = (date.getUTCDay() + 6) % 7;\n  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day)).toISOString();",
     [T_LOCAL], None),
    ("1i a workout counts in the week it began", ANALYTICS,
     "      const at = Date.parse(record.startedAt);",
     "      const at = Date.parse(record.completedAt ?? record.startedAt);", [T_LOCAL], None),
    ("1j today's plan is keyed by the device's day", STORE,
     "    return computeBaseKey(localDayKey(this.now()), profile, this.currentLocation(), history.length);",
     "    return computeBaseKey(this.now().slice(0, 10), profile, this.currentLocation(), history.length);",
     [T_LOCAL], None),
    ("1j2 a plan from an earlier day by the device's day", STORE,
     "!session.baseKey.startsWith(`${localDayKey(this.now())}|`)",
     "!session.baseKey.startsWith(`${this.now().slice(0, 10)}|`)", [T_LOCAL], None),
    ("1k Today asks for the day's plan at the device's midnight", TODAY_HOOK,
     "  const day = localDayKey(new Date(nowEpoch || 0).toISOString());",
     "  const day = new Date(nowEpoch || 0).toISOString().slice(0, 10);", [T_TODAY], None),
    ("1l a saved workout is dated by the device's day", STORE,
     "          `Saved ${localDayKey(saved.createdAt)}.",
     "          `Saved ${saved.createdAt.slice(0, 10)}.", [T_LOCAL], None),
    ("1m the cloud copy's day is the device's day it began", CLOUD,
     "  return stamp ? localDayKey(stamp) : null;", "  return stamp ? stamp.slice(0, 10) : null;",
     [T_LOCAL], None),

    # Item 3: training time, not the hours a workout was left open.
    ("3a the run-up counts ten minutes at most", TT,
     "  let cap = TRAINING_TIME.FIRST_SET_MINUTES;", "  let cap = Number.POSITIVE_INFINITY;",
     [T_TT], None),
    ("3b a wait between sets counts ten minutes at most", TT,
     "    cap = TRAINING_TIME.GAP_MINUTES;", "    cap = Number.POSITIVE_INFINITY;", [T_TT], None),
    ("3c training ends with the last set", TT,
     "  const seconds = Math.round(total / 1000);",
     "  if (record.completedAt) total += Math.min(MINUTE_MS, Math.max(0, Date.parse(record.completedAt) - (times[times.length - 1] as number)));\n  const seconds = Math.round(total / 1000);",
     [T_TT], None),
    ("3d never more than the workout's clock", TT,
     "  return clock !== null && clock > 0 ? Math.min(seconds, Math.round(clock)) : seconds;",
     "  return seconds;", [T_TT], None),
    ("3e a workout with no set times keeps its clock", TT,
     "  if (times.length === 0) return clock === null ? 0 : Math.round(clock);",
     "  if (times.length === 0) return 0;", [T_TT], None),
    ("3f the saved training time comes first", TT,
     "  return record.trainingSeconds ?? measureTrainingSeconds(record);",
     "  return measureTrainingSeconds(record);", [T_TT], None),
    ("3g a finished workout saves its training time", BUILDER,
     "    trainingSeconds,\n", "", [T_TT_STORE], None),
    ("3h the summary says the training time", BUILDER,
     "Math.max(1, trainingMinutes(record))",
     "Math.max(1, Math.round((record.elapsedSeconds ?? 0) / 60))", [T_TT_STORE], None),
    ("3i History reads the training time", PROGRESS,
     "  return trainingMinutes(record);", "  return Math.round((record.elapsedSeconds ?? 0) / 60);",
     [T_TT_STORE], None),
    ("3j a workout's detail reads the training time", DETAIL,
     "value: `${trainingMinutes(record)} min",
     "value: `${Math.round((record.elapsedSeconds ?? 0) / 60)} min", [T_TT_STORE], None),
    ("3k Duration efficiency reads the training time", ANALYTICS,
     "  const actual = sessions.map((record) => trainingSeconds(record) / 60);",
     "  const actual = sessions.map((record) => (record.elapsedSeconds ?? 0) / 60);", [T_TT], None),

    # Item 4: the lifter's own pace.
    ("4a a finished workout saves the plan's estimate of its sets", BUILDER,
     "    estimatedSeconds,\n", "", [T_TT_STORE], None),
    ("4b a skip costs the estimate nothing", BUILDER,
     "      .filter((done) => !done.skipped)\n", "", [T_TT_STORE], None),
    ("4c three workouts before a plan is fitted", TT,
     "  ACT_FROM: 3,", "  ACT_FROM: 2,", [T_TT], None),
    ("4d the middle workout sets the pace", TT,
     "    sorted.length % 2 === 1\n      ? (sorted[middle] as number)\n      : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;",
     "    sorted.reduce((sum, one) => sum + one, 0) / sorted.length;", [T_TT], None),
    ("4e a short workout says nothing", TT,
     "  MIN_ESTIMATE_MINUTES: 10,", "  MIN_ESTIMATE_MINUTES: 0,", [T_TT], None),
    ("4f a slip says nothing", TT, "  RATIO_HIGH: 2,", "  RATIO_HIGH: 100,", [T_TT], None),
    ("4g nothing from before a reset", TT,
     "    if (!(Date.parse(record.startedAt) >= from)) continue;\n", "", [T_TT], None),
    ("4h the latest eight", TT,
     "paceReadings(history, resetAt).slice(-PACE.READINGS)", "paceReadings(history, resetAt)",
     [T_TT], None),
    ("4i a plan moves only within the bounds", TT,
     "usable ? Math.min(PACE.FACTOR_HIGH, Math.max(PACE.FACTOR_LOW, ratio)) : 1",
     "usable ? ratio : 1", [T_TT], None),
    ("4j the pace a part of its own", DURATION,
     "  const paceMinutes = round(planned * (pace - 1));", "  const paceMinutes = 0;",
     [T_TT, T_PACE], None),
    ("4j2 the plan's parts stay its own", DURATION,
     "  const workMinutes = round(work / 60);", "  const workMinutes = round((work / 60) * pace);",
     [T_TT], None),
    ("4k Left at the pace", DURATION,
     "  const pace = input.pace ?? 1;", "  const pace = 1;", [T_TT], None),
    ("4k2 a running rest counts down in real time", DURATION,
     "+ warmup + running) / 60;", "+ warmup + running * pace) / 60;", [T_TT], None),
    ("4k3 a hold counts down in real time", DURATION,
     "Math.max(0, work * pace - held)", "Math.max(0, (work - held) * pace)", [T_TT], None),
    ("4k4 the warm-up counts down in real time", DURATION,
     "input.generalWarmupMinutes * 60 * pace - input.elapsedSeconds",
     "(input.generalWarmupMinutes * 60 - input.elapsedSeconds) * pace", [T_TT], None),
    ("4l the plan is fitted at the pace", GEN,
     "estimateWorkout(blocks, generalWarmup, exerciseOf, isDone, pace.factor)",
     "estimateWorkout(blocks, generalWarmup, exerciseOf, isDone, 1)", [T_PACE], None),
    ("4m the plan says so", GEN,
     "  if (paceLine) reasons.push(paceLine);\n", "", [T_PACE], None),
    ("4n the plan keeps its pace", GEN,
     "      ...(pace.factor !== 1 ? { pace: pace.factor } : {}),\n", "", [T_PACE, T_PACE_SCREEN], None),
    ("4o the plan under a hard start keeps its pace", RECAL,
     "    plan.duration.pace ?? 1,", "    1,", [T_PACE], None),
    ("4p a change that rebuilds nothing keeps its pace", RECAL,
     "    workout.duration.pace ?? 1,", "    1,", [T_PACE], None),
    ("4q a skip's minutes at the pace", RECAL,
     "isDone, layer.shown.duration.pace ?? 1)", "isDone, 1)", [T_PACE], None),
    ("4r the coach's room at the pace", COACH,
     "    pace: input.workout.duration.pace ?? 1,\n", "", [T_PACE], None),
    ("4s Left on the screen at the pace", ACTIVE,
     "      pace: workout.duration.pace ?? 1,\n", "", [T_PACE_SCREEN], None),
    ("4t the learned page says the pace", LEARNED,
     "  } else if (pace.readings > 0) {", "  } else if (false) {", [T_PACE], None),
    ("4u the pace is reset from the page", LEARNED_UI,
     "      else await store.resetLearned(section.key);",
     "      else if (section.key !== 'pace') await store.resetLearned(section.key);",
     [T_TT_STORE], None),

    # The review of round J: items 3 and 4.
    ("3l a skip takes no time", TT,
     "    .filter((set) => set.completed)\n", "", [T_TT], None),
    ("3m the wait before sets logged at one go counts for each", TT,
     "cap * (next - index) * MINUTE_MS", "cap * MINUTE_MS", [T_TT], None),
    ("3n sets logged within a minute are one go", TT,
     "  ONE_GO_SECONDS: 60,", "  ONE_GO_SECONDS: 0,", [T_TT], None),
    ("3o the completion card shows the training time", COMPLETION,
     "{minutes(summary.trainingSeconds ?? summary.elapsedSeconds)}",
     "{minutes(summary.elapsedSeconds)}", [T_TT_STORE], None),
    ("3p the completion summary carries the training time", BUILDER,
     "    trainingSeconds: trainingSecondsOf(record),\n", "", [T_TT_STORE], None),
    ("4v the pace never shortens a rest", GEN,
     "    if (!restsExhausted && overAtPlanPace() && shortenRests()) continue;",
     "    if (!restsExhausted && shortenRests()) continue;", [T_PACE], None),
    ("4w the plan says the pace as Settings does", GEN,
     "  const share = Math.round(Math.abs(pace.ratio - 1) * 100);",
     "  const share = Math.round(Math.abs(pace.factor - 1) * 100);", [T_PACE], None),
    ("4w2 and how far plans go", GEN,
     "  if (pace.factor === pace.ratio) return `${line}.`;", "  return `${line}.`;", [T_PACE], None),
    ("4x the learned page says the workouts it could read", LEARNED,
     "    const from = `from the last ${workouts(pace.readings)} it could read`;",
     "    const from = `from your last ${workouts(pace.readings)}`;", [T_PACE], None),
    ("4x2 finished workouts none of which it could read", LEARNED,
     "  } else if (\n    input.history.some(", "  } else if (\n    false &&\n    input.history.some(",
     [T_PACE], None),
    ("4x3 a short workout by its estimate", LEARNED,
     "a workout the plan puts under ${PACE.MIN_ESTIMATE_MINUTES} minutes, or one more",
     "a workout under ${PACE.MIN_ESTIMATE_MINUTES} minutes, or more", [T_PACE], None),
    ("4y a saved plan loads at the pace as it reads now", STORE,
     "    const fresh = planAtPace(", "    const fresh = ((plan: typeof saved.workout) => plan)(",
     [T_TT_STORE], None),
    ("4y2 with the line from the pace now", RECAL,
     "  const line = paceReason(pace);", "  const line = null as string | null;", [T_TT_STORE], None),
    ("4y3 without the line from the pace then", RECAL,
     "  const reasons = plan.explanation.reasons.filter((line) => !isPaceLine(line));",
     "  const reasons = [...plan.explanation.reasons];", [T_TT_STORE], None),
    ("4y4 the line where a plan built today has it", RECAL,
     "    reasons.splice(at < 0 ? reasons.length : at, 0, line);", "    reasons.push(line);",
     [T_TT_STORE], None),
    ("4y5 its minutes at the pace now", RECAL,
     "    () => false,\n    pace.factor,\n  );", "    () => false,\n    plan.duration.pace ?? 1,\n  );",
     [T_TT_STORE], None),
    ("4z the sets are timed against the warm-up the workout started with", BUILDER,
     "    session.completed.warmupMinutes ?? workout.warmup.generalMinutes,",
     "    workout.warmup.generalMinutes,", [T_TT_STORE], None),
    ("4z2 the start keeps its warm-up", STORE,
     "        warmupMinutes: session.workout.warmup.generalMinutes,\n", "", [T_TT_STORE], None),
    ("4aa the week ahead reads what was reset", WEEK,
     "      resets,\n", "", [T_PACE], None),
    # 4aa2 and 4aa3 re-anchored in Maintenance 34: the week ahead takes today's length too.
    ("4aa2 the Plan tab plans the week with it", PLAN_SCREEN,
     "planWeek(profile, location, state.history, nowIso, state.learnedResets, todayLength)",
     "planWeek(profile, location, state.history, nowIso, undefined, todayLength)", [T_WEEK_RESETS], None),
    ("4aa3 the coach plans the week with it", USE_COACH,
     "      now,\n      parts.learnedResets ?? null,\n      localDayKey(session.createdAt)",
     "      now,\n      undefined,\n      localDayKey(session.createdAt)", [T_WEEK_RESETS], None),
    ("4bb the preview shows the pace as a part", PREVIEW,
     "{paceText(workout.explanation.time.paceMinutes)}", "", [T_PACE_SCREEN], None),

    # The review of round J: item 1.
    ("1n a deload window kept from before runs on the device's days", DELOAD,
     "  return { startsAt: fromUtcMidnight(window.startsAt), endsAt: fromUtcMidnight(window.endsAt) };",
     "  return window;", [T_LOCAL, T_DELOAD], None),
    ("1n2 and loads so", STORE,
     "  const days = onDeviceDays({ startsAt: candidate.startsAt, endsAt: candidate.endsAt });",
     "  const days = { startsAt: candidate.startsAt, endsAt: candidate.endsAt };", [T_LOCAL], None),
    ("1n3 midnight UTC read as the device's midnight", LOCAL_DATE,
     "  if (!match) return iso;", "  if (!match || match) return iso;", [T_LOCAL], None),
    ("1o the first week counted is the one the first workout began in", ANALYTICS,
     "Math.min(...sessions.map((record) => Date.parse(record.startedAt)))",
     "Math.min(...sessions.map((record) => Date.parse(record.completedAt ?? record.startedAt)))",
     [T_LOCAL], None),
    ("1p a push date passes as its day ends", PUSH_PACE,
     "  const ends = Date.parse(startOfLocalDay(addLocalDays(input.by, 1)));",
     "  const ends = Date.parse(input.by);", [T_LOCAL], None),
    ("1q an export is named by the device's time", BACKUP,
     "  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}`;",
     "  return exportedAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 13);",
     [T_LOCAL, T_BACKUP], None),
    ("1r a date alone is that day on the device", LEGACY,
     "    const day = DAY_ONLY.exec(value.trim());", "    const day = null as RegExpExecArray | null;",
     [T_LOCAL], None),
    ("1r2 and imports once", LEGACY,
     "  const stamp = session.dayOnly", "  const stamp = false", [T_LOCAL], None),
    ("1s an evening preview kept from before is named by the device's day", SESSION,
     "  if (session) return { session: withDeviceDayKey(session), kept: null };",
     "  if (session) return { session, kept: null };", [T_LOCAL], None),
    ("1s2 a key naming neither day is left", SESSION,
     "  if (day === local || day !== session.createdAt.slice(0, 10)) return session;",
     "  if (day === local) return session;", [T_LOCAL], None),
    ("1s3 a workout under way is left", SESSION,
     "  if (session.status !== 'preview') return session;\n  const bar", "  const bar", [T_LOCAL], None),
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
