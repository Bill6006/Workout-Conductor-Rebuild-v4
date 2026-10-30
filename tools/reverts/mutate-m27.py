"""Maintenance 27 mutation checks: revert each round I rule alone, run its tests, expect a failure,
restore. Prints KILLED (a test failed) or SURVIVED (every test still passed).

  python mutate-m27.py --repo=PATH            run every M27 entry in a copy of the repository
  python mutate-m27.py --repo=PATH 44 45a     run the entries whose names start with these
  python mutate-m27.py --repo=PATH --check    only check that every anchor is found once

The table below is data: nothing in it runs. Earlier rounds' tables run from their own runners
(mutate-m26.py --all), never from here.
"""
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

RC = "src/engine/progression/reserveCheck.ts"
CURVE = "src/engine/progression/personalCurve.ts"
PROG = "src/engine/progression/progression.ts"
STORE = "src/core/state/appStore.ts"
LOGGER = "src/components/SetLogger/SetLogger.tsx"
PUSH = "src/engine/planning/pushLift.ts"
PACE = "src/engine/planning/pushPace.ts"
GEN = "src/engine/workoutGenerator/generate.ts"
TYPES = "src/engine/workout/types.ts"
COACH = "src/engine/coach/coachConductor.ts"
RECAL = "src/engine/recalibration/recalibrate.ts"
BUILDER = "src/core/state/workoutRecordBuilder.ts"
PAIN = "src/engine/recovery/painPattern.ts"
CARD = "src/components/AdaptiveCoach/AdaptiveCoachCard.tsx"
FIT = "src/engine/planning/scheduleFit.ts"
SCHEDULE_ED = "src/features/profile/editors/ScheduleEditor.tsx"
PUSH_ED = "src/features/profile/editors/PushLiftEditor.tsx"
OVERRIDES = "src/engine/progression/overrides.ts"
LEARNED = "src/engine/learned/learned.ts"
LEARNED_UI = "src/features/settings/LearnedValues.tsx"
VARIETY = "src/engine/strategy/variety.ts"

T_RC = "src/engine/progression/reserveCheck.test.ts"
T_RC_STORE = "src/core/state/appStore.reserveCheck.test.ts"
T_LOGGER = "src/components/SetLogger/SetLogger.check.test.tsx"
T_CURVE = "src/engine/progression/personalCurve.test.ts"
T_PCURVE = "src/engine/progression/progression.curve.test.ts"
T_PUSH = "src/engine/planning/pushLift.test.ts"
T_PUSH_SIM = "src/engine/planning/pushLift.simulation.test.ts"
T_GEN_PUSH = "src/engine/workoutGenerator/generate.push.test.ts"
T_PACE = "src/engine/planning/pushPace.test.ts"
T_PUSH_COACH = "src/engine/coach/coachConductor.push.test.ts"
T_PUSH_STORE = "src/core/state/appStore.pushLift.test.ts"
T_PUSH_ED = "src/features/profile/editors/PushLiftEditor.test.tsx"
T_PUSH_CARD = "src/features/progress/pushCard.test.ts"
T_PAIN = "src/engine/recovery/painPattern.test.ts"
T_PAIN_COACH = "src/engine/coach/coachConductor.painPattern.test.ts"
T_PAIN_STORE = "src/core/state/appStore.painPattern.test.ts"
T_FIT = "src/engine/planning/scheduleFit.test.ts"
T_FIT_COACH = "src/engine/coach/coachConductor.schedule.test.ts"
T_REALWEEK = "src/engine/workoutGenerator/generate.realWeek.test.ts"
T_REALWEEK_STORE = "src/core/state/appStore.realWeek.test.tsx"
T_LEARNED = "src/engine/learned/learned.test.ts"
T_LEARNED_STORE = "src/core/state/appStore.learned.test.tsx"
T_VARIETY = "src/engine/strategy/variety.test.ts"
T_VARIETY_COACH = "src/engine/coach/coachConductor.variety.test.ts"

T_LEARNED_PAGE = "src/core/state/appStore.learned.test.tsx"
T_PUSH_REVIEW = "src/engine/workoutGenerator/generate.pushReview.test.ts"
T_TAPS = "src/features/today/coachTaps.screens.test.tsx"
T_REALWEEK_GEN = "src/engine/workoutGenerator/generate.realWeek.test.ts"
SCREEN_TODAY = "src/features/today/TodayScreen.tsx"
RESETS = "src/engine/learned/resets.ts"
SCREEN_ACTIVE = "src/features/workout/ActiveWorkoutScreen.tsx"
PLATEAU = "src/engine/strategy/plateau.ts"
PUSH_CARD = "src/features/progress/pushCard.ts"
LOCAL_DATE = "src/core/time/localDate.ts"
T_PUSH_RECHECK = "src/engine/workoutGenerator/generate.pushRecheck.test.ts"
T_RECHECK4749 = "src/core/state/appStore.recheck4749.test.ts"
T_CHECK_SCREENS = "src/features/workout/reserveCheck.screens.test.tsx"
T_PLATEAU = "src/engine/strategy/plateau.test.ts"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # Item 43: how well the lifter judges reps in reserve.
    ("43a a check goes only on a single-joint lift", RC,
     "    !exercise.compound &&\n    exercise.load === 'stack' &&", "    exercise.load === 'stack' &&",
     [T_RC], None),
    ("43b a check stopped for pain or form counts for nothing", RC,
     "  if (reading.failedEarly || reading.stopped || reading.judged === null) return null;",
     "  if (reading.failedEarly || reading.judged === null) return null;", [T_RC], None),
    ("43c a reading past twenty reps counts for nothing", RC,
     "  if (reading.total < reading.stop || reading.total > RESERVE_CHECK.MAX_TOTAL) return null;",
     "  if (reading.total < reading.stop) return null;", [T_RC], None),
    ("43d the estimate needs four readings to act", RC,
     "    n >= RESERVE_CHECK.USABLE_READINGS &&", "    n >= 1 &&", [T_RC], None),
    ("43e the correction is capped at two", RC,
     "    ? Math.max(-RESERVE_CHECK.MAX_CORRECTION, Math.min(RESERVE_CHECK.MAX_CORRECTION, whole)) || 0",
     "    ? whole || 0", [T_RC], None),
    ("43f the correction reads only sets in its band", RC,
     "  if (total < estimate.band[0] || total > estimate.band[1]) return rir;",
     "  if (false) return rir;", [T_RC], None),
    ("43g checks are off under a style that takes nothing to failure", RC,
     "  const on = input.profile.reserveCheck === true && allowsFailure(style);",
     "  const on = input.profile.reserveCheck === true;", [T_RC], None),
    ("43h no check on a deload day, a low check-in or a hard start", RC,
     # Re-anchored in Maintenance 31 (round M): the line holds a day off the plan too (a catch-up or
     # a second workout); the revert takes out the three days and leaves that one.
     "  if (input.day.deload || input.day.lowCheckIn || input.day.hardStart || input.day.offPlan) {",
     "  if (input.day.offPlan) {", [T_RC], None),
    ("43i no check the first session back after three weeks", RC,
     "  if (latest !== null && daysBetween(latest, input.now) >= RESERVE_CHECK.RETURN_DAYS) return null;",
     "", [T_RC], None),
    ("43j a check takes a set whose reps and reserve are at most thirteen", RC,
     "  return Boolean(last && last.targetReps[0] + last.targetRir <= RESERVE_CHECK.ELIGIBLE_BAND);",
     "  return Boolean(last);", [T_RC], None),
    ("43k a run restarts after six weeks without a reading", RC,
     "  if (last && daysBetween(last.at, options.now) >= RESERVE_CHECK.RESTART_DAYS) return [];", "",
     [T_RC], None),
    ("43l a check is weekly while learning", RC,
     "        ? localWeekKey(lastAt) !== localWeekKey(input.now)", "        ? true", [T_RC], None),
    ("43m the check's numbers stay only on the check set", STORE,
     "      (checkSet?.entryId === entryId && checkSet.setIndex === setIndex);", "      true;",
     [T_RC_STORE], None),
    ("43n a skipped set keeps no check numbers", STORE,
     "  ): { reserveCheck?: ReserveCheckLog } {\n    if (skipped) return {};",
     "  ): { reserveCheck?: ReserveCheckLog } {", [T_RC_STORE], None),
    ("43o stalled early logs the reps in all at no reserve", LOGGER,
     "      reps: failedEarly ? all : clampReps(final.reps),", "      reps: clampReps(final.reps),",
     [T_LOGGER], None),
    ("43p the reserve reset starts learning again", STORE,
     "      // Reset (item 47): learning starts again from the checks after it.\n      resetAt: state.learnedResets.reserve ?? null,",
     "      resetAt: null,", [T_LEARNED_STORE, T_RC_STORE], None),

    # Item 41: each lift's own reps-to-weight curve, gated on item 43's sets to failure.
    ("41a a check stopped before failure is no reading for the curve", CURVE,
     "        !reading.stopped &&\n        reading.weight !== null &&", "        reading.weight !== null &&",
     [T_CURVE], None),
    ("41b readings older than twelve weeks are left out", CURVE,
     "        (Date.parse(now) - Date.parse(reading.at)) / DAY_MS <= PERSONAL_CURVE.WINDOW_DAYS &&",
     "", [T_CURVE, T_PCURVE], None),
    ("41c a pair needs reps far enough apart", CURVE,
     "  if (!(gap > 0) || lighter.reps - heavier.reps < PERSONAL_CURVE.PAIR_REPS) return null;",
     "  if (!(gap > 0)) return null;", [T_CURVE], None),
    ("41d a pair needs days close together", CURVE,
     "  if (daysApart(heavier, lighter) > PERSONAL_CURVE.PAIR_DAYS) return null;", "",
     [T_CURVE], None),
    ("41e the curve acts only once sure or clearly different", CURVE,
     "    active: pairs.length > 0 && (sd <= PERSONAL_CURVE.ACTIVE_SD || different(k, sd)),",
     "    active: pairs.length > 0,", [T_CURVE], None),
    ("41f the curve speaks only within its span", CURVE,
     "  if (!curve.active || !withinSpan(curve, fromReps) || !withinSpan(curve, toReps)) return null;",
     "  if (!curve.active) return null;", [T_CURVE], None),
    ("41g a target follows the curve where it acts", PROG,
     "    if (exact === null) return { ...rule, lines: [] as string[] };",
     "    return { ...rule, lines: [] as string[] };", [T_PCURVE], None),
    ("41h the curve reset forgets it", PROG,
     "      : liftCurve(input.history, exercise.id, input.now, input.resets?.curves ?? null);",
     "      : liftCurve(input.history, exercise.id, input.now, null);", [T_PCURVE], None),

    # Item 44: a lift to push.
    ("44a a deload week pauses the push", PUSH,
     "  if (!active || input.deload) return null;", "  if (!active) return null;", [T_PUSH, T_GEN_PUSH], None),
    ("44b its own place gives way the day after, and at three sessions a week", PUSH,
     "  const natural = week.exact < most && (since === null || since >= PUSH_LIFT.NATURAL_DAYS);",
     "  const natural = true;", [T_PUSH, T_GEN_PUSH], None),
    ("44c one extra a calendar week", PUSH,
     "    week.extrasThisWeek > 0", "    false", [T_PUSH, T_PUSH_SIM], None),
    ("44d no extra where the plan already gives about three", PUSH,
     "      : week.ownPerWeek > most - 1", "      : false", [T_PUSH, T_PUSH_SIM], None),
    ("44e the extra waits two days, three after a heavy session", PUSH,
     "          : since !== null && since < spacing", "          : false", [T_PUSH, T_PUSH_SIM, T_GEN_PUSH], None),
    ("44f 72 hours after five sets or failure", PUSH,
     "    week.last && (week.last.sets >= PUSH_LIFT.HEAVY_SETS || week.last.failure)", "    false",
     [T_PUSH], None),
    ("44g a week with the extra keeps each session to three sets", PUSH,
     "  const shared = week.extras > 0 || week.exact + 1 >= PUSH_LIFT.MAX_EXPOSURES;",
     "  const shared = false;", [T_PUSH, T_GEN_PUSH], None),
    ("44h Lean-down takes two a session", PUSH,
     "    ? Math.min(lean ? PUSH_LIFT.LEAN_SETS : PUSH_LIFT.SESSION_SETS, room)",
     "    ? Math.min(PUSH_LIFT.SESSION_SETS, room)", [T_PUSH, T_GEN_PUSH], None),
    ("44i never to failure", PUSH,
     "  return Math.max(PUSH_LIFT.MIN_RIR, rir);", "  return rir;", [T_GEN_PUSH], None),
    ("44j its slot keeps its place, so a stand-in does not lead", GEN,
     "  for (let index = 0; index < slots.length; index += 1) {\n    if (!filled.has(index)) fillFrom(index);\n",
     "  if (pushSlot > 0) fillFrom(pushSlot);\n"
     "  for (let index = 0; index < slots.length; index += 1) {\n    if (!filled.has(index)) fillFrom(index);\n",
     [T_GEN_PUSH], None),
    ("44k it leads, kept from before a rebuild too", GEN,
     "  entries.splice(\n    0,\n    entries.length,\n    ...leading,\n    ...entries.filter((entry) => !leading.includes(entry)),\n  );\n",
     "", [T_GEN_PUSH], None),
    ("44l the time fit never leaves it out", GEN,
     "    entry.id === pushEntry?.id ||\n", "", [T_GEN_PUSH], None),
    ("44m the extra waits for a next session with the lift's own place", GEN,
     "        return waits('the next session has its own place for it');",
     "        void waits;", [T_GEN_PUSH, T_PUSH_SIM], None),
    ("44n the extra waits when a muscle would pass twenty", GEN,
     "    if (over.length > 0) {", "    if (false) {", [T_GEN_PUSH], None),
    ("44o the cap takes sets off an isolation lift first", PUSH,
     "        work.trimmable &&\n", "        false &&\n", [T_PUSH, T_GEN_PUSH], None),
    ("44p the extra gives back its own sets, down to two", PUSH,
     "    while (excess > 0 && (setsLeft.get(input.extraId) ?? 0) > PUSH_LIFT.EXTRA_SETS_FEWER) {",
     "    while (false) {", [T_PUSH], None),
    ("44q the extra is not the day's main lift", GEN,
     "      (entry) => entry.role === 'primary-strength' && !isStopped(entry) && entry.push !== 'extra',",
     "      (entry) => entry.role === 'primary-strength' && !isStopped(entry),",
     [T_GEN_PUSH, T_PUSH_RECHECK], None),
    ("44r a lift with no room gives its place up", GEN,
     "  const givesWay = push && (!push.natural || offPlan) ? [push.exercise.id] : [];",
     "  const givesWay: string[] = [];", [T_GEN_PUSH, T_PUSH_SIM], None),
    ("44s a swap takes no push mark", TYPES,
     "  return entry.replacedFrom === undefined ? entry.push : undefined;", "  return entry.push;",
     [T_PUSH_STORE], None),
    ("44t a change to the push rebuilds the plan", STORE,
     "      profile.pushLift ?? null,\n", "", [T_PUSH_STORE], None),
    ("44u its muscles get no added work from the coach", COACH,
     "    .filter((signal) => !addsToPushedMuscles(input, signal))\n", "", [T_PUSH_COACH], None),
    ("44v the coach offers to end a push that falls short twice", COACH,
     "  const falling = shortTwiceRunning(input.history, exercise.id, push.since);",
     "  const falling = null;",
     [T_PUSH_COACH], None),
    ("44w a review each twelve weeks", COACH,
     "  if (block >= 1) {", "  if (false) {", [T_PUSH_COACH], None),
    ("44x a pace shows after six weeks and ten readings", PACE,
     "  const enough = weeks >= PUSH_PACE.SHOW_WEEKS && readings.length >= PUSH_PACE.SHOW_READINGS;",
     "  const enough = true;", [T_PACE, T_PUSH_CARD], None),
    ("44y a reading far off the line is set aside", PACE,
     "    if (\n      worst &&\n      without &&", "    if (\n      false &&\n      without &&",
     [T_PACE], None),
    ("44z each rep range at its own level", PACE,
     "    groups.set(reading.range, [...(groups.get(reading.range) ?? []), reading]);",
     "    groups.set('any', [...(groups.get('any') ?? []), reading]);", [T_PACE], None),
    ("44za the editor keeps the push's start while the target changes", PUSH_ED,
     "      since: same && push ? push.since : nowIso(),", "      since: nowIso(),", [T_PUSH_ED], None),
    ("44zb an emptied target field is not a stop", PUSH_ED,
     "    if (!lift || target === undefined || !(target > 0) || target > 5000) return;",
     "    if (!lift) return;\n    if (target === undefined || !(target > 0) || target > 5000) {\n      save(undefined);\n      return;\n    }",
     [T_PUSH_ED], None),

    # Item 45: pain patterns over weeks.
    ("45a a pain report keeps its exercise", RECAL,
     "        { exerciseId: entry.exerciseId, joint: trigger.joint },",
     "        { exerciseId: 'unknown', joint: trigger.joint },", [T_PAIN_STORE], None),
    ("45b the saved workout keeps the reports", BUILDER,
     "    painReports: (session.constraints.painReports ?? []).map((report) => ({ ...report })),",
     "    painReports: [],", [T_PAIN_STORE], None),
    ("45c a rating counts only where one exercise loaded the joint", PAIN,
     "    if (loading.length === 1) add(joint, loading[0] as string);",
     "    for (const id of loading) add(joint, id);", [T_PAIN], None),
    ("45d two reports at least a week apart", PAIN,
     "      if (localDaysBetween(first, last) < PAIN_PATTERN.MIN_SPAN_DAYS) continue;", "",
     [T_PAIN], None),
    ("45e reports in at least half the sessions", PAIN,
     "      if (reported.length < PAIN_PATTERN.MIN_SHARE * sessions.length) continue;", "",
     [T_PAIN], None),
    ("45f the latest session carries a report", PAIN,
     "      if (sessions.at(-1) !== reported.at(-1)) continue;", "", [T_PAIN], None),
    ("45g the alternative has two clean sessions", PAIN,
     "    if (clean.length < PAIN_PATTERN.CLEAN_SESSIONS) continue;", "", [T_PAIN], None),
    ("45h the alternative with a report at the joint is no alternative", PAIN,
     "    if (withIt.some((fact) => fact.reported.has(joint))) continue;", "", [T_PAIN], None),
    ("45i a running swap leaves the exercise alone", PAIN,
     "    if (!exercise || swapped.has(exerciseId)) continue;", "    if (!exercise) continue;",
     [T_PAIN], None),
    ("45j Not now holds until a new report", COACH,
     "  if (signal.untilNew) return entry !== undefined;", "", [T_PAIN_COACH], None),
    ("45k the pattern stands in place of the rating's card", COACH,
     "    pattern?.joint !== report.joint\n", "    true\n", [T_PAIN_COACH], None),
    ("45l the card's help line shows", CARD,
     "      {signal?.footnote ? (", "      {false ? (", ["src/components/AdaptiveCoach/AdaptiveCoachCard.test.tsx", T_PAIN_COACH], None),
    ("45m the pain reset forgets the patterns", COACH,
     "    since: input.resets?.pain ?? null,\n  });\n  for (const pattern of found) {",
     "    since: null,\n  });\n  for (const pattern of found) {", [T_PAIN_COACH], None),

    # Item 46: the week the lifter actually trains.
    ("46a four weeks are needed", FIT,
     "  if (weeks.length < SCHEDULE_FIT.WEEKS) return null;", "", [T_FIT], None),
    ("46b every week on one side", FIT,
     "  const fewer = counts.every((count) => count < weeklyFrequency);",
     "  const fewer = counts.some((count) => count < weeklyFrequency);", [T_FIT], None),
    ("46c a half rounds toward the schedule", FIT,
     "  const toward = median < weeklyFrequency ? Math.ceil(median) : Math.floor(median);",
     "  const toward = Math.round(median);", [T_FIT], None),
    ("46d only weeks after the schedule was set", FIT,
     "    if (setWeek !== null && monday <= setWeek) break;", "", [T_FIT], None),
    ("46e a schedule is not off for a day it leaves unused", FIT,
     "  const offDays = regular.some((day) => !availableDays.includes(day));",
     "  const offDays =\n    regular.some((day) => !availableDays.includes(day)) || availableDays.some((day) => !times.has(day));",
     [T_FIT], None),
    # 46f (two days a week full body every session) was withdrawn by the review: R46-6.
    ("46g a new lifter keeps full body, upper and lower", GEN,
     "  return profile.schedule.weeklyFrequency <= 3 || style === 'foundation'",
     "  return profile.schedule.weeklyFrequency <= 3", [T_REALWEEK], None),
    ("46h the card stays in a deload week", COACH,
     "  if (signal.source === SCHEDULE_SOURCE) return false;\n", "", [T_FIT_COACH], None),
    ("46i a schedule edit sets when", SCHEDULE_ED,
     "                schedule: { ...current.schedule, weeklyFrequency: Number(value), since: nowIso() },",
     "                schedule: { ...current.schedule, weeklyFrequency: Number(value) },",
     [T_REALWEEK_STORE], None),
    ("46j moving the schedule sets when", STORE,
     "        availableDays: [...availableDays],\n        since: this.now(),",
     "        availableDays: [...availableDays],", [T_REALWEEK_STORE], None),

    # Item 47: what the app has learned.
    ("47a the habit reset reads only sessions after it", OVERRIDES,
     "    .filter((record) => Date.parse(record.completedAt ?? record.startedAt) > from)", "",
     [T_LEARNED], None),
    ("47b the targets read the habit reset", PROG,
     "    input.resets?.habit ?? null,", "    null,", [T_LEARNED], None),
    ("47c a reset is saved and read back", STORE,
     "          this.resetsVersion === resetsSeen ? parseResets(resetsRaw) : this.state.learnedResets,",
     "          emptyResets(),",
     [T_LEARNED_STORE], None),
    ("47d a reset asks once more", LEARNED_UI,
     "                    onClick={() => setConfirming(section.key)}",
     "                    onClick={() => void reset(section)}", [T_LEARNED_STORE], None),
    ("47e declined offers are cleared", STORE,
     "    await this.changeDeclines(() => emptyDeclines());", "    return;", [T_LEARNED_STORE], None),
    ("47f a declined offer's name reads past bars in its source", LEARNED,
     "  const cut = key.lastIndexOf('|');", "  const cut = key.indexOf('|');", [T_LEARNED], None),

    # Item 49: variety for accessories.
    ("49a never a main lift", VARIETY,
     "  if (!isAccessory(exercise)) return null;", "", [T_VARIETY], None),
    ("49b not one the lifter left in twelve weeks", VARIETY,
     "      !left.has(candidate.id) &&\n", "", [T_VARIETY], None),
    ("49c not one already in today's plan", VARIETY,
     "      !today.has(candidate.id) &&\n", "", [T_VARIETY], None),
    ("49d at least as good for growth", VARIETY,
     "      candidate.hypertrophySuitability >= exercise.hypertrophySuitability &&\n", "",
     [T_VARIETY], None),
    ("49e flat needs twelve weeks in the plan", VARIETY,
     "  if (!first || at - Date.parse(whenOf(first)) < VARIETY.STALE_TENURE_DAYS * DAY_MS) return null;",
     "  if (!first) return null;", [T_VARIETY], None),
    ("49f a lift that climbed is not flat", VARIETY,
     "  if (latest === null || earlier === null || latest > earlier) return null;",
     "  if (latest === null || earlier === null) return null;", [T_VARIETY], None),
    ("49g a stalled accessory's variation names one alternative", COACH,
     "  const variety = entry && usable ? varietyOffer(input, exercise, entry, ref) : null;",
     "  const variety = null;", [T_VARIETY_COACH], None),
    ("49h no flat offer beside a stall route", COACH,
     "    if (!isAccessory(exercise) || started(input, entry) || stalled.has(exercise.id)) continue;",
     "    if (!isAccessory(exercise) || started(input, entry)) continue;", [T_VARIETY_COACH], None),
    ("49i a lift changed in four weeks waits", VARIETY,
     "  if (!first || Date.parse(whenOf(first)) >= settle) return true;", "  if (!first) return true;",
     [T_VARIETY], None),

    # The review round (Maintenance 27, after the four reviews): each fix reverted alone.
    ("R43-1 a check logged today stays the day's one check", STORE,
     "    if (taken) {\n      return { entryId: taken.entryId, setIndex: taken.setIndex, exerciseId: taken.exerciseId };\n    }\n",
     "", [T_RC_STORE], None),
    ("R43-5 the slip question reads what the set keeps", LOGGER,
     "    const slip = question?.(toCommit(final)) ?? null;",
     "    const slip = question?.(final) ?? null;", [T_LOGGER], None),
    ("R43-6 a check set's reserve is what it measured", RC,
     "        const rir =\n          measuredReserve(set) ??\n          (estimate ? readReserve(exercise, set.reps, set.rir, estimate) : set.rir);",
     "        const rir = estimate ? readReserve(exercise, set.reps, set.rir, estimate) : set.rir;",
     [T_RC, T_RC_STORE], None),
    ("R43-9 a reading past twenty is said to count for nothing", RC,
     "  if (reading.total > RESERVE_CHECK.MAX_TOTAL) {\n",
     "  if (reading.total > Infinity) {\n", [T_RC], None),
    ("R43-9b fewer in all than at the stop is said to count for nothing", RC,
     "  if (reading.total < reading.stop) {\n    return 'Fewer reps in all than at your stop: this check counts for nothing.';\n  }\n",
     "", [T_RC], None),
    ("R41-2 the curve reads the last set in reps to failure", CURVE,
     "  const fromReps = last.reps + (last.rir ?? 0);", "  const fromReps = last.reps;",
     [T_CURVE, T_PCURVE], None),
    ("R43-3 the Last line quotes the reserve as logged", PROG,
     "  return logged !== undefined && logged !== null && logged !== point.avgRir\n",
     "  return false\n", [T_PCURVE], None),
    ("R47-1 a rebuild reads the read log", STORE,
     "    // The log as the rules read it (item 43's checks), as every engine reads it.\n    const { profile, readHistory: history } = this.state;",
     "    const { profile, history } = this.state;", [T_RC_STORE], None),
    ("R47-1b the finish screen reads the read log when given", BUILDER,
     "  const after = read ?? [...history.filter((candidate) => candidate.id !== record.id), record];",
     "  const after = [...history.filter((candidate) => candidate.id !== record.id), record];",
     [T_RC_STORE], None),
    ("R47-6 the read-as line only while checks are on", LEARNED,
     "    if (status.on && estimate.correction !== 0 && estimate.band) {",
     "    if (estimate.correction !== 0 && estimate.band) {", [T_LEARNED], None),
    ("R47-8 an offer is named, never its source", LEARNED,
     "  return `${names[source] ?? 'An offer'}${on}`;",
     "  return `${names[source] ?? `${source.charAt(0).toUpperCase()}${source.slice(1)}`}${on}`;",
     [T_LEARNED], None),
    ("R47-5 a pain decline whose pattern moved on is not listed", LEARNED,
     "    .filter(([key]) => !isPain(key) || live.has(key.slice(0, key.lastIndexOf('|'))))\n",
     "", [T_LEARNED], None),
    ("R47-9 a reload keeps a reset made while it read", STORE,
     "          this.resetsVersion === resetsSeen ? parseResets(resetsRaw) : this.state.learnedResets,",
     "          parseResets(resetsRaw),", [T_LEARNED_PAGE], None),
    ("R47-9b a reload keeps a decline made while it read", STORE,
     "          this.declinesVersion === declinesSeen\n            ? parseCoachDeclines(declinesRaw)\n            : this.state.coachDeclines,",
     "          parseCoachDeclines(declinesRaw),", [T_LEARNED_PAGE], None),
    ("R47-9c a reset keeps a reset a sync brought", STORE,
     "      const next = withReset(mergeResets(saved, this.state.learnedResets), kind, this.now());",
     "      const next = withReset(this.state.learnedResets, kind, this.now());", [T_LEARNED_PAGE], None),
    ("R43-7 a field this copy does not know is kept", RESETS,
     "  const resets: LearnedResets = { ...(raw as Record<string, unknown>), id: LEARNED_RESETS_ID };",
     "  const resets: LearnedResets = { id: LEARNED_RESETS_ID, ...Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([key]) => ['reserve', 'curves', 'habit', 'pain'].includes(key))) };",
     [T_LEARNED, T_LEARNED_PAGE], None),

    ("R49-2 a put-away flat card leaves its place", COACH,
     "    if (!putAway(input, signal)) break;", "    break;", [T_VARIETY_COACH], None),
    ("R49-3 no flat card while a route is open", COACH,
     "    if (input.routes?.routes[exercise.id]) continue;\n", "", [T_VARIETY_COACH], None),
    ("R49-4 a break starts the lift's run afresh", VARIETY,
     "      start = index;\n", "", [T_VARIETY], None),
    ("R49-4b the last two weeks read now", VARIETY,
     "  const latest = best(0, VARIETY.STALE_LATEST_DAYS);",
     "  const latest = best(0, VARIETY.STALE_WINDOW_DAYS);", [T_VARIETY], None),
    ("R49-7 the route's offer waits four weeks after a change", COACH,
     "  if (changedRecently(input.history, exercise.id, input.swaps ?? [], input.now)) return null;\n",
     "", [T_VARIETY_COACH], None),
    ("R49-7b the route's offer leaves a painful lift to its own card", COACH,
     "  if (painful) return null;\n", "", [T_VARIETY_COACH], None),
    ("R49-10 the offer fits today's limits", COACH,
     "    context: sessionConflictContext(input.profile, input.location, {\n      excludeExerciseIds: dayExclusions(input),\n      painJoints: jointsToProtect(input),\n    }),",
     "    context: sessionConflictContext(input.profile, input.location),", [T_VARIETY_COACH], None),
    ("R46-10 a four-week swap's step waits for the swap", SCREEN_TODAY,
     "    if (action.kind !== 'lasting-swap') void store.noteCoachAction(action);",
     "    void store.noteCoachAction(action);", [T_TAPS], None),
    ("R46-10b a failed swap says so", SCREEN_TODAY,
     "        void store.takeCoachSwap(action).catch(failed('The swap could not be kept'));",
     "        void store.takeCoachSwap(action).catch(() => undefined);", [T_TAPS], None),

    ("R45-1 each report survives later changes", RECAL,
     "    ...(constraints.painReports\n      ? { painReports: constraints.painReports.map((report) => ({ ...report })) }\n      : {}),\n",
     "", [T_PAIN_STORE], None),
    ("R45-2 a check-in's joints are never put on an exercise", PAIN,
     "  for (const joint of checkIn) unplaced.delete(joint as Joint);\n", "", [T_PAIN], None),
    ("R45-3 a put-away pattern leaves its place", COACH,
     "    if (putAway(input, signal)) continue;\n", "", [T_PAIN_COACH], None),
    ("R45-4 a lift back from three weeks away starts fresh", PAIN,
     "      if (!latest || apart(latest.at, input.now)) continue;",
     "      if (!latest) continue;", [T_PAIN], None),
    ("R45-4b the run after a break", PAIN,
     "        if (previous && apart(previous.at, fact.at)) start = index;",
     "        if (previous && false) start = index;", [T_PAIN], None),
    ("R45-5 pain on the alternative before a set counts", PAIN,
     "    const withIt = facts.filter((fact) => fact.done.has(id) || reportedOn(fact));",
     "    const withIt = facts.filter((fact) => fact.done.has(id) || (false && reportedOn(fact)));",
     [T_PAIN], None),
    ("R45-12 a week apart by the calendar", PAIN,
     "      if (localDaysBetween(first, last) < PAIN_PATTERN.MIN_SPAN_DAYS) continue;",
     "      if (Date.parse(last) - Date.parse(first) < PAIN_PATTERN.MIN_SPAN_DAYS * 86_400_000) continue;",
     [T_PAIN], None),

    ("R46-6 two days rotate the three templates", GEN,
     "  return profile.schedule.weeklyFrequency <= 3 || style === 'foundation'",
     "  return profile.schedule.weeklyFrequency <= 2 && style !== 'foundation'\n    ? [FULL_BODY]\n    : profile.schedule.weeklyFrequency <= 3 || style === 'foundation'",
     [T_REALWEEK_GEN], None),
    ("R46-7 the day a workout began", FIT,
     "    const at = record.startedAt;", "    const at = record.completedAt ?? record.startedAt;",
     [T_FIT], None),
    ("R46-8 a count the range cannot reach is no move", FIT,
     "  const real = clamped !== null && clamped !== weeklyFrequency ? clamped : null;",
     "  const real = clamped;", [T_FIT], None),
    ("R46-8b never fewer days than sessions", FIT,
     "  if (proposal.availableDays.length < proposal.weeklyFrequency) return null;\n", "",
     [T_FIT], None),
    ("R46-9 days that vary bring no card", FIT,
     "  const offDays = regular.some((day) => !availableDays.includes(day));",
     "  const offDays =\n    regular.some((day) => !availableDays.includes(day)) ||\n    (availableDays.length <= weeklyFrequency && availableDays.some((day) => !times.has(day)));",
     [T_FIT], None),
    ("R46-9b the split follows only where it changes", COACH,
     "    ids(splitFor(input.profile)) !== ids(splitFor(moved)) ? ', and the split follows' : '';",
     "    ', and the split follows';", [T_FIT_COACH], None),
    ("R46-11 the choice already made changes nothing", SCHEDULE_ED,
     "            if (Number(value) === profile.schedule.weeklyFrequency) return;\n", "",
     [T_REALWEEK_STORE], None),

    ("R44-1 a kept lift to push takes the plan's own rule", RECAL,
     "    const mark = pushMarkOf(entry) ?? (entry.push === 'extra' ? ('extra' as const) : undefined);",
     "    const mark = undefined as 'extra' | 'natural' | undefined;",
     [T_PUSH_REVIEW, T_PUSH_RECHECK], None),
    ("R44-1b after the push ends, a harder day keeps a rep in reserve on it", RECAL,
     "    const rir = Math.max(hold?.minRir ?? 0, pushed ? pushRir(after.rir) : after.rir);",
     "    const rir = Math.max(hold?.minRir ?? 0, after.rir);",
     [T_PUSH_RECHECK], None),
    ("R44-1c an easier day takes the set a fresh extra loses", RECAL,
     "      pushedFor(settings) ??\n", "", [T_PUSH_RECHECK], None),
    ("R44-1d after the push ends, a harder day adds no set", RECAL,
     "    const own = pushed && !ruled ? Math.max(Math.min(count, working), Math.min(2, working)) : count;",
     "    const own = count;", [T_PUSH_RECHECK], None),
    ("R44-1e the rule never takes the extra to failure", GEN,
     "      rir: Math.max(dayRirFloor(adjust), pushRir(adjusted.rir)),",
     "      rir: Math.max(dayRirFloor(adjust), adjusted.rir),", [T_PUSH_REVIEW, T_PUSH_RECHECK], None),
    ("R44-2 days since on the calendar", PUSH,
     "    daysSince: last ? back(last.at) : null,",
     "    daysSince: last ? Math.floor((at - Date.parse(last.at)) / DAY_MS) : null,",
     [T_PUSH], None),
    ("R44-2b the day a workout began", PUSH,
     "const dayOf = (record: WorkoutRecord) => record.startedAt;",
     "const dayOf = (record: WorkoutRecord) => record.completedAt ?? record.startedAt;",
     [T_PUSH], None),
    # R44-3 retired: the mark check it reverted was redundant with R44-3c and was removed.
    ("R44-3b a swapped extra keeps its place first", GEN,
     "  const extras = entries.filter((entry) => entry.push === 'extra');",
     "  const extras = entries.filter((entry) => pushMarkOf(entry) === 'extra' && !isStopped(entry));",
     [T_PUSH_REVIEW, T_PUSH_RECHECK], None),
    # R44-3c retired (the re-check): the day's extra kept, swapped or stood in for now keeps a
    # second one out (`extraKept`), and no template has two places for one pushable movement, so
    # `pushSwappedAway` can change nothing reachable; it stays as a guard.
    ("R44-4 the cap reads the days after", GEN,
     "    past = [...past, plannedRecord(workout, at, null)];\n  }\n  return out;",
     "    past = [...past, plannedRecord(workout, at, null)];\n  }\n  return out.slice(0, 0);",
     [T_PUSH_SIM], None),
    ("R44-4b no drop set for its muscles on the extra's day", GEN,
     "              dayExtra !== null &&\n              push !== null &&", "              false &&\n              push !== null &&",
     [T_PUSH_SIM], None),
    ("R44-5 the main lift stays second", GEN,
     "    const lead = holds(blocks[0], pushEntry) && holds(blocks[1], anchor) ? 2 : 1;",
     "    const lead = 1;", [T_PUSH_REVIEW], None),
    ("R44-7 only sessions since the push began", PACE,
     "    .filter((record) => since === null || Date.parse(whenOf(record)) >= Date.parse(since))\n",
     "", [T_PACE, T_PUSH_COACH], None),
    ("R44-7b each reason to end it is its own", COACH,
     "  const falling = shortTwiceRunning(input.history, exercise.id, push.since);",
     "  const falling = shortTwiceRunning(input.history, exercise.id, push.since) ? 'x' : null;",
     [T_PUSH_COACH], None),
    ("R44-8 a kept extra weighs no second one", GEN,
     "    !extraKept &&\n", "", [T_PUSH_REVIEW, T_PUSH_RECHECK], 0),
    ("R44-9 an outlier is judged without itself", PACE,
     "      off(without, worst) >\n        PUSH_PACE.OUTLIER_SPREADS * Math.max(without.spread, Math.log(1 + PUSH_PACE.READING_NOISE))",
     "      off(line, worst) >\n        PUSH_PACE.OUTLIER_SPREADS * Math.max(line.spread, Math.log(1 + PUSH_PACE.READING_NOISE))",
     [T_PACE], None),
    ("R44-10 the review says what a pace needs", COACH,
     "        ? `Its pace needs ${state.sessionsToGo} more ${state.sessionsToGo === 1 ? 'reading' : 'readings'} of its first working set.`",
     "        ? 'Its pace is not clear yet: the readings scatter more than they climb.'",
     [T_PUSH_COACH], None),
    ("R44-11 a Light weights extra is not heavy", GEN,
     "        heavyExtra(profile),", "        true,", [T_PUSH_REVIEW, T_PUSH_RECHECK], None),
    ("R44-11b nor is Foundation's", GEN,
     "  !['high-rep', 'foundation'].includes(resolveStyle(profile));",
     "  !['high-rep'].includes(resolveStyle(profile));", [T_PUSH_RECHECK], None),
    # The re-check of item 44 (after the review).
    ("R44-12 the cap holds through a rebuild", GEN,
     "  if (push && dayExtra !== null) {", "  if (push && extraId !== null) {", [T_PUSH_RECHECK], None),
    ("R44-12b the drop-set rule holds through a rebuild", GEN,
     "              dayExtra !== null &&", "              extraId !== null &&", [T_PUSH_RECHECK], None),
    ("R44-12c a kept lift keeps its sets against the cap", GEN,
     "      if (!entry || keptIds.has(id)) continue;", "      if (!entry) continue;",
     [T_PUSH_RECHECK], None),
    ("R44-12d a rebuild plans the days after", GEN,
     "    ahead ??= sessionsAhead(input, [", "    ahead ??= ([] as WorkAhead[]) || sessionsAhead(input, [",
     [T_PUSH_RECHECK, T_PUSH_REVIEW], None),
    ("R44-13 a swap of the day's extra is kept", RECAL,
     "  const lock = locking || entry.push === 'extra';", "  const lock = locking;",
     [T_PUSH_RECHECK], None),
    ("R44-13b a stand-in carries on the day's extra", RECAL,
     "    ...(entry.push === 'extra' ? { push: 'extra' as const } : {}),\n", "",
     [T_PUSH_RECHECK], None),
    # R44-13c not entered: a stopped extra kept without a stand-in carrying it on is one closed at
    # a place where the lift does not fit (a swap of a finished lift is refused), and there no extra
    # is weighed either way.
    ("R44-14 what leads is named first", GEN,
     "    pushEntry ?? leading.find((entry) => !isStopped(entry)) ?? (beforeMain ? firstToDo : anchor);",
     "    pushEntry ?? anchor;", [T_PUSH_RECHECK], None),
    ("R44-15 harder never trims the lift to push", GEN,
     "  if ((adjust?.sets ?? 0) > 0) {\n    for (const entry of entries) {",
     "  if (false) {\n    for (const entry of entries) {", [T_PUSH_RECHECK], None),
    ("R44-16 the cap line names lifts still in the plan", GEN,
     "  const inPlan = new Map(allEntries(blocks).map((entry) => [entry.id, entry]));",
     "  const inPlan = new Map(entries.map((entry) => [entry.id, entry]));", [T_PUSH_RECHECK], None),
    ("R44-17 no extra weighed where the lift cannot go", GEN,
     "    !isBlocked(checkExerciseFit(push.exercise, context)) &&\n    !swappedOut.has(push.exercise.id)\n",
     "    true\n", [T_PUSH_RECHECK], None),
    ("R44-18 a lasting swap never brings the lift back the day it gives way", GEN,
     # Re-anchored in Maintenance 30's eighth re-check: the plan takes an exercise's first swap
     # that applies, so a swap-in that gives way is passed over (`continue`).
     "      if (!next || givesWay.includes(next.id)) continue;",
     "      if (!next) continue;", [T_PUSH_RECHECK], None),
    ("R44-19 the next session in calendar days", PUSH,
     "    if (availableDays.includes(localWeekday(addLocalDays(now, ahead)))) return ahead;",
     "    if (availableDays.includes(localWeekday(new Date(Date.parse(now) + ahead * 86_400_000).toISOString())))\n      return ahead;",
     [T_PUSH], None),
    ("R44-19b the days ahead in calendar days", PUSH,
     "    if (availableDays.includes(localWeekday(addLocalDays(now, ahead)))) out.push(ahead);",
     "    if (availableDays.includes(localWeekday(new Date(Date.parse(now) + ahead * 86_400_000).toISOString())))\n      out.push(ahead);",
     [T_PUSH], None),
    ("R44-19c a calendar day on keeps the clock time", LOCAL_DATE,
     "  date.setDate(date.getDate() + days);\n  return date.toISOString();",
     "  return new Date(date.getTime() + days * 86_400_000).toISOString();", [T_PUSH], None),
    ("R44-20 a slope of rounding is flat", PACE,
     "  const slope = Math.abs(sxy / sxx) < ROUNDING ? 0 : sxy / sxx;", "  const slope = sxy / sxx;",
     [T_PACE], None),
    ("R44-20b a spread of rounding is none", PACE,
     "  const spread = Math.sqrt(sse / df) < ROUNDING ? 0 : Math.sqrt(sse / df);",
     "  const spread = Math.sqrt(sse / df);", [T_PACE], None),
    ("R44-20c a line the readings fit exactly is clear", PACE,
     " || half === 0 ||", " ||", [T_PACE], None),
    ("R44-21 a real step is no slip", PACE,
     "Math.max(without.spread, Math.log(1 + PUSH_PACE.READING_NOISE))", "without.spread",
     [T_PACE], None),
    ("R44-22 the card says why sessions gave no reading", PUSH_CARD,
     "        sessions > 0\n", "        false\n", [T_PUSH_CARD], None),
    ("R44-25 a push is never younger than none", PACE,
     "  const weeks = Math.max(0, (Date.parse(input.now) - since) / WEEK_MS);",
     "  const weeks = (Date.parse(input.now) - since) / WEEK_MS;", [T_PACE], None),
    ("R44-22b the review says what a reading is", COACH,
     "      ? `No reading of it yet: the pace reads ${READING_RULE}.`",
     "      ? 'No reading of it yet: the pace reads its first working set each session.'",
     [T_PUSH_COACH], None),

    # The re-check of items 47 and 49.
    ("R49-r1 never more stress on a flagged joint", VARIETY,
     "      noMoreOnFlagged(candidate) &&\n", "", [T_VARIETY], None),
    ("R49-r2 the route step only once the swap is kept", STORE,
     "    if (kept) await this.noteCoachAction(action);", "    await this.noteCoachAction(action);",
     [T_RECHECK4749], None),
    ("R47-r1 the saved copy wins a field this copy never writes", RESETS,
     "{ ...shown, ...saved, id: LEARNED_RESETS_ID }", "{ ...saved, ...shown, id: LEARNED_RESETS_ID }",
     [T_LEARNED], None),
    ("R47-r2 a decline a sync brought is kept", STORE,
     "      const next = change(mergeDeclines(saved, this.state.coachDeclines));",
     "      const next = change(this.state.coachDeclines);", [T_RECHECK4749], None),
    ("R47-r2b merged declines keep the higher count", COACH,
     "          count: Math.max(other.count, entry.count),", "          count: entry.count,",
     [T_RECHECK4749], None),
    ("R47-r2c merged declines keep the later time", COACH,
     "            Date.parse(other.lastAt) >= Date.parse(entry.lastAt) ? other.lastAt : entry.lastAt,",
     "            entry.lastAt,", [T_RECHECK4749], None),
    ("R47-r3 a reset not read back shows what is saved", STORE,
     "          this.setState({ learnedResets: parseResets(stored) });", "          parseResets(stored);",
     [T_RECHECK4749], None),
    ("R47-r3b a decline not read back shows what is saved", STORE,
     "          this.setState({ coachDeclines: parseCoachDeclines(stored) });",
     "          parseCoachDeclines(stored);", [T_RECHECK4749], None),
    ("R47-r4 a decline that does not read is dropped alone", STORE,
     "        if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) continue;\n        if (typeof lastAt !== 'string' || !Number.isFinite(Date.parse(lastAt))) continue;\n",
     "", [T_RECHECK4749], None),
    ("R47-r5 off, the status says nothing is read", LEARNED,
     "  } else if (!status.on && estimate.readings > 0) {", "  } else if (false) {",
     [T_LEARNED], None),
    ("R47-r5b off, the item shows only for a usable reading", LEARNED,
     "  if (!status.on && estimate.usable)", "  if (!status.on && estimate.readings > 0)",
     [T_LEARNED], None),
    ("R46-10c the overlay says a failed swap", SCREEN_ACTIVE,
     "        void store.takeCoachSwap(action).catch(failed('The swap could not be kept'));",
     "        void store.takeCoachSwap(action).catch(() => undefined);", [T_TAPS], None),

    # The re-check of items 45 and 46.
    ("R45-r1 every record saves its reports", BUILDER,
     "    painReports: (session.constraints.painReports ?? []).map((report) => ({ ...report })),",
     "    ...((session.constraints.painReports ?? []).length > 0\n      ? { painReports: (session.constraints.painReports ?? []).map((report) => ({ ...report })) }\n      : {}),",
     [T_PAIN_STORE], None),
    ("R45-r2 a pain joint beyond the reports is a check-in's", PAIN,
     "  if (!legacy) {\n    for (const joint of record.painJoints ?? [])\n      if (!direct.has(joint as Joint)) checkIn.add(joint);\n  }\n",
     "", [T_PAIN], None),
    ("R45-r2b a record from before item 45 reads its pain joints", PAIN,
     "  const legacy = record.painReports === undefined;", "  const legacy = false;", [T_PAIN], None),
    ("R45-r3 the day a workout began", PAIN,
     "const whenOf = (record: WorkoutRecord) => record.startedAt;",
     "const whenOf = (record: WorkoutRecord) => record.completedAt ?? record.startedAt;",
     [T_PAIN], None),
    ("R45-r4 a break in elapsed time, as the engine reads it", PAIN,
     "        Date.parse(to) - Date.parse(from) >= RETURN_AFTER_DAYS * DAY_MS;",
     "        localDaysBetween(from, to) >= RETURN_AFTER_DAYS;", [T_PAIN], None),
    ("R46-r1 the move names the most the plan sets", COACH,
     "      : fit.measured !== null && fit.measured > proposal.weeklyFrequency\n        ? ` (the most the plan sets)`\n        : '';",
     "      : '';", [T_FIT_COACH], None),

    # The re-check of items 43 and 41.
    ("R43-r1 a stalled check's skip reads its reps in all", LOGGER,
     "    checking && failedEarly ? typedTotal() : typing === 'reps' ? typedValues().reps : values.reps;",
     "    typing === 'reps' ? typedValues().reps : values.reps;", [T_LOGGER], None),
    ("R43-r1b Keep names what it commits", LOGGER,
     "              {keepLabel(mode, toCommit(asking.values), units, hold)}",
     "              {keepLabel(mode, asking.values, units, hold)}", [T_LOGGER], None),
    ("R43-r1c stalling clears stopped", LOGGER,
     "                if (event.target.checked) setStopped(false);\n", "", [T_LOGGER], None),
    ("R43-r1d stopping clears stalled", LOGGER,
     "                if (event.target.checked) setFailedEarly(false);\n", "", [T_LOGGER], None),
    ("R43-r1e a check logged as a skip says no reading", SCREEN_ACTIVE,
     "        if (check && values.reps > 0) {", "        if (check) {", [T_CHECK_SCREENS], None),
    ("R43-r3 the plan follows the yes to checks", STORE,
     "      profile.reserveCheck ?? null,\n", "", [T_RC_STORE], None),
    ("R43-r4 the stall card quotes the reserve as logged", PLATEAU,
     "reps in reserve on average${loggedNote(latest)}, well short",
     "reps in reserve on average, well short", [T_PLATEAU], None),
    ("R43-r5 the learned page names a change of style", LEARNED,
     "  } else if (status.lastAt && styleChanged(input)) {", "  } else if (false) {",
     [T_LEARNED], None),
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
        run = subprocess.run(
            "npx vitest run " + " ".join(tests),
            shell=True, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        out = run.stdout + run.stderr
        summary = re.search(r"Tests\s+(.*)", out)
        line = summary.group(1).strip() if summary else "no summary (compile error?)"
        # A compile error, or a failure that is only a time-out, is no catch (as
        # mutate-install-icon.py reads it): WRONG FAILURE, to run again alone or mend.
        asserted = re.search(r"AssertionError|TestingLibraryElementError|expected .* to ", out)
        wrong = summary is None or (re.search(r"Test timed out", out) is not None and not asserted)
        killed = "failed" in line and not wrong
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
