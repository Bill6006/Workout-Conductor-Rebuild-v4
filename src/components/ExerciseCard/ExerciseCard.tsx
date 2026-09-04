import { useState, type ReactNode } from 'react';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { UnitSystem } from '../../core/validation/profile';
import type { CompletedSet } from '../../engine/recalibration/types';
import type { SetPosition } from '../../engine/workout/sequence';
import { workingSets, type WorkoutBlock, type WorkoutEntry } from '../../engine/workout/types';
import type { PreviousPerformance } from '../../features/workout/previousPerformance';
import { tempoCue } from '../../features/workout/tempo';
import { ExerciseThumb } from '../ExerciseDetail/ExerciseMedia';
import styles from './ExerciseCard.module.css';

export interface ExerciseCardProps {
  entry: WorkoutEntry;
  block: WorkoutBlock;
  units: UnitSystem;
  position: SetPosition | null;
  logged: readonly CompletedSet[];
  previous: PreviousPerformance | null;
  availableEquipment: ReadonlySet<string>;
  /** Set rows, inline editor, and the logger, supplied by the screen. */
  children: ReactNode;
  /** Panels (How to, Notes, Plates, Options). */
  panels?: ReactNode;
  /** A1 / A2 prefix inside a superset card. */
  prefix?: string;
  active?: boolean;
  /** Compact personal-record feedback from the logged sets, for example "Weight PR". */
  badge?: string | null;
  /** Opens the exercise's demonstration and details; the thumbnail is the tap target. */
  onShowDetail?: () => void;
}

function roleLabel(entry: WorkoutEntry): string {
  switch (entry.role) {
    case 'primary-strength':
      return 'Main lift';
    case 'secondary-strength':
      return 'Strength';
    case 'primary-hypertrophy':
    case 'secondary-hypertrophy':
      return 'Hypertrophy';
    case 'isolation':
      return 'Isolation';
    case 'finisher':
      return 'Finisher';
    default:
      return entry.role.replace(/-/g, ' ');
  }
}

/**
 * The current exercise: name, role, the set target for right now, last time's
 * numbers, and on the right the demonstration with a tempo chip that reveals
 * the reason and a form cue on tap. Then the set rows and logger from the
 * screen. Rest and target read in one line so the current set is unmistakable.
 */
export function ExerciseCard({
  entry,
  block,
  units,
  position,
  logged,
  previous,
  children,
  panels,
  prefix,
  active = true,
  badge = null,
  onShowDetail,
}: ExerciseCardProps) {
  const [tempoOpen, setTempoOpen] = useState(false);
  const exercise = requireExercise(entry.exerciseId);
  const working = workingSets(entry).filter((set) => set.kind === 'working');
  const doneWorking = logged.filter((set) => set.kind === 'working' && !set.skipped).length;
  const target = position?.set ?? working[0] ?? entry.sets[0];
  const rest = block.kind === 'straight' ? entry.restSeconds : block.restBetweenRoundsSeconds;
  const tempo = tempoCue(entry.role, target?.kind ?? 'working', exercise);

  return (
    <section
      className={`${styles.card} ${active ? styles.active : ''}`}
      aria-label={`${exercise.name}, ${doneWorking} of ${working.length} sets done`}
      data-testid="exercise-card"
      data-entry-id={entry.id}
      data-active={active ? 'true' : 'false'}
    >
      <header className={styles.head}>
        <div className={styles.headMain}>
          <div className={styles.titleRow}>
            {prefix ? <span className={styles.prefix}>{prefix}</span> : null}
            <h3 className={styles.name}>{exercise.name}</h3>
            <span className={styles.badge}>{roleLabel(entry)}</span>
            {badge ? (
              <span className={`${styles.badge} ${styles.pr}`} data-testid="pr-badge">
                {badge}
              </span>
            ) : null}
            {entry.pinned ? (
              <span className={`${styles.badge} ${styles.quiet}`}>Pinned</span>
            ) : null}
            {entry.replacedFrom ? (
              <span className={`${styles.badge} ${styles.quiet}`}>Swapped in</span>
            ) : null}
          </div>
          <p className={styles.targetLine} data-testid="target-line">
            {target
              ? `${position && position.kind === 'warmup' ? 'Ramp set' : position && position.kind === 'drop' ? 'Drop set' : `Set ${Math.min(working.length, doneWorking + 1)} of ${working.length}`}${target.targetWeight !== null ? ` · ${target.targetWeight} ${units}` : ''} · ${target.targetReps[0]}-${target.targetReps[1]} reps${target.kind === 'working' ? ` @ RIR ${target.targetRir}` : ''}`
              : `${working.length} sets done`}
            {' · '}
            {rest >= 60 ? `${Math.round((rest / 60) * 10) / 10} min rest` : `${rest} s rest`}
          </p>
          <p className={styles.meta}>
            {previous
              ? `Last time ${previous.weight === null ? 'bodyweight' : `${previous.weight} ${units}`} × ${previous.reps}`
              : 'First time logged'}
          </p>
        </div>
        <div className={styles.headAside}>
          <button
            type="button"
            className={styles.thumbButton}
            onClick={onShowDetail}
            disabled={!onShowDetail}
            aria-label={`How to do ${exercise.name}: demonstration and details`}
            data-testid="card-thumb"
          >
            <ExerciseThumb exercise={exercise} size="large" />
            <span className={styles.thumbLabel}>How to</span>
          </button>
          <button
            type="button"
            className={styles.tempoChip}
            onClick={() => setTempoOpen((open) => !open)}
            aria-expanded={tempoOpen}
            data-testid="tempo-line"
          >
            Tempo {tempo.tempo} {tempoOpen ? '▴' : '▾'}
          </button>
        </div>
      </header>
      {tempoOpen ? (
        <p className={styles.tempoDetail} data-testid="tempo-detail">
          <strong>{tempo.tempo}</strong> · {tempo.why}
          {tempo.cue ? (
            <>
              <br />
              Cue: {tempo.cue}
            </>
          ) : null}
        </p>
      ) : null}
      {children}
      {panels}
    </section>
  );
}
