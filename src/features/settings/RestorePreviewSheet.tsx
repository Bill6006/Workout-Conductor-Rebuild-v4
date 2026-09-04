import { Button } from '../../components/Button/Button';
import { FactList } from '../../components/FactList/FactList';
import { Sheet } from '../../components/Sheet/Sheet';
import type { BackupSummary } from '../../core/backup/backup';
import { formatDateTime } from '../../core/time/clock';
import { GOAL_OPTIONS, labelFor } from '../profile/labels';
import { formatBytes } from './format';
import styles from './Settings.module.css';

interface RestorePreviewSheetProps {
  open: boolean;
  title: string;
  summary: BackupSummary | null;
  busy: boolean;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** The preview every restore goes through: what is in the file, what changes, what is kept safe. */
export function RestorePreviewSheet({
  open,
  title,
  summary,
  busy,
  confirmLabel,
  onCancel,
  onConfirm,
}: RestorePreviewSheetProps) {
  if (!open || !summary) return null;
  return (
    <Sheet
      open
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={busy}
            data-testid="restore-confirm"
          >
            {busy ? 'Restoring…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className={styles.body}>
        This replaces the profile, places, history, notes, custom exercises, your demonstrations,
        and saved workouts on this device. Every record is written and read back; if anything fails,
        your current data is put back and checked. The data from before is kept as an automatic
        backup so this can be undone.
      </p>
      <FactList
        items={[
          { label: 'Exported', value: formatDateTime(summary.exportedAt) },
          { label: 'App version', value: summary.appVersion },
          {
            label: 'Profile',
            value: summary.hasProfile
              ? `Yes · ${labelFor(GOAL_OPTIONS, (summary.primaryGoal ?? 'build-muscle') as (typeof GOAL_OPTIONS)[number]['value'])}`
              : 'None',
          },
          { label: 'Places', value: String(summary.locationCount) },
          { label: 'Workouts', value: String(summary.workoutCount) },
          { label: 'Notes and cues', value: String(summary.noteCount) },
          { label: 'Custom exercises', value: String(summary.customExerciseCount) },
          { label: 'Your demonstrations', value: String(summary.mediaCount) },
          { label: 'Saved workouts', value: String(summary.savedWorkoutCount) },
          { label: 'Size', value: formatBytes(summary.bytes) },
        ]}
      />
      {summary.migrations.length > 0 ? (
        <p className={styles.body} data-testid="restore-migration-note">
          Older backup format {summary.migrations[0]?.from} upgraded to {summary.schemaVersion}:{' '}
          {summary.migrations.map((step) => step.note).join(' ')}
        </p>
      ) : null}
      {summary.newerThanThisApp ? (
        <p className={styles.warning}>
          This backup comes from a newer app version. Unknown fields are kept as they are.
        </p>
      ) : null}
    </Sheet>
  );
}
