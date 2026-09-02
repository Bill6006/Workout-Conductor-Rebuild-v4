# Data model

Everything the app knows lives in the user's browser. This document lists where each kind of
data lives, its schema owner, and the rules that protect it.

## Storage owners

| Data                        | Store                                | Owner                             | Notes                                                                    |
| --------------------------- | ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------ |
| User profile                | IndexedDB `profile` (key `current`)  | `src/core/validation/profile.ts`  | Goals, schedule, preferences, limitations, techniques, units, bodyweight |
| Location profiles           | IndexedDB `locations`                | `src/core/validation/location.ts` | Home, Gym, Travel, Custom; each owns its equipment list                  |
| Workout history             | IndexedDB `workouts`                 | Phase 5                           | Opaque records with an `id` until logging exists; backed up as-is        |
| Meta                        | IndexedDB `meta`                     | reserved                          | Migrations and future counters                                           |
| Small settings              | localStorage `wc.v1.settings`        | `src/core/validation/settings.ts` | Onboarding completion, last export, last import                          |
| Unfinished onboarding draft | localStorage `wc.v1.onboardingDraft` | `src/features/profile/draft.ts`   | Removed when setup finishes                                              |

The database is `workout-conductor`, version 1, opened by `src/core/storage/indexedDb.ts`.
Upgrades only ever add stores or indexes. A deployment never wipes IndexedDB.

## Schemas

Every schema is a Zod **loose object**: known fields are validated, unknown fields are kept.
That is what lets a backup written by a newer app version pass through an older one intact.

- `UserProfile` (`schemaVersion: 1`): `goals.primary` / `goals.secondary`, `experience`,
  `schedule.weeklyFrequency` (1-7), `schedule.typicalDurationMinutes` (15-180, becomes Default
  time), `schedule.availableDays`, `currentLocationId`, `exercisePreferences.preferred` /
  `.disliked` (exercise names, resolved by alias once the catalog exists),
  `limitations.painAreas` / `.shoulder` / `.avoidBarbellSquats` / `.notes`, `trainingStyle`,
  `techniques.supersets` / `.dropSets` / `.circuits`, `restStyle`, `units`, optional `bodyweight`,
  `createdAt`, `updatedAt`.
- `LocationProfile`: `id`, `name`, `kind` (home | gym | travel | custom), `equipment` (catalog ids
  from `src/catalog/equipment/equipment.ts`, normalized), `notes`, timestamps. `home` always
  exists and cannot be deleted; deleting the current location falls back to Home.
- `LocalSettings` (`schemaVersion: 1`): `onboardingCompletedAt`, `lastExportAt`, `lastImportAt`.
- `Backup` (`format: "workout-conductor-backup"`, `schemaVersion: 1`): `exportedAt`, `app`,
  `data.profile`, `data.locations`, `data.localSettings`, `data.workouts`.

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

Real profiles, exports, and history. The repository holds only source code, blank defaults, and
synthetic demo data; `scripts/privacy-scan.mjs` enforces it.
