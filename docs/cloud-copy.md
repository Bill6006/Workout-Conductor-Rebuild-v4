# Cloud copy

An optional copy of the app's durable data in a database the owner runs (Turso, libSQL over
HTTPS). The phone stays the source of truth; the copy is a mirror that any device can pull onto
itself by installing the app and pasting the same token. Off until a token exists on the device.

## What goes where

| Thing                                 | Where it lives                                                                       | Ever in a backup? | Ever in the repository? |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ----------------- | ----------------------- |
| Database address                      | IndexedDB store `cloud`, record `config`; the shipped default is `DEFAULT_CLOUD_URL` | no                | yes (not a secret)      |
| Token                                 | IndexedDB store `cloud`, record `token`, on the device that pasted it                | never             | never                   |
| Sync state (cursor, last sync, retry) | IndexedDB store `cloud`, record `state`                                              | never             | never                   |
| Outbox (writes not yet pushed)        | IndexedDB store `outbox`, one entry per record, latest operation wins                | never             | never                   |
| Device id                             | localStorage `wc.v1.settings.deviceId`; stripped from every export                   | never             | never                   |

The token never appears in source, the built bundle, tests, CI, or logs. The privacy scan fails
the build on any JWT-shaped string in the repository or the bundle, and on any libSQL host in
the bundle other than the owner's own URL.

## The shared schema

The database already exists and its schema is fixed; the app never creates or alters tables.

```
records(app, store, id, day, body, updated_at, deleted, device_id, synced_at)  primary key (app, store, id)
devices(device_id, app, label, first_seen, last_sync)
schema_meta
```

The database is shared with another of the owner's apps. This app writes only rows where
`app = 'workout-conductor'` and reads only those. A row is one record: `store` is the IndexedDB
store name, `id` the record id, `body` the record as JSON, `day` the workout date for workout
records, `updated_at` the record's own timestamp (profile, places, custom exercises, notes:
`updatedAt`; workouts: `completedAt` or `startedAt`; saved workouts: `createdAt`) or the sync
time for meta records, `deleted = 1` for a tombstone, `device_id` the writer, `synced_at` the
time the writer pushed it.

## Which stores are mirrored

`profile`, `locations`, `workouts`, `meta`, `customExercises`, `customInstructions`, and
`savedWorkouts`. Never `customMedia` (the owner's demonstrations stay on the device), never
`backups` (automatic local snapshots), never the outbox or the cloud store themselves.

## The outbox

The IndexedDB wrapper is the single durable-data owner, so the outbox sits behind it
(`src/core/storage/indexedDb.ts`). Every `put` and `delete` on a mirrored store writes its
outbox entry in the same transaction; `clear` writes a tombstone entry for every record it
removes. A record that arrives from the cloud is written with `applyRemote` or
`applyRemoteDelete`, which touch no outbox, so a pull never re-enqueues what it applied.

## Push

`pushOutbox` in `src/core/cloud/cloudSync.ts` sends the outbox oldest first in batches of 50 as
one libSQL write batch: an upsert for a record that still exists, a tombstone for one that does
not. The upsert's `ON CONFLICT ... WHERE excluded.updated_at >= records.updated_at` keeps a
newer row from another device. An outbox entry is removed only if it is still exactly what was
sent, so a write that landed during the push stays queued. Pushes run about 1.5 seconds after
the last local write, on every scheduled pull, and on "Sync now".

## Pull

`pullRemote` walks rows of this app newer than a cursor (`synced_at`, then `id`), 500 per page,
or every row when the cursor is empty or the caller asks for the whole walk. On a device that
has never pulled, every row wins, including over onboarding defaults the device just wrote,
whose outbox entries are dropped; that is how a fresh install with a token restores everything.
On every other walk a pending local change wins, then the newer of the two timestamps;
tombstones delete locally.

Rows this device wrote itself are the same data it holds, so they change nothing while the
record is still here, a change to it is waiting, or the row is the device's own tombstone. A
record that has vanished from the device comes back from its own row: that is how a device
recovers its own history, and it is the case that failed before Maintenance 10.

The automatic pull runs when the app opens, every fifteen minutes, and when the device comes
back online, and is incremental. "Sync now" walks every row from the beginning under the same
rules, so a record the device lost comes back with one tap. Entering a token again for the
same database restarts the walk while the device remembers it has synced (`restartPull`), and
so does a database copy of the token having to be written again from the phone's copy. A
device whose cursor is empty pulls before it pushes; every other sync pushes first.

## Offline, failures, and retries

Offline, a sync does nothing and the outbox waits. A failed sync records the error and a delay
that doubles from thirty seconds to a ten-minute cap; "Sync now" ignores the delay. Nothing is
lost either way: the outbox is the queue, and it is part of the same IndexedDB as the data.

## Devices

The device id is generated once per install and registered in `devices` on every sync with a
short label (for example "Android · Chrome"), `first_seen`, and `last_sync`. It is stripped
from exports and never restored from a backup, so a restore on another device cannot make two
devices claim the same id.

## Settings > Cloud copy

The card shows the database address, whether a token is saved on this device, one status line
(last sync, last error, or offline), the pending count, "Sync now", "Change database", and
"Remove token". Removing the token turns the copy off; the outbox is kept and pushes when a
token returns. When the token was written again from its other copy, or is missing from both,
the card says so with the date in one notice line, and the Token fact reads "Missing" rather
than "Not set". The Storage card lists the token log.

## The token on the device

`src/core/cloud/tokenVault.ts` keeps the token in two independent places: the `cloud` store of
IndexedDB and the app's local storage, a different storage engine in the same browser. A save
writes the database copy through the verified-save helper and reads it back before it counts,
then writes the local copy and reads that back; a local copy that would not stick is noted in
the log rather than fatal. When the app opens and before every sync, `resolveToken` finds the
token in either copy and writes the missing one again from the other. A database that lost the
token gets the whole history pulled again, since it may have lost more. Both copies gone after
a token was saved here is said once, with when it was last seen, not on every open. The first
run of a build with the vault on a device that already had a token writes the second copy and
walks the history once.

Beside the copies sit a mark (when the token was saved and when it was last found) and a log of
at most eight events: saved, restored, missing, removed, each dated and naming the layer. Neither
ever holds the token. The `cloud` store is never mirrored, and the local keys are never read by
the backup or the export. Every readwrite transaction in the wrapper asks for strict durability,
so a write is flushed before it counts.

## One database per person

A database belongs to one person. The address sits beside the token, both on the device and
neither in a backup or the built files, so somebody given the app can point it at a database of
their own. Adopting a database this device has never used is checked first, and only then:

- **It must answer.** Offline, or unreachable, the address is not saved on a promise.
- **It must carry the tables.** `inspectCloud` probes `sqlite_master`; a database without
  `records` or `devices` is reported as not set up rather than failing later mid-sync.
- **It must not already hold somebody else.** Rows for this app written by devices other than
  this one stop the save with a count, because two people on one database would write to the
  same fixed ids (the profile is always `current`) and overwrite each other. Going ahead is a
  second, deliberate tap.

Changing the address re-seeds: the cursor resets so the next sync pulls from the new database
first, and `seedOutbox` queues every mirrored record so the new database receives the whole
history rather than only what changes next. The old database keeps its own copy.

A **setup link** (`src/features/settings/setupLink.ts`) carries the address and token in the URL
fragment, which browsers never send to a server. The app applies it, rewrites the entry with
`replaceState` so it is gone from Back and from a reload, and lands on Settings, which reports
the outcome. It is watched for on arrival as well as at mount, because opening a link while the
app is already running only changes the hash. A link never accepts an occupied database; that
stays a deliberate tap. The link is a key to that person's history, so it goes to one person.

## Tests

`src/core/cloud/cloudSync.test.ts` and `src/core/state/appStore.cloud.test.ts` run against
`src/test/fakeCloud.ts`, an in-memory stand-in with the same schema and the same last-writer
rule: outbox drains, pull applies without re-enqueueing, tombstones propagate, offline queues,
no token means no network call, a fresh install restores, the device id stays out of exports.
`e2e/cloud.spec.ts` aborts every request to the database host at the browser, so CI and the
live run never reach it and never hold a token that works.
