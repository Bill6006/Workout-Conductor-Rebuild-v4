# Backup, restore, and data safety

Everything the app knows lives in the browser on the phone: IndexedDB `workout-conductor-v4`
(profile, places, workouts, notes and cues, custom exercises, your demonstrations, saved
workouts, meta, automatic backups, a place's membership barcode, and, for the optional cloud copy,
an outbox and the cloud store: the pasted token with its mark and log, the database address,
the walk's place in the cloud copy, and when this database was made)
and small localStorage keys: settings (with the device's id for the cloud copy), an unfinished
onboarding draft and the current session; second copies that outlive a cleared database (the
cloud token with its mark and log, the database address, and each place's barcode, its picture
within a budget or else its code); plus, only if a stored workout ever could not be read back,
the copies kept for recovery.
Nothing is uploaded anywhere unless the owner pastes a database token into Settings > Cloud copy,
and then only to the owner's own database at the URL shown there (`docs/cloud-copy.md`). No user
data is ever committed to this repository.

## Files you can export

| File             | Format id                    | Holds                                                                                                                  |
| ---------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Full Backup JSON | `workout-conductor-backup`   | profile, places, local settings, workouts, notes and cues, custom exercises, your demonstrations, saved workouts, meta |
| History JSON     | `workout-conductor-history`  | workouts only                                                                                                          |
| Settings JSON    | `workout-conductor-settings` | profile, places, local settings                                                                                        |

Only a Full Backup JSON can be imported. History and settings files are for other tools. No
export carries the cloud copy's token, its sync state, the outbox, or the device id. No export or
automatic backup carries a place's membership barcode either, and a restore leaves the barcode on
the phone as it is (Maintenance 18).

A restore writes through the same durable-data owner as everything else, so with a token on the
device the restored records are queued for the cloud copy. Since Maintenance 25 a restore never
cuts the cloud copy back: the records the backup lacks leave this phone only, with nothing queued
to delete them there, and each restored record reaches the cloud copy as of its own time, or the
backup's when it has none. A version the cloud copy changed later stays, and this phone takes it;
the next sync walks the whole cloud copy again, so anything there that the backup lacks comes back
too. The preview says so when the cloud copy is on.

## When the browser clears the phone's storage

Chrome on Android can clear an installed app's database (with its cache and service worker) when
the phone runs short of space, keeping its local storage; it did so on the owner's phone. Since
Maintenance 25:

- The app asks the browser to keep its storage each time it opens (Settings, Storage shows
  whether it is kept).
- The cloud token, the database address and each place's barcode are kept twice, in the database
  and in local storage, and each copy heals the other when the app opens. A barcode's second copy
  holds its picture within a budget (local storage is shared by every app on the origin), else its
  code; a big picture with no code read that cannot be shrunk, or finds the budget spent, has
  none, and the cloud card says so. Each change touches
  only its own barcode's entry, so a second window never writes its old list back, and barcode
  changes and the second copy's upkeep as the app opens or reloads take turns, across the app's
  windows too where the browser has Web Locks.
- With the cloud copy on, a phone with an empty database shows "Bringing your data back" in place
  of setup until its first walk of the copy is done. The first sync pulls everything before it
  pushes anything, and a sync whose pull fails pushes nothing.
- Until that first walk is done, a record this phone wrote before the clearing comes back over
  one made here since, and a change waiting to go for it is dropped: setup's defaults never
  overwrite the history. This holds for anything changed in that time, so what is set up or
  changed while waiting (offline, "Set up anyway") is replaced by the cloud copy's records when
  the walk is done. The walk ends this rule for good; switching databases never wakes it again.
- A write the cloud copy refuses, because it holds a newer version, is not counted as sent: this
  phone takes the cloud's version, unless a change made here since waits to go. When the cloud's
  version cannot be fetched the change stays waiting, so "0 changes waiting" means the two agree.
- A restart of the walk (a token entered again, a restore, a database switched) made while a
  sync runs stands: the sync never writes its old place in the walk back over it.
- Settings, Cloud copy names what the copy never holds: the barcodes and your own demonstrations
  (in the backups you export).

## Schema and migration

The Full Backup schema version is 2. Every object is parsed loosely, so fields this version does
not know are kept exactly as they are, on export and on import, at every level. Older versions
are migrated forward before validation:

| From | To  | Change                                            |
| ---- | --- | ------------------------------------------------- |
| 1    | 2   | Adds the empty `data.meta` list; nothing removed. |

A backup from a newer app version is imported as it is and flagged in the preview.

Maintenance 20 changed no schema version. A held exercise (Plank, Farmer Carry) keeps its seconds
in the set's `reps`, and a rating may carry an optional `joint`; an older copy of the app reads
both, and an unknown joint reads as none.

The database is at version 6. Upgrades only ever add stores; a deployment never wipes data. If
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
