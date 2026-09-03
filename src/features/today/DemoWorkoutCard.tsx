import { routeHref } from '../../app/navigation';
import { exerciseEquipmentLabel } from '../../catalog/exercises/catalog';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { ExerciseThumb } from '../../components/ExerciseDetail/ExerciseMedia';
import type { LocationProfile } from '../../core/validation/location';
import type { DemoExercise, DemoWorkout } from './demo/demoWorkout';
import styles from './TodayScreen.module.css';

interface DemoWorkoutCardProps {
  workout: DemoWorkout;
  location: LocationProfile | undefined;
  onSelect: (entry: DemoExercise) => void;
}

function restLabel(seconds: number): string {
  return seconds >= 60 ? `${Math.round(seconds / 60)} min rest` : `${seconds} s rest`;
}

export function DemoWorkoutCard({ workout, location, onSelect }: DemoWorkoutCardProps) {
  const available = new Set(location?.equipment ?? []);

  return (
    <Card tone="accent" eyebrow="Today's workout · synthetic demo" title={workout.title}>
      <p className={styles.demoNote}>
        Demo preview from the exercise catalog, filtered by your places and limits. The real
        generation engine and the 15 / 30 / 45 / Default dropdown arrive in Phase 3.
      </p>

      <div className={styles.metaRow}>
        <div className={styles.meta}>
          <span className={styles.metaLabel}>Workout length</span>
          <span className={styles.metaValue}>Default: {workout.estimatedMinutes} min</span>
        </div>
        <a className={styles.meta} href={routeHref('plan')}>
          <span className={styles.metaLabel}>Location</span>
          <span className={styles.metaValue}>{location?.name ?? 'Not set'} ›</span>
        </a>
      </div>

      <div className={styles.focus} aria-label="Muscle focus">
        {workout.focus.map((muscle) => (
          <span key={muscle} className={styles.focusChip}>
            {muscle}
          </span>
        ))}
      </div>

      <ol className={styles.exercises} aria-label="Exercises">
        {workout.exercises.map((entry, index) => (
          <li key={entry.exercise.id}>
            <button
              type="button"
              className={styles.exercise}
              onClick={() => onSelect(entry)}
              data-testid="demo-exercise"
            >
              <span className={styles.exerciseIndex}>{index + 1}</span>
              <ExerciseThumb exercise={entry.exercise} />
              <span className={styles.exerciseBody}>
                <span className={styles.exerciseName}>
                  {entry.exercise.name}
                  {entry.superset ? <span className={styles.badge}>{entry.superset}</span> : null}
                  {entry.dropSet ? <span className={styles.badge}>Drop set</span> : null}
                </span>
                <span className={styles.exerciseMeta}>
                  {entry.sets} × {entry.reps} · {restLabel(entry.restSeconds)} ·{' '}
                  {exerciseEquipmentLabel(entry.exercise, available)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <details className={styles.why}>
        <summary className={styles.whySummary}>Why this workout</summary>
        <ul className={styles.whyList}>
          {workout.why.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
          {workout.compromises.map((compromise) => (
            <li key={compromise} className={styles.compromise}>
              {compromise}
            </li>
          ))}
        </ul>
      </details>

      <Button variant="primary" disabled aria-describedby="start-workout-hint">
        Start Workout
      </Button>
      <p id="start-workout-hint" className={styles.hint}>
        Tap an exercise for its demonstration, instructions, and ranked alternatives. Logging
        arrives with the active workout in Phase 5.
      </p>
    </Card>
  );
}
