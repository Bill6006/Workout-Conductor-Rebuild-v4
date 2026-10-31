"""Item 48's mutation checks (2026-10-31): Life Mirror's daily check-in, read-only, behind an off
switch. Revert each part alone, run its tests, expect a failure, restore. Prints KILLED (a test
failed) or SURVIVED (every test still passed).

  python mutate-item48.py --repo=PATH            run every entry in a copy of the repository
  python mutate-item48.py --repo=PATH I1 L3      run the entries whose names start with these
  python mutate-item48.py --repo=PATH --check    only check that every anchor is found once
  python mutate-item48.py --repo=PATH --utc      run the tests in UTC, then the day rules' zones

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

CLOUD = "src/core/cloud/lifeMirror.ts"
PREFILL = "src/engine/readiness/lifeMirror.ts"
CHECKIN = "src/engine/readiness/checkIn.ts"
STORE = "src/core/state/appStore.ts"
LINK = "src/core/validation/lifeMirrorLink.ts"
SESSION = "src/core/state/session.ts"
RECORD = "src/core/validation/workoutRecord.ts"
SHEET = "src/features/today/ReadinessSheet.tsx"
HOOK = "src/features/today/useLifeMirrorPrefill.ts"
TODAY = "src/features/today/TodayScreen.tsx"
WORKOUT = "src/features/workout/ActiveWorkoutScreen.tsx"
SETTINGS_SCREEN = "src/features/settings/SettingsScreen.tsx"
RECAL = "src/engine/recalibration/recalibrate.ts"

T_CLOUD = "src/core/cloud/lifeMirror.test.ts"
T_PREFILL = "src/engine/readiness/lifeMirror.test.ts"
T_STORE = "src/core/state/lifeMirror.store.test.ts"
T_STORED = "src/core/validation/lifeMirrorStored.test.ts"
T_SHEET = "src/features/today/lifeMirrorCheckIn.screens.test.tsx"
T_SCREENS = "src/features/today/lifeMirrorScreens.screens.test.tsx"
T_SETTINGS = "src/features/settings/lifeMirrorSwitch.screens.test.tsx"
T_HOOK = "src/features/today/useLifeMirrorPrefill.test.tsx"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # The question put to the shared database: the approved readings alone, Life Mirror's rows of the day.
    ("I1 only the approved readings leave the database", CLOUD,
     "export const LIFE_MIRROR_QUERY = `SELECT updated_at, ${TAKEN}",
     "export const LIFE_MIRROR_QUERY = `SELECT updated_at, body, ${TAKEN}",
     [T_CLOUD], None),
    ("I2 ... of rows not deleted", CLOUD,
     "AND store = ? AND deleted = 0 AND day = ? AND json_valid(body)`;",
     "AND store = ? AND day = ? AND json_valid(body)`;", [T_CLOUD], None),
    ("I3 ... of the day", CLOUD,
     "AND deleted = 0 AND day = ? AND json_valid(body)`;", "AND deleted = 0 AND json_valid(body)`;",
     [T_CLOUD], None),
    ("I4 ... a body that reads", CLOUD,
     " AND day = ? AND json_valid(body)`;", " AND day = ?`;", [T_CLOUD], None),
    ("I5 a block it knows", CLOUD,
     "    if (!LIFE_MIRROR_BLOCKS.includes(block as LifeMirrorBlockName)) continue;\n", "",
     [T_CLOUD], None),
    ("I6 a reading on its 1-5 scale", CLOUD,
     " && value >= 1 && value <= 5) {", " && value >= 1) {", [T_CLOUD], None),
    ("I7 ... a whole number", CLOUD,
     "typeof value === 'number' && Number.isInteger(value) && value >= 1",
     "typeof value === 'number' && value >= 1", [T_CLOUD], None),
    ("I8 one check-in a block, the later", CLOUD,
     "    if (before && before.changed >= changed) continue;\n", "    if (before) continue;\n",
     [T_CLOUD], None),
    ("I9 told at its completion", CLOUD,
     "at: isoOf(row.completed_at) ?? changed,", "at: changed,", [T_CLOUD], None),
    # The review of item 48: each value leaves the database only of its type.
    ("I10 nothing but a whole number or text leaves it", CLOUD,
     "  `CASE WHEN json_type(body, '$.${path}') = '${type}' THEN json_extract(body, '$.${path}') END AS ${name}`;\n",
     "  `json_extract(body, '$.${path}') AS ${name}`;\n", [T_CLOUD], None),

    # What today's check-ins fill in.
    ("P1 the night: a step off for a broken or rough night", PREFILL,
     "  return quality !== undefined && quality <= 2 ? Math.max(1, step - 1) : step;\n",
     "  return step;\n", [T_PREFILL], None),
    ("P2 ... the quality alone without the hours", PREFILL,
     "  if (hours === undefined) return quality;\n", "  if (hours === undefined) return undefined;\n",
     [T_PREFILL], None),
    ("P3 energy, stress and mood from today's latest", PREFILL,
     "    .sort((a, b) => b.at.localeCompare(a.at))[0];\n",
     "    .sort((a, b) => a.at.localeCompare(b.at))[0];\n", [T_PREFILL], None),
    ("P4 the night from this morning's only", PREFILL,
     "  const morning = blocks.filter((block) => block.block === 'morning');\n",
     "  const morning = [...blocks];\n", [T_PREFILL], None),
    ("P5 ... and motivation", PREFILL,
     "latest(morning, 'motivation') ? { motivation: latest(morning, 'motivation')! }",
     "latest(blocks, 'motivation') ? { motivation: latest(blocks, 'motivation')! }",
     [T_PREFILL], None),
    ("P6 nothing where nothing came", PREFILL,
     "  return Object.keys(filled).length > 0 ? filled : null;\n", "  return filled;\n",
     [T_PREFILL], None),
    # The review of item 48: past 7 hours more adds little; Great only for a deep night.
    ("P7 the hours carry it up to 7", PREFILL,
     "  const step = Math.min(hours, 4) + (hours >= 4 && quality === 5 ? 1 : 0);\n",
     "  const step = hours + (hours >= 4 && quality === 5 ? 1 : 0);\n", [T_PREFILL], None),
    ("P8 ... Great for a deep night", PREFILL,
     "  const step = Math.min(hours, 4) + (hours >= 4 && quality === 5 ? 1 : 0);\n",
     "  const step = Math.min(hours, 4);\n", [T_PREFILL], None),
    ("P9 ... of 7 hours or more", PREFILL,
     "(hours >= 4 && quality === 5 ? 1 : 0)", "(quality === 5 ? 1 : 0)", [T_PREFILL], None),

    # Life Mirror's stress and mood in the check-in.
    ("M1 stress worse above the lifter's own", CHECKIN,
     "    return item === 'stress' ? today >= mean + margin : today <= mean - margin;\n",
     "    return today <= mean - margin;\n", [T_PREFILL], None),
    ("M2 ... never against the scale", CHECKIN,
     "    if (values.length < RULES.baselineLeast.value) return false;\n", "",
     [T_PREFILL], None),
    ("M3 they count with the others", CHECKIN,
     "    lowered: worseAll.length >= RULES.worseItems.value || extreme !== null,\n",
     "    lowered: worse.length >= RULES.worseItems.value || extreme !== null,\n", [T_PREFILL], None),
    ("M4 ... and are said", CHECKIN,
     "  return names.length > 0 ? `${under}, stress above it` : 'stress above your usual';\n",
     "  return under;\n", [T_PREFILL], None),

    # The review of item 48: what a check-in with Life Mirror's says and keeps off the day.
    ("R1 Feeling good beside a stress no heavier than its middle", RECAL,
     "        (readiness.stress === undefined || readiness.stress <= 3) &&\n", "",
     [T_PREFILL], None),
    ("R2 ... and a mood no lower", RECAL,
     "        (readiness.mood === undefined || readiness.mood >= 3);\n", "        true;\n",
     [T_PREFILL], None),
    ("R3 Life Mirror's motivation never keeps the reserve check off alone", RECAL,
     "    readiness.motivation <= 2 && readiness.fromLifeMirror?.motivation === undefined;\n",
     "    readiness.motivation <= 2;\n", [T_PREFILL], None),

    # The switch and the read in the store.
    ("L1 nothing read with the switch off", STORE,
     "    if (!this.state.lifeMirrorLink.on) return null;\n", "", [T_STORE], None),
    ("L2 ... before 04:00", STORE,
     "    if (new Date(now).getHours() < 4) return null;\n", "", [T_STORE], None),
    ("L3 ... unless the cloud copy is Life Mirror's database", STORE,
     "      if (!resolved.token || url !== DEFAULT_CLOUD_URL) return null;\n",
     "      if (!resolved.token) return null;\n", [T_STORE], None),
    ("L4 ... and a token", STORE,
     "      if (!resolved.token || url !== DEFAULT_CLOUD_URL) return null;\n",
     "      if (url !== DEFAULT_CLOUD_URL) return null;\n", [T_STORE], None),
    ("L5 a read that fails is nothing", STORE,
     "      return lifeMirrorPrefill(await withinBound(readLifeMirrorDay(client, localDayKey(now))));\n    } catch {\n      return null;\n    }\n",
     "      return lifeMirrorPrefill(await withinBound(readLifeMirrorDay(client, localDayKey(now))));\n    } finally {\n      // no catch\n    }\n",
     [T_STORE], None),
    ("L6 the switch read back", STORE,
     "            ? (parseLifeMirrorLink(lifeMirrorRaw) ?? defaultLifeMirrorLink())\n",
     "            ? defaultLifeMirrorLink()\n", [T_STORE], None),
    ("L7 ... and kept as turned", STORE,
     "      const next: LifeMirrorLink = { ...saved, on };\n      await putVerified(db, 'meta', next, { now: this.now });\n",
     "      const next: LifeMirrorLink = { ...saved, on };\n", [T_STORE, T_SETTINGS], None),
    ("L8 off until turned on", LINK,
     "  return { id: LIFE_MIRROR_LINK_ID, on: false };\n",
     "  return { id: LIFE_MIRROR_LINK_ID, on: true };\n", [T_STORE, T_SETTINGS], None),
    ("L9 ... and a record that does not say so is off", LINK,
     "  on: z.boolean().catch(false).default(false),\n", "  on: z.boolean().catch(true).default(true),\n",
     [T_STORED], None),
    # The review of item 48: a token copy healed by the read restarts the walk, as the opening does.
    ("L10 a healed token restarts the walk of the cloud copy", STORE,
     "      if (resolved.recover) await restartPull(db).catch(() => undefined);\n", "",
     [T_STORE], None),

    # The stored fields.
    ("V1 a check-in's stress that does not read is dropped alone, on the session", SESSION,
     "  stress: z.number().int().min(1).max(5).optional().catch(undefined),\n",
     "  stress: z.number().int().min(1).max(5).optional(),\n", [T_STORED], None),
    ("V2 ... and sources that are not a list of them", LINK,
     "  .optional()\n  .catch(undefined);\n", "  .optional();\n", [T_STORED], None),
    ("V3 ... a mood, on a saved workout", RECORD,
     "      mood: z.number().int().min(1).max(5).optional().catch(undefined),\n",
     "      mood: z.number().int().min(1).max(5).optional(),\n", [T_STORED], None),
    # The review of item 48: each source read alone.
    ("V4 a source that does not read dropped alone", LINK,
     "      if (typeof at === 'string' && z.iso.datetime().safeParse(at).success) kept[field] = at;\n",
     "      if (typeof at === 'string') kept[field] = at;\n", [T_STORED], None),
    ("V5 ... and one this copy does not know", LINK,
     "    for (const field of FILLED) {\n",
     "    for (const field of Object.keys(sources) as Filled[]) {\n", [T_STORED], None),

    # The sheet.
    ("U1 the sheet fills in Life Mirror's values", SHEET,
     "    return filled ? { value: String(filled.value) as Scale, from: filled.at } : null;\n",
     "    return null;\n", [T_SHEET], None),
    ("U2 ... each labelled", SHEET, "      {from?.at ? (\n", "      {false ? (\n", [T_SHEET], None),
    ("U3 ... the label gone with a tap", SHEET,
     "    own[field] === undefined ? given(field)?.from : undefined;\n",
     "    given(field)?.from;\n", [T_SHEET], None),
    ("U4 a check-in told stands over Life Mirror's", SHEET,
     "    if (initial) {\n      const value = initial[field];\n      return value === undefined\n        ? null\n        : { value: String(value) as Scale, from: initial.fromLifeMirror?.[field] };\n    }\n",
     "", [T_SHEET], None),
    ("U5 Life Mirror's stress and mood told with it", SHEET,
     "      carried[field] = Number(value);\n", "", [T_SHEET], None),
    ("U6 ... and where each value came from", SHEET,
     "      ...(Object.keys(from).length > 0 ? { fromLifeMirror: from } : {}),\n", "",
     [T_SHEET, T_STORE], None),
    ("U7 read as the check-in opens", HOOK, "    if (!open) return;\n", "    if (open) return;\n",
     [T_SCREENS], None),
    ("U8 Today's check-in reads it", TODAY, "        lifeMirror={lifeMirror}\n", "", [T_SCREENS], None),
    ("U9 ... and the workout's", WORKOUT, "        lifeMirror={lifeMirror}\n", "", [T_SCREENS], None),
    ("U10 the switch in Settings", SETTINGS_SCREEN, "              <LifeMirrorRow />\n", "",
     [T_SETTINGS], None),
    # The review of item 48: any tap makes a value the lifter's own.
    ("U11 a tap back to Life Mirror's value is the lifter's", SHEET,
     "    own[field] === undefined ? given(field)?.from : undefined;\n",
     "    own[field] === undefined || own[field] === given(field)?.value ? given(field)?.from : undefined;\n",
     [T_SHEET], None),
    # The review of item 48: its stress and mood shown, labelled and changeable, with the switch on.
    ("U12 neither stress nor mood with the switch off", SHEET,
     "    return lifeMirrorOn && value !== undefined ? [{ field, value }] : [];\n",
     "    return value !== undefined ? [{ field, value }] : [];\n", [T_SHEET], None),
    ("U13 ... shown where they came", SHEET,
     "      {shared.map(({ field, value }) => (\n", "      {[].map(({ field, value }) => (\n",
     [T_SHEET], None),
    ("U14 ... in Life Mirror's own words", SHEET,
     "  stress: { label: 'Stress', words: ['Loose', 'Light', 'Middling', 'Wound tight', 'Crushing'] },\n",
     "  stress: { label: 'Stress', words: ['Crushing', 'Wound tight', 'Middling', 'Light', 'Loose'] },\n",
     [T_SHEET], None),
    ("U15 ... and changed with a tap", SHEET,
     "          {scale(SHARED[field].label, SHARED[field].words, value, setField(field), {\n",
     "          {scale(SHARED[field].label, SHARED[field].words, value, () => undefined, {\n",
     [T_SHEET], None),
    ("U16 Today's check-in knows the switch", TODAY, "        lifeMirrorOn={lifeMirrorOn}\n", "",
     [T_SCREENS], None),
    ("U17 ... and the workout's", WORKOUT, "        lifeMirrorOn={lifeMirrorOn}\n", "",
     [T_SCREENS], None),
    # The review of item 48: no read beside a check-in told, and three seconds at most.
    ("U18 nothing read for a check-in told", TODAY,
     "  const lifeMirror = useLifeMirrorPrefill(checkingIn && !today?.session.constraints.readiness);\n",
     "  const lifeMirror = useLifeMirrorPrefill(checkingIn);\n", [T_SCREENS], None),
    ("U19 a read later than three seconds let go", HOOK,
     "    const timer = setTimeout(() => done(null), PREFILL_WAIT_MS);\n",
     "    const timer = setTimeout(() => done(null), PREFILL_WAIT_MS * 100);\n", [T_HOOK], None),
    ("U20 ... the first answer kept", HOOK, "      if (!waiting) return;\n", "", [T_HOOK], None),
    ("U21 ... and none after the sheet closes", HOOK,
     "      waiting = false;\n      clearTimeout(timer);\n", "      clearTimeout(timer);\n",
     [T_HOOK], None),
    # The review of item 48: Today's summary names them once told.
    ("U22 Today's summary names the stress told", TODAY,
     "${readiness.stress !== undefined ? ` · stress ${readiness.stress}/5` : ''}", "",
     [T_SCREENS], None),
    ("U23 ... and the mood", TODAY,
     "${readiness.mood !== undefined ? ` · mood ${readiness.mood}/5` : ''}", "",
     [T_SCREENS], None),
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
