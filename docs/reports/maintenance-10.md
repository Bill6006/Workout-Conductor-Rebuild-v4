# Maintenance 10: the token on the device, and getting a device's history back

Started on 2026-09-14 after the owner lost the cloud token on his phone twice in two days, in
this app and in his other app on the same origin, and then found the workout he had done the
night before gone from the phone even though the cloud copy still held it.

## What was found

The cause was verified from the code, not assumed.

- **The pull skipped every row this device wrote.** `pullRemote` dropped any row whose
  `device_id` was this device's, on the reasoning that the device already held that data. So a
  device could never recover its own uploads: once a record vanished from the phone, its own
  cloud row was the one row the pull would never apply. That, not the cursor alone, is why the
  workout did not come back.
- **A token entered again did not restart the pull.** The cursor reset only when the database
  address changed. Pasting the same token for the same database kept the cursor, so the pull
  asked only for rows newer than the last sync, and the lost workout sat behind it.
- **The token had one copy, written once, never read back.** A plain put into the `cloud`
  store with the browser's default durability, which lets a write sit acknowledged but not
  flushed. Nothing in the app deletes that record except the Remove token button, and the
  schema only ever adds stores, so the loss came from the storage layer, not the code. It took
  a recently written workout record with it and left an older, often-rewritten sync-state
  record beside it. The one thing that can be said with certainty is what did not do it.
- **Silence.** A missing token showed as "Off until you paste a token", the same as a device
  that never had one.

## Delivered

- **Two copies of the token, verified.** `src/core/cloud/tokenVault.ts` keeps the token in the
  `cloud` store and in the app's local storage, a different storage engine in the same browser.
  The database write goes through the verified-save helper and is read back before it counts;
  the local copy is read back too. When the app opens and before every sync, whichever copy has
  gone missing is written again from the other. A database that lost the token gets the whole
  history pulled again, since it may have lost more. The first run of this build on a device
  that already had a token writes the second copy and walks the history once, so the owner's
  phone gets its workout back on its first sync without anything to paste.
- **A device gets its own rows back.** The pull now applies this device's own row when the
  record is gone from the device and no change to it is waiting; a row for a record still
  here, or the device's own tombstone, changes nothing. A pull that starts from the beginning
  on a device that has synced before keeps a pending local change and the newer record, and
  only a device that has never pulled lets the cloud win over what it wrote, so a fresh
  install still restores over its onboarding defaults.
- **Entering a token again restarts the pull.** For the same database as before, the cursor
  goes back to the start while the device remembers it has synced, so the next sync walks the
  whole history back before it pushes.
- **Sync now walks everything.** The button pulls from the beginning under the ordinary rules;
  the automatic sync stays incremental. A record lost while the token was intact comes back with
  one tap.
- **Every write flushed.** Both transaction helpers ask for strict durability.
- **A loss is said.** The Cloud copy card shows when the token was written again from the
  other copy, or that it is missing from both and since when, with the words "Missing" instead
  of "Not set". The Storage card lists the token log: saved, restored, missing, removed, each
  dated and naming the layer. Neither the log nor the marks ever hold the token; the local keys
  are never part of a backup or an export; the `cloud` store is never mirrored.
- **Surfaces.** No new buttons. One notice line on the Cloud copy card when there is something
  to say, one fact on the Storage card when the log has entries.

## Verification

- Unit: the vault (both copies written and marked, the log without the token, a database that
  lost the token healed from the phone and asking for the whole history, a phone copy healed
  from the database quietly on the first run and named after, both copies gone said once with
  when it was last seen, removal, two different tokens, a database write that does not stick
  refused before the phone copy is touched); the pull bringing back an own row only where the
  record is gone; the whole recovery through the store three ways, with the cloud row proven
  untouched and the diagnostic proven free of the token.
- Browser (`e2e/cloudRecovery.spec.ts`, all three device projects): the database stood in for
  at the network layer, so the push and the pull are real. A finished workout pushed, the
  cursor settled past it, then the workout and the token removed from IndexedDB behind the
  app's back: the app opens, says the database copy was missing, and the workout is back on
  Progress with the cloud row unchanged; with the token intact, Sync now brings a lost record
  back; with both copies gone, the card says "Missing" and since when, and pasting again
  restores the history without a single deletion reaching the cloud.

## How to check on the phone

1. Open the app once so it updates. Settings, Cloud copy: the token is still saved. Progress:
   the workout from Sep 13 is back.
2. Settings, Storage: the token log's first line says a second copy was written.
3. If the token ever goes missing again, the Cloud copy card says so with the date, and Storage
   shows which copy lost it.
