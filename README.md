# Workout Conductor

**Adaptive Strength + Hypertrophy.** A mobile-first, local-first workout coach that builds the best
realistic session for your goals, time, location, and equipment, then recalibrates when anything
meaningful changes. Installable as a PWA from GitHub Pages. No accounts, no backend, no telemetry.

| Link                 | URL                                                                   |
| -------------------- | --------------------------------------------------------------------- |
| Live app (permanent) | https://bill6006.github.io/Workout-Conductor-Rebuild-v4/              |
| Project status       | [PROJECT_STATUS.md](PROJECT_STATUS.md)                                |
| Actions              | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions      |
| Commits              | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commits/main |

## What it will do

- Build muscle first: bigger arms, bigger chest, more overall size, with strength progress.
- Hybrid hypertrophy and strength programming, not a beginner app or a random generator.
- One workout-length dropdown: **15 min, 30 min, 45 min, Default time**. Changing it recalibrates
  the session instead of chopping the end off.
- A central Recalibration Engine that protects completed work and explains what changed.
- Ranked exercise alternatives that change only one exercise and hide unsafe or conflicting options.
- Fast one-handed set logging, rest timer, supersets as one two-move block, optional drop sets.
- One gold Adaptive Coach surface with a single action and plain-language evidence.
- Progress with honest confidence, backup and exact restore, everything stored in your browser.

## Stack

Vite, React, TypeScript, CSS modules, Zod, IndexedDB (durable data) + localStorage (small settings),
vite-plugin-pwa, Vitest, Playwright, ESLint, Prettier, GitHub Actions, GitHub Pages.

Not used, by design: Next.js, server rendering, backend databases, remote auth, paid or AI APIs,
analytics, telemetry, advertising, cloud sync, data collection.

## Scripts

```bash
npm install
npm run dev            # local dev server
npm run verify         # lint, typecheck, unit tests, build, privacy scan, verify build, smoke test
npm run test:unit      # Vitest
npm run test:e2e       # Playwright (builds are served with vite preview under the Pages subpath)
npm run privacy-scan   # fails on emails, phone numbers, secrets, telemetry, user-data files
npm run icons          # re-render PWA icons from public/icons/icon.svg
npm run screenshots -- --phase 0   # real screenshots + preview sheet into docs/screenshots/phase-0
```

Deployment runs automatically on every push to `main`: install, lint, type-check, unit tests,
build, privacy scan, browser smoke test, deploy. A failed check never replaces the last working
deployment.

## Execution phases and the review gate

Work proceeds one phase at a time (Phase 0 through Phase 8, see
[PROJECT_STATUS.md](PROJECT_STATUS.md)). At the end of each phase the build is deployed to the same
permanent URL, screenshots and a compact report are committed, and the phase is marked **YELLOW**.
Only the owner, after reviewing the live build on an Android phone, can mark a phase GREEN.

## Privacy

Real workout history, notes, and backups stay inside the browser. The repository and the deployed
bundle contain only source code, blank defaults, synthetic demo data, public exercise metadata, and
safe screenshots. See [docs/privacy-rules.md](docs/privacy-rules.md); the rules are enforced by
`scripts/privacy-scan.mjs` on every build.

## License

MIT. See [LICENSE](LICENSE).
