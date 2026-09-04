# Cutover report

Workout Conductor v4 was rebuilt from the execution plan alone, one phase at a time, each phase
approved on the owner's Android phone from the permanent GitHub Pages build before the next
began. This report walks the plan's acceptance rules with where each is proven.

Live app: https://bill6006.github.io/Workout-Conductor-Rebuild-v4/
Repository: https://github.com/Bill6006/Workout-Conductor-Rebuild-v4

| Acceptance rule                                                        | Evidence                                                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| The repository exists                                                  | Public repository above; CI and Pages workflows in `.github/workflows`                                                              |
| The Pages link works on a phone                                        | Owner reviews of Phases 0 to 7 on Android; `e2e/pwa.spec.ts` against the live URL                                                   |
| The duration dropdown works                                            | `e2e/duration.spec.ts`; `src/components/DurationSelector`                                                                           |
| 15/30/45/Default recalibration works                                   | `src/engine/duration`, `e2e/recalibration.spec.ts`, `docs/recalibration-engine.md`                                                  |
| The loading screen appears during recalibration                        | `src/components/CalibrationOverlay`, `e2e/recalibration.spec.ts`                                                                    |
| Completed work is protected                                            | Recalibration locks in `src/engine/recalibration`, `src/core/state/appStore.workout.test.ts`                                        |
| Alternatives change only one exercise                                  | `src/engine/alternatives`, `e2e/activeWorkout.spec.ts`                                                                              |
| Conflicting alternatives are hidden                                    | `src/engine/conflicts`, `docs/conflict-engine.md`                                                                                   |
| Every production-enabled exercise has a working visual demonstration   | `src/catalog/media/mediaCoverage.test.ts`; original placeholder loops per movement pattern (`docs/media-license-register.md`)      |
| Demonstrations work in active workouts and alternative previews        | `ExerciseThumb`/`ExerciseDemo` on cards, details, and alternatives; `e2e/media.spec.ts`                                             |
| Supersets are intelligent, one combined two-move block                 | `src/engine/workoutGenerator`, `src/components/SupersetGroup`, `docs/workout-engine.md`                                             |
| Completed superset rounds can be corrected without extra rounds/timers | `e2e/activeWorkout.spec.ts` round editing; `appStore.workout.test.ts`                                                               |
| Final superset completion goes directly to the completion surface      | `src/core/state/appStore.ts` finish path; `e2e/coach.spec.ts`                                                                       |
| Adaptive Coach uses both superset moves, ignores incomplete drafts     | `src/engine/coach`, `docs/progression-engine.md`, coach tests                                                                       |
| One gold Coach card and one action maximum                             | `src/components/AdaptiveCoach`, coach conductor tests                                                                               |
| Plateau and recovery advice is evidence-based and user-controlled      | `src/engine/strategy`, nothing auto-applied (tests in `src/engine/coach`)                                                           |
| Duration recalibration remains the only workout-length system          | One dropdown; no Short Day or competing mode anywhere in `src/features`                                                             |
| Drop sets are optional and intelligent                                 | `drop-set` trigger in `src/engine/recalibration`, offered by the coach, never applied automatically                                 |
| Warm-ups flagged and excluded from progression and PR evidence         | `buildSets` warm-up kind; `src/engine/scoring/personalRecords.ts`; warm-up labels in the UI                                         |
| Per-exercise notes and Plate Math work                                 | `EntryPanels` notes and plates tabs; `e2e/activeWorkout.spec.ts`                                                                    |
| Equipment Busy is session-only                                         | Session constraints in `src/engine/recalibration`; details sheet "This session only"                                                |
| PR feedback and Session Summary work                                   | `src/features/workout/WorkoutCompletion.tsx`, `e2e/progress.spec.ts`                                                                |
| The logging UI is genuinely new; set editing is fast                   | `src/components/SetLogger`, inline correction and undo in `e2e/activeWorkout.spec.ts`                                               |
| Workout history persists                                               | IndexedDB `workouts`; reload tests in `e2e/activeWorkout.spec.ts` and `e2e/pwa.spec.ts`                                             |
| Critical saves are verified by read-back                               | `src/core/storage/verifiedSave.ts`; restore, snapshots, legacy import, and removals use it; `src/core/backup/backup.test.ts`        |
| Storage diagnostics do not delete protected user data                  | `cleanupTemporaryData` and its test in `src/core/state/appStore.backup.test.ts`; `e2e/dataSafety.spec.ts`                           |
| Export/import works                                                    | `BackupCard`, `e2e/dataSafety.spec.ts`, `e2e/screenshots.spec.ts` import preview                                                    |
| Custom exercises, custom media, and notes survive backup/restore       | Exact round-trip test in `src/core/state/appStore.backup.test.ts`                                                                   |
| Optional legacy import is previewed, confirmed, verified, reversible   | `src/core/backup/legacyImport.ts`, `LegacyImportCard`, `e2e/dataSafety.spec.ts` (import then undo)                                  |
| Android PWA installation works                                         | Manifest and service worker (`vite.config.ts`), `e2e/pwa.spec.ts`; installed on the owner's phone during review                     |
| Screenshots prove the working UI                                       | `docs/screenshots/phase-0` to `phase-8`, captured from the deployed builds                                                          |
| Tests pass                                                             | `npm run verify`: lint, types, format, privacy scan, unit suite, build check, browser suite; CI on every push                        |
| No personal data is in GitHub                                          | Privacy scan in `npm run verify` (0 findings); user data stays in the browser (`docs/privacy-rules.md`)                              |

## Handover notes

- Deploys never wipe data: the database only gains stores, the service worker updates only on
  Reload, and Reload is withheld during a workout.
- To move phones: export a Full Backup JSON on the old phone, import it on the new one, and
  read the preview counts. The pre-import state stays as an automatic backup on the new phone.
- Docs to read first: `docs/architecture.md`, `docs/data-model.md`, `docs/backup-and-restore.md`,
  `docs/workout-engine.md`, `docs/recalibration-engine.md`, `docs/progression-engine.md`,
  `docs/tempo-guidance.md`, and the phase reports under `docs/reports`.
