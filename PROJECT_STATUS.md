# Workout Conductor - Project Status

_Last updated: 2026-09-02 15:45 UTC_

| Item                   | Value                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Repository             | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4                                    |
| Live app (permanent)   | https://bill6006.github.io/Workout-Conductor-Rebuild-v4/                                    |
| Actions                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/actions                            |
| Commits                | https://github.com/Bill6006/Workout-Conductor-Rebuild-v4/commits/main                       |
| Current phase          | Phase 0 - Repository, Live Pages, and Scaffold                                              |
| Phase gate             | **YELLOW** - awaiting the owner's Android review of the live link                           |
| Current branch         | `main`                                                                                      |
| Latest completed phase | None yet (Phase 0 is at its review gate)                                                    |
| Work in progress       | Phase 0 review gate. No Phase 1 code has been started.                                      |
| Latest commit          | Pending first push (this file is updated after the push)                                    |
| Latest deployment      | Pending first Pages deployment                                                              |
| Test totals            | Unit: 41 passed. Browser/mobile: 20 passed (18 smoke across 412 px, 360 px, desktop; 2 PWA) |
| Build marker           | Shown under the header on every screen: `Build <sha> · <UTC time> · Phase 0`                |

## Phase checklist

| Phase | Name                                                         | Status               |
| ----- | ------------------------------------------------------------ | -------------------- |
| 0     | Repository, Live Pages, and Scaffold                         | YELLOW (review gate) |
| 1     | Product Foundation and First Useful Live Preview             | planned              |
| 2     | Exercise Catalog, Media, and Conflict Engine                 | planned              |
| 3     | Workout Generation and Duration Engine                       | planned              |
| 4     | Central Recalibration Engine                                 | planned              |
| 5     | Active Workout, Logging, and Superset Experience             | planned              |
| 6     | Adaptive Coach, Progression, Strategy, and Recovery          | planned              |
| 7     | Progress, Plan, Coverage, PRs, and Session Summary           | planned              |
| 8     | Data Safety, Optional Migration, PWA, Polish, and Acceptance | planned              |

## Phase 0 deliverables

- [x] New public repository `Workout-Conductor-Rebuild-v4` (the preferred names already existed)
- [x] Vite + React + TypeScript scaffold with CSS modules, Zod, Vitest, Playwright, ESLint, Prettier
- [x] PWA shell: manifest, original icons (192, 512, maskable, Apple touch), service worker in prompt mode
- [x] CI workflow: install, lint, type-check, unit tests, build, privacy scan, build verification, browser smoke test
- [x] Pages workflow: reuses CI, deploys `dist/` to the permanent URL only after a fully green check
- [x] Privacy rules (`docs/privacy-rules.md`) enforced by `scripts/privacy-scan.mjs`
- [x] Blank but polished mobile shell: dark charcoal surfaces, lime accent, rounded cards, bottom navigation
- [x] Today / Workout / Progress / Plan / Settings navigation with hash routing (deep links and reload work)
- [x] Visible build marker and current-phase chip on every screen; Build status card on Today
- [ ] Permanent Pages URL live and opened on the owner's Android phone (pending first deployment)
- [ ] First real Android-sized screenshots committed (captured from the deployed build)

## Known limitations

- Shell only. Onboarding, profiles, settings, persistence, and the synthetic demo workout arrive in Phase 1; the workout engine and the 15 / 30 / 45 / Default duration dropdown arrive in Phase 3.
- `Start Workout` is intentionally disabled until a workout exists.
- The "New version available" prompt exists but the hold-during-active-workout rule is wired in later, since no workout can be active yet.
- Bundle: JS 285 KB raw / 87 KB gzip, CSS 8 KB, dist total 552 KB across 14 files; service worker precaches 18 entries.
- Local test note (Windows): running the Playwright `pwa` project in isolation with 4 workers stalled first navigations; the plain full run used by CI is stable. Test-infrastructure note, not a product defect.

## Mobile screenshots

Pending: captured from the deployed build and stored in `docs/screenshots/phase-0/`.

## Next concrete action

Owner opens the live link on an Android phone and replies with one of `GREEN - NEXT PHASE`,
`YELLOW - FIX: <issue>`, or `RED - STOP`. On GREEN, Phase 1 begins: step-by-step onboarding,
profile and goals, equipment and location profiles, preferences and limitations, settings,
localStorage + IndexedDB foundation with schema validation and verified saves, export/import
foundation, Today dashboard, and a clearly labeled synthetic demo workout preview.
