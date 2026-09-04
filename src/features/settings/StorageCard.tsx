import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { FactList, type Fact } from '../../components/FactList/FactList';
import { Sheet } from '../../components/Sheet/Sheet';
import { useToast } from '../../components/Toast/useToast';
import type { CleanupResult, SaveCheckResult, StorageDiagnostic } from '../../core/state/appStore';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { formatDateTime } from '../../core/time/clock';
import { formatBytes } from './format';
import styles from './Settings.module.css';

/**
 * Storage and save check: what is stored, whether the browser protects it, a
 * one-tap write/read-back/verify probe, and a cleanup that only ever removes
 * temporary data and says exactly what it removed and what it kept.
 */
export function StorageCard() {
  const store = useAppStore();
  const toast = useToast();
  const lastReceipt = useAppSelector((state) => state.lastReceipt);
  const workoutCount = useAppSelector((state) => state.workoutCount);
  const [diagnostic, setDiagnostic] = useState<StorageDiagnostic | null>(null);
  const [check, setCheck] = useState<SaveCheckResult | null>(null);
  const [persistResult, setPersistResult] = useState<boolean | null | 'unknown'>('unknown');
  const [cleanupPreview, setCleanupPreview] = useState<CleanupResult | null>(null);
  const [busy, setBusy] = useState(false);

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    store.storageDiagnostic().then(
      (result) => {
        if (!cancelled) setDiagnostic(result);
      },
      () => {
        if (!cancelled) setDiagnostic(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [store, version, workoutCount, lastReceipt]);

  async function runCheck() {
    setBusy(true);
    try {
      const result = await store.runSaveCheck();
      setCheck(result);
      toast.show(
        result.ok ? `Save check passed in ${result.ms} ms` : `Save check failed: ${result.error}`,
        result.ok ? 'success' : 'error',
      );
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function keepPersistent() {
    setBusy(true);
    try {
      const result = await store.requestPersistence();
      setPersistResult(result);
      toast.show(
        result === null
          ? 'This browser does not offer persistent storage'
          : result
            ? 'The browser will keep this data'
            : 'The browser declined; data stays but may be evicted when space runs low',
        result ? 'success' : 'error',
      );
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function previewCleanup() {
    setBusy(true);
    try {
      setCleanupPreview(await store.cleanupTemporaryData({ dryRun: true }));
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not check', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function runCleanup() {
    setBusy(true);
    try {
      const result = await store.cleanupTemporaryData();
      setCleanupPreview(null);
      toast.show(
        result.removed.length === 0
          ? 'Nothing temporary to remove'
          : `Removed ${result.removed.length} temporary item${result.removed.length === 1 ? '' : 's'}; everything else kept`,
        'success',
      );
      refresh();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Cleanup failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  const facts: Fact[] = diagnostic
    ? [
        {
          label: 'Used',
          value:
            diagnostic.usageBytes === null
              ? 'Not reported by this browser'
              : `${formatBytes(diagnostic.usageBytes)} of ${formatBytes(diagnostic.quotaBytes)}`,
        },
        {
          label: 'Protected',
          value:
            diagnostic.persisted === null
              ? 'Not reported'
              : diagnostic.persisted
                ? 'Yes, the browser keeps this data'
                : 'Not yet',
        },
        {
          label: 'Records',
          value: `${diagnostic.counts.workouts} workouts · ${diagnostic.counts.locations} places · ${diagnostic.counts.customInstructions} notes · ${diagnostic.counts.customExercises} custom · ${diagnostic.counts.customMedia} demonstrations · ${diagnostic.counts.savedWorkouts} saved · ${diagnostic.counts.backups} automatic backups`,
        },
        {
          label: 'Last verified save',
          value: lastReceipt
            ? `${lastReceipt.store} · ${formatDateTime(lastReceipt.verifiedAt)} · ${lastReceipt.bytes} bytes`
            : 'none this session',
        },
        {
          label: 'Save check',
          value: check
            ? check.ok
              ? `Passed · ${check.ms} ms · ${formatDateTime(check.checkedAt)}`
              : `Failed · ${check.error}`
            : 'Not run yet',
        },
      ]
    : [{ label: 'Storage', value: 'Looking…' }];

  return (
    <Card eyebrow="Storage" title="Storage and save check">
      <FactList items={facts} />
      <div className={styles.buttonRow}>
        <Button
          variant="secondary"
          onClick={() => void runCheck()}
          disabled={busy}
          data-testid="save-check"
        >
          Run save check
        </Button>
        {persistResult !== true && diagnostic?.persisted !== true ? (
          <Button variant="secondary" onClick={() => void keepPersistent()} disabled={busy}>
            Keep data on this device
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => void previewCleanup()}
          disabled={busy}
          data-testid="cleanup-preview"
        >
          Clear temporary data
        </Button>
      </div>
      <p className={styles.body}>
        Cleanup only removes temporary items. Workout history, profile, places, notes, custom
        exercises, your demonstrations, saved workouts, automatic backups, and an active session are
        never removed.
      </p>
      {cleanupPreview ? (
        <Sheet
          open
          title="Clear temporary data?"
          onClose={() => setCleanupPreview(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCleanupPreview(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void runCleanup()}
                disabled={busy}
                data-testid="cleanup-confirm"
              >
                {cleanupPreview.removed.length === 0
                  ? 'Nothing to remove'
                  : 'Remove temporary data'}
              </Button>
            </>
          }
        >
          <h3 className={styles.sheetHeading}>Will be removed</h3>
          {cleanupPreview.removed.length === 0 ? (
            <p className={styles.body}>Nothing temporary is on this device.</p>
          ) : (
            <ul className={styles.plainList} data-testid="cleanup-removed">
              {cleanupPreview.removed.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <h3 className={styles.sheetHeading}>Kept</h3>
          <ul className={styles.plainList} data-testid="cleanup-kept">
            {cleanupPreview.kept.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Sheet>
      ) : null}
    </Card>
  );
}
