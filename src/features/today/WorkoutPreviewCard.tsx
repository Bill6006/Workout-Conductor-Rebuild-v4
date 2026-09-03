import { routeHref } from '../../app/navigation';
import { exerciseEquipmentLabel, requireExercise } from '../../catalog/exercises/catalog';
import { muscleName } from '../../catalog/muscles/muscles';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { DurationSelector } from '../../components/DurationSelector/DurationSelector';
import { ExerciseThumb } from '../../components/ExerciseDetail/ExerciseMedia';
import type { LocationProfile } from '../../core/validation/location';
import type { ChangeSummary, EntryChange } from '../../engine/recalibration/types';
import {
  workingSets,
  type DurationChoice,
  type GeneratedWorkout,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../../engine/workout/types';
import styles from './TodayScreen.module.css';

interface WorkoutPreviewCardProps {
  workout: GeneratedWorkout;
  /** Complete Default session length, shown in the dropdown's Default option. */
  defaultEstimatedMinutes: number;
  location: LocationProfile | undefined;
  onSelect: (entry: WorkoutEntry, block: WorkoutBlock) => void;
  onDurationChange: (choice: DurationChoice) => void;
  /** The last recalibration's compact summary, until dismissed. */
  summary?: ChangeSummary | null;
  changes?: readonly EntryChange[];
  canUndo?: boolean;
  onUndo?: () => void;
  onDismissSummary?: () => void;
  /** Exact-end mode state; the control shows when the plan runs over or the mode is on. */
  endBy?: { on: boolean; label: string | null };
  onEndByChange?: (on: boolean) => void;
}

const CHANGE_TAGS: Record<EntryChange['kind'], string> = {
  added: 'New',
  replaced: 'Swapped',
  adjusted: 'Adjusted',
  removed: 'Removed',
};

function restLabel(seconds: number): string {
  if (seconds === 0) return 'no rest';
  return seconds >= 60 ? `${Math.round((seconds / 60) * 10) / 10} min rest` : `${seconds} s rest`;
}

function setsLabel(entry: WorkoutEntry): string {
  const working = workingSets(entry).filter((set) => set.kind === 'working');
  const first = working[0];
  const reps = first ? `${first.targetReps[0]}-${first.targetReps[1]}` : '';
  const rir = first ? ` @ RIR ${first.targetRir}` : '';
  const warm = entry.warmupSets > 0 ? ` · ${entry.warmupSets} ramp` : '';
  return `${working.length} × ${reps}${rir}${warm}`;
}

function EntryRow({
  entry,
  block,
  prefix,
  location,
  change,
  onSelect,
}: {
  entry: WorkoutEntry;
  block: WorkoutBlock;
  prefix?: string;
  location: LocationProfile | undefined;
  change?: EntryChange['kind'];
  onSelect: (entry: WorkoutEntry, block: WorkoutBlock) => void;
}) {
  const exercise = requireExercise(entry.exerciseId);
  return (
    <button
      type="button"
      className={styles.exercise}
      onClick={() => onSelect(entry, block)}
      data-testid="workout-entry"
      data-entry-id={entry.id}
      data-exercise-id={entry.exerciseId}
      data-changed={change}
    >
      {prefix ? <span className={styles.exerciseIndex}>{prefix}</span> : null}
      <ExerciseThumb exercise={exercise} />
      <span className={styles.exerciseBody}>
        <span className={styles.exerciseName}>
          {exercise.name}
          {entry.dropSet ? <span className={styles.badge}>Drop set</span> : null}
          {entry.role === 'primary-strength' ? (
            <span className={styles.badge}>Main lift</span>
          ) : null}
          {change ? <span className={styles.tag}>{CHANGE_TAGS[change]}</span> : null}
          {entry.pinned ? (
            <span className={`${styles.tag} ${styles.tagQuiet}`}>Pinned</span>
          ) : entry.locked ? (
            <span className={`${styles.tag} ${styles.tagQuiet}`}>Your pick</span>
          ) : null}
        </span>
        <span className={styles.exerciseMeta}>
          {setsLabel(entry)} ·{' '}
          {restLabel(
            block.kind === 'straight' ? entry.restSeconds : block.restBetweenRoundsSeconds,
          )}{' '}
          · {exerciseEquipmentLabel(exercise, new Set(location?.equipment ?? []))}
        </span>
      </span>
    </button>
  );
}

export function WorkoutPreviewCard({
  workout,
  defaultEstimatedMinutes,
  location,
  onSelect,
  onDurationChange,
  summary = null,
  changes = [],
  canUndo = false,
  onUndo,
  onDismissSummary,
  endBy,
  onEndByChange,
}: WorkoutPreviewCardProps) {
  const { duration } = workout;
  const fitted = duration.choice !== 'default' || (endBy?.on ?? false);
  const estimateLabel =
    duration.overByMinutes > 1
      ? `about ${duration.estimatedMinutes} min, ${Math.round(duration.overByMinutes)} over`
      : `about ${duration.estimatedMinutes} min`;
  const changeOf = (entry: WorkoutEntry) =>
    changes.find((change) => change.entryId === entry.id)?.kind;

  return (
    <Card tone="accent" eyebrow="Today's workout" title={workout.title}>
      <p className={styles.demoNote}>{workout.explanation.summary}</p>

      <div className={styles.metaRow}>
        <DurationSelector
          choice={duration.choice}
          defaultMinutes={defaultEstimatedMinutes}
          onChange={onDurationChange}
        />
        <a className={styles.meta} href={routeHref('plan')}>
          <span className={styles.metaLabel}>Location</span>
          <span className={styles.metaValue}>{location?.name ?? 'Not set'} ›</span>
        </a>
      </div>

      <p className={styles.estimate} data-testid="workout-estimate">
        {fitted ? `Fitted to ${duration.targetMinutes} min: ` : 'Default time: '}
        {estimateLabel}
        {duration.overByMinutes > 1 ? '. It may run a few minutes over.' : '.'}
      </p>

      {endBy && (duration.overByMinutes > 1 || endBy.on) ? (
        <label className={styles.endBy}>
          <input
            type="checkbox"
            checked={endBy.on}
            onChange={(event) => onEndByChange?.(event.target.checked)}
            data-testid="end-by-toggle"
          />
          <span>
            End by exact time
            {endBy.on && endBy.label
              ? ` · ends by ${endBy.label}`
              : ` · fit strictly to ${duration.targetMinutes} min, even if a set of the main lift has to go`}
          </span>
        </label>
      ) : null}

      {summary ? (
        <div className={styles.summary} role="status" data-testid="recalibration-summary">
          <div className={styles.summaryBody}>
            <span className={styles.summaryHeadline}>{summary.headline}</span>
            {summary.details.length > 0 ? (
              <details className={styles.summaryDetails}>
                <summary>What changed</summary>
                <ul>
                  {summary.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          <div className={styles.summaryActions}>
            {canUndo ? (
              <button type="button" className={styles.summaryButton} onClick={onUndo}>
                Undo
              </button>
            ) : null}
            <button
              type="button"
              className={styles.summaryButton}
              onClick={onDismissSummary}
              aria-label="Dismiss summary"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.focus} aria-label="Muscle priorities">
        {workout.musclePriorities.slice(0, 4).map((priority) => (
          <span key={priority.muscle} className={styles.focusChip} title={priority.reason}>
            {muscleName(priority.muscle)}
          </span>
        ))}
      </div>

      <p className={styles.warmup}>{workout.warmup.note}</p>

      <ol className={styles.exercises} aria-label="Session list">
        {workout.blocks.map((block, index) => (
          <li
            key={block.id}
            className={styles.blockRow}
            data-testid="workout-block"
            data-kind={block.kind}
          >
            {block.kind === 'straight' ? (
              <EntryRow
                entry={block.entries[0]!}
                block={block}
                prefix={String(index + 1)}
                location={location}
                change={changeOf(block.entries[0]!)}
                onSelect={onSelect}
              />
            ) : (
              <div className={styles.group}>
                <span className={styles.groupLabel}>
                  {index + 1}. {block.label}
                  {block.kind === 'circuit'
                    ? ''
                    : ` · ${block.rounds} rounds · ${restLabel(block.restBetweenRoundsSeconds)}`}
                </span>
                {block.entries.map((entry, entryIndex) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    block={block}
                    prefix={
                      block.kind === 'superset' ? `A${entryIndex + 1}` : String(entryIndex + 1)
                    }
                    location={location}
                    change={changeOf(entry)}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      <details className={styles.why}>
        <summary className={styles.whySummary}>Why this workout</summary>
        <ul className={styles.whyList}>
          {workout.explanation.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
          {workout.explanation.fittingSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
          {workout.compromises.map((compromise) => (
            <li key={compromise} className={styles.compromise}>
              {compromise}
            </li>
          ))}
          <li>
            Time: {workout.explanation.time.warmupMinutes} min warm-up,{' '}
            {workout.explanation.time.workMinutes} min work, {workout.explanation.time.restMinutes}{' '}
            min rest, {workout.explanation.time.transitionMinutes} min setup. Confidence{' '}
            {workout.confidence}.
          </li>
        </ul>
      </details>

      <Button variant="primary" disabled aria-describedby="start-workout-hint">
        Start Workout
      </Button>
      <p id="start-workout-hint" className={styles.hint}>
        Change the length above and the session recalibrates at once. Tap an exercise for its
        demonstration, alternatives, and session-only changes: swap, pin, busy station, skip, hurts.
        Logging arrives with the active workout in Phase 5.
      </p>
    </Card>
  );
}
