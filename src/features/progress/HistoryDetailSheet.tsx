import { requireExercise } from '../../catalog/exercises/catalog';
import { FactList } from '../../components/FactList/FactList';
import { Sheet } from '../../components/Sheet/Sheet';
import { formatDateTime } from '../../core/time/clock';
import type { UnitSystem } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { ratingPainWords } from '../../engine/recovery/painReport';
import { amountText } from '../../engine/workout/setText';
import styles from './Progress.module.css';

/** Joints that hurt in a workout: reported during it, and named when it was saved. */
/** Joints that hurt during the workout; the one picked at the end is already in the Rating row. */
function painJointsOf(record: WorkoutRecord): string[] {
  const said = record.rating?.pain ? record.rating.joint : undefined;
  return (record.painJoints ?? [])
    .filter((joint) => joint !== said)
    .map((joint) => joint.replace('-', ' '));
}

interface HistoryDetailSheetProps {
  record: WorkoutRecord | null;
  units: UnitSystem;
  notesFor: (exerciseId: string) => string | null;
  onClose: () => void;
}

/** One saved workout in full: every set as logged, substitutions, rating, records, and notes. */
export function HistoryDetailSheet({ record, units, notesFor, onClose }: HistoryDetailSheetProps) {
  return (
    <Sheet
      open={record !== null}
      title={record ? (record.title ?? 'Workout') : ''}
      onClose={onClose}
    >
      {record ? (
        <>
          <FactList
            items={[
              { label: 'When', value: formatDateTime(record.completedAt ?? record.startedAt) },
              {
                label: 'Duration',
                value: `${Math.round((record.elapsedSeconds ?? 0) / 60)} min${record.plannedMinutes ? ` of ${record.plannedMinutes} planned` : ''}${record.endedEarly ? ', ended early' : ''}`,
              },
              {
                label: 'Rating',
                value: record.rating
                  ? `${record.rating.effort.replace('-', ' ')}, energy ${record.rating.energyAfter}/5${ratingPainWords(record.rating) ? `, ${ratingPainWords(record.rating)}` : ''}${record.rating.note ? `: ${record.rating.note}` : ''}`
                  : 'not rated',
              },
              {
                label: 'Records',
                value:
                  (record.prs ?? []).length > 0
                    ? (record.prs ?? []).map((pr) => pr.detail).join('; ')
                    : 'none',
              },
              {
                label: 'Skipped',
                value:
                  record.skippedExerciseIds.length > 0
                    ? record.skippedExerciseIds.map((id) => requireExercise(id).name).join(', ')
                    : 'nothing',
              },
              ...(painJointsOf(record).length > 0
                ? [{ label: 'Pain', value: painJointsOf(record).join(', ') }]
                : []),
            ]}
          />
          <ul className={styles.list}>
            {record.entries.map((entry, index) => {
              const exercise = requireExercise(entry.exerciseId);
              const notes = notesFor(entry.exerciseId);
              return (
                <li key={`${entry.exerciseId}-${index}`} className={styles.historyEntry}>
                  <span className={styles.rowName}>
                    {exercise.name}
                    {entry.replacedFrom ? (
                      <span className={styles.tag}>
                        for {requireExercise(entry.replacedFrom).name}
                      </span>
                    ) : null}
                    {entry.blockKind && entry.blockKind !== 'straight' ? (
                      <span className={styles.tag}>{entry.blockKind}</span>
                    ) : null}
                  </span>
                  <span className={styles.rowMeta}>
                    {entry.sets.length === 0
                      ? 'no sets logged'
                      : entry.sets
                          .map(
                            (set) =>
                              `${set.kind === 'warmup' ? 'warm-up ' : set.kind === 'drop' ? 'drop ' : ''}${set.weight ?? 'bw'} × ${amountText(set.reps, exercise.measure === 'seconds')}${set.rir !== null && exercise.measure !== 'seconds' ? ` @ RIR ${set.rir}` : ''}${set.completed ? '' : ' (not done)'}`,
                          )
                          .join(' · ')}
                    {units ? '' : ''}
                  </span>
                  {notes ? <span className={styles.note}>Note: {notes}</span> : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </Sheet>
  );
}
