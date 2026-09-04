import { useState } from 'react';
import type { CompletedSet } from '../../engine/recalibration/types';
import type { SetPrescription, WorkoutEntry } from '../../engine/workout/types';
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

type RowState = 'done' | 'skipped' | 'current' | 'upcoming';

function restLabel(seconds: number): string {
  if (seconds <= 0) return 'no rest';
  return seconds >= 60 ? `${Math.round((seconds / 60) * 10) / 10} min rest` : `${seconds} s rest`;
}

/** What the remaining sets have in common, for the collapsed row. */
function describeUpcoming(sets: readonly SetPrescription[]): string {
  const working = sets.filter((set) => set.kind === 'working');
  const ramps = sets.filter((set) => set.kind === 'warmup').length;
  const drops = sets.filter((set) => set.kind === 'drop').length;
  const parts: string[] = [`${sets.length} more ${sets.length === 1 ? 'set' : 'sets'}`];
  const first = working[0];
  if (first) {
    parts.push(`${first.targetReps[0]}-${first.targetReps[1]} reps @ RIR ${first.targetRir}`);
  }
  if (ramps > 0) parts.push(`${ramps} warm-up`);
  if (drops > 0) parts.push('1 drop');
  return parts.join(' · ');
}

function aside(set: SetPrescription, units: string, current: boolean): string {
  if (set.targetWeight !== null) {
    return current
      ? `${set.targetWeight} ${units}`
      : `${set.targetWeight} ${units} · ${restLabel(set.restSeconds)}`;
  }
  return current ? 'log below' : restLabel(set.restSeconds);
}

/**
 * Every set of one exercise as a row: done rows show their logged values and
 * open the inline editor on tap; the current row is marked and carries its
 * target load; sets still to come collapse into one line that expands on tap,
 * so the card stays short while nothing useful is hidden.
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
  const [expanded, setExpanded] = useState(false);
  const rows = entry.sets.map((set) => {
    const done = logged.find((candidate) => candidate.setIndex === set.index);
    const state: RowState = done
      ? done.skipped
        ? 'skipped'
        : 'done'
      : currentSetIndex === set.index
        ? 'current'
        : 'upcoming';
    return { set, done, state };
  });
  const upcoming = rows.filter((row) => row.state === 'upcoming').map((row) => row.set);
  const collapsed = !expanded && upcoming.length > 0;
  const visible = collapsed ? rows.filter((row) => row.state !== 'upcoming') : rows;
  const nextTarget = upcoming[0];

  return (
    <ol className={`${styles.sets} ${compact ? styles.setsCompact : ''}`} aria-label="Sets">
      {visible.map(({ set, done, state }) => {
        const current = state === 'current';
        const canUndo =
          undoable !== null && undoable.entryId === entry.id && undoable.setIndex === set.index;
        return (
          <li key={set.index} className={styles.setRow} data-state={state} data-testid="set-row">
            <span className={styles.setName}>
              {describeSet(set, entry)}
              {set.kind === 'warmup' ? <span className={styles.setTag}>warm-up</span> : null}
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
              <>
                <span className={styles.setTarget}>
                  {current ? 'now · ' : ''}
                  {set.targetReps[0]}-{set.targetReps[1]} reps
                  {set.kind === 'working'
                    ? ` @ RIR ${set.targetRir}`
                    : set.kind === 'warmup'
                      ? ` · easy, RIR ${set.targetRir}`
                      : ' · last clean rep'}
                </span>
                <span className={styles.setAside} data-testid="set-aside">
                  {aside(set, units, current)}
                </span>
              </>
            )}
            {canUndo ? (
              <button type="button" className={styles.undo} onClick={onUndo} data-testid="undo-set">
                Undo
              </button>
            ) : null}
          </li>
        );
      })}
      {collapsed ? (
        <li className={styles.setRow} data-state="summary" data-testid="set-row">
          <button
            type="button"
            className={styles.setsToggle}
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            data-testid="sets-summary"
          >
            ▸ {describeUpcoming(upcoming)}
          </button>
          {nextTarget ? (
            <span className={styles.setAside}>
              {nextTarget.targetWeight !== null ? `${nextTarget.targetWeight} ${units}` : 'show'}
            </span>
          ) : null}
        </li>
      ) : null}
      {expanded && upcoming.length > 0 ? (
        <li className={styles.setRow} data-state="summary">
          <button
            type="button"
            className={styles.setsToggle}
            onClick={() => setExpanded(false)}
            aria-expanded={true}
            data-testid="sets-collapse"
          >
            ▾ Show fewer
          </button>
        </li>
      ) : null}
    </ol>
  );
}
