import { useRef, useState } from 'react';
import { buildInfo } from '../../app/buildInfo';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { FactList } from '../../components/FactList/FactList';
import { Sheet } from '../../components/Sheet/Sheet';
import { useToast } from '../../components/Toast/useToast';
import {
  backupFileName,
  parseBackupText,
  serializeBackup,
  type BackupSummary,
} from '../../core/backup/backup';
import { downloadTextFile, readFileText } from '../../core/backup/download';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import { formatDateTime } from '../../core/time/clock';
import type { Backup } from '../../core/validation/backup';
import { GOAL_OPTIONS, labelFor } from '../profile/labels';
import styles from './Settings.module.css';

type PreviewState = { open: false } | { open: true; backup: Backup; summary: BackupSummary };

export function BackupCard() {
  const store = useAppStore();
  const state = useAppState();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewState>({ open: false });
  const [busy, setBusy] = useState(false);

  async function exportBackup() {
    setBusy(true);
    try {
      const backup = await store.createBackup({
        version: buildInfo.version,
        commit: buildInfo.commit,
      });
      const text = serializeBackup(backup);
      downloadTextFile(backupFileName(backup.exportedAt), text);
      toast.show(`Backup exported (${Math.max(1, Math.round(text.length / 1024))} KB)`, 'success');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Export failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    try {
      const result = parseBackupText(await readFileText(file));
      if (!result.ok) {
        toast.show(result.error, 'error');
        return;
      }
      setPreview({ open: true, backup: result.backup, summary: result.summary });
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not read the file', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function applyImport() {
    if (!preview.open) return;
    setBusy(true);
    try {
      await store.applyBackup(preview.backup);
      setPreview({ open: false });
      toast.show('Backup restored and verified', 'success');
    } catch (error) {
      toast.show(
        `${error instanceof Error ? error.message : 'Import failed'} Your previous data was kept.`,
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card eyebrow="Backup" title="Export and import">
      <p className={styles.body}>
        A Full Backup JSON holds your profile, places, settings, and (from Phase 5) workout history.
        It is saved to your device only. Automatic local backup arrives in Phase 8.
      </p>
      <FactList
        items={[
          { label: 'Last export', value: formatDateTime(state.localSettings.lastExportAt) },
          { label: 'Last import', value: formatDateTime(state.localSettings.lastImportAt) },
        ]}
      />
      <div className={styles.buttonRow}>
        <Button variant="primary" onClick={() => void exportBackup()} disabled={busy}>
          Export Full Backup JSON
        </Button>
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          Import Full Backup JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className={styles.hiddenInput}
          aria-label="Choose a backup file"
          data-testid="import-file-input"
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
      </div>

      {preview.open ? (
        <Sheet
          open
          title="Restore this backup?"
          onClose={() => setPreview({ open: false })}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setPreview({ open: false })}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void applyImport()} disabled={busy}>
                {busy ? 'Restoring…' : 'Replace my data'}
              </Button>
            </>
          }
        >
          <p className={styles.body}>
            This replaces the profile, places, and history on this device. Every record is written
            and read back; if anything fails, your current data is restored automatically.
          </p>
          <FactList
            items={[
              { label: 'Exported', value: formatDateTime(preview.summary.exportedAt) },
              { label: 'App version', value: preview.summary.appVersion },
              {
                label: 'Profile',
                value: preview.summary.hasProfile
                  ? `Yes · ${labelFor(GOAL_OPTIONS, (preview.summary.primaryGoal ?? 'build-muscle') as (typeof GOAL_OPTIONS)[number]['value'])}`
                  : 'None',
              },
              { label: 'Places', value: String(preview.summary.locationCount) },
              { label: 'Workouts', value: String(preview.summary.workoutCount) },
            ]}
          />
          {preview.summary.newerThanThisApp ? (
            <p className={styles.warning}>
              This backup comes from a newer app version. Unknown fields are kept as they are.
            </p>
          ) : null}
        </Sheet>
      ) : null}
    </Card>
  );
}
