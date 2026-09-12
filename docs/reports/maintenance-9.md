# Maintenance 9: one database per person

Requested on 2026-09-12, so other people can use the app with a cloud copy of their own rather
than exports or browser-only storage. The owner hosts their databases, because the people
involved cannot make one themselves.

## Delivered

- **The database address sits beside the token.** Both live in the app's own storage on the
  device, neither in a backup nor in the built files. The shipped default is still the owner's
  address, so an existing install changes in no way until the field is edited. "Change database"
  reveals the fields again on a configured device.
- **Adopting a database is checked before anything is saved.** It has to answer, it has to carry
  the `records` and `devices` tables, and it must not already hold rows written by other devices.
  The last one stops the save with a count and needs a second, deliberate tap, because two people
  on one database would write to the same fixed ids (the profile is always `current`) and
  overwrite each other. Offline, a database this device has never used is refused rather than
  saved on a promise; a token for the database already in use still saves and syncs later.
- **Changing the address re-seeds.** The cursor resets so the next sync pulls from the new
  database first, then every mirrored record is queued so the new database receives the whole
  history rather than only what changes next. The old database keeps its own copy.
- **A personal setup link.** `#/setup?db=...&token=...` fills both values, so the person taps once
  instead of typing two long strings on a phone. The values ride in the URL fragment, which
  browsers never send to a server. The app applies it, rewrites the history entry so the link is
  gone from Back and from a reload, and lands on Settings, which reports the outcome. A link
  never accepts an occupied database.
- **Two defects found while building.** A setup link opened while the app was already running did
  nothing, because only a mount was watched and a link that changes the hash never reloads the
  page. And a cloud problem was hidden whenever the copy was off, so a setup link that failed
  said nothing at all.

## Verification

- Unit: saving a different database, the re-seed sending the whole history, the address
  surviving a reload; refusing a database with no tables and one already holding another person,
  then accepting it deliberately; refusing an address that is not a database and refusing a new
  one while offline, with no network touched; the setup link's build and parse, including half a
  link and a foreign hash.
- Browser (`e2e/cloudSetup.spec.ts`, all three device projects): the address field carries the
  default, a made-up address is refused, an unreachable one is refused rather than saved, and a
  setup link lands on Settings with the token scrubbed from the address bar and gone after a
  reload. The database host is aborted at the browser throughout, so neither CI nor the live run
  ever reaches a database or holds a token that works.
- The privacy scan caught a `libsql://` placeholder I had put in the address field and failed the
  build. The placeholder is now plain words; the rule was left alone, because the built files
  should still carry only the shipped default.

## How to check on the phone

1. Settings, Cloud copy: the address is shown and, with the copy off, editable. Your own install
   keeps working with no change.
2. On a second device, open a personal setup link: it lands on Settings, the address bar no
   longer holds the token, and the copy is on.
3. Pointing a device at a database that already holds somebody else stops and says so, and takes
   a second tap to go ahead.
