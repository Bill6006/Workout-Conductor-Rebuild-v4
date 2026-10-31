"""The custom equipment presets' mutation checks (2026-10-31). Revert each part alone, run its
tests, expect a failure, restore. Prints KILLED (a test failed) or SURVIVED (every test still
passed).

  python mutate-presets.py --repo=PATH            run every entry in a copy of the repository
  python mutate-presets.py --repo=PATH P1 S3      run the entries whose names start with these
  python mutate-presets.py --repo=PATH --check    only check that every anchor is found once
  python mutate-presets.py --repo=PATH --utc      run the tests in UTC, then the day rules' zones

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

PRESET = "src/core/validation/equipmentPreset.ts"
STORE = "src/core/state/appStore.ts"
PICKER = "src/features/profile/editors/EquipmentPicker.tsx"
MANAGER = "src/features/settings/EquipmentPresets.tsx"
SETTINGS = "src/features/settings/SettingsScreen.tsx"

T_VALID = "src/core/validation/equipmentPreset.test.ts"
T_STORE = "src/core/state/equipmentPresets.store.test.ts"
T_SCREENS = "src/features/settings/equipmentPresets.screens.test.tsx"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # The stored preset and its name.
    ("P1 a preset's own id, apart from every other meta record", PRESET,
     "  id: z.string().startsWith(PRESET_ID_PREFIX).max(80),\n", "  id: z.string().max(80),\n",
     [T_VALID], None),
    ("P2 a name needed", PRESET,
     "  if (trimmed.length === 0) return 'Name the preset.';\n", "", [T_VALID], None),
    ("P3 never a built-in's", PRESET,
     "  if (builtIn) return `${builtIn.name} is built in; choose another name.`;\n", "",
     [T_VALID, T_STORE, T_SCREENS], None),
    ("P4 never another preset's", PRESET,
     "  if (presets.some((preset) => sameName(preset.name, trimmed))) {\n",
     "  if (false) {\n", [T_VALID, T_STORE], None),
    # P5 (the preset's own id left out of the check) went from the code: a name it has returns first (P6).
    ("P6 ... and a name it has never refused, two devices' twins too", PRESET,
     "  if (own && sameName(own.name, trimmed)) return null;\n", "", [T_VALID, T_STORE], None),
    ("P7 case aside", PRESET,
     "  nameKey(a).localeCompare(nameKey(b), undefined, { sensitivity: 'base' }) === 0;\n",
     "  nameKey(a) === nameKey(b);\n", [T_VALID], None),
    ("P8 ... and a \"preset\" at the end", PRESET,
     "    .replace(/\\s*preset$/i, '')\n", "", [T_VALID], None),
    ("P9 shown by name", PRESET,
     "      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id),\n",
     "      a.id.localeCompare(b.id),\n", [T_VALID, T_STORE], None),

    # The store.
    ("S1 kept as made", STORE,
     "      await putVerified(db, 'meta', next, { now: this.now });\n      this.presetsVersion += 1;\n      this.setState({ equipmentPresets: await this.presetsOnDisk(db, next) });\n",
     "      this.presetsVersion += 1;\n      this.setState({ equipmentPresets: await this.presetsOnDisk(db, next) });\n",
     [T_STORE], None),
    ("S2 ... and listed from the store after each change", STORE,
     "    if (records !== null) return presetsFrom(records.filter((record) => isPresetId(record.id)));\n",
     "", [T_STORE], None),
    ("S3 read back when the app opens", STORE,
     "          this.presetsVersion === presetsSeen && presetsRaw !== null\n",
     "          false\n", [T_STORE], None),
    ("S4 ... a meta record that does not read never keeping it from opening", STORE,
     "        db.getAll<Identified>('meta').catch(() => null),\n",
     "        db.getAll<Identified>('meta'),\n", [T_STORE], None),
    ("S5 a name refused before anything is written", STORE,
     "      if (problem) throw new Error(problem);\n", "", [T_STORE], None),
    ("S6 a preset kept that does not read never written over", STORE,
     "        if (raw !== undefined && saved === null) {\n", "        if (false) {\n", [T_STORE], None),
    ("S7 one deleted meanwhile kept as a new one", STORE,
     "        if (raw !== undefined && saved === null) {\n", "        if (saved === null) {\n",
     [T_STORE], None),
    ("S8 when it was made kept", STORE,
     "        createdAt: saved?.createdAt ?? now,\n", "        createdAt: now,\n", [T_STORE], None),
    ("S9 its equipment as a place keeps it", STORE,
     "          ...normalizeEquipment(input.equipment),\n", "          ...input.equipment,\n",
     [T_STORE], None),
    ("S10 ... what a newer copy's catalog added kept", STORE,
     "          ...(saved?.equipment ?? []).filter((id) => !ALL_EQUIPMENT_IDS.includes(id)),\n", "",
     [T_STORE], None),
    ("S11 deleted, the cloud copy told", STORE,
     "      await deleteVerified(db, 'meta', id);\n", "", [T_STORE, T_SCREENS], None),
    ("S12 ... the built-ins never", STORE,
     "      if (!isPresetId(id)) throw new Error('Home and Full gym are built in and stay.');\n", "",
     [T_STORE], None),

    # Where a place's equipment is set.
    ("U1 the lifter's presets beside Full gym and Home", PICKER,
     "        {presets.map((preset) => (\n", "        {[].map((preset: { id: string; name: string; equipment: string[] }) => (\n",
     [T_SCREENS], None),
    ("U2 ... a tap copying one in", PICKER,
     "            onClick={() => onChange(normalizeEquipment(preset.equipment))}\n",
     "            onClick={() => undefined}\n", [T_SCREENS], None),
    ("U3 ... named as a preset", PICKER,
     "const presetLabel = (name: string) => (/preset$/i.test(name.trim()) ? name : `${name} preset`);\n",
     "const presetLabel = (name: string) => name;\n", [T_SCREENS], None),

    # Settings, Places, Equipment presets.
    ("X1 the built-ins shown", MANAGER,
     "        {BUILT_IN_PRESETS.map((preset) => (\n", "        {[].map((preset: { name: string; equipment: string[] }) => (\n",
     [T_SCREENS], None),
    ("X2 a preset of the lifter's own opened to change", MANAGER,
     "            <Button variant=\"secondary\" onClick={() => setEditing(preset)}>\n",
     "            <Button variant=\"secondary\" onClick={() => undefined}>\n", [T_SCREENS], None),
    ("X3 ... saved", MANAGER,
     "      await store.saveEquipmentPreset({ ...(preset ? { id: preset.id } : {}), name, equipment });\n",
     "      await store.saveEquipmentPreset({ name, equipment });\n", [T_SCREENS], None),
    ("X4 ... a name refused said", MANAGER,
     "      <Field label=\"Name\" htmlFor=\"preset-name\" error={nameError ?? undefined}>\n",
     "      <Field label=\"Name\" htmlFor=\"preset-name\">\n", [T_SCREENS], None),
    ("X5 ... asked before it is deleted", MANAGER,
     "              <Button variant=\"secondary\" disabled={busy} onClick={() => setConfirming(true)}>\n",
     "              <Button variant=\"secondary\" disabled={busy} onClick={() => void remove()}>\n",
     [T_SCREENS], None),
    ("X6 ... deleted", MANAGER,
     "      await store.deleteEquipmentPreset(preset.id);\n", "", [T_SCREENS], None),
    ("X7 ... New preset with the focus once it is", MANAGER,
     "            newButton.current?.focus();\n", "", [T_SCREENS], None),
    ("X8 never closed while it saves", MANAGER,
     "      onClose={busy ? () => undefined : onClose}\n", "      onClose={onClose}\n",
     [T_SCREENS], None),
    ("X9 the row in Settings", SETTINGS, "                <EquipmentPresets />\n", "",
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
