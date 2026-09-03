import type { ReactNode } from 'react';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { UnitSystem } from '../../core/validation/profile';
import type { CompletedSet } from '../../engine/recalibration/types';
import type { SetPosition } from '../../engine/workout/sequence';
import type { WorkoutBlock } from '../../engine/workout/types';
import { formatLogged } from '../../features/workout/setFormat';
import styles from './SupersetGroup.module.css';

export interface SupersetGroupProps {
  block: WorkoutBlock;
  units: UnitSystem;
  position: SetPosition | null;
  logged: readonly CompletedSet[];
  /** The member cards (one per exercise), the active one carrying the logger. */
  children: ReactNode;
  onEditRound: (entryId: string, setIndex: number) => void;
}

/**
 * The combined execution card for a superset or circuit: both moves together,
 * the round counter, a round table with every logged value from every member
 * (tap any to correct it in place), and the member cards below it. Completing
 * the final round completes the block; no member is ever left dangling.
 */
export function SupersetGroup({
  block,
  units,
  position,
  logged,
  children,
  onEditRound,
}: SupersetGroupProps) {
  const members = block.entries;
  const rounds = Math.max(
    ...members.map((entry) => entry.sets.filter((set) => set.kind === 'working').length),
  );
  const currentRound = position && position.blockId === block.id ? position.round : rounds;
  const roundRows = Array.from({ length: rounds }, (_, index) => index);
  const prefixFor = (index: number) =>
    block.kind === 'superset' ? `A${index + 1}` : `${index + 1}`;

  return (
    <section
      className={styles.group}
      aria-label={block.label}
      data-testid="superset-group"
      data-kind={block.kind}
    >
      <header className={styles.head}>
        <span className={styles.kind}>{block.kind === 'superset' ? 'Superset' : 'Circuit'}</span>
        <h3 className={styles.title}>
          {members.map((entry, index) => (
            <span key={entry.id} className={styles.memberName}>
              <span className={styles.prefix}>{prefixFor(index)}</span>
              {requireExercise(entry.exerciseId).name}
            </span>
          ))}
        </h3>
        <p className={styles.round} data-testid="round-counter">
          Round {Math.min(rounds, Math.max(1, currentRound))} of {rounds} ·{' '}
          {block.restBetweenRoundsSeconds} s rest after each round · switch straight away between
          moves
        </p>
      </header>

      <table className={styles.table} aria-label="Rounds">
        <thead>
          <tr>
            <th scope="col">Round</th>
            {members.map((entry, index) => (
              <th key={entry.id} scope="col">
                {prefixFor(index)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roundRows.map((round) => (
            <tr
              key={round}
              data-state={round + 1 === currentRound && position ? 'current' : 'idle'}
            >
              <th scope="row">{round + 1}</th>
              {members.map((entry) => {
                const set = entry.sets.filter((candidate) => candidate.kind === 'working')[round];
                const done = set
                  ? logged.find((c) => c.entryId === entry.id && c.setIndex === set.index)
                  : undefined;
                const isNow =
                  position !== null &&
                  set !== undefined &&
                  position.entryId === entry.id &&
                  position.setIndex === set.index;
                return (
                  <td key={entry.id}>
                    {done && set ? (
                      <button
                        type="button"
                        className={styles.cell}
                        onClick={() => onEditRound(entry.id, set.index)}
                        aria-label={`Edit round ${round + 1} of ${requireExercise(entry.exerciseId).name}: ${formatLogged(done, units)}`}
                        data-testid="round-value"
                      >
                        ✓ {formatLogged(done, units)}
                      </button>
                    ) : set ? (
                      <span className={isNow ? styles.now : styles.pending}>
                        {isNow ? 'now' : `${set.targetReps[0]}-${set.targetReps[1]}`}
                      </span>
                    ) : (
                      <span className={styles.pending}>—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.members}>{children}</div>
    </section>
  );
}
