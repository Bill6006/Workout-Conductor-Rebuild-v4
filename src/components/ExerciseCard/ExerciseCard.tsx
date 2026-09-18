import { useState, type ReactNode } from 'react';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { RestStyle, UnitSystem } from '../../core/validation/profile';
import type { CompletedSet } from '../../engine/recalibration/types';
import type { SetPosition } from '../../engine/workout/sequence';
import { workingSets, type WorkoutBlock, type WorkoutEntry } from '../../engine/workout/types';
import type { PreviousPerformance } from '../../features/workout/previousPerformance';
import { useCustomMedia } from '../../features/library/useCustomMedia';
import { effortGuidance, restGuidance } from '../../features/workout/effort';
import { evidenceLines } from '../../features/workout/evidence';
import { tempoCue } from '../../features/workout/tempo';
import { ExerciseThumb } from '../ExerciseDetail/ExerciseMedia';
import { TempoBar } from '../TempoBar/TempoBar';
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
  /** The one-time max offer on a lift with no history; absent once a set is logged or it was declined. */
  onKnowMax?: () => void;
  /** The profile's rest style; the rest-style research line shows only when it is not Standard. */
  restStyle?: RestStyle;
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
  onKnowMax,
  restStyle,
}: ExerciseCardProps) {
  const [tempoOpen, setTempoOpen] = useState(false);
  const exercise = requireExercise(entry.exerciseId);
  const customMedia = useCustomMedia(exercise.id);
  const working = workingSets(entry).filter((set) => set.kind === 'working');
  const doneWorking = logged.filter((set) => set.kind === 'working' && !set.skipped).length;
  const target = position?.set ?? working[0] ?? entry.sets[0];
  const rest = block.kind === 'straight' ? entry.restSeconds : block.restBetweenRoundsSeconds;
  const tempo = tempoCue(entry.role, target?.kind ?? 'working', exercise, {
    capped: Boolean(entry.progression?.capped),
  });
  const effort = effortGuidance(
    target?.kind ?? 'working',
    target?.targetRir ?? entry.sets.find((set) => set.kind === 'working')?.targetRir ?? 2,
    entry.role,
  );
  const restNote = restGuidance(entry.role, rest);
  const research = evidenceLines([...tempo.evidence, ...effort.evidence, ...restNote.evidence], {
    restStyle,
  });

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
          {/* Last time and the role live behind How to; this line stays only for the max offer. */}
          {onKnowMax ? (
            <p className={styles.meta}>
              {previous
                ? `Last time ${previous.weight === null ? 'bodyweight' : `${previous.weight} ${units}`} × ${previous.reps}`
                : 'First time logged'}
              {' · '}
              <button
                type="button"
                className={styles.maxLink}
                onClick={onKnowMax}
                data-testid="know-max"
              >
                Know your max?
              </button>
            </p>
          ) : null}
          <button
            type="button"
            className={styles.tempoBarButton}
            onClick={() => setTempoOpen((open) => !open)}
            aria-expanded={tempoOpen}
            aria-label={`Tempo ${tempo.tempo}: ${tempoOpen ? 'hide' : 'show'} the reason and cue`}
          >
            <TempoBar phases={tempo.phases} totalSeconds={tempo.totalSeconds} />
          </button>
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
            <ExerciseThumb exercise={exercise} size="large" customMedia={customMedia} />
            <span className={styles.thumbLabel}>How to</span>
          </button>
          <button
            type="button"
            className={styles.tempoChip}
            onClick={() => setTempoOpen((open) => !open)}
            aria-expanded={tempoOpen}
            data-testid="tempo-line"
          >
            <span className={styles.tempoChipLabel}>Tempo</span>
            <span className={styles.tempoChipValue}>
              {tempo.tempo} {tempoOpen ? '▴' : '▾'}
            </span>
          </button>
        </div>
      </header>
      {tempoOpen ? (
        <div className={styles.tempoDetail} data-testid="tempo-detail">
          <dl className={styles.detailRows}>
            <div className={styles.detailRow}>
              <dt>Tempo</dt>
              <dd>
                <strong>{tempo.tempo}</strong> · {tempo.why}
                {tempo.tempo.includes('X') ? '; X is as fast as you can' : ''}
              </dd>
            </div>
            {tempo.cue ? (
              <div className={styles.detailRow}>
                <dt>Cue</dt>
                <dd>{tempo.cue}</dd>
              </div>
            ) : null}
            <div className={styles.detailRow} data-testid="effort-line">
              <dt>Effort</dt>
              <dd>
                <strong>{effort.label}</strong> · {effort.why}
              </dd>
            </div>
            <div className={styles.detailRow} data-testid="rest-line">
              <dt>Rest</dt>
              <dd>
                <strong>{restNote.label.replace(/^Rest /, '')}</strong> · {restNote.why}
              </dd>
            </div>
          </dl>
          <details className={styles.why} data-testid="tempo-why">
            <summary className={styles.whySummary}>Why: the research</summary>
            <ul className={styles.tempoEvidence} aria-label="Why this tempo, effort, and rest">
              {research.map((line) => (
                <li key={line.text}>
                  <strong>{line.lead}.</strong> {line.text}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
      {children}
      {panels}
    </section>
  );
}
