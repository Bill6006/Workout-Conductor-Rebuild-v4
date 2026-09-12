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

type RowState = 'done' | 'skipped' | 'upcoming';

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

/** "2 skipped" or "45 lb × 5, 95 lb × 3" for the ramps already behind you. */
function describeRamps(done: readonly CompletedSet[], units: 'lb' | 'kg'): string {
  const label = `${done.length} ramp${done.length === 1 ? '' : 's'}`;
  if (done.every((set) => set.skipped)) return `${label} · skipped`;
  const values = done.slice(0, 3).map((set) => formatLogged(set, units));
  return `${label} · ${values.join(', ')}${done.length > 3 ? ' …' : ''}`;
}

/**
 * The sets of one exercise, kept short. Ramps you have finished fold into one
 * line that opens on tap; each finished working set is one line that opens the
 * inline editor; everything still to come is one collapsed line. The set in
 * front of you is not repeated here, because the logger below states it.
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
  const [rampsOpen, setRampsOpen] = useState(false);
  const rows = entry.sets.map((set) => {
    const done = logged.find((candidate) => candidate.setIndex === set.index);
    const state: RowState = done ? (done.skipped ? 'skipped' : 'done') : 'upcoming';
    return { set, done, state };
  });
  const upcoming = rows.filter((row) => row.state === 'upcoming').map((row) => row.set);
  const settled = rows.filter((row) => row.state !== 'upcoming');
  const finishedRamps = settled.filter((row) => row.set.kind === 'warmup');
  const foldRamps = !rampsOpen && finishedRamps.length > 1;
  const visible = foldRamps ? settled.filter((row) => row.set.kind !== 'warmup') : settled;
  const collapsed = !expanded && upcoming.length > 0;
  const nextTarget = upcoming.find((set) => set.index === currentSetIndex) ?? upcoming[0];
  const undoneHere = (index: number) =>
    undoable !== null && undoable.entryId === entry.id && undoable.setIndex === index;
  const rampUndo = finishedRamps.some((row) => undoneHere(row.set.index));

  return (
    <ol className={`${styles.sets} ${compact ? styles.setsCompact : ''}`} aria-label="Sets">
      {foldRamps ? (
        <li className={styles.setRow} data-state="summary" data-testid="set-row">
          <button
            type="button"
            className={styles.setsToggle}
            onClick={() => setRampsOpen(true)}
            aria-expanded={false}
            data-testid="ramps-summary"
          >
            ▸{' '}
            {describeRamps(
              finishedRamps.map((row) => row.done as CompletedSet),
              units,
            )}
          </button>
          {rampUndo ? (
            <button type="button" className={styles.undo} onClick={onUndo} data-testid="undo-set">
              Undo
            </button>
          ) : null}
        </li>
      ) : null}
      {visible.map(({ set, done, state }) => (
        <li key={set.index} className={styles.setRow} data-state={state} data-testid="set-row">
          <span className={styles.setName}>
            {describeSet(set, entry)}
            {set.kind === 'warmup' ? <span className={styles.setTag}>warm-up</span> : null}
            {set.kind === 'drop' ? <span className={styles.setTag}>drop</span> : null}
          </span>
          <button
            type="button"
            className={styles.setValue}
            onClick={() => onEdit(set.index)}
            aria-label={`Edit ${describeSet(set, entry)}: ${formatLogged(done as CompletedSet, units)}`}
            data-testid="logged-value"
          >
            <span className={styles.check} aria-hidden="true">
              ✓
            </span>
            {formatLogged(done as CompletedSet, units)}
          </button>
          {undoneHere(set.index) ? (
            <button type="button" className={styles.undo} onClick={onUndo} data-testid="undo-set">
              Undo
            </button>
          ) : null}
        </li>
      ))}
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
            <span className={styles.setAside} data-testid="set-aside">
              {nextTarget.targetWeight !== null ? `${nextTarget.targetWeight} ${units}` : 'show'}
            </span>
          ) : null}
        </li>
      ) : null}
      {expanded
        ? upcoming.map((set) => (
            <li
              key={set.index}
              className={styles.setRow}
              data-state="upcoming"
              data-testid="set-row"
            >
              <span className={styles.setName}>
                {describeSet(set, entry)}
                {set.kind === 'warmup' ? <span className={styles.setTag}>warm-up</span> : null}
                {set.kind === 'drop' ? <span className={styles.setTag}>drop</span> : null}
              </span>
              <span className={styles.setTarget}>
                {set.targetReps[0]}-{set.targetReps[1]} reps
                {set.kind === 'working'
                  ? ` @ RIR ${set.targetRir}`
                  : set.kind === 'warmup'
                    ? ` · easy, RIR ${set.targetRir}`
                    : ' · last clean rep'}
              </span>
              <span className={styles.setAside} data-testid="set-aside">
                {set.targetWeight !== null
                  ? `${set.targetWeight} ${units} · ${restLabel(set.restSeconds)}`
                  : restLabel(set.restSeconds)}
              </span>
            </li>
          ))
        : null}
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
