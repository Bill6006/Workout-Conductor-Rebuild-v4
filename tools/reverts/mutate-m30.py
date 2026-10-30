"""Maintenance 30 mutation checks: revert each round L rule alone, run its tests, expect a failure,
restore. Prints KILLED (a test failed) or SURVIVED (every test still passed).

  python mutate-m30.py --repo=PATH            run every M30 entry in a copy of the repository
  python mutate-m30.py --repo=PATH 6a 31b     run the entries whose names start with these
  python mutate-m30.py --repo=PATH --check    only check that every anchor is found once
  python mutate-m30.py --repo=PATH --utc ...  as the CI runner: the tests in UTC, then the day
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

RULE = "src/engine/workoutGenerator/loadedVersions.ts"
GENERATE = "src/engine/workoutGenerator/generate.ts"
LOADING = "src/engine/loading/loading.ts"
PLATE_MATH = "src/engine/plateMath/plateMath.ts"
EDITOR = "src/features/workout/LoadingEditor.tsx"
PANELS = "src/features/workout/EntryPanels.tsx"
SCREEN = "src/features/workout/ActiveWorkoutScreen.tsx"
PLACES = "src/features/settings/PlaceWeights.tsx"
SETTINGS = "src/features/settings/SettingsScreen.tsx"
STORE = "src/core/state/appStore.ts"
AUTOSAVE = "src/features/profile/useProfileEditor.ts"
DEFINE = "src/catalog/exercises/define.ts"
CUSTOM = "src/core/validation/customExercise.ts"
COACH = "src/engine/coach/coachConductor.ts"

T_RULE = "src/engine/workoutGenerator/loadedVersions.test.ts"
T_MACHINE = "src/engine/loading/machinePlates.test.ts"
T_TAB = "src/features/workout/weightsTab.test.tsx"
T_SCREEN = "src/features/workout/machinePlates.screens.test.tsx"
T_AUTOSAVE = "src/features/profile/useProfileEditor.test.tsx"
T_COACH = "src/engine/coach/fewerRepsLoaded.test.ts"
T_CALF = "src/engine/coach/calfFewerReps.test.ts"
T_SWAP = "src/engine/workoutGenerator/swapTakesLoaded.test.ts"
T_CABLE = "src/features/workout/customCableSwitch.test.tsx"
T_PLACES = "src/core/state/placeWrites.test.ts"
T_ONLY = "src/engine/workoutGenerator/onlyLoadedLeft.test.ts"
T_TO_LOADED = "src/engine/workoutGenerator/swapToLoaded.test.ts"
T_ORDER = "src/features/workout/customMachineOrder.test.tsx"
T_SETUP_KEEPS = "src/core/state/setupKeepsWeights.test.ts"
T_BACK = "src/engine/workoutGenerator/swapBackToBodyweightCoach.test.ts"
T_SETTINGS_ORDER = "src/features/settings/customMachineSettingsOrder.test.tsx"
T_FAV_BOTH = "src/engine/workoutGenerator/favouriteBothCoach.test.ts"
T_SECTIONS = "src/features/settings/customMoveSections.test.tsx"
T_SWAP_BACK_PLAN = "src/engine/workoutGenerator/swapToBodyweightCoachPlan.test.ts"
T_RACK = "src/features/settings/customRackOnly.test.tsx"
T_KEEP_OWN = "src/core/state/keepOwnPickSwapBack.test.ts"
T_FAV_BACK = "src/engine/workoutGenerator/swapBackFavourite.test.ts"
T_OTHER_SWAP = "src/engine/workoutGenerator/swapBackOtherSwap.test.ts"
T_KEEP_FAV = "src/core/state/keepOwnPickFavourite.test.ts"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # Item 6: the tab is Weights on a machine's stack and on dumbbells; weights per place in Settings.
    ("6a the tab is Weights off plates", PANELS,
     "  const tabName = onPlates(exercise, spec) ? 'Plates' : 'Weights';",
     "  const tabName = 'Plates';", [T_TAB], None),
    ("6b a machine on plates counts as plates", LOADING,
     "  return isBarLoad(exercise.load) || machineOnPlates(exercise, spec);",
     "  return isBarLoad(exercise.load);", [T_TAB, T_MACHINE], None),
    ("6c a move with no load has no tab of its own", PANELS,
     "  const canLoad = !hasNoLoad(exercise);",
     "  const canLoad = exercise.load !== 'bodyweight' && exercise.load !== 'band';", [T_TAB], None),
    ("6d nor a place editor when it holds a weight", PANELS,
     "          {canLoad ? (", "          {true ? (", [T_TAB], None),
    ("6e a weight on a step-up reads as held", LOADING,
     "    hasNoLoad(exercise) && exercise.load !== 'band'\n      ? { ...exercise, load: 'bodyweight' }\n      : exercise,",
     "    exercise,", [T_TAB], None),
    ("6f Settings reads the place's own equipment", PLACES,
     "          group.every((id) => equipment.has(id)) &&\n          (exercise.id.startsWith(CUSTOM_ID_PREFIX)\n            ? groupGivesLoad(group, exercise.load)\n            : loadOfGroup(group) === exercise.load),",
     "          group.every((id) => equipment.has(id)),", [T_TAB], None),
    ("6g Settings lists no move with no load as a machine", PLACES,
     "    (exercise) => exercise.load === 'stack' && !hasNoLoad(exercise),",
     "    (exercise) => exercise.load === 'stack',", [T_TAB], None),
    ("6h Settings sets what a place keeps, not today's", PLACES,
     "      today={false}\n", "", [T_TAB], None),
    ("6i the place's rack is read", LOADING,
     "  return rack?.kind === 'plates' ? [...rack.perSide] : [...PLATE_INVENTORY[units]];",
     "  return [...PLATE_INVENTORY[units]];", [T_TAB], None),
    ("6j the Settings row", SETTINGS,
     "                <PlaceWeights />\n", "", [T_SCREEN], None),

    # Item 30: a pin-stack or plate-loaded switch on the machines that come both ways.
    ("30a a machine's plates record puts it on plates", LOADING,
     "  return exercise.load === 'stack' && spec?.kind === 'plates';",
     "  return false;", [T_MACHINE, T_TAB, T_SCREEN], None),
    ("30b no bar on a machine", LOADING,
     "    const bar = machine ? 0 : (exercise.barWeight?.[units] ?? (units === 'lb' ? 45 : 20));",
     "    const bar = exercise.barWeight?.[units] ?? (units === 'lb' ? 45 : 20);", [T_MACHINE], None),
    ("30c it moves by its plates, not its pins", LOADING,
     "    machine\n      ? { load: 'barbell' }\n      : hasNoLoad",
     "    false\n      ? { load: 'barbell' }\n      : hasNoLoad", [T_MACHINE], None),
    ("30d its weights are the plates' totals", LOADING,
     "  if (isBarLoad(exercise.load) || machine) {",
     "  if (isBarLoad(exercise.load)) {", [T_MACHINE, T_SCREEN], None),
    ("30e the plates a side, no bar", PLATE_MATH,
     "  if (machinePlates && exercise.load === 'stack') {",
     "  if (false) {", [T_MACHINE, T_TAB], None),
    ("30f the switch only where a machine comes both ways", LOADING,
     "  if (MACHINES_BOTH_WAYS.has(exercise.id)) return true;",
     "  if (true) return true;", [T_TAB], None),
    ("30g plates start from the place's rack", EDITOR,
     "                rackPlates(placeLoading, units),",
     "                rackPlates(undefined, units),", [T_TAB, T_SCREEN], None),
    ("30h the stack comes back from the record", LOADING,
     "          ? current.stack\n            ? { kind: 'stack', ranges: current.stack }\n            : null",
     "          ? null", [T_MACHINE, T_TAB, T_SCREEN], None),
    ("30i ... which keeps it on the switch to plates", LOADING,
     "              ...(current?.kind === 'stack' ? { stack: current.ranges } : {}),\n", "",
     [T_MACHINE, T_TAB, T_SCREEN], None),
    ("30j a machine's plates change for the machine", EDITOR,
     "        machinePlates\n          ? saveMachinePlates(next)", "        false\n          ? saveMachinePlates(next)",
     [T_TAB], None),
    ("30k All plates keeps a machine on plates", EDITOR,
     "(machinePlates ? saveMachinePlates([...inventory]) : onSave(null))", "onSave(null)", [T_TAB], None),
    ("30l the panel says the sled is not counted", PANELS,
     "                      ? 'The same on each side; the sled is not counted.'",
     "                      ? 'No plates to load.'", [T_TAB, T_SCREEN], None),
    ("30m the logger reads a machine's plates", SCREEN,
     "            specFor(currentLocation?.loading, exercise),\n          )}",
     "            null,\n          )}", [T_SCREEN], None),
    ("30n the workout's editor knows the place's records", SCREEN,
     "          placeLoading={currentLocation?.loading}\n", "", [T_SCREEN], None),
    ("30o Settings' editor knows the place's records", PLACES,
     "      placeLoading={place.loading}\n", "", [T_TAB], None),
    ("30p one switch for the machine", LOADING,
     "  return [...MACHINES_BOTH_WAYS].filter((id) => machineOf(id) === machine);",
     "  return [exerciseId];", [T_MACHINE, T_TAB], None),
    ("30q the switch saves every exercise on the machine", EDITOR,
     "                if (onSaveMachine) await onSaveMachine(specs);\n                else await onSave(mine);",
     "                await onSave(mine);", [T_TAB], None),
    ("30r ... in Settings", PLACES,
     "      onSaveMachine={(specs) => store.saveLoadings(place.id, specs)}\n", "", [T_TAB], None),
    ("30s a machine's plates keep its stack through a plate change", LOADING,
     "    if (current?.kind === 'plates') specs[id] = { ...current, perSide: [...perSide] };",
     "    if (current?.kind === 'plates') specs[id] = { kind: 'plates', perSide: [...perSide] };",
     [T_TAB], None),

    # Item 31: weighted versions of bodyweight moves.
    ("31a outgrown is a rep past the top", RULE,
     "        return reps !== null && atReserve(set) >= reps[1] + 1;",
     "        return reps !== null && atReserve(set) >= reps[1];", [T_RULE], None),
    ("31b at the planned reserve", RULE,
     "        set.reps + (set.rir ?? 0) - (set.targetRir ?? PLANNED_RESERVE);",
     "        set.reps;", [T_RULE], None),
    ("31c no reserve logged reads as failure", RULE,
     "(set.rir ?? 0)", "(set.rir ?? 2)", [T_RULE], None),
    ("31d the planned reserve is 2 when a set has none", RULE,
     "const PLANNED_RESERVE = 2;", "const PLANNED_RESERVE = 0;", [T_RULE], None),
    ("31e back only when short of the range's bottom", RULE,
     "          return reps !== null && atReserve(set) < reps[0];",
     "          return reps !== null && atReserve(set) <= reps[1];", [T_RULE], None),
    ("31f in order, oldest first", RULE,
     "  const inOrder = [...history].sort((a, b) => a.startedAt.localeCompare(b.startedAt));",
     "  const inOrder = [...history];", [T_RULE], None),
    ("31g a weight added outgrows it", RULE,
     "      else if (atBodyweight.length < working.length) outgrown.set(entry.exerciseId, 'weight');\n",
     "", [T_RULE], None),
    ("31h the catalog's range where a set has none", RULE,
     "        set.targetReps ?? rangeOf(entry.exerciseId) ?? null;",
     "        set.targetReps ?? ([8, 12] as const);", [T_RULE], None),
    ("31i working sets only", RULE,
     "      const working = entry.sets.filter((set) => set.kind === 'working' && set.completed);",
     "      const working = entry.sets.filter((set) => set.completed);", [T_RULE], None),
    ("31j done sets only", RULE,
     "      const working = entry.sets.filter((set) => set.kind === 'working' && set.completed);",
     "      const working = entry.sets.filter((set) => set.kind === 'working');", [T_RULE], None),
    ("31k a calf raise on two legs loads by default", RULE,
     "  return outgrown.has(bodyweightId) || LOADED_BY_DEFAULT.has(bodyweightId);",
     "  return outgrown.has(bodyweightId);", [T_RULE], None),
    ("31l the bodyweight move gives way once it loads", RULE,
     "  return loadsNow(exercise.id, outgrown, swappedAway) ? -LOAD_SHIFT : 0;",
     "  return 0;", [T_RULE], None),
    ("31m the loaded version waits until then", RULE,
     "  return !loadsNow(bodyweight, outgrown, swappedAway);",
     "  return false;", [T_RULE, T_ONLY], None),
    ("31n only where the other is a candidate", RULE,
     "  if (!loaded?.some((id) => candidateIds.has(id))) return 0;",
     "  if (!loaded) return 0;", [T_RULE], None),
    ("31o the line until the loaded one is done here", RULE,
     "  if (doneHere.get(bodyweightId) === 'loaded') return null;\n", "", [T_RULE], None),
    ("31p the line says why", RULE,
     "    by === 'reps'\n      ?", "    by === 'weight'\n      ?", [T_RULE], None),
    ("31q the plan says it", GENERATE,
     "    if (line) reasons.push(line);\n", "", [T_RULE], None),
    ("31r the plan reads what is outgrown", GENERATE,
     "    excluded: new Set([...swappedOut, ...away]),\n    outgrown,\n",
     "    excluded: new Set([...swappedOut, ...away]),\n", [T_RULE], None),
    ("31s a slot's pick follows the rule", GENERATE,
     "      focus +\n      loadedRule -", "      focus -", [T_RULE], None),
    ("31t the coach's extra work follows it too", GENERATE,
     "    loadedVersionShift(exercise, candidateIds, outgrown, picker.swappedAway) -",
     "    0 -", [T_RULE], None),
    ("31u ... reading what is outgrown", GENERATE,
     "    outgrown: outgrownMoves(input.history),\n", "", [T_RULE], None),
    ("31v the split squat's loaded version", RULE,
     "  'bulgarian-split-squat': ['dumbbell-bulgarian-split-squat'],\n", "", [T_RULE], None),
    ("31w the leg-press calf raise counts as loaded", RULE,
     "  'standing-calf-raise': ['standing-calf-raise-machine', 'leg-press-calf-raise'],",
     "  'standing-calf-raise': ['standing-calf-raise-machine'],", [T_RULE], None),

    # The review of round L.
    ("R1 a kept swap away holds the bodyweight move", RULE,
     "  if (swappedAway.has(bodyweightId)) return false;\n", "", [T_RULE], None),
    ("R1b ... in the plan's picks", GENERATE,
     "    excluded: new Set([...swappedOut, ...away]),\n    outgrown,\n    swappedAway: swappedOut,\n",
     "    excluded: new Set([...swappedOut, ...away]),\n    outgrown,\n", [T_RULE], None),
    ("R2 the autosave keeps the weights stored", AUTOSAVE,
     "          await store.saveLocation(location, { keepLoading: true });",
     "          await store.saveLocation(location);", [T_SCREEN, T_AUTOSAVE], None),
    ("R2b ... as they are when the write lands", STORE,
     "      options.keepLoading && stored ? { ...location, loading: stored.loading } : location,",
     "      location,", [T_SCREEN, T_AUTOSAVE], None),
    ("R2c the autosave writes no place it did not edit", AUTOSAVE,
     "        const edited = (place: typeof location) => ({ ...place, loading: {}, updatedAt: '' });",
     "        const edited = (place: typeof location) => place;", [T_SCREEN, T_AUTOSAVE], None),
    ("R2d ... its stamp no edit", AUTOSAVE,
     "({ ...place, loading: {}, updatedAt: '' })", "({ ...place, loading: {} })", [T_AUTOSAVE], None),
    ("R3 the line not for an entry a swap put in", GENERATE,
     "    if (entry.standsFor !== undefined) continue;\n", "", [T_RULE], None),
    ("R3b ... nor where the bodyweight move could not stand", GENERATE,
     "    if (!bodyweight || isBlocked(checkExerciseFit(bodyweight, context))) continue;",
     "    if (!bodyweight) continue;", [T_RULE], None),
    ("R3c ... read at this place", RULE,
     "    if (record.locationId !== locationId) continue;\n", "", [T_RULE], None),
    ("R4 the calf machine is a machine", DEFINE,
     "  if ([...MACHINE_EQUIPMENT_IDS, 'smith-machine'].includes(lead)) return 'machine';",
     "  if (['smith-machine'].includes(lead)) return 'machine';", [T_MACHINE], None),
    ("R4b ... a custom exercise on it takes a stack", CUSTOM,
     "const STACK_EQUIPMENT = new Set([...CABLE_EQUIPMENT_IDS, ...MACHINE_EQUIPMENT_IDS]);",
     "const STACK_EQUIPMENT = new Set([...CABLE_EQUIPMENT_IDS]);", [T_MACHINE], None),
    ("R4c ... and it is a gym's", DEFINE,
     "    ...MACHINE_EQUIPMENT_IDS,\n    'dip-station',", "    'dip-station',", [T_MACHINE], None),
    ("R5 a band keeps its own line", LOADING,
     "    hasNoLoad(exercise) && exercise.load !== 'band'\n      ? { ...exercise, load: 'bodyweight' }",
     "    hasNoLoad(exercise)\n      ? { ...exercise, load: 'bodyweight' }", [T_TAB], None),
    ("R6 no Weights panel with nothing in it", PANELS,
     "      {open === 'plates' && weightsTab ? (", "      {open === 'plates' ? (", [T_TAB], None),
    ("R6b ... nor one a request opens", PANELS,
     "    if (openRequest && weightsTab) setOpen(openRequest.panel);",
     "    if (openRequest) setOpen(openRequest.panel);", [T_TAB], None),
    ("R6c the hint opens nothing on a move with no load", SCREEN,
     "                hasNoLoad(exercise) && !(draftWeight !== null && draftWeight > 0)\n                  ? undefined\n                  :",
     "                false\n                  ? undefined\n                  :", [T_SCREEN], None),
    ("R6d a weight held says what it is", PANELS,
     "                        ? 'Held or worn, on top of your own weight.'",
     "                        ? 'No plates to load.'", [T_TAB], None),
    ("R7 a failed switch says so", EDITOR,
     "        {problem ? (\n          <p className={styles.panelNote} role=\"alert\">\n            {problem}\n          </p>\n        ) : null}\n      </div>\n    );\n  }\n\n  const update",
     "      </div>\n    );\n  }\n\n  const update", [T_TAB], None),
    ("R8 no place record for a move with no load", LOADING,
     "  if (!loading || hasNoLoad(exercise)) return null;", "  if (!loading) return null;", [T_TAB], None),
    ("R8b ... and a weight held's step", LOADING,
     "      : hasNoLoad(exercise) && exercise.load !== 'band'\n        ? { load: 'bodyweight' }\n        : exercise,",
     "      : exercise,", [T_TAB], None),
    ("R9 kettlebells named as such", PLACES,
     "      hand={hand}\n", "", [T_TAB], None),

    # The re-check of the review's fixes.
    ("K2 the coach names no heavier version of the move", COACH,
     "        !heavier.has(candidate.id) &&\n", "", [T_COACH], None),
    ("K3 the workout names the hand weights for the place", SCREEN,
     "          hand={handWeightsAt(currentLocation?.equipment ?? []) ?? undefined}\n", "", [T_SCREEN], None),
    ("K3b ... through the panel", PANELS,
     "              hand={hand}\n", "", [T_SCREEN], None),
    ("K3c ... and its summary line", EDITOR,
     "describeSpec(spec, units, hand ?? handDefault)", "describeSpec(spec, units)", [T_TAB], None),
    ("K3d ... which names them", LOADING,
     "  const what = spec.kind === 'stack' ? 'Stack' : HAND_NAMES[hand].many;",
     "  const what = spec.kind === 'stack' ? 'Stack' : 'Dumbbells';", [T_TAB], None),
    ("K4 a weights save leaves a waiting Settings edit on screen", AUTOSAVE,
     "    .map((location) => JSON.stringify({ ...location, loading: null, updatedAt: null }))",
     "    .map((location) => `${location.id}:${location.updatedAt}`)", [T_SCREEN], None),
    ("K5 a machine's plates for every exercise on it", EDITOR,
     "    return onSaveMachine ? onSaveMachine(specs) : onSave(specs[key] ?? null);",
     "    return onSave(specs[key] ?? null);", [T_TAB], None),
    ("K5b ... that is on plates", LOADING,
     "    if (current?.kind === 'plates') specs[id] = { ...current, perSide: [...perSide] };",
     "    if (current?.kind === 'plates' && id === exerciseId) specs[id] = { ...current, perSide: [...perSide] };",
     [T_TAB], None),
    ("K6 a machine of the lifter's own takes the switch", LOADING,
     "    exercise.id.startsWith(CUSTOM_ID_PREFIX) &&\n    exercise.load === 'stack' &&", "    false &&",
     [T_TAB], None),
    # The third pass.
    ("T1 a loaded version waits wherever its bodyweight move is", GENERATE,
     "    // A loaded version waits until its bodyweight move loads (item 31).\n    .filter((exercise) => !waitsForBodyweight(exercise, outgrown, picker.swappedAway, lifterChose))",
     "    // A loaded version waits until its bodyweight move loads (item 31).\n    .filter(\n      (exercise) =>\n        !waitsForBodyweight(exercise, outgrown, picker.swappedAway, lifterChose) ||\n        !exercisesByPattern(slotSpec.pattern).some(\n          (other) =>\n            other.id === BODYWEIGHT_VERSION[exercise.id] &&\n            !chosenIds.has(other.id) &&\n            !isBlocked(checkExerciseFit(other, picker.context)),\n        ),\n    )",
     [T_RULE, T_SWAP, T_ONLY], None),
    ("T1b ... in the coach's extra work too", GENERATE,
     "    .filter((exercise) => !waitsForBodyweight(exercise, outgrown, picker.swappedAway, lifterChose))",
     "    .filter(\n      (exercise) =>\n        !waitsForBodyweight(exercise, outgrown, picker.swappedAway, lifterChose) ||\n        !allExercises().some(\n          (other) =>\n            other.id === BODYWEIGHT_VERSION[exercise.id] &&\n            other.primaryMuscles.includes(muscle) &&\n            !chosenIds.has(other.id) &&\n            !isBlocked(checkExerciseFit(other, picker.context)),\n        ),\n    )",
     [T_SWAP, T_RULE], 1),
    ("T2 the coach keeps the leg-press calf raise as a lighter swap", COACH,
     "    (LOADED_VERSIONS[exercise.id] ?? []).filter((id) => ADDS_TO_BODYWEIGHT.has(id)),",
     "    LOADED_VERSIONS[exercise.id] ?? [],", [T_COACH, T_CALF], None),
    ("T3 no switch on a stack-only machine of the lifter's own", LOADING,
     "    (exercise.equipment[0] ?? []).some((id) => machines.has(id))", "    true", [T_CABLE], None),
    ("T4 a deletion waits for the place writes under way", STORE,
     "    await this.afterPlaceWrites(async () => {\n      await this.withBarcodeLock",
     "    await (async (work: () => Promise<void>) => work())(async () => {\n      await this.withBarcodeLock",
     [T_PLACES], None),
    ("K7 a request opens the Weights once", PANELS,
     "    setHandledAt(openRequest?.at ?? null);\n", "", [T_TAB], None),
    # The fourth pass.
    ("F1 a loaded version waits as no candidate, in a slot's pick", GENERATE,
     "    // A loaded version waits until its bodyweight move loads (item 31).\n    .filter((exercise) => !waitsForBodyweight(exercise, outgrown, picker.swappedAway, lifterChose))\n",
     "", [T_RULE, T_ONLY], None),
    ("F1b ... and in the coach's extra work", GENERATE,
     "    .filter((exercise) => !waitsForBodyweight(exercise, outgrown, picker.swappedAway, lifterChose))\n",
     "", [T_TO_LOADED, T_RULE, T_SWAP], 1),
    ("F1c one the lifter chose never waits", RULE,
     "  if (bodyweight === undefined || chosen.has(exercise.id)) return false;",
     "  if (bodyweight === undefined) return false;", [T_RULE, T_TO_LOADED], None),
    ("F1d ... a favourite", GENERATE,
     "  new Set([...picker.preferredIds, ...(picker.chosen ?? [])]);",
     "  new Set([...(picker.chosen ?? [])]);", [T_RULE], None),
    ("F1e ... the lift to push", GENERATE,
     "  return new Set([...swaps.map((swap) => swap.to), ...(push ? [push.exercise.id] : [])]);",
     "  return new Set([...swaps.map((swap) => swap.to)]);", [T_RULE], None),
    ("F1f the plan's picks know the lift to push", GENERATE,
     "    chosen: chosenBy([], push),\n", "", [T_RULE], None),
    ("F2 a kept swap's own exercise is the lifter's choice", GENERATE,
     "  return new Set([...swaps.map((swap) => swap.to), ...(push ? [push.exercise.id] : [])]);",
     "  return new Set([...(push ? [push.exercise.id] : [])]);", [T_TO_LOADED, T_BACK], None),
    ("F2b ... for the coach's extra work", GENERATE,
     "    chosen: chosenBy(input.swaps ?? [], null),\n", "", [T_TO_LOADED, T_BACK], None),
    ("F2c the plan judges its own picks as if no swap were kept", GENERATE,
     "    chosen: chosenBy([], push),", "    chosen: chosenBy(constraints.swaps ?? [], push),",
     [T_RULE], None),
    ("F3 a lifter's own machine is any chip of its equipment", LOADING,
     "    (exercise.equipment[0] ?? []).some((id) => machines.has(id))",
     "    (exercise.equipment[0] ?? []).slice(0, 1).some((id) => machines.has(id))", [T_ORDER], None),
    ("F4 setup's place writes wait their turn", STORE,
     "    const planned = await this.afterPlaceWrites(\n",
     "    const planned = await (<T>(work: () => Promise<T>) => work())(\n",
     [T_PLACES], None),
    # The fifth pass.
    ("V1 setup reads what it began from in the same turn as its writes", STORE,
     "    const planned = await this.afterPlaceWrites(\n      async (): Promise<{ begun: SetupState; leftOut: Identified[] } | null> => {\n        const begun = await this.readSetupState(db);",
     "    const early = await this.readSetupState(db);\n    const planned = await this.afterPlaceWrites(\n      async (): Promise<{ begun: SetupState; leftOut: Identified[] } | null> => {\n        const begun = early;",
     [T_SETUP_KEEPS], None),
    ("V3 Settings lists a lifter's own machine with its chips in any order", PLACES,
     "(exercise.id.startsWith(CUSTOM_ID_PREFIX)\n            ? groupGivesLoad(group, exercise.load)\n            : loadOfGroup(group) === exercise.load)",
     "loadOfGroup(group) === exercise.load", [T_SETTINGS_ORDER, T_SECTIONS], None),
    ("V4 the lift to push stands only while its push runs, never in a deload week", GENERATE,
     "    chosen: chosenBy([], push),",
     "    chosen: chosenBy([], push ?? pushDay({ profile, history, now, deload: false })),",
     [T_RULE], None),
    # The sixth pass.
    ("VI1 a favourite moves in the coach's extra work as in a slot's pick", GENERATE,
     "    loadedVersionShift(exercise, candidateIds, outgrown, picker.swappedAway) -",
     "    (chosenIn(picker).has(exercise.id) ? 0 : loadedVersionShift(exercise, candidateIds, outgrown, picker.swappedAway)) -",
     [T_FAV_BOTH], None),
    ("VI2 Settings lists a lifter's own move only through a chip that gives its load", PLACES,
     "            ? groupGivesLoad(group, exercise.load)\n", "            ? true\n",
     [T_SECTIONS], None),
    ("VI3 ... a group with no chips gives none", CUSTOM,
     "  return gives !== undefined && group.some((id) => gives.has(id));",
     "  return gives !== undefined && (group.length === 0 || group.some((id) => gives.has(id)));",
     [T_SECTIONS], None),
    ("VI4 ... any one of its chips gives it", CUSTOM,
     "  return gives !== undefined && group.some((id) => gives.has(id));",
     "  return gives !== undefined && group.every((id) => gives.has(id));",
     [T_SECTIONS, T_SETTINGS_ORDER], None),
    # The seventh pass.
    ("VII1 a swap back keeps out every loaded version of the move, in the plan and the coach", GENERATE,
     "    withSwapsBack(swaps, favourites)\n      .filter((swap) => {", "    swaps\n      .filter((swap) => {",
     [T_SWAP_BACK_PLAN, T_RULE, T_BACK], None),
    ("VII2 ... and puts the bodyweight move in for each", GENERATE,
     "  const kept = withSwapsBack(constraints.swaps ?? [], preferredIds);",
     "  const kept = constraints.swaps ?? [];", [T_SWAP_BACK_PLAN, T_OTHER_SWAP], None),
    ("VII3 ... and says so", GENERATE,
     "  const kept = withSwapsBack(swaps, favourites);", "  const kept = swaps;",
     [T_SWAP_BACK_PLAN], None),
    ("VII4 the coach moves a bodyweight move swapped to from anything else", GENERATE,
     "    loadedVersionShift(exercise, candidateIds, outgrown, picker.swappedAway) -",
     "    (picker.chosen?.has(exercise.id) ? 0 : loadedVersionShift(exercise, candidateIds, outgrown, picker.swappedAway)) -",
     [T_SWAP_BACK_PLAN], None),
    ("VII5 a swap back is from one of the move's own loaded versions", RULE,
     "  LOADED_VERSIONS[swap.to]?.includes(swap.from) ?? false;",
     "  LOADED_VERSIONS[swap.to] !== undefined;", [T_RULE, T_SWAP_BACK_PLAN], None),
    ("VII6 the swaps the lifter keeps come first, the swap back after them", RULE,
     "  return [...swaps, ...added];", "  return [...added, ...swaps];", [T_RULE, T_OTHER_SWAP], None),
    ("VII8 a bar's plates come with a bar, never the rack", CUSTOM,
     "  barbell: new Set(['barbell', 'ez-bar', 'trap-bar', 'smith-machine']),",
     "  barbell: BAR_EQUIPMENT,", [T_RACK], None),
    # The eighth pass.
    ("VIII1 a swap back never covers a favourite", RULE,
     "      if (id === swap.from || favourites.has(id) || covered.has(id)) continue;",
     "      if (id === swap.from || covered.has(id)) continue;", [T_FAV_BACK, T_RULE], None),
    ("VIII2 ... in the coach's extra work", GENERATE,
     "  const swappedOut = swappedOutIds(input.swaps ?? [], context, preferredIds);",
     "  const swappedOut = swappedOutIds(input.swaps ?? [], context);", [T_FAV_BACK], None),
    ("VIII3 ... nor in the plan", GENERATE,
     "  const swappedOut = swappedOutIds(constraints.swaps ?? [], context, preferredIds);",
     "  const swappedOut = swappedOutIds(constraints.swaps ?? [], context);", [T_FAV_BACK], None),
    ("VIII4 the first of an exercise's swaps that applies, the swap back after the lifter's own", GENERATE,
     "      if (isBlocked(checkExerciseFit(next, context))) continue;",
     "      if (isBlocked(checkExerciseFit(next, context))) return pick;", [T_OTHER_SWAP], None),
    ("VIII5 keeping the plan's own pick ends a swap back that covers it", STORE,
     "        ? withoutSwap(current, from).filter(\n            (swap) => !swapBackCovers(swap, from, this.favourites()),\n          )",
     "        ? withoutSwap(current, from)", [T_KEEP_OWN], None),
    ("VIII6 ... every loaded version it covers", RULE,
     "    id === swap.from || ((LOADED_VERSIONS[swap.to]?.includes(id) ?? false) && !favourites.has(id))",
     "    id === swap.from", [T_KEEP_OWN, T_RULE], None),
    # The ninth pass.
    ("IX1 keeping a favourite ends no swap back but its own", RULE,
     "    id === swap.from || ((LOADED_VERSIONS[swap.to]?.includes(id) ?? false) && !favourites.has(id))",
     "    id === swap.from || (LOADED_VERSIONS[swap.to]?.includes(id) ?? false)", [T_KEEP_FAV, T_RULE], None),
    ("IX2 ... as the store reads it", STORE,
     "            (swap) => !swapBackCovers(swap, from, this.favourites()),",
     "            (swap) => !swapBackCovers(swap, from),", [T_KEEP_FAV], None),
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
