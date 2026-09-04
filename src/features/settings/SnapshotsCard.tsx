import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { useToast } from '../../components/Toast/useToast';
import {
  SNAPSHOTS_KEPT,
  type BackupSnapshotSummary,
  type SnapshotReason,
} from '../../core/state/appStore';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { formatDateTime } from '../../core/time/clock';
import { describeCounts, formatBytes } from './format';
import { RestorePreviewSheet } from './RestorePreviewSheet';
import styles from './Settings.module.css';

const REASON_LABEL: Record<SnapshotReason, string> = {
  workout: 'After a workout',
  'pre-import': 'Before an import',
  manual: 'Backed up by you',
  'legacy-import': 'Before a legacy import',
};

/**
 * Automatic local backups: a verified snapshot of everything after each finished
 * workout and before each import, kept on this device only. Restoring one goes
 * through the same preview, verified restore, and rollback as an imported file.
 */
export function SnapshotsCard() {
  const store = useAppStore();
  const toast = useToast();
  const workoutCount = useAppSelector((state) => state.workoutCount);
  const lastImportAt = useAppSelector((state) => state.localSettings.lastImportAt);
  const [snapshots, setSnapshots] = useState<BackupSnapshotSummary[] | null>(null);
  const [selected, setSelected] = useState<BackupSnapshotSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    store.listSnapshots().then(
      (result) => {
        if (!cancelled) setSnapshots(result);
      },
      () => {
        if (!cancelled) setSnapshots([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [store, version, workoutCount, lastImportAt]);

  async function backUpNow() {
    setBusy(true);
    try {
      const snapshot = await store.snapshotBackup('manual');
      toast.show(`Backed up on this device (${formatBytes(snapshot.summary.bytes)})`, 'success');
      refresh();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Backup failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!selected) return;
    setBusy(true);
    try {
      const counts = await store.restoreSnapshot(selected.id);
      setSelected(null);
      toast.show(`Backup restored and verified: ${describeCounts(counts)}`, 'success');
      refresh();
    } catch (error) {
      toast.show(
        `${error instanceof Error ? error.message : 'Restore failed'} Your previous data was kept.`,
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card eyebrow="Automatic backups" title="Kept on this device">
      <p className={styles.body}>
        A verified copy of everything is kept after each finished workout and before each import.
        The newest {SNAPSHOTS_KEPT} stay; they never leave this phone, so export a file too if you
        want a copy elsewhere.
      </p>
      {snapshots === null ? (
        <p className={styles.body}>Looking…</p>
      ) : snapshots.length === 0 ? (
        <p className={styles.body} data-testid="snapshots-empty">
          No automatic backup yet. One is written when you finish a workout.
        </p>
      ) : (
        <ul className={styles.snapshotList} data-testid="snapshot-list">
          {snapshots.map((snapshot) => (
            <li key={snapshot.id} className={styles.snapshotRow}>
              <div className={styles.snapshotText}>
                <strong>{formatDateTime(snapshot.createdAt)}</strong>
                <span>
                  {REASON_LABEL[snapshot.reason]} · {snapshot.summary.workoutCount} workouts ·{' '}
                  {formatBytes(snapshot.summary.bytes)}
                </span>
              </div>
              <Button
                variant="secondary"
                onClick={() => setSelected(snapshot)}
                disabled={busy}
                data-testid="snapshot-restore"
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.buttonRow}>
        <Button
          variant="secondary"
          onClick={() => void backUpNow()}
          disabled={busy}
          data-testid="snapshot-now"
        >
          Back up now
        </Button>
      </div>
      <RestorePreviewSheet
        open={selected !== null}
        title="Restore this automatic backup?"
        summary={selected?.summary ?? null}
        busy={busy}
        confirmLabel="Restore this backup"
        onCancel={() => setSelected(null)}
        onConfirm={() => void restore()}
      />
    </Card>
  );
}
