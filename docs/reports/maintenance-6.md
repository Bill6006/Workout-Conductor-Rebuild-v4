# Maintenance 6: the cloud copy

Requested by the owner on 2026-09-11, ahead of round two of the second list: an optional copy
of the app's data in a Turso database the owner already runs, with the phone as the source of
truth and the token pasted once into Settings on each device. Design in `docs/cloud-copy.md`.

## Delivered

- **Settings > Cloud copy.** The database URL (a constant, not a secret), a token field you
  paste once, a status line (last sync, last error, or offline), the pending count, "Sync now",
  and "Remove token". Off until a token exists. The token lives in the app's own IndexedDB on
  that device and is never in source, the built bundle, tests, CI, logs, a backup, or an export.
- **An outbox behind the single durable-data owner.** The IndexedDB wrapper writes an outbox
  entry in the same transaction as every put, delete, and clear on the seven mirrored stores
  (profile, places, workouts, meta, custom exercises, notes and cues, saved workouts). Never the
  owner's demonstrations, never automatic backups. Records that arrive from the cloud are written
  through remote-apply methods that touch no outbox, so a pull never re-enqueues.
- **Push.** Batches of fifty over the libSQL web driver, loaded on demand only once a token
  exists; `app = 'workout-conductor'`, `store`, `id`, the record as `body`, the workout date as
  `day`, the record's own timestamp as `updated_at` (or the sync time for meta), `deleted = 1`
  tombstones, this device's id, and `synced_at`. A newer row from another device is never
  overwritten. Retries back off from thirty seconds to ten minutes; offline, the outbox waits.
- **Pull.** On open, every fifteen minutes, when the device comes back online, and on "Sync
  now": rows of this app newer than the cursor, applied only where the remote is newer, never
  over a pending local change; tombstones delete locally. A fresh install with the token
  restores everything on its first pull, before it pushes anything, so its onboarding defaults
  never overwrite the copy.
- **One device id per install**, kept in settings, registered in `devices` with a short label,
  stripped from every export and never restored from a backup.
- **The schema is untouched.** The database and its tables already exist and are shared with
  another app; this app writes only its own rows.
- **The rules say exactly that.** `docs/privacy-rules.md`, `docs/data-model.md`, and
  `docs/backup-and-restore.md` are amended; the privacy scan now fails on any JWT-shaped token
  in the repository or the bundle and on any libSQL host in the bundle other than the owner's
  URL (proved by a probe file during the build).
- **A storage gap closed on the way.** A same-named database at exactly our version with stores
  missing never upgraded; it now does, one version up.

## Verification

- Unit, against an in-memory stand-in with the same schema and last-writer rule: the outbox
  behind put, delete, and clear and not behind remote applies; push as upserts and tombstones
  with app, day, device, and sync time; pull applies without re-enqueueing, skips own rows,
  keeps a pending local change and a newer local record, deletes on tombstones; offline makes
  no call; a failure records a growing delay and keeps the outbox; a fresh install restores and
  drops its overwritten defaults; the store saves and clears the token, drains, survives a
  reload, keeps the device id out of exports; no token means no network call.
- Browser (`e2e/cloud.spec.ts`, every request to the database host aborted at the browser, so
  CI never has a token that works): the card is off until a token is pasted, then reports a
  blocked attempt with the changes still waiting, survives a reload, and turns off again; a
  backup carries neither the token nor the device id.

## How to check on the phone

1. Settings > Cloud copy: the URL is shown and the status reads "Off until you paste a token."
   Paste the token, tap "Save token": the status moves to the last sync time and the pending
   count drops to zero.
2. Finish or edit anything, then watch "Pending" go up and back to zero within a couple of
   seconds; "Sync now" does the same on demand.
3. On a second device: install the app, skip setup, paste the same token in Settings > Cloud
   copy. Everything from the phone appears on Today, Progress, and Settings.
