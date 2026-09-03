import { routeHref } from '../../app/navigation';
import { exerciseEquipmentLabel, requireExercise } from '../../catalog/exercises/catalog';
import { muscleName } from '../../catalog/muscles/muscles';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { DurationSelector } from '../../components/DurationSelector/DurationSelector';
import { ExerciseThumb } from '../../components/ExerciseDetail/ExerciseMedia';
import type { LocationProfile } from '../../core/validation/location';
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
  location: LocationProfile | undefined;
  onSelect: (entry: WorkoutEntry, block: WorkoutBlock) => void;
  onDurationChange: (choice: DurationChoice) => void;
}

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
  onSelect,
}: {
  entry: WorkoutEntry;
  block: WorkoutBlock;
  prefix?: string;
  location: LocationProfile | undefined;
  onSelect: (entry: WorkoutEntry, block: WorkoutBlock) => void;
}) {
  const exercise = requireExercise(entry.exerciseId);
  return (
    <button
      type="button"
      className={styles.exercise}
      onClick={() => onSelect(entry, block)}
      data-testid="workout-entry"
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
  location,
  onSelect,
  onDurationChange,
}: WorkoutPreviewCardProps) {
  const { duration } = workout;
  const fitted = duration.choice !== 'default';
  const estimateLabel =
    duration.overByMinutes > 1
      ? `about ${duration.estimatedMinutes} min, ${Math.round(duration.overByMinutes)} over`
      : `about ${duration.estimatedMinutes} min`;

  return (
    <Card tone="accent" eyebrow="Today's workout" title={workout.title}>
      <p className={styles.demoNote}>{workout.explanation.summary}</p>

      <div className={styles.metaRow}>
        <DurationSelector
          choice={duration.choice}
          defaultMinutes={duration.defaultMinutes}
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
        Change the length above and the session rebuilds at once. Tap an exercise for its
        demonstration and alternatives. Logging arrives with the active workout in Phase 5.
      </p>
    </Card>
  );
}
