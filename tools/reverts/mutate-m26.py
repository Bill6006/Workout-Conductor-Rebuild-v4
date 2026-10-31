"""Maintenance 26 mutation checks: revert each round H change alone, run its tests, expect a
failure, restore. Prints KILLED (a test failed) or SURVIVED (every test still passed).

  python mutate-m26.py              run every M26 entry
  python mutate-m26.py 40 50d       run the entries whose names start with these prefixes
  python mutate-m26.py --check      only check that every anchor (M26, M25, M24, M23) is found
  python mutate-m26.py --all        run the M25, M24 and M23 entries too (the complete revert run)
"""
import pathlib
import re
import subprocess
import sys

# The repository this runner sits in (tools/reverts/ -> the root). Run it in a copy instead:
# from M26 on, --repo=PATH; see tools/reverts/README.md.
ROOT = pathlib.Path(__file__).resolve().parents[2] if "__file__" in globals() else pathlib.Path.cwd()
# --repo=PATH runs in a copy of the repository, so the working tree stays untouched meanwhile.
for _flag in sys.argv[1:]:
    if _flag.startswith("--repo="):
        ROOT = pathlib.Path(_flag.split("=", 1)[1])
HERE = pathlib.Path(__file__).parent

SLIPS = "src/engine/progression/slips.ts"
LOGGER = "src/components/SetLogger/SetLogger.tsx"
MAXSHEET = "src/features/workout/MaxSheet.tsx"
UNITS = "src/features/profile/editors/UnitsEditor.tsx"
ACTIVE = "src/features/workout/ActiveWorkoutScreen.tsx"
PROG = "src/engine/progression/progression.ts"
BADSTART = "src/engine/recalibration/badStart.ts"
RECAL = "src/engine/recalibration/recalibrate.ts"
STORE = "src/core/state/appStore.ts"
MEDIA = "src/components/ExerciseDetail/ExerciseMedia.tsx"
CUSTOM = "src/features/library/useCustomMedia.ts"
HOWTO = "src/components/ExerciseDetail/HowToSheet.tsx"
TRIGGERS = "src/engine/recalibration/triggers.ts"
TYPES = "src/engine/workout/types.ts"
CROSS = "src/engine/progression/crossEstimate.ts"
GEN = "src/engine/workoutGenerator/generate.ts"

T_SLIPS = "src/engine/progression/slips.test.ts"
T_LOGGER = "src/components/SetLogger/SetLogger.slip.test.tsx"
T_MAXSHEET = "src/features/workout/MaxSheet.slip.test.tsx"
T_UNITS = "src/features/profile/editors/UnitsEditor.slip.test.tsx"
T_SLIPSCREEN = "src/features/workout/slips.screens.test.tsx"
T_MARKS = "src/engine/progression/progression.marks.test.ts"
T_BADSTART = "src/engine/recalibration/badStart.test.ts"
T_BADSTORE = "src/core/state/badStart.store.test.ts"
T_TRIGGERS = "src/engine/recalibration/triggers.test.ts"
T_LOOP = "src/components/ExerciseDetail/cardLoop.test.tsx"
T_MEDIA = "src/components/ExerciseDetail/ExerciseMedia.test.tsx"
T_OWN = "src/features/library/useOwnDemonstration.test.tsx"
T_HOWTO = "src/components/ExerciseDetail/HowToSheet.test.tsx"
T_DETAILS = "src/components/ExerciseDetail/ExerciseDetailSheet.keep.test.tsx"
T_SETTINGS = "src/features/settings/oneHome.test.tsx"
T_EASE = "src/engine/recalibration/recalibrate.easeLayer.test.ts"
SETTINGS = "src/features/settings/SettingsScreen.tsx"
OWNHOOK = "src/features/library/useOwnDemonstration.ts"
DETAILS = "src/components/ExerciseDetail/ExerciseDetailSheet.tsx"
MEDIA_CSS = "src/components/ExerciseDetail/ExerciseDetail.module.css"

MUTATIONS = [
    # Item 40: numbers that look like slips are asked about once.
    ("40a a weight past what almost anyone loads is asked about", SLIPS,
     "  if (!lifted && weight > ceiling) {", "  if (false) {", [T_SLIPS], None),
    ("40b a set past what the place makes is asked about", SLIPS,
     "  if (\n    !max &&\n    typeof input.heaviest", "  if (\n    false &&\n    typeof input.heaviest",
     [T_SLIPS], None),
    ("40c a max far above the lift's own best is asked about", SLIPS,
     "    if (implied <= own * SLIP_OVER_HISTORY) return null;", "    return null;", [T_SLIPS], None),
    ("40d with nothing logged, far above an estimate is asked about", SLIPS,
     "  if (implied <= limit) return null;", "  return null;", [T_SLIPS], None),
    ("40e reps far past the range are asked about", SLIPS,
     "  return reps > limit\n", "  return reps > limit + 1000\n", [T_SLIPS], None),
    ("40f a bodyweight out of range is asked about", SLIPS,
     "  if (next < low || next > high) {", "  if (false) {", [T_SLIPS], None),
    ("40g a bodyweight a quarter away from the confirmed one is asked about", SLIPS,
     "Math.abs(next - saved) > saved * SLIP_BODYWEIGHT_CHANGE", "false", [T_SLIPS], None),
    ("40h the logged best is read as the typed set is, up to thirty reps", SLIPS,
     "    const value = readingOf(exercise, set, options.bodyweight);",
     "    const value = readingOf(exercise, { ...set, reps: hold ? set.reps : Math.min(set.reps, 20) }, options.bodyweight);",
     [T_SLIPS], None),
    ("40i the set logger asks before logging", LOGGER,
     "    const slip = question?.(final) ?? null;", "    const slip = null;", [T_LOGGER], None),
    ("40j Keep logs the values asked about", LOGGER,
     "    const final = asking.values;\n    setAsking(null);\n    send(final);",
     "    setAsking(null);", [T_LOGGER], None),
    ("40k the max sheet asks before saving", MAXSHEET,
     "    if (slip && !keep) {", "    if (false) {", [T_MAXSHEET], None),
    ("40l a slip of a bodyweight is held back from the save", UNITS,
     "              if (bodyweight !== undefined && slipOf(bodyweight, profile.units)) {",
     "              if (false) {", [T_UNITS], None),
    ("40m the workout screen asks about reps only on a working set that is no hold", ACTIVE,
     "        if (hold || kind !== 'working') return null;", "", [T_SLIPSCREEN], None),
    # The review of item 40.
    ("40r1 today's working sets count with the history", SLIPS,
     "  for (const set of options.today ?? []) if (set.working !== false) read(set);\n", "",
     [T_SLIPS], None),
    ("40r2 a hold is read by its load", SLIPS,
     "  if (isHold(exercise)) {\n    const load = loggedLoad(exercise, set.weight);\n    return load !== null && load > 0 ? load : null;\n  }\n",
     "", [T_SLIPS], None),
    ("40r3 the max saved is the lifter's own word", SLIPS,
     "  const saved = hold || noLoad ? 0 : (input.saved ?? 0);", "  const saved = 0;",
     [T_SLIPS, T_MAXSHEET], None),
    ("40r4 the family before none", SLIPS,
     "  const family = familyMax(input.history, exercise) ?? 0;", "  const family = 0;",
     [T_SLIPS], None),
    ("40r5 no bar lift is lighter than its empty bar", SLIPS,
     "  if (\n    bar !== null &&\n    weight < bar - 1e-6 &&", "  if (\n    false &&\n    weight < bar - 1e-6 &&",
     [T_SLIPS], None),
    ("40r6 weight added to the body is read with the body", SLIPS,
     "    return maxFromSet(bodyweight + Math.max(0, set.weight ?? 0), set.reps);",
     "    return maxFromSet(Math.max(0, set.weight ?? 0), set.reps);", [T_SLIPS], None),
    ("40r7 as much again as the lifter weighs is asked about", SLIPS,
     "  if (\n    noLoad &&\n    !LOWER_BODY.has(exercise.movementPattern) &&",
     "  if (\n    false &&\n    !LOWER_BODY.has(exercise.movementPattern) &&", [T_SLIPS], None),
    ("40r8 a sled has its own ceiling", SLIPS,
     "    return CEILINGS[units].sled;", "    return CEILINGS[units].heavy;", [T_SLIPS], None),
    ("40r9 an estimate says per hand for a dumbbell", SLIPS,
     "${Math.round(most.estimate)} ${units}${perHand}`;", "${Math.round(most.estimate)} ${units}`;",
     [T_SLIPS], None),
    ("40r10 the max sheet's question has buttons of its own", MAXSHEET,
     [("<div key=\"question\" className={styles.actions}>", "<div className={styles.actions}>"),
      ("<div key=\"entry\" className={styles.actions}>", "<div className={styles.actions}>")],
     None, [T_MAXSHEET], None),
    ("40r11 the max sheet's question takes the focus", MAXSHEET,
     "    if (asking) changeRef.current?.focus();", "", [T_MAXSHEET], None),
    ("40r12 the max sheet refuses more than thirty reps", MAXSHEET,
     "  const tooManyReps = mode === 'set' && typedReps !== null && Math.round(typedReps) > MOST_REPS;",
     "  const tooManyReps = false;", [T_MAXSHEET], None),
    ("40r13 the max sheet reads the max saved", MAXSHEET,
     "          saved: enteredMaxFor(strengthMaxes, exercise.id, units),\n", "", [T_MAXSHEET], None),
    ("40r14 a countdown that fills takes the question away", LOGGER,
     "    setAsking(null);\n    setValues((current) => ({ ...current, reps: clampReps(fillReps) }));",
     "    setValues((current) => ({ ...current, reps: clampReps(fillReps) }));", [T_LOGGER], None),
    ("40r15 an edit keeps Cancel while it asks", LOGGER,
     "            {mode === 'edit' ? (\n              <button type=\"button\" className={styles.secondary} onClick={onCancel}>",
     "            {false ? (\n              <button type=\"button\" className={styles.secondary} onClick={onCancel}>",
     [T_LOGGER], 0),
    ("40r16 the set logger's buttons say why", LOGGER,
     "              aria-describedby={questionId}\n              data-testid=\"slip-change\"",
     "              data-testid=\"slip-change\"", [T_LOGGER], None),
    ("40r17 Change it, not Keep, is the button in focus's place", LOGGER,
     "              className={styles.primary}\n              onClick={change}",
     "              className={styles.primary}\n              onClick={keep}", [T_LOGGER], None),
    ("40r18 a bodyweight is judged against the one confirmed", UNITS,
     "      confirmed ? convertWeight(confirmed.value, confirmed.units, units) : undefined,",
     "      undefined,", [T_UNITS], None),
    ("40r19 a units switch judges a held number again", UNITS,
     "            if (held !== null && !slipOf(held, units)) {", "            if (false) {",
     [T_UNITS], None),
    ("40r20 nothing typed on the way is saved while it asks", UNITS,
     "                if (profile.bodyweight !== before) onChange(withBodyweight(draft, before));\n",
     "", [T_UNITS], None),
    ("40r21 a number kept is the one confirmed", UNITS,
     "                    setConfirmed({ value: kept, units: profile.units });\n", "", [T_UNITS], None),
    ("40r22 no Keep for more than a profile keeps", UNITS,
     "  const keepable = held !== null && held <= BODYWEIGHT_MAX;",
     "  const keepable = held !== null;", [T_UNITS], None),
    ("40r23 leaving with a question open says so", UNITS,
     "      if (leftHeld.current !== null) toast.show(leftHeld.current, 'info');\n", "",
     [T_UNITS], None),
    ("40r24 the workout screen reads today's sets with the history", ACTIVE,
     "                today: today.map((done) => ({\n                  weight: done.weight,\n                  reps: done.reps,\n                  working: done.kind === 'working',\n                })),\n",
     "", [T_SLIPSCREEN], None),
    ("40r25 the workout screen reads the max saved", ACTIVE,
     "                saved: savedMax,\n", "", [T_SLIPSCREEN], None),
    # The re-check of item 40.
    ("40s1 a bar lighter than empty is asked about after a heavier set today", SLIPS,
     "  if (\n    bar !== null &&\n    weight < bar - 1e-6 &&", "  if (\n    !lifted &&\n    bar !== null &&\n    weight < bar - 1e-6 &&",
     [T_SLIPS], None),
    ("40s2 a lift logged that light is not asked about its bar again", SLIPS,
     "    !loggedAsLight(input.history, exercise, kept, weight)", "    true", [T_SLIPS], None),
    ("40s3 no family lift without a load is a reference", SLIPS,
     " || !from || hasNoLoad(from)) continue;", " || !from) continue;", [T_SLIPS], None),
    ("40s4 the larger of the family's and the body's estimates", SLIPS,
     "    (best, one) => (best === null || one.limit > best.limit ? one : best),",
     "    (best, one) => (best === null ? one : best),", [T_SLIPS], None),
    ("40s5 weight added on any lift done at bodyweight has the added ceiling", SLIPS,
     "  if (hasNoLoad(exercise)) return CEILINGS[units].each;\n", "", [T_SLIPS], None),
    ("40s6 reps the lift has logged are no slip", SLIPS,
     "  if (!(top > 0) || logged.some((done) => done >= reps)) return null;",
     "  if (!(top > 0)) return null;", [T_SLIPS], None),
    ("40s7 the workout screen remembers reps", ACTIVE,
     "        return repsSlip(values.reps, range, [...repsToday, ...repsKept, ...repsBefore]);",
     "        return repsSlip(values.reps, range);", [T_SLIPSCREEN], None),
    ("40s9 Keep waits a moment", LOGGER,
     "      setKeepReady(false);\n", "", [T_LOGGER], None),
    ("40s10 the alert is the question's words alone", LOGGER,
     [("        <div className={styles.question} data-testid=\"slip-question\">",
       "        <div className={styles.question} role=\"alert\" data-testid=\"slip-question\">"),
      ("          <p id={questionId} className={styles.questionText} role=\"alert\">",
       "          <p id={questionId} className={styles.questionText}>")],
     None, [T_LOGGER], None),
    ("40s11 a held bodyweight settles again before it asks", UNITS,
     "                setSettled(null);\n", "", [T_UNITS], None),
    ("40s12 the bodyweight confirmed is converted to the units shown", UNITS,
     "convertWeight(confirmed.value, confirmed.units, units)", "confirmed.value", [T_UNITS], None),
    ("40s13 the draft keeps what the field had as the typing began", UNITS,
     "            if (held === null) setBefore(profile.bodyweight);\n", "", [T_UNITS], None),
    ("40s14 the bodyweight confirmed starts as the draft's", UNITS,
     "    profile.bodyweight !== undefined ? { value: profile.bodyweight, units: profile.units } : null,",
     "    null,", [T_UNITS], None),

    # Item 42: a bad start carries over.
    ("42a three reps short, not two", BADSTART,
     "  return shortBy(set.targetReps[0], reserve, first.reps, first.rir) >= SHORT_BY_REPS;",
     "  return shortBy(set.targetReps[0], reserve, first.reps, first.rir) >= SHORT_BY_REPS - 1;",
     [T_BADSTART], None),
    ("42b only the first two lifts are read", BADSTART,
     "    if (judged.length === 2) break;\n", "", [T_BADSTART], None),
    ("42c only a lift's first working set is read", BADSTART,
     "        earliest === null || Date.parse(set.completedAt) < Date.parse(earliest.completedAt)",
     "        earliest === null || Date.parse(set.completedAt) > Date.parse(earliest.completedAt)",
     [T_BADSTART], None),
    ("42d a target read from an estimate is not judged", BADSTART,
     "    ESTIMATED_MODES.has(progression.mode) ||\n", "", [T_BADSTART], None),
    ("42e a hold is not judged", BADSTART,
     "  if (!exercise || isHold(exercise)) return null;", "  if (!exercise) return null;",
     [T_BADSTART], None),
    ("42f a set heavier than asked is no evidence", BADSTART,
     "  } else if (first.weight === null || first.weight > set.targetWeight + 1e-6) {",
     "  } else if (first.weight === null) {", [T_BADSTART], None),
    ("42g the store rebuilds the rest when the start reads low", STORE,
     "    const result = await this.recalibrate({\n      type: 'bad-start',",
     "    const result = null && await this.recalibrate({\n      type: 'bad-start',",
     [T_BADSTORE], None),
    ("42h an undo of a set settles the start again", STORE,
     "      rest: null,\n      hold: null,\n    });\n    void this.settleStart();",
     "      rest: null,\n      hold: null,\n    });", [T_BADSTORE], None),
    ("42i a hard start eases as a low check-in does", RECAL,
     "  if (!checkIn) return HARD_START;", "  if (!checkIn) return undefined;", [T_BADSTORE], None),
    ("42j a hard start and a check-in take the larger of each part", RECAL,
     "    rir: Math.max(checkIn.rir, HARD_START.rir),", "    rir: checkIn.rir + HARD_START.rir,",
     [T_BADSTORE], None),
    # The review of item 42.
    ("42r1 a set is judged by its target when it was logged, not set by hand", BADSTART,
     "  if (first.byHand) return null;",
     "  if (entry.manual?.reps || entry.manual?.weight) return null;", [T_BADSTART, T_BADSTORE], None),
    ("42r2 sets asked for more than twelve reps to failure are not judged", BADSTART,
     "  if (set.targetReps[0] + reserve > JUDGED_REPS) return null;\n", "", [T_BADSTART], None),
    ("42r3 a target read from a session that missed its floor is not judged", BADSTART,
     "  if (progression.missed) return null;\n", "", [T_BADSTART], None),
    ("42r4 the plan's reserve, not one the day's settings added", BADSTART,
     "  const reserve = Math.min(set.targetRir, planRir);", "  const reserve = set.targetRir;",
     [T_BADSTART, T_BADSTORE], None),
    ("42r5 one reading for each place in the plan", BADSTART,
     "      places.has(place) || (entry.replacedFrom !== undefined && begun.has(entry.replacedFrom));",
     "      entry.replacedFrom !== undefined && begun.has(entry.replacedFrom);", [T_BADSTART], None),
    ("42r6 a stand-in is known by what it replaced", BADSTART,
     "      places.has(place) || (entry.replacedFrom !== undefined && begun.has(entry.replacedFrom));",
     "      places.has(place);", [T_BADSTART], None),
    ("42r7 the store marks a set whose target was set by hand", STORE,
     "      ...(byHand ? { byHand: true } : {}),\n", "", [T_BADSTORE], None),
    ("42r9 a change the lifter took back stays taken back", STORE,
     "      if (session.startDeclined === key || session.startFailed === key) return null;",
     "      if (session.startFailed === key) return null;", [T_BADSTORE], None),
    ("42r10 a change that could not be made is not tried again", STORE,
     "      if (session.startDeclined === key || session.startFailed === key) return null;",
     "      if (session.startDeclined === key) return null;", [T_BADSTORE], None),
    ("42r11 Undo of a hard start's change records the start declined", STORE,
     "      ...(declined !== undefined ? { startDeclined: declined } : {}),\n", "", [T_BADSTORE], None),
    ("42r12 the same set's own change is told with the hard start", STORE,
     "        headline: `${made.lastSummary.headline} Also from this set: ${tapped.lastSummary.headline}`,",
     "        headline: made.lastSummary.headline,", [T_BADSTORE], None),
    ("42r13 and taken back with it", STORE,
     "      previous: tapped.previous,\n", "", [T_BADSTORE], None),
    ("42r14 a check-in that feels good names the hard start", RECAL,
     "          headline: constraints.badStart\n            ? 'Feeling good: the rest stays eased for the hard start.'\n            : 'Feeling good: full workout kept.',",
     "          headline: 'Feeling good: full workout kept.',", [T_BADSTORE], None),
    ("42r15 Back to plan only when no other setting stays", RECAL,
     "      const settings = after !== undefined;", "      const settings = false;", [T_BADSTORE], None),
    # The re-check of item 42.
    ("42s1 a target an entered max raised is not judged", BADSTART,
     "    progression.fromMax ||\n", "", [T_BADSTART], None),
    ("42s2 the progression marks a target an entered max raised", PROG,
     "      fromMax: true,\n", "", [T_MARKS, T_BADSTORE], None),
    ("42s3 the progression marks a target read from a session that missed its floor", PROG,
     "    base.missed = true;\n", "", [T_MARKS, T_BADSTORE], None),
    ("42s4 a skipped set filled in later is marked by its target then", STORE,
     "      earlier && !earlier.skipped\n        ? earlier.byHand === true",
     "      earlier\n        ? earlier.byHand === true", [T_BADSTORE], None),
    ("42s5 a change that could not be made is kept with the session", STORE,
     "      this.setSession({ ...made, startFailed: key });\n      return;", "      return;",
     [T_BADSTORE], None),
    ("42s6 a queued change reads the start again as it runs", STORE,
     "      if (!reading || reading.low === Boolean(session.constraints.badStart)) return null;\n      const key",
     "      if (!reading) return null;\n      const key", [T_BADSTORE], None),
    ("42s7 a check-in after a low one feels good and names the hard start", RECAL,
     "            ? constraints.badStart\n              ? 'Feeling good: the rest stays eased for the hard start.'\n              : 'Feeling good: nothing left to change.'",
     "            ? 'Feeling good: nothing left to change.'", [T_BADSTORE], None),
    ("42s8 the overlay title for a start no longer short", TRIGGERS,
     "'Your start no longer falls short'", "'Bringing the planned work back'", [T_TRIGGERS], None),

    # Item 50: no Pause; the lifter's own GIF from How to.
    ("50a the demonstration itself picks the lifter's own", MEDIA,
     "    canPick ? (\n      <button\n        ref={pickRef}", "    false ? (\n      <button\n        ref={pickRef}",
     [T_LOOP, T_MEDIA], None),
    ("50b Your GIF picks one too", MEDIA,
     "              onClick={(event) => openPicker('bar', event)}\n              disabled={busy}\n              data-testid=\"demo-your-gif\"",
     "              onClick={() => undefined}\n              disabled={busy}\n              data-testid=\"demo-your-gif\"",
     [T_LOOP, T_MEDIA], None),
    ("50c How to sets the lifter's own", HOWTO,
     "          onPickFile={demonstration.pick}", "          onPickFile={undefined}", [T_HOWTO], None),
    # The review of item 50.
    ("50r1 a stop no one here asked for offers Play", MEDIA,
     "    element.addEventListener('pause', stopped);\n", "", [T_LOOP], None),
    ("50r2 a pause made out of view is no refusal", MEDIA,
     "      wanted &&\n      inView &&\n      element.paused &&", "      wanted &&\n      element.paused &&",
     [T_LOOP], None),
    ("50r3 a pause undone by a play is no refusal", MEDIA,
     "      inView &&\n      element.paused &&\n      element.isConnected &&",
     "      inView &&\n      element.isConnected &&", [T_LOOP], None),
    ("50r4 a pause as the clip leaves the page is no refusal", MEDIA,
     "      element.paused &&\n      element.isConnected &&\n", "      element.paused &&\n",
     [T_LOOP], None),
    ("50r5 a pause in the background is no refusal", MEDIA,
     "      element.isConnected &&\n      document.visibilityState !== 'hidden';",
     "      element.isConnected;", [T_LOOP], None),
    ("50r6 a refusal is held to the lifter's video it was for", MEDIA,
     "  const ownVideoMoving = moving && !(ownVideo && ownRefusedFor === ownKey);",
     "  const ownVideoMoving = moving && !(ownVideo && ownRefusedFor !== null);", [T_LOOP], None),
    ("50r7 a refusal of the lifter's video holds no diagram still", MEDIA,
     "    const playing = loops && moving;", "    const playing = loops && moving && ownRefusedFor === null;",
     [T_LOOP], None),
    ("50r8 Play on a refused clip hands the focus to Slow", MEDIA,
     "                focusSlow.current = document.activeElement === event.currentTarget;\n                setClipStill(false);",
     "                setClipStill(false);", [T_LOOP], None),
    ("50r9 Play over a picture hands the focus to it", MEDIA,
     "          focusPicture.current = document.activeElement === event.currentTarget;\n", "",
     [T_LOOP], None),
    ("50r10 only a press from the focused Play moves the focus", MEDIA,
     "          focusPicture.current = document.activeElement === event.currentTarget;",
     "          focusPicture.current = true;", [T_LOOP], None),
    ("50r11 the picture's button names what it shows", MEDIA,
     "        aria-label={`${name}. ${pickLabel}`}", "        aria-label={pickLabel}", [T_LOOP], None),
    ("50r12 the file input is no stop of its own", MEDIA,
     "      tabIndex={-1}\n      aria-hidden=\"true\"\n      data-testid=\"demo-file-input\"",
     "      data-testid=\"demo-file-input\"", [T_LOOP], None),
    ("50r13 Try again over a diagram stands at the top", MEDIA,
     "${diagram ? styles.demoOverlayTop : ''}", "${''}", [T_MEDIA], None),
    ("50r14 Play over a picture stands at the top", MEDIA,
     "    <span className={`${styles.demoOverlay} ${styles.demoOverlayTop}`}>",
     "    <span className={styles.demoOverlay}>", [T_MEDIA], None),
    ("50r15 a replacement is read again", CUSTOM,
     "  }, [store, exerciseId, mediaCount, revision]);", "  }, [store, exerciseId, mediaCount]);",
     [T_OWN], None),
    ("50r16 the store marks a demonstration added or replaced", STORE,
     "      ...(media !== null ? { customCounts: { ...this.state.customCounts, media } } : {}),\n      customMediaRevision: revision,\n",
     "      ...(media !== null ? { customCounts: { ...this.state.customCounts, media } } : {}),\n",
     [T_OWN], None),
    # The re-check of item 50.
    ("50s1 a browser pause is judged again a frame later", MEDIA,
     "      if (!stopping() || frame !== null) return;\n      frame = nextFrame(() => {\n        frame = null;\n        if (stopping()) onRefused?.();\n      });",
     "      if (stopping()) onRefused?.();", [T_LOOP], None),
    ("50s2 the focus comes back after a removal", MEDIA,
     "    if (target && lost)\n      (target === 'pick' ? pickRef : barRef).current?.focus({ preventScroll: true });\n",
     "", [T_LOOP], None),
    ("50s3 the caption bar is the same through a pick", MEDIA,
     [("        <figcaption key=\"bar\" className={styles.demoBar}>",
       "        <figcaption className={styles.demoBar}>"),
      ("      <figcaption key=\"bar\" className={styles.demoBar}>",
       "      <figcaption className={styles.demoBar}>")],
     None, [T_LOOP], None),
    ("50s4 Play leaves the focus on the frame, never the picker", MEDIA,
     "        ref={pickRef}\n        type=\"button\"\n        className={styles.demoPick}",
     "        ref={(node) => {\n          pickRef.current = node;\n          takeFocus(node);\n        }}\n        type=\"button\"\n        className={styles.demoPick}",
     [T_LOOP], None),
    ("50s5 a Play belongs to the media it was pressed for", MEDIA,
     "  const moving = !reducedMotion || askedFor === motionKey;",
     "  const moving = !reducedMotion || askedFor !== null;", [T_LOOP], None),
    ("50s6 a clip's credit comes back once it plays", MEDIA,
     "  const own = !diagram || (clip && video.src !== null);", "  const own = !diagram;",
     [T_MEDIA], None),
    ("50s7 a read of the data across a pick keeps its count", STORE,
     "          media: this.mediaVersion === mediaSeen ? customMedia : this.state.customCounts.media,",
     "          media: customMedia,", [T_OWN], None),
    ("50s8 the same record read again is the one in hand", CUSTOM,
     "          setLoaded((current) =>\n            current && current.exerciseId === exerciseId && sameRecord(current.media, media)\n              ? current\n              : { exerciseId, media, revision },\n          );",
     "          setLoaded({ exerciseId, media, revision });", [T_OWN], None),
    # The third pass of item 40.
    ("40t2 a set today covers one only with as many reps", SLIPS,
     "(hold || set.reps >= reps)", "true", [T_SLIPS], None),
    ("40t3 a weight the lift lifted before is not asked about for what it weighs", SLIPS,
     "  const lifted = loggedAsHeavy(input.history, exercise, kept, weight);",
     "  const lifted = loggedAsHeavy([], exercise, kept, weight);", [T_SLIPS], None),
    ("40t4 the lift logged that heavy here is not asked about the place again", SLIPS,
     "    weight > input.heaviest + 1e-6 &&\n    !loggedAsHeavy(input.history, exercise, kept, weight, input.place)\n",
     "    weight > input.heaviest + 1e-6\n", [T_SLIPS], None),
    ("40t5 logged at another place says nothing of this one", SLIPS,
     "      (place === undefined || record.locationId === place) &&", "      true &&", [T_SLIPS], None),
    ("40t6 no question of as much as the lifter weighs on the lower body", SLIPS,
     "    !LOWER_BODY.has(exercise.movementPattern) &&\n    !lifted &&", "    !lifted &&", [T_SLIPS], None),
    ("40t7 a set past twenty reps still says what the lift can do", SLIPS,
     "    if (set.reps < 1) return;\n",
     "    if (set.reps < 1 || (!hold && set.reps > 20)) return;\n", [T_SLIPS], None),
    ("40t8 the body's estimate at three and a half times, not two and a half", SLIPS,
     "export const SLIP_OVER_BODY = 3.5;", "export const SLIP_OVER_BODY = 2.5;", [T_SLIPS], None),
    ("40t9 a saved bodyweight out of range makes no question of its correction", SLIPS,
     "    saved >= low &&\n    saved <= high &&\n", "", [T_SLIPS], None),
    ("40t10 a question asked again waits its own moment", LOGGER,
     "      window.clearTimeout(keepTimer.current);\n", "", [T_LOGGER], None),
    ("40t11 a plausible number the typing paused on is the one a question goes back to", UNITS,
     "                  setBefore(bodyweight);\n", "", [T_UNITS], None),
    ("40t12 leaving with a question open says the bodyweight that stands", UNITS,
     "        ? `Bodyweight stays ${profile.bodyweight} ${profile.units}`",
     "        ? 'Bodyweight not changed'", [T_UNITS], None),
    ("40t13 a number typed on the way never becomes the one a question goes back to", UNITS,
     "              window.clearTimeout(beforeTimer.current);\n", "", [T_UNITS], None),
    ("40t15 a set today as heavy, of as many reps, covers one", SLIPS,
     "  if (covered) return null;\n", "", [T_SLIPS], None),
    # The third pass of item 42.
    ("42t1 a reading's lifts in any order", BADSTART,
     "`low:${[...reading.lifts].sort().join(',')}`", "`low:${reading.lifts.join(',')}`",
     [T_BADSTART], None),
    ("42t2 a session as far short as a hard start reads marks its target", PROG,
     "      (firstSet.rir !== null &&\n        shortBy(", "      (false &&\n        shortBy(", [T_MARKS], None),
    ("42t4 a saved workout's targets are not read", BADSTART,
     "    progression.fromMax ||\n    progression.saved ||\n", "    progression.fromMax ||\n", [T_BADSTART], None),
    ("42t5 a saved workout loads marked", STORE,
     "    const fresh = asSaved(explanationOnce(withoutStops(saved.workout)));",
     "    const fresh = explanationOnce(withoutStops(saved.workout));", [T_BADSTORE], None),
    ("42t6 a set is read against the plan's reserve when it was logged", BADSTART,
     "    first.planRir ?? prescribeFor(", "    prescribeFor(", [T_BADSTART], None),
    ("42t7 the store keeps the plan's reserve with each working set", STORE,
     "      ...(planRir !== undefined ? { planRir } : {}),\n", "", [T_BADSTORE], None),
    ("42t8 a skipped set filled in later is done now", STORE,
     "      completedAt: earlier && !earlier.skipped ? earlier.completedAt : now,",
     "      completedAt: earlier ? earlier.completedAt : now,", [T_BADSTORE], None),
    ("42t9 a failed change of the same set stays in view", STORE,
     "    if (set.kind === 'working' && !failed) await this.settleStart(tapped);",
     "    if (set.kind === 'working') await this.settleStart(tapped);", [T_BADSTORE], None),
    ("42t10 a queued change makes nothing the lifter took back", STORE,
     "      if (session.startDeclined === key || session.startFailed === key) return null;\n", "",
     [T_BADSTORE], None),
    ("42t11 a failure is kept only with the session it was read from", STORE,
     "          current.status === 'preview' ||\n", "", [T_BADSTORE], None),
    ("42t12 told with the set's own change only when nothing ran between them", STORE,
     "    if (made.previous?.workout !== tapped.workout) return;\n", "", [T_BADSTORE], None),
    ("42t13 a start no longer short is no hard start in the overlay", TRIGGERS,
     "      trigger.type === 'bad-start' && !trigger.low ? 'No longer a hard start' : definition.label,",
     "      definition.label,", [T_TRIGGERS], None),
    # The third pass of item 50.
    ("50t1 a read of the data across a pick's write keeps its count", STORE,
     "      counted ?? (atLeast > 0 ? Math.max(atLeast, this.state.customCounts.media) : null);\n    this.mediaVersion += 1;\n",
     "      counted ?? (atLeast > 0 ? Math.max(atLeast, this.state.customCounts.media) : null);\n", [T_OWN], None),
    ("50t3 a removed demonstration is let go", CUSTOM,
     "  if (mediaCount === 0 && loaded !== null) setLoaded(null);\n", "", [T_OWN], None),
    ("50t4 the same record means the same picture too", CUSTOM,
     " &&\n    a.dataUrl === b.dataUrl", "", [T_OWN], None),
    ("50t5 Remove hands the focus to Replace first", MEDIA,
     "                    if (focused) barRef.current?.focus({ preventScroll: true });\n", "",
     [T_OWN], None),
    ("50t6 a picture of the lifter's own ends the diagram", MEDIA,
     "  if (customMedia && diagram) setDiagram(false);\n", "", [T_MEDIA], None),
    ("50t7 busy only for the exercise being saved", OWNHOOK,
     "    busy: saving.includes(exerciseId),", "    busy: saving.length > 0,", [T_OWN], None),
    ("50t8 How to gives each exercise its own demonstration", HOWTO,
     "          key={exercise.id}\n", "", [T_HOWTO], None),
    ("50t9 the details give each exercise its own demonstration", DETAILS,
     "        key={exercise.id}\n", "", [T_DETAILS], None),
    ("50t10 a picture's frame draws its focus ring inside", MEDIA_CSS,
     ".demoFrame:focus-visible {\n  outline: 2px solid var(--color-accent);\n  outline-offset: -2px;\n}\n",
     "", [T_MEDIA], None),
    # The fourth pass of item 40.
    ("40u1 the body's estimate at three and a half times, not five", SLIPS,
     "export const SLIP_OVER_BODY = 3.5;", "export const SLIP_OVER_BODY = 5;", [T_SLIPS], None),
    ("40u2 weight added on the lower body keeps the added ceiling", SLIPS,
     "  if (hasNoLoad(exercise)) return CEILINGS[units].each;",
     "  if (hasNoLoad(exercise)) return CEILINGS[units][LOWER_BODY.has(exercise.movementPattern) ? 'heavy' : 'each'];",
     [T_SLIPS], None),
    ("40u3 the set being corrected spares a question", ACTIVE,
     "                editing: own ? { weight: own.weight, reps: own.reps, working: false } : null,",
     "                editing: null,", [T_SLIPSCREEN], None),
    ("40u4 the set being corrected is no best to hold the correction to", ACTIVE,
     "        const today = logged.filter((done) => !done.skipped && done.setIndex !== editing);",
     "        const today = logged.filter((done) => !done.skipped);", [T_SLIPSCREEN], None),
    ("40u5 the rule takes the set being corrected as sparing only", SLIPS,
     "  const kept = editing && sameWeight ? [...today, editing] : today;", "  const kept = today;",
     [T_SLIPS], None),
    ("40u6 a number the typing paused on is confirmed", UNITS,
     "                  if (autosaves) setConfirmed({ value: bodyweight, units });\n", "", [T_UNITS], None),
    ("40u7 an emptied field is no bodyweight to go back to", UNITS,
     "              if (bodyweight !== undefined) {\n                const units = profile.units;",
     "              if (true) {\n                const units = profile.units;", [T_UNITS], None),
    ("40u8 the typed set is read up to thirty reps, as the logged best", SLIPS,
     "    : readingOf(exercise, { weight, reps: Math.max(1, input.reps) }, bodyweight);",
     "    : readingOf(exercise, { weight, reps: Math.min(Math.max(1, input.reps), 20) }, bodyweight);",
     [T_SLIPS], None),
    ("40u9 the reps of the set being corrected spare a reps question", ACTIVE,
     "        const repsKept = own ? [own.reps] : [];", "        const repsKept: number[] = [];",
     [T_SLIPSCREEN], None),
    # The fourth pass of item 42.
    ("42u1 a session's first set is read against the plan's reserve for the mark", PROG,
     "          prescribeFor(exercise, role, profile, history).rir,",
     "          firstSet.targetRir ?? 0,", [T_MARKS], None),
    ("42u2 a target read from another rep range is marked", PROG,
     "  if (newToZone) base.otherRange = true;\n", "", [T_MARKS], None),
    ("42u3 the mark is carried to the plan", PROG,
     "    ...(target.otherRange ? { otherRange: true } : {}),\n", "", [T_MARKS], None),
    ("42u4 a target read from another rep range is not read", BADSTART,
     "    progression.saved ||\n    // Nor one read from another rep range: a lift at bodyweight new to today's range is read from\n    // the last it did (the fourth pass of item 42).\n    progression.otherRange\n",
     "    progression.saved\n", [T_BADSTART], None),
    # The fourth pass of item 50.
    ("50u1 a pick counts what the database holds once it is written", STORE,
     "    const counted = await db.count('customMedia').catch(() => null);",
     "    const counted: number | null = null;", [T_OWN], None),
    ("50u3 media is written one change at a time", STORE,
     [("    const run = this.mediaWrites.then(async () => {\n      const db = await this.getDatabase();\n      this.mediaVersion += 1;\n      let written = false;",
       "    const run = Promise.resolve().then(async () => {\n      const db = await this.getDatabase();\n      this.mediaVersion += 1;\n      let written = false;"),
      ("    const run = this.mediaWrites.then(async () => {\n      const db = await this.getDatabase();\n      // One already gone",
       "    const run = Promise.resolve().then(async () => {\n      const db = await this.getDatabase();\n      // One already gone")],
     None, [T_OWN], None),
    ("50u4 every save in flight holds its exercise", OWNHOOK,
     "  const begun = (id: string) => setSaving((current) => [...current, id]);",
     "  const begun = (id: string) => setSaving([id]);", [T_OWN], None),
    ("50u5 a failed removal gives the focus back to Remove", MEDIA,
     "                    if (focused && done instanceof Promise) {",
     "                    if (false && done instanceof Promise) {", [T_OWN], None),
    # The fifth pass of item 40.
    ("40v1 the set being corrected spares the absolute checks at its own weight only", SLIPS,
     "  const kept = editing && sameWeight ? [...today, editing] : today;",
     "  const kept = editing ? [...today, editing] : today;", [T_SLIPS], None),
    ("40v2 a correction is spared up to one and a half times the set it corrects", SLIPS,
     "  if (corrected !== null && implied <= corrected * SLIP_OVER_HISTORY) return null;\n", "",
     [T_SLIPS], None),
    ("40v3 no estimate questions the empty bar", SLIPS,
     "  if (bar !== null && weight <= bar + 1e-6) return null;\n", "", [T_SLIPS], None),
    ("40v4 no estimate questions the app's own target", SLIPS,
     "  const limit = Math.max(most.limit, asked * SLIP_OVER_BODY);",
     "  const limit = most.limit;", [T_SLIPS], None),
    ("40v5 the workout screen passes the set's own target", ACTIVE,
     "                target,\n", "", [T_SLIPSCREEN], None),
    ("40v6 a pause confirms a bodyweight only where it is saved", UNITS,
     "                  if (autosaves) setConfirmed({ value: bodyweight, units });",
     "                  setConfirmed({ value: bodyweight, units });", [T_UNITS], None),
    ("40v7 Settings says it saves at a pause", SETTINGS,
     "                <UnitsEditor draft={draft} onChange={editor.update} autosaves />",
     "                <UnitsEditor draft={draft} onChange={editor.update} />", [T_SETTINGS], None),
    # The fifth pass of item 42.
    ("42v1 a hard start eases the rest where it stands", RECAL,
     "      const workout = easeTheRest(request, constraints);",
     "      const settled = settleKept(request, constraints);\n      const workout = rebuild({ ...request, workout: settled.workout }, scope, {\n        choice: request.duration,\n        constraints,\n        trimmable: settled.trimmable,\n      });",
     [T_BADSTORE], None),
    ("42v2 the lifter's own weights are kept", RECAL,
     "      if (ownLoads) {", "      if (false) {", [T_BADSTORE], None),
    ("42v3 a pair or a lift under way keeps its sets", RECAL,
     "    if (block.entries.some((entry) => begun.has(entry.id))) {\n      // Under way before the ease, a lift keeps its sets for good: an undo of them never brings the\n      // ease on unsaid (the eighth pass of item 42).\n      for (const entry of block.entries) {\n        entry.eased ??= { exerciseId: entry.exerciseId, kept: true };\n      }\n      continue;\n    }\n",
     "", [T_BADSTORE], None),
    ("42v4 exactly what was taken comes back", RECAL,
     "      const count = low ? working.length - take : working.length + take;",
     "      const count = low ? working.length - take : working.length;", [T_BADSTORE], None),
    ("42v5 what was taken is kept on the lift", RECAL,
     "      if (low) entry.eased = { sets: take };\n", "", [T_BADSTORE], None),
    ("42v6 a straight block counts its working sets, a drop set apart", RECAL,
     "    if (!changed) continue;\n    // A straight block's count is its working sets, as the plan counts them (a drop set apart).\n    if (block.kind === 'straight') {",
     "    if (!changed) continue;\n    // A straight block's count is its working sets, as the plan counts them (a drop set apart).\n    if (false) {",
     [T_BADSTORE], None),
    ("42v7 a plan not yet started keeps a change made again during it", STORE,
     "      (session.status !== 'preview' &&\n", "      (true &&\n", [T_BADSTORE], None),
    ("42v8 a workout finished during a change takes nothing of it", STORE,
     "          current.status === 'preview' ||\n          current.status === 'completed'))",
     "          current.status === 'preview'))", [T_BADSTORE], None),
    ("42v9 a workout discarded and started again during a change takes nothing of it", STORE,
     "        (current.createdAt !== session.createdAt ||\n", "        (false ||\n", [T_BADSTORE], None),
    # The fifth pass of item 50.
    ("50v1 a pick that fails still refreshes the screen", STORE,
     "        // a count that failed after a first pick hid it).\n        await this.mediaWritten(db, written ? 1 : 0);",
     "        // a count that failed after a first pick hid it).\n        if (written) await this.mediaWritten(db, written ? 1 : 0);",
     [T_OWN], None),
    ("50v2 a removal that fails still refreshes the screen", STORE,
     "        await this.mediaWritten(db, 0, gone ? exerciseId : null);",
     "        if (gone) await this.mediaWritten(db, 0, gone ? exerciseId : null);",
     [T_OWN], None),
    ("50v3 a removal of one already gone brings the screen up to date", STORE,
     "      this.mediaVersion += 1;\n      let gone = false;\n      try {\n        await deleteVerified(db, 'customMedia', exerciseId);",
     "      if ((await db.get<Identified>('customMedia', exerciseId)) === undefined) return;\n      this.mediaVersion += 1;\n      let gone = false;\n      try {\n        await deleteVerified(db, 'customMedia', exerciseId);",
     [T_OWN], None),
    ("50v4 the queue keeps no picked file", STORE,
     "    this.mediaWrites = run.then(\n      () => undefined,\n      () => undefined,\n    );\n    return run;\n  }\n\n  /**\n   * Every media write ends here",
     "    this.mediaWrites = run.catch(() => undefined);\n    return run;\n  }\n\n  /**\n   * Every media write ends here",
     [T_OWN], None),
    ("50v5 a failed removal is given back to Remove at the save's end", MEDIA,
     "                        giveBack.current = 'remove';\n", "", [T_OWN], None),
    ("50v6 the save's end takes the focus back to Remove", MEDIA,
     "    if (target === 'remove') {\n      if (lost || at === barRef.current) {\n        (removeRef.current ?? barRef.current)?.focus({ preventScroll: true });\n      }\n      return;\n    }\n",
     "", [T_OWN], None),
    # The sixth pass of item 40.
    ("40w1 with no estimate, nothing is asked by one", SLIPS,
     "  if (most === null) return null;\n", "", [T_SLIPS], None),
    ("40w2 setup calls the bodyweight entered, not saved", UNITS,
     "      !autosaves,\n", "      false,\n", [T_UNITS], None),
    # The sixth pass of item 50.
    ("50w1 a picture verified written counts though the count fails", STORE,
     "        await this.mediaWritten(db, written ? 1 : 0);",
     "        await this.mediaWritten(db, 0);",
     [T_OWN], None),
    ("50w2 the save's end gives the focus to the bar when the picture went", MEDIA,
     "        (removeRef.current ?? barRef.current)?.focus({ preventScroll: true });",
     "        removeRef.current?.focus({ preventScroll: true });", [T_OWN], None),
    ("50w3 a frame later the focus goes to the bar when the picture went", MEDIA,
     "                          const back = removeRef.current ?? barRef.current;",
     "                          const back = removeRef.current;", [T_LOOP], None),
    ("50w4 a read of a picture that fails is caught", CUSTOM,
     "        () => {\n          // A read that fails is tried once more a moment later, so a picture just removed does\n          // not stay for a passing failure; failing again it keeps what is shown, and the next\n          // change reads again (the sixth and seventh passes).\n          if (!cancelled && !last) again = window.setTimeout(() => void read(true), READ_AGAIN_MS);\n        },\n",
     "", [T_OWN], None),
    # The sixth pass of item 42: the hard start's ease as a layer over the plan.
    ("42w1 the hard start is no part of the plan's own adjustment", RECAL,
     "    constraints.readiness ? readinessAdjustment(constraints.readiness) : undefined,\n  );",
     "    feltAdjust(constraints),\n  );", [T_EASE, T_BADSTORE], None),
    ("42w2 every change is made to the plan under the ease", RECAL,
     "    const bare = underTheEase(shown, request.completed);", "    const bare = shown;",
     [T_EASE], None),
    ("42w3 the ease is laid again over what a change leaves", RECAL,
     "        constraints.badStart ? easeTheRest(workout, plain, constraints) : withoutMarks(workout),",
     "        constraints.badStart ? workout : withoutMarks(workout),", [T_EASE, T_BADSTORE], None),
    ("42w4 the time is told again once the ease is laid or taken off", RECAL,
     "    if (next !== outcome.workout || bare !== shown) {", "    if (false) {", [T_EASE], None),
    ("42w5 a block begun keeps its sets and marks under a change", RECAL,
     "  const kept = keepUnderWay(workout, begun);", "  const kept = workout;", [T_EASE], None),
    ("42w6 a set comes off only above the floor a check-in keeps", RECAL,
     "Math.min(fewer, Math.max(0, count - setFloor(entry.role)))",
     "Math.min(fewer, count - 1)", [T_EASE, T_BADSTORE], None),
    ("42w7 a count set by hand or offered by the coach stays", RECAL,
     "  const kept =\n    entry.manual?.sets === true ||\n    entry.slot === undefined ||\n    stoppedBefore(blocks, entry).length > 0;",
     "  const kept = false;", [T_EASE, T_BADSTORE], None),
    ("42w8 a set comes off only where a check-in took none", RECAL,
     "    fewer: Math.max(0, (plan?.sets ?? 0) - (shown?.sets ?? 0)),", "    fewer: 1,",
     [T_EASE], None),
    ("42w9 a rep of reserve only where a check-in added none", RECAL,
     "    reserve: Math.max(0, (shown?.rir ?? 0) - (plan?.rir ?? 0)),", "    reserve: 1,",
     [T_EASE], None),
    ("42w10 what an eased lift had is kept on it", RECAL,
     "  entry.eased = recordOf(entry, block);\n  entry.sets = sets;", "  entry.sets = sets;",
     [T_EASE, T_BADSTORE], None),
    ("42w11 an eased lift says why", RECAL,
     "      evidence: [`Eased for a hard start: ${what}.`, ...entry.progression.evidence],",
     "      evidence: entry.progression.evidence,", [T_EASE], None),
    ("42w12 the plan under the ease has its reasons back", RECAL,
     "  if (was.progression) entry.progression = was.progression;\n  else delete entry.progression;\n",
     "", [T_EASE], None),
    ("42w13 a block's rounds count its working sets alone", TYPES,
     "  return entry.sets.filter((set) => set.kind === 'working').length;\n}\n\n/** The rounds a paired block runs",
     "  return entry.sets.filter((set) => set.kind !== 'warmup').length;\n}\n\n/** The rounds a paired block runs",
     [T_EASE], None),
    ("42w14 a lighter load at the same reps where the place makes one near", RECAL,
     "    if (load < weight - 1e-6) return { ...set, targetRir: rir, targetWeight: load };\n", "",
     [T_EASE], None),
    ("42w15 the nearest load, not any lighter one", RECAL,
     "      if (lighter >= load - 1e-6 || Math.abs(lighter - exact) >= Math.abs(load - exact) - 1e-6) {",
     "      if (lighter >= load - 1e-6) {", [T_EASE], None),
    ("42w16 a hold's seconds and load stay", RECAL,
     "  if (more <= 0 || exercise.measure === 'seconds') return set;", "  if (more <= 0) return set;",
     [T_EASE, T_BADSTORE], None),
    ("42w17 the reserve stops at four", RECAL,
     "  const rir = Math.min(4, set.targetRir + up);", "  const rir = set.targetRir + up;",
     [T_EASE], None),
    ("42w18 a set pushed past the weights here keeps its load", RECAL,
     "  if (!manual?.weight && !set.asked && weight !== null && weight > 0) {",
     "  if (!manual?.weight && weight !== null && weight > 0) {", [T_EASE], None),
    ("42w19 a weight set by hand keeps its load", RECAL,
     "  if (!manual?.weight && !set.asked && weight !== null && weight > 0) {",
     "  if (!set.asked && weight !== null && weight > 0) {", [T_EASE, T_BADSTORE], None),
    ("42w20 reps set by hand stay", RECAL,
     "  if (manual?.reps || high - more < 1) return set;", "  if (high - more < 1) return set;",
     [T_EASE], None),
    ("42w21 a single loses no rep", RECAL,
     "  if (manual?.reps || high - more < 1) return set;", "  if (manual?.reps) return set;",
     [T_EASE], None),
    ("42w22 sets added or taken by hand count from what shows", RECAL,
     "      const want = seen + trigger.workingDelta;",
     "      const want = working() + trigger.workingDelta;", [T_EASE], None),
    ("42w23 a set taken by hand never takes the last", RECAL,
     "        if (!removable() || want < 1) {", "        if (!removable()) {",
     [T_EASE, "src/engine/recalibration/recalibrate.test.ts"], None),
    ("42w24 a pause's short warm-up counts in the time once eased", RECAL,
     "        warmup: workout.warmup.generalMinutes,\n", "", [T_EASE], None),
    ("42w25 the check-in's words read the workout as it showed", RECAL,
     "      const change = dayChange({ ...request, workout: layer.shown }, workout);\n      // Sets are named only where",
     "      const change = dayChange(request, workout);\n      // Sets are named only where",
     [T_EASE, T_BADSTORE], None),
    ("42w27 the hard start's words read the workout as it showed", RECAL,
     "      const change = dayChange({ ...request, workout: layer.shown }, workout);\n      const sets = (after?.sets ?? 0) - (before?.sets ?? 0);",
     "      const change = dayChange(request, workout);\n      const sets = (after?.sets ?? 0) - (before?.sets ?? 0);",
     [T_EASE, T_BADSTORE], None),
    ("42w28 the hard start's words see the ease it lays", RECAL,
     "      const workout = layer.finish(request.workout, constraints);",
     "      const workout = request.workout;", [T_EASE, T_BADSTORE], None),
    ("42w29 a check-in names a hard start the day still shows", RECAL,
     "        ...(stays\n          ? {\n              headline: `${adjust ? 'Checked in' : 'Feeling good'}: the rest stays eased for the hard start.`,\n            }\n          : {}),\n",
     "", [T_BADSTORE, T_EASE], None),
    ("42w30 a plan made again during a change has the change worked out on it", STORE,
     "      if (!aimed && !again) {\n        this.setState({ calibration: IDLE_CALIBRATION });\n        return this.runCalibration(trigger, reason, true);\n      }\n",
     "", [T_BADSTORE], None),
    ("42w31 ... not a change aimed at one of its lifts", STORE,
     "      const aimed = 'entryId' in trigger || 'blockId' in trigger || trigger.type === 'add-exercise';",
     "      const aimed = false;", [T_BADSTORE], None),
    ("42w32 ... and once only", STORE,
     "      if (!aimed && !again) {", "      if (!aimed) {", [T_BADSTORE], None),
    ("42w33 a saved copy keeps no marks of the ease", STORE,
     "      workout: planUnderTheEase(session.workout),", "      workout: session.workout,",
     [T_BADSTORE], None),
    ("42w34 a loaded copy keeps no marks of the ease", TYPES,
     "  const plain = withoutEase(workout);", "  const plain = workout;", [T_EASE], None),
    ("42w36 the load a rep more in reserve asks reads the plan's own rule", PROG,
     "  const e1rm = weight * (1 + Math.min(reps + rir, 12) / 30);", "  const e1rm = weight;",
     [T_EASE], None),
    # The seventh pass of item 40.
    ("40x1 a slip is read by what the lifter's other lifts suggest", SLIPS,
     "  const others = Math.max(ceilingWith(input.maxes ?? null), input.maxes ? ceilingWith(null) : 0);",
     "  const others = 0;", [T_SLIPS], None),
    ("40x2 the workout screen gives the time and the maxes entered", ACTIVE,
     "                now: new Date(now).toISOString(),\n                maxes: strengthMaxes,\n",
     "", [T_SLIPSCREEN], None),
    ("40x3 the max sheet gives the time and the maxes entered", MAXSHEET,
     "          now: new Date(now).toISOString(),\n          maxes: strengthMaxes,\n",
     "", [T_MAXSHEET], None),
    ("40x4 an estimate that rounds to nothing is none", SLIPS,
     "  ].filter((one) => Math.round(one.estimate) > 0);",
     "  ].filter((one) => one.estimate > 0);", [T_SLIPS], None),
    ("40x5 a bodyweight confirmed in other units is named as it was", SLIPS,
     "(${as && as.units !== units ? `${shown(as.value)} ${as.units}, about ${shown(saved)} ${units}` : `${shown(saved)} ${units}`})",
     "(${shown(saved)} ${units})", [T_SLIPS, T_UNITS], None),
    ("40x6 setup judges by a number the typing paused on too", UNITS,
     "                  setBefore(bodyweight);\n                  setConfirmed({ value: bodyweight, units });\n",
     "                  setBefore(bodyweight);\n", [T_UNITS], None),
    ("40x7 the editor names the one confirmed as it was", UNITS,
     "      confirmed ?? undefined,\n", "", [T_UNITS], None),
    # The seventh pass of item 50.
    ("50x1 a removal whose delete landed counts as removed", OWNHOOK,
     "      if (gone) {\n        toast.show('Removed your demonstration', 'success');\n        return true;\n      }\n",
     "", [T_OWN], None),
    ("50x2 a read of a picture that failed is tried once more", CUSTOM,
     "          if (!cancelled && !last) again = window.setTimeout(() => void read(true), READ_AGAIN_MS);",
     "          void last;", [T_OWN], None),
    # The seventh pass of item 42.
    ("42x1 a check-in names the hard start as staying only when nothing changed", RECAL,
     "      const stays = asShown && diffWorkouts(layer.shown, workout).length === 0;",
     "      const stays = asShown;", [T_BADSTORE, T_EASE], None),
    ("42x2 a check-in that changed the plan names the hard start with what changed", RECAL,
     "            : asShown\n              ? adjust\n                ? 'Checked in (the rest eased for it and the hard start)'\n                : 'Feeling good (the rest eased for the hard start)'\n              : 'Checked in',",
     "            : 'Checked in',", [T_BADSTORE], None),
    ("42x3 a skip's minutes are the lift's as it shows, timed alike", RECAL,
     "      const saved = Math.max(0, Math.round(timed(layer.shown.blocks) - timed(without.blocks)));",
     "      const saved = Math.max(0, Math.round(timed(without.blocks) - timed(workout.blocks)));",
     [T_EASE], None),
    ("42x4 a stand-in owes the plan's sets", RECAL,
     "  // layer eases it (the seventh pass of item 42). A count set by hand stands (the eighth pass).\n  const plan = entry.manual?.sets ? entry.sets : (entry.eased?.sets ?? entry.sets);",
     "  // layer eases it (the seventh pass of item 42). A count set by hand stands (the eighth pass).\n  const plan = entry.manual?.sets ? entry.sets : entry.sets;", [T_EASE], None),
    ("42x5 a lift swapped back to takes the plan's sets owed", RECAL,
     "  // count set by hand stands (the eighth pass).\n  const plan = entry.manual?.sets ? entry.sets : (entry.eased?.sets ?? entry.sets);",
     "  // count set by hand stands (the eighth pass).\n  const plan = entry.manual?.sets ? entry.sets : entry.sets;", [T_EASE], None),
    ("42x6 a lift closed at its logged sets owes the plan's", GEN,
     "  const owed = (entry.manual?.sets ? entry.sets : (entry.eased?.sets ?? entry.sets)).filter(",
     "  const owed = (entry.manual?.sets ? entry.sets : entry.sets).filter(",
     [T_EASE], None),
    ("42x7 a lift closed at its logged sets keeps no record of the ease", GEN,
     "  ).length;\n  delete entry.eased;\n  entry.sets = entry.sets.filter((set) => isDone(entry.id, set.index));",
     "  ).length;\n  entry.sets = entry.sets.filter((set) => isDone(entry.id, set.index));", [T_EASE], None),
    ("42x8 a swap built afresh keeps no record of the old exercise", RECAL,
     "  delete entry.eased;\n  if (plan) {", "  if (plan) {",
     [T_EASE], None),
    ("42x9 a record of another exercise goes, unrestored", RECAL,
     "      if (was.exerciseId !== undefined && was.exerciseId !== entry.exerciseId) {",
     "      if (false) {", [T_EASE], None),
    ("42x10 a kept straight lift's rounds are its working sets", GEN,
     "    rounds: roundsOf(entry),", "    rounds: workingSets(entry).length,", [T_EASE], None),
    ("42x11 a pair left with one lift counts its working sets", RECAL,
     "    block.rounds = roundsOf(only);", "    block.rounds = workingSets(only).length;", [T_EASE], None),
    ("42x12 a lift taken out of a pair counts its working sets", RECAL,
     "    rounds: roundsOf(member),", "    rounds: workingSets(member).length,", [T_EASE], None),
    ("42x13 a saved copy is the plan under the ease", RECAL,
     "      if (was.sets && (was.exerciseId === undefined || was.exerciseId === entry.exerciseId)) {",
     "      if (false) {",
     [T_BADSTORE], None),
    ("42x14 an ease out of step is found", RECAL,
     "  return !constraints.badStart && underTheEase(workout, completed) !== workout;",
     "  return false;", [T_BADSTORE], None),
    ("42x15 fewer reps over more sets adds to what shows", RECAL,
     "      while (addSet && entry.sets.filter((set) => set.kind === 'working').length <= seen) {",
     "      if (addSet) {", [T_EASE], None),
    ("42x16 a settle says what it changed, never a check-in's words", RECAL,
     "      if (!settles && sameAdjust(before, after)) {", "      if (sameAdjust(before, after)) {",
     [T_BADSTORE], None),
    ("42x17 the store settles an ease an undo left out of step", STORE,
     "      if (easeOutOfStep(session.workout, session.completed, session.constraints)) {\n        await this.recalibrate({ type: 'bad-start', low: false, lifts: [] });\n      }\n",
     "", [T_BADSTORE], None),
    ("42x18 a run sent to settle the ease goes on", STORE,
     "      } else if (easeOutOfStep(session.workout, session.completed, session.constraints)) {\n        trigger = { type: 'bad-start', low: flag, lifts: [] };\n      } else {",
     "      } else {", [T_BADSTORE], None),
    ("42x19 a change left on a plan made again says so", STORE,
     "      this.setState({\n        calibration: {\n          status: 'error',\n          title: described.title,\n          label: described.label,\n          evaluating: [],\n          error: \"Today's plan was made again while this ran, so nothing changed: try it again.\",\n        },\n      });\n      return null;",
     "      this.setState({ calibration: IDLE_CALIBRATION });\n      return null;", [T_BADSTORE], None),
    ("42x20 a skip says whether it was made", STORE,
     "      return { kind: result?.ok ? 'removed' : 'unchanged', skippedSets: 0, name };",
     "      return { kind: 'removed', skippedSets: 0, name };", [T_BADSTORE], None),
    ("42x21 the coach's offered sets stay through an unpin", RECAL,
     "    entry.slot === undefined ||\n    stoppedBefore(blocks, entry).length > 0;",
     "    (entry.locked && entry.slot === undefined) ||\n    stoppedBefore(blocks, entry).length > 0;",
     [T_EASE], None),
    # The eighth pass of item 40.
    ("40y1 a bodyweight a units switch let in is confirmed", UNITS,
     "              setConfirmed({ value: held, units });\n              setBefore(held);\n", "",
     [T_UNITS], None),
    ("40y2 the check reads each other lift at its best", SLIPS,
     "      ? (estimateFromOtherLifts(exercise, input.history, input.now, units, maxes, true)?.e1rm ?? 0)",
     "      ? (estimateFromOtherLifts(exercise, input.history, input.now, units, maxes, false)?.e1rm ?? 0)",
     [T_SLIPS], None),
    ("40y3 a first target takes an entered max only when newer than the logs", CROSS,
     "    const newer = !logged || enteredDaysAgo < logged.began;", "    const newer = true;",
     [T_SLIPS], None),
    ("40y4 the check takes the higher of an entered max and the logs", CROSS,
     "    if (ceiling ? !logged || entered > logged.e1rm : newer) {",
     "    if (ceiling ? true : newer) {", [T_SLIPS], None),
    ("40y5 a bodyweight out of the range estimates nothing", SLIPS,
     "    input.profile && plausible ? (estimateStartingMax(exercise, input.profile)?.e1rm ?? 0) : 0;",
     "    input.profile ? (estimateStartingMax(exercise, input.profile)?.e1rm ?? 0) : 0;", [T_SLIPS], None),
    # The eighth pass of item 50.
    ("50y1 a pick whose check failed once it landed is saved", STORE,
     "        written = await db.get<Identified>('customMedia', exerciseId).then(\n          (raw) => structurallyEqual(raw, record),\n          () => false,\n        );\n        if (!written) throw error;",
     "        throw error;", [T_OWN], None),
    ("50y2 a removal whose check failed once it landed is a removal", STORE,
     "        gone = await db.get<Identified>('customMedia', exerciseId).then(\n          (raw) => raw === undefined,\n          () => false,\n        );\n        if (!gone) throw error;",
     "        throw error;", [T_OWN], None),
    ("50y3 a removal tells every screen its picture is gone", STORE,
     "      ...(removed !== null\n        ? { customMediaGone: { ...this.state.customMediaGone, [removed]: revision } }\n        : {}),\n",
     "", [T_OWN], None),
    ("50y4 a picture gone is let go without a read", CUSTOM,
     "  if (stale && loaded.media !== null) setLoaded({ exerciseId, media: null, revision: goneAt });\n",
     "", [T_OWN], None),
    ("50y5 a pick takes its exercise off the list", STORE,
     "    else if (settled) delete gone[settled.id];\n", "", [T_OWN], None),
    ("50y6 reading the data again clears the list", STORE,
     "        customMediaRevision: this.state.customMediaRevision + 1,\n        customMediaGone: {},\n",
     "        customMediaRevision: this.state.customMediaRevision + 1,\n", [T_OWN], None),
    ("50y7 a pick that did not take is said plainly", OWNHOOK,
     "        toast.show('Could not save your demonstration. Try again.', 'error');",
     "        toast.show('Save verification failed', 'error');", [T_OWN], None),
    ("50y8 a removal that did not take is said plainly", OWNHOOK,
     "      toast.show('Could not remove your demonstration. Try again.', 'error');",
     "      toast.show('Save verification failed', 'error');", [T_OWN], None),
    # The ninth pass of item 40: the other lifts' estimate, the bodyweight range.
    ("40z1 a ceiling reads a long set every rep up to thirty", CROSS,
     "          ? maxFromSet(set.weight, set.reps)\n", "          ? epley(set.weight, set.reps)\n",
     [T_SLIPS], None),
    ("40z2 a max older than the 180 days, or of no readable date, says nothing", CROSS,
     "    if (!(enteredDaysAgo <= MAX_AGE_DAYS) || !enteredBy(entry.enteredAt, now)) continue;",
     "    if (!enteredBy(entry.enteredAt, now)) continue;", [T_SLIPS], None),
    ("40z3 a max weighs by its own age", CROSS,
     "      const daysAgo = ceiling && logged ? Math.min(enteredDaysAgo, logged.daysAgo) : enteredDaysAgo;",
     "      const daysAgo = 0;", [T_SLIPS], None),
    ("40z4 a max is newer when entered after the lift began", CROSS,
     "    const newer = !logged || enteredDaysAgo < logged.began;",
     "    const newer = !logged || enteredDaysAgo < logged.daysAgo;", [T_SLIPS], None),
    ("40z5 a lift of no set times began at the workout's end", CROSS,
     "      const began = first === undefined ? daysAgo : (Date.parse(now) - first) / DAY_MS;",
     "      const began =\n        first === undefined\n          ? (Date.parse(now) - Date.parse(record.startedAt)) / DAY_MS\n          : (Date.parse(now) - first) / DAY_MS;",
     [T_SLIPS], None),
    ("40z6 a lift began at its first set of any kind", CROSS,
     "        if (Number.isFinite(at) && (first === undefined || at < first)) {",
     "        if (set.kind === 'working' && Number.isFinite(at) && (first === undefined || at < first)) {",
     [T_SLIPS], None),
    ("40z7 the newest session began last, whichever set speaks", CROSS,
     "        const latest = fresh ? began : current.began;", "        const latest = began;",
     [T_SLIPS], None),
    ("40z8 a weaker set of a newer session moves when the lift began", CROSS,
     "        } else if (fresh) {\n          known.set(exercise.id, { ...current, began: latest, newest });\n        }",
     "        }", [T_SLIPS], None),
    ("40z9 a bodyweight out of the range judges no weight added to the body", SLIPS,
     "  const bodyweight = plausible ? input.profile?.bodyweight : undefined;",
     "  const bodyweight = input.profile?.bodyweight;", [T_SLIPS], None),
    # The ninth pass of item 42: what a stopped lift owes, marks, lifts that were under way, copies.
    ("42z1 a lift stopped at a new place owes what it shows", GEN,
     "  const owed = entry.sets.filter(\n    (set) => set.kind === 'working' && !isDone(entry.id, set.index),\n  ).length;\n  delete entry.eased;",
     "  const owed = (entry.manual?.sets ? entry.sets : (entry.eased?.sets ?? entry.sets)).filter(\n    (set) => set.kind === 'working' && !isDone(entry.id, set.index),\n  ).length;\n  delete entry.eased;",
     [T_EASE], None),
    ("42z2 a stand-in is owed what the lift shows", RECAL,
     "  const owed = entry.sets.filter(\n    (set) => set.kind === 'working' && !isDone(entry.id, set.index),\n  ).length;\n  const dropOwed = entry.sets.some((set) => set.kind === 'drop' && !isDone(entry.id, set.index));\n  // The effort the lift carried, read",
     "  const owed = (entry.eased?.sets ?? entry.sets).filter(\n    (set) => set.kind === 'working' && !isDone(entry.id, set.index),\n  ).length;\n  const dropOwed = entry.sets.some((set) => set.kind === 'drop' && !isDone(entry.id, set.index));\n  // The effort the lift carried, read",
     [T_EASE], None),
    ("42z3 a swap back takes what the stand-in shows", RECAL,
     "  const owed = entry.sets.filter(\n    (set) => set.kind === 'working' && !isDone(entry.id, set.index),\n  ).length;\n  const dropOwed = entry.sets.some((set) => set.kind === 'drop' && !isDone(entry.id, set.index));\n  // The effort the lift swapped away",
     "  const owed = (entry.eased?.sets ?? entry.sets).filter(\n    (set) => set.kind === 'working' && !isDone(entry.id, set.index),\n  ).length;\n  const dropOwed = entry.sets.some((set) => set.kind === 'drop' && !isDone(entry.id, set.index));\n  // The effort the lift swapped away",
     [T_EASE], None),
    ("42z4 a stand-in keeps the count its lift handed on", RECAL,
     "    entry.slot === undefined ||\n    stoppedBefore(blocks, entry).length > 0;",
     "    entry.slot === undefined;", [T_EASE], None),
    ("42z5 with no hard start in force, a mark goes", RECAL,
     "        constraints.badStart ? easeTheRest(workout, plain, constraints) : withoutMarks(workout),",
     "        constraints.badStart ? easeTheRest(workout, plain, constraints) : workout,",
     [T_EASE, T_BADSTORE], None),
    ("42z6 a record with sets stays when the hard start comes off", RECAL,
     "  const marked = (entry: WorkoutEntry) => entry.eased?.kept === true && !entry.eased.sets;",
     "  const marked = (entry: WorkoutEntry) => entry.eased?.kept === true;", [T_EASE], None),
    ("42z7 a lift that was under way is fitted in place", RECAL,
     " || keepsTheEase(entry);\n  if (touched || entry.manual?.reps === true) {",
     ";\n  if (touched || entry.manual?.reps === true) {", [T_EASE], None),
    ("42z8 ... and keeps its sets through a check-in", RECAL,
     "      !standsIn(entry) &&\n      // One that keeps a hard start's ease, its sets since undone, keeps them, as one under way\n      // does (the ninth pass of item 42); a mark alone keeps nothing (the tenth).\n      !keepsTheEase(entry),",
     "      !standsIn(entry),", [T_EASE], None),
    ("42z9 ... and through a max", RECAL,
     "          request.completed.sets.some((set) => set.entryId === entry.id) || keepsTheEase(entry);",
     "          request.completed.sets.some((set) => set.entryId === entry.id);", [T_EASE], None),
    ("42z10 a record keeps the lift's own settings", RECAL,
     "    settings: {\n      restSeconds: entry.restSeconds,\n      warmupSets: entry.warmupSets,\n      dropSet: entry.dropSet,\n      ...(entry.manual ? { manual: { ...entry.manual } } : {}),\n      ...(block.kind === 'straight' ? { blockRest: block.restBetweenRoundsSeconds } : {}),\n    },\n",
     "", [T_EASE], None),
    ("42z11 a record gives its settings back", RECAL,
     "  if (!settings) return;\n", "  return;\n", [T_EASE], None),
    ("42z12 a block of its own has its rest back", RECAL,
     "  if (block.kind === 'straight' && settings.blockRest !== undefined) {\n    block.restBetweenRoundsSeconds = settings.blockRest;\n  }\n",
     "", [T_EASE], None),
    ("42z13 what was set by hand comes back as it was", RECAL,
     "  if (settings.manual) entry.manual = { ...settings.manual };\n  else delete entry.manual;\n",
     "", [T_EASE], None),
    ("42z14 a copy goes without the day's stops", RECAL,
     "  const plan = withoutStops(restored);", "  const plan = restored;", [T_EASE], None),
    ("42z15 a copy is timed for its own length", RECAL,
     "  const target = resolveTargetMinutes(plan.duration.choice, plan.duration.defaultMinutes);",
     "  const target = plan.duration.targetMinutes;", [T_EASE], None),
    ("42z16 a copy is warmed up for its own length", RECAL,
     "  const general = generalWarmupMinutes(target);",
     "  const general = plan.warmup.generalMinutes;", [T_EASE], None),
    ("42z17 a copy's warm-up says its own length", RECAL,
     "    note: warmupNote(general, target),", "    note: plan.warmup.note,", [T_EASE], None),
    ("42z18 a copy's summary says no minutes left", RECAL,
     "\n      .replace(/, fitted to the [0-9]+ min left/, '')", "", [T_EASE], None),
    ("42z19 a copy's lines say its own length", RECAL,
     "      (line) => !/^(Runs about|Even the leanest version runs about) [0-9]+ min over /.test(line),",
     "      (line) => line.length > 0,", [T_EASE], None),
    ("42z20 a copy's ramps list what it holds", RECAL,
     "    rampEntryIds: entries.filter((entry) => entry.warmupSets > 0).map((entry) => entry.id),",
     "    rampEntryIds: plan.warmup.rampEntryIds,", [T_EASE], None),
    # The tenth pass of item 40: the ceiling's max age, long sets, dates ahead, a load of nothing.
    ("40z10 a max dated ahead moves no target", PROG,
     "    !enteredBy(entry.enteredAt, input.now) ||\n    !(Date.parse(entry.enteredAt) > Date.parse(liftBegan(",
     "    !(Date.parse(entry.enteredAt) > Date.parse(liftBegan(", ["src/engine/progression/progression.enteredMax.test.ts"], None),
    ("40z11 ... nor the start after a break", PROG,
     "    enteredBy(enteredRecord.enteredAt, input.now) &&\n", "", ["src/engine/progression/progression.enteredMax.test.ts"], None),
    ("40z12 a date ahead beyond a day is no date", "src/engine/progression/maxes.ts",
     "  return !(at > by + DAY_MS);", "  return true;",
     ["src/engine/progression/progression.enteredMax.test.ts", T_SLIPS], None),
    ("40z13 ... a day of leeway for a clock running ahead", "src/engine/progression/maxes.ts",
     "  return !(at > by + DAY_MS);", "  return !(at > by);", ["src/engine/progression/progression.enteredMax.test.ts", T_SLIPS], None),
    ("40z14 the other lifts' estimate reads no max dated ahead", CROSS,
     "    if (!(enteredDaysAgo <= MAX_AGE_DAYS) || !enteredBy(entry.enteredAt, now)) continue;",
     "    if (!(enteredDaysAgo <= MAX_AGE_DAYS)) continue;", [T_SLIPS], None),
    ("40z15 a first target reads a long set every rep up to thirty", CROSS,
     "          : epley(set.weight, Math.min(set.reps, EFFORT_REPS_CEILING));",
     "          : epley(set.weight, set.reps);", [T_SLIPS], None),
    ("40z16 ... and a single as lifted", CROSS,
     "          : epley(set.weight, Math.min(set.reps, EFFORT_REPS_CEILING));",
     "          : maxFromSet(set.weight, set.reps);", [T_SLIPS], None),
    ("40z17 as a ceiling, a max is never older than the logs it stands over", CROSS,
     "ceiling && logged ? Math.min(enteredDaysAgo, logged.daysAgo) : enteredDaysAgo;",
     "enteredDaysAgo;", [T_SLIPS], None),
    ("40z18 a load of nothing is no max", CROSS,
     "          set.weight <= 0 ||\n", "", [T_SLIPS], None),
    ("40z19 as a ceiling, a lift's best weighs by its newest session's age", CROSS,
     "          } else if (fresh) {\n            known.set(exercise.id, { ...current, daysAgo, began: latest, newest });\n          }",
     "          }", [T_SLIPS], None),
    ("40z20 when the lift began is its newest workout's, not any later start", CROSS,
     "        const latest = fresh ? began : current.began;",
     "        const latest = current ? Math.min(current.began, began) : began;", [T_SLIPS], None),
    # The tenth pass of item 50: a mark is never taken off; no render shows what it lets go.
    ("50z4 a pick keeps the marks", STORE,
     "        await this.mediaWritten(db, written ? 1 : 0);",
     "        await this.mediaWritten(db, written ? 1 : 0);\n        if (written) {\n          const { [exerciseId]: _, ...rest } = this.state.customMediaGone;\n          this.setState({ customMediaGone: rest });\n        }",
     [T_OWN], None),
    ("50z5 a read of the data keeps the marks", STORE,
     "        customMediaRevision: this.state.customMediaRevision + 1,\n        coachRoutes: parseCoachRoutes(routesRaw),",
     "        customMediaRevision: this.state.customMediaRevision + 1,\n        customMediaGone: {},\n        coachRoutes: parseCoachRoutes(routesRaw),",
     [T_OWN], None),
    ("50z6 no render shows what a removal let go", CUSTOM,
     "  if (stale || mediaCount === 0 || !loaded || loaded.exerciseId !== exerciseId) return null;",
     "  if (mediaCount === 0 || !loaded || loaded.exerciseId !== exerciseId) return null;",
     [T_OWN], None),
    # The tenth pass of item 42: a mark keeps nothing, a stopped lift keeps its ease, copies.
    ("42z21 a max on a lift keeping the ease says it is under way", RECAL,
     "                allEntries(workout.blocks).some(\n                  (entry) => entry.exerciseId === named.id && keepsTheEase(entry),\n                )\n",
     "                false\n", [T_EASE], None),
    ("42z22 new weights fit the record of a lift keeping the ease", RECAL,
     "    if (keepsTheEase(entry) && was?.sets) {", "    if (false) {", [T_EASE], None),
    ("42z23 a lift stopped keeps the ease it kept", GEN,
     "  ).length;\n  entry.sets = entry.sets.filter((set) => isDone(entry.id, set.index));",
     "  ).length;\n  delete entry.eased;\n  entry.sets = entry.sets.filter((set) => isDone(entry.id, set.index));",
     [T_EASE], None),
    ("42z24 a copy gives a stopped lift's record back to none", RECAL,
     "        !isStopped(entry) &&\n        (was.exerciseId", "        (was.exerciseId", [T_EASE], None),
    ("42z25 a copy's order lines name its own first lift", RECAL,
     "  keepOrderLines(plan);\n  const held", "  const held", [T_EASE], None),
    ("42z26 a copy names no lift it does not hold", RECAL,
     "    reasons: plan.explanation.reasons.filter((line) => {\n      const named = mainLiftName(line);\n      return named === null || held.has(named);\n    }),\n",
     "", [T_EASE], None),
    ("42z27 a copy keeps no fitting step of another length", RECAL,
     "    fittingSteps: plan.duration.targetMinutes === target ? plan.explanation.fittingSteps : [],\n",
     "", [T_EASE], None),
    ("42z28 a mark alone keeps no ease", TYPES,
     "  return entry.eased?.kept === true && entry.eased.sets !== undefined;",
     "  return entry.eased?.kept === true;", [T_EASE, "src/features/workout/offersMax.test.ts"], None),
    ("42z29 the max offer goes once a ramp is done or skipped", "src/features/workout/offersMax.ts",
     "  const touched = logged.some((set) => set.entryId === entry.id) || keepsTheEase(entry);",
     "  const touched =\n    logged.some(\n      (set) =>\n        set.entryId === entry.id &&\n        (set as { kind?: string }).kind === 'working' &&\n        !(set as { skipped?: boolean }).skipped,\n    ) || keepsTheEase(entry);",
     ["src/features/workout/maxOffer.test.tsx", "src/features/workout/offersMax.test.ts"], None),
    ("42z30 the max offer goes once a weight is set for today", "src/features/workout/offersMax.ts",
     "  if (touched || entry.manual?.weight) return false;", "  if (touched) return false;",
     ["src/features/workout/maxOffer.test.tsx", "src/features/workout/offersMax.test.ts"], None),
    ("42z31 the max offer goes on a lift keeping the ease", "src/features/workout/offersMax.ts",
     "  const touched = logged.some((set) => set.entryId === entry.id) || keepsTheEase(entry);",
     "  const touched = logged.some((set) => set.entryId === entry.id);", ["src/features/workout/maxOffer.test.tsx", "src/features/workout/offersMax.test.ts"], None),
    # The eleventh pass of item 40: no clock given, the real one; a max never lowers the ceiling.
    ("40z21 a max dated ahead with no clock given is read against the real one", "src/engine/progression/maxes.ts",
     "  const given = now === undefined ? NaN : Date.parse(now);",
     "  if (now === undefined) return true;\n  const given = now === undefined ? NaN : Date.parse(now);",
     ["src/engine/progression/progression.enteredMax.test.ts"], None),
    ("40z22 a max entered never lowers the other lifts' ceiling", SLIPS,
     "  const others = Math.max(ceilingWith(input.maxes ?? null), input.maxes ? ceilingWith(null) : 0);",
     "  const others = ceilingWith(input.maxes ?? null);", [T_SLIPS], None),
    # The eleventh pass of item 50: a sheet kept shut keeps reading the exercise it last showed.
    ("50z7 How to kept shut opens on the picture the lifter has now", "src/components/ExerciseDetail/HowToSheet.tsx",
     "  const demonstration = useOwnDemonstration(exercise?.id ?? last);",
     "  const demonstration = useOwnDemonstration(exercise?.id ?? '');", [T_OWN], None),
    ("50z8 the details sheet kept shut opens on the picture the lifter has now", "src/components/ExerciseDetail/ExerciseDetailSheet.tsx",
     "  const own = useOwnDemonstration(exercise?.id ?? last);",
     "  const own = useOwnDemonstration(exercise?.id ?? '');", [T_OWN], None),
    # The eleventh pass of item 42: a swap in place eases once; the store keeps lifts under way.
    ("42z33 a swap in place of a lift keeping the ease builds from the plan's count", RECAL,
     "  const plan = keepsTheEase(entry) ? entry.eased?.sets : undefined;",
     "  const plan = undefined;", [T_EASE], None),
    ("42z34 ... unless its count was set by hand", RECAL,
     "  const plan = keepsTheEase(entry) && !entry.manual?.sets ? entry.eased?.sets : undefined;",
     "  const plan = keepsTheEase(entry) ? entry.eased?.sets : undefined;", [T_EASE], None),
    ("42z35 a set removed keeps its lift's ease for good", STORE,
     "      // A lift under way keeps a hard start's ease for good, its sets undone or not (the eleventh\n      // pass of item 42).\n      workout: keepUnderWay(session.workout, new Set(session.completed.sets.map((c) => c.entryId))),\n",
     "", [T_BADSTORE], None),
    ("42z36 a set undone keeps its lift's ease for good", STORE,
     "      // A lift under way keeps a hard start's ease for good, its sets undone or not (Maintenance\n      // 26, the eleventh pass of item 42).\n      workout: keepUnderWay(session.workout, new Set(session.completed.sets.map((c) => c.entryId))),\n",
     "", [T_BADSTORE], None),
    ("42z37 only blocks begun are kept", RECAL,
     "    block.entries.some((entry) => begun.has(entry.id)) && block.entries.some(held);",
     "    block.entries.some(held);", [T_EASE], None),
    ("42z38 a refitted record's settings follow its ramps", RECAL,
     "        ...(was.settings\n          ? {\n              settings: {\n                ...was.settings,\n                warmupSets: record.sets.filter((set) => set.kind === 'warmup').length,\n                dropSet: record.sets.some((set) => set.kind === 'drop'),\n              },\n            }\n          : {}),\n",
     "", [T_EASE], None),
    # The twelfth pass: the swap in place only where the ease is laid again; no keeping on an undo.
    ("42z39 a swap in place takes the plan's count only in a block with nothing logged", RECAL,
     "  const was = open && keepsTheEase(entry) && !entry.manual?.sets ? entry.eased?.sets : undefined;",
     "  const was = keepsTheEase(entry) && !entry.manual?.sets ? entry.eased?.sets : undefined;",
     [T_EASE], None),
    ("42z41 a set removed before any change gives its lift the plan back", STORE,
     [("import {\n  planUnderTheEase,\n  recalibrate as runRecalibration,", "import {\n  keepUnderWay,\n  planUnderTheEase,\n  recalibrate as runRecalibration,"),
      ("    const hold = session.hold;\n    this.setSession({\n      ...session,\n",
       "    const hold = session.hold;\n    this.setSession({\n      ...session,\n      workout: keepUnderWay(session.workout, new Set(session.completed.sets.map((c) => c.entryId))),\n")],
     None, [T_BADSTORE], None),
    ("42z42 a set undone before any change gives its lift the plan back", STORE,
     [("import {\n  planUnderTheEase,\n  recalibrate as runRecalibration,", "import {\n  keepUnderWay,\n  planUnderTheEase,\n  recalibrate as runRecalibration,"),
      ("      ...session,\n      completed: { ...session.completed, sets, currentEntryId: next?.entryId ?? null },\n      rest: null,\n      hold: null,\n    });\n    void this.settleStart();",
       "      ...session,\n      workout: keepUnderWay(session.workout, new Set(session.completed.sets.map((c) => c.entryId))),\n      completed: { ...session.completed, sets, currentEntryId: next?.entryId ?? null },\n      rest: null,\n      hold: null,\n    });\n    void this.settleStart();")],
     None, [T_BADSTORE], None),
    ("40z23 a clock that cannot be read is none", "src/engine/progression/maxes.ts",
     "  const by = Number.isFinite(given) ? given : Date.now();", "  const by = given;",
     ["src/engine/progression/progression.enteredMax.test.ts"], None),
    # The thirteenth pass: a swap in place is eased once where the ease is laid, kept anywhere else.
    ("42z43 a swap in place where no ease is laid keeps the count shown, the plan's kept", RECAL,
     "  if (plan && !(open && (ease.fewer > 0 || ease.reserve > 0))) {", "  if (false) {", [T_EASE], None),
    ("42z44 ... where there is no ease to lay", RECAL, "  if (plan && !(open && (ease.fewer > 0 || ease.reserve > 0))) {", "  if (plan && !open) {", [T_EASE], None),
    ("42z45 ... and in a block under way", RECAL, "  if (plan && !(open && (ease.fewer > 0 || ease.reserve > 0))) {",
     "  if (plan && !(ease.fewer > 0 || ease.reserve > 0)) {", [T_EASE], None),
    ("42z46 what comes in shows the count the lift showed", RECAL,
     "    const gone = new Set(builtWorking.slice(Math.max(0, shownCount)));",
     "    const gone = new Set<SetPrescription>();", [T_EASE], None),
    ("42z47 the plan's count is kept on what comes in for a saved copy", RECAL,
     "    entry.eased = { ...recordOf(entry, block), kept: true };\n", "", [T_EASE], None),
    # The fourteenth pass: a swap in place takes over the lift as it stands.
    ("42z48 what comes in takes the ease the lift showed", RECAL,
     "    easeEntry(entry, block, taken, ease.reserve, exercise, request, said);\n    entry.eased = {",
     "    entry.eased = {", [T_EASE], None),
    ("42z49 ... kept for good, as on the lift", RECAL,
     "    entry.eased = { ...(entry.eased ?? recordOf(entry, block)), kept: true };",
     "    entry.eased ??= recordOf(entry, block);", [T_EASE], None),
    ("42z50 ... at the reserve the lift showed", RECAL,
     "  const reserve = Math.max(\n    ease.reserve,\n    planRir === undefined || shownRir === undefined ? 0 : shownRir - planRir,\n  );",
     "  const reserve = 0;", [T_EASE], None),
    ("42z51 ... and the count it showed", RECAL,
     "  const taken = Math.max(0, planWorking.length - shownWorking.length);",
     "  const taken = 0;", [T_EASE], None),
    ("42z52 a lift marked before the hard start hands the mark on", RECAL,
     "  } else if (marked) {\n    entry.eased = { exerciseId: exercise.id, kept: true };\n  }",
     "  }", [T_EASE], None),
    ("42z53 the layer lays the ease on each lift", RECAL,
     "      if (easeEntry(entry, block, take, reserve, exercise, request)) changed = true;\n", "",
     [T_EASE, T_BADSTORE], None),
    # The fifteenth pass: what comes in is eased as the layer eases, the effort read from the plan.
    ("42z54 the reserve the ease lays on what comes in", RECAL,
     "    easeEntry(entry, block, taken, ease.reserve, exercise, request, said);",
     "    easeEntry(entry, block, taken, 0, exercise, request, said);", [T_EASE], None),
    ("42z56 the day's effort read from the day's settings, on a swap in place", RECAL,
     "  const shift = dayShiftOf(request, workout, entry);\n  const taken",
     "  const shift = effortShiftOf(request, workout, entry);\n  const taken", [T_EASE], None),
    ("42z57 ... for a stand-in", RECAL,
     "  const shift = dayShiftOf(request, workout, entry);\n  closeAtLogged(entry, isDone, 'swap');",
     "  const shift = effortShiftOf(request, workout, entry);\n  closeAtLogged(entry, isDone, 'swap');",
     [T_EASE], None),
    ("42z58 ... and for a swap back", RECAL,
     "  const shift = dayShiftOf(request, workout, entry);\n  if (request.completed",
     "  const shift = effortShiftOf(request, workout, entry);\n  if (request.completed",
     [T_EASE], None),
    ("42z62 a lift keeping the ease carries the day's settings, not its eased sets", RECAL,
     "    ? (dayAdjust(request.constraints)?.rir ?? 0)", "    ? effortShiftOf(request, workout, entry)",
     [T_EASE], None),
    ("42z59 a count set by hand comes in as set on the record path", RECAL,
     "    plan && !entry.manual?.sets ? plan.filter((set) => set.kind === 'working') : shownWorking;",
     "    plan ? plan.filter((set) => set.kind === 'working') : shownWorking;", [T_EASE], None),
    ("42z60 ... and takes the record path, kept and eased", RECAL,
     "  const plan = keepsTheEase(entry) ? entry.eased?.sets : undefined;",
     "  const plan = keepsTheEase(entry) && !entry.manual?.sets ? entry.eased?.sets : undefined;",
     [T_EASE], None),
    ("42z61 the words count only the sets the ease took", RECAL,
     "  const said = Math.min(taken, easeTake(entry, workout.blocks, ease.fewer, planWorking.length));",
     "  const said = taken;", [T_EASE], None),
    # The sixteenth pass: the reason is said only where the ease itself did something.
    ("42z63 the reason is said only where the ease did something", RECAL,
     "  if (entry.progression && what) {", "  if (entry.progression) {", [T_EASE], None),
    # The ninth pass of item 50: what was read before a removal goes; what is read after shows.
    ("50z1 what is read after a removal shows", CUSTOM,
     "    loaded.revision < goneAt;", "    true;", [T_OWN], None),
    ("50z2 a removal marks the change it made", STORE,
     "[removed]: revision }", "[removed]: Number.MAX_SAFE_INTEGER }", [T_OWN], None),
    ("50z3 a file the browser could not read is said plainly", "src/features/library/mediaFile.ts",
     "    reader.onerror = () => reject(new Error('Could not read that file. Try again.'));",
     "    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));",
     ["src/features/library/mediaFile.test.ts"], None),
    # The eighth pass of item 42: a lift under way keeps the ease for good.
    ("42y1 a lift under way keeps its record for good", RECAL,
     "        if (held(entry)) entry.eased = { ...entry.eased, kept: true };\n", "", [T_EASE, T_BADSTORE], None),
    ("42y2 a record kept for good is never given back", RECAL,
     [("  const held = (entry: WorkoutEntry) => entry.eased !== undefined && !entry.eased.kept;\n  if (!kept.blocks.some(",
       "  const held = (entry: WorkoutEntry) => entry.eased !== undefined;\n  if (!kept.blocks.some("),
      ("      if (!was || was.kept) continue;", "      if (!was) continue;")],
     None, [T_EASE, T_BADSTORE], None),
    ("42y3 a lift under way before the ease is kept as it is", RECAL,
     "        entry.eased ??= { exerciseId: entry.exerciseId, kept: true };\n", "", [T_EASE], None),
    ("42y4 a stand-in takes a count set by hand", RECAL,
     "  // layer eases it (the seventh pass of item 42). A count set by hand stands (the eighth pass).\n  const plan = entry.manual?.sets ? entry.sets : (entry.eased?.sets ?? entry.sets);",
     "  // layer eases it (the seventh pass of item 42). A count set by hand stands (the eighth pass).\n  const plan = entry.eased?.sets ?? entry.sets;", [T_EASE], None),
    ("42y5 a lift closed at a new place owes a count set by hand", GEN,
     "  const owed = (entry.manual?.sets ? entry.sets : (entry.eased?.sets ?? entry.sets)).filter(",
     "  const owed = (entry.eased?.sets ?? entry.sets).filter(", [T_EASE], None),
    ("42y6 a swap back takes the stand-in's count set by hand", RECAL,
     "  // count set by hand stands (the eighth pass).\n  const plan = entry.manual?.sets ? entry.sets : (entry.eased?.sets ?? entry.sets);",
     "  // count set by hand stands (the eighth pass).\n  const plan = entry.eased?.sets ?? entry.sets;", [T_EASE], None),
    ("42y7 a saved copy's time is the plan's whole", RECAL,
     "    targetMinutes: target,\n    estimatedMinutes: Math.round(time.totalMinutes),",
     "    targetMinutes: target,\n    estimatedMinutes: plan.duration.estimatedMinutes,",
     [T_BADSTORE, T_EASE], None),
    ("42y8 a pair counts the rounds it runs", RECAL,
     "    block.kind === 'straight' ? roundsOf(block.entries[0] as WorkoutEntry) : roundsRun(block);",
     "    block.kind === 'straight'\n      ? roundsOf(block.entries[0] as WorkoutEntry)\n      : block.kind === 'circuit'\n        ? roundsRun(block)\n        : Math.min(...block.entries.map(roundsOf));",
     [T_EASE], None),
    ("42y9 a pair the plan forms counts its longer member", GEN,
     "        const rounds = Math.max(roundsOf(a), roundsOf(b));",
     "        const rounds = Math.min(roundsOf(a), roundsOf(b));", [T_EASE], None),
    ("42y10 a pair the time fit trims counts its longer member", GEN,
     "        block.rounds = roundsRun(block);\n        if (block.kind === 'circuit') {",
     "        block.rounds = Math.min(...block.entries.map(roundsOf));\n        if (block.kind === 'circuit') {",
     [T_EASE], None),
]

only = set(sys.argv[1:])


def load_table(name, stop):
    source = (HERE / name).read_text(encoding="utf-8")
    table = source.split(stop)[0]
    scope = {"__name__": f"{name}_table", "__file__": str(HERE / name), "pathlib": pathlib,
             "re": re, "subprocess": subprocess, "sys": sys, "importlib": __import__("importlib")}
    exec(compile(table, str(HERE / name), "exec"), scope)
    return scope["MUTATIONS"]


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
table = list(MUTATIONS)
if check or "--all" in sys.argv:
    table = (
        load_table("mutate-m23.py", "\nonly = set(sys.argv[1:])")
        + load_table("mutate-m24.py", "\ndef load_m23():")
        + load_table("mutate-m25.py", "\n\ndef load_table(name, stop):")
        + table
    )



def load_dicts(name):
    """An earlier round's SUPERSEDED and REANCHORED, which settle the rounds before it."""
    source = (HERE / name).read_text(encoding="utf-8")
    start = source.index("\nSUPERSEDED = {")
    end = source.index("\ntable = [\n    (name, rel, REANCHORED")
    scope = {}
    exec(compile(source[start:end], str(HERE / name), "exec"), scope)
    return scope["SUPERSEDED"], scope["REANCHORED"]


EARLIER_SUPERSEDED, EARLIER_REANCHORED = load_dicts("mutate-m25.py")

LAYER = (
    "the sixth pass of item 42 replaced the in-place ease with a layer over the plan (every "
    "change made under it, the ease laid again after): 42w1 to 42w36 guard what took its place"
)

NO_PAUSE = (
    "the owner asked for no Pause on any demonstration (Maintenance 26, item 50): the Pause and the "
    "card's hold it brought are gone, and How to's own GIF and Play are guarded by 50a to 50r16"
)

# Replaced by this round's design, so there is nothing left to revert; the new entries guard
# what took its place.
SUPERSEDED = {
    **EARLIER_SUPERSEDED,
    "42x8 a swap built afresh keeps no record of the old exercise": (
        "masked since the fifteenth pass of item 42: every path after the delete writes the record "
        "afresh (the record path, the mark handed on), an open block's records are given back "
        "before the change, and where nothing moves a copy is the same either way"),
    "42z50 ... at the reserve the lift showed": (
        "the fifteenth pass of item 42 lays the ease's own reserve on what comes in (42z54)"),
    "42z34 ... unless its count was set by hand": (
        "the fifteenth pass of item 42 takes a count set by hand through the record path at its own "
        "count (42z59 guards it)"),
    "42z43 a swap in place where no ease is laid keeps the count shown, the plan's kept": (
        "the fourteenth pass of item 42 replaced the thirteenth's two branches with one rule: what "
        "comes in takes over the lift as it stands (42z48 to 42z53 guard it)"),
    "42z44 ... where there is no ease to lay": (
        "the fourteenth pass of item 42 replaced the thirteenth's two branches with one rule: what "
        "comes in takes over the lift as it stands (42z48 to 42z53 guard it)"),
    "42z45 ... and in a block under way": (
        "the fourteenth pass of item 42 replaced the thirteenth's two branches with one rule: what "
        "comes in takes over the lift as it stands (42z48 to 42z53 guard it)"),
    "42z46 what comes in shows the count the lift showed": (
        "the fourteenth pass of item 42 replaced the thirteenth's two branches with one rule: what "
        "comes in takes over the lift as it stands (42z48 to 42z53 guard it)"),
    "42z47 the plan's count is kept on what comes in for a saved copy": (
        "the fourteenth pass of item 42 replaced the thirteenth's two branches with one rule: what "
        "comes in takes over the lift as it stands (42z48 to 42z53 guard it)"),
    "42z39 a swap in place takes the plan's count only in a block with nothing logged": (
        "the thirteenth pass of item 42 moved the block's check to where the plan's count is kept on "
        "what comes in (42z45 guards it)"),
    "42z35 a set removed keeps its lift's ease for good": (
        "the twelfth pass of item 42 took back the store's keeping on an undo: a set logged and undone "
        "before any change leaves the record the plan it was (42z41 guards its absence)"),
    "42z36 a set undone keeps its lift's ease for good": (
        "the twelfth pass of item 42 took back the store's keeping on an undo (42z42 guards its "
        "absence)"),
    "42z23 a lift stopped keeps the ease it kept": (
        "the eleventh pass of item 42 took back the tenth's keeping: kept on a lift picked up again, "
        "the record gave a copy too many sets at a place left (42x7 guards the record going again)"),
    "42z24 a copy gives a stopped lift's record back to none": (
        "the eleventh pass of item 42: a stopped lift keeps no record to give back (42x7)"),
    "42y1 a lift under way keeps its record for good": (
        "the eleventh pass of item 42 moved the keeping into keepUnderWay, which the store calls "
        "too; a begun block's records left unkept are now given back at once, as 42w5's revert "
        "does (42w5 guards it)"),
    "AA8a the max offer goes once a ramp is done or skipped": (
        "the tenth pass of item 42 moved the offer's rule to offersMax.ts (42z29 guards it there)"),
    "AA8b the max offer goes once a weight is set for today": (
        "the tenth pass of item 42 moved the offer's rule to offersMax.ts (42z30 guards it there)"),
    "50y5 a pick takes its exercise off the list": (
        "the tenth pass of item 50 never takes a mark off: it lets go only what was read before it "
        "(50z4 guards it)"),
    "50y6 reading the data again clears the list": (
        "the tenth pass of item 50 never takes a mark off: it lets go only what was read before it "
        "(50z5 guards it)"),
    "42x4 a stand-in owes the plan's sets": (
        "the ninth pass of item 42 owes what the lift shows still to come, eased or set by hand, and "
        "the ease takes no set from what stands in for it (42z1 to 42z4 guard it)"),
    "42x5 a lift swapped back to takes the plan's sets owed": (
        "the ninth pass of item 42 owes what the lift shows still to come, eased or set by hand, and "
        "the ease takes no set from what stands in for it (42z1 to 42z4 guard it)"),
    "42x6 a lift closed at its logged sets owes the plan's": (
        "the ninth pass of item 42 owes what the lift shows still to come, eased or set by hand, and "
        "the ease takes no set from what stands in for it (42z1 to 42z4 guard it)"),
    "42y4 a stand-in takes a count set by hand": (
        "the ninth pass of item 42 owes what the lift shows still to come, eased or set by hand, and "
        "the ease takes no set from what stands in for it (42z1 to 42z4 guard it)"),
    "42y5 a lift closed at a new place owes a count set by hand": (
        "the ninth pass of item 42 owes what the lift shows still to come, eased or set by hand, and "
        "the ease takes no set from what stands in for it (42z1 to 42z4 guard it)"),
    "42y6 a swap back takes the stand-in's count set by hand": (
        "the ninth pass of item 42 owes what the lift shows still to come, eased or set by hand, and "
        "the ease takes no set from what stands in for it (42z1 to 42z4 guard it)"),
    "7Tb the diagram in How to can be paused": NO_PAUSE,
    "7Tc the lifter's own GIF or video in How to can be paused": NO_PAUSE,
    "PRi a pause made in the workout's How to holds the card still": NO_PAUSE,
    "PRj How to's Pause holds the card": NO_PAUSE,
    "PRk How to's Play lets the card move again": NO_PAUSE,
    "PRl the diagram's Pause in How to holds the card": NO_PAUSE,
    "PRm How to opens paused for a pause held in this workout": NO_PAUSE,
    "PRn a clip paused before waits for Play": NO_PAUSE,
    "PRo a diagram paused before opens on its still": NO_PAUSE,
    "PRp Play under reduced motion lets a pause go": NO_PAUSE,
    "PRz a pause holds only within the workout": NO_PAUSE,
    "PRab How to's Pause tells a screen reader it holds the card": NO_PAUSE,
    "PRak a held card shows a pause mark": NO_PAUSE,
    "PRal a held card says so to a screen reader": NO_PAUSE,
    "PRam the card is given the workout's key": NO_PAUSE,
    "PRan How to is given the workout's key": NO_PAUSE,
    "PRau the card note is hidden, read only with Pause": NO_PAUSE,
    "PRw a tap reads the clip itself: one the browser froze is played, not held":
        "a tap on How to's clip picks the lifter's own GIF now (Maintenance 26, item 50; 50a guards it): no tap pauses it",
    "42x14 an ease out of step is found": "the eighth pass of item 42 took the settle out: a lift under way keeps the ease for good, so an undo leaves nothing out of step (42y1 to 42y3 guard what took its place)",
    "42x16 a settle says what it changed, never a check-in's words": "the eighth pass of item 42 took the settle out: a lift under way keeps the ease for good, so an undo leaves nothing out of step (42y1 to 42y3 guard what took its place)",
    "42x17 the store settles an ease an undo left out of step": "the eighth pass of item 42 took the settle out: a lift under way keeps the ease for good, so an undo leaves nothing out of step (42y1 to 42y3 guard what took its place)",
    "42x18 a run sent to settle the ease goes on": "the eighth pass of item 42 took the settle out: a lift under way keeps the ease for good, so an undo leaves nothing out of step (42y1 to 42y3 guard what took its place)",
    "50x1 a removal whose delete landed counts as removed":
        "the eighth pass of item 50 moved the read after a failed check into the store (50y2)",
    "42y9 a pair the plan forms counts its longer member":
        "no plan shows it: the plan pairs lifts of one count, and pairs made unequal later (a set "
        "taken, the ease) are counted by syncRounds, which 42y8 guards",
    "42x12 a lift taken out of a pair counts its working sets":
        "no state a lifter reaches shows it: endPairing and standIn count each block again with "
        "syncRounds, and the lift leaving a pairing keeps only its logged sets",
    "42s7 a check-in after a low one feels good and names the hard start":
        "the seventh pass of item 42: the fallback was unreachable once the named headline needs "
        "nothing changed; 42x1 and 42x2 guard the check-in's words now",
    "40u6 a number the typing paused on is confirmed":
        "the seventh pass of item 40: one confirm at a pause for Settings and setup alike, the "
        "same revert as 40x6, which guards it",
    "40v6 a pause confirms a bodyweight only where it is saved":
        "the seventh pass of item 40: a pause confirms in setup too, its question naming the one "
        "entered (40x6 guards it)",
    "42v1 a hard start eases the rest where it stands": LAYER,
    "42v2 the lifter's own weights are kept": LAYER,
    "42v4 exactly what was taken comes back": LAYER,
    "42v5 what was taken is kept on the lift": LAYER,
    "42v6 a straight block counts its working sets, a drop set apart": LAYER,
    "PRar a Play in How to cut short by a pause is no refusal":
        "How to's clip is started only by the keep-playing hook since Maintenance 26, item 50, whose catch tells a refusal from a play cut short (PRas guards it)",
    # Round M (Maintenance 31): a plan left open from an earlier day gives way to today's before a
    # saved workout is loaded (H199 in mutate-m31.py), so the copy's key is today's either way.
    "34w5 a saved workout loaded on it is today's plan": (
        "Round M's twenty-fifth pass puts today's plan in place of one from an earlier day before a "
        "copy is loaded (H199 guards it), so the session it replaces has today's key, the same as "
        "the store's own"),
    # Round N moved withoutHandTargets to src/engine/workout/types.ts; no newer entry reverts its delete of the weight.
    "BB1 a swap leaves a weight set by hand behind": (
        "moved, not replaced: the eleventh review of round N made withoutHandTargets one helper for a "
        "swap, a swap back and a lift picked up again, in src/engine/workout/types.ts, where its "
        "delete of the weight set by hand still is; no newer entry reverts that line (N217 reverts its "
        "delete of the back-offs' weight; AA5, BB2 and N233 its calls on a swap, a swap back and a "
        "pick-up)"),
    # ... and its delete of the reps set by hand.
    "BB3 the sets built afresh drop reps set by hand": (
        "moved, not replaced: the eleventh review of round N made withoutHandTargets one helper for a "
        "swap, a swap back and a lift picked up again, in src/engine/workout/types.ts, where its "
        "delete of the reps set by hand still is; no newer entry reverts that line (N217 reverts its "
        "delete of the back-offs' weight; AA5, BB2 and N233 its calls on a swap, a swap back and a "
        "pick-up)"),
    "42x2 a check-in that changed the plan names the hard start with what changed": (
        "Maintenance 33 carries the rule in its check-in words, where its old store test no longer reaches it: the same revert runs as the M33 table's Y8 with the ease layer's test"),
    # Maintenance 33's decision 1: a check-in's one change to the plan is a head cold's floor (a sore
    # joint and time pressure aside). It takes no set and adds no rep, so these have no case left.
    "34z3 ... and an extra rep only when the reserve moved": (
        "unreachable since Maintenance 33's decision 1: a check-in takes no set, so its words never "
        "name fewer sets (34z2 guards that) and name the reserve exactly where the reserve moved, "
        "which leaves the revert nothing to tell apart; its anchor had drifted onto the hard start's "
        "words, where the revert no longer compiled"),
    "34z5 ... both ways: the effort back on a day still cut (fifth re-check)": (
        "unreachable since Maintenance 33's decision 1: a check-in's one adjustment is the illness "
        "floor, the same for a head cold as for a fever, so the effort comes back only where a "
        "check-in takes the floor off (restored), and no check-in leaves the day cut while it does"),
    "34z11 ... and a lift stopped for it is no cut": (
        "unreachable since Maintenance 33's decision 1: a check-in takes no set, so its words name "
        "fewer sets for no lift, stopped or not, and a hard start stops none; counted or not, a "
        "stopped lift changes no word (34z8 and 34z9 guard the sore joint's words)"),
    "42j a hard start and a check-in take the larger of each part": (
        "unreachable since Maintenance 33's decision 1: a check-in adds no rep in reserve (a head "
        "cold's floor is carried apart, as rirFloor), so the larger of the two reps and their sum "
        "are the same rep; 42i guards the hard start's own"),
    "42z63 the reason is said only where the ease did something": (
        "unreachable since Maintenance 33's decision 1: a lift keeping the ease shows fewer sets "
        "than its record only where the ease took them (no check-in takes a set, and a count set by "
        "hand is read as shown), so a swap of it always says the set the ease took; the empty "
        "reason came only from a set a low check-in had taken"),
}

# Moved by this round's code: the same revert, anchored where the code now is (old, new, nth).
REANCHORED = {
    **EARLIER_REANCHORED,
    # Round L (Maintenance 30) moved these four. The plate editor opens on Today in a workout
    # (Settings opens it on the place's plates); the logger's plates come from platesHere; the
    # superset line reads a stack; a place's deletion runs inside the place-write queue.
    "8i the plate editor opens on Today": (
        "  const [plateMode, setPlateMode] = useState<'today' | 'default'>(today ? 'today' : 'default');",
        "  const [plateMode, setPlateMode] = useState<'today' | 'default'>('default');", None),
    "8n the logger draws the plates for the dial": (
        "        <PlateLine\n          result={platesHere(\n            exercise,\n            draftWeight,\n            units,\n            loading,\n            specFor(currentLocation?.loading, exercise),\n          )}\n        />",
        "        <span>\n          {\n            platesHere(\n              exercise,\n              draftWeight,\n              units,\n              loading,\n              specFor(currentLocation?.loading, exercise),\n            ).line\n          }\n        </span>", None),
    "8x a machine in a superset says to set the pin first": (
        "                        : plates.kind === 'stack' && block.kind === 'superset'",
        "                        : false", None),
    # The fourth and fifth re-checks of Maintenance 30 run setup's check and its place writes in one
    # turn of the place-write queue, and its cut-off's reading in a method of its own.
    "PDp setup run again removes the Gym it leaves out": (
        "                await this.removeBarcodeNow(db, stale.id);\n              }\n              await deleteVerified(db, 'locations', stale.id);",
        "                await this.removeBarcodeNow(db, stale.id);\n              }", None),
    "PDp2 ... the place after it": (
        "            await this.withBarcodeLock(async () => {\n              if ((await db.get('device', barcodeIdFor(stale.id)))",
        "            await this.withBarcodeLock(async () => {\n              await deleteVerified(db, 'locations', stale.id);\n              if ((await db.get('device', barcodeIdFor(stale.id)))", None),
    "PDq setup leaves the first walk's places, and their barcodes, alone": (
        "          this.state.cloud.configured && birth.at !== null && birth.walkedAt === null;",
        "          false;", None),
    "PDu setup never writes over data it did not begin from": (
        "        if (setupBase(begun.profile, begun.places) !== base) return null;",
        "        if (false) return null;", None),
    "PGa ... on disk too, when no profile can be read": (
        "        if (setupBase(begun.profile, begun.places) !== base) return null;",
        "        if ((begun.profile ? setupBase(begun.profile, begun.places) : null) !== base) return null;", None),
    "PGd a setup cut off part-way says what it wrote": (
        "    return new SetupInterruptedError(error, left);",
        "    return error as SetupInterruptedError;", None),
    "PGg a cut-off setup starts again from its own writes only": (
        "        return ownOnly ? setupBase(now.profile, now.places) : base;",
        "        return setupBase(now.profile, now.places);", None),
    "PGh ... and the store shows the places as the cut-off left them": (
        "        this.setState({ locations: sortLocations(now.places) });\n", "", None),
    "PGk a place written as setup meant counts as its own after a cut-off": (
        "          checked.some((meant) => structurallyEqual(meant, place));", "          false;", None),
    "PGn a place as setup began from it counts as its own after a cut-off": (
        "          begun.places.some((before) => structurallyEqual(before, place)) ||\n", "", None),
    "PGo a place gone that setup did not remove makes Finish again refuse": (
        "              removed.has(before.id) || now.places.some((place) => place.id === before.id),",
        "              true,", None),
    "PGq a cut-off leaves the profile shown as it was": (
        "        this.setState({ locations: sortLocations(now.places) });",
        "        this.setState({ locations: sortLocations(now.places), ...(now.profile ? { profile: now.profile } : {}) });", None),
    "PDl a place stays while its barcode cannot be removed": (
        "        await this.removeBarcodeNow(db, id);\n        await deleteVerified(db, 'locations', id);",
        "        await deleteVerified(db, 'locations', id);\n        await this.removeBarcodeNow(db, id);", None),
    # The fifteenth pass of item 42: the stand-in and the swap back read the effort from the plan
    # a lift keeping the ease had, and the swap in place from its record.
    "34f a swap keeps the effort": (
        "  const shift = dayShiftOf(request, workout, entry);\n  const taken",
        "  const shift = 0;\n  const taken", None),
    "34k2 a lift picked up again reads the effort before the stand-in stops": (
        [("  const shift = dayShiftOf(request, workout, entry);\n  if (request.completed.sets.some((set) => set.entryId === entry.id)) {",
          "  if (request.completed.sets.some((set) => set.entryId === entry.id)) {"),
         ("    { from: nextSetIndex(stopped), through: true, shift },",
          "    { from: nextSetIndex(stopped), through: true, shift: dayShiftOf(request, workout, entry) },")],
        None, None),
    # The fourteenth pass of item 42: the swap in place reads the lift's effort into a name first,
    # and the stand-in's call is told apart by its count.
    "34g a stand-in keeps the effort": (
        "    owed,\n    entry.restSeconds,\n    { shift },\n  );",
        "    owed,\n    entry.restSeconds,\n    {},\n  );", None),
    "34k a stand-in reads the effort before the lift stops": (
        [("  const shift = dayShiftOf(request, workout, entry);\n  closeAtLogged(entry, isDone, 'swap');",
          "  closeAtLogged(entry, isDone, 'swap');"),
         ("    owed,\n    entry.restSeconds,\n    { shift },\n  );",
          "    owed,\n    entry.restSeconds,\n    { shift: dayShiftOf(request, workout, entry) },\n  );")],
        None, None),
    # The ninth pass of item 42: a lift that was under way, its sets since undone, counts as touched.
    "X2 a lift with a set done is fitted in place": (
        "\n  const touched =\n    request.completed.sets.some((set) => set.entryId === entry.id) || keepsTheEase(entry);\n  if (touched || entry.manual?.reps === true) {",
        "\n  const touched =\n    request.completed.sets.some(\n      (set) => set.entryId === entry.id && set.kind === 'working' && !set.skipped,\n    ) || keepsTheEase(entry);\n  if (touched || entry.manual?.reps === true) {",
        None),
    "Y1 an entered max leaves a touched lift as it is": (
        "          request.completed.sets.some((set) => set.entryId === entry.id) || keepsTheEase(entry);",
        "          request.completed.sets.some((set) => set.entryId === entry.id && set.kind === 'working' && !set.skipped) || keepsTheEase(entry);",
        None),
    # The tenth pass: the max's outcome reads a lift keeping the ease, and the entered max a date.
    "AA7 a max skipped for a weight set today says so": (
        "            : request.completed.sets.some((set) => set.exerciseId === named.id) ||\n",
        "            : true ||\n", None),
    "BB9 a max entered once a lift began counts next session": (
        "    !(Date.parse(entry.enteredAt) > Date.parse(liftBegan(input.history, last)))\n  ) {",
        "    !(Date.parse(entry.enteredAt) > Date.parse(last.date))\n  ) {", None),
    "34y8 ... and one standing in for a stopped lift": (
        "      !standsIn(entry) &&\n", "      true &&\n", None),
    # The eighth pass of item 42: a pair counts the rounds it runs, as a circuit does.
    "33t2 ... the rounds it runs, its longest member's (fifth re-check)": (
        "        block.rounds = roundsRun(block);\n        if (block.kind === 'circuit') {",
        "        block.rounds = Math.min(...block.entries.map(roundsOf));\n        if (block.kind === 'circuit') {",
        None),
    "33t3 ... after a set taken off by hand too": (
        "    block.kind === 'straight' ? roundsOf(block.entries[0] as WorkoutEntry) : roundsRun(block);",
        "    block.kind === 'straight'\n      ? roundsOf(block.entries[0] as WorkoutEntry)\n      : Math.min(...block.entries.map(roundsOf));",
        None),
    # The sixth pass of item 42: the day's adjustment is built in one place with the intensity on
    # top, and the check-in's rebuild sits inside the layer's finish.
    "34c a check-in goes on top of the setting": (
        "  return {\n    sets: harder.sets + felt.sets,\n    rir: harder.rir + felt.rir,\n    restFactor: harder.restFactor * felt.restFactor,\n  };",
        "  return harder;", None),
    "34y a change of the day's settings reaches kept lifts not begun": (
        "rebuild({ ...request, workout: settled.workout }, scope, {\n          choice,\n",
        "rebuild({ ...request, workout: request.workout }, scope, {\n          choice,\n", None),
    # The fifth pass of item 42: easeTheRest repeats settleKept's per-lift lines; these stay on
    # settleKept's, the first in the file.
    "34y14 ... keeping the ramps it has": (
        "        warmups: entry.sets.filter((set) => set.kind === 'warmup').length,\n", "", 0),
    "34y3 ... and the new settings' effort": (
        "        shift: after.rir - prescriptionToday(next, exercise, entry.role).rir,\n", "", 0),
    "34y5 ... keeping its drop set": (
        "    entry.sets = entry.dropSet ? [...built.sets, dropSetAt(built.sets.length)] : built.sets;",
        "    entry.sets = built.sets;", 0),
    # The third pass of item 42: the hard start eases every lift still to come in place, through
    # the same filter, and a saved workout loads marked as read on the day it was saved.
    "39s a saved workout loads each line once": (
        "    const fresh = asSaved(explanationOnce(withoutStops(saved.workout)));",
        "    const fresh = asSaved(withoutStops(saved.workout));", None),
    # The bad-start case (Maintenance 26, item 42) words its change as the check-in does: the
    # readiness and intensity cases' lines come first.
    "34y9 ... and Make it harder reaches them too": (
        "rebuild({ ...request, workout: settled.workout }, scope, {\n        choice: request.duration,",
        "rebuild({ ...request, workout: request.workout }, scope, {\n        choice: request.duration,", 0),
    "34z2 ... says fewer sets only when a set was cut": (
        "[fewer ? 'fewer sets' : '',", "['fewer sets',", 0),
    "34z3 ... and an extra rep only when the reserve moved": (
        "easier ? 'an extra rep in reserve' : '']", "'an extra rep in reserve']", 0),
    "34z6 ... sets named only where the day's settings cut them (sixth re-check)": (
        "      const fewer = sets < 0 && change.fewer;", "      const fewer = change.fewer;", 0),
    "34z6b ... or brought them back": (
        "      const more = sets > 0 && change.more;", "      const more = change.more;", 0),
    # A check-in after a hard start names it (Maintenance 26, the re-check of item 42).
    "34v a check-in with nothing left to bring back says so": (
        "            ? 'Feeling good: nothing left to change.'\n            : undefined,",
        "            ? undefined\n            : undefined,", None),
    "34z a check-in that changes nothing says so": (
        "            ? 'Feeling good: nothing left to change.'\n            : undefined,",
        "            ? undefined\n            : undefined,", None),
    "34z12 ... and a new length with nothing else to change says the length (fifth re-check)": (
        "            ? 'Feeling good: nothing left to change.'\n            : undefined,",
        "            ? 'Feeling good: nothing left to change.'\n            : 'Checked in: no changes needed.',", None),
    # A clip's credit comes back once it plays (Maintenance 26, the re-check of item 50).
    "7Rb no credit under a diagram standing in for a still": (
        "  const own = !diagram || (clip && video.src !== null);", "  const own = true;", None),
    # How to after item 50: its own demonstration comes from the lifter's own, picked there.
    "7Rl the lifter's own GIF shows in How to": (
        "          customMedia={demonstration.media}", "          customMedia={null}", None),
    "7Ro a play the browser refuses offers Play": (
        "  const clipRefused = useCallback(() => setClipStill(true), []);",
        "  const clipRefused = useCallback(() => {}, []);", None),
    "7Td reduced motion starts the diagram and own media still": (
        "  const moving = !reducedMotion || askedFor === motionKey;", "  const moving = true;", None),
    "7Ty a hand-over is dropped when the lifter moves on": (
        "                playFocused.current = false;\n                focusSlow.current = false;\n",
        "                playFocused.current = false;\n", None),
    "PRa the card's demonstration loops on past five seconds": (
        "  const animated = large && !reducedMotion && play;",
        "  const [restedFor, setRestedFor] = useState<string | null>(null);\n"
        "  const moving = large && !reducedMotion && play;\n"
        "  useEffect(() => {\n"
        "    if (!moving) return undefined;\n"
        "    const timer = window.setTimeout(() => setRestedFor(exercise.id), 5000);\n"
        "    return () => window.clearTimeout(timer);\n"
        "  }, [moving, exercise.id]);\n"
        "  const animated = moving && restedFor !== exercise.id;", None),
    "PRx How to's clip plays on when the page comes back": (
        "  useKeepPlaying(videoRef, clip && video.src !== null, !clipStill, video.src, clipRefused);\n",
        "", None),
    "PRy How to's own video plays on when the page comes back": (
        "  useKeepPlaying(\n    ownVideoRef,\n    ownVideo,\n    ownVideoMoving,\n    ownVideo ? customMedia.dataUrl : null,\n    ownRefused,\n  );\n",
        "", None),
    "PRay nothing autoplays How to's clip": (
        "            playsInline\n            aria-label={alt}",
        "            autoPlay\n            playsInline\n            aria-label={alt}", None),
    "PRbb a refused own video in How to offers Play": (
        "  const ownRefused = useCallback(() => setOwnRefusedFor(ownKey), [ownKey]);",
        "  const ownRefused = useCallback(() => {}, []);", None),
    # Maintenance 27 (round I) moved these: the same reverts, where the code now is.
    "2d harder keeps RIR floor (plan)": (
        "adjustPrescription(basePrescription, slotSpec.role, adjust, rirFloor(pick))",
        "adjustPrescription(basePrescription, slotSpec.role, adjust)", None),
    "R1g an unreadable one costs nothing": (
        "    .optional()\n    .catch(undefined),\n  /**\n   * A reserve check (Maintenance 27, item 43)",
        "    .optional(),\n  /**\n   * A reserve check (Maintenance 27, item 43)", None),
    "34y2 ... at the plan's own count under the new settings": (
        "      Math.min(MAX_WORKING_SETS, sets),", "      working,", None),
    "34y3 ... and the new settings' effort": (
        "        shift: rir - prescriptionToday(next, exercise, entry.role).rir,\n", "", None),
    "40i the set logger asks before logging": (
        "    const slip = question?.(toCommit(final)) ?? null;", "    const slip = null;", None),
    "42z26 a copy names no lift it does not hold": (
        "    reasons: plan.explanation.reasons.filter((line) => {\n      const named = mainLiftName(line) ?? parsePushLine(line)?.name ?? null;\n      return named === null || held.has(named);\n    }),\n",
        "", None),
    "42z41 a set removed before any change gives its lift the plan back": (
        [("import {\n  lowCheckIn,\n  planUnderTheEase,\n  recalibrate as runRecalibration,",
          "import {\n  keepUnderWay,\n  lowCheckIn,\n  planUnderTheEase,\n  recalibrate as runRecalibration,"),
         ("    const hold = session.hold;\n    this.setSession({\n      ...session,\n",
          "    const hold = session.hold;\n    this.setSession({\n      ...session,\n      workout: keepUnderWay(session.workout, new Set(session.completed.sets.map((c) => c.entryId))),\n")],
        None, None),
    "42z42 a set undone before any change gives its lift the plan back": (
        [("import {\n  lowCheckIn,\n  planUnderTheEase,\n  recalibrate as runRecalibration,",
          "import {\n  keepUnderWay,\n  lowCheckIn,\n  planUnderTheEase,\n  recalibrate as runRecalibration,"),
         ("      ...session,\n      completed: { ...session.completed, sets, currentEntryId: next?.entryId ?? null },\n      rest: null,\n      hold: null,\n    });\n    void this.settleStart();",
          "      ...session,\n      workout: keepUnderWay(session.workout, new Set(session.completed.sets.map((c) => c.entryId))),\n      completed: { ...session.completed, sets, currentEntryId: next?.entryId ?? null },\n      rest: null,\n      hold: null,\n    });\n    void this.settleStart();")],
        None, None),
    # Maintenance 28 (round J): the day a plan was built is the device's day (item 1), and a saved
    # plan loads through planAtPace (the review of item 4), which copies the over-by filter.
    "34u4 the day a plan was built": (
        "      session.status === 'preview' && !session.baseKey.startsWith(`${localDayKey(this.now())}|`)",
        "      session.status === 'preview' && false", None),
    "39s a saved workout loads each line once": (
        "      asSaved(explanationOnce(withoutStops(saved.workout))),",
        "      asSaved(withoutStops(saved.workout)),", None),
    "42t5 a saved workout loads marked": (
        "      asSaved(explanationOnce(withoutStops(saved.workout))),",
        "      explanationOnce(withoutStops(saved.workout)),", None),
    "42z19 a copy's lines say its own length": (
        "      (line) => !/^(Runs about|Even the leanest version runs about) [0-9]+ min over /.test(line),",
        "      (line) => line.length > 0,", 0),
    "42z41 a set removed before any change gives its lift the plan back": (
        [("import {\n  lowCheckIn,\n  planAtPace,\n  planUnderTheEase,\n  recalibrate as runRecalibration,",
          "import {\n  keepUnderWay,\n  lowCheckIn,\n  planAtPace,\n  planUnderTheEase,\n  recalibrate as runRecalibration,"),
         ("    const hold = session.hold;\n    this.setSession({\n      ...session,\n",
          "    const hold = session.hold;\n    this.setSession({\n      ...session,\n      workout: keepUnderWay(session.workout, new Set(session.completed.sets.map((c) => c.entryId))),\n")],
        None, None),
    "42z42 a set undone before any change gives its lift the plan back": (
        [("import {\n  lowCheckIn,\n  planAtPace,\n  planUnderTheEase,\n  recalibrate as runRecalibration,",
          "import {\n  keepUnderWay,\n  lowCheckIn,\n  planAtPace,\n  planUnderTheEase,\n  recalibrate as runRecalibration,"),
         ("      ...session,\n      completed: { ...session.completed, sets, currentEntryId: next?.entryId ?? null },\n      rest: null,\n      hold: null,\n    });\n    void this.settleStart();",
          "      ...session,\n      workout: keepUnderWay(session.workout, new Set(session.completed.sets.map((c) => c.entryId))),\n      completed: { ...session.completed, sets, currentEntryId: next?.entryId ?? null },\n      rest: null,\n      hold: null,\n    });\n    void this.settleStart();")],
        None, None),
    # Round M (Maintenance 31) moved these twenty-one; last in the map, so they win over any above.
    # A lift picked up again is held to the catch-up too; one back on its own keeps two off-plan.
    "2e harder keeps RIR floor (picked up again)": (
        "        adjust,\n        rirFloor(exercise),\n      ),",
        "        adjust,\n      ),", None),
    "33o ... never under the sets the plan had": (
        "    const least = hardCap && !offPlan ? 1 : Math.max(2, plannedSets.get(move.id) ?? 0);",
        "    const least = hardCap && !offPlan ? 1 : 2;", None),
    # The effort a lift carries goes through heldShift (the catch-up's reserve): 0 there, hold kept.
    "34d a lift refitted to new weights keeps its effort": (
        "    heldShift(request, workout, exercise, entry.role, effortShift(request, entry, plainTarget.rir)),",
        "    heldShift(request, workout, exercise, entry.role, 0),", None),
    "34e a max keeps the effort the lift carries": (
        "              effortShift(from, entry, plainTarget.rir),", "              0,", None),
    "34f a swap keeps the effort": (
        "    dayShiftOf(request, workout, entry),\n  );\n  const taken",
        "    0,\n  );\n  const taken", None),
    "42z56 the day's effort read from the day's settings, on a swap in place": (
        "    dayShiftOf(request, workout, entry),\n  );\n  const taken",
        "    effortShiftOf(request, workout, entry),\n  );\n  const taken", None),
    "34g a stand-in keeps the effort": (
        "    dayShiftOf(request, workout, entry),\n  );\n  closeAtLogged(entry, isDone, 'swap');",
        "    0,\n  );\n  closeAtLogged(entry, isDone, 'swap');", None),
    "42z57 ... for a stand-in": (
        "    dayShiftOf(request, workout, entry),\n  );\n  closeAtLogged(entry, isDone, 'swap');",
        "    effortShiftOf(request, workout, entry),\n  );\n  closeAtLogged(entry, isDone, 'swap');", None),
    "34k a stand-in reads the effort before the lift stops": (
        [("  const shift = heldShift(\n    request,\n    workout,\n    exercise,\n    entry.role,\n    dayShiftOf(request, workout, entry),\n  );\n  closeAtLogged(entry, isDone, 'swap');",
          "  closeAtLogged(entry, isDone, 'swap');"),
         ("    Math.max(1, Math.min(owed, room)),\n    entry.restSeconds,\n    { shift },\n  );",
          "    Math.max(1, Math.min(owed, room)),\n    entry.restSeconds,\n    { shift: heldShift(request, workout, exercise, entry.role, dayShiftOf(request, workout, entry)) },\n  );")],
        None, None),
    "34h a lift picked up again keeps the effort": (
        "      shift: heldShift(request, workout, exercise, stopped.role, shift),",
        "      shift: heldShift(request, workout, exercise, stopped.role, 0),", None),
    "34k2 a lift picked up again reads the effort before the stand-in stops": (
        [("  const shift = dayShiftOf(request, workout, entry);\n  if (request.completed.sets.some((set) => set.entryId === entry.id)) {",
          "  if (request.completed.sets.some((set) => set.entryId === entry.id)) {"),
         ("      shift: heldShift(request, workout, exercise, stopped.role, shift),",
          "      shift: heldShift(request, workout, exercise, stopped.role, dayShiftOf(request, workout, entry)),")],
        None, None),
    # settleKept keeps and holds a catch-up's swap too; holdToOffer, before it, repeats its lines.
    "34y11 ... a lift you pinned or swapped in as well as the one in front": (
        "      (entry.id === request.currentEntryId || keptAsPicked(entry, request)) &&",
        "      (entry.id === request.currentEntryId ||\n        (!entry.locked && !entry.pinned && keptAsPicked(entry, request))) &&",
        None),
    "34y3 ... and the new settings' effort": (
        "    const rir = Math.max(hold?.minRir ?? 0, pushed ? pushRir(after.rir) : after.rir);",
        "    const rir = Math.max(hold?.minRir ?? 0, prescriptionToday(next, exercise, entry.role).rir);",
        None),
    "34y14 ... keeping the ramps it has": (
        "        warmups: entry.sets.filter((set) => set.kind === 'warmup').length,\n      },\n    );\n    entry.sets = entry.dropSet",
        "      },\n    );\n    entry.sets = entry.dropSet", None),
    # refresh's summary says "Nothing more for today." for an emptied catch-up, its count in words.
    "37z the summary's minutes follow the timers": (
        "      : workout.explanation.summary.replace(\n          /: [0-9]+ exercises? in about [0-9]+ min/,\n          `: ${exercisesCount(count)} in about ${Math.round(time.totalMinutes)} min`,\n        );",
        "      : workout.explanation.summary;", None),
    "37aj the summary counts the exercises": (
        "          `: ${exercisesCount(count)} in about ${Math.round(time.totalMinutes)} min`,",
        "          `: ${exercisesCount(count + 1)} in about ${Math.round(time.totalMinutes)} min`,", None),
    # A copy reads its own length through planLength, a catch-up's Default the next length below.
    "42z15 a copy is timed for its own length": (
        "  const target = planLength(plan.duration.choice, plan.duration.defaultMinutes, plan.templateId);",
        "  const target = plan.duration.targetMinutes;", None),
    # The preview built again takes the lift put back; a saved workout loads as a copy of itself.
    "34t the plan built again waits its turn": (
        "    const run = this.calibrationQueue.then(() => this.rebuildPreview(putBack));",
        "    const run = Promise.resolve(this.rebuildPreview(putBack));", None),
    "34w5 a saved workout loaded on it is today's plan": (
        "createSession(this.baseKey() ?? session.baseKey, copy.workout, now)",
        "createSession(session.baseKey, copy.workout, now)", None),
    # addsWork, new for a day off the plan, repeats pushesForMore's lines: these stay on its own.
    "35r held back: an extra set": (
        "    (trigger?.type === 'sets' && trigger.workingDelta > 0) ||\n    trigger?.type === 'rep-range' ||\n",
        "    trigger?.type === 'rep-range' ||\n", None),
    "35t held back: a drop set": (
        "    trigger?.type === 'rep-range' ||\n    (trigger?.type === 'drop-set' && trigger.on)",
        "    trigger?.type === 'rep-range' ||\n    false", None),
    # Round N (Maintenance 32) and Maintenance 33 moved these 52; last in the map, so they win over
    # any above. Where Maintenance 33 shares a line with its lighter option or the day's floor, the
    # revert takes the hard start's part alone (gated on `hard`, `hardStart` or `keepLoad`).
    # Round N: the plan reads its target through `targetAt`, which still passes the role.
    "21f plan passes the role": (
        "        adjust,\n        loading,\n        floor,\n        profile.units,\n        role,\n      );",
        "        adjust,\n        loading,\n        floor,\n        profile.units,\n      );", None),
    # Round N: targetedSets builds its sets from `asked` (the top set's or the day's prescription).
    "22i swap/weights/max rebuild the warm-up easy": (
        "      buildSets({ ...asked, sets: count, restSeconds }, weighed, exercise),",
        "      buildSets({ ...asked, sets: count, restSeconds }, weighed),", None),
    # Round N: refitEntry builds its sets from `built.asked`.
    "22j weights changed rebuilds the warm-up easy": (
        "        { ...built.asked, sets: working, restSeconds: entry.restSeconds },\n        weighed,\n        exercise,\n",
        "        { ...built.asked, sets: working, restSeconds: entry.restSeconds },\n        weighed,\n", None),
    # Round N measures a break from every session of the lift (`sessionDates`); the loaded run's line.
    "24d misses before a break stop counting (loaded)": (
        "    consecutiveUnder += 1;\n    if (breakBetween(point, points[at + 1], sessionDates)) break;\n",
        "    consecutiveUnder += 1;\n", None),
    # ... and the short run's.
    "24e misses before a break stop counting (short run)": (
        "      if (breakBetween(point, points[at + 1], sessionDates)) break;\n", "", None),
    # Round N passes the set's tier after the flag; the flag goes to its default, the tier stays.
    "S6b the card passes it": (
        "    hold,\n    isCoreStability(exercise.movementPattern),\n    target?.tier,\n  );",
        "    hold,\n    undefined,\n    target?.tier,\n  );", None),
    # Maintenance 33 names the deload's prescription `planned`, a head cold's floor laid after it.
    "T4a a deload's reserve on every rebuild": (
        "  const planned =\n    request.constraints.deload !== null\n",
        "  const planned =\n    false\n", None),
    # Round N: reps set by hand at another range take their own target here (at the plan's, as the plan reads).
    "U5d a max claims no reps over reps by hand": (
        "              fitted: fitToday(from, ownTarget(target), loading, exercise, entry.role),",
        "              fitted: fitToday(from, target, loading, exercise, entry.role),", None),
    # Round N measures a break from every session of the lift (`sessionDates`).
    "X1a the miss run ends at a deload served": (
        "      if (!passesOver(at) || breakBetween(point, points[at + 1], sessionDates)) break;",
        "      if (breakBetween(point, points[at + 1], sessionDates)) break;", None),
    # Round N reads `touched` before the back-offs' refit, which comes first now.
    "X2 a lift with a set done is fitted in place": (
        "  const touched =\n    request.completed.sets.some((set) => set.entryId === entry.id) || keepsTheEase(entry);\n  if (\n    top !== undefined &&",
        "  const touched =\n    request.completed.sets.some(\n      (set) => set.entryId === entry.id && set.kind === 'working' && !set.skipped,\n    ) || keepsTheEase(entry);\n  if (\n    top !== undefined &&",
        None),
    # Round N reads the day's fatigue off the whole log (`log`); Maintenance 33 reads no check-in in it.
    "X3a a refreshed lift reads the day's fatigue": (
        "    profile: request.profile,\n    fatigueLevel: interpretFatigue(log, request.timestamp).level,\n",
        "    profile: request.profile,\n", None),
    # ... the same line, which a max reads its target through (targetToday).
    "X3b a max refresh reads the day's fatigue": (
        "    fatigueLevel: interpretFatigue(log, request.timestamp).level,\n", "", None),
    # Round N builds a lift not fitted in place through targetBuilt; reps by hand take the old path's target, put back.
    "AA3 reps set by hand are fitted in place on every path": (
        [("  if (touched || entry.manual?.reps === true) {", "  if (touched) {"),
         ("  const fitted = built.fitted;\n",
          "  const byHand = entry.manual?.reps === true;\n  const handReps = ownReps(entry);\n  const target = targetToday(request, workout, entry.id, exercise, entry.role, built.asked);\n  const fitted = byHand\n    ? fitToday(request, ownTarget(target), loading, exercise, entry.role)\n    : built.fitted;\n"),
         ("\n  // A plan from before an exercise stopped suiting a drop set loses it (Maintenance 23).\n  entry.dropSet =",
          "\n  if (byHand) restoreHandReps(entry, handReps, request, target, loading, exercise);\n  // A plan from before an exercise stopped suiting a drop set loses it (Maintenance 23).\n  entry.dropSet =")],
        None, None),
    # Round N: the estimate's read for reps set by hand sits in the branch for another range.
    "BB13 a max sets the load for reps set by hand": (
        "            if (ESTIMATED_MODES.has(target.mode)) {", "            if (false) {", None),
    # Maintenance 33 carries a head cold's floor with the sum.
    "34c a check-in goes on top of the setting": (
        "  return {\n    sets: harder.sets + felt.sets,\n    rir: harder.rir + felt.rir,\n    restFactor: harder.restFactor * felt.restFactor,\n    ...(felt.rirFloor !== undefined ? { rirFloor: felt.rirFloor } : {}),\n  };",
        "  return harder;", None),
    # Maintenance 33 repeats the line for the lighter option's record (`planOwes`); this is the first.
    "34h a lift picked up again keeps the effort": (
        "\n      shift: heldShift(request, workout, exercise, stopped.role, shift),",
        "\n      shift: heldShift(request, workout, exercise, stopped.role, 0),", None),
    # ... and both read the shift taken before the stand-in stops.
    "34k2 a lift picked up again reads the effort before the stand-in stops": (
        [("  const shift = dayShiftOf(request, workout, entry);\n  if (request.completed.sets.some((set) => set.entryId === entry.id)) {",
          "  if (request.completed.sets.some((set) => set.entryId === entry.id)) {"),
         ("\n      shift: heldShift(request, workout, exercise, stopped.role, shift),",
          "\n      shift: heldShift(request, workout, exercise, stopped.role, dayShiftOf(request, workout, entry)),"),
         ("              shift: heldShift(request, workout, exercise, stopped.role, shift),",
          "              shift: heldShift(request, workout, exercise, stopped.role, dayShiftOf(request, workout, entry)),")],
        None, None),
    # Round N reads the effort off the sets still to come (`sets`, a back-off's on the structure).
    "34n the effort is read on the set still to come": (
        "  const sets = toCome.length > 0 ? toCome : working;", "  const sets = working;", None),
    # Round N compares through carriesDayRir (a top set alone carries the top set's reserve).
    "34o a reserve at its limit still carries the day's settings": (
        "  for (let shift = day; shift !== 0; shift -= Math.sign(day)) {\n    if (carriesDayRir(sets, Math.min(4, Math.max(floor, plainRir + shift)))) return shift;\n  }\n",
        "", None),
    # Round N passes settleKept's back-offs after the ramps.
    "34y14 ... keeping the ramps it has": (
        "        warmups: entry.sets.filter((set) => set.kind === 'warmup').length,\n        backOffs: backOffDay(next, workout, entry),\n",
        "        backOffs: backOffDay(next, workout, entry),\n", None),
    # Round N reads every working set of a session (`true`); the trend reads its own call.
    "5au a lift's best reads every session": (
        "performanceHistory(history, exercise, Number.POSITIVE_INFINITY, true)",
        "performanceHistory(history, exercise, 8, true)", None),
    # Maintenance 33 reads the set as planned before the day's eases (`asked`), a step more on a day expected lower.
    "42a three reps short, not two": (
        "  return shortBy(asked.targetReps[0], reserve, first.reps, first.rir) >= SHORT_BY_REPS + step;",
        "  return shortBy(asked.targetReps[0], reserve, first.reps, first.rir) >= SHORT_BY_REPS - 1 + step;", None),
    # ... (`asked`).
    "42r2 sets asked for more than twelve reps to failure are not judged": (
        "  if (asked.targetReps[0] + reserve > JUDGED_REPS) return null;\n", "", None),
    # ... (`asked`).
    "42r4 the plan's reserve, not one the day's settings added": (
        "  const reserve = Math.min(asked.targetRir, planRir);", "  const reserve = asked.targetRir;", None),
    # Maintenance 33 words a check-in the plan keeps by what it reads (`checked`, `read.lowered`).
    "42r14 a check-in that feels good names the hard start": (
        "            : constraints.badStart\n              ? `${checked}: the rest stays eased for the hard start.`\n              : read.lowered",
        "            : read.lowered", None),
    # Maintenance 33 adds the lighter option to the settings that stay; that part is left.
    "42r15 Back to plan only when no other setting stays": (
        "      const settings = after !== undefined || (constraints.lighter?.length ?? 0) > 0;",
        "      const settings = (constraints.lighter?.length ?? 0) > 0;", None),
    # Maintenance 33 marks a begun block only under a hard start; the lighter option's skip is left.
    "42v3 a pair or a lift under way keeps its sets": (
        "    if (block.entries.some((entry) => begun.has(entry.id))) {\n      // Under way before the ease,",
        "    if (!hardStart && block.entries.some((entry) => begun.has(entry.id))) {\n      // Under way before the ease,",
        None),
    # Maintenance 33 takes the day's floor off first (its own Z2); the ease's part goes.
    "42w2 every change is made to the plan under the ease": (
        "    const bare = underTheEase(underTheFloor(shown, request.completed), request.completed);",
        "    const bare = underTheFloor(shown, request.completed);", None),
    # Maintenance 33 lays the lighter option with the ease: the hard start's ease alone is not laid.
    "42w3 the ease is laid again over what a change leaves": (
        "          ? easeTheRest(workout, plain, constraints)\n          : withoutMarks(workout),",
        "          ? easeTheRest(workout, plain, { ...constraints, badStart: undefined })\n          : withoutMarks(workout),",
        None),
    # Maintenance 33 gives a stand-in the slot's floor (a branch the hard start never reaches); the floor goes for it.
    "42w6 a set comes off only above the floor a check-in keeps": (
        "      : count - setFloor(entry.role);\n  return kept ? 0 : Math.min(fewer, Math.max(0, room));",
        "      : count - (hard ? 1 : setFloor(entry.role));\n  return kept ? 0 : Math.min(fewer, Math.max(0, room));",
        None),
    # Maintenance 33 splits the count handed on by the ease (`hard`); none is kept from the hard start.
    "42w7 a count set by hand or offered by the coach stays": (
        "  const kept =\n    entry.manual?.sets === true ||\n    entry.slot === undefined ||\n    (hard ? handed.length > 0 : handed.some((lift) => lift.stopped?.record?.sets !== undefined));",
        "  const kept =\n    !hard &&\n    (entry.manual?.sets === true ||\n      entry.slot === undefined ||\n      handed.some((lift) => lift.stopped?.record?.sets !== undefined));",
        None),
    # Maintenance 33 says why in the ease's own words (`why`); the hard start's ease says none.
    "42w11 an eased lift says why": (
        "  if (entry.progression && what) {\n    entry.progression = {\n      ...entry.progression,\n      evidence: [`${why}: ${what}.`, ...entry.progression.evidence],",
        "  if (entry.progression && what) {\n    entry.progression = {\n      ...entry.progression,\n      evidence: keepLoad ? [`${why}: ${what}.`, ...entry.progression.evidence] : entry.progression.evidence,",
        None),
    # Round N repeats the cap for eased back-offs; easedSet's, for the hard start's ease.
    "42w17 the reserve stops at four": (
        "\n  const rir = Math.min(4, set.targetRir + up);\n  const more = rir - set.targetRir;",
        "\n  const rir = keepLoad ? Math.min(4, set.targetRir + up) : set.targetRir + up;\n  const more = rir - set.targetRir;",
        None),
    # Maintenance 33 keeps every load for the lighter option (`keepLoad`), which stays.
    "42w18 a set pushed past the weights here keeps its load": (
        "  if (!keepLoad && !manual?.weight && !set.asked && weight !== null && weight > 0) {",
        "  if (!keepLoad && !manual?.weight && weight !== null && weight > 0) {", None),
    # ... (`keepLoad`).
    "42w19 a weight set by hand keeps its load": (
        "  if (!keepLoad && !manual?.weight && !set.asked && weight !== null && weight > 0) {",
        "  if (!keepLoad && !set.asked && weight !== null && weight > 0) {", None),
    # Maintenance 33 lays the day's floor on what the words read (`heldToTheDay`), which stays.
    "42w25 the check-in's words read the workout as it showed": (
        "      const change = dayChange(\n        { ...request, workout: layer.shown },\n        heldToTheDay(workout, request, constraints),\n      );",
        "      const change = dayChange(\n        request,\n        heldToTheDay(workout, request, constraints),\n      );", None),
    # Maintenance 33 words it by what the check-in reads (`checked`).
    "42w29 a check-in names a hard start the day still shows": (
        "        ...(stays ? { headline: `${checked}: the rest stays eased for the hard start.` } : {}),\n",
        "", None),
    # Maintenance 33 saves the plan without the day's illness under it.
    "42w33 a saved copy keeps no marks of the ease": (
        "      workout: planUnderTheEase(this.planWithoutIllness(session)),",
        "      workout: this.planWithoutIllness(session),", None),
    # Maintenance 33 reads the stop's record before the delete; the delete goes.
    "42x7 a lift closed at its logged sets keeps no record of the ease": (
        "  delete entry.eased;\n  entry.sets = entry.sets.filter((set) => isDone(entry.id, set.index));",
        "  entry.sets = entry.sets.filter((set) => isDone(entry.id, set.index));", None),
    # Maintenance 33 splits the ease (`hard`): the hard start keeps a coach's lift only while pinned.
    "42x21 the coach's offered sets stay through an unpin": (
        "    entry.slot === undefined ||\n    (hard ? handed.length > 0 :",
        "    (entry.slot === undefined && (!hard || entry.locked)) ||\n    (hard ? handed.length > 0 :", None),
    # Maintenance 33 reads the stop's record after the count; the count owes the plan's sets again.
    "42z1 a lift stopped at a new place owes what it shows": (
        "  const owed = entry.sets.filter(\n    (set) => set.kind === 'working' && !isDone(entry.id, set.index),\n  ).length;\n  // The plan its record kept stays with what stopped it",
        "  const owed = (entry.manual?.sets ? entry.sets : (entry.eased?.sets ?? entry.sets)).filter(\n    (set) => set.kind === 'working' && !isDone(entry.id, set.index),\n  ).length;\n  // The plan its record kept stays with what stopped it",
        None),
    # Maintenance 33 splits the count handed on by the ease (`hard`): the hard start's part goes.
    "42z4 a stand-in keeps the count its lift handed on": (
        "    (hard ? handed.length > 0 : handed.some(", "    (hard ? false : handed.some(", None),
    # Maintenance 33 lays the lighter option there too; with neither in force the marks stay.
    "42z5 with no hard start in force, a mark goes": (
        "          ? easeTheRest(workout, plain, constraints)\n          : withoutMarks(workout),",
        "          ? easeTheRest(workout, plain, constraints)\n          : workout,", None),
    # Round N reads `touched` before the back-offs' refit, which comes first now.
    "42z7 a lift that was under way is fitted in place": (
        "    request.completed.sets.some((set) => set.entryId === entry.id) || keepsTheEase(entry);\n  if (\n    top !== undefined &&",
        "    request.completed.sets.some((set) => set.entryId === entry.id);\n  if (\n    top !== undefined &&",
        None),
    # Maintenance 33 gives a copy what the lighter option took (`withLighterTaken`), which stays.
    "42z14 a copy goes without the day's stops": (
        "  const plan = withoutStops(withLighterTaken(restored));",
        "  const plan = withLighterTaken(restored);", None),
    # Round N moved the record's refit into refitRecord, on top set plus back-offs too.
    "42z22 new weights fit the record of a lift keeping the ease": (
        "  if (!keepsTheEase(entry) || !was?.sets) return;", "  if (true) return;", None),
    # ... (refitRecord).
    "42z38 a refitted record's settings follow its ramps": (
        "    ...(was.settings\n      ? {\n          settings: {\n            ...was.settings,\n            warmupSets: record.sets.filter((set) => set.kind === 'warmup').length,\n            dropSet: record.sets.some((set) => set.kind === 'drop'),\n          },\n        }\n      : {}),\n",
        "", None),
    # Round N and Maintenance 33 build the workout a Delete leaves; keepUnderWay is unexported, so its keeping is inlined.
    "42z41 a set removed before any change gives its lift the plan back": (
        "      workout: this.underDayFloor(\n        left,\n        this.backOffsAsPlanned(left, { entryId, setIndex }, isDone),\n      ),",
        "      workout: ((plan, begun) => {\n        const held = (lift) => lift.eased !== undefined && !lift.eased.kept;\n        const under = (block) =>\n          block.entries.some((lift) => begun.has(lift.id)) && block.entries.some(held);\n        return plan.blocks.some(under)\n          ? {\n              ...plan,\n              blocks: plan.blocks.map((block) =>\n                under(block)\n                  ? {\n                      ...block,\n                      entries: block.entries.map((lift) =>\n                        held(lift) ? { ...lift, eased: { ...lift.eased, kept: true } } : lift,\n                      ),\n                    }\n                  : block,\n              ),\n            }\n          : plan;\n      })(\n        this.underDayFloor(\n          left,\n          this.backOffsAsPlanned(left, { entryId, setIndex }, isDone),\n        ),\n        new Set(session.completed.sets.map((c) => c.entryId)),\n      ),",
        None),
    # ... and the one an Undo leaves.
    "42z42 a set undone before any change gives its lift the plan back": (
        "      workout: this.underDayFloor(\n        left,\n        this.backOffsAsPlanned(left, session.completed.sets.at(-1), isDone),\n      ),",
        "      workout: ((plan, begun) => {\n        const held = (lift) => lift.eased !== undefined && !lift.eased.kept;\n        const under = (block) =>\n          block.entries.some((lift) => begun.has(lift.id)) && block.entries.some(held);\n        return plan.blocks.some(under)\n          ? {\n              ...plan,\n              blocks: plan.blocks.map((block) =>\n                under(block)\n                  ? {\n                      ...block,\n                      entries: block.entries.map((lift) =>\n                        held(lift) ? { ...lift, eased: { ...lift.eased, kept: true } } : lift,\n                      ),\n                    }\n                  : block,\n              ),\n            }\n          : plan;\n      })(\n        this.underDayFloor(\n          left,\n          this.backOffsAsPlanned(left, session.completed.sets.at(-1), isDone),\n        ),\n        new Set(session.completed.sets.map((c) => c.entryId)),\n      ),",
        None),
    # Maintenance 33 eases what comes in for the lighter option in a branch of its own, which stays.
    "42z48 what comes in takes the ease the lift showed": (
        "      easeEntry(entry, block, taken, ease.reserve, exercise, request, said);\n", "", None),
    # Maintenance 33 lays the lighter option through the same call (`hard`): the hard start's goes.
    "42z53 the layer lays the ease on each lift": (
        "      if (easeEntry(entry, block, take, reserve, exercise, request, take, why, !hard)) {",
        "      if (!hard && easeEntry(entry, block, take, reserve, exercise, request, take, why, !hard)) {",
        None),
    # Maintenance 33 wrote the check-in's words over lines of their own, a head cold's floor among
    # them; the hard start's words kept the one line this revert had found first.
    "34z2 ... says fewer sets only when a set was cut": (
        "        fewer ? 'fewer sets' : '',\n        easier\n",
        "        'fewer sets',\n        easier\n", None),
    # The harder-variation fix's review (2026-10-31) passes over each step in turn, a variation the
    # lift's sheet lists none of among them: the step passed over is the loop now.
    "35k4 a step passed over offers the next one": (
        "    while (offer.blocked && shown.step + 1 < ROUTE_STEPS.length) {\n      passed.push(offer.explain);\n      shown = { ...shown, step: shown.step + 1 };\n      offer = routeAction(input, entry, shown);\n    }\n    if (passed.length > 0) {\n      offer = { action: offer.action, explain: [...passed, offer.explain].join(' ') };\n    }\n",
        "", None),
}

table = [
    (name, rel, REANCHORED[name][0], REANCHORED[name][1], tests, REANCHORED[name][2])
    if name in REANCHORED
    else (name, rel, old, new, tests, nth)
    for name, rel, old, new, tests, nth in table
]
for superseded, why in SUPERSEDED.items():
    print(f"SUPERSEDED {superseded}: {why}")
table = [row for row in table if row[0] not in SUPERSEDED]

# --resume=log1,log2: entries those logs already report are not run again (a run cut short).
done_before: set[str] = set()
for flag in sys.argv[1:]:
    if flag.startswith("--resume="):
        for log in flag.split("=", 1)[1].split(","):
            for line in pathlib.Path(log).read_text(encoding="utf-8", errors="replace").splitlines():
                found = re.match(r"^(KILLED|SURVIVED)\s+(.+?): ", line)
                if found:
                    done_before.add(found.group(2))

results = []
for name, rel, old, new, tests, nth in table:
    if args and not any(name.startswith(prefix) for prefix in args):
        continue
    if name in done_before:
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
        # A test file that did not load (a syntax error) is a failed file with no test failed.
        files = re.search(r"Test Files\s+(.*)", out)
        unloaded = files is not None and "failed" in files.group(1) and "failed" not in line
        wrong = (
            summary is None
            or unloaded
            or (re.search(r"Test timed out", out) is not None and not asserted)
        )
        killed = "failed" in line and not wrong
        verdict = "WRONG FAILURE" if wrong else "KILLED" if killed else "SURVIVED"
        results.append((name, verdict, line))
    finally:
        path.write_bytes(original.encode("utf-8"))
    print(f"{results[-1][1]:9} {name}: {results[-1][2]}", flush=True)

if check:
    print(f"anchors checked: {len(table)} entries, {len(results)} not found")
    sys.exit(0)
print("\n==== summary")
for name, verdict, line in results:
    print(f"{verdict:9} {name}  [{line}]")
survived = [r for r in results if r[1] != "KILLED"]
print(f"\n{len(results) - len(survived)} killed, {len(survived)} not killed")
