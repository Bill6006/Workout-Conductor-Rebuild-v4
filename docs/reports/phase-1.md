# Phase 1 report - Product Foundation and First Useful Live Preview

Status: **YELLOW** (awaiting the owner's Android review). Only the owner can mark this GREEN.

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/

## Delivered

- **Step-by-step onboarding** (7 short steps): goals, experience and schedule, places, exercise
  preferences, limitations, style and techniques, units and bodyweight. Defaults follow the plan
  (Build Muscle, hybrid, supersets and drop sets on, circuits off). A first run can also "Use
  defaults and skip setup". Drafts survive a reload; conflicting answers are explained, not
  accepted. Everything stays editable later.
- **Profile and goals, preferences and limitations, settings**: one set of editors
  (`src/features/profile/editors`) is shared by onboarding and Settings, so there is exactly
  one editing model. Settings autosaves with a visible "Saved and verified" status.
- **Equipment and location profiles**: Home always exists and owns the home equipment; Gym is
  created with a full commercial preset when the user has gym access; Travel and Custom places
  can be added on the Plan tab with a grouped equipment picker. The current location can be
  switched and drives the Today preview.
- **localStorage for small settings** (`wc.v1.settings`, onboarding draft) and an **IndexedDB
  durable-data foundation** (`workout-conductor` v1: profile, locations, workouts, meta) behind
  one promise wrapper.
- **Schema validation** with Zod loose objects everywhere, so unknown fields from a newer version
  survive a round trip.
- **Write/read-back save-verification helper** (`putVerified`): every profile and location save
  is written, read back, compared structurally, and rolled back on mismatch. The last receipt is
  visible under Settings, Diagnostics.
- **Export/import foundation**: Export Full Backup JSON to a file on the device; Import shows a
  preview (date, version, goal, counts, newer-version warning) and restores with verified writes
  and automatic rollback of the pre-import snapshot on any failure.
- **Today dashboard**: date, a clearly labeled **synthetic demo workout** built from the profile
  and the current location's equipment (goal-driven template, equipment filtering, disliked and
  preferred exercises, shoulder / knee / lower-back / barbell-squat limitations, superset pairing
  and one drop set when enabled, "Default: N min" length, "Why this workout" with compromises),
  a readiness placeholder for Phase 6, and a profile summary.
- Diagnostics moved to Settings: build marker, gate, storage status, record counts, last verified
  save, environment facts.

## Verification

| Check                                | Result                                                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint` / `npm run typecheck` | clean                                                                                                                                                                                                     |
| `npm run test:unit`                  | 95 passed across 17 files (schemas, IndexedDB, verified save, settings, backup, store, demo, onboarding, App flows, backup card)                                                                          |
| `npm run build`                      | ok, 18 precache entries; JS 350 KB raw / 105 KB gzip, CSS 21 KB                                                                                                                                           |
| `npm run privacy-scan`               | passed, 0 findings                                                                                                                                                                                        |
| `npm run verify-build`               | passed                                                                                                                                                                                                    |
| `npm run test:e2e` (local)           | 37 passed + 4 skipped by design: 11 flows on each of 412 px, 360 px, desktop (onboarding, settings persistence, places, export/import, navigation, overflow, PWA files) + capture flows on 412 px + 2 PWA |
| Deploy Pages run 33680317024         | success: verify job green on the Linux runner (all 41 browser tests), deploy 9 s                                                                                                                          |
| `npm run test:e2e` against live      | 41 passed against https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ (build marker `6de52d2 · Phase 1`)                                                                                             |
| Screenshots                          | 22 captures + preview sheet from the live build in `docs/screenshots/phase-1/`                                                                                                                            |

## Decisions and notes

- The demo workout lives in `src/features/today/demo/` and is deleted when the real generation
  engine arrives in Phase 3. It never pretends to be the engine: no weekly volume, no
  progression, no time fitting.
- The workout-length control is deliberately shown as a value ("Default: N min"), not a dropdown,
  until Phase 3 ships the single 15 / 30 / 45 / Default dropdown with real recalibration.
- Gym access is represented by the presence of the Gym location rather than a duplicate flag, so
  equipment has exactly one owner.
- Playwright runs with two workers everywhere: four parallel Chromium contexts crashed the browser
  on the development machine, and CI already uses two.

## Next

Owner review on Android at the permanent link. On `GREEN - NEXT PHASE`, Phase 2 starts: the
structured exercise catalog, muscle and movement-pattern models, limitation and joint-stress tags,
progression families, conflict validation, alternative-ranking foundation, media manifest and
licensing register, custom exercise and custom-media schemas.
