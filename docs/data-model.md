# Data model

Everything the app knows lives in the user's browser. This document lists where each kind of
data lives, its schema owner, and the rules that protect it.

## Storage owners

| Data                        | Store                                | Owner                                   | Notes                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User profile                | IndexedDB `profile` (key `current`)  | `src/core/validation/profile.ts`        | Goals, schedule, preferences, limitations, techniques, units, bodyweight                                                                                                                                                 |
| Location profiles           | IndexedDB `locations`                | `src/core/validation/location.ts`       | Home, Gym, Travel, Custom; each owns its equipment list                                                                                                                                                                  |
| Workout history             | IndexedDB `workouts`                 | `src/core/validation/workoutRecord.ts`  | One record per finished workout; legacy imports add records with `source: legacy-import`                                                                                                                                 |
| Meta                        | IndexedDB `meta`                     | `src/core/state/appStore.ts`            | Legacy-import receipts; a diagnostic probe exists only during a save check                                                                                                                                               |
| Saved workouts              | IndexedDB `savedWorkouts`            | `src/core/validation/savedWorkout.ts`   | Named copies of a generated workout that load as a fresh session                                                                                                                                                         |
| Automatic backups           | IndexedDB `backups`                  | `src/core/state/appStore.ts`            | The newest three verified full snapshots (after workouts, before imports, manual)                                                                                                                                        |
| Custom exercises            | IndexedDB `customExercises`          | `src/core/validation/customExercise.ts` | User-created exercises, presented to the engines like catalog entries                                                                                                                                                    |
| Custom instructions         | IndexedDB `customInstructions`       | `src/core/validation/customExercise.ts` | Per-exercise setup, execution, cues, notes (keyed by exercise id)                                                                                                                                                        |
| Custom media                | IndexedDB `customMedia`              | `src/core/validation/customExercise.ts` | User-owned image or video as a size-capped data URL; never licensed production media                                                                                                                                     |
| Outbox                      | IndexedDB `outbox`                   | `src/core/storage/indexedDb.ts`         | Local writes the cloud copy has not received; one entry per record; never in a backup                                                                                                                                    |
| Cloud copy token and state  | IndexedDB `cloud`                    | `src/core/cloud/cloudSync.ts`           | The pasted token and the sync cursor; this device only; never in a backup                                                                                                                                                |
| Place barcodes              | IndexedDB `device`                   | `src/core/validation/placeBarcode.ts`   | A place's membership barcode: the picture as added, the code when the phone read it, and the pop-up choice; key `barcode:<place id>`; this device only; never in the cloud copy, a backup or a snapshot (Maintenance 18) |
| Small settings              | localStorage `wc.v1.settings`        | `src/core/validation/settings.ts`       | Onboarding completion, last export, last import, the device id for the cloud copy                                                                                                                                        |
| Unfinished onboarding draft | localStorage `wc.v1.onboardingDraft` | `src/features/profile/draft.ts`         | Removed when setup finishes                                                                                                                                                                                              |
| Current session             | localStorage `wc.v1.session`         | `src/core/state/session.ts`             | The preview or active workout; never touched by cleanup                                                                                                                                                                  |
| Workouts kept for recovery  | localStorage `wc.v1.sessionRecovery` | `src/core/state/session.ts`             | A stored workout that could not be read back, moved aside before a fresh one replaced it; newest three; never touched by cleanup; device only (Maintenance 17)                                                           |

The database is `workout-conductor-v4`, version 6, opened by `src/core/storage/indexedDb.ts`. Upgrades only add stores.
Every GitHub Pages project of one account shares the same origin and IndexedDB is per origin, so
the name carries the app generation. If a same-named database already exists at a higher
version (another app on the origin, or a newer build), opening recovers by adding the missing
stores one version up without removing any store.
Version 2 added the three custom-content stores, version 5 the `outbox` and `cloud` stores, and
version 6 the `device` store;
upgrades only ever add stores or indexes, and the upgrade test proves version-1 data survives.
A same-named database at exactly our version with stores missing is upgraded one version up.
A deployment never wipes IndexedDB.

The wrapper is the single durable-data owner, and the cloud copy's outbox sits behind it: every
put, delete, and clear on a mirrored store writes its outbox entry in the same transaction, and
records that arrive from the cloud are written through `applyRemote` and `applyRemoteDelete`,
which touch no outbox. See `docs/cloud-copy.md`.

## Schemas

Every schema is a Zod **loose object**: known fields are validated, unknown fields are kept.
That is what lets a backup written by a newer app version pass through an older one intact.

- `UserProfile` (`schemaVersion: 1`): `goals.primary` / `goals.secondary`, `experience`,
  `schedule.weeklyFrequency` (1-7), `schedule.typicalDurationMinutes` (15-180, becomes Default
  time), `schedule.availableDays`, `currentLocationId`, `exercisePreferences.preferred` /
  `.disliked` (exercise names, resolved by alias once the catalog exists),
  `limitations.painAreas` / `.shoulder` / `.avoidBarbellSquats` / `.notes`, `trainingStyle`
  (one of the three original styles, always readable by an older copy of the app), optional
  `programStyle` (the choice, Auto and the four newer styles included; Maintenance 15), optional
  `goals.bodyweight` (lose | hold | gain; the Losing fat switch),
  `techniques.supersets` / `.dropSets` / `.circuits`, `restStyle`, `units`, optional `bodyweight`,
  `createdAt`, `updatedAt`.
- `LocationProfile`: `id`, `name`, `kind` (home | gym | travel | custom), `equipment` (catalog ids
  from `src/catalog/equipment/equipment.ts`, normalized), `notes`, `loading` (what the place can load, keyed by exercise id, `dumbbells`, or `plates`: ranges with a step, or plates per side; Maintenance 12), timestamps. `home` always
  exists and cannot be deleted; deleting the current location falls back to Home.
- `LocalSettings` (`schemaVersion: 1`): `onboardingCompletedAt`, `lastExportAt`, `lastImportAt`.
- `Backup` (`format: "workout-conductor-backup"`, `schemaVersion: 2`): `exportedAt`, `app`,
  `data.profile`, `data.locations`, `data.localSettings`, `data.workouts`, `data.customExercises`,
  `data.customInstructions`, `data.customMedia`, `data.savedWorkouts`, and `data.meta`. Schema 1
  files are migrated forward on import (the empty `meta` list is added); unknown fields are kept
  at every level. See `docs/backup-and-restore.md`.
- `CustomExercise` (`id` starts with `custom-`), `CustomInstruction` (keyed by exercise id), and
  `CustomMedia` (`source: "user"`, data URL, at most 3 MB).

## Save safety

Critical saves go through `putVerified` (`src/core/storage/verifiedSave.ts`): write, read back,
compare structurally, and only then return a receipt (store, id, verifiedAt, bytes). If the
read-back differs, the previous record is restored and a `SaveVerificationError` is thrown, so
the app never reports a save that did not land. The last receipt is visible under Settings,
Diagnostics.

## Backup and restore

- Export builds an exact snapshot and hands the user a JSON file; nothing leaves the device.
- Import parses and validates the file, shows a preview (exported date, app version, profile
  goal, place and workout counts, newer-version warning), and only applies on confirmation.
- Restore snapshots the current stores first, writes every record with verification, and rolls
  the snapshot back if any write fails. The pre-import data is never lost.

## What never goes to GitHub

Real profiles, exports, and history, the cloud copy's token, and a membership barcode. The repository holds only source
code, blank defaults, and synthetic demo data; `scripts/privacy-scan.mjs` enforces it, including
a rule against JWT-shaped tokens anywhere and against any libSQL host in the bundle other than the
owner's own database URL.
