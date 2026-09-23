import { useState } from 'react';
import type { CompletedSet } from '../../engine/recalibration/types';
import { holdById, targetText } from '../../engine/workout/setText';
import type { SetPrescription, WorkoutEntry } from '../../engine/workout/types';
import styles from './ActiveWorkout.module.css';
import { describeSet, describeSetRange, formatLogged } from './setFormat';

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
function describeUpcoming(sets: readonly SetPrescription[], hold: boolean): string {
  const working = sets.filter((set) => set.kind === 'working');
  const ramps = sets.filter((set) => set.kind === 'warmup').length;
  const drops = sets.filter((set) => set.kind === 'drop').length;
  const parts: string[] = [`${sets.length} more ${sets.length === 1 ? 'set' : 'sets'}`];
  const first = working[0];
  if (first) {
    parts.push(
      hold
        ? targetText(first.targetReps, true)
        : `${targetText(first.targetReps, false)} @ RIR ${first.targetRir}`,
    );
  }
  if (ramps > 0) parts.push(`${ramps} warm-up`);
  if (drops > 0) parts.push('1 drop');
  return parts.join(' · ');
}

interface UpcomingGroup {
  first: SetPrescription;
  last: SetPrescription;
  count: number;
}

/** Sets still to come, with a run of identical ones folded into one row. */
function groupUpcoming(sets: readonly SetPrescription[]): UpcomingGroup[] {
  const groups: UpcomingGroup[] = [];
  for (const set of sets) {
    const open = groups[groups.length - 1];
    const same =
      open !== undefined &&
      open.last.kind === set.kind &&
      set.kind !== 'drop' &&
      open.last.targetReps[0] === set.targetReps[0] &&
      open.last.targetReps[1] === set.targetReps[1] &&
      open.last.targetRir === set.targetRir &&
      open.last.targetWeight === set.targetWeight &&
      open.last.restSeconds === set.restSeconds;
    if (open && same) {
      open.last = set;
      open.count += 1;
    } else {
      groups.push({ first: set, last: set, count: 1 });
    }
  }
  return groups;
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
 * inline editor; everything still to come is one collapsed line. Opened, the
 * list stays short too: a run of identical sets is one row ("Sets 2-4"), and
 * Show fewer folds the ramps back as well. The set in front of you is not
 * repeated here, because the logger below states it.
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
          <span className={styles.setName}>{describeSet(set, entry)}</span>
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
            ▸ {describeUpcoming(upcoming, holdById(entry.exerciseId))}
          </button>
          {nextTarget ? (
            <span className={styles.setAside} data-testid="set-aside">
              {nextTarget.targetWeight !== null ? `${nextTarget.targetWeight} ${units}` : 'show'}
            </span>
          ) : null}
        </li>
      ) : null}
      {expanded
        ? groupUpcoming(upcoming).map(({ first: set, last, count }) => (
            <li
              key={set.index}
              className={styles.setRow}
              data-state="upcoming"
              data-count={count}
              data-testid="set-row"
            >
              <span className={styles.setName}>{describeSetRange(set, last, entry)}</span>
              <span className={styles.setTarget}>
                {targetText(set.targetReps, holdById(entry.exerciseId))}
                {holdById(entry.exerciseId)
                  ? ''
                  : set.kind === 'working'
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
      {(expanded && upcoming.length > 0) || (rampsOpen && finishedRamps.length > 1) ? (
        <li className={styles.setRow} data-state="summary">
          <button
            type="button"
            className={styles.setsToggle}
            onClick={() => {
              setExpanded(false);
              setRampsOpen(false);
            }}
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
