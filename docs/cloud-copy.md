# Cloud copy

An optional copy of the app's durable data in a database the owner runs (Turso, libSQL over
HTTPS). The phone stays the source of truth; the copy is a mirror that any device can pull onto
itself by installing the app and pasting the same token. Off until a token exists on the device.

## What goes where

| Thing                                 | Where it lives                                                        | Ever in a backup? | Ever in the repository? |
| ------------------------------------- | --------------------------------------------------------------------- | ----------------- | ----------------------- |
| Database URL                          | A constant in `src/core/cloud/model.ts`; shown in Settings            | no                | yes (not a secret)      |
| Token                                 | IndexedDB store `cloud`, record `token`, on the device that pasted it | never             | never                   |
| Sync state (cursor, last sync, retry) | IndexedDB store `cloud`, record `state`                               | never             | never                   |
| Outbox (writes not yet pushed)        | IndexedDB store `outbox`, one entry per record, latest operation wins | never             | never                   |
| Device id                             | localStorage `wc.v1.settings.deviceId`; stripped from every export    | never             | never                   |

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

`pullRemote` walks rows of this app newer than a cursor (`synced_at`, then `id`), 500 per page.
Rows this device wrote are skipped. On a device's first pull the cursor is empty and every row
wins, including over onboarding defaults the device just wrote, whose outbox entries are
dropped; that is how a fresh install with a token restores everything. On later pulls a
pending local change wins, then the newer of the two timestamps; tombstones delete locally.
Pulls run when the app opens, every fifteen minutes, when the device comes back online, and on
"Sync now". A first-time device pulls before it pushes; every later sync pushes first.

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

The card shows the database URL, whether a token is saved on this device, one status line
(last sync, last error, or offline), the pending count, "Sync now", and "Remove token".
Removing the token turns the copy off; the outbox is kept and pushes when a token returns.

## Tests

`src/core/cloud/cloudSync.test.ts` and `src/core/state/appStore.cloud.test.ts` run against
`src/test/fakeCloud.ts`, an in-memory stand-in with the same schema and the same last-writer
rule: outbox drains, pull applies without re-enqueueing, tombstones propagate, offline queues,
no token means no network call, a fresh install restores, the device id stays out of exports.
`e2e/cloud.spec.ts` aborts every request to the database host at the browser, so CI and the
live run never reach it and never hold a token that works.
