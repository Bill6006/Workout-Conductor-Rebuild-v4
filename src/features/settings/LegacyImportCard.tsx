import { useCallback, useEffect, useRef, useState } from 'react';
import { getExercise } from '../../catalog/exercises/catalog';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { FactList } from '../../components/FactList/FactList';
import { Sheet } from '../../components/Sheet/Sheet';
import { useToast } from '../../components/Toast/useToast';
import { readFileText } from '../../core/backup/download';
import {
  parseLegacyExport,
  planLegacyImport,
  type LegacyImportPlan,
} from '../../core/backup/legacyImport';
import type { LegacyImportReceipt } from '../../core/state/appStore';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { formatDateTime } from '../../core/time/clock';
import styles from './Settings.module.css';

type PreviewState = { open: false } | { open: true; plan: LegacyImportPlan; fileName: string };

/**
 * Optional import of workout history from an older export. Nothing here is
 * required to use the app: it is previewed, confirmed, written with verified
 * saves after a snapshot, and can be undone exactly from the receipt.
 */
export function LegacyImportCard() {
  const store = useAppStore();
  const toast = useToast();
  const units = useAppSelector((state) => state.profile?.units ?? 'lb');
  const history = useAppSelector((state) => state.history);
  const workoutCount = useAppSelector((state) => state.workoutCount);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewState>({ open: false });
  const [receipts, setReceipts] = useState<LegacyImportReceipt[]>([]);
  const [busy, setBusy] = useState(false);

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    store.listLegacyImports().then(
      (result) => {
        if (!cancelled) setReceipts(result);
      },
      () => {
        if (!cancelled) setReceipts([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [store, version, workoutCount]);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = parseLegacyExport(await readFileText(file), (name) =>
        store.resolveExerciseName(name),
      );
      if (!parsed.ok) {
        toast.show(parsed.error, 'error');
        return;
      }
      const plan = planLegacyImport(parsed.sessions, {
        units,
        importedAt: new Date().toISOString(),
        existingIds: new Set(history.map((record) => record.id)),
      });
      setPreview({ open: true, plan, fileName: file.name });
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not read the file', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function confirmImport() {
    if (!preview.open) return;
    setBusy(true);
    try {
      const receipt = await store.importLegacy(preview.plan.records, preview.fileName);
      setPreview({ open: false });
      toast.show(
        `Imported and verified ${receipt.recordIds.length} workout${receipt.recordIds.length === 1 ? '' : 's'}`,
        'success',
      );
      refresh();
    } catch (error) {
      toast.show(
        `${error instanceof Error ? error.message : 'Import failed'} Nothing was kept from the file.`,
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function undo(receipt: LegacyImportReceipt) {
    setBusy(true);
    try {
      const removed = await store.undoLegacyImport(receipt.id);
      toast.show(`Removed ${removed} imported workout${removed === 1 ? '' : 's'}`, 'success');
      refresh();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Undo failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  const plan = preview.open ? preview.plan : null;

  return (
    <Card eyebrow="Older exports" title="Import history from another app">
      <p className={styles.body}>
        Optional. If you have a JSON export of past workouts, it can be added to your history here:
        previewed first, written with verified saves after an automatic backup, and undone exactly
        if you change your mind. Exercises that are not in the library are listed and skipped, never
        guessed.
      </p>
      <div className={styles.buttonRow}>
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          Choose an older export
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className={styles.hiddenInput}
          aria-label="Choose an older export file"
          data-testid="legacy-file-input"
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
      </div>
      {receipts.length > 0 ? (
        <ul className={styles.snapshotList} data-testid="legacy-receipts">
          {receipts.map((receipt) => (
            <li key={receipt.id} className={styles.snapshotRow}>
              <div className={styles.snapshotText}>
                <strong>{formatDateTime(receipt.importedAt)}</strong>
                <span>
                  {receipt.fileName} · {receipt.recordIds.length} workouts
                </span>
              </div>
              <Button
                variant="secondary"
                onClick={() => void undo(receipt)}
                disabled={busy}
                data-testid="legacy-undo"
              >
                Undo
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {plan ? (
        <Sheet
          open
          title="Import these workouts?"
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
              <Button
                variant="primary"
                onClick={() => void confirmImport()}
                disabled={busy || plan.records.length === 0}
                data-testid="legacy-confirm"
              >
                {busy
                  ? 'Importing…'
                  : plan.records.length === 0
                    ? 'Nothing to import'
                    : `Import ${plan.records.length} workout${plan.records.length === 1 ? '' : 's'}`}
              </Button>
            </>
          }
        >
          <FactList
            items={[
              { label: 'Sessions in file', value: String(plan.sessionCount) },
              { label: 'Will be added', value: String(plan.records.length) },
              { label: 'Sets', value: String(plan.setCount) },
              {
                label: 'Dates',
                value:
                  plan.firstDate && plan.lastDate
                    ? `${formatDateTime(plan.firstDate)} to ${formatDateTime(plan.lastDate)}`
                    : 'none',
              },
              { label: 'Weights read as', value: plan.unit },
              { label: 'Already imported', value: String(plan.alreadyImported) },
              { label: 'Sessions with nothing usable', value: String(plan.emptySessions) },
              {
                label: 'Exercises matched',
                value: plan.matchedExercises.length
                  ? plan.matchedExercises.map((id) => getExercise(id)?.name ?? id).join(', ')
                  : 'none',
              },
            ]}
          />
          {plan.skippedExercises.length > 0 ? (
            <>
              <h3 className={styles.sheetHeading}>Not in the library, skipped</h3>
              <ul className={styles.plainList} data-testid="legacy-skipped">
                {plan.skippedExercises.map((item) => (
                  <li key={item.name}>
                    {item.name} · {item.sets} sets
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className={styles.body}>
            Your current data is backed up on this device first. Imported workouts count in history
            and progress like any other; records they set are marked as imported.
          </p>
        </Sheet>
      ) : null}
    </Card>
  );
}
