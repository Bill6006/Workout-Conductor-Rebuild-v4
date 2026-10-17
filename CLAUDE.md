# Workout Conductor v4: rules for Claude

A mobile-first workout PWA: Vite, React 19, TypeScript, Vitest 4 (jsdom, fake-indexeddb) and
Playwright, on Node 22 (`.nvmrc`). It deploys to https://bill6006.github.io/Workout-Conductor-Rebuild-v4/
from GitHub Pages. **This repository is public.**

**Resuming work?** Read `docs/handoff/CLOUD_HANDOFF.md` first: the exact stopping point, the
approved queue and the steps. `PROJECT_STATUS.md` is the status page; each round's report is
`docs/reports/maintenance-NN.md`.

## Never

- **Private data in git:** real workout history, backups, exports, personal notes, anything about
  the owner's private life, email addresses or phone numbers. Not in any tracked file, not even a
  commit-message draft. Fixtures are synthetic (`src/test/fixtures/`, with `"synthetic": true`).
  `npm run privacy-scan` enforces part of this; it doesn't read `.py` files, so check those by eye.
- **The owner's database token:** never ask for it, enter it, store it or use it. It is pasted once
  into the app's Settings and stays in IndexedDB on the owner's phone. The build, tests and CI need
  no secret; cloud-copy tests use `src/test/fakeCloud.ts`.
- **The owner's cloud data:** never import a backup, and never do anything that could queue
  deletions or overwrite it.
- **Gates:** never mark one GREEN. Only the owner does, after reviewing the live build on their
  Android phone. Gates stay YELLOW, and the agreed work does not pause for them (the owner,
  2026-10-11).
- **Site data:** never advise clearing it. One clear wipes every app at bill6006.github.io.
- **Repositories:** never modify, rename, archive, delete or force-push one. Never edit Life Mirror
  from this work; it is a read-only reference at most.
- **Approved behaviour:** never change it without the owner's word.

## Always

- **Stored data:**
  - a new stored field is optional, with `.catch(...)`;
  - never extend a stored enum: an older copy of the app must still parse every record;
  - a stored schema shares the engine's lists rather than a copy of them;
  - never overwrite a record that fails to parse.
- **Training rules follow the evidence:** systematic reviews, meta-analyses, controlled trials and
  position stands, written up in `docs/research/` with their uncertainty. Product and screen choices
  follow ordinary judgement. A number in a proposal is not a rule until evidence, or a stated
  judgement, backs it. Ask the owner only when the evidence cannot separate the options.
- **Each round:**
  1. research;
  2. build;
  3. an adversarial review, with its fixes re-checked until a pass finds nothing new;
  4. tests, and a revert table where every entry is caught (`tools/reverts/`);
  5. `npm run verify`;
  6. commit, push, deploy;
  7. the live marker and live suite;
  8. the report and status, and the owner's phone-review list kept exact.

## Commands

- `npm ci`, then `npm run dev`.
- `npm run verify` runs lint, type check, unit tests (`vitest run`, then `node scripts/test-zones.mjs`
  for the local-day rules), build, privacy scan, verify-build and e2e. Run it alone: heavy suites
  pass their time-outs under parallel load, so read a failure's error text first.
- **Local e2e** needs `npm run build` first, and `npx playwright install --with-deps chromium` once.
- **Live suite:** `E2E_BASE_URL=https://bill6006.github.io/Workout-Conductor-Rebuild-v4/ npx playwright test`.
- **Live marker:** the live `assets/index-*.js` contains `shortCommit:` followed by the deployed
  commit.

## Shipping

- **CI:** `.github/workflows/ci.yml` runs on pull requests and on pushes to any branch but `main`.
  `pages.yml` deploys every push to `main` after the same checks. Each push costs a run, so batch
  them.
- **Docs commits** after a deploy use `[skip ci]` and explicit paths (`git commit -m "…" -- <paths>`).
  A staged `git rm` once rode along into a docs commit.
- **Commit messages** end with the co-author trailer the session gives. Never write its address into a
  tracked file.
