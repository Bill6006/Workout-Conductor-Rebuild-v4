# Backup, restore, and data safety

Everything the app knows lives in the browser on the phone: IndexedDB `workout-conductor-v4`
(profile, places, workouts, notes and cues, custom exercises, your demonstrations, saved
workouts, meta, automatic backups) and three small localStorage keys (settings, an unfinished
onboarding draft, the current session). Nothing is uploaded anywhere, and no user data is ever
committed to this repository.

## Files you can export

| File             | Format id                    | Holds                                                                                                                  |
| ---------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Full Backup JSON | `workout-conductor-backup`   | profile, places, local settings, workouts, notes and cues, custom exercises, your demonstrations, saved workouts, meta |
| History JSON     | `workout-conductor-history`  | workouts only                                                                                                          |
| Settings JSON    | `workout-conductor-settings` | profile, places, local settings                                                                                        |

Only a Full Backup JSON can be imported. History and settings files are for other tools.

## Schema and migration

The Full Backup schema version is 2. Every object is parsed loosely, so fields this version does
not know are kept exactly as they are, on export and on import, at every level. Older versions
are migrated forward before validation:

| From | To  | Change                                            |
| ---- | --- | ------------------------------------------------- |
| 1    | 2   | Adds the empty `data.meta` list; nothing removed. |

A backup from a newer app version is imported as it is and flagged in the preview.

The database is at version 4. Upgrades only ever add stores; a deployment never wipes data. If
another app on the same origin already opened the database at a higher version, the app opens
it as it is and adds only the stores it is missing.

## Exact restore with verified rollback

Restoring (from a file or an automatic backup) always goes through the same steps:

1. Preview: what the file holds, its date and app version, migrations applied, counts, size.
2. Confirm.
3. The current data is written as an automatic backup first (reason: before an import).
4. Every store is cleared and every record written with a verified save: write, read back,
   compare. Unknown fields are written as they are.
5. If any write fails, every store is put back from the pre-restore snapshot, and each store is
   read again and compared to the snapshot. Only a verified rollback reports the original error;
   if the rollback cannot be verified, the error says so plainly.
6. The app reloads its state from disk and reports how many records each store received.

"Exact" is tested: a backup exported from one store, imported into another, and exported again
holds the same data, ignoring only the export and import timestamps.

## Automatic local backups

A verified snapshot of everything is written after each finished workout, before each import,
before each legacy import, and on "Back up now". The newest three are kept on the device (the
only automatic deletion in the app is of older snapshots beyond that). Each can be previewed and
restored from Settings exactly like a file. Snapshots include your demonstrations inline, so
three snapshots cost about three times the size of your media.

## Storage and save check

Settings shows the storage the browser reports (used and quota, when available), whether the
browser has agreed to keep the data, the count of every kind of record, and the last verified
save. "Run save check" writes one probe record to `meta`, reads it back, verifies it, and
removes it; nothing else is touched. "Keep data on this device" asks the browser for persistent
storage.

## Safe cleanup

"Clear temporary data" first shows what would be removed and what is kept. It only removes: a
leftover diagnostic probe, an onboarding draft once setup is complete, and automatic backups
beyond the kept three. Workout history, profile, places, notes and cues, custom exercises, your
demonstrations, saved workouts, the kept automatic backups, and an active session are never
removed, and a test proves their counts do not change.

## Optional legacy import

The app never needs an old file. If you have a JSON export of past workouts from another app,
"Import history from another app" in Settings reads it, shows a preview, and adds the workouts
after a confirmation. The accepted shape is forgiving:

- a top-level array of sessions, or an object with a `workouts`, `history`, or `sessions` list
  (also under `data`);
- a session has a date (`date`, `startedAt`, `start`, `completedAt`, or `timestamp`, as ISO text
  or milliseconds), an optional `title` or `name`, an optional `unit`/`units` (`lb` or `kg`), and
  an `exercises`, `entries`, or `items` list;
- an exercise has a `name` (or `exercise`, `exerciseName`, `title`) or an `exerciseId`/`id`, and
  a `sets` or `logs` list;
- a set has `weight` (or `load`, `lb`, `kg`), `reps` (or `repetitions`), an optional `rir` (or
  `reserve`), and an optional warm-up flag (`warmup`, `isWarmup`, or a `kind`/`type` containing
  "warm").

Exercises are matched to the library by id or by name (case, spacing, and punctuation ignored).
Anything that does not match is listed in the preview and skipped, never guessed. Weights in the
other unit are converted to the profile's unit and rounded to 0.5. Record ids come from the
session's date and position, so importing the same file twice adds nothing.

The import writes each record with a verified save after taking an automatic backup, keeps a
receipt in `meta` listing exactly the records it added, and shows an "Undo" per import that
removes exactly those records. If a write fails part-way, the records written so far are removed
before the error is shown.
