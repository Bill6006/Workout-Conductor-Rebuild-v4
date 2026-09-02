import { routeHref } from '../../app/navigation';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import type { LocationProfile } from '../../core/validation/location';
import type { DemoWorkout } from './demo/demoWorkout';
import styles from './TodayScreen.module.css';

interface DemoWorkoutCardProps {
  workout: DemoWorkout;
  location: LocationProfile | undefined;
}

function restLabel(seconds: number): string {
  return seconds >= 60 ? `${Math.round(seconds / 60)} min rest` : `${seconds} s rest`;
}

export function DemoWorkoutCard({ workout, location }: DemoWorkoutCardProps) {
  return (
    <Card tone="accent" eyebrow="Today's workout · synthetic demo" title={workout.title}>
      <p className={styles.demoNote}>
        Demo preview built from your profile and equipment. The real generation engine and the 15 /
        30 / 45 / Default dropdown arrive in Phase 3.
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
        {workout.exercises.map((exercise, index) => (
          <li key={exercise.name} className={styles.exercise}>
            <span className={styles.exerciseIndex}>{index + 1}</span>
            <span className={styles.exerciseBody}>
              <span className={styles.exerciseName}>
                {exercise.name}
                {exercise.superset ? (
                  <span className={styles.badge}>{exercise.superset}</span>
                ) : null}
                {exercise.dropSet ? <span className={styles.badge}>Drop set</span> : null}
              </span>
              <span className={styles.exerciseMeta}>
                {exercise.sets} × {exercise.reps} · {restLabel(exercise.restSeconds)} ·{' '}
                {exercise.equipment}
              </span>
            </span>
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
        Logging arrives with the active workout in Phase 5.
      </p>
    </Card>
  );
}
