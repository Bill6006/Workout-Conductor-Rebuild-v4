# Phase 8 report: data safety, optional migration, PWA, polish, and acceptance

Phase 8 closes the plan: every durable byte can be exported exactly and restored exactly,
restores roll back and prove it, the phone keeps its own automatic backups, storage can be
checked and tidied without touching anything that matters, an older export can be imported and
undone, a deploy can never interrupt a workout, and the app passes an accessibility and zoom
sweep on top of the full suite.

## Delivered

- **Complete backup and exact restore.** Full Backup JSON schema 2 now carries profile, places,
  local settings, workouts, notes and cues, custom exercises, your own demonstrations, saved
  workouts, and meta. Schema 1 files migrate forward on import (the empty meta list is added),
  and unknown fields survive at every level. A round-trip test exports from one store, imports
  into another, and exports again with identical data.
- **Rollback, verified.** A restore that fails part-way puts every store back from the
  pre-restore snapshot, then reads each store again and compares it; only a verified rollback
  reports the original error, and an unverifiable rollback says so plainly.
- **History and settings exports** as separate files, for spreadsheets or other tools.
- **Automatic local backups.** A verified snapshot of everything after each finished workout,
  before each import, before each legacy import, and on "Back up now"; the newest three are
  kept on the device, each previewable and restorable through the same verified path.
- **Storage and save check.** Used and quota storage where the browser reports it, whether the
  browser keeps the data, record counts per store, last verified save, a one-tap probe that
  writes, reads back, verifies, and removes one record, and a request for persistent storage.
- **Safe cleanup.** Previewed first, it removes only a leftover probe, a finished onboarding
  draft, and automatic backups beyond the kept three. A test proves workout history, profile,
  places, notes, custom content, saved workouts, and the kept backups keep their counts.
- **Critical-save verification coverage.** The restore path, snapshots, legacy imports, and
  removals all use the verified write and delete owners; new tests cover the restore
  rollback's own verification and the snapshot pruning.
- **Optional legacy import.** A user-triggered adapter reads a forgiving JSON shape (documented
  in `docs/backup-and-restore.md`), previews sessions, sets, dates, matched exercises, and the
  exercises it will skip, then writes verified records after an automatic backup and keeps a
  receipt so the import can be undone exactly. The same file imported twice adds nothing.
- **Service-worker update safety.** The "New version available" prompt withholds Reload while
  a workout is active or paused and offers it again afterwards; the shell is precached with the
  placeholder demonstrations, so the active workout plays offline.
- **Android keyboard.** The viewport lets the keyboard resize the layout instead of covering
  the logger.
- **Accessibility.** An axe sweep over every screen, the active workout, and the details sheet
  runs in the browser suite; the subtle text token was raised to at least 4.5:1 on every
  surface, and the exercise panel tab list no longer mixes a plain button into its tabs.
- **Mobile zoom.** A sweep over 360, 375, 412, and 430 px at 100, 115, 130, and 150 percent
  checks Today and the active workout for horizontal overflow and reachable controls; the
  bottom navigation and the set rows now shrink correctly at 150 percent on 360 px.
- **Demonstration coverage.** A test checks that every catalog exercise resolves to an existing
  poster and animated loop, that every movement pattern has its placeholder pair, and that the
  media register describes them as original work.
- **Cutover report.** `docs/cutover-report.md` walks the plan's acceptance rules with evidence.

## Verification

- Lint, type-check, and formatting clean; privacy scan 0 findings.
- Unit: 282 tests across 51 files (new: backup schema migration, verified rollback, exact
  restore, snapshots, diagnostics, cleanup safety, legacy import parsing and planning, update
  prompt hold, demonstration coverage).
- Browser/mobile: the full suite including the new data safety, accessibility, and zoom
  specs, run locally and against the live URL after deployment (totals in
  `PROJECT_STATUS.md`).
- Screenshots captured from the deployed build in `docs/screenshots/phase-8`.

## How to check on the phone

1. Settings: export a Full Backup JSON, then Import it back and read the preview; after
   "Replace my data" the toast lists the counts. The Automatic backups card now shows the
   pre-import snapshot; Restore it the same way.
2. Run save check, then Clear temporary data and read what would be removed and what is kept.
3. Choose an older export (any JSON with a `history` list of sessions, see the doc) and read the
   preview; import it, find the workouts in Progress, then Undo from the receipt.
4. Start a workout and leave it active; a new version, when one is deployed, is announced but
   Reload is withheld until the workout ends.

## Decisions and notes

- Snapshots include your demonstrations inline, so the automatic backups cost about three times
  the size of your media; the count is capped at three for that reason.
- Legacy exercises that do not match the library are skipped and listed, never guessed into
  the wrong movement pattern.
- The subtle text colour moved from `#6a7380` to `#8a939e` for contrast; the muted colour was
  already compliant and is unchanged.
