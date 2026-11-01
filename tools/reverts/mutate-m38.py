"""Maintenance 38's mutation checks, the split's order across the days (2026-10-31). Revert each
part alone, run its tests, expect a failure, restore. Prints KILLED (a test failed) or SURVIVED
(every test still passed).

  python mutate-m38.py --repo=PATH            run every entry in a copy of the repository
  python mutate-m38.py --repo=PATH O1 ST3     run the entries whose names start with these
  python mutate-m38.py --repo=PATH --check    only check that every anchor is found once
  python mutate-m38.py --repo=PATH --utc      run the tests in UTC, then the day rules' zones

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

SPLIT = "src/engine/planning/splitOrder.ts"
RECOVERY = "src/engine/recovery/recovery.ts"
PLANNED = "src/engine/planning/weeklyPlan.ts"
WEEK = "src/engine/planning/weekModel.ts"
GEN = "src/engine/workoutGenerator/generate.ts"
RECAL = "src/engine/recalibration/recalibrate.ts"
STORE = "src/core/state/appStore.ts"
SESSION = "src/core/state/session.ts"
COACH = "src/engine/coach/coachConductor.ts"
PLANSCREEN = "src/features/plan/PlanScreen.tsx"
USECOACH = "src/features/coach/useCoach.ts"
BUILDER = "src/core/state/workoutRecordBuilder.ts"
RECORDSCHEMA = "src/core/validation/workoutRecord.ts"
ORDERSCHEMA = "src/core/validation/splitOrder.ts"
DELOAD = "src/engine/planning/deload.ts"
KEPT = "src/engine/planning/orderKept.ts"

T_ORDER = "src/engine/planning/splitOrder.test.ts"
T_WINDOWS = "src/engine/recovery/windowsOfEach.test.ts"
T_STORE = "src/core/state/splitOrder.store.test.ts"
T_SESSION = "src/core/state/session.splitOrder.test.ts"
T_SCREENS = "src/features/plan/splitOrder.screens.test.tsx"
T_CARD = "src/engine/coach/coachConductor.schedule.test.ts"
T_TIME = "src/core/state/timeIntelligence.store.test.ts"
T_CATCHUP = "src/core/state/catchUp.store.test.ts"
T_WEEKS = "src/engine/planning/splitOrder.weeks.test.ts"
T_WIRING = "src/core/state/splitOrder.wiring.store.test.ts"
T_RECORD = "src/core/validation/workoutRecord.splitOrder.test.ts"
T_BUILDER = "src/core/state/workoutRecordBuilder.splitOrder.test.ts"
T_ORDERCARD = "src/engine/coach/splitOrder.card.test.ts"
T_PUSH = "src/engine/workoutGenerator/generate.push.test.ts"
T_DELOAD = "src/engine/planning/deload.test.ts"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # The decision: an order meaningfully better for recovery, or the rotation's.
    ("O1 better only where no muscle comes back too soon more often", SPLIT,
     "    noMore(candidate.week, current.week) &&\n", "", [T_ORDER], None),
    ("O2 ... and one at least less often", SPLIT,
     "    total(candidate.week) < total(current.week) &&\n", "", [T_ORDER, T_STORE], None),
    ("O3 the first day after the week no worse", SPLIT,
     "    noMore(candidate.after, current.after)\n", "    true\n", [T_ORDER, T_WEEKS], None),
    ("O4 ... read with the session the rotation gives it", SPLIT,
     "  read(after, next.workout, next.date);\n",
     "  read(after, (planned[sessions[0] as number] as PlannedWorkout).workout, next.date);\n",
     [T_ORDER, T_WEEKS], None),
    ("O4b ... after the week built in the order, in the rotation's own days", SPLIT,
     "      history: [...history, ...week.map((day) => keptRecord(day, order))],\n",
     "      history: [...history, ...week.map((day) => keptRecord(day, null))],\n",
     [T_ORDER, T_WEEKS], None),
    ("O5 each session's windows moved with it", SPLIT,
     "      const moved = { ...window, at: date };\n", "      const moved = { ...window };\n",
     [T_ORDER, T_STORE], None),
    ("O6 ... the windows that end latest kept", SPLIT,
     "      if (!before || endOf(moved) >= endOf(before)) latest.set(muscle, moved);\n",
     "      latest.set(muscle, moved);\n", [T_ORDER], None),
    ("O7 the goal's muscles weigh more", SPLIT,
     "sum + count * weights[muscle], 0);", "sum + count, 0);", [T_ORDER], None),
    ("O8 then the fewest days moved", SPLIT,
     "  candidates.sort((a, b) => a.weight - b.weight || a.moved - b.moved);\n",
     "  candidates.sort((a, b) => a.weight - b.weight);\n", [T_ORDER], None),
    ("O9 confirmed on the week built in it", SPLIT,
     "    if (!better(confirmed, current) || !keeps(workOf(built), work, targets)) continue;\n",
     "    if (!keeps(workOf(built), work, targets)) continue;\n", [T_ORDER], None),
    ("O9b ... giving every muscle its sessions and its sets", SPLIT,
     "    if (!better(confirmed, current) || !keeps(workOf(built), work, targets)) continue;\n",
     "    if (!better(confirmed, current)) continue;\n", [T_ORDER, T_WEEKS], None),
    ("O9c ... no muscle fewer sessions", SPLIT,
     "      (candidate.sessions.get(muscle) ?? 0) >= (current.sessions.get(muscle) ?? 0) &&\n",
     "", [T_ORDER, T_WEEKS], None),
    ("O9d ... no muscle fewer sets", SPLIT,
     "      (sets >= (current.sets.get(muscle) ?? 0) - 1e-9 || sets >= targets[muscle])\n",
     "      true\n", [T_ORDER, T_WEEKS], None),
    ("O9e ... where that leaves it short of its target", SPLIT,
     "      (sets >= (current.sets.get(muscle) ?? 0) - 1e-9 || sets >= targets[muscle])\n",
     "      sets >= (current.sets.get(muscle) ?? 0) - 1e-9\n", [T_ORDER, T_STORE, T_WEEKS], None),
    ("O10 a coach focus holds today's session", SPLIT,
     "  const kept = options.focus && planned[0]?.offset === 0 ? 1 : 0;\n", "  const kept = 0;\n",
     [T_ORDER], None),
    ("O11 spared: the muscles no longer worked hard too soon at all", SPLIT,
     "(muscle) => before(muscle) > 0 && after(muscle) === 0", "(muscle) => after(muscle) < before(muscle)",
     [T_ORDER, T_STORE], None),
    ("O11b ... and those on fewer days, said apart", SPLIT,
     "        (muscle) => after(muscle) > 0 && after(muscle) < before(muscle),\n",
     "        () => false,\n", [T_ORDER, T_STORE], None),
    ("O12 two days at least to order", SPLIT,
     "  if (planned.length < 2) return null;\n", "", [T_ORDER], None),
    ("O13 only orders better session by session built", SPLIT,
     "    if (!better(days, current)) continue;\n", "", [T_ORDER, T_STORE], None),
    ("O14 Plan says it only while a day it moved is ahead", SPLIT,
     "  const words = moved ? orderWords(order) : null;\n", "  const words = orderWords(order);\n",
     [T_ORDER], None),
    ("O15 no order where the days are not fixed", SPLIT,
     "  if (profile.schedule.availableDays.length > profile.schedule.weeklyFrequency) return null;\n",
     "", [T_ORDER, T_STORE], None),
    ("O16 an order trained in holds for its week", SPLIT,
     "  if (held) return held;\n", "", [T_ORDER, T_STORE, T_WEEKS], None),
    ("O18 ... while its days after its latest session are still the plan's, none gone by untrained", SPLIT,
     "  if (ahead.some((day) => !days.has(day.day) || !split.has(day.templateId))) return null;\n",
     "", [T_ORDER], None),
    ("O19 ... read from the split's latest session, no catch-up", SPLIT,
     "        !(typeof record.templateId === 'string' && OFF_ROTATION.has(record.templateId)),\n",
     "        true,\n", [T_ORDER], None),

    # The recovery model's windows of each planned session.
    ("R1 each moved by what the lifter's own sessions taught", RECOVERY,
     "      if (window) windows.set(muscle, shifted(window, learned));\n",
     "      if (window) windows.set(muscle, window);\n", [T_WINDOWS], None),
    ("R2 ... a lift new to the lifter by the whole log", RECOVERY,
     "  const lifts = liftTimesOf([...history, ...sessions]);\n",
     "  const lifts = liftTimesOf(sessions);\n", [T_WINDOWS], None),

    # The week the order is read from, as the store plans it.
    ("P1 the week planned in the order", PLANNED,
     "        ...(options.order ? { splitOrder: options.order } : {}),\n", "",
     [T_ORDER, T_SCREENS], None),
    ("P2 ... with the lasting swaps", PLANNED,
     "        ...(options.swaps && options.swaps.length > 0 ? { swaps: options.swaps } : {}),\n", "",
     [T_ORDER], None),
    ("P3 ... and the coach focus", PLANNED,
     "        ...(focus ? { focusMuscle: focus.muscle } : {}),\n", "", [T_ORDER], None),
    ("P4 ... until a session trains its muscle", PLANNED,
     "    if (focus && focusSatisfiedBy(focus, record)) focus = null;\n", "", [T_ORDER], None),
    ("P5 the week model in the order", WEEK,
     "        ...(input.order ? { splitOrder: input.order } : {}),\n", "",
     [T_ORDER, T_STORE, T_TIME, T_WIRING], None),
    ("P6 a planned day of the order keeps it, as the workout trained on it does", PLANNED,
     "    const record = keepingOrder(syntheticRecord(date, workout), options.order);\n",
     "    const record = syntheticRecord(date, workout);\n", [T_ORDER], None),

    # The generator.
    ("G1 the day planned in the order", GEN,
     "    orderedTemplate(profile, constraints.splitOrder, now) ??\n", "", [T_ORDER, T_STORE], None),
    ("G2 ... only a template of the split", GEN,
     "  return day ? splitFor(profile).find((candidate) => candidate.id === day.templateId) : undefined;\n",
     "  return day ? TEMPLATES.find((candidate) => candidate.id === day.templateId) : undefined;\n",
     [T_ORDER], None),
    ("G3 Why this workout says it", GEN,
     "    ...orderedLines(constraints.splitOrder, now, template),\n", "", [T_ORDER, T_STORE], None),
    ("G4 ... only where the order gave the day another template", GEN,
     "  if (!order || !day || day.templateId !== template.id || day.was === day.templateId) return [];\n",
     "  if (!order || !day) return [];\n", [T_ORDER], None),
    ("G5 the days the lift to push looks ahead to, in the order", GEN,
     "        ...(input.constraints?.splitOrder ? { splitOrder: input.constraints.splitOrder } : {}),\n",
     "", [T_ORDER, T_STORE], None),
    ("G6 the lift to push's next session read in the order", GEN,
     "        orderedTemplate(profile, constraints.splitOrder, next) ??\n", "", [T_PUSH], None),
    ("G7 what an order spares on fewer days said so", GEN,
     "${fewer ? '' : 'not '}worked hard again", "not worked hard again", [T_ORDER], None),
    ("G8 a copy keeps no line of the order", GEN,
     "    (line) => !(line.includes(ORDER_LINE.mark) && line.endsWith(ORDER_LINE.end)),\n",
     "    () => true,\n", [T_ORDER, T_STORE], None),
    ("G9 the rotation reads a week trained in an order in its own days", GEN,
     "  const rotation = inRotationPlace(history.filter((record) => !offRotation(record)));\n",
     "  const rotation = history.filter((record) => !offRotation(record));\n",
     [T_ORDER, T_WEEKS], None),
    ("G10 ... the day's session read so wherever the log has one", GEN,
     "    (history.some((record) => offRotation(record) || record.splitOrder !== undefined)\n",
     "    (history.some(offRotation)\n", [T_ORDER, T_WEEKS], None),
    ("G11 ... only a week trained through in its order", GEN,
     "    if (!order.days.every((item) => done?.has(item.day))) return record;\n", "",
     [T_ORDER], None),
    ("G12 ... the k-th session of a template on the k-th day the rotation gave it", GEN,
     "    const place = order.days.filter((item) => item.was === day.templateId)[nth];\n",
     "    const place = order.days.filter((item) => item.was === day.templateId)[0];\n",
     [T_ORDER, T_WEEKS], None),

    # The rebuilds.
    ("RC1 kept through every change", RECAL,
     "    ...(constraints.splitOrder ? { splitOrder: copyOrder(constraints.splitOrder) } : {}),\n",
     "", [T_STORE], None),
    ("RC2 a plan built whole planned in it", RECAL,
     "    ...(orderHeld(constraints, request, whole) ? { splitOrder: constraints.splitOrder } : {}),\n",
     "", [T_STORE], None),
    ("RC3 dropped where a change holds the day at another template", RECAL,
     "  delete constraints.splitOrder;\n  return false;\n", "  return true;\n", [T_STORE], None),
    ("RC4 ... held where the day keeps the template it gives", RECAL,
     "  if (whole || today === undefined || today.templateId === request.workout.templateId) {\n",
     "  if (whole || today === undefined) {\n", [T_STORE], None),
    ("RC5 read again at the length a plan not begun is built at", RECAL,
     "    (!started && keep.length === 0 && orderAgain(request, choice, constraints)) || scope === 'full';\n",
     "    scope === 'full';\n", [T_STORE], None),
    ("RC6 ... today's session moving with it", RECAL,
     "    templateId: whole ? undefined : request.workout.templateId,\n",
     "    templateId: scope === 'full' ? undefined : request.workout.templateId,\n", [T_STORE], None),
    ("RC7 ... and the week's need read in it", RECAL,
     "  const need = again.need(order);\n  if (need) constraints.carry = need;\n"
     "  else delete constraints.carry;\n", "", [T_STORE], None),

    # The store.
    ("ST1 decided for each plan made", STORE,
     "    const order = this.orderFor(profile, now, 'default');\n",
     "    const order: SplitOrder | null = null;\n", [T_STORE], None),
    ("ST2 ... today planned in it", STORE,
     "        ...(order ? { splitOrder: order } : {}),\n", "", [T_STORE], 0),
    ("ST3 ... and kept with the plan", STORE,
     "        ...(order ? { splitOrder: order } : {}),\n", "", [T_STORE, T_SCREENS], 1),
    ("ST4 the week's need read in it", STORE, "      order,\n", "", [T_STORE], 0),
    ("ST5 the catch-up's week read in it", STORE, "      order,\n", "",
     [T_STORE, T_CATCHUP, T_WIRING], 1),
    ("ST6 a deload on a day of the week, today's among them, keeps the rotation's order", STORE,
     "    if (deloadInWeek(this.state.deloadWeek, now)) return null;\n", "",
     [T_STORE, T_WIRING], None),
    ("ST7 read again at a save", STORE,
     "    if (order) next.splitOrder = order;\n", "", [T_STORE, T_CATCHUP], None),
    ("ST8 ... the order read for the days before dropped", STORE,
     "    delete next.splitOrder;\n", "", [T_STORE], None),
    ("ST9 'Longer would help' reads the week in it", STORE,
     "      order: constraints.splitOrder ?? null,\n", "", [T_STORE, T_TIME, T_WIRING], None),
    ("ST10 a preview made again takes the fresh plan's", STORE,
     "    delete today.splitOrder;\n"
     "    if (fresh.constraints.splitOrder) today.splitOrder = fresh.constraints.splitOrder;\n",
     "", [T_STORE, T_WIRING], None),
    ("ST11 read with today at its own length", STORE, "      todayLength,\n", "", [T_STORE], None),
    ("ST12 read again at the length a change builds today at", STORE,
     "      weekAgain: this.weekAgainFor(session, profile),\n", "", [T_STORE], None),
    ("ST13 ... a preview made again at the length it keeps", STORE,
     "        weekAgain: this.weekAgainFor(fresh, profile),\n", "", [T_STORE], None),
    ("ST15 a save reads it at today's own length", STORE,
     "    const order = this.orderFor(profile, now, session.duration);\n",
     "    const order = this.orderFor(profile, now, 'default');\n", [T_STORE], None),
    ("ST16 an emptied offer carried to the offer of the order the fresh plan reads", STORE,
     "deload, this.orderFor(profile, now, 'default'));",
     "deload, session.constraints.splitOrder ?? null);", [T_STORE, T_CATCHUP, T_WIRING], None),
    ("ST17 a deload planned for a later day of the week makes an ordered plan again", STORE,
     "      (deloadInWeek(week, this.now()) && this.state.session?.constraints.splitOrder !== undefined)\n",
     "      false\n", [T_STORE], None),
    ("ST18 ... and cancelled, one the order would read again", STORE,
     "    if (week && (inDeloadWindow(week, this.now()) || this.orderReturns(week))) {\n",
     "    if (week && inDeloadWindow(week, this.now())) {\n", [T_STORE], None),
    ("ST19 'Longer would help' offers nothing where the next length reads another order", STORE,
     "        return days(result.constraints.splitOrder) === days(constraints.splitOrder)\n"
     "          ? result.workout\n          : null;\n",
     "        return result.workout;\n", [T_WIRING], None),
    ("ST20 a copy saved without the order's line", STORE,
     "      workout: withoutOrderLinesIn(planUnderTheEase(this.planWithoutIllness(session))),\n",
     "      workout: planUnderTheEase(this.planWithoutIllness(session)),\n", [T_STORE], None),
    ("ST21 ... and loaded without one", STORE,
     "          withoutOrderLines(fresh.explanation.reasons),\n",
     "          fresh.explanation.reasons,\n", [T_STORE], None),

    # The stored session and workout.
    ("SS1 the order read back with the plan, one that does not read dropped", SESSION,
     "  splitOrder: SplitOrderSchema.optional().catch(undefined),\n", "", [T_SESSION], None),
    ("SS2 ... alone, the session kept", SESSION,
     "  splitOrder: SplitOrderSchema.optional().catch(undefined),\n",
     "  splitOrder: SplitOrderSchema.optional(),\n", [T_SESSION], None),
    ("SS3 ... its spared on fewer days read back", ORDERSCHEMA,
     "  fewer: z.array(z.enum(MUSCLE_IDS)),\n", "", [T_SESSION, T_RECORD], None),
    ("SS4 ... the schedule it was read for read back, one that does not read none", ORDERSCHEMA,
     "  schedule: z.string().optional().catch(undefined),\n",
     "  schedule: z.string().optional(),\n", [T_RECORD, T_SESSION], None),
    ("SS5 ... never kept as it was", ORDERSCHEMA,
     "  schedule: z.string().optional().catch(undefined),\n", "", [T_RECORD], None),
    ("W1 a workout keeps the order it was trained in", RECORDSCHEMA,
     "  splitOrder: SplitOrderSchema.optional().catch(undefined),\n", "", [T_RECORD, T_STORE], None),
    ("W2 ... one that does not read dropped alone, the workout kept", RECORDSCHEMA,
     "  splitOrder: SplitOrderSchema.optional().catch(undefined),\n",
     "  splitOrder: SplitOrderSchema.optional(),\n", [T_RECORD], None),
    ("B1 the record of a workout keeps it", BUILDER,
     "  return keepingOrder(record, session.constraints.splitOrder);\n", "  return record;\n",
     [T_BUILDER, T_STORE], None),
    ("B2 ... only for a day of the order trained with its session", KEPT,
     "  if (!order || !own || own.templateId !== record.templateId) return record;\n",
     "  if (!order) return record;\n", [T_BUILDER, T_ORDER], None),

    # The re-check of the review: the schedule an order was read for, and the order on every
    # record of a day of it, trained or planned.
    ("K1 an order held only for the schedule it was read for", SPLIT,
     "  if (!latest || !order || order.schedule !== scheduleOf(profile)) return null;\n",
     "  if (!latest || !order) return null;\n", [T_ORDER, T_STORE], None),
    ("K2 ... which a fresh order keeps", SPLIT,
     "      schedule: scheduleOf(profile),\n", "", [T_ORDER, T_STORE], None),
    ("K3 ... the sessions a week among it", KEPT,
     "  return `${days.join(',')}/${profile.schedule.weeklyFrequency}`;\n",
     "  return days.join(',');\n", [T_ORDER], None),
    ("K3b ... the days in the week's order, however ticked", KEPT,
     "  const days = WEEKDAYS.filter((day) => profile.schedule.availableDays.includes(day));\n",
     "  const days = profile.schedule.availableDays;\n", [T_ORDER], None),
    ("K4 ... and every copy of it", KEPT,
     "    ...order,\n", "", [T_ORDER, T_STORE], None),
    ("K5 the week model's days of the order keep it", WEEK,
     "    const planned = keepingOrder(plannedRecord(date, workout), input.order);\n",
     "    const planned = plannedRecord(date, workout);\n", [T_ORDER], None),
    ("K6 the lift to push's days ahead keep it", GEN,
     "    past = [...past, keepingOrder(plannedRecord(workout, at, null), input.constraints?.splitOrder)];\n",
     "    past = [...past, plannedRecord(workout, at, null)];\n", [T_ORDER], None),
    ("K7 ... with today's", GEN,
     "    const today = keepingOrder(\n"
     "      plannedRecord(plain, now, { exerciseId: push.exercise.id, sets: push.extraSets }),\n"
     "      constraints.splitOrder,\n    );\n",
     "    const today = plannedRecord(plain, now, { exerciseId: push.exercise.id, sets: push.extraSets });\n",
     [T_ORDER], None),
    ("K8 ... and a rebuild's keeping the extra", GEN,
     "      keepingOrder(\n        plannedRecord(\n          {\n"
     "            locationId: location?.id ?? null,\n            templateId: template.id,\n"
     "            blocks: entries.map((entry) => straightBlock(entry, exerciseOf)),\n"
     "          },\n          now,\n          null,\n        ),\n        constraints.splitOrder,\n      ),\n",
     "      plannedRecord(\n        {\n"
     "          locationId: location?.id ?? null,\n          templateId: template.id,\n"
     "          blocks: entries.map((entry) => straightBlock(entry, exerciseOf)),\n"
     "        },\n        now,\n        null,\n      ),\n",
     [T_ORDER], None),

    # The deload's days.
    ("D1 a deload holds a day of the week ahead only from its start", DELOAD,
     "    Date.parse(days.startsAt) < Date.parse(dayStart(now, 7)) &&\n", "", [T_DELOAD], None),
    ("D2 ... and until its end", DELOAD,
     "    Date.parse(days.endsAt) > Date.parse(now)\n", "    true\n", [T_DELOAD], None),

    # The coach and Plan.
    ("C1 the schedule card reads the moved days in their own order", COACH,
     "      order,\n      focus,\n      swaps,\n", "      focus,\n      swaps,\n", [T_ORDERCARD], None),
    ("C5 ... the order read with the coach focus", COACH,
     "    focus,\n    swaps,\n  });\n", "    swaps,\n  });\n", [T_ORDERCARD], None),
    ("C6 ... and the lasting swaps", COACH,
     "    focus,\n    swaps,\n  });\n", "    focus,\n  });\n", [T_ORDERCARD], None),
    ("C7 ... read again for another focus", COACH,
     "|${input.focus ?? ''}`;", "`;", [T_ORDERCARD], None),
    ("C2 Plan's week in the order", PLANSCREEN, "            order,\n", "", [T_SCREENS], None),
    ("C3 Plan says it", PLANSCREEN, "        {orderLine ? (\n", "        {false ? (\n", [T_SCREENS], None),
    ("C4 the coach's week in the order", USECOACH,
     "            ? (session.constraints.splitOrder ?? null)\n", "            ? null\n", [T_SCREENS], None),
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
