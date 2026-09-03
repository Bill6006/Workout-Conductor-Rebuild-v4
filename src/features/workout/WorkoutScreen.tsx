import { routeHref } from '../../app/navigation';
import { Card } from '../../components/Card/Card';
import { PlaceholderCard, ScreenHeader } from '../../components/Screen/Screen';
import { durationLabel } from '../../engine/duration/duration';
import { useTodayWorkout } from '../today/useTodayWorkout';
import styles from './WorkoutScreen.module.css';

export function WorkoutScreen() {
  const today = useTodayWorkout();

  return (
    <>
      <ScreenHeader
        title="Workout"
        intro="The active session: one unmistakable current set, fast logging, and calm recalibration."
      />
      {today ? (
        <Card eyebrow="Active workout list · preview" title={today.workout.title}>
          <p className={styles.meta}>
            {durationLabel(today.workout.duration.choice, today.defaultEstimatedMinutes)} · about{' '}
            {today.workout.duration.estimatedMinutes} min · {today.location?.name ?? 'no place set'}
          </p>
          <ol className={styles.list} aria-label="Active workout list">
            {today.workout.blocks.map((block) => (
              <li key={block.id} className={styles.row} data-kind={block.kind}>
                <span className={styles.rowLabel}>{block.label}</span>
                <span className={styles.rowMeta}>
                  {block.kind === 'straight' ? `${block.rounds} sets` : `${block.rounds} rounds`}
                </span>
              </li>
            ))}
          </ol>
          <p className={styles.meta}>
            Change the length or tap an exercise on <a href={routeHref('today')}>Today</a>. Logging
            starts in Phase 5.
          </p>
        </Card>
      ) : null}
      <PlaceholderCard
        title="Active workout"
        arrivesIn="Phases 4 and 5"
        items={[
          'Calibration overlay and change summary when anything meaningful changes',
          'One-handed set logging for weight, reps, and RIR',
          'Rest timer that survives screen changes',
          'Tap-to-replace alternatives that change only one exercise',
          'Workout completion and session rating',
        ]}
      />
    </>
  );
}
