"""Maintenance 33 mutation checks: revert each recovery and readiness rule alone, run its tests,
expect a failure, restore. Prints KILLED (a test failed) or SURVIVED (every test still passed).

  python mutate-m33.py --repo=PATH            run every M33 entry in a copy of the repository
  python mutate-m33.py --repo=PATH R1 C3      run the entries whose names start with these
  python mutate-m33.py --repo=PATH --check    only check that every anchor is found once
  python mutate-m33.py --repo=PATH --utc ...  as the CI runner: the tests in UTC, then the day
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

RECOVERY = "src/engine/recovery/recovery.ts"
FATIGUE = "src/engine/recovery/fatigue.ts"
CHECKIN = "src/engine/readiness/checkIn.ts"
COACH = "src/engine/coach/coachConductor.ts"
ENGINE = "src/engine/recalibration/recalibrate.ts"
BADSTART = "src/engine/recalibration/badStart.ts"
PLAN = "src/engine/planning/weeklyPlan.ts"
BUILDER = "src/core/state/workoutRecordBuilder.ts"
LEARNED = "src/engine/learned/learned.ts"
TODAY = "src/features/today/TodayScreen.tsx"
AGAINST = "src/engine/recovery/againstAsked.ts"
DELOAD = "src/engine/planning/deload.ts"
SHEET = "src/components/ExerciseDetail/ExerciseDetailSheet.tsx"
PLANSCREEN = "src/features/plan/PlanScreen.tsx"
STORE = "src/core/state/appStore.ts"
RESERVE = "src/engine/progression/reserveCheck.ts"
USECOACH = "src/features/coach/useCoach.ts"
SESSION = "src/core/state/session.ts"

T_RECOVERY = "src/engine/recovery/recovery.test.ts"
T_LEARNED_W = "src/engine/recovery/recovery.learned.test.ts"
T_FATIGUE = "src/engine/recovery/fatigue.test.ts"
T_CHECKIN = "src/engine/readiness/checkIn.test.ts"
T_TOO_SOON = "src/engine/coach/coachConductor.tooSoon.test.ts"
T_SHOWN = "src/core/state/coachShown.store.test.ts"
T_LIGHTER = "src/engine/recalibration/lighter.test.ts"
T_SCHEDULE = "src/engine/coach/coachConductor.schedule.test.ts"
T_PLAN = "src/engine/planning/weeklyPlan.test.ts"
T_PROGRESS = "src/core/state/appStore.progress.test.ts"
T_BADSTART = "src/engine/recalibration/badStart.test.ts"
T_LEARNED_PAGE = "src/engine/learned/learned.test.ts"
T_STRATEGY = "src/engine/strategy/strategy.test.ts"
T_RECALIBRATE = "src/engine/recalibration/recalibrate.test.ts"
T_REST_DAY = "src/features/today/restDay.screens.test.tsx"
T_HEAD_COLD_UNDER_WAY = "src/engine/recalibration/headColdLiftUnderWay.test.ts"
T_STEP_PAST_RANGE = "src/engine/recovery/fatigueStepAfterRangePassed.test.ts"
T_COMPLETION_NIGHT = "src/features/workout/completionShortNight.screens.test.tsx"
T_PLAN_STALE = "src/features/plan/planBalanceStaleCheckIn.screens.test.tsx"
T_FEVER_OFFER = "src/core/state/feverRestDayCoachOffer.store.test.ts"
T_CHECK_ON_LIGHTER = "src/core/state/reserveCheckOnLighter.store.test.ts"
T_CHECK_AFTER_START = "src/core/state/lowCheckInTakesHardStart.store.test.ts"
T_CHECK_AFTER_START_STORED = "src/core/state/session.checkInAfterStart.test.ts"
T_LIGHTER_PREVIEW = "src/core/state/lighterPreviewRebuild.store.test.ts"
T_LIGHTER_SWAP_BACK = "src/engine/recalibration/lighterSwapBack.test.ts"
T_FIRST_SET_READ = "src/engine/coach/tooSoonFirstSetReadReserve.test.ts"
T_COACH_ESTIMATE = "src/features/coach/coachEstimate.test.ts"
T_PROGRESS_RESERVE = "src/core/state/appStore.reserveCheck.test.ts"
T_CHECK_FAILURE = "src/engine/recovery/reserveCheckFailureWindow.test.ts"
T_LONG_VARIANTS = "src/engine/recovery/longLengthVariants.test.ts"
T_START_READ_LOG = "src/core/state/badStartReadLog.store.test.ts"
T_FEVER = "src/engine/recalibration/feverUnderWay.test.ts"
T_DROP_ILL = "src/engine/coach/dropSetOfferIll.test.ts"
T_REST_TOO_SOON = "src/engine/coach/restDayTooSoon.test.ts"
T_DELOAD_FIRST = "src/engine/coach/tooSoonDeloadFirstSet.test.ts"
T_PLAN_RESET = "src/features/plan/planBalanceReset.screens.test.tsx"
T_HARD_SHORT = "src/engine/recalibration/hardStartShortNight.test.ts"
T_LINE_CUT = "src/engine/coach/scheduleLineCut.test.ts"
T_LIGHTER_LOADS = "src/engine/recalibration/lighterKeepsLoads.test.ts"
T_LOAD_STEP = "src/engine/recovery/fatigueLoadStep.test.ts"
T_LIGHTER_UNDO = "src/core/state/lighterUndoBackOffs.store.test.ts"
T_STALE_MARK = "src/engine/recalibration/lighterStaleMark.test.ts"
T_LEARNED_DECLINE = "src/engine/learned/learnedTooSoonDecline.test.ts"
T_RESERVE_SORE = "src/engine/progression/reserveCheckSoreDay.test.ts"
T_DELOAD = "src/engine/planning/deload.test.ts"
T_SHEET = "src/components/ExerciseDetail/ExerciseDetailSheet.keep.test.tsx"
T_EASE_LAYER = "src/engine/recalibration/recalibrate.easeLayer.test.ts"
T_BADSTART_STORE = "src/core/state/badStart.store.test.ts"
GENERATE = "src/engine/workoutGenerator/generate.ts"
# The third review of Maintenance 33.
T_ILLNESS_BACK = "src/engine/recalibration/illnessTakenBackLiftUnderWay.test.ts"
T_LIGHTER_COPY = "src/engine/recalibration/lighterSwapBackSavedCopy.test.ts"
T_HARD_LIGHTER_BACK = "src/engine/recalibration/hardStartLighterSwapBack.test.ts"
T_FEVER_HEAVIER = "src/engine/coach/feverRestDayHeavierOffer.test.ts"
T_LIGHTER_FIRST = "src/core/state/lighterFirstSetHardStart.store.test.ts"
T_CHECKIN_MARK = "src/core/state/checkInAfterStartOutlivesStart.store.test.ts"
T_ESTIMATE_DAY = "src/core/state/readEstimateAfterNewDay.store.test.ts"
T_MIDNIGHT = "src/features/plan/midnightRecoveryLine.screens.test.tsx"
T_LEARNED_READ = "src/features/settings/learnedRecoveryReadLog.screens.test.tsx"
T_LONG_FLY = "src/engine/recovery/longLengthFlyVariants.test.ts"
LEARNEDPAGE = "src/features/settings/LearnedValues.tsx"
SCHEMA = "src/engine/workout/workoutSchema.ts"
T_FLOOR_RECORD = "src/engine/recalibration/illnessFloorRecord.test.ts"
T_STANDIN_BACK = "src/engine/recalibration/lighterStandInSwapBack.test.ts"
T_MIDNIGHT_COACH = "src/engine/coach/tooSoonPastMidnight.test.ts"
T_LAYERS_SCHEMA = "src/engine/workout/workoutSchema.layers.test.ts"
# The fourth review of Maintenance 33.
T_FEVER_FINISH = "src/engine/coach/feverUnderWayFinishCard.test.ts"
T_LOADED_ILLNESS = "src/core/state/savedWorkoutLoadedIllness.store.test.ts"
T_CHECKIN_CARRIED = "src/core/state/checkInCarried.store.test.ts"
T_CHECKIN_AT_STORED = "src/core/state/session.checkInAt.test.ts"
T_SAVED_FLOOR = "src/core/state/savedCopyHeadColdFloor.store.test.ts"
T_PAST_MIDNIGHT = "src/engine/recalibration/checkInToldPastMidnight.test.ts"
T_LIGHTER_BEFORE_TOP = "src/engine/recalibration/lighterBeforeTopSetSwapBack.test.ts"
T_LIGHTER_PICKED_UP = "src/engine/recalibration/lighterPickedUpAgain.test.ts"
# The fifth review of Maintenance 33.
T_UNDO_HEAD_COLD = "src/core/state/undoSetUnderHeadCold.store.test.ts"
T_CHECKIN_BASELINE = "src/core/state/checkInCarriedBaseline.store.test.ts"
T_LIGHTER_PLACE_BACK = "src/engine/recalibration/lighterBeforeTopSetPlaceBack.test.ts"
T_LOADED_WORDS = "src/core/state/savedLoadedCheckInWords.store.test.ts"
T_LIGHTER_SWAP_COPY = "src/engine/recalibration/lighterThenSwapSavedCopy.test.ts"
T_LIGHTER_AFTER_SWAP = "src/engine/recalibration/lighterAfterSwapStandIn.test.ts"
T_HEAD_COLD_PREVIEW = "src/core/state/savedOnHeadColdPreview.store.test.ts"
T_LIGHTER_LATER_PLAN = "src/core/state/lighterThroughLaterPlan.store.test.ts"
T_HEAD_COLD_WORDS = "src/engine/recalibration/headColdCheckInAgainWords.test.ts"
T_PAST_MIDNIGHT_STORE = "src/core/state/checkInPastMidnight.store.test.ts"
T_COACH_PAST_MIDNIGHT = "src/core/state/coachTooSoonPastMidnight.store.test.ts"
T_PLAN_PAST_MIDNIGHT = "src/features/plan/checkInPastMidnight.screens.test.tsx"
# The fresh review before shipping (2026-10-30), the Y entries.
WORKOUT_SCREEN = "src/features/workout/WorkoutScreen.tsx"
T_FEVER_WORKOUT_TAB = "src/features/workout/feverRestDay.screens.test.tsx"
T_LONGEST = "src/engine/recovery/recoveryWindows.longest.test.ts"
T_TOLD_AT = "src/engine/readiness/checkInPastMidnight.test.ts"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # The windows from the hardest sets.
    ("R1 hard work only: three in reserve or closer", RECOVERY,
     "rir !== null && rir <= RECOVERY.HARD_RIR;", "rir !== null;", [T_RECOVERY], None),
    ("R2 three or more short: a day", RECOVERY,
     "      : RECOVERY.EASY_HOURS;", "      : RECOVERY.MID_HOURS[region];", [T_RECOVERY], None),
    ("R3 one or two short: by region", RECOVERY,
     "      : hardest.rir <= 2\n        ? RECOVERY.MID_HOURS[region]",
     "      : hardest.rir <= 2\n        ? RECOVERY.MID_HOURS.upper", [T_RECOVERY], None),
    ("R4 to failure: by region", RECOVERY,
     "    const hours: number = failure\n      ? RECOVERY.FAILURE_HOURS[region]",
     "    const hours: number = failure\n      ? RECOVERY.FAILURE_HOURS.upper", [T_RECOVERY], None),
    ("R5 a long set a rep short counts as to failure", RECOVERY,
     "(hardest.rir <= 1 && hardest.reps >= RECOVERY.LONG_SET_REPS)", "false", [T_RECOVERY], None),
    ("R6 lower body: compound lifts only", RECOVERY,
     "    const region = lowerCompound(exercise) ? 'lower' : 'upper';",
     "    const region = LOWER_BODY.has(exercise.movementPattern) ? 'lower' : 'upper';",
     [T_RECOVERY], None),
    ("R7 the newest hard work sets the window", RECOVERY,
     "    const newest = latestEnding(index.windows.get(muscle) ?? []);",
     "    const newest = (index.windows.get(muscle) ?? [])[0];", [T_RECOVERY], None),
    ("R8 a big dose lengthens it", RECOVERY,
     "  if (dose >= RECOVERY.BIG_DOSE_SETS) {", "  if (false) {", [T_RECOVERY], None),
    # No entry for the big dose's cap: with these numbers a set to failure and a big dose reach it
    # exactly (72 h upper, 96 h lower), so it never binds; it guards a later change of the numbers.
    ("R10 a synergist counts half", RECOVERY,
     "        ? RECOVERY.SYNERGIST_WEIGHT\n        : 0;", "        ? 1\n        : 0;", [T_RECOVERY], None),
    ("R11 ... and starts no window of its own", RECOVERY,
     "    if (!prime) continue;\n", "", [T_RECOVERY], None),
    ("R12 a new lift lengthens it", RECOVERY,
     "  if (newLift !== null) {\n    hours += RECOVERY.NEW_LIFT_HOURS;",
     "  if (false) {\n    hours += RECOVERY.NEW_LIFT_HOURS;", [T_RECOVERY], None),
    ("R13 ... a lifter new to the app is not new to every lift", RECOVERY,
     "  if (before === 0) return known;", "  if (before === 0) return true;", [T_RECOVERY], None),
    ("R14 ... back after six months is new again", RECOVERY,
     "  if (at - (times[before - 1] as number) >= RECOVERY.BACK_AFTER_DAYS * DAY_MS) return true;\n", "",
     [T_RECOVERY], None),
    ("R15 long-length work lengthens it", RECOVERY,
     "  if (longLength) {\n    hours += RECOVERY.LONG_LENGTH_HOURS;",
     "  if (false) {\n    hours += RECOVERY.LONG_LENGTH_HOURS;", [T_RECOVERY], None),
    ("R16 a short night lengthens every window", RECOVERY,
     "  if (readiness !== null && readiness.sleep <= RECOVERY.SHORT_NIGHT_SLEEP) return 'a short night';",
     "  if (false) return 'a short night';", [T_RECOVERY], None),
    ("R17 a run of hard days with energy low", RECOVERY,
     "  return run >= RECOVERY.HARD_DAYS_RUN ? `${run} hard days running, energy low today` : null;",
     "  return null;", [T_LEARNED_W], None),
    # What the lifter's own sessions teach.
    ("L1 after five of each", RECOVERY,
     "    if (early.length >= LEARNING.LEAST && rested.length >= LEARNING.LEAST) {",
     "    if (early.length >= 1 && rested.length >= 1) {", [T_LEARNED_W], None),
    ("L2 early as good as rested: shorter", RECOVERY,
     "      if (fell <= LEARNING.SAME) shift = -LEARNING.STEP_HOURS;",
     "      if (false) shift = -LEARNING.STEP_HOURS;", [T_LEARNED_W], None),
    ("L3 early well under rested: longer", RECOVERY,
     "      else if (fell >= LEARNING.SLOWER) shift = LEARNING.STEP_HOURS;",
     "      else if (false) shift = LEARNING.STEP_HOURS;", [T_LEARNED_W], None),
    ("L4 within bounds", RECOVERY,
     "        const hours = withinBounds(window.prior + shift, window.prior);",
     "        const hours = window.prior + shift;", [T_LEARNED_W], None),
    ("L5 days ill or after a short night are left out", RECOVERY,
     "      if (earlier.length === 0 || Date.parse(record.startedAt) < from || offDay(record)) continue;",
     "      if (earlier.length === 0 || Date.parse(record.startedAt) < from) continue;", [T_LEARNED_W], None),
    ("L6 ... and what came before a reset", RECOVERY,
     "      if (earlier.length === 0 || Date.parse(record.startedAt) < from || offDay(record)) continue;",
     "      if (earlier.length === 0 || offDay(record)) continue;", [T_LEARNED_W], None),
    ("L7 the rested sessions: three at least", RECOVERY,
     "  if (shares.length < FIRST_SET.RESTED_LEAST) return null;",
     "  if (shares.length < 1) return null;", [T_LEARNED_W], None),
    ("L8 ... from rested sessions only", RECOVERY,
     "    if (first.rested) found.push(first.read);",
     "    found.push(first.read);", [T_LEARNED_W], None),
    ("L9 what the sessions taught is kept with the log", RECOVERY,
     "  if (kept) return kept;\n  const learned = new Map<MuscleId, LearnedWindow>();",
     "  const learned = new Map<MuscleId, LearnedWindow>();", [T_LEARNED_W], None),
    # Too soon.
    ("T1 well inside: under three quarters of the window", RECOVERY,
     "    if (since < 0 || since >= TOO_SOON_SHARE * window.hours) continue;",
     "    if (since < 0 || since >= window.hours) continue;", [T_RECOVERY], None),
    ("T2 hard work only: a set to failure or three at two or closer", RECOVERY,
     "      working.filter((set) => set.targetRir <= 2).length >= 3;",
     "      working.filter((set) => set.targetRir <= 2).length >= 1;", [T_RECOVERY], None),
    ("T3 the first set 8% under its rested sessions", COACH,
     "    if (share === null || 1 - share < need) continue;",
     "    if (share === null) continue;", [T_TOO_SOON], None),
    ("T4 Not now keeps the muscle away until the week ends", COACH,
     "      source: `${TOO_SOON_SOURCE}|${muscle}|${week}`,", "      source: `${TOO_SOON_SOURCE}|${muscle}`,",
     [T_TOO_SOON], None),
    ("T5 a muscle the lighter option took is left alone", COACH,
     "    if (lighter.has(muscle)) continue;\n", "", [T_TOO_SOON, T_LIGHTER], None),
    # Fatigue.
    ("F1 a lift's estimated max read against what its sets asked", FATIGUE,
     "          askedRead(best.set, best.max, estimate),\n",
     "          { lifted: best.max, asked: null, ask: null },\n", [T_FATIGUE, T_LOAD_STEP], None),
    ("F2 ... a session saved with no targets set only against another such", AGAINST,
     "  if ((read.ask === null) !== (earlier.ask === null) || earlier.lifted <= 0) return null;\n  if (read.ask === earlier.ask) return read.lifted / earlier.lifted;",
     "  if (earlier.lifted <= 0) return null;\n  if (read.ask === null || earlier.ask === null || read.ask === earlier.ask) {\n    return read.lifted / earlier.lifted;\n  }", [T_FATIGUE, T_LEARNED_W], None),
    ("P1 the Plan's balance reads each muscle's window", PLAN,
     "    const left = window ? window.hours - hoursSince(window, now) : 0;",
     "    const left = 0;", [T_PLAN], None),
    ("P2 the schedule card says the days too soon", COACH,
     "      ...(crowded ? { footnote: crowded } : {}),\n",
     "", [T_SCHEDULE, T_LINE_CUT], None),
    ("P3 the hard start reads the learned reset", BADSTART,
     "          resets: context.resets,\n        })",
     "          resets: null,\n        })", [T_BADSTART], None),
    ("P4 the learned page shows the recovery windows", LEARNED,
     "    paceSection(input),\n    recoverySection(input),", "    paceSection(input),", [T_LEARNED_PAGE], None),
    ("P5 the completion says each muscle's window from that session", BUILDER,
     "    if (window.at !== completedAtIso) continue;\n", "", [T_PROGRESS], None),
    ("P6 the hard start expects a step less of a muscle inside its window", BADSTART,
     "    return window !== undefined && hoursSince(window, first.completedAt) < window.hours;",
     "    return false;", [T_BADSTART], None),
    # The check-in (decision 1).
    ("C1 the lifter's own four weeks, five check-ins or more", CHECKIN,
     "  const own = saved.length >= RULES.baselineLeast.value;", "  const own = false;", [T_CHECKIN], None),
    ("C2 clearly worse: never less than a point", CHECKIN,
     "mean - Math.max(1, spread * RULES.worseSpread.value)", "mean - spread * RULES.worseSpread.value",
     [T_CHECKIN], None),
    ("C3 two items lower the day", CHECKIN,
     "    lowered: worse.length >= RULES.worseItems.value || extreme !== null,",
     "    lowered: worse.length >= 1 || extreme !== null,", [T_CHECKIN], None),
    ("C4 two short nights running", CHECKIN,
     "    nightBefore !== undefined &&\n    nightBefore.readiness.sleep <= RULES.extremeSleep.value", "    true",
     [T_CHECKIN], None),
    ("C5 soreness alone never counts", CHECKIN,
     "export const CHECK_IN_ITEMS = ['energy', 'sleep', 'motivation'] as const;",
     "export const CHECK_IN_ITEMS = ['energy', 'sleep', 'motivation', 'soreness'] as const;", [T_CHECKIN],
     None),
    ("I1 a head cold keeps every set two short of failure", ENGINE,
     "    ? { sets: 0, rir: 0, restFactor: 1, rirFloor: RULES.headColdRir.value }",
     "    ? { sets: 0, rir: 0, restFactor: 1 }", [T_RECALIBRATE, T_CHECKIN], None),
    # The lighter option and the card limits (decisions 2 and 5).
    ("G1 lighter: a set fewer", ENGINE, "const LIGHTER = { sets: 1, rir: 1 } as const;",
     "const LIGHTER = { sets: 0, rir: 1 } as const;", [T_LIGHTER], None),
    ("G2 ... and a rep more in reserve", ENGINE, "const LIGHTER = { sets: 1, rir: 1 } as const;",
     "const LIGHTER = { sets: 1, rir: 0 } as const;", [T_LIGHTER], None),
    ("K1 one new card a day", COACH,
     "  if (times.filter((at) => localDayKey(at) === day).length >= RULES.cardsPerDay.value) return true;\n",
     "", [T_TOO_SOON], None),
    ("K2 three a week", COACH,
     "  return times.filter((at) => localWeekKey(at) === week).length >= RULES.cardsPerWeek.value;",
     "  return false;", [T_TOO_SOON], None),
    ("K3 a card already shown stays", COACH,
     "  if (shown[declineKey(signal)] !== undefined) return false;\n", "", [T_TOO_SOON], None),
    ("I2 a fever or aches all over: Today has nothing to start", TODAY,
     "        restToday={resting}", "        restToday={false}", [T_REST_DAY], None),
    ("X1 the history is read again once it grows", RECOVERY,
     "  if (cached && cached.signature === signatureOf(history)) return cached;",
     "  if (cached) return cached;", [T_RECOVERY], None),
    # The first review of Maintenance 33.
    ("V1 any illness keeps every set two short of failure, a fever told under way too", ENGINE,
     "  return illnessOf(readiness) !== null\n    ? { sets: 0, rir: 0, restFactor: 1, rirFloor: RULES.headColdRir.value }",
     "  return illnessOf(readiness) === 'head'\n    ? { sets: 0, rir: 0, restFactor: 1, rirFloor: RULES.headColdRir.value }", [T_FEVER, T_RECALIBRATE], None),
    ("V2 ... and says rest today", ENGINE,
     "        ...(read.illness === 'body' ? { headline: REST_TODAY } : {}),\n",
     "", [T_FEVER], None),
    ("V3 the coach offers no drop set on a day short of failure", COACH,
     "    allowsFailure(resolveStyle(input.profile)) &&\n    // A day that keeps every set short of failure (an illness) takes no drop set, as the tap would\n    // refuse (the first review of Maintenance 33).\n    !keepsShortOfFailure(input.constraints)",
     "    allowsFailure(resolveStyle(input.profile))", [T_DROP_ILL], None),
    ("V5 the Plan screen's balance reads the reset", PLANSCREEN,
     "  const resets = state.learnedResets;",
     "  const resets = null;", [T_PLAN_RESET], None),
    ("V6 the hard start's windows read today's check-in", BADSTART,
     "          readiness: told,\n          madeAt: context.madeAt ?? null,",
     "          readiness: null,\n          madeAt: context.madeAt ?? null,", [T_HARD_SHORT], None),
    ("V7 ... and the log as the rules read it", STORE,
     "      history: this.state.readHistory,\n      readiness: session.constraints.readiness,\n      checkInAfterStart:",
     "      history: this.state.history,\n      readiness: session.constraints.readiness,\n      checkInAfterStart:", [T_BADSTART_STORE, T_HARD_SHORT, T_START_READ_LOG], None),
    ("V8 lighter keeps the loads", ENGINE,
     "  if (!keepLoad && !manual?.weight && !set.asked && weight !== null && weight > 0) {",
     "  if (!manual?.weight && !set.asked && weight !== null && weight > 0) {", [T_LIGHTER, T_LIGHTER_LOADS], None),
    ("V9 ... on a lift under way too", ENGINE,
     "\n      set.kind === 'working' && !isDone(entry.id, set.index)\n        ? easedSet(set, LIGHTER.rir, exercise, entry.manual, loading, bar, true)",
     "\n      set.kind === 'working' && !isDone(entry.id, set.index)\n        ? easedSet(set, LIGHTER.rir, exercise, entry.manual, loading, bar)", [T_LIGHTER, T_LIGHTER_UNDO], None),
    ("V10 ... handed on to a lift swapped in, in its words", ENGINE,
     "      easeEntry(entry, block, taken, LIGHTER.rir, exercise, request, said, why, true);",
     "      easeEntry(entry, block, taken, ease.reserve, exercise, request, said);", [T_LIGHTER], None),
    ("V11 ... its loads kept", ENGINE,
     "      easeEntry(entry, block, taken, LIGHTER.rir, exercise, request, said, why, true);",
     "      easeEntry(entry, block, taken, LIGHTER.rir, exercise, request, said, why);", [T_LIGHTER], None),
    ("V12 a hard start's ease takes the loads down as approved", ENGINE,
     "      if (easeEntry(entry, block, take, reserve, exercise, request, take, why, !hard)) {",
     "      if (easeEntry(entry, block, take, reserve, exercise, request, take, why, true)) {", [T_EASE_LAYER, T_BADSTART_STORE, T_LIGHTER], None),
    ("V13 no mark is kept without a hard start, the lighter option in force or not", ENGINE,
     "  const eased = cloneWorkout(hardStart ? workout : withoutMarks(workout));",
     "  const eased = cloneWorkout(workout);", [T_STALE_MARK], None),
    ("V14 ... nor laid", ENGINE,
     "      if (hardStart) {\n        for (const entry of block.entries) {",
     "      if (true) {\n        for (const entry of block.entries) {", [T_STALE_MARK], None),
    ("V15 every set against what it asked: at the same ask as lifted", AGAINST,
     "  if (read.ask === earlier.ask) return read.lifted / earlier.lifted;\n",
     "", [T_FATIGUE, T_LEARNED_W, T_TOO_SOON], None),
    ("V16 ... at another, reps in the range as asked", AGAINST,
     "  const reps = Math.min(Math.max(set.reps, low), Math.max(low, high));",
     "  const reps = low;", [T_FATIGUE, T_LOAD_STEP, T_LEARNED_W], None),
    ("V17 ... at the reserve asked", AGAINST,
     "  const reserve = set.targetRir ?? set.rir ?? 0;",
     "  const reserve = set.rir ?? 0;", [T_LEARNED_W], None),
    ("V18 ... a load the plan changed is another ask", AGAINST,
     "    ask: `${weight}|${low}-${high}|${set.targetRir ?? ''}`,",
     "    ask: `${low}-${high}|${set.targetRir ?? ''}`,", [T_FATIGUE], None),
    ("V19 the first set against the rested sessions, each against what it asked", RECOVERY,
     "    .map((earlier) => againstEarlier(read, earlier))",
     "    .map((earlier) => read.lifted / earlier.lifted)", [T_DELOAD_FIRST, T_TOO_SOON, T_LEARNED_W], None),
    ("V20 ... today's with its ask", COACH,
     "      targetWeight: asked?.targetWeight,",
     "      targetWeight: null,", [T_TOO_SOON, T_DELOAD_FIRST], None),
    ("V21 the card says the hours when the first set was lifted", COACH,
     "        hours: Math.round(since),\n        window: window.hours,\n        first:",
     "        hours: Math.round(hoursSince(window, input.now)),\n        window: window.hours,\n        first:", [T_TOO_SOON], None),
    ("V22 the drift's words say against what was asked", FATIGUE,
     "      performanceAgainstAsked ||= newest?.ask !== null;\n",
     "", [T_FATIGUE], None),
    ("V23 ... and the deload advice says it so", DELOAD,
     "      fatigue.performanceAgainstAsked,\n",
     "      false,\n", [T_DELOAD], None),
    ("V24 the learned page names the \"too soon\" offer", LEARNED,
     "  if (source.startsWith(`${TOO_SOON_SOURCE}|`)) {",
     "  if (false) {", [T_LEARNED_DECLINE], None),
    ("V25 ... back with the new week", LEARNED,
     "      : week !== null\n",
     "      : false\n", [T_LEARNED_DECLINE], None),
    ("V26 ... listed only until then", LEARNED,
     "    .filter(([key]) => (nextWeek(key) ?? Infinity) > now)\n",
     "", [T_LEARNED_DECLINE], None),
    ("V27 no reserve check after a low or sore check-in", ENGINE,
     "  return lowOrSore || read.lowered || read.illness !== null;",
     "  return read.lowered || read.illness !== null;", [T_RESERVE_SORE], None),
    ("V28 the pain gate is said beside the button", SHEET,
     "          <p className={styles.text} data-testid=\"pain-gate\">\n            {PAIN_GATE_LINE}\n          </p>\n",
     "", [T_SHEET], None),
    ("V29 every reader of today's windows reads today's energy", RECOVERY,
     "    lowEnergy: readCheckIn(readiness, input.history, input.now).worse.includes('energy'),",
     "    lowEnergy: false,", [T_TOO_SOON, T_LEARNED_W, T_HARD_SHORT, T_PLAN_RESET], None),
    # No entry for the schedule card's kept check: it only spares the coach the week's rebuild each
    # minute, and the card reads the same either way.
    # The second review of Maintenance 33.
    ("W1 any illness holds every set still to come at its floor, a lift under way's too", ENGINE,
     "    (set.kind === 'drop' || (set.kind === 'working' && set.targetRir < floor));",
     "    set.kind === 'drop';", [T_HEAD_COLD_UNDER_WAY], None),
    ("W2 a set past what it asked reads as asked, no more", AGAINST,
     "  return Math.min(1, read.lifted / asked) / Math.min(1, earlier.lifted / before);",
     "  return read.lifted / asked / (earlier.lifted / before);", [T_STEP_PAST_RANGE, T_FATIGUE], None),
    ("W3 the completion reads the session's check-in", BUILDER,
     "      readiness: session.constraints.readiness,\n      // The check-in the day's its session",
     "      readiness: null,\n      // The check-in the day's its session", [T_COMPLETION_NIGHT], None),
    ("W4 a check-in from an earlier day is none of today's", RECOVERY,
     "  const today = !madeAt || localDayKey(madeAt) === localDayKey(now);",
     "  const today = true;", [T_PLAN_STALE, T_MIDNIGHT], None),
    ("W5 ... the Plan screen gives the session's day", PLANSCREEN,
     "        dayRecovery({ readiness, madeAt, history: state.readHistory, now: nowIso, resets }),",
     "        dayRecovery({ readiness, history: state.readHistory, now: nowIso, resets }),", [T_PLAN_STALE], None),
    ("W7 the reserve check never lands on a lift the plan eases", RESERVE,
     "    .filter((entry) => takesReserveCheck(entry) && !entry.eased?.sets);",
     "    .filter(takesReserveCheck);", [T_CHECK_ON_LIGHTER], None),
    ("W8 a check-in told with a hard start in force is marked so", ENGINE,
     "      if (constraints.badStart) constraints.checkInAfterStart = true;",
     "      if (false) constraints.checkInAfterStart = true;", [T_CHECK_AFTER_START], None),
    ("W9 ... the start reads none of it", BADSTART,
     "  const told = context.checkInAfterStart ? null : (context.readiness ?? null);",
     "  const told = context.readiness ?? null;", [T_CHECK_AFTER_START], None),
    ("W10 ... as the store gives it", STORE,
     "      checkInAfterStart: session.constraints.checkInAfterStart === true,",
     "      checkInAfterStart: false,", [T_CHECK_AFTER_START], None),
    ("W11 ... kept through every change", ENGINE,
     "    ...(constraints.checkInAfterStart ? { checkInAfterStart: true as const } : {}),\n", "",
     [T_CHECK_AFTER_START], None),
    ("W12 ... a mark that cannot be read is dropped alone", SESSION,
     "  checkInAfterStart: z.literal(true).optional().catch(undefined),",
     "  checkInAfterStart: z.literal(true).optional(),", [T_CHECK_AFTER_START_STORED], None),
    ("W13 a preview made again keeps Lighter", STORE,
     "      (today.lighter?.length ?? 0) > 0 ||\n", "", [T_LIGHTER_PREVIEW], None),
    ("W14 a lift swapped back owes its sets eased as Lighter eased them", ENGINE,
     "  const eased = exercise.primaryMuscles.some((muscle) => lighter.has(muscle));",
     "  const eased = false;", [T_LIGHTER_SWAP_BACK], None),
    ("W15 too soon reads today's first set as the rules read the log", COACH,
     "      rir: readLoggedReserve(first, input.reserveEstimate ?? null),",
     "      rir: first.rir,", [T_FIRST_SET_READ], None),
    ("W16 ... the coach is given the estimate", USECOACH,
     "    reserveEstimate: parts.readEstimate ?? null,\n", "", [T_COACH_ESTIMATE], None),
    ("W17 ... the store keeps it beside the read log", STORE,
     "      next.readEstimate = this.reserveReadOf(next);\n", "", [T_PROGRESS_RESERVE], None),
    ("W18 a reserve check taken to failure sets the window a set to failure sets", RECOVERY,
     "  if (set.reserveCheck && !set.reserveCheck.stopped) return 0;\n", "", [T_CHECK_FAILURE], None),
    ("W19 the long-length lifts include the dumbbell Romanian deadlift", RECOVERY,
     "  'dumbbell-romanian-deadlift',\n", "", [T_LONG_VARIANTS], None),
    ("W20 ... and the cable overhead extension", RECOVERY,
     "  'cable-overhead-triceps-extension',\n", "", [T_LONG_VARIANTS], None),
    # The third review of Maintenance 33.
    ("Z1 the day's floor keeps what each set it holds was", ENGINE,
     "      if (short(entry, set) && !kept.has(set.index)) kept.set(set.index, cloneSet(set));\n", "",
     [T_ILLNESS_BACK], None),
    ("Z2 ... every change is made to the plan under it", ENGINE,
     "    const bare = underTheEase(underTheFloor(shown, request.completed), request.completed);",
     "    const bare = underTheEase(shown, request.completed);", [T_ILLNESS_BACK], None),
    ("Z3 ... with each set's reserve back", ENGINE,
     "        targetRir: before.targetRir,\n", "", [T_ILLNESS_BACK], None),
    ("Z4 ... and a drop set it took", ENGINE,
     "      entry.sets = [...entry.sets, ...drops.map(cloneSet)];", "      entry.sets = [...entry.sets];",
     [T_ILLNESS_BACK, T_FLOOR_RECORD], None),
    ("Z5 ... a set logged under it keeps its record", ENGINE,
     "    if (logged.length > 0) entry.floored = logged;\n    else delete entry.floored;",
     "    delete entry.floored;", [T_ILLNESS_BACK, T_LIGHTER_FIRST, T_FLOOR_RECORD], None),
    ("Z6 the hard start reads a set eased at its load against the plan's ask", BADSTART,
     "  const asked = planSetAt(entry, set);", "  const asked = set;", [T_LIGHTER_FIRST], None),
    ("Z7 a swap back keeps \"Lighter\" with a hard start in force", ENGINE,
     "  const lighter = new Set(request.constraints.lighter ?? []);",
     "  const lighter = new Set(request.constraints.badStart ? [] : (request.constraints.lighter ?? []));",
     [T_HARD_LIGHTER_BACK], None),
    ("Z8 ... and the plan's record kept when it stopped", ENGINE,
     "  const kept = stopped.stopped?.record?.sets ? stopped.stopped.record : null;",
     "  const kept = null;", [T_LIGHTER_COPY], None),
    ("Z9 ... which the stop keeps", GENERATE,
     "    entry.stopped = { owed, why, ...(record ? { record } : {}) };",
     "    entry.stopped = { owed, why };", [T_LIGHTER_COPY], None),
    ("Z10 ... else the lift with what it owes as the plan has it", ENGINE,
     "    ? (kept ?? recordOf({ ...stopped, sets: [...stopped.sets, ...planOwes] }, stoppedBlock))",
     "    ? (kept ?? recordOf(stopped, stoppedBlock))", [T_LIGHTER_COPY, T_STANDIN_BACK], None),
    ("Z11 a rest day offers nothing that changes today's workout", COACH,
     "    .filter((signal) => !restToday(input) || !changesToday(signal));", "",
     [T_FEVER_OFFER, T_FEVER_HEAVIER, T_REST_TOO_SOON], None),
    ("Z12 ... no change to it", COACH,
     "    kind === 'recalibrate' || kind === 'rest' || kind === 'alternatives' || kind === 'lasting-swap'",
     "    kind === 'rest' || kind === 'alternatives' || kind === 'lasting-swap'", [T_FEVER_HEAVIER], None),
    ("Z13 the mark of a check-in told under a hard start goes with it", ENGINE,
     "        delete constraints.checkInAfterStart;\n", "", [T_CHECKIN_MARK], None),
    ("Z14 the read log and its estimate are read again together", STORE,
     "      this.setState({ readHistory, readEstimate });", "      this.setState({ readHistory });",
     [T_ESTIMATE_DAY], None),
    ("Z15 the completion's windows read the session's day", BUILDER,
     "      madeAt: checkInDayOf(session),\n", "", [T_MIDNIGHT], None),
    ("Z16 the coach's \"too soon\" reads the session's day", COACH,
     "    madeAt: input.madeAt ?? null,\n", "", [T_MIDNIGHT, T_MIDNIGHT_COACH], None),
    ("Z17 ... and the hard start", BADSTART,
     "          madeAt: context.madeAt ?? null,\n", "", [T_MIDNIGHT, T_HARD_SHORT], None),
    ("Z18 the learned page's recovery reads the log as the rules read it", LEARNED,
     "      input.readHistory ?? input.history,", "      input.history,", [T_LEARNED_READ], None),
    ("Z19 ... the page gives it that log", LEARNEDPAGE, "            readHistory,\n", "",
     [T_LEARNED_READ], None),
    ("Z20 the cable fly is long-length work", RECOVERY, "  'cable-fly',\n", "", [T_LONG_FLY], None),
    ("Z21 the floor's record dropped alone when unreadable", SCHEMA,
     "  floored: z.array(SetPrescriptionSchema).optional().catch(undefined),\n", "",
     [T_LAYERS_SCHEMA], None),
    ("Z22 ... and the record a stop keeps", SCHEMA,
     "      record: EasedRecordSchema.optional().catch(undefined),\n", "", [T_LAYERS_SCHEMA], None),
    ("Z23 ... as many sets as the stand-in's record had still to come", ENGINE,
     "  const planned = spec ? Math.min(Math.max(count, standIn), room) : Math.max(count, standIn);",
     "  const planned = count;", [T_STANDIN_BACK], None),
    # The fourth review of Maintenance 33.
    ("Z24 every plan of the day keeps the day's check-in", STORE,
     "    this.setSession(this.withDayCheckIn(made, checkIn === undefined ? before : checkIn));",
     "    this.setSession(made);", [T_LOADED_ILLNESS, T_CHECKIN_CARRIED], None),
    ("Z25 ... a saved workout loaded too", STORE,
     "    this.setSession(this.withDayCheckIn(loaded, session));", "    this.setSession(loaded);",
     [T_LOADED_ILLNESS, T_CHECKIN_CARRIED], None),
    ("Z26 ... the plan after the completion closed, a workout done or not", STORE,
     "    this.ensureSession(trained ? null : session, session);",
     "    this.ensureSession(trained ? null : session);", [T_LOADED_ILLNESS], None),
    ("Z27 ... at the time it was told", STORE,
     "      constraints: { ...result.constraints, checkInAt: told },",
     "      constraints: result.constraints,", [T_CHECKIN_CARRIED], None),
    ("Z28 ... told today, none of another day's", STORE,
     "    if (localDayKey(told) !== localDayKey(this.now())) return session;\n", "",
     [T_CHECKIN_CARRIED], None),
    ("Z29 ... applied as told, the plan planned with it", STORE,
     "    const summary = session.lastSummary;\n    return {\n      ...session,\n      workout: result.workout,",
     "    const summary = session.lastSummary;\n    return {\n      ...session,\n      workout: session.workout,",
     [T_LOADED_ILLNESS], None),
    ("Z30 a stored check-in time dropped alone when unreadable", SESSION,
     "  checkInAt: z.iso.datetime().optional().catch(undefined),",
     "  checkInAt: z.iso.datetime().optional(),", [T_CHECKIN_AT_STORED], None),
    ("Z31 a check-in's words read the plan with the day's floor laid again", ENGINE,
     "      const change = dayChange(\n        { ...request, workout: layer.shown },\n        heldToTheDay(workout, request, constraints),\n      );\n      // Sets are named",
     "      const change = dayChange({ ...request, workout: layer.shown }, workout);\n      // Sets are named",
     [T_HEAD_COLD_WORDS], None),
    ("Z33 a swap back works out what the lift owes from the plan's own top set, eased once", ENGINE,
     "    eased ? kept?.sets?.find((set) => set.tier === 'top') : undefined,",
     "    undefined,", [T_LIGHTER_BEFORE_TOP], None),
    ("Z34 ... its reserve and its reps", ENGINE,
     "  const shape = planTop ?? after.top;", "  const shape = after.top;",
     [T_LIGHTER_BEFORE_TOP], None),
    ("Z35 a lift picked up again under \"Lighter\" comes back eased as it went", ENGINE,
     "      layer.finish(lighterPickedUp(outcome.workout, plain, constraints), constraints),",
     "      layer.finish(outcome.workout, constraints),", [T_LIGHTER_PICKED_UP], None),
    ("Z36 ... with the record of the plan its stop kept", ENGINE,
     "      entry.eased = { ...(record?.sets ? record : recordOf(entry, block)), kept: true };\n",
     "", [T_LIGHTER_PICKED_UP], None),
    ("Z37 the way out of the workout stays on a rest day", COACH,
     "    kind === 'recalibrate' || kind === 'rest' || kind === 'alternatives' || kind === 'lasting-swap'",
     "    kind === 'recalibrate' ||\n    kind === 'rest' ||\n    kind === 'alternatives' ||\n    kind === 'finish' ||\n    kind === 'lasting-swap'",
     [T_FEVER_FINISH], None),
    ("Z38 a saved copy is the plan under the day's floor", ENGINE,
     "  const restored = cloneWorkout(underTheFloor(workout, emptyCompleted()));",
     "  const restored = cloneWorkout(workout);", [T_SAVED_FLOOR], None),
    ("Z39 a check-in is the day's it was told", ENGINE,
     "      constraints.checkInAt = request.timestamp;\n", "", [T_PAST_MIDNIGHT], None),
    ("Z40 ... read so by every reader of the day", SESSION,
     "  return session.constraints.checkInAt ?? session.createdAt;",
     "  return session.createdAt;", [T_PAST_MIDNIGHT, T_CHECKIN_AT_STORED], None),
    ("Z41 ... kept through every change", ENGINE,
     "    ...(constraints.checkInAt ? { checkInAt: constraints.checkInAt } : {}),\n", "",
     [T_PAST_MIDNIGHT, T_CHECKIN_CARRIED, T_PAST_MIDNIGHT_STORE], None),
    ("Z42 ... the hard start's reading in the store", STORE,
     "      madeAt: checkInDayOf(session),", "      madeAt: session.createdAt,",
     [T_PAST_MIDNIGHT, T_PAST_MIDNIGHT_STORE], None),
    ("Z43 ... the coach's", USECOACH,
     "    madeAt: checkInDayOf(session),", "    madeAt: session.createdAt,",
     [T_MIDNIGHT, T_MIDNIGHT_COACH, T_COACH_PAST_MIDNIGHT], None),
    ("Z44 ... the plan screen's", PLANSCREEN,
     "  const madeAt = state.session ? checkInDayOf(state.session) : null;",
     "  const madeAt = state.session?.createdAt ?? null;", [T_MIDNIGHT, T_PLAN_PAST_MIDNIGHT], None),
    # The fifth review of Maintenance 33.
    ("Z45 a set taken back is held at the day's floor again", STORE,
     "      workout: this.underDayFloor(\n        left,\n        this.backOffsAsPlanned(left, session.completed.sets.at(-1), isDone),\n      ),",
     "      workout: this.backOffsAsPlanned(left, session.completed.sets.at(-1), isDone),",
     [T_UNDO_HEAD_COLD], None),
    ("Z46 ... a set deleted in its correction too", STORE,
     "      workout: this.underDayFloor(\n        left,\n        this.backOffsAsPlanned(left, { entryId, setIndex }, isDone),\n      ),",
     "      workout: this.backOffsAsPlanned(left, { entryId, setIndex }, isDone),",
     [T_UNDO_HEAD_COLD], None),
    ("Z47 ... the floor laid as the engine lays it", ENGINE,
     "  return heldToTheDay(workout, context, context.constraints);", "  return workout;",
     [T_UNDO_HEAD_COLD], None),
    ("Z48 a record keeps when its check-in was told", BUILDER,
     "    ...(session.constraints.readiness && session.constraints.checkInAt\n      ? { checkInAt: session.constraints.checkInAt }\n      : {}),\n",
     "", [T_CHECKIN_BASELINE], None),
    ("Z49 ... one told check-in counted once", CHECKIN,
     "    if (told.has(record.checkInAt)) return false;\n", "", [T_CHECKIN_BASELINE], None),
    ("Z50 ... in the lifter's own baseline", CHECKIN,
     "  return oncePerCheckIn(\n", "  return ((records: WorkoutRecord[]) => records)(\n",
     [T_CHECKIN_BASELINE], None),
    ("Z51 ... and among the recent check-ins the deload reads", FATIGUE,
     "  const readinessTrend = oncePerCheckIn(qualifying.slice(0, 3)).filter(",
     "  const readinessTrend = qualifying.slice(0, 3).filter(", [T_CHECKIN_BASELINE], None),
    ("Z52 \"Lighter\" picked up again gives its back-offs the plan's top set's shape", ENGINE,
     "          const planned = shape && set.tier === 'back-off' ? { ...set, ...shape } : set;",
     "          const planned = set;", [T_LIGHTER_PLACE_BACK], None),
    ("Z53 ... and takes its set where no ease took one before the stop", ENGINE,
     "              toCome.length,\n            );\n      const gone = new Set(toCome.slice(toCome.length - take));",
     "              toCome.length,\n            );\n      const gone = new Set<SetPrescription>();",
     [T_LIGHTER_AFTER_SWAP], None),
    ("Z54 ... never where one did", ENGINE,
     "        record?.sets || entry.manual?.sets === true\n          ? 0",
     "        entry.manual?.sets === true\n          ? 0", [T_LIGHTER_PICKED_UP, T_LIGHTER_PLACE_BACK], None),
    ("Z55 a check-in carried onto a loaded copy says what it changed", STORE,
     "              details: [...summary.details, `Today's check-in kept: ${result.summary.headline}`],",
     "              details: summary.details,", [T_LOADED_WORDS], None),
    ("Z56 a copy gives what stood in for a lift \"Lighter\" eased under way the sets it took", ENGINE,
     "  const plan = withoutStops(withLighterTaken(restored));", "  const plan = withoutStops(restored);",
     [T_LIGHTER_SWAP_COPY], None),
    ("Z57 ... the lighter option's record marked as its own", ENGINE,
     "  entry.eased = { ...recordOf(entry, block), kept: true, lighter: true };",
     "  entry.eased = { ...recordOf(entry, block), kept: true };", [T_LIGHTER_SWAP_COPY], None),
    ("Z58 \"Lighter\" takes a set off a stand-in unless an ease took one from the lift it took over", ENGINE,
     "    (hard ? handed.length > 0 : handed.some((lift) => lift.stopped?.record?.sets !== undefined));",
     "    handed.length > 0;", [T_LIGHTER_AFTER_SWAP], None),
    ("Z59 ... the hard start's never", ENGINE,
     "      const take = easeTake(entry, eased.blocks, fewer, working.length, hard);",
     "      const take = easeTake(entry, eased.blocks, fewer, working.length, false);",
     [T_EASE_LAYER, T_LIGHTER_AFTER_SWAP], None),
    ("Z60 ... its floor the slot's", ENGINE,
     "      ? Math.min(count + did - setFloor(entry.role), count - 1)",
     "      ? count - setFloor(entry.role)", [T_LIGHTER_AFTER_SWAP], None),
    ("Z61 a copy saved on a head-cold preview is the plan without the illness", STORE,
     "      workout: planUnderTheEase(this.planWithoutIllness(session)),",
     "      workout: planUnderTheEase(session.workout),", [T_HEAD_COLD_PREVIEW], None),
    ("Z62 ... the check-in made again without it", STORE,
     "    delete well.illness;\n", "", [T_HEAD_COLD_PREVIEW], None),
    ("Z63 \"Lighter\" holds on every plan of the day", STORE,
     "        ? (from.constraints.lighter ?? [])", "        ? []", [T_LIGHTER_LATER_PLAN], None),
    ("Z64 ... laid on it", STORE,
     "    if (carried !== base || lighter.length === 0) return carried;", "    return carried;",
     [T_LIGHTER_LATER_PLAN], None),
    ("Z65 ... one taken another day none of it", STORE,
     "      localDayKey(from.createdAt) === localDayKey(this.now())", "      true",
     [T_LIGHTER_LATER_PLAN], None),
    ("Z66 ... never a hard start's: its copy keeps what its ease left", ENGINE,
     "      (lift) => lift.stopped?.record?.lighter && lift.stopped.record.sets,",
     "      (lift) => lift.stopped?.record?.sets,", [T_EASE_LAYER], None),
    # The fresh review before shipping (2026-10-30).
    ("Y1 the store starts no workout on a fever's rest day", STORE,
     "    if (illnessOf(session.constraints.readiness) === 'body') return;\n", "",
     [T_FEVER_WORKOUT_TAB], None),
    ("Y2 the Workout tab shows the rest day, with no Start", WORKOUT_SCREEN,
     "  const resting = illnessOf(session.constraints.readiness) === 'body';",
     "  const resting = false;", [T_FEVER_WORKOUT_TAB], None),
    ("Y3 each lift's window in its own region", RECOVERY,
     "    const region = lowerCompound(exercise) ? 'lower' : 'upper';",
     "    const region = record.entries.some((other) => {\n      const lift = getExercise(other.exerciseId);\n      return lift !== undefined && lift.primaryMuscles.includes(muscle) && lowerCompound(lift) && other.sets.some(isHard);\n    })\n      ? 'lower'\n      : 'upper';",
     [T_LONGEST], None),
    ("Y4 the window that ends latest, not the newest", RECOVERY,
     "    const newest = latestEnding(index.windows.get(muscle) ?? []);",
     "    const newest = (index.windows.get(muscle) ?? []).at(-1);", [T_LONGEST, T_RECOVERY], None),
    ("Y5 a session inside any earlier window is not rested", RECOVERY,
     "    for (const item of index.windows.get(muscle) ?? []) {\n      if (item.time >= start) break;\n      // Inside any earlier window still running, not only the newest one (the fresh review).\n      if ((start - item.time) / HOUR_MS < item.window.prior) return false;\n    }",
     "    let last: { window: RecoveryWindow; time: number } | null = null;\n    for (const item of index.windows.get(muscle) ?? []) {\n      if (item.time >= start) break;\n      last = item;\n    }\n    if (last && (start - last.time) / HOUR_MS < last.window.prior) return false;",
     [T_LONGEST, T_RECOVERY, T_LEARNED_W], None),
    ("Y6 a re-exposure inside any earlier window is early", RECOVERY,
     "      const inside = earlier.some((last) => (start - Date.parse(last.at)) / HOUR_MS < last.prior);",
     "      const last = earlier[earlier.length - 1] as RecoveryWindow;\n      const inside = (start - Date.parse(last.at)) / HOUR_MS < last.prior;",
     [T_LONGEST, T_LEARNED_W], None),
    ("Y7 a saved check-in is read on the day it was told", CHECKIN,
     "  return record.checkInAt ?? record.startedAt;", "  return record.startedAt;",
     [T_TOLD_AT, T_CHECKIN], None),
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
        wrong = summary is None or (re.search(r"Test timed out", out) is not None and not asserted)
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
