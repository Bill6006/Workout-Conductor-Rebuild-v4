import type { CompletedSet } from '../../engine/recalibration/types';
import type { WorkoutEntry } from '../../engine/workout/types';
import styles from './ActiveWorkout.module.css';
import { describeSet, formatLogged } from './setFormat';

interface LoggedSetsProps {
  entry: WorkoutEntry;
  logged: readonly CompletedSet[];
  units: 'lb' | 'kg';
  currentSetIndex: number | null;
  /** The most recently logged set of the whole workout, which can be undone in one tap. */
  undoable: { entryId: string; setIndex: number } | null;
  onEdit: (setIndex: number) => void;
  onUndo: () => void;
  compact?: boolean;
}

/**
 * Every set of one exercise as a row: done rows show their logged values and
 * open the inline editor on tap; the current row is marked; upcoming rows show
 * their targets. Completion never leaves the list, so it is always obvious
 * what is done.
 */
export function LoggedSets({
  entry,
  logged,
  units,
  currentSetIndex,
  undoable,
  onEdit,
  onUndo,
  compact = false,
}: LoggedSetsProps) {
  return (
    <ol className={`${styles.sets} ${compact ? styles.setsCompact : ''}`} aria-label="Sets">
      {entry.sets.map((set) => {
        const done = logged.find((candidate) => candidate.setIndex === set.index);
        const current = currentSetIndex === set.index;
        const canUndo =
          undoable !== null && undoable.entryId === entry.id && undoable.setIndex === set.index;
        return (
          <li
            key={set.index}
            className={styles.setRow}
            data-state={
              done ? (done.skipped ? 'skipped' : 'done') : current ? 'current' : 'upcoming'
            }
            data-testid="set-row"
          >
            <span className={styles.setName}>
              {describeSet(set, entry)}
              {set.kind === 'warmup' ? <span className={styles.setTag}>ramp</span> : null}
              {set.kind === 'drop' ? <span className={styles.setTag}>drop</span> : null}
            </span>
            {done ? (
              <button
                type="button"
                className={styles.setValue}
                onClick={() => onEdit(set.index)}
                aria-label={`Edit ${describeSet(set, entry)}: ${formatLogged(done, units)}`}
                data-testid="logged-value"
              >
                <span className={styles.check} aria-hidden="true">
                  ✓
                </span>
                {formatLogged(done, units)}
              </button>
            ) : (
              <span className={styles.setTarget}>
                {current ? 'now · ' : ''}
                {set.targetReps[0]}-{set.targetReps[1]} reps
                {set.kind === 'working' ? ` @ RIR ${set.targetRir}` : ''}
              </span>
            )}
            {canUndo ? (
              <button type="button" className={styles.undo} onClick={onUndo} data-testid="undo-set">
                Undo
              </button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
