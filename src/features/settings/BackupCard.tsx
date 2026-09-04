import { useRef, useState } from 'react';
import { buildInfo } from '../../app/buildInfo';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { FactList } from '../../components/FactList/FactList';
import { useToast } from '../../components/Toast/useToast';
import {
  backupFileName,
  historyFileName,
  parseBackupText,
  serializeBackup,
  settingsFileName,
  type BackupSummary,
} from '../../core/backup/backup';
import { downloadTextFile, readFileText } from '../../core/backup/download';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import { formatDateTime } from '../../core/time/clock';
import type { Backup } from '../../core/validation/backup';
import { describeCounts } from './format';
import { RestorePreviewSheet } from './RestorePreviewSheet';
import styles from './Settings.module.css';

type PreviewState = { open: false } | { open: true; backup: Backup; summary: BackupSummary };

export function BackupCard() {
  const store = useAppStore();
  const state = useAppState();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewState>({ open: false });
  const [busy, setBusy] = useState(false);
  const app = { version: buildInfo.version, commit: buildInfo.commit };

  async function exportFile(kind: 'full' | 'history' | 'settings') {
    setBusy(true);
    try {
      let text: string;
      let name: string;
      if (kind === 'full') {
        const backup = await store.createBackup(app);
        text = serializeBackup(backup);
        name = backupFileName(backup.exportedAt);
      } else if (kind === 'history') {
        const history = await store.createHistoryExport(app);
        text = serializeBackup(history);
        name = historyFileName(history.exportedAt);
      } else {
        const settings = store.createSettingsExport(app);
        text = serializeBackup(settings);
        name = settingsFileName(settings.exportedAt);
      }
      downloadTextFile(name, text);
      const label = kind === 'full' ? 'Backup' : kind === 'history' ? 'History' : 'Settings';
      toast.show(
        `${label} exported (${Math.max(1, Math.round(text.length / 1024))} KB)`,
        'success',
      );
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
      const counts = await store.applyBackup(preview.backup);
      setPreview({ open: false });
      toast.show(`Backup restored and verified: ${describeCounts(counts)}`, 'success');
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
        A Full Backup JSON holds your profile, places, settings, workout history, notes and cues,
        custom exercises, your own demonstrations, and saved workouts. Files are saved to your
        device only; nothing is uploaded anywhere. History and settings can also be exported on
        their own.
      </p>
      <FactList
        items={[
          { label: 'Last export', value: formatDateTime(state.localSettings.lastExportAt) },
          { label: 'Last import', value: formatDateTime(state.localSettings.lastImportAt) },
        ]}
      />
      <div className={styles.buttonRow}>
        <Button variant="primary" onClick={() => void exportFile('full')} disabled={busy}>
          Export Full Backup JSON
        </Button>
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          Import Full Backup JSON
        </Button>
        <Button
          variant="secondary"
          onClick={() => void exportFile('history')}
          disabled={busy}
          data-testid="export-history"
        >
          Export history JSON
        </Button>
        <Button
          variant="secondary"
          onClick={() => void exportFile('settings')}
          disabled={busy}
          data-testid="export-settings"
        >
          Export settings JSON
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

      <RestorePreviewSheet
        open={preview.open}
        title="Restore this backup?"
        summary={preview.open ? preview.summary : null}
        busy={busy}
        confirmLabel="Replace my data"
        onCancel={() => setPreview({ open: false })}
        onConfirm={() => void applyImport()}
      />
    </Card>
  );
}
