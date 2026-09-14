# Privacy rules

Workout Conductor is local-first. These rules are binding for every commit and every deployment,
and they are enforced automatically by `scripts/privacy-scan.mjs`, which runs before each deploy.
The optional cloud copy (`docs/cloud-copy.md`) does not change them: it is off until the owner
pastes a database token into Settings on a device, and that token lives only in the app's own
storage on that device: two copies, in IndexedDB and in local storage, both on the device.

## What may be committed

- Source code and configuration.
- Blank defaults.
- Clearly labeled synthetic demo data (fixtures under `src/test/fixtures/` must carry
  `"synthetic": true`).
- Public exercise metadata and original media whose license is recorded in
  `docs/media-license-register.md` (arrives with the catalog phase).
- Screenshots of the app showing only synthetic or blank state.

## What must never be committed or shipped

- Real workout history, personal notes, backups, exports, or restore files.
- Email addresses, phone numbers, or any other contact details.
- Credentials, API keys, tokens, private keys. The cloud copy's database token is never in
  source, the built bundle, tests, CI, or logs; it is pasted once into Settings and stored on
  that device only, in IndexedDB and in a second copy in local storage, and it is never part of
  a backup or an export. The token log and marks beside it hold dates and words, never the token.
- Analytics, telemetry, advertising, or tracking endpoints of any kind.
- Anything that identifies a real person other than the public GitHub account that owns the repo.

## Where real data lives

- Workout history and durable data: IndexedDB in the user's browser.
- Small settings, active-session metadata, and the second copy of the cloud token with its log:
  localStorage in the user's browser.
- Backups: exported by the user to a file they control. Never uploaded anywhere by the app.
- Cloud copy (optional): with a token on the device, the profile, places, workouts, meta,
  custom exercises, notes and cues, and saved workouts are mirrored to the owner's own database
  at the constant URL shown in Settings, and pulled back onto any device that pastes the same
  token. Never the owner's demonstrations, never automatic backups. Without a token nothing
  leaves the device and no network request is made.

Deployments must never wipe IndexedDB, and service-worker updates never force a refresh during an
active workout.

## Automated enforcement

`npm run privacy-scan` scans every tracked file plus the built `dist/` folder and fails on:

| Rule                                                               | Scope                 |
| ------------------------------------------------------------------ | --------------------- |
| Email address patterns                                             | repository and bundle |
| Phone number patterns                                              | repository and bundle |
| Credential and private-key patterns                                | repository and bundle |
| Analytics and telemetry hosts                                      | bundle                |
| JWT-shaped tokens (the cloud copy's token has that shape)          | repository and bundle |
| Any libSQL host other than the shipped default address             | bundle                |
| Backup, export, or workout-history JSON outside synthetic fixtures | repository            |

`.gitignore` additionally excludes `*backup*.json`, `*export*.json`, `workout-history*.json`,
`exports/`, and `backups/` so a local export can never be staged by accident.
