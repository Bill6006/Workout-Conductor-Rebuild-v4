# Privacy rules

Workout Conductor is local-first. These rules are binding for every commit and every deployment,
and they are enforced automatically by `scripts/privacy-scan.mjs`, which runs before each deploy.

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
- Credentials, API keys, tokens, private keys.
- Analytics, telemetry, advertising, or tracking endpoints of any kind.
- Anything that identifies a real person other than the public GitHub account that owns the repo.

## Where real data lives

- Workout history and durable data: IndexedDB in the user's browser.
- Small settings and active-session metadata: localStorage in the user's browser.
- Backups: exported by the user to a file they control. Never uploaded anywhere by the app.

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
| Backup, export, or workout-history JSON outside synthetic fixtures | repository            |

`.gitignore` additionally excludes `*backup*.json`, `*export*.json`, `workout-history*.json`,
`exports/`, and `backups/` so a local export can never be staged by accident.
